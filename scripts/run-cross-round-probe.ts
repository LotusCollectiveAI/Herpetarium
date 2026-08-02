/**
 * Read-only, post-hoc cross-round inversion probe over one durable match/team.
 *
 * This command intentionally does not participate in the headless game loop.
 * It reads only completed matches and fully resolved round rows, then evaluates
 * a caller-supplied candidate clue triple without writing to Herpetarium's
 * database or changing any tournament treatment.
 *
 * Example:
 *   npm run probe:cross-round -- \
 *     --match-id 123 \
 *     --team amber \
 *     --clues '["blast","orange","ascent"]' \
 *     --code 1,3,4 \
 *     --output /absolute/path/cross-round-probe.json
 *
 * Required environment: DATABASE_URL, OPENROUTER_API_KEY.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  link,
  lstat,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  auditCrossRoundColumns,
  ledgerFromTeamHistory,
  type CrossRoundInversionRun,
} from "../server/crossRoundInversion";
import {
  CROSS_ROUND_AUDITOR_BATCH_SIZE,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  DEEPSEEK_V4_FLASH_CANONICAL,
  contentHash,
  evaluateCrossRoundInversion,
  publicLedgerClueCount,
  sha256Hex,
  type CrossRoundInversionEvaluation,
  type PublicClueLedger,
} from "../shared/substrate";

export const CROSS_ROUND_PROBE_REPORT_VERSION =
  "herpetarium-cross-round-probe-report@0.1";
export const CROSS_ROUND_PROBE_RUNNER_VERSION =
  "herpetarium-cross-round-probe-runner@0.1";

export const CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS = [
  "scripts/run-cross-round-probe.ts",
  "server/crossRoundInversion.ts",
  "server/ai.ts",
  "shared/modelRegistry.ts",
  "shared/substrate/crossRoundInversion.ts",
  "shared/substrate/fixtures.ts",
  "shared/substrate/hash.ts",
  "shared/substrate/index.ts",
  "shared/substrate/inversion.ts",
  "shared/substrate/modelRef.ts",
  "shared/substrate/version.ts",
  "package.json",
  "package-lock.json",
] as const;

export type ProbeTeam = "amber" | "blue";

export type ProbeMatchSelector =
  | { kind: "match_id"; matchId: number }
  | { kind: "game_id"; gameId: string };

export interface ProbeQueryClient {
  query<Row extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
}

interface MatchRow extends Record<string, unknown> {
  id: number;
  game_id: string;
  completed_at: Date | string;
  total_rounds: number;
  quality_status: string;
  strict_execution: boolean;
  strategy_lineage: unknown;
}

interface RoundRow extends Record<string, unknown> {
  round_id: number;
  round_number: number;
  team: string;
  code: unknown;
  clues: unknown;
  own_guess: unknown;
  opponent_guess: unknown;
}

export interface DurableResolvedRound {
  roundId: number;
  roundNumber: number;
  team: ProbeTeam;
  clues: [string, string, string];
  code: [number, number, number];
}

export interface DurableTeamHistory {
  selector: ProbeMatchSelector;
  match: {
    id: number;
    gameId: string;
    completedAt: string;
    totalRounds: number;
    qualityStatus: string;
    strictExecution: boolean;
    strategyLineage: unknown;
  };
  team: ProbeTeam;
  rounds: DurableResolvedRound[];
}

export interface ProbeCandidate {
  clues: [string, string, string];
  intendedCode: [number, number, number];
}

export interface ProbeRunnerLineage {
  runnerVersion: typeof CROSS_ROUND_PROBE_RUNNER_VERSION;
  runnerSourceHash: string;
  executingCode: {
    algorithm: "sha256-labeled-source-set@0.1";
    complete: true;
    sources: Array<{ path: string; sha256: string }>;
    sourceSetHash: string;
  };
  git: {
    commitSha: string | null;
    relevantWorkingTreeDirty: boolean | null;
    relevantStatusHash: string | null;
  };
  outputPath: string;
}

export interface CrossRoundProbeReport {
  reportVersion: typeof CROSS_ROUND_PROBE_REPORT_VERSION;
  generatedAt: string;
  mode: "offline_post_hoc_read_only";
  treatmentMutation: "none";
  source: {
    selector: ProbeMatchSelector;
    matchId: number;
    gameId: string;
    completedAt: string;
    matchTotalRounds: number;
    qualityStatus: string;
    strictExecution: boolean;
    team: ProbeTeam;
    resolvedRoundIds: number[];
    resolvedRoundNumbers: number[];
    resolvedRounds: DurableResolvedRound[];
    publicLedger: PublicClueLedger;
    ledgerDepth: {
      resolvedRounds: number;
      totalClues: number;
      cluesByColumn: Array<{ number: number; clueCount: number }>;
    };
  };
  candidate: ProbeCandidate;
  instrument: {
    protocolVersion: typeof CROSS_ROUND_INVERSION_PROTOCOL_VERSION;
    policyId: typeof CROSS_ROUND_COLUMN_VETO_POLICY_ID;
    policyHash: typeof CROSS_ROUND_COLUMN_VETO_POLICY_HASH;
    auditorPromptHash: typeof CROSS_ROUND_AUDITOR_PROMPT_HASH;
    auditorBatchSize: typeof CROSS_ROUND_AUDITOR_BATCH_SIZE;
  };
  route: {
    requested: CrossRoundInversionRun["modelRequested"];
    resolved: Record<string, unknown>;
  };
  audit: {
    status: "probe";
    auditedAt: string;
    /** The full per-clue-per-slot evidence grid, verbatim. */
    historyMatches: CrossRoundInversionRun["reply"]["audits"];
    /** The support-tiered, array-order-independent credible set, verbatim. */
    codeHypotheses: CrossRoundInversionRun["reply"]["codeHypotheses"];
    evaluation: CrossRoundInversionEvaluation;
  };
  usage: CrossRoundInversionRun["usage"];
  lineage: {
    runner: ProbeRunnerLineage;
    sourceStrategyLineage: unknown;
    sourceStrategyLineageHash: string | null;
    sourceHistoryHash: string;
    candidateHash: string;
    immutableInputHash: string;
    reportContentHash: string;
  };
}

export type CrossRoundAuditor = (
  ledger: PublicClueLedger,
  clues: [string, string, string],
) => Promise<CrossRoundInversionRun>;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Bind reports to the actual parser, evaluator, routing, registry, dependency
 * lock, and CLI bytes that execute the probe. Protocol hashes alone are not a
 * code identity: a dirty local evaluator could otherwise emit an apparently
 * reproducible report under unchanged instrument ids.
 */
export async function collectProbeRunnerLineage(
  repositoryRoot: string,
  outputPath: string,
): Promise<ProbeRunnerLineage> {
  const root = resolve(repositoryRoot);
  const sources = await Promise.all(
    CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS.map(async (path) => ({
      path,
      sha256: sha256Hex(await readFile(resolve(root, path), "utf8")),
    })),
  );
  const runnerSource = sources.find(
    (source) => source.path === "scripts/run-cross-round-probe.ts",
  );
  if (!runnerSource) {
    throw new Error("Probe runner source is absent from executing-code lineage");
  }

  let commitSha: string | null = null;
  let relevantWorkingTreeDirty: boolean | null = null;
  let relevantStatusHash: string | null = null;
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const status = execFileSync(
      "git",
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ...CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS,
      ],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    commitSha = /^[a-f0-9]{40,64}$/.test(head) ? head : null;
    relevantWorkingTreeDirty = status.trim().length > 0;
    relevantStatusHash = sha256Hex(status);
  } catch {
    // Exact labeled source hashes remain complete and reproducible even when
    // the checkout is exported without .git. Git identity is explicitly null.
  }

  return {
    runnerVersion: CROSS_ROUND_PROBE_RUNNER_VERSION,
    runnerSourceHash: runnerSource.sha256,
    executingCode: {
      algorithm: "sha256-labeled-source-set@0.1",
      complete: true,
      sources,
      sourceSetHash: contentHash(sources),
    },
    git: {
      commitSha,
      relevantWorkingTreeDirty,
      relevantStatusHash,
    },
    outputPath: resolve(outputPath),
  };
}

function assertRunnerLineage(runner: ProbeRunnerLineage): void {
  if (
    runner.runnerVersion !== CROSS_ROUND_PROBE_RUNNER_VERSION ||
    !SHA256_HEX_PATTERN.test(runner.runnerSourceHash) ||
    runner.executingCode.algorithm !== "sha256-labeled-source-set@0.1" ||
    runner.executingCode.complete !== true ||
    runner.executingCode.sources.length !==
      CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS.length
  ) {
    throw new Error("Probe runner lineage is incomplete");
  }
  const seen = new Set<string>();
  for (const source of runner.executingCode.sources) {
    if (
      !CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS.includes(
        source.path as (typeof CROSS_ROUND_PROBE_EXECUTING_SOURCE_PATHS)[number],
      ) ||
      seen.has(source.path) ||
      !SHA256_HEX_PATTERN.test(source.sha256)
    ) {
      throw new Error("Probe executing-source lineage is malformed");
    }
    seen.add(source.path);
  }
  if (
    contentHash(runner.executingCode.sources) !==
      runner.executingCode.sourceSetHash ||
    runner.executingCode.sources.find(
      (source) => source.path === "scripts/run-cross-round-probe.ts",
    )?.sha256 !== runner.runnerSourceHash
  ) {
    throw new Error("Probe executing-source lineage hash does not verify");
  }
}

interface CliOptions {
  selector: ProbeMatchSelector;
  team: ProbeTeam;
  candidate: ProbeCandidate;
  outputPath: string;
  overwrite: boolean;
}

const MATCH_BY_ID_SQL = `
  SELECT
    m.id,
    m.game_id,
    m.completed_at,
    m.total_rounds,
    m.quality_status,
    m.strict_execution,
    m.strategy_lineage
  FROM matches m
  WHERE m.id = $1
    AND m.completed_at IS NOT NULL
  ORDER BY m.id
`;

const MATCH_BY_GAME_ID_SQL = `
  SELECT
    m.id,
    m.game_id,
    m.completed_at,
    m.total_rounds,
    m.quality_status,
    m.strict_execution,
    m.strategy_lineage
  FROM matches m
  WHERE m.game_id = $1
    AND m.completed_at IS NOT NULL
  ORDER BY m.id
`;

const RESOLVED_TEAM_ROUNDS_SQL = `
  SELECT
    mr.id AS round_id,
    mr.round_number,
    mr.team,
    mr.code,
    mr.clues,
    mr.own_guess,
    mr.opponent_guess
  FROM match_rounds mr
  JOIN matches m ON m.id = mr.match_id
  WHERE mr.match_id = $1
    AND mr.team = $2
    AND m.completed_at IS NOT NULL
    AND mr.round_number BETWEEN 1 AND m.total_rounds
    AND mr.own_guess IS NOT NULL
    AND mr.opponent_guess IS NOT NULL
  ORDER BY mr.round_number, mr.id
`;

function isoTimestamp(value: Date | string, label: string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is not a valid timestamp`);
  }
  return parsed.toISOString();
}

function codeTriple(value: unknown, label: string): [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (number) =>
        typeof number === "number" &&
        Number.isInteger(number) &&
        number >= 1 &&
        number <= 4,
    ) ||
    new Set(value).size !== 3
  ) {
    throw new Error(
      `${label} must contain three distinct integer columns from 1 to 4`,
    );
  }
  return [value[0], value[1], value[2]];
}

function clueTriple(value: unknown, label: string): [string, string, string] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (clue) =>
        typeof clue === "string" &&
        clue.trim().length > 0 &&
        clue.length <= 240,
    )
  ) {
    throw new Error(`${label} must contain exactly three 1-240 character clues`);
  }
  return [value[0], value[1], value[2]];
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

/**
 * Load the public clue history for exactly one team from a completed match.
 *
 * The SQL and the defensive in-memory predicates both exclude the other team,
 * live/incomplete matches, future rows, and rows without both resolved guesses.
 */
export async function loadDurableTeamHistory(
  queryClient: ProbeQueryClient,
  selector: ProbeMatchSelector,
  team: ProbeTeam,
): Promise<DurableTeamHistory> {
  const matchResult =
    selector.kind === "match_id"
      ? await queryClient.query<MatchRow>(MATCH_BY_ID_SQL, [selector.matchId])
      : await queryClient.query<MatchRow>(MATCH_BY_GAME_ID_SQL, [
          selector.gameId,
        ]);

  if (matchResult.rows.length === 0) {
    const printable =
      selector.kind === "match_id"
        ? `match id ${selector.matchId}`
        : `game id ${selector.gameId}`;
    throw new Error(
      `No completed durable Herpetarium match found for ${printable}`,
    );
  }
  if (matchResult.rows.length !== 1) {
    const ids = matchResult.rows
      .map((row) => String(row.id))
      .sort()
      .join(", ");
    throw new Error(
      `Selector is ambiguous across completed matches (${ids}); use --match-id`,
    );
  }

  const rawMatch = matchResult.rows[0]!;
  const matchId = positiveInteger(rawMatch.id, "match id");
  const totalRounds = positiveInteger(
    rawMatch.total_rounds,
    "match total_rounds",
  );
  if (typeof rawMatch.game_id !== "string" || rawMatch.game_id.length === 0) {
    throw new Error("match game_id is missing");
  }
  if (typeof rawMatch.quality_status !== "string") {
    throw new Error("match quality_status is missing");
  }
  if (typeof rawMatch.strict_execution !== "boolean") {
    throw new Error("match strict_execution is missing");
  }

  const roundResult = await queryClient.query<RoundRow>(
    RESOLVED_TEAM_ROUNDS_SQL,
    [matchId, team],
  );
  const rounds: DurableResolvedRound[] = [];
  const seenRoundNumbers = new Set<number>();

  for (const row of roundResult.rows) {
    // Defense in depth for injected/custom query adapters: never pool teams or
    // accept a row that lacks the two guesses proving resolution.
    if (
      row.team !== team ||
      row.own_guess === null ||
      row.own_guess === undefined ||
      row.opponent_guess === null ||
      row.opponent_guess === undefined
    ) {
      continue;
    }
    const roundNumber = positiveInteger(row.round_number, "round number");
    if (roundNumber > totalRounds) continue;
    if (seenRoundNumbers.has(roundNumber)) {
      throw new Error(
        `Duplicate resolved ${team} round ${roundNumber} for match ${matchId}`,
      );
    }
    seenRoundNumbers.add(roundNumber);
    // Non-null JSON alone is not proof of a resolved Decrypto action. Both
    // guesses must be structurally valid even though the public ledger does
    // not retain their values.
    codeTriple(row.own_guess, `round ${roundNumber} own guess`);
    codeTriple(row.opponent_guess, `round ${roundNumber} opponent guess`);
    rounds.push({
      roundId: positiveInteger(row.round_id, "round id"),
      roundNumber,
      team,
      clues: clueTriple(row.clues, `round ${roundNumber} clues`),
      code: codeTriple(row.code, `round ${roundNumber} code`),
    });
  }

  rounds.sort(
    (left, right) =>
      left.roundNumber - right.roundNumber || left.roundId - right.roundId,
  );
  if (rounds.length === 0) {
    throw new Error(
      `Completed match ${matchId} has no fully resolved durable rounds for team ${team}`,
    );
  }

  return {
    selector,
    match: {
      id: matchId,
      gameId: rawMatch.game_id,
      completedAt: isoTimestamp(rawMatch.completed_at, "match completed_at"),
      totalRounds,
      qualityStatus: rawMatch.quality_status,
      strictExecution: rawMatch.strict_execution,
      strategyLineage: rawMatch.strategy_lineage ?? null,
    },
    team,
    rounds,
  };
}

function assertPinnedProbeRun(run: CrossRoundInversionRun): void {
  if (
    run.status !== "probe" ||
    typeof run.auditedAt !== "string" ||
    Number.isNaN(Date.parse(run.auditedAt))
  ) {
    throw new Error("Auditor returned an invalid probe status or timestamp");
  }
  if (
    run.protocolVersion !== CROSS_ROUND_INVERSION_PROTOCOL_VERSION ||
    run.policyId !== CROSS_ROUND_COLUMN_VETO_POLICY_ID ||
    run.policyHash !== CROSS_ROUND_COLUMN_VETO_POLICY_HASH ||
    run.auditorPromptHash !== CROSS_ROUND_AUDITOR_PROMPT_HASH ||
    run.auditorBatchSize !== CROSS_ROUND_AUDITOR_BATCH_SIZE
  ) {
    throw new Error("Auditor returned a different cross-round instrument");
  }
  if (
    run.modelRequested.provider !== DEEPSEEK_V4_FLASH_CANONICAL.provider ||
    run.modelRequested.model !== DEEPSEEK_V4_FLASH_CANONICAL.model ||
    run.modelRequested.upstream !== DEEPSEEK_V4_FLASH_CANONICAL.upstream ||
    run.modelRequested.reasoningEffort !== "xhigh" ||
    run.modelRequested.wireReasoningEffort !== "max"
  ) {
    throw new Error(
      "Probe requires the exact dated DeepSeek V4 Flash DeepInfra route at xhigh (wire max)",
    );
  }
  if (
    run.providerMetadata?.servedModel !== DEEPSEEK_V4_FLASH_CANONICAL.model ||
    run.providerMetadata?.upstreamProvider !== "DeepInfra" ||
    run.providerMetadata?.requestedUpstream !==
      DEEPSEEK_V4_FLASH_CANONICAL.upstream ||
    run.providerMetadata?.wireReasoningEffort !== "max" ||
    run.providerMetadata?.physicalAttempt !== 1
  ) {
    throw new Error(
      "Probe response lacks exact served-model, one-attempt DeepInfra, and wire-max route proof",
    );
  }
  const providerUsage =
    run.providerMetadata?.usage &&
    typeof run.providerMetadata.usage === "object" &&
    !Array.isArray(run.providerMetadata.usage)
      ? (run.providerMetadata.usage as Record<string, unknown>)
      : undefined;
  if (
    !Number.isInteger(run.usage.promptTokens) ||
    (run.usage.promptTokens ?? 0) <= 0 ||
    !Number.isInteger(run.usage.completionTokens) ||
    (run.usage.completionTokens ?? 0) <= 0 ||
    !Number.isInteger(run.usage.totalTokens) ||
    (run.usage.totalTokens ?? 0) <= 0 ||
    typeof providerUsage?.reasoningTokens !== "number" ||
    !Number.isFinite(providerUsage.reasoningTokens) ||
    providerUsage.reasoningTokens <= 0 ||
    typeof run.usage.effectiveCostUsd !== "number" ||
    !Number.isFinite(run.usage.effectiveCostUsd) ||
    run.usage.effectiveCostUsd < 0 ||
    run.usage.costSource === undefined ||
    !Number.isFinite(run.usage.latencyMs) ||
    run.usage.latencyMs < 0
  ) {
    throw new Error(
      "Probe response lacks complete positive token/reasoning telemetry and finite usage/cost",
    );
  }
}

/**
 * Execute the offline audit and produce a self-identifying JSON report.
 *
 * The only dependency with side effects is the injected auditor. The default
 * is the existing strict one-attempt, exact-route cross-round auditor.
 */
export async function runCrossRoundProbe(input: {
  source: DurableTeamHistory;
  candidate: ProbeCandidate;
  runner: ProbeRunnerLineage;
  auditor?: CrossRoundAuditor;
  now?: () => Date;
}): Promise<CrossRoundProbeReport> {
  assertRunnerLineage(input.runner);
  const candidate: ProbeCandidate = {
    clues: clueTriple(input.candidate.clues, "candidate clues"),
    intendedCode: codeTriple(
      input.candidate.intendedCode,
      "candidate intended code",
    ),
  };
  const ledger = ledgerFromTeamHistory(
    input.source.rounds.map((round) => ({
      clues: round.clues,
      targetCode: round.code,
    })),
  );
  if (publicLedgerClueCount(ledger) === 0) {
    throw new Error("Cross-round probe requires at least one resolved clue");
  }

  const run = await (input.auditor ?? auditCrossRoundColumns)(
    ledger,
    candidate.clues,
  );
  assertPinnedProbeRun(run);
  if (run.ledgerClueCount !== publicLedgerClueCount(ledger)) {
    throw new Error("Auditor ledger depth does not match the loaded source");
  }
  if (
    run.reply.audits.length !== candidate.clues.length ||
    !run.reply.audits.every(
      (audit, index) => audit.clue === candidate.clues[index],
    )
  ) {
    throw new Error("Auditor assignments are not bound to candidate positions");
  }
  const evaluation = evaluateCrossRoundInversion(
    run.reply,
    candidate.intendedCode,
    ledger,
  );
  const generatedAt = (input.now?.() ?? new Date()).toISOString();
  const resolvedRounds = input.source.rounds.map((round) => ({
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    team: round.team,
    clues: [...round.clues] as [string, string, string],
    code: [...round.code] as [number, number, number],
  }));
  const instrument: CrossRoundProbeReport["instrument"] = {
    protocolVersion: CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
    policyId: CROSS_ROUND_COLUMN_VETO_POLICY_ID,
    policyHash: CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
    auditorPromptHash: CROSS_ROUND_AUDITOR_PROMPT_HASH,
    auditorBatchSize: CROSS_ROUND_AUDITOR_BATCH_SIZE,
  };
  const sourceHistoryHash = contentHash({
    matchId: input.source.match.id,
    gameId: input.source.match.gameId,
    completedAt: input.source.match.completedAt,
    matchTotalRounds: input.source.match.totalRounds,
    team: input.source.team,
    resolvedRounds,
    publicLedger: ledger,
  });
  const candidateHash = contentHash(candidate);
  const immutableInputHash = contentHash({
    reportVersion: CROSS_ROUND_PROBE_REPORT_VERSION,
    sourceHistoryHash,
    candidateHash,
    instrument,
    route: run.modelRequested,
    runner: input.runner,
  });
  const lineageWithoutReportHash = {
    runner: input.runner,
    sourceStrategyLineage: input.source.match.strategyLineage,
    sourceStrategyLineageHash:
      input.source.match.strategyLineage === null
        ? null
        : contentHash(input.source.match.strategyLineage),
    sourceHistoryHash,
    candidateHash,
    immutableInputHash,
  };
  const reportWithoutContentHash = {
    reportVersion:
      CROSS_ROUND_PROBE_REPORT_VERSION as typeof CROSS_ROUND_PROBE_REPORT_VERSION,
    generatedAt,
    mode: "offline_post_hoc_read_only" as const,
    treatmentMutation: "none" as const,
    source: {
      selector: input.source.selector,
      matchId: input.source.match.id,
      gameId: input.source.match.gameId,
      completedAt: input.source.match.completedAt,
      matchTotalRounds: input.source.match.totalRounds,
      qualityStatus: input.source.match.qualityStatus,
      strictExecution: input.source.match.strictExecution,
      team: input.source.team,
      resolvedRoundIds: resolvedRounds.map((round) => round.roundId),
      resolvedRoundNumbers: resolvedRounds.map((round) => round.roundNumber),
      resolvedRounds,
      publicLedger: ledger,
      ledgerDepth: {
        resolvedRounds: resolvedRounds.length,
        totalClues: publicLedgerClueCount(ledger),
        cluesByColumn: ledger.map((column) => ({
          number: column.number,
          clueCount: column.clues.length,
        })),
      },
    },
    candidate,
    instrument,
    route: {
      requested: run.modelRequested,
      resolved: run.providerMetadata ?? {},
    },
    audit: {
      status: run.status,
      auditedAt: run.auditedAt,
      historyMatches: run.reply.audits,
      codeHypotheses: run.reply.codeHypotheses,
      evaluation,
    },
    usage: run.usage,
    lineage: lineageWithoutReportHash,
  };
  const reportContentHash = contentHash(reportWithoutContentHash);

  return {
    ...reportWithoutContentHash,
    lineage: {
      ...lineageWithoutReportHash,
      reportContentHash,
    },
  };
}

export async function writeProbeReport(
  outputPath: string,
  report: CrossRoundProbeReport,
  overwrite = false,
): Promise<void> {
  const absolutePath = resolve(outputPath);
  if (dirname(absolutePath) === absolutePath) {
    throw new Error("Probe output must be a file path, not a filesystem root");
  }
  const {
    reportContentHash,
    ...lineageWithoutReportContentHash
  } = report.lineage;
  if (
    reportContentHash !==
    contentHash({
      ...report,
      lineage: lineageWithoutReportContentHash,
    })
  ) {
    throw new Error("Probe report content does not match its lineage hash");
  }
  // Serialize exactly once before the first await. Exported callers cannot
  // mutate the object during filesystem I/O and persist bytes that no longer
  // match the verified content hash.
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  if (resolve(report.lineage.runner.outputPath) !== absolutePath) {
    throw new Error(
      "Probe output path does not match the destination signed in report lineage",
    );
  }

  let existing:
    | Awaited<ReturnType<typeof lstat>>
    | undefined;
  try {
    existing = await lstat(absolutePath);
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
  }
  if (existing?.isSymbolicLink()) {
    throw new Error("Probe output refuses symbolic-link destinations");
  }
  if (existing && !overwrite) {
    throw new Error("Probe output already exists; pass --overwrite explicitly");
  }

  const temporaryPath = resolve(
    dirname(absolutePath),
    `.${basename(absolutePath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  let temporaryExists = false;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    temporaryExists = true;
    try {
      await handle.writeFile(serializedReport, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    if (overwrite) {
      // Atomic replacement in the same directory. `rename` replaces a
      // destination symlink itself rather than following it; the pre-check
      // additionally refuses any symlink that was already present.
      await rename(temporaryPath, absolutePath);
      temporaryExists = false;
    } else {
      // `link` gives us atomic no-clobber publication. A destination created
      // after the lstat check yields EEXIST instead of being overwritten.
      await link(temporaryPath, absolutePath);
      await unlink(temporaryPath);
      temporaryExists = false;
    }
  } finally {
    if (temporaryExists) {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseProbeCliArgs(args: string[]): CliOptions {
  let matchId: number | undefined;
  let gameId: string | undefined;
  let team: ProbeTeam | undefined;
  let clues: [string, string, string] | undefined;
  let intendedCode: [number, number, number] | undefined;
  let outputPath: string | undefined;
  let overwrite = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    switch (flag) {
      case "--match-id": {
        const value = Number(requiredValue(args, index, flag));
        matchId = positiveInteger(value, flag);
        index += 1;
        break;
      }
      case "--game-id": {
        gameId = requiredValue(args, index, flag);
        if (gameId.length > 100) {
          throw new Error("--game-id is too long");
        }
        index += 1;
        break;
      }
      case "--team": {
        const value = requiredValue(args, index, flag);
        if (value !== "amber" && value !== "blue") {
          throw new Error("--team must be amber or blue");
        }
        team = value;
        index += 1;
        break;
      }
      case "--clues": {
        const value = requiredValue(args, index, flag);
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch {
          throw new Error("--clues must be a JSON array of three strings");
        }
        clues = clueTriple(parsed, "--clues");
        index += 1;
        break;
      }
      case "--code": {
        const value = requiredValue(args, index, flag);
        let parsed: unknown;
        try {
          parsed = value.trim().startsWith("[")
            ? JSON.parse(value)
            : value.split(",").map((part) => Number(part.trim()));
        } catch {
          throw new Error("--code must be comma-separated or a JSON array");
        }
        intendedCode = codeTriple(parsed, "--code");
        index += 1;
        break;
      }
      case "--output": {
        outputPath = resolve(requiredValue(args, index, flag));
        index += 1;
        break;
      }
      case "--overwrite":
        overwrite = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if ((matchId === undefined) === (gameId === undefined)) {
    throw new Error("Provide exactly one of --match-id or --game-id");
  }
  if (!team) throw new Error("--team is required");
  if (!clues) throw new Error("--clues is required");
  if (!intendedCode) throw new Error("--code is required");
  if (!outputPath) {
    throw new Error("--output is required; probe reports are never implicit");
  }

  return {
    selector:
      matchId !== undefined
        ? { kind: "match_id", matchId }
        : { kind: "game_id", gameId: gameId! },
    team,
    candidate: { clues, intendedCode },
    outputPath,
    overwrite,
  };
}

async function main(): Promise<void> {
  const options = parseProbeCliArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let source: DurableTeamHistory;
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const queryClient: ProbeQueryClient = {
      async query<Row extends Record<string, unknown>>(
        text: string,
        values: readonly unknown[],
      ): Promise<{ rows: Row[] }> {
        const result = await client.query(text, [...values]);
        return { rows: result.rows as Row[] };
      },
    };
    source = await loadDurableTeamHistory(
      queryClient,
      options.selector,
      options.team,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  const thisFile = fileURLToPath(import.meta.url);
  const repositoryRoot = resolve(dirname(thisFile), "..");
  const runner = await collectProbeRunnerLineage(
    repositoryRoot,
    options.outputPath,
  );
  const report = await runCrossRoundProbe({
    source,
    candidate: options.candidate,
    runner,
  });
  await writeProbeReport(options.outputPath, report, options.overwrite);
  process.stdout.write(
    `${JSON.stringify({
      outputPath: options.outputPath,
      reportContentHash: report.lineage.reportContentHash,
      outcome: report.audit.evaluation.outcome,
      matchId: report.source.matchId,
      team: report.source.team,
    })}\n`,
  );
}

const directExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (directExecution) {
  void main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
