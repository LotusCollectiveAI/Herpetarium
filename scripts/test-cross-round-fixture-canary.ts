/**
 * Network-free checks for the real-provider fixture-canary envelope.
 *
 * The auditor is injected. These tests never read a credential, open a
 * database, or call OpenRouter; they exercise fixture binding, fail-closed
 * route/usage/outcome checks, report hashing, and atomic output semantics.
 */
import assert from "node:assert/strict";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
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
  publicLedgerClueCount,
  type CrossRoundAuditorReply,
  type PublicClueLedger,
} from "../shared/substrate";
import type { CrossRoundInversionRun } from "../server/crossRoundInversion";
import {
  CROSS_ROUND_FIXTURE_CANARY_RUNNER_VERSION,
  fixtureCanaryDefinitions,
  parseFixtureCanaryArgs,
  runCrossRoundFixtureCanary,
  writeFixtureCanaryReport,
  type CrossRoundFixtureCanaryReport,
  type FixtureCanaryAuditor,
  type FixtureCanaryCaseId,
} from "./run-cross-round-fixture-canary";

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
    ok(
      pattern.test(normalized),
      `${message}: received unexpected error "${normalized}"`,
    );
    return;
  }
  assert.fail(`${message}: expected rejection`);
}

function throws(
  operation: () => unknown,
  pattern: RegExp,
  message: string,
): void {
  try {
    operation();
  } catch (error) {
    const normalized =
      error instanceof Error ? error.message : String(error);
    ok(
      pattern.test(normalized),
      `${message}: received unexpected error "${normalized}"`,
    );
    return;
  }
  assert.fail(`${message}: expected throw`);
}

function caseIdFromClues(
  clues: readonly [string, string, string],
): FixtureCanaryCaseId {
  switch (clues[0]) {
    case "blast":
      return "red-production-incident-2026-08-01";
    case "treetop":
      return "blue-production-incident-2026-08-01";
    case "kettle":
      return "synthetic-opaque-negative-control";
    default:
      throw new Error(`unexpected test clue triple: ${clues.join("/")}`);
  }
}

/**
 * Scripted replies under the v0.3 contract: a per-clue-per-slot evidence grid
 * plus a support-tiered, array-order-independent credible set.
 *
 * THESE ARE ORACLE REPLIES AND THIS IS A PLUMBING TEST. `replyForCase` reads
 * the answer key: it plants the only strong bridge on the intended slot and
 * emits the intended code as its sole hypothesis, so it cannot fail. What it
 * exercises is the runner — argument parsing, routing, the report envelope,
 * lineage and the write path. NOTHING here is evidence about any model, and no
 * count of passing checks in this file says anything about detection.
 *
 * CORRECTED 2026-08-02. This comment previously claimed that a reply with no
 * usable historical evidence was "the only way a real auditor can now miss,
 * since a wrong top-ranked code no longer suffices to pass when the evidence is
 * there". THE LIVE RUN FALSIFIED THAT. On the Blue incident the dated model
 * missed WITH usable evidence present (`strongIntendedEdges` = 1, via
 * nebula/telescope), by two other routes at once: it reported `none` on the
 * intended history-bearing cell turret/slot 1, and it never placed the intended
 * code in its credible set — and `hardVeto` is gated on that membership, so a
 * wrong top-ranked code DOES still suffice to pass. See
 * `CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02`. A capability claim had been
 * smuggled into a plumbing test's docstring, which is the error this repo
 * already warns about in `crossRoundInversion.ts`.
 *
 * Slot 2 carries no public history in either incident ledger, so every row
 * reports `none` there; the evaluator rejects anything else outright.
 */
function replyForCase(
  caseId: FixtureCanaryCaseId,
  clues: readonly [string, string, string],
  ledger: PublicClueLedger,
  forceRedMiss = false,
  forceControlVeto = false,
): CrossRoundAuditorReply {
  const intended =
    caseId === "red-production-incident-2026-08-01"
      ? ([1, 3, 4] as const)
      : caseId === "blue-production-incident-2026-08-01"
        ? ([4, 1, 3] as const)
        : ([1, 3, 4] as const);
  const opaque = caseId === "synthetic-opaque-negative-control";
  const opaquePass = opaque && !forceControlVeto;
  return {
    audits: clues.map((clue, index) => ({
      clueIndex: index + 1,
      clue,
      historyMatches: [1, 2, 3, 4].map((slot) => {
        const column = ledger.find((candidate) => candidate.number === slot);
        // A bridge can only be claimed where the ledger actually holds a clue,
        // and it must quote that clue exactly.
        const evidential =
          !forceRedMiss &&
          !opaquePass &&
          slot === intended[index] &&
          (column?.clues.length ?? 0) > 0;
        return {
          number: slot,
          sharedReferent: evidential ? "shared parent" : null,
          publicClue: evidential ? column!.clues[0]! : null,
          strength: evidential ? ("strong" as const) : ("none" as const),
        };
      }),
    })),
    codeHypotheses: [
      {
        code: [...intended] as [number, number, number],
        support: opaquePass ? ("weak" as const) : ("strong" as const),
        rationale: null,
      },
    ],
  };
}

interface AuditorMutations {
  wrongRoute?: boolean;
  emptyReasoning?: boolean;
  redMiss?: boolean;
  wrongBinding?: boolean;
  controlVeto?: boolean;
}

function scriptedAuditor(mutations: AuditorMutations = {}): {
  auditor: FixtureCanaryAuditor;
  calls: Array<{
    caseId: FixtureCanaryCaseId;
    ledger: PublicClueLedger;
    clues: [string, string, string];
  }>;
} {
  const calls: Array<{
    caseId: FixtureCanaryCaseId;
    ledger: PublicClueLedger;
    clues: [string, string, string];
  }> = [];
  const auditor: FixtureCanaryAuditor = async (ledger, clues) => {
    const caseId = caseIdFromClues(clues);
    calls.push({ caseId, ledger, clues });
    const reply = replyForCase(
      caseId,
      clues,
      ledger,
      mutations.redMiss && caseId === "red-production-incident-2026-08-01",
      mutations.controlVeto &&
        caseId === "synthetic-opaque-negative-control",
    );
    if (
      mutations.wrongBinding &&
      caseId === "red-production-incident-2026-08-01"
    ) {
      reply.audits[0] = { ...reply.audits[0]!, clue: "not-the-caller-clue" };
    }
    const promptTokens = 100;
    const completionTokens = 60;
    const totalTokens = 160;
    const reasoningTokens = mutations.emptyReasoning ? 0 : 47;
    const costUsd = 0.000019;
    return {
      protocolVersion: CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
      policyId: CROSS_ROUND_COLUMN_VETO_POLICY_ID,
      policyHash: CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
      auditorPromptHash: CROSS_ROUND_AUDITOR_PROMPT_HASH,
      auditorBatchSize: CROSS_ROUND_AUDITOR_BATCH_SIZE,
      status: "probe",
      auditedAt: "2026-08-01T22:00:00.000Z",
      ledgerClueCount: publicLedgerClueCount(ledger),
      modelRequested: {
        provider: "openrouter",
        model: DEEPSEEK_V4_FLASH_CANONICAL.model,
        upstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream!,
        reasoningEffort: "xhigh",
        wireReasoningEffort: "max",
      },
      providerMetadata: {
        apiHost: "openrouter.ai",
        requestedModel: DEEPSEEK_V4_FLASH_CANONICAL.model,
        requestedUpstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream!,
        physicalAttempt: 1,
        requestedReasoningEffort: "xhigh",
        wireReasoningEffort: "max",
        reasoningDisabled: false,
        routing: {
          only: ["deepinfra"],
          allow_fallbacks: false,
          require_parameters: true,
          data_collection: "deny",
        },
        httpStatus: 200,
        requestId: "request-test",
        generationId: "generation-test",
        servedModel: DEEPSEEK_V4_FLASH_CANONICAL.model,
        upstreamProvider: mutations.wrongRoute ? "Other" : "DeepInfra",
        openrouterMetadata: {
          attempt: 1,
          strategy: "single",
          attempts: [
            {
              provider: "DeepInfra",
              model: DEEPSEEK_V4_FLASH_CANONICAL.model,
              status: 200,
            },
          ],
          endpoints: {
            available: [
              {
                provider: "DeepInfra",
                model: DEEPSEEK_V4_FLASH_CANONICAL.model,
                selected: true,
              },
            ],
          },
        },
        finishReason: "stop",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          reasoningTokens,
          costUsd,
        },
      },
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: "0.000019000",
        providerReportedCostUsd: costUsd,
        effectiveCostUsd: costUsd,
        costSource: "provider_reported",
        latencyMs: 12,
      },
      reply,
    } satisfies CrossRoundInversionRun;
  };
  return { auditor, calls };
}

const RUNNER = {
  runnerVersion: CROSS_ROUND_FIXTURE_CANARY_RUNNER_VERSION,
  runnerSourceHash: "a".repeat(64),
  gitCommitSha: "b".repeat(40),
} as const;

async function successfulReport(
  repeatCount = 1,
): Promise<{
  report: CrossRoundFixtureCanaryReport;
  calls: ReturnType<typeof scriptedAuditor>["calls"];
}> {
  const scripted = scriptedAuditor();
  const report = await runCrossRoundFixtureCanary({
    repeatCount,
    auditor: scripted.auditor,
    now: () => new Date("2026-08-01T23:00:00.000Z"),
    runner: RUNNER,
  });
  return { report, calls: scripted.calls };
}

function testArgumentParsing(): void {
  const defaultRepeat = parseFixtureCanaryArgs([
    "--output",
    "./canary.json",
  ]);
  equal(defaultRepeat.repeatCount, 1, "repeat defaults to one");
  ok(
    defaultRepeat.outputPath.endsWith("/canary.json"),
    "output is resolved explicitly",
  );
  const maximum = parseFixtureCanaryArgs([
    "--repeat",
    "3",
    "--output",
    "./canary-3.json",
  ]);
  equal(maximum.repeatCount, 3, "repeat accepts the bounded maximum");
  throws(
    () => parseFixtureCanaryArgs(["--repeat", "0", "--output", "./x"]),
    /integer from 1 to 3/,
    "repeat zero is rejected",
  );
  throws(
    () => parseFixtureCanaryArgs(["--repeat", "4", "--output", "./x"]),
    /integer from 1 to 3/,
    "repeat above three is rejected",
  );
  throws(
    () => parseFixtureCanaryArgs([]),
    /--output is required/,
    "implicit report output is rejected",
  );
  throws(
    () =>
      parseFixtureCanaryArgs([
        "--output",
        "./one",
        "--output",
        "./two",
      ]),
    /only once/,
    "duplicate output is rejected",
  );
}

async function testSuccessfulEnvelope(): Promise<CrossRoundFixtureCanaryReport> {
  const { report, calls } = await successfulReport(2);
  equal(calls.length, 6, "three cases run for every requested repeat");
  deepEqual(
    calls.map((call) => call.caseId),
    [
      "red-production-incident-2026-08-01",
      "blue-production-incident-2026-08-01",
      "synthetic-opaque-negative-control",
      "red-production-incident-2026-08-01",
      "blue-production-incident-2026-08-01",
      "synthetic-opaque-negative-control",
    ],
    "canary order is stable and complete",
  );
  deepEqual(
    report.summary.redOutcomes,
    ["hard_veto", "hard_veto"],
    "every exact Red fixture run hard-vetoes",
  );
  deepEqual(
    report.summary.blueOutcomes,
    ["hard_veto", "hard_veto"],
    "every exact Blue fixture run hard-vetoes",
  );
  deepEqual(
    report.summary.controlOutcomes,
    ["pass", "pass"],
    "the injected shaped control receives a typed outcome",
  );
  equal(
    report.cases[2]!.kind,
    "synthetic_non_research_negative_control",
    "control is visibly non-research",
  );
  ok(
    report.controlQualification.includes(
      "does not establish safety or non-leakage",
    ) &&
      report.controlQualification.includes("population error-rate estimate") &&
      report.controlQualification.includes("PASS is required") &&
      report.controlQualification.includes("always-veto"),
    "report states both the control's limited provenance and its required mechanism role",
  );
  equal(
    report.databaseAccess,
    "none",
    "fixture canary declares no database access",
  );
  equal(
    report.treatmentMutation,
    "none",
    "fixture canary declares no treatment mutation",
  );
  for (const run of report.runs) {
    equal(
      run.route.requested.reasoningEffort,
      "xhigh",
      `${run.caseId} preserves xhigh intent`,
    );
    equal(
      run.route.resolved.wireReasoningEffort,
      "max",
      `${run.caseId} proves wire max`,
    );
    equal(
      run.route.resolved.upstreamProvider,
      "DeepInfra",
      `${run.caseId} proves DeepInfra`,
    );
    ok(
      run.route.resolved.usage.reasoningTokens > 0 &&
        run.route.resolved.usage.costUsd > 0,
      `${run.caseId} retains positive reasoning and cost`,
    );
    deepEqual(
      run.audit.historyMatches.map((audit) => audit.clue),
      run.candidate.clues,
      `${run.caseId} evidence rows remain caller-position bound`,
    );
  }
  const { reportContentHash, ...lineageWithoutHash } = report.lineage;
  equal(
    reportContentHash,
    contentHash({ ...report, lineage: lineageWithoutHash }),
    "report content hash covers the complete unhashed envelope",
  );
  return report;
}

async function testFailureBoundaries(): Promise<void> {
  const wrongRoute = scriptedAuditor({ wrongRoute: true });
  await rejects(
    () =>
      runCrossRoundFixtureCanary({
        auditor: wrongRoute.auditor,
        runner: RUNNER,
      }),
    /served upstream/,
    "wrong upstream fails closed",
  );

  const emptyReasoning = scriptedAuditor({ emptyReasoning: true });
  await rejects(
    () =>
      runCrossRoundFixtureCanary({
        auditor: emptyReasoning.auditor,
        runner: RUNNER,
      }),
    /reasoning tokens.*positive/i,
    "zero reasoning telemetry fails closed",
  );

  // A Red miss must FAIL the release boundary while still producing the
  // report. Throwing here is what destroyed the evidence when the 0.1
  // instrument actually missed on 2026-08-01, so the assertion is now on the
  // computed boundary flag and on the recorded reply, not on an exception.
  const redMiss = scriptedAuditor({ redMiss: true });
  const redMissReport = await runCrossRoundFixtureCanary({
    auditor: redMiss.auditor,
    runner: RUNNER,
  });
  assert(
    redMissReport.summary.releaseBoundarySatisfied === false,
    "a Red miss fails the release boundary",
  );
  assert(
    redMissReport.summary.redOutcomes.every(
      (outcome) => outcome !== "hard_veto",
    ),
    "the failing Red outcome is recorded rather than thrown away",
  );
  assert(
    redMissReport.runs.some(
      (run) =>
        run.caseId === "red-production-incident-2026-08-01" &&
        run.audit.historyMatches.length === 3 &&
        run.audit.historyMatches.every(
          (audit) => audit.historyMatches.length === 4,
        ) &&
        run.audit.codeHypotheses.length >= 1,
    ),
    "the reply that produced the miss survives in the report for diagnosis",
  );
  assert(
    redMissReport.summary.blueOutcomes.every(
      (outcome) => outcome === "hard_veto",
    ),
    "a Red miss does not suppress the other cases",
  );

  const controlVeto = scriptedAuditor({ controlVeto: true });
  const controlVetoReport = await runCrossRoundFixtureCanary({
    auditor: controlVeto.auditor,
    runner: RUNNER,
  });
  assert(
    controlVetoReport.summary.releaseBoundarySatisfied === false,
    "an auditor that vetoes the post-incident shaped input cannot satisfy the release boundary",
  );
  assert(
    controlVetoReport.summary.redOutcomes.every(
      (outcome) => outcome === "hard_veto",
    ) &&
      controlVetoReport.summary.blueOutcomes.every(
        (outcome) => outcome === "hard_veto",
      ) &&
      controlVetoReport.summary.controlOutcomes.every(
        (outcome) => outcome === "hard_veto",
      ),
    "the two-sided boundary rejects a validly shaped always-veto result even when both incidents are caught",
  );

  const wrongBinding = scriptedAuditor({ wrongBinding: true });
  await rejects(
    () =>
      runCrossRoundFixtureCanary({
        auditor: wrongBinding.auditor,
        runner: RUNNER,
      }),
    /caller-owned clue positions/,
    "model-controlled assignment relabeling fails closed",
  );
}

async function testAtomicNoClobberWriter(
  report: CrossRoundFixtureCanaryReport,
): Promise<void> {
  const directory = await mkdtemp(
    join(
      await realpath(tmpdir()),
      "cross-round-fixture-canary-test-",
    ),
  );
  try {
    const output = join(directory, "report.json");
    await writeFixtureCanaryReport(output, report);
    const status = await lstat(output);
    equal(
      status.mode & 0o777,
      0o600,
      "published report permissions are exactly 0600",
    );
    ok(status.isFile(), "published report is a regular file");
    ok(!status.isSymbolicLink(), "published report is not a symlink");
    const original = await readFile(output, "utf8");
    const decoded = JSON.parse(original) as CrossRoundFixtureCanaryReport;
    equal(
      decoded.lineage.reportContentHash,
      report.lineage.reportContentHash,
      "published report retains its content hash",
    );
    ok(
      !original.includes("OPENROUTER_API_KEY") &&
        !original.includes("Authorization"),
      "report contains no credential field or authorization header",
    );
    await rejects(
      () => writeFixtureCanaryReport(output, report),
      /already exists.*no-clobber/,
      "existing report cannot be overwritten",
    );
    equal(
      await readFile(output, "utf8"),
      original,
      "no-clobber rejection leaves original bytes untouched",
    );

    const target = join(directory, "symlink-target.txt");
    const symlinkOutput = join(directory, "symlink-report.json");
    await writeFile(target, "sentinel", { mode: 0o600 });
    await symlink(target, symlinkOutput);
    await rejects(
      () => writeFixtureCanaryReport(symlinkOutput, report),
      /already exists.*no-clobber/,
      "an output symlink is rejected without being followed",
    );
    equal(
      await readFile(target, "utf8"),
      "sentinel",
      "symlink target remains untouched",
    );
    const names = await readdir(directory);
    ok(
      !names.some((name) => name.includes(".tmp-")),
      "atomic writer leaves no temporary inode name behind",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  testArgumentParsing();
  const report = await testSuccessfulEnvelope();
  await testFailureBoundaries();
  await testAtomicNoClobberWriter(report);
  const definitions = fixtureCanaryDefinitions();
  equal(definitions.length, 3, "exactly two incidents and one control exist");
  process.stdout.write(
    `cross-round fixture canary offline checks passed (${assertions} assertions)\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
