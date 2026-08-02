/**
 * Offline checks for the operable cross-round probe.
 *
 * No database, provider, credentials, or server are used. Database rows and
 * the existing auditor are injected so the loader boundaries, route evidence,
 * report lineage, and explicit file write can be tested deterministically.
 */
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CROSS_ROUND_AUDITOR_BATCH_SIZE,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  DEEPSEEK_V4_FLASH_CANONICAL,
  contentHash,
  type PublicClueLedger,
} from "../shared/substrate";
import type { CrossRoundInversionRun } from "../server/crossRoundInversion";
import {
  CROSS_ROUND_PROBE_REPORT_VERSION,
  CROSS_ROUND_PROBE_RUNNER_VERSION,
  CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS,
  collectProbeRunnerLineage,
  loadDurableTeamHistory,
  parseProbeCliArgs,
  runCrossRoundProbe,
  writeProbeReport,
  type CrossRoundAuditor,
  type DurableTeamHistory,
  type ProbeQueryClient,
  type ProbeRunnerLineage,
} from "./run-cross-round-probe";

let assertions = 0;

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}

async function rejects(
  operation: () => Promise<unknown>,
  pattern: RegExp,
  message: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const normalized =
      error instanceof Error ? error.message : String(error);
    ok(pattern.test(normalized), `${message}: received "${normalized}"`);
    return;
  }
  assert.fail(`${message}: expected rejection`);
}

function testRunner(outputPath: string): ProbeRunnerLineage {
  const sources = CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS.map((path) => ({
    path,
    sha256: contentHash({ fixture: "executing-source", path }),
  }));
  return {
    runnerVersion: CROSS_ROUND_PROBE_RUNNER_VERSION,
    runnerSourceHash: sources.find(
      (source) => source.path === "scripts/run-cross-round-probe.ts",
    )!.sha256,
    executingCode: {
      algorithm: "sha256-labeled-source-set@0.1",
      complete: true,
      sources,
      sourceSetHash: contentHash(sources),
    },
    git: {
      commitSha: "a".repeat(40),
      relevantWorkingTreeDirty: true,
      relevantStatusHash: "b".repeat(64),
    },
    outputPath,
  };
}

function fakeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 77,
    game_id: "GAME77",
    completed_at: new Date("2026-08-01T20:00:00.000Z"),
    total_rounds: 3,
    quality_status: "clean",
    strict_execution: true,
    strategy_lineage: {
      lineageVersion: "0.1",
      promptOverridesHash: "strategy-hash",
    },
    ...overrides,
  };
}

function testArgumentParsing(): void {
  const parsed = parseProbeCliArgs([
    "--match-id",
    "77",
    "--team",
    "amber",
    "--clues",
    '["blast","orange","ascent"]',
    "--code",
    "1,3,4",
    "--output",
    "./probe.json",
  ]);
  deepEqual(
    parsed.selector,
    { kind: "match_id", matchId: 77 },
    "CLI requires an explicit match selector",
  );
  equal(parsed.team, "amber", "CLI requires an explicit team");
  deepEqual(
    parsed.candidate,
    {
      clues: ["blast", "orange", "ascent"],
      intendedCode: [1, 3, 4],
    },
    "CLI parses only the caller-supplied post-hoc candidate",
  );
  ok(
    parsed.outputPath.endsWith("/probe.json"),
    "CLI resolves the explicit output path",
  );

  assert.throws(
    () =>
      parseProbeCliArgs([
        "--match-id",
        "77",
        "--game-id",
        "GAME77",
        "--team",
        "amber",
        "--clues",
        '["a","b","c"]',
        "--code",
        "1,2,3",
        "--output",
        "./probe.json",
      ]),
    /exactly one/,
  );
  assertions += 1;
  assert.throws(
    () =>
      parseProbeCliArgs([
        "--game-id",
        "GAME77",
        "--team",
        "amber",
        "--clues",
        '["a","b","c"]',
        "--code",
        "1,2,3",
      ]),
    /--output is required/,
  );
  assertions += 1;
}

async function testExecutingCodeLineage(): Promise<void> {
  const lineage = await collectProbeRunnerLineage(
    process.cwd(),
    "/explicit/offline-probe.json",
  );
  equal(
    lineage.executingCode.complete,
    true,
    "current executing-code identity is complete without network access",
  );
  deepEqual(
    lineage.executingCode.sources.map((source) => source.path),
    [...CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS],
    "lineage labels the actual auditor, evaluator, router, registry, and lock sources",
  );
  equal(
    lineage.executingCode.sourceSetHash,
    contentHash(lineage.executingCode.sources),
    "current source-set identity verifies",
  );
  equal(
    lineage.runnerSourceHash,
    lineage.executingCode.sources.find(
      (source) => source.path === "scripts/run-cross-round-probe.ts",
    )?.sha256,
    "CLI source identity is part of the executing source set",
  );
  const changedSources = lineage.executingCode.sources.map((source, index) =>
    index === 0 ? { ...source, sha256: "f".repeat(64) } : source,
  );
  ok(
    contentHash(changedSources) !== lineage.executingCode.sourceSetHash,
    "changing one labeled executing source changes the code identity",
  );
}

async function testDurableTeamLoader(): Promise<DurableTeamHistory> {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const queryClient: ProbeQueryClient = {
    async query<Row extends Record<string, unknown>>(
      text: string,
      values: readonly unknown[],
    ): Promise<{ rows: Row[] }> {
      calls.push({ text, values });
      if (calls.length === 1) {
        return { rows: [fakeMatch()] as unknown as Row[] };
      }
      return {
        rows: [
          {
            round_id: 101,
            round_number: 1,
            team: "amber",
            code: [1, 3, 4],
            clues: ["Aggregate", "Bengal", "Firetruck"],
            own_guess: [1, 3, 4],
            opponent_guess: [2, 3, 4],
          },
          {
            round_id: 102,
            round_number: 2,
            team: "amber",
            code: [2, 1, 3],
            clues: ["harbor", "summit", "orbit"],
            own_guess: [2, 1, 3],
            opponent_guess: [2, 4, 3],
          },
          {
            // A custom/malformed adapter cannot accidentally pool blue.
            round_id: 201,
            round_number: 1,
            team: "blue",
            code: [2, 1, 3],
            clues: ["pillow", "crown", "telescope"],
            own_guess: [2, 1, 3],
            opponent_guess: [4, 1, 3],
          },
          {
            // A persisted-but-unresolved row cannot enter the public ledger.
            round_id: 103,
            round_number: 3,
            team: "amber",
            code: [1, 2, 4],
            clues: ["live", "secret", "round"],
            own_guess: null,
            opponent_guess: null,
          },
          {
            // A row beyond completed match.total_rounds is excluded.
            round_id: 104,
            round_number: 4,
            team: "amber",
            code: [1, 2, 4],
            clues: ["future", "invalid", "round"],
            own_guess: [1, 2, 4],
            opponent_guess: [1, 2, 4],
          },
        ] as unknown as Row[],
      };
    },
  };

  const source = await loadDurableTeamHistory(
    queryClient,
    { kind: "match_id", matchId: 77 },
    "amber",
  );
  equal(calls.length, 2, "loader performs match and resolved-round reads only");
  ok(
    /completed_at IS NOT NULL/.test(calls[0]!.text),
    "match lookup structurally excludes live matches",
  );
  ok(
    /mr\.team = \$2/.test(calls[1]!.text),
    "round lookup structurally scopes one explicit team",
  );
  ok(
    /mr\.own_guess IS NOT NULL/.test(calls[1]!.text) &&
      /mr\.opponent_guess IS NOT NULL/.test(calls[1]!.text),
    "round lookup structurally requires resolution evidence",
  );
  deepEqual(
    calls[1]!.values,
    [77, "amber"],
    "round query binds the resolved match and requested team",
  );
  deepEqual(
    source.rounds.map((round) => round.roundId),
    [101, 102],
    "mixed-team, unresolved, and future rows never enter history",
  );
  equal(
    source.match.completedAt,
    "2026-08-01T20:00:00.000Z",
    "durable completion time is normalized",
  );
  return source;
}

async function testLoaderFailureBoundaries(): Promise<void> {
  const ambiguous: ProbeQueryClient = {
    async query<Row extends Record<string, unknown>>(): Promise<{
      rows: Row[];
    }> {
      return {
        rows: [
          fakeMatch({ id: 77 }),
          fakeMatch({ id: 88 }),
        ] as unknown as Row[],
      };
    },
  };
  await rejects(
    () =>
      loadDurableTeamHistory(
        ambiguous,
        { kind: "game_id", gameId: "GAME77" },
        "amber",
      ),
    /ambiguous.*use --match-id/i,
    "a non-unique game id cannot create ambiguous lineage",
  );

  const liveOnly: ProbeQueryClient = {
    async query<Row extends Record<string, unknown>>(): Promise<{
      rows: Row[];
    }> {
      return { rows: [] as Row[] };
    },
  };
  await rejects(
    () =>
      loadDurableTeamHistory(
        liveOnly,
        { kind: "match_id", matchId: 99 },
        "blue",
      ),
    /No completed durable/,
    "live or missing matches are rejected",
  );

  let malformedQueryCount = 0;
  const malformedResolvedGuess: ProbeQueryClient = {
    async query<Row extends Record<string, unknown>>(): Promise<{
      rows: Row[];
    }> {
      malformedQueryCount += 1;
      if (malformedQueryCount === 1) {
        return { rows: [fakeMatch()] as unknown as Row[] };
      }
      return {
        rows: [
          {
            round_id: 301,
            round_number: 1,
            team: "amber",
            code: [1, 3, 4],
            clues: ["Aggregate", "Bengal", "Firetruck"],
            own_guess: {},
            opponent_guess: [2, 3, 4],
          },
        ] as unknown as Row[],
      };
    },
  };
  await rejects(
    () =>
      loadDurableTeamHistory(
        malformedResolvedGuess,
        { kind: "match_id", matchId: 77 },
        "amber",
      ),
    /own guess.*three distinct/i,
    "non-null malformed guess JSON is not resolution evidence",
  );
}

function exactAuditRun(
  ledger: PublicClueLedger,
  clues: [string, string, string],
): CrossRoundInversionRun {
  equal(
    ledger.reduce((sum, column) => sum + column.clues.length, 0),
    6,
    "auditor receives only the two resolved amber rounds",
  );
  deepEqual(
    clues,
    ["blast", "orange", "ascent"],
    "auditor receives the post-hoc candidate triple",
  );
  return {
    protocolVersion: CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
    policyId: CROSS_ROUND_COLUMN_VETO_POLICY_ID,
    policyHash: CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
    auditorPromptHash: CROSS_ROUND_AUDITOR_PROMPT_HASH,
    auditorBatchSize: CROSS_ROUND_AUDITOR_BATCH_SIZE,
    status: "probe",
    auditedAt: "2026-08-01T21:00:00.000Z",
    ledgerClueCount: 6,
    modelRequested: {
      provider: "openrouter",
      model: DEEPSEEK_V4_FLASH_CANONICAL.model,
      upstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream!,
      reasoningEffort: "xhigh",
      wireReasoningEffort: "max",
    },
    providerMetadata: {
      servedModel: DEEPSEEK_V4_FLASH_CANONICAL.model,
      upstreamProvider: "DeepInfra",
      requestedUpstream: "deepinfra",
      wireReasoningEffort: "max",
      physicalAttempt: 1,
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        reasoningTokens: 40,
        costUsd: 0.000018,
      },
    },
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      estimatedCostUsd: "0.000018000",
      effectiveCostUsd: 0.000018,
      costSource: "registry_estimate",
      latencyMs: 1234,
    },
    reply: {
      audits: clues.map((clue, index) => ({
        clueIndex: index + 1,
        clue,
        historyMatches: [1, 2, 3, 4].map((slot) => ({
          number: slot,
          sharedReferent: slot === [1, 3, 4][index] ? "shared parent" : null,
          publicClue:
            slot === [1, 3, 4][index]
              ? (ledger.find((c) => c.number === slot)?.clues[0] ?? null)
              : null,
          strength:
            slot === [1, 3, 4][index] && (ledger.find((c) => c.number === slot)?.clues.length ?? 0) > 0
              ? ("strong" as const)
              : ("none" as const),
        })),
      })),
      codeHypotheses: [
        {
          code: [1, 3, 4] as [number, number, number],
          support: "strong" as const,
          rationale: null,
        },
      ],
    },
  };
}

async function testReportAndExplicitWrite(
  source: DurableTeamHistory,
): Promise<void> {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "herpetarium-cross-round-probe-"),
  );
  try {
    const outputPath = join(temporaryDirectory, "probe.json");
    const auditor: CrossRoundAuditor = async (ledger, clues) =>
      exactAuditRun(ledger, clues);
    const report = await runCrossRoundProbe({
      source,
      candidate: {
        clues: ["blast", "orange", "ascent"],
        intendedCode: [1, 3, 4],
      },
      runner: testRunner(outputPath),
      auditor,
      now: () => new Date("2026-08-01T22:00:00.000Z"),
    });

    equal(
      report.reportVersion,
      CROSS_ROUND_PROBE_REPORT_VERSION,
      "report schema is versioned",
    );
    equal(
      report.mode,
      "offline_post_hoc_read_only",
      "report cannot imply tournament treatment",
    );
    equal(
      report.treatmentMutation,
      "none",
      "probe records that it made no treatment mutation",
    );
    deepEqual(
      report.source.resolvedRoundIds,
      [101, 102],
      "report identifies every durable source round",
    );
    equal(report.source.team, "amber", "report identifies the source team");
    equal(
      report.source.matchTotalRounds,
      3,
      "report records the completed match boundary",
    );
    equal(report.source.ledgerDepth.resolvedRounds, 2, "ledger round depth");
    equal(report.source.ledgerDepth.totalClues, 6, "ledger clue depth");
    equal(
      report.route.requested.wireReasoningEffort,
      "max",
      "report proves full xhigh was sent as wire max",
    );
    equal(
      report.route.resolved.upstreamProvider,
      "DeepInfra",
      "report proves the served upstream",
    );
    equal(
      report.audit.evaluation.outcome,
      "hard_veto",
      "known three-column recovery is evaluated through shared policy",
    );
    ok(
      report.lineage.sourceStrategyLineageHash,
      "stored match strategy lineage is content-addressed",
    );

    const {
      reportContentHash,
      ...lineageWithoutReportContentHash
    } = report.lineage;
    equal(
      reportContentHash,
      contentHash({
        ...report,
        lineage: lineageWithoutReportContentHash,
      }),
      "report content hash binds the complete report payload",
    );

    await writeProbeReport(outputPath, report);
    const persisted = JSON.parse(await readFile(outputPath, "utf8")) as {
      lineage: { reportContentHash: string };
    };
    equal(
      persisted.lineage.reportContentHash,
      report.lineage.reportContentHash,
      "explicit output preserves report lineage",
    );
    equal(
      (await stat(outputPath)).mode & 0o777,
      0o600,
      "probe report is private even when process umask is permissive",
    );
    await rejects(
      () => writeProbeReport(outputPath, report),
      /EEXIST|exist/i,
      "report is not overwritten without explicit authority",
    );
    await writeProbeReport(outputPath, report, true);
    equal(
      (
        JSON.parse(await readFile(outputPath, "utf8")) as {
          lineage: { reportContentHash: string };
        }
      ).lineage.reportContentHash,
      report.lineage.reportContentHash,
      "explicit overwrite atomically preserves the complete report",
    );

    await rejects(
      () =>
        writeProbeReport(
          join(temporaryDirectory, "different-destination.json"),
          report,
        ),
      /destination signed in report lineage/,
      "writer cannot detach a report from its signed output destination",
    );

    const symlinkTarget = join(temporaryDirectory, "symlink-target.json");
    const symlinkOutput = join(temporaryDirectory, "symlink-output.json");
    await writeFile(symlinkTarget, "do-not-clobber\n", "utf8");
    await symlink(symlinkTarget, symlinkOutput);
    const symlinkReport = await runCrossRoundProbe({
      source,
      candidate: {
        clues: ["blast", "orange", "ascent"],
        intendedCode: [1, 3, 4],
      },
      runner: testRunner(symlinkOutput),
      auditor,
      now: () => new Date("2026-08-01T22:00:00.000Z"),
    });
    await rejects(
      () => writeProbeReport(symlinkOutput, symlinkReport, true),
      /symbolic-link/,
      "explicit overwrite still refuses a symlink destination",
    );
    equal(
      await readFile(symlinkTarget, "utf8"),
      "do-not-clobber\n",
      "symlink refusal leaves its target untouched",
    );

    const tamperedReport = {
      ...report,
      generatedAt: "2099-01-01T00:00:00.000Z",
    };
    await rejects(
      () => writeProbeReport(outputPath, tamperedReport, true),
      /lineage hash/,
      "writer refuses a report modified after its content hash was minted",
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function testRouteProofFailsClosed(
  source: DurableTeamHistory,
): Promise<void> {
  const malformedRunner = testRunner("/explicit/probe.json");
  malformedRunner.executingCode.sources[0] = {
    ...malformedRunner.executingCode.sources[0]!,
    sha256: "f".repeat(64),
  };
  await rejects(
    () =>
      runCrossRoundProbe({
        source,
        candidate: {
          clues: ["blast", "orange", "ascent"],
          intendedCode: [1, 3, 4],
        },
        runner: malformedRunner,
        auditor: async (ledger, clues) => exactAuditRun(ledger, clues),
      }),
    /lineage hash does not verify/,
    "a dirty executing source cannot retain an old source-set identity",
  );

  const wrongProvider: CrossRoundAuditor = async (ledger, clues) => {
    const run = exactAuditRun(ledger, clues);
    return {
      ...run,
      providerMetadata: {
        ...run.providerMetadata,
        upstreamProvider: "OtherProvider",
      },
    };
  };
  await rejects(
    () =>
      runCrossRoundProbe({
        source,
        candidate: {
          clues: ["blast", "orange", "ascent"],
          intendedCode: [1, 3, 4],
        },
        runner: testRunner("/explicit/probe.json"),
        auditor: wrongProvider,
      }),
    /route proof/,
    "a non-DeepInfra response cannot become a report",
  );

  const wrongDepth: CrossRoundAuditor = async (ledger, clues) => ({
    ...exactAuditRun(ledger, clues),
    ledgerClueCount: 5,
  });
  await rejects(
    () =>
      runCrossRoundProbe({
        source,
        candidate: {
          clues: ["blast", "orange", "ascent"],
          intendedCode: [1, 3, 4],
        },
        runner: testRunner("/explicit/probe.json"),
        auditor: wrongDepth,
      }),
    /ledger depth/,
    "auditor/source ledger disagreement cannot become a report",
  );

  const wrongBinding: CrossRoundAuditor = async (ledger, clues) => {
    const run = exactAuditRun(ledger, clues);
    return {
      ...run,
      reply: {
        ...run.reply,
        audits: [
          { ...run.reply.audits[0]!, clue: "different-candidate-position" },
          run.reply.audits[1]!,
          run.reply.audits[2]!,
        ],
      },
    };
  };
  await rejects(
    () =>
      runCrossRoundProbe({
        source,
        candidate: {
          clues: ["blast", "orange", "ascent"],
          intendedCode: [1, 3, 4],
        },
        runner: testRunner("/explicit/probe.json"),
        auditor: wrongBinding,
      }),
    /bound to candidate positions/,
    "auditor assignments cannot drift from caller-owned candidate positions",
  );

  const missingUsage: CrossRoundAuditor = async (ledger, clues) => {
    const run = exactAuditRun(ledger, clues);
    return {
      ...run,
      providerMetadata: {
        ...run.providerMetadata,
        usage: {},
      },
    };
  };
  await rejects(
    () =>
      runCrossRoundProbe({
        source,
        candidate: {
          clues: ["blast", "orange", "ascent"],
          intendedCode: [1, 3, 4],
        },
        runner: testRunner("/explicit/probe.json"),
        auditor: missingUsage,
      }),
    /token\/reasoning telemetry/,
    "a report cannot claim full-strength execution without usage evidence",
  );

  const missingCost: CrossRoundAuditor = async (ledger, clues) => {
    const run = exactAuditRun(ledger, clues);
    return {
      ...run,
      usage: {
        ...run.usage,
        effectiveCostUsd: undefined,
        costSource: undefined,
      },
    };
  };
  await rejects(
    () =>
      runCrossRoundProbe({
        source,
        candidate: {
          clues: ["blast", "orange", "ascent"],
          intendedCode: [1, 3, 4],
        },
        runner: testRunner("/explicit/probe.json"),
        auditor: missingCost,
      }),
    /usage\/cost/,
    "successful reports require an explicit defensible cost",
  );

  const invalidEnvelope: CrossRoundAuditor = async (ledger, clues) =>
    ({
      ...exactAuditRun(ledger, clues),
      status: "completed",
      auditedAt: "not-a-timestamp",
    }) as unknown as CrossRoundInversionRun;
  await rejects(
    () =>
      runCrossRoundProbe({
        source,
        candidate: {
          clues: ["blast", "orange", "ascent"],
          intendedCode: [1, 3, 4],
        },
        runner: testRunner("/explicit/probe.json"),
        auditor: invalidEnvelope,
      }),
    /invalid probe status or timestamp/,
    "runtime status and audit timestamp are validated beyond TypeScript",
  );
}

async function main(): Promise<void> {
  testArgumentParsing();
  await testExecutingCodeLineage();
  const source = await testDurableTeamLoader();
  await testLoaderFailureBoundaries();
  await testReportAndExplicitWrite(source);
  await testRouteProofFailsClosed(source);
  console.log(`cross-round probe checks passed (${assertions} assertions)`);
}

void main();
