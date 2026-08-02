/**
 * Real-provider mechanism canary for the shared cross-round auditor.
 *
 * This is intentionally separate from `run-cross-round-probe.ts`. That probe
 * reads durable Herpetarium match history; this command uses the exact shared
 * production-incident fixtures and never opens a database. It verifies the
 * provider route and shared policy mechanism only. It is not calibration,
 * tournament evidence, or a live treatment.
 *
 * Required environment: OPENROUTER_API_KEY.
 *
 * Example:
 *   node_modules/.bin/tsx scripts/run-cross-round-fixture-canary.ts \
 *     --repeat 1 \
 *     --output /private/tmp/cross-round-fixture-canary.json
 */
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  type FileHandle,
  chmod,
  link,
  lstat,
  open,
  readFile,
  realpath,
  unlink,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditCrossRoundColumns,
  type CrossRoundInversionRun,
} from "../server/crossRoundInversion";
import {
  CROSS_ROUND_AUDITOR_BATCH_SIZE,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_COLUMN_LEAK_2026_08_01,
  CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  DEEPSEEK_V4_FLASH_CANONICAL,
  buildPublicClueLedger,
  contentHash,
  evaluateCrossRoundInversion,
  publicLedgerClueCount,
  sha256Hex,
  type CodeHypothesis,
  type CrossRoundClueAudit,
  type CrossRoundInversionEvaluation,
  type InversionVetoOutcome,
  type PublicClueLedger,
  type ResolvedClueRound,
} from "../shared/substrate";

export const CROSS_ROUND_FIXTURE_CANARY_REPORT_VERSION =
  "herpetarium-cross-round-fixture-canary-report@0.1";
export const CROSS_ROUND_FIXTURE_CANARY_RUNNER_VERSION =
  "herpetarium-cross-round-fixture-canary-runner@0.1";
export const MAX_FIXTURE_CANARY_REPEATS = 3;

const EXACT_MODEL = DEEPSEEK_V4_FLASH_CANONICAL.model;
const EXACT_UPSTREAM_SLUG =
  DEEPSEEK_V4_FLASH_CANONICAL.upstream ?? "deepinfra";
const EXACT_UPSTREAM_DISPLAY = "DeepInfra";
const VALID_OUTCOMES: readonly InversionVetoOutcome[] = [
  "pass",
  "soft_regenerate_once",
  "hard_veto",
];

export type FixtureCanaryCaseId =
  | "red-production-incident-2026-08-01"
  | "blue-production-incident-2026-08-01"
  | "synthetic-opaque-negative-control";

export interface FixtureCanaryDefinition {
  id: FixtureCanaryCaseId;
  kind:
    | "exact_shared_production_incident"
    | "synthetic_non_research_negative_control";
  provenance: string;
  /**
   * `pass` is required of the post-incident shaped input, not merely recorded.
   * Its outcome being free was what let a veto-everything instrument satisfy
   * the mechanical boundary. The legacy case id says "negative-control" for
   * report compatibility; it is not a sampled control distribution.
   */
  expectedOutcome: "hard_veto" | "pass";
  ledger: PublicClueLedger;
  clues: [string, string, string];
  intendedCode: [number, number, number];
}

export type FixtureCanaryAuditor = (
  ledger: PublicClueLedger,
  clues: [string, string, string],
) => Promise<CrossRoundInversionRun>;

export interface FixtureCanaryRunnerLineage {
  runnerVersion: typeof CROSS_ROUND_FIXTURE_CANARY_RUNNER_VERSION;
  runnerSourceHash: string;
  gitCommitSha: string | null;
}

export interface FixtureCanaryResolvedRoute {
  httpStatus: number;
  requestId: string | null;
  generationId: string | null;
  servedModel: string;
  upstreamProvider: string;
  requestedUpstream: string;
  requestedReasoningEffort: "xhigh";
  wireReasoningEffort: "max";
  physicalAttempt: 1;
  finishReason: "stop";
  routing: {
    only: ["deepinfra"];
    allowFallbacks: false;
    requireParameters: true;
    dataCollection: "deny";
  };
  openRouter: {
    attempt: 1;
    strategy: string | null;
    selectedProvider: "DeepInfra";
    recordedAttemptCount: number;
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningTokens: number;
    costUsd: number;
  };
}

export interface FixtureCanaryRunRecord {
  repeat: number;
  caseId: FixtureCanaryCaseId;
  caseKind: FixtureCanaryDefinition["kind"];
  provenance: string;
  expectedOutcome: FixtureCanaryDefinition["expectedOutcome"];
  ledger: PublicClueLedger;
  candidate: {
    clues: [string, string, string];
    intendedCode: [number, number, number];
  };
  instrument: {
    protocolVersion: typeof CROSS_ROUND_INVERSION_PROTOCOL_VERSION;
    policyId: typeof CROSS_ROUND_COLUMN_VETO_POLICY_ID;
    policyHash: typeof CROSS_ROUND_COLUMN_VETO_POLICY_HASH;
    auditorPromptHash: typeof CROSS_ROUND_AUDITOR_PROMPT_HASH;
    auditorBatchSize: typeof CROSS_ROUND_AUDITOR_BATCH_SIZE;
  };
  route: {
    requested: CrossRoundInversionRun["modelRequested"];
    resolved: FixtureCanaryResolvedRoute;
  };
  audit: {
    status: "probe";
    auditedAt: string;
    /** The full per-clue-per-slot evidence grid, verbatim. */
    historyMatches: CrossRoundClueAudit[];
    /** The support-tiered, array-order-independent credible set, verbatim. */
    codeHypotheses: CodeHypothesis[];
    evaluation: CrossRoundInversionEvaluation;
  };
  usage: CrossRoundInversionRun["usage"];
}

export interface CrossRoundFixtureCanaryReport {
  reportVersion: typeof CROSS_ROUND_FIXTURE_CANARY_REPORT_VERSION;
  generatedAt: string;
  mode: "real_provider_fixture_mechanism_canary";
  treatmentMutation: "none";
  databaseAccess: "none";
  researchStatus:
    | "mechanism_canary_only_not_calibration_or_tournament_evidence";
  repeatCount: number;
  controlQualification: string;
  cases: Array<{
    id: FixtureCanaryCaseId;
    kind: FixtureCanaryDefinition["kind"];
    provenance: string;
    expectedOutcome: FixtureCanaryDefinition["expectedOutcome"];
  }>;
  runs: FixtureCanaryRunRecord[];
  summary: {
    redOutcomes: InversionVetoOutcome[];
    blueOutcomes: InversionVetoOutcome[];
    controlOutcomes: InversionVetoOutcome[];
    /** False when an incident misses OR the shaped input fails to pass. */
    releaseBoundarySatisfied: boolean;
  };
  lineage: {
    runner: FixtureCanaryRunnerLineage;
    fixtureInputHash: string;
    reportContentHash: string;
  };
}

interface CliOptions {
  repeatCount: number;
  outputPath: string;
}

function stringTriple(
  value: readonly string[],
  label: string,
): [string, string, string] {
  if (
    value.length !== 3 ||
    !value.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0 &&
        item.length <= 240,
    )
  ) {
    throw new Error(`${label} must contain exactly three non-empty clues`);
  }
  return [value[0]!, value[1]!, value[2]!];
}

function codeTriple(
  value: readonly number[],
  label: string,
): [number, number, number] {
  if (
    value.length !== 3 ||
    !value.every(
      (item) =>
        Number.isInteger(item) && item >= 1 && item <= 4,
    ) ||
    new Set(value).size !== 3
  ) {
    throw new Error(
      `${label} must contain three distinct integer columns from 1 to 4`,
    );
  }
  return [value[0]!, value[1]!, value[2]!];
}

function ledgerFromFixtureRounds(
  rounds: ReadonlyArray<{
    clues: readonly string[];
    code: readonly number[];
  }>,
): PublicClueLedger {
  const resolved: ResolvedClueRound[] = rounds.map((round, index) => ({
    clues: stringTriple(round.clues, `resolved round ${index + 1} clues`),
    code: codeTriple(round.code, `resolved round ${index + 1} code`),
  }));
  return buildPublicClueLedger(resolved);
}

/**
 * Frozen inputs for this mechanism canary.
 *
 * The first two are imported directly from the shared production fixtures.
 * The third is intentionally modest: it proves that the gate can still PASS
 * this one shaped input. It is hand-authored after the incident, has no
 * held-out or historical provenance, and must never be reported as evidence
 * of safety, non-leakage, a population error rate, or calibration. Its legacy
 * "negative-control" id is retained only so old reports remain readable.
 */
export function fixtureCanaryDefinitions(): FixtureCanaryDefinition[] {
  const redLedger = ledgerFromFixtureRounds(
    CROSS_ROUND_COLUMN_LEAK_2026_08_01.resolvedRounds,
  );
  const blueLedger = ledgerFromFixtureRounds(
    CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.resolvedRounds,
  );
  return [
    {
      id: "red-production-incident-2026-08-01",
      kind: "exact_shared_production_incident",
      provenance:
        "Exact CROSS_ROUND_COLUMN_LEAK_2026_08_01 shared fixture: the Red production incident.",
      expectedOutcome: "hard_veto",
      ledger: redLedger,
      clues: stringTriple(
        CROSS_ROUND_COLUMN_LEAK_2026_08_01.leakingRound.clues,
        "Red incident clues",
      ),
      intendedCode: codeTriple(
        CROSS_ROUND_COLUMN_LEAK_2026_08_01.leakingRound.code,
        "Red incident code",
      ),
    },
    {
      id: "blue-production-incident-2026-08-01",
      kind: "exact_shared_production_incident",
      provenance:
        "Exact CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01 shared fixture: the Blue production incident, including its history-free slot-4 boundary.",
      expectedOutcome: "hard_veto",
      ledger: blueLedger,
      clues: stringTriple(
        CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.leakingRound.clues,
        "Blue incident clues",
      ),
      intendedCode: codeTriple(
        CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01.leakingRound.code,
        "Blue incident code",
      ),
    },
    {
      id: "synthetic-opaque-negative-control",
      kind: "synthetic_non_research_negative_control",
      provenance:
        "Hand-authored words (kettle/meridian/sable) evaluated against the Red fixture ledger after the incident. This is not held-out or history-independent research evidence, does not establish safety or non-leakage, and supplies no population error rate or calibration. Its legacy negative-control id is retained for report compatibility; PASS is required only as a mechanical check against an always-veto evaluator.",
      expectedOutcome: "pass",
      ledger: redLedger,
      clues: ["kettle", "meridian", "sable"],
      intendedCode: [1, 3, 4],
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordField(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} is missing`);
  return value;
}

function exactString(
  value: unknown,
  expected: string,
  label: string,
): string {
  if (value !== expected) {
    throw new Error(`${label} must equal ${expected}`);
  }
  return expected;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${label} must be a nonnegative integer`);
  }
  return value;
}

function exactPositiveInteger(
  value: unknown,
  expected: number,
  label: string,
): number {
  if (value !== expected) {
    throw new Error(`${label} must equal ${expected}`);
  }
  return expected;
}

function assertInstrumentIdentity(run: CrossRoundInversionRun): void {
  if (
    run.protocolVersion !== CROSS_ROUND_INVERSION_PROTOCOL_VERSION ||
    run.policyId !== CROSS_ROUND_COLUMN_VETO_POLICY_ID ||
    run.policyHash !== CROSS_ROUND_COLUMN_VETO_POLICY_HASH ||
    run.auditorPromptHash !== CROSS_ROUND_AUDITOR_PROMPT_HASH ||
    run.auditorBatchSize !== CROSS_ROUND_AUDITOR_BATCH_SIZE
  ) {
    throw new Error(
      "Fixture canary received a different cross-round instrument",
    );
  }
}

function assertCallerPositionBinding(
  audits: readonly CrossRoundClueAudit[],
  clues: readonly [string, string, string],
): void {
  if (
    audits.length !== clues.length ||
    audits.some((audit, index) => audit.clue !== clues[index])
  ) {
    throw new Error(
      "Fixture canary assignments are not bound to caller-owned clue positions",
    );
  }
}

function resolvedRouteProof(
  run: CrossRoundInversionRun,
): FixtureCanaryResolvedRoute {
  if (
    run.modelRequested.provider !== "openrouter" ||
    run.modelRequested.model !== EXACT_MODEL ||
    run.modelRequested.upstream !== EXACT_UPSTREAM_SLUG ||
    run.modelRequested.reasoningEffort !== "xhigh" ||
    run.modelRequested.wireReasoningEffort !== "max"
  ) {
    throw new Error(
      "Fixture canary requires exact 0731/DeepInfra xhigh-to-wire-max requested route",
    );
  }

  const metadata = recordField(run.providerMetadata, "provider metadata");
  const routing = recordField(metadata.routing, "provider routing");
  if (
    !Array.isArray(routing.only) ||
    routing.only.length !== 1 ||
    routing.only[0] !== EXACT_UPSTREAM_SLUG ||
    routing.allow_fallbacks !== false ||
    routing.require_parameters !== true ||
    routing.data_collection !== "deny"
  ) {
    throw new Error(
      "Fixture canary provider routing is not the pinned no-fallback DeepInfra route",
    );
  }

  exactString(metadata.servedModel, EXACT_MODEL, "served model");
  exactString(
    metadata.upstreamProvider,
    EXACT_UPSTREAM_DISPLAY,
    "served upstream",
  );
  exactString(
    metadata.requestedUpstream,
    EXACT_UPSTREAM_SLUG,
    "requested upstream",
  );
  exactString(
    metadata.requestedReasoningEffort,
    "xhigh",
    "requested reasoning effort",
  );
  exactString(
    metadata.wireReasoningEffort,
    "max",
    "wire reasoning effort",
  );
  if (metadata.reasoningDisabled !== false) {
    throw new Error("Fixture canary reasoning must be enabled");
  }
  exactPositiveInteger(metadata.physicalAttempt, 1, "physical attempt");
  const httpStatus = nonnegativeInteger(metadata.httpStatus, "HTTP status");
  if (httpStatus < 200 || httpStatus >= 300) {
    throw new Error("Fixture canary provider HTTP status must be successful");
  }
  exactString(metadata.finishReason, "stop", "finish reason");

  const openRouter = recordField(
    metadata.openrouterMetadata,
    "OpenRouter route metadata",
  );
  exactPositiveInteger(openRouter.attempt, 1, "OpenRouter route attempt");
  const strategy = optionalString(
    openRouter.strategy,
    "OpenRouter routing strategy",
  );
  if (strategy?.toLowerCase() === "fallback") {
    throw new Error("Fixture canary OpenRouter route used fallback strategy");
  }
  const attempts = Array.isArray(openRouter.attempts)
    ? openRouter.attempts
    : [];
  if (attempts.length > 1) {
    throw new Error("Fixture canary recorded more than one provider attempt");
  }
  const endpoints = recordField(
    openRouter.endpoints,
    "OpenRouter endpoint metadata",
  );
  if (!Array.isArray(endpoints.available)) {
    throw new Error("OpenRouter available endpoints are missing");
  }
  const selected = endpoints.available.filter(
    (endpoint) => isRecord(endpoint) && endpoint.selected === true,
  );
  if (
    selected.length !== 1 ||
    selected[0]!.provider !== EXACT_UPSTREAM_DISPLAY
  ) {
    throw new Error(
      "Fixture canary lacks one selected DeepInfra endpoint",
    );
  }

  const providerUsage = recordField(metadata.usage, "provider usage");
  const promptTokens = positiveNumber(
    providerUsage.promptTokens,
    "provider prompt tokens",
  );
  const completionTokens = positiveNumber(
    providerUsage.completionTokens,
    "provider completion tokens",
  );
  const totalTokens = positiveNumber(
    providerUsage.totalTokens,
    "provider total tokens",
  );
  const reasoningTokens = positiveNumber(
    providerUsage.reasoningTokens,
    "provider reasoning tokens",
  );
  const costUsd = positiveNumber(providerUsage.costUsd, "provider cost");

  if (
    run.usage.promptTokens !== promptTokens ||
    run.usage.completionTokens !== completionTokens ||
    run.usage.totalTokens !== totalTokens ||
    run.usage.providerReportedCostUsd !== costUsd ||
    run.usage.costSource !== "provider_reported" ||
    run.usage.effectiveCostUsd !== costUsd
  ) {
    throw new Error(
      "Fixture canary projected usage does not match provider telemetry",
    );
  }
  if (
    typeof run.usage.latencyMs !== "number" ||
    !Number.isFinite(run.usage.latencyMs) ||
    run.usage.latencyMs < 0
  ) {
    throw new Error("Fixture canary latency telemetry is invalid");
  }

  return {
    httpStatus,
    requestId: optionalString(metadata.requestId, "request id"),
    generationId: optionalString(metadata.generationId, "generation id"),
    servedModel: EXACT_MODEL,
    upstreamProvider: EXACT_UPSTREAM_DISPLAY,
    requestedUpstream: EXACT_UPSTREAM_SLUG,
    requestedReasoningEffort: "xhigh",
    wireReasoningEffort: "max",
    physicalAttempt: 1,
    finishReason: "stop",
    routing: {
      only: ["deepinfra"],
      allowFallbacks: false,
      requireParameters: true,
      dataCollection: "deny",
    },
    openRouter: {
      attempt: 1,
      strategy,
      selectedProvider: "DeepInfra",
      recordedAttemptCount: attempts.length,
    },
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      reasoningTokens,
      costUsd,
    },
  };
}

function assertValidOutcome(value: unknown): asserts value is InversionVetoOutcome {
  if (!VALID_OUTCOMES.includes(value as InversionVetoOutcome)) {
    throw new Error("Fixture canary evaluator returned an invalid outcome");
  }
}

function reportWithContentHash(
  input: Omit<CrossRoundFixtureCanaryReport, "lineage"> & {
    lineage: Omit<
      CrossRoundFixtureCanaryReport["lineage"],
      "reportContentHash"
    >;
  },
): CrossRoundFixtureCanaryReport {
  const reportContentHash = contentHash(input);
  return {
    ...input,
    lineage: {
      ...input.lineage,
      reportContentHash,
    },
  };
}

export async function runCrossRoundFixtureCanary(input: {
  repeatCount?: number;
  auditor?: FixtureCanaryAuditor;
  now?: () => Date;
  runner: FixtureCanaryRunnerLineage;
}): Promise<CrossRoundFixtureCanaryReport> {
  const repeatCount = input.repeatCount ?? 1;
  if (
    !Number.isSafeInteger(repeatCount) ||
    repeatCount < 1 ||
    repeatCount > MAX_FIXTURE_CANARY_REPEATS
  ) {
    throw new Error(
      `--repeat must be an integer from 1 to ${MAX_FIXTURE_CANARY_REPEATS}`,
    );
  }
  const auditor =
    input.auditor ??
    ((ledger, clues) => auditCrossRoundColumns(ledger, clues));
  const definitions = fixtureCanaryDefinitions();
  const runs: FixtureCanaryRunRecord[] = [];

  for (let repeat = 1; repeat <= repeatCount; repeat += 1) {
    for (const definition of definitions) {
      runs.push(
        await runFixtureCanaryCase({
          repeat,
          definition,
          auditor,
        }),
      );
    }
  }

  const outcomes = (caseId: FixtureCanaryCaseId) =>
    runs
      .filter((run) => run.caseId === caseId)
      .map((run) => run.audit.evaluation.outcome);
  const fixtureInputHash = contentHash(
    definitions.map((definition) => ({
      id: definition.id,
      kind: definition.kind,
      provenance: definition.provenance,
      expectedOutcome: definition.expectedOutcome,
      ledger: definition.ledger,
      clues: definition.clues,
      intendedCode: definition.intendedCode,
    })),
  );
  const generatedAt = (input.now?.() ?? new Date()).toISOString();
  if (Number.isNaN(new Date(generatedAt).getTime())) {
    throw new Error("Fixture canary generatedAt timestamp is invalid");
  }

  return reportWithContentHash({
    reportVersion: CROSS_ROUND_FIXTURE_CANARY_REPORT_VERSION,
    generatedAt,
    mode: "real_provider_fixture_mechanism_canary",
    treatmentMutation: "none",
    databaseAccess: "none",
    researchStatus:
      "mechanism_canary_only_not_calibration_or_tournament_evidence",
    repeatCount,
    controlQualification:
      "The legacy-named synthetic control is a post-incident, hand-authored shaped input. PASS is required only as a mechanical boundary against an always-veto evaluator; it does not establish safety or non-leakage and is not held-out evidence, a population error-rate estimate, calibration, or a history-independent research control.",
    cases: definitions.map((definition) => ({
      id: definition.id,
      kind: definition.kind,
      provenance: definition.provenance,
      expectedOutcome: definition.expectedOutcome,
    })),
    runs,
    summary: {
      redOutcomes: outcomes("red-production-incident-2026-08-01"),
      blueOutcomes: outcomes("blue-production-incident-2026-08-01"),
      controlOutcomes: outcomes("synthetic-opaque-negative-control"),
      // Computed, never asserted. Typing this `true` and setting it
      // unconditionally made the report unable to describe a failing run.
      // BOTH directions. An instrument that vetoes everything would satisfy
      // the two incident expectations and certify green, so the shaped input
      // must PASS for the boundary to hold. It is hand-authored and explicitly
      // not held-out evidence, a safety/non-leak claim, a population
      // error-rate estimate, or calibration — it is a mechanical check that
      // the evaluator can still say "no".
      releaseBoundarySatisfied: runs.every((run) =>
        run.expectedOutcome === "hard_veto"
          ? run.audit.evaluation.outcome === "hard_veto"
          : run.audit.evaluation.outcome === "pass",
      ),
    },
    lineage: {
      runner: input.runner,
      fixtureInputHash,
    },
  });
}

/**
 * Execute and fully validate one fixture draw.
 *
 * The release canary uses this serially. The separate repeat experiment uses
 * the same function through a bounded worker pool, so concurrency cannot
 * silently weaken instrument-identity, route-proof, or evaluator checks.
 */
export async function runFixtureCanaryCase(input: {
  repeat: number;
  definition: FixtureCanaryDefinition;
  auditor?: FixtureCanaryAuditor;
  logBoundaryMisses?: boolean;
}): Promise<FixtureCanaryRunRecord> {
  if (!Number.isSafeInteger(input.repeat) || input.repeat < 1) {
    throw new Error("Fixture canary repeat must be a positive integer");
  }
  const auditor =
    input.auditor ??
    ((ledger, clues) => auditCrossRoundColumns(ledger, clues));
  const { definition } = input;
  const run = await auditor(definition.ledger, definition.clues);
  assertInstrumentIdentity(run);
  assertCallerPositionBinding(run.reply.audits, definition.clues);
  if (run.ledgerClueCount !== publicLedgerClueCount(definition.ledger)) {
    throw new Error(
      `Fixture canary ${definition.id} reported the wrong ledger depth`,
    );
  }
  const route = resolvedRouteProof(run);
  const evaluation = evaluateCrossRoundInversion(
    run.reply,
    definition.intendedCode,
    definition.ledger,
  );
  assertValidOutcome(evaluation.outcome);
  // A miss is RECORDED here, not thrown. When this canary caught the 0.1
  // instrument scoring the Red incident `pass` on 2026-08-01 it threw before
  // preserving the reply. The boundary still fails in the report; it now
  // fails with its evidence intact.
  if (
    definition.expectedOutcome === "hard_veto" &&
    evaluation.outcome !== "hard_veto" &&
    input.logBoundaryMisses !== false
  ) {
    console.error(
      `Fixture canary ${definition.id} must hard-veto; received ${evaluation.outcome}`,
    );
  }
  // The post-incident shaped-input direction. An evaluator that cannot pass
  // anything is not usable, so recording this as a boundary failure prevents
  // a veto-everything instrument from certifying green. It is not a safety or
  // non-leakage result.
  if (
    definition.expectedOutcome !== "hard_veto" &&
    evaluation.outcome !== "pass" &&
    input.logBoundaryMisses !== false
  ) {
    console.error(
      `Fixture canary shaped input ${definition.id} must pass; received ${evaluation.outcome}`,
    );
  }
  return {
    repeat: input.repeat,
    caseId: definition.id,
    caseKind: definition.kind,
    provenance: definition.provenance,
    expectedOutcome: definition.expectedOutcome,
    ledger: definition.ledger,
    candidate: {
      clues: definition.clues,
      intendedCode: definition.intendedCode,
    },
    instrument: {
      protocolVersion: run.protocolVersion,
      policyId: run.policyId,
      policyHash: run.policyHash,
      auditorPromptHash: run.auditorPromptHash,
      auditorBatchSize: run.auditorBatchSize,
    },
    route: {
      requested: run.modelRequested,
      resolved: route,
    },
    audit: {
      status: run.status,
      auditedAt: run.auditedAt,
      historyMatches: run.reply.audits,
      codeHypotheses: run.reply.codeHypotheses,
      evaluation,
    },
    usage: run.usage,
  };
}

function errorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

async function closeQuietly(handle: FileHandle | null): Promise<void> {
  if (!handle) return;
  await handle.close().catch(() => undefined);
}

async function unlinkQuietly(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}

/**
 * Publish one complete report without ever following an output symlink.
 *
 * The complete 0600 inode is built and fsynced under an unpredictable,
 * O_EXCL|O_NOFOLLOW temporary name in the destination directory. `link`
 * installs the final name atomically and fails if anything—including a
 * symlink—already occupies it. No rename-overwrite window exists.
 */
export async function writeFixtureCanaryReport(
  outputPath: string,
  report: CrossRoundFixtureCanaryReport,
): Promise<void> {
  await writeNoClobberJsonReport(outputPath, report, "Fixture canary");
}

/** Atomic, 0600, no-clobber JSON publication shared by research runners. */
export async function writeNoClobberJsonReport(
  outputPath: string,
  report: unknown,
  artifactLabel: string,
): Promise<void> {
  if (artifactLabel.trim().length === 0) {
    throw new Error("Report artifact label must not be empty");
  }
  const absolutePath = resolve(outputPath);
  const parent = dirname(absolutePath);
  if (parent === absolutePath) {
    throw new Error(`${artifactLabel} output must be a file path`);
  }
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error(
      `${artifactLabel} output parent must be a real directory`,
    );
  }
  const resolvedParent = await realpath(parent);
  if (resolve(resolvedParent) !== resolve(parent)) {
    throw new Error(
      `${artifactLabel} output parent must not traverse a symbolic link`,
    );
  }
  try {
    await lstat(absolutePath);
    throw new Error(
      `${artifactLabel} output already exists; reports are no-clobber`,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("reports are no-clobber")
    ) {
      throw error;
    }
    if (errorCode(error) !== "ENOENT") throw error;
  }

  const temporaryPath = resolve(
    parent,
    `.${basename(absolutePath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  let handle: FileHandle | null = null;
  try {
    handle = await open(
      temporaryPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(payload, "utf8");
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = null;
    try {
      await link(temporaryPath, absolutePath);
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        throw new Error(
          `${artifactLabel} output already exists; reports are no-clobber`,
        );
      }
      throw error;
    }
    await chmod(absolutePath, 0o600);
    await unlink(temporaryPath);
  } catch (error) {
    await closeQuietly(handle);
    await unlinkQuietly(temporaryPath);
    throw error;
  }
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseFixtureCanaryArgs(args: string[]): CliOptions {
  let repeatCount = 1;
  let outputPath: string | undefined;
  let sawRepeat = false;
  let sawOutput = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    switch (flag) {
      case "--repeat": {
        if (sawRepeat) throw new Error("--repeat may appear only once");
        sawRepeat = true;
        const value = Number(requiredValue(args, index, flag));
        if (
          !Number.isSafeInteger(value) ||
          value < 1 ||
          value > MAX_FIXTURE_CANARY_REPEATS
        ) {
          throw new Error(
            `--repeat must be an integer from 1 to ${MAX_FIXTURE_CANARY_REPEATS}`,
          );
        }
        repeatCount = value;
        index += 1;
        break;
      }
      case "--output": {
        if (sawOutput) throw new Error("--output may appear only once");
        sawOutput = true;
        outputPath = resolve(requiredValue(args, index, flag));
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!outputPath) {
    throw new Error(
      "--output is required; fixture canary reports are never implicit",
    );
  }
  return { repeatCount, outputPath };
}

function safeGitSha(): string | null {
  for (const value of [
    process.env.HERPETARIUM_GIT_SHA,
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.GIT_SHA,
  ]) {
    if (typeof value === "string" && /^[0-9a-f]{7,64}$/i.test(value)) {
      return value.toLowerCase();
    }
  }
  return null;
}

async function main(): Promise<void> {
  const options = parseFixtureCanaryArgs(process.argv.slice(2));
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }
  const thisFile = fileURLToPath(import.meta.url);
  const report = await runCrossRoundFixtureCanary({
    repeatCount: options.repeatCount,
    runner: {
      runnerVersion: CROSS_ROUND_FIXTURE_CANARY_RUNNER_VERSION,
      runnerSourceHash: sha256Hex(await readFile(thisFile, "utf8")),
      gitCommitSha: safeGitSha(),
    },
  });
  // Write BEFORE deciding pass/fail. A canary whose only failure mode is an
  // exception destroys the evidence it exists to capture.
  await writeFixtureCanaryReport(options.outputPath, report);
  process.stdout.write(
    `${JSON.stringify({
      outputPath: options.outputPath,
      reportContentHash: report.lineage.reportContentHash,
      repeatCount: report.repeatCount,
      releaseBoundarySatisfied: report.summary.releaseBoundarySatisfied,
      redOutcomes: report.summary.redOutcomes,
      blueOutcomes: report.summary.blueOutcomes,
      controlOutcomes: report.summary.controlOutcomes,
    })}\n`,
  );
  if (!report.summary.releaseBoundarySatisfied) {
    throw new Error(
      `Fixture canary release boundary NOT satisfied; the failing replies are recorded in ${options.outputPath}`,
    );
  }
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
