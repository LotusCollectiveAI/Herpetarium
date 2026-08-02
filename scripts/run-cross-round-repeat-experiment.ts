/**
 * Pre-registered repeat measurement for the unchanged v0.3 cross-round
 * auditor.
 *
 * This is deliberately NOT the release canary and never mutates gameplay.
 * It schedules exactly 20 draws for each of the frozen Red, Blue, and shaped
 * control fixtures (60 calls total), at concurrency 5, with no retries or
 * replacement calls. A durable preregistration is written before provider
 * dispatch; every visible model response is written immediately after its
 * call so a process death cannot erase the completed traces.
 */
import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  crossRoundInversionRunFromRawExecution,
  crossRoundRawExecutionFromError,
  executeCrossRoundAuditorRaw,
  type CrossRoundAuditorRawExecution,
} from "../server/crossRoundInversion";
import {
  CROSS_ROUND_AUDITOR_BATCH_SIZE,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  DEEPSEEK_V4_FLASH_CANONICAL,
  SUBSTRATE_VERSION,
  contentHash,
  sha256Hex,
  type InversionVetoOutcome,
} from "../shared/substrate";
import {
  fixtureCanaryDefinitions,
  runFixtureCanaryCase,
  writeNoClobberJsonReport,
  type FixtureCanaryCaseId,
  type FixtureCanaryDefinition,
  type FixtureCanaryRunRecord,
} from "./run-cross-round-fixture-canary";

export const CROSS_ROUND_REPEAT_EXPERIMENT_VERSION =
  "cross-round-v03-repeat-measurement@0.2";
export const CROSS_ROUND_REPEAT_PREREGISTRATION_VERSION =
  "cross-round-v03-repeat-preregistration@0.2";
export const CROSS_ROUND_REPEAT_RAW_RECEIPT_VERSION =
  "cross-round-v03-repeat-raw-receipt@0.2";
export const CROSS_ROUND_REPEAT_RUN_FILE_VERSION =
  "cross-round-v03-repeat-run@0.2";
export const CROSS_ROUND_REPEAT_REPORT_VERSION =
  "cross-round-v03-repeat-report@0.2";
export const CROSS_ROUND_REPEAT_K_PER_CASE = 20;
export const CROSS_ROUND_REPEAT_CONCURRENCY = 5;

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SOURCE_PATHS = [
  "scripts/run-cross-round-repeat-experiment.ts",
  "scripts/run-cross-round-fixture-canary.ts",
  "server/crossRoundInversion.ts",
  "server/ai.ts",
  "shared/substrate/crossRoundInversion.ts",
  "shared/substrate/fixtures.ts",
  "shared/substrate/hash.ts",
  "shared/substrate/index.ts",
  "shared/substrate/modelRef.ts",
  "shared/modelRegistry.ts",
  "shared/schema.ts",
  "package.json",
  "package-lock.json",
] as const;

export interface RepeatExperimentSourceLineage {
  repositoryRoot: string;
  capturedAt: string;
  gitCommitSha: string | null;
  gitTreeSha: string | null;
  gitCommitObjectType: string | null;
  gitDirty: boolean | null;
  gitStatusSha256: string | null;
  files: Array<{
    path: string;
    sha256: string;
    committedSha256: string | null;
    matchesCommittedBytes: boolean;
  }>;
  allSourceFilesMatchCommit: boolean;
  sourceSetHash: string;
  runtimeIdentity: {
    nodeVersion: string;
    v8Version: string;
    platform: NodeJS.Platform;
    architecture: string;
    execPath: string;
  };
  runtimeIdentityHash: string;
}

export interface RepeatExperimentJob {
  ordinal: number;
  repeat: number;
  caseId: FixtureCanaryCaseId;
  rawReceiptFile: string;
  runFile: string;
}

interface RepeatExperimentPreregistration {
  preregistrationVersion: typeof CROSS_ROUND_REPEAT_PREREGISTRATION_VERSION;
  experimentVersion: typeof CROSS_ROUND_REPEAT_EXPERIMENT_VERSION;
  registeredAt: string;
  status: "registered_before_provider_dispatch";
  treatmentMutation: "none";
  databaseAccess: "none";
  releaseBoundary: "not_a_release_boundary";
  fixedDesign: {
    kPerCase: typeof CROSS_ROUND_REPEAT_K_PER_CASE;
    caseCount: 3;
    scheduledCalls: 60;
    concurrency: typeof CROSS_ROUND_REPEAT_CONCURRENCY;
    retries: 0;
    replacementCalls: 0;
    samplingRegime: string;
  };
  instrument: {
    protocolVersion: typeof CROSS_ROUND_INVERSION_PROTOCOL_VERSION;
    policyId: typeof CROSS_ROUND_COLUMN_VETO_POLICY_ID;
    policyHash: typeof CROSS_ROUND_COLUMN_VETO_POLICY_HASH;
    auditorPromptHash: typeof CROSS_ROUND_AUDITOR_PROMPT_HASH;
    auditorBatchSize: typeof CROSS_ROUND_AUDITOR_BATCH_SIZE;
    substrateVersion: typeof SUBSTRATE_VERSION;
  };
  route: {
    provider: "openrouter";
    model: string;
    upstream: string;
    reasoningEffort: "xhigh";
    wireReasoningEffort: "max";
    allowFallbacks: false;
    physicalAttemptsPerJob: 1;
  };
  cases: Array<{
    id: FixtureCanaryCaseId;
    kind: FixtureCanaryDefinition["kind"];
    provenance: string;
    expectedOutcome: FixtureCanaryDefinition["expectedOutcome"];
  }>;
  jobs: RepeatExperimentJob[];
  estimands: {
    coPrimary: string[];
    mechanisticSecondary: string;
    otherIncidentCells: string[];
    secondary: string[];
    controlQualification: string;
  };
  decisionRule: {
    coPrimaryMetrics: [
      "red_intended_code_plausible_or_strong_credible_support",
      "blue_intended_code_plausible_or_strong_credible_support",
    ];
    mechanisticSecondaryMetric: "blue_turret_to_slot_1_actionable_history_edge";
    completeDataRequired: 20;
    lowBand: "0-4 of 20: systematic-omission candidate; design a new elicitation instrument";
    indeterminateBand: "5-13 of 20: indeterminate; do not redesign or release from this measurement";
    highBand: "14-20 of 20: high repeat support for the preregistered target";
    formalInference: "none";
  };
  missingDataRule: string;
  aggregationRule: string;
  sourceLineage: RepeatExperimentSourceLineage;
  fixtureInputHash: string;
  preregistrationContentHash: string;
}

export interface SanitizedExperimentError {
  name: string;
  message: string;
  code: string | null;
  providerMetadata: Record<string, unknown> | null;
}

export interface RepeatExperimentRunFile {
  runFileVersion: typeof CROSS_ROUND_REPEAT_RUN_FILE_VERSION;
  experimentVersion: typeof CROSS_ROUND_REPEAT_EXPERIMENT_VERSION;
  preregistrationContentHash: string;
  job: RepeatExperimentJob;
  status: "success" | "failure";
  failurePhase: "provider_or_route" | "parse_or_validation" | null;
  rawReceiptFile: string | null;
  rawReceiptContentHash: string | null;
  rawExecution: CrossRoundAuditorRawExecution | null;
  validatedRun: FixtureCanaryRunRecord | null;
  error: SanitizedExperimentError | null;
  runContentHash: string;
}

export interface RepeatExperimentRawReceipt {
  rawReceiptVersion: typeof CROSS_ROUND_REPEAT_RAW_RECEIPT_VERSION;
  experimentVersion: typeof CROSS_ROUND_REPEAT_EXPERIMENT_VERSION;
  preregistrationContentHash: string;
  job: RepeatExperimentJob;
  receivedAt: string;
  rawExecution: CrossRoundAuditorRawExecution;
  rawReceiptContentHash: string;
}

interface CellMetric {
  clue: string;
  intendedSlot: number;
  historyBearing: boolean;
  actionableCount: number;
  strongCount: number;
  validDraws: number;
  actionableRate: number | null;
  strongRate: number | null;
}

interface CaseSummary {
  planned: number;
  valid: number;
  failed: number;
  outcomes: Record<InversionVetoOutcome, number>;
  intendedCodeInCredibleSet: number;
  intendedCodeActionableSupport: number;
  cells: CellMetric[];
}

export type RepeatExperimentDecisionBand =
  | "suppressed_incomplete_arm"
  | "suppressed_integrity_failure"
  | "systematic_omission_candidate"
  | "indeterminate"
  | "high_repeat_recall";

export interface RepeatExperimentSummary {
  complete: boolean;
  validRuns: number;
  failedRuns: number;
  cases: Record<FixtureCanaryCaseId, CaseSummary>;
  coPrimaryBands: {
    qualification: string;
    redIntendedCodeActionableSupport: RepeatExperimentDecisionBand;
    blueIntendedCodeActionableSupport: RepeatExperimentDecisionBand;
  };
  blueTurretSlot1MechanisticSecondary: {
    qualification: string;
    band: RepeatExperimentDecisionBand;
  };
  controlStrongBridgeAssertion: {
    qualification: string;
    drawsWithAnyStrongCell: number;
    validDraws: number;
    rate: number | null;
    strongCellCounts: number[];
  };
  operations: {
    receivedRawExecutions: number;
    missingRawExecutions: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningTokens: number;
    costUsd: number;
    unknownCounts: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      reasoningTokens: number;
      costUsd: number;
      latencyMs: number;
    };
    latencyMs: {
      min: number | null;
      median: number | null;
      p95NearestRank: number | null;
      max: number | null;
    };
  };
}

export interface RepeatExperimentPostRunVerification {
  verifiedAt: string;
  sourceLineage: RepeatExperimentSourceLineage;
  matchesPreregisteredSource: boolean;
  mismatches: string[];
}

export interface RepeatExperimentReport {
  reportVersion: typeof CROSS_ROUND_REPEAT_REPORT_VERSION;
  experimentVersion: typeof CROSS_ROUND_REPEAT_EXPERIMENT_VERSION;
  generatedAt: string;
  status: "complete" | "incomplete";
  releaseBoundary: "not_a_release_boundary";
  preregistrationContentHash: string;
  runFiles: string[];
  runs: RepeatExperimentRunFile[];
  postRunVerification: RepeatExperimentPostRunVerification;
  summary: RepeatExperimentSummary;
  reportContentHash: string;
}

interface RepeatExperimentOptions {
  outputDir: string;
  rawExecutor?: typeof executeCrossRoundAuditorRaw;
  now?: () => Date;
  sourceLineage?: RepeatExperimentSourceLineage;
  postRunSourceLineage?: RepeatExperimentSourceLineage;
  writeArtifact?: typeof writeNoClobberJsonReport;
  /** Provider-free test seam used to prove persisted preregistration re-reading. */
  afterPreregistrationWritten?: (path: string) => Promise<void>;
  emitProgress?: (progress: {
    ordinal: number;
    caseId: FixtureCanaryCaseId;
    repeat: number;
    status: RepeatExperimentRunFile["status"];
    failurePhase: RepeatExperimentRunFile["failurePhase"];
  }) => void;
}

function isoNow(now?: () => Date): string {
  const value = (now?.() ?? new Date()).toISOString();
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error("repeat experiment timestamp is invalid");
  }
  return value;
}

function fixtureInputHash(definitions: FixtureCanaryDefinition[]): string {
  return contentHash(
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
}

function runFilename(job: Omit<RepeatExperimentJob, "runFile">): string {
  const ordinal = String(job.ordinal).padStart(4, "0");
  const repeat = String(job.repeat).padStart(2, "0");
  return `runs/${ordinal}-${job.caseId}-r${repeat}.json`;
}

function rawReceiptFilename(
  job: Omit<RepeatExperimentJob, "rawReceiptFile" | "runFile">,
): string {
  const ordinal = String(job.ordinal).padStart(4, "0");
  const repeat = String(job.repeat).padStart(2, "0");
  return `runs/${ordinal}-${job.caseId}-r${repeat}.raw.json`;
}

export function repeatExperimentJobs(
  definitions: FixtureCanaryDefinition[] = fixtureCanaryDefinitions(),
): RepeatExperimentJob[] {
  const jobs: RepeatExperimentJob[] = [];
  for (let repeat = 1; repeat <= CROSS_ROUND_REPEAT_K_PER_CASE; repeat += 1) {
    for (const definition of definitions) {
      const base = {
        ordinal: jobs.length + 1,
        repeat,
        caseId: definition.id,
      };
      const withReceipt = {
        ...base,
        rawReceiptFile: rawReceiptFilename(base),
      };
      jobs.push({ ...withReceipt, runFile: runFilename(withReceipt) });
    }
  }
  return jobs;
}

async function gitValue(args: string[]): Promise<string | null> {
  try {
    const result = await execFileAsync("git", args, {
      cwd: REPOSITORY_ROOT,
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout.trim();
  } catch {
    return null;
  }
}

async function gitFileAtHead(path: string): Promise<string | null> {
  try {
    const result = await execFileAsync("git", ["show", `HEAD:${path}`], {
      cwd: REPOSITORY_ROOT,
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout;
  } catch {
    return null;
  }
}

export async function collectRepeatExperimentSourceLineage(): Promise<RepeatExperimentSourceLineage> {
  const files = await Promise.all(
    SOURCE_PATHS.map(async (path) => {
      const bytes = await readFile(resolve(REPOSITORY_ROOT, path), "utf8");
      const committedBytes = await gitFileAtHead(path);
      const sha256 = sha256Hex(bytes);
      const committedSha256 =
        committedBytes === null ? null : sha256Hex(committedBytes);
      return {
        path,
        sha256,
        committedSha256,
        matchesCommittedBytes:
          committedSha256 !== null && committedSha256 === sha256,
      };
    }),
  );
  const gitCommitSha = await gitValue(["rev-parse", "HEAD"]);
  const gitTreeSha = await gitValue(["rev-parse", "HEAD^{tree}"]);
  const gitCommitObjectType = await gitValue(["cat-file", "-t", "HEAD"]);
  const gitStatus = await gitValue([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const runtimeIdentity = {
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    execPath: process.execPath,
  };
  return {
    repositoryRoot: REPOSITORY_ROOT,
    capturedAt: new Date().toISOString(),
    gitCommitSha:
      gitCommitSha && /^[0-9a-f]{40}$/i.test(gitCommitSha)
        ? gitCommitSha.toLowerCase()
        : null,
    gitTreeSha:
      gitTreeSha && /^[0-9a-f]{40}$/i.test(gitTreeSha)
        ? gitTreeSha.toLowerCase()
        : null,
    gitCommitObjectType,
    gitDirty: gitStatus === null ? null : gitStatus.length > 0,
    gitStatusSha256: gitStatus === null ? null : sha256Hex(gitStatus),
    files,
    allSourceFilesMatchCommit: files.every(
      (file) => file.matchesCommittedBytes,
    ),
    sourceSetHash: contentHash(files),
    runtimeIdentity,
    runtimeIdentityHash: contentHash(runtimeIdentity),
  };
}

export function assertImmutableRepeatExperimentSourceLineage(
  lineage: RepeatExperimentSourceLineage,
  label = "repeat experiment source lineage",
): void {
  if (
    !/^[0-9a-f]{40}$/.test(lineage.gitCommitSha ?? "") ||
    !/^[0-9a-f]{40}$/.test(lineage.gitTreeSha ?? "") ||
    lineage.gitCommitObjectType !== "commit" ||
    lineage.gitDirty !== false ||
    lineage.gitStatusSha256 !== sha256Hex("") ||
    !lineage.allSourceFilesMatchCommit ||
    lineage.files.length === 0 ||
    lineage.files.some(
      (file) =>
        !/^[0-9a-f]{64}$/.test(file.sha256) ||
        file.committedSha256 !== file.sha256 ||
        file.matchesCommittedBytes !== true,
    ) ||
    lineage.sourceSetHash !== contentHash(lineage.files) ||
    lineage.runtimeIdentityHash !== contentHash(lineage.runtimeIdentity)
  ) {
    throw new Error(
      `${label} must identify one clean, verified immutable commit and matching runtime source bytes`,
    );
  }
}

function compareSourceLineages(
  before: RepeatExperimentSourceLineage,
  after: RepeatExperimentSourceLineage,
): string[] {
  const comparisons: Array<[string, unknown, unknown]> = [
    ["gitCommitSha", before.gitCommitSha, after.gitCommitSha],
    ["gitTreeSha", before.gitTreeSha, after.gitTreeSha],
    ["sourceSetHash", before.sourceSetHash, after.sourceSetHash],
    [
      "runtimeIdentityHash",
      before.runtimeIdentityHash,
      after.runtimeIdentityHash,
    ],
  ];
  return comparisons
    .filter(([, expected, actual]) => expected !== actual)
    .map(([field]) => field);
}

async function prepareOutputDirectory(outputDir: string): Promise<string> {
  const absolute = resolve(outputDir);
  const parent = dirname(absolute);
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error("repeat experiment output parent must be a real directory");
  }
  if (resolve(await realpath(parent)) !== resolve(parent)) {
    throw new Error(
      "repeat experiment output parent must not traverse a symbolic link",
    );
  }
  await mkdir(absolute, { mode: 0o700 });
  await chmod(absolute, 0o700);
  const outputStat = await lstat(absolute);
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
    throw new Error("repeat experiment output must be a real directory");
  }
  const runsDir = resolve(absolute, "runs");
  await mkdir(runsDir, { mode: 0o700 });
  await chmod(runsDir, 0o700);
  return absolute;
}

function withPreregistrationHash(
  input: Omit<RepeatExperimentPreregistration, "preregistrationContentHash">,
): RepeatExperimentPreregistration {
  return {
    ...input,
    preregistrationContentHash: contentHash(input),
  };
}

function withRawReceiptHash(
  input: Omit<RepeatExperimentRawReceipt, "rawReceiptContentHash">,
): RepeatExperimentRawReceipt {
  return {
    ...input,
    rawReceiptContentHash: contentHash(input),
  };
}

function withRunHash(
  input: Omit<RepeatExperimentRunFile, "runContentHash">,
): RepeatExperimentRunFile {
  return {
    ...input,
    runContentHash: contentHash(input),
  };
}

async function readAndValidatePersistedPreregistration(
  path: string,
  expected: RepeatExperimentPreregistration,
): Promise<RepeatExperimentPreregistration> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Persisted repeat preregistration could not be read as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Persisted repeat preregistration is not an object");
  }
  const record = parsed as Record<string, unknown>;
  const claimedHash = record.preregistrationContentHash;
  const withoutHash = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== "preregistrationContentHash",
    ),
  );
  if (
    typeof claimedHash !== "string" ||
    claimedHash !== contentHash(withoutHash)
  ) {
    throw new Error("Persisted repeat preregistration self-hash mismatch");
  }
  if (
    claimedHash !== expected.preregistrationContentHash ||
    contentHash(record) !== contentHash(expected)
  ) {
    throw new Error(
      "Persisted repeat preregistration differs from the fixed in-memory design",
    );
  }
  return parsed as RepeatExperimentPreregistration;
}

function providerMetadataFromError(
  error: unknown,
): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  const raw = (error as { providerMetadata?: unknown }).providerMetadata;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const safeKeys = [
    "apiHost",
    "requestedModel",
    "requestedUpstream",
    "physicalAttempt",
    "requestedReasoningEffort",
    "wireReasoningEffort",
    "reasoningDisabled",
    "routing",
    "httpStatus",
    "finishReason",
    "servedModel",
    "upstreamProvider",
    "requestId",
    "generationId",
    "usage",
    "openrouterMetadata",
  ];
  return Object.fromEntries(
    safeKeys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

function redactErrorMessage(message: string): string {
  return message
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_CREDENTIAL]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 1_000);
}

function sanitizeError(error: unknown): SanitizedExperimentError {
  const value = error instanceof Error ? error : new Error(String(error));
  const code =
    typeof (value as Error & { code?: unknown }).code === "string"
      ? ((value as Error & { code: string }).code ?? null)
      : null;
  return {
    name: value.name,
    message: redactErrorMessage(value.message),
    code,
    providerMetadata: providerMetadataFromError(error),
  };
}

function definitionById(
  definitions: FixtureCanaryDefinition[],
  caseId: FixtureCanaryCaseId,
): FixtureCanaryDefinition {
  const definition = definitions.find((candidate) => candidate.id === caseId);
  if (!definition) throw new Error(`unknown repeat fixture ${caseId}`);
  return definition;
}

async function executeJob(input: {
  job: RepeatExperimentJob;
  definition: FixtureCanaryDefinition;
  rawExecutor: typeof executeCrossRoundAuditorRaw;
  preregistrationContentHash: string;
  persistRawReceipt: (
    job: RepeatExperimentJob,
    rawExecution: CrossRoundAuditorRawExecution,
  ) => Promise<string>;
}): Promise<RepeatExperimentRunFile> {
  let rawExecution: CrossRoundAuditorRawExecution | undefined;
  let providerError: unknown;
  try {
    rawExecution = await input.rawExecutor(
      input.definition.ledger,
      input.definition.clues,
    );
  } catch (error) {
    rawExecution = crossRoundRawExecutionFromError(error);
    providerError = error;
    if (!rawExecution) {
      return withRunHash({
        runFileVersion: CROSS_ROUND_REPEAT_RUN_FILE_VERSION,
        experimentVersion: CROSS_ROUND_REPEAT_EXPERIMENT_VERSION,
        preregistrationContentHash: input.preregistrationContentHash,
        job: input.job,
        status: "failure",
        failurePhase: "provider_or_route",
        rawReceiptFile: null,
        rawReceiptContentHash: null,
        rawExecution: null,
        validatedRun: null,
        error: sanitizeError(error),
      });
    }
  }

  // Publish the raw receipt before parsing, route projection, evaluation, or
  // final run-file construction can fail. Strict-route validation failures
  // arrive here via the error receipt above and remain invalid draws.
  const rawReceiptContentHash = await input.persistRawReceipt(
    input.job,
    rawExecution,
  );

  if (providerError) {
    return withRunHash({
      runFileVersion: CROSS_ROUND_REPEAT_RUN_FILE_VERSION,
      experimentVersion: CROSS_ROUND_REPEAT_EXPERIMENT_VERSION,
      preregistrationContentHash: input.preregistrationContentHash,
      job: input.job,
      status: "failure",
      failurePhase: "provider_or_route",
      rawReceiptFile: input.job.rawReceiptFile,
      rawReceiptContentHash,
      rawExecution,
      validatedRun: null,
      error: sanitizeError(providerError),
    });
  }

  try {
    const parsed = crossRoundInversionRunFromRawExecution(
      rawExecution,
      input.definition.ledger,
      input.definition.clues,
    );
    const validatedRun = await runFixtureCanaryCase({
      repeat: input.job.repeat,
      definition: input.definition,
      auditor: async () => parsed,
      logBoundaryMisses: false,
    });
    return withRunHash({
      runFileVersion: CROSS_ROUND_REPEAT_RUN_FILE_VERSION,
      experimentVersion: CROSS_ROUND_REPEAT_EXPERIMENT_VERSION,
      preregistrationContentHash: input.preregistrationContentHash,
      job: input.job,
      status: "success",
      failurePhase: null,
      rawReceiptFile: input.job.rawReceiptFile,
      rawReceiptContentHash,
      rawExecution,
      validatedRun,
      error: null,
    });
  } catch (error) {
    return withRunHash({
      runFileVersion: CROSS_ROUND_REPEAT_RUN_FILE_VERSION,
      experimentVersion: CROSS_ROUND_REPEAT_EXPERIMENT_VERSION,
      preregistrationContentHash: input.preregistrationContentHash,
      job: input.job,
      status: "failure",
      failurePhase: "parse_or_validation",
      rawReceiptFile: input.job.rawReceiptFile,
      rawReceiptContentHash,
      rawExecution,
      validatedRun: null,
      error: sanitizeError(error),
    });
  }
}

function rate(count: number, denominator: number): number | null {
  return denominator === 0 ? null : count / denominator;
}

function quantileNearestRank(values: number[], probability: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(ordered.length - 1, Math.ceil(probability * ordered.length) - 1),
  );
  return ordered[index]!;
}

function caseSummary(
  caseId: FixtureCanaryCaseId,
  runs: RepeatExperimentRunFile[],
  definition: FixtureCanaryDefinition,
): CaseSummary {
  const selected = runs.filter((run) => run.job.caseId === caseId);
  const valid = selected
    .map((run) => run.validatedRun)
    .filter((run): run is FixtureCanaryRunRecord => run !== null);
  const outcomes: Record<InversionVetoOutcome, number> = {
    pass: 0,
    soft_regenerate_once: 0,
    hard_veto: 0,
  };
  for (const run of valid) outcomes[run.audit.evaluation.outcome] += 1;
  const cells = definition.clues.map((clue, index): CellMetric => {
    const intendedSlot = definition.intendedCode[index]!;
    const positions = valid.map(
      (run) => run.audit.evaluation.positions[index]!,
    );
    const actionableCount = positions.filter(
      (position) => position.intendedHistoryEdge,
    ).length;
    const strongCount = positions.filter(
      (position) => position.intendedStrongHistoryEdge,
    ).length;
    return {
      clue,
      intendedSlot,
      historyBearing: positions[0]?.columnHadHistory ?? false,
      actionableCount,
      strongCount,
      validDraws: valid.length,
      actionableRate: rate(actionableCount, valid.length),
      strongRate: rate(strongCount, valid.length),
    };
  });
  return {
    planned: selected.length,
    valid: valid.length,
    failed: selected.length - valid.length,
    outcomes,
    intendedCodeInCredibleSet: valid.filter(
      (run) => run.audit.evaluation.intendedSupport !== null,
    ).length,
    intendedCodeActionableSupport: valid.filter((run) => {
      const support = run.audit.evaluation.intendedSupport;
      return support === "plausible" || support === "strong";
    }).length,
    cells,
  };
}

export function summarizeRepeatExperiment(
  runs: RepeatExperimentRunFile[],
  definitions: FixtureCanaryDefinition[] = fixtureCanaryDefinitions(),
  options: { integrityValid?: boolean } = {},
): RepeatExperimentSummary {
  const cases = Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      caseSummary(definition.id, runs, definition),
    ]),
  ) as Record<FixtureCanaryCaseId, CaseSummary>;
  const complete = definitions.every(
    (definition) =>
      cases[definition.id].planned === CROSS_ROUND_REPEAT_K_PER_CASE &&
      cases[definition.id].valid === CROSS_ROUND_REPEAT_K_PER_CASE,
  );
  const integrityValid = options.integrityValid ?? true;
  const band = (
    count: number,
    arm: CaseSummary,
  ): RepeatExperimentDecisionBand => {
    if (!integrityValid) return "suppressed_integrity_failure";
    if (
      arm.planned !== CROSS_ROUND_REPEAT_K_PER_CASE ||
      arm.valid !== CROSS_ROUND_REPEAT_K_PER_CASE
    ) {
      return "suppressed_incomplete_arm";
    }
    if (count <= 4) return "systematic_omission_candidate";
    if (count >= 14) return "high_repeat_recall";
    return "indeterminate";
  };
  const red = cases["red-production-incident-2026-08-01"];
  const blue = cases["blue-production-incident-2026-08-01"];
  const turret = blue.cells.find(
    (cell) => cell.clue === "turret" && cell.intendedSlot === 1,
  );
  const turretBand =
    turret === undefined
      ? "suppressed_incomplete_arm"
      : band(turret.actionableCount, blue);

  const controlRuns = runs
    .filter((run) => run.job.caseId === "synthetic-opaque-negative-control")
    .map((run) => run.validatedRun)
    .filter((run): run is FixtureCanaryRunRecord => run !== null);
  const strongCellCounts = controlRuns.map((run) =>
    run.audit.historyMatches.reduce(
      (count, audit) =>
        count +
        audit.historyMatches.filter((match) => match.strength === "strong")
          .length,
      0,
    ),
  );
  const drawsWithAnyStrongCell = strongCellCounts.filter(
    (count) => count > 0,
  ).length;

  const successful = runs
    .map((run) => run.validatedRun)
    .filter((run): run is FixtureCanaryRunRecord => run !== null);
  const receivedRawExecutions = runs
    .map((run) => run.rawExecution)
    .filter(
      (raw): raw is CrossRoundAuditorRawExecution => raw !== null,
    );
  const measured = (
    selector: (raw: CrossRoundAuditorRawExecution) => unknown,
  ): { total: number; unknown: number; values: number[] } => {
    const values: number[] = [];
    let unknown = 0;
    for (const raw of receivedRawExecutions) {
      const value = selector(raw);
      if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0
      ) {
        values.push(value);
      } else {
        unknown += 1;
      }
    }
    return {
      total: values.reduce((total, value) => total + value, 0),
      unknown,
      values,
    };
  };
  const promptTokens = measured((raw) => raw.usage.promptTokens);
  const completionTokens = measured((raw) => raw.usage.completionTokens);
  const totalTokens = measured((raw) => raw.usage.totalTokens);
  const reasoningTokens = measured((raw) => raw.usage.reasoningTokens);
  const costUsd = measured((raw) => raw.usage.effectiveCostUsd);
  const latencyMs = measured((raw) => raw.usage.latencyMs);

  return {
    complete,
    validRuns: successful.length,
    failedRuns: runs.length - successful.length,
    cases,
    coPrimaryBands: {
      qualification:
        "Independent descriptive bands for whole-code plausible-or-strong credible-set support on the two human-ground-truthed intercepted incident arms. They are not formal inference or a release boundary.",
      redIntendedCodeActionableSupport: band(
        red.intendedCodeActionableSupport,
        red,
      ),
      blueIntendedCodeActionableSupport: band(
        blue.intendedCodeActionableSupport,
        blue,
      ),
    },
    blueTurretSlot1MechanisticSecondary: {
      qualification:
        "Mechanistic clue-to-column recall diagnostic only. The observed human fact grounds the whole code [4,1,3], not a specific turret-to-slot attribution.",
      band: turretBand,
    },
    controlStrongBridgeAssertion: {
      qualification:
        "Strong-cell assertion frequency on one post-incident hand-authored shaped input. It is not a false-positive rate, a safe-play estimate, or calibration.",
      drawsWithAnyStrongCell,
      validDraws: controlRuns.length,
      rate: rate(drawsWithAnyStrongCell, controlRuns.length),
      strongCellCounts,
    },
    operations: {
      receivedRawExecutions: receivedRawExecutions.length,
      missingRawExecutions: runs.length - receivedRawExecutions.length,
      promptTokens: promptTokens.total,
      completionTokens: completionTokens.total,
      totalTokens: totalTokens.total,
      reasoningTokens: reasoningTokens.total,
      costUsd: costUsd.total,
      unknownCounts: {
        promptTokens: promptTokens.unknown,
        completionTokens: completionTokens.unknown,
        totalTokens: totalTokens.unknown,
        reasoningTokens: reasoningTokens.unknown,
        costUsd: costUsd.unknown,
        latencyMs: latencyMs.unknown,
      },
      latencyMs: {
        min:
          latencyMs.values.length > 0
            ? Math.min(...latencyMs.values)
            : null,
        median: quantileNearestRank(latencyMs.values, 0.5),
        p95NearestRank: quantileNearestRank(latencyMs.values, 0.95),
        max:
          latencyMs.values.length > 0
            ? Math.max(...latencyMs.values)
            : null,
      },
    },
  };
}

function withReportHash(
  input: Omit<RepeatExperimentReport, "reportContentHash">,
): RepeatExperimentReport {
  return { ...input, reportContentHash: contentHash(input) };
}

export function assertFixedRepeatExperimentDesign(
  definitions: FixtureCanaryDefinition[],
  jobs: RepeatExperimentJob[],
): void {
  const expectedCases: FixtureCanaryCaseId[] = [
    "red-production-incident-2026-08-01",
    "blue-production-incident-2026-08-01",
    "synthetic-opaque-negative-control",
  ];
  if (
    definitions.length !== 3 ||
    definitions.some(
      (definition, index) => definition.id !== expectedCases[index],
    ) ||
    jobs.length !== 60 ||
    expectedCases.some(
      (caseId) =>
        jobs.filter((job) => job.caseId === caseId).length !==
        CROSS_ROUND_REPEAT_K_PER_CASE,
    ) ||
    jobs.some(
      (job, index) =>
        job.ordinal !== index + 1 ||
        job.repeat !== Math.floor(index / 3) + 1 ||
        job.caseId !== expectedCases[index % 3],
    )
  ) {
    throw new Error(
      "repeat experiment runtime design must be exactly three fixed cases and sixty preregistered jobs",
    );
  }
}

export async function runCrossRoundRepeatExperiment(
  options: RepeatExperimentOptions,
): Promise<RepeatExperimentReport> {
  const definitions = fixtureCanaryDefinitions();
  const jobs = repeatExperimentJobs(definitions);
  assertFixedRepeatExperimentDesign(definitions, jobs);
  const sourceLineage =
    options.sourceLineage ?? (await collectRepeatExperimentSourceLineage());
  assertImmutableRepeatExperimentSourceLineage(sourceLineage);
  const outputDir = await prepareOutputDirectory(options.outputDir);
  const preregistration = withPreregistrationHash({
    preregistrationVersion: CROSS_ROUND_REPEAT_PREREGISTRATION_VERSION,
    experimentVersion: CROSS_ROUND_REPEAT_EXPERIMENT_VERSION,
    registeredAt: isoNow(options.now),
    status: "registered_before_provider_dispatch",
    treatmentMutation: "none",
    databaseAccess: "none",
    releaseBoundary: "not_a_release_boundary",
    fixedDesign: {
      kPerCase: CROSS_ROUND_REPEAT_K_PER_CASE,
      caseCount: definitions.length as 3,
      scheduledCalls: jobs.length as 60,
      concurrency: CROSS_ROUND_REPEAT_CONCURRENCY,
      retries: 0,
      replacementCalls: 0,
      samplingRegime:
        "Twenty repeated provider draws of each byte-identical fixture prompt against one exact dated model/upstream. Draws may be correlated; no iid claim or binomial p-value is made.",
    },
    instrument: {
      protocolVersion: CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
      policyId: CROSS_ROUND_COLUMN_VETO_POLICY_ID,
      policyHash: CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
      auditorPromptHash: CROSS_ROUND_AUDITOR_PROMPT_HASH,
      auditorBatchSize: CROSS_ROUND_AUDITOR_BATCH_SIZE,
      substrateVersion: SUBSTRATE_VERSION,
    },
    route: {
      provider: "openrouter",
      model: DEEPSEEK_V4_FLASH_CANONICAL.model,
      upstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream ?? "deepinfra",
      reasoningEffort: "xhigh",
      wireReasoningEffort: "max",
      allowFallbacks: false,
      physicalAttemptsPerJob: 1,
    },
    cases: definitions.map((definition) => ({
      id: definition.id,
      kind: definition.kind,
      provenance: definition.provenance,
      expectedOutcome: definition.expectedOutcome,
    })),
    jobs,
    estimands: {
      coPrimary: [
        "Red intended whole code [1,3,4] appears in the credible set at plausible-or-strong support. Humans successfully intercepted this whole code in the observed incident round.",
        "Blue intended whole code [4,1,3] appears in the credible set at plausible-or-strong support. Humans successfully intercepted this whole code in the observed incident round.",
      ],
      mechanisticSecondary:
        "Blue turret -> intended slot 1 actionable history-edge recall. This diagnoses one plausible failure mechanism but is not itself the human-ground-truthed incident outcome.",
      otherIncidentCells: [
        "Red blast->1, orange->3, ascent->4 actionable and strong counts, reported separately",
        "Blue nebula->3 actionable and strong counts; treetop->4 is excluded from recall because slot 4 has no history",
      ],
      secondary: [
        "intended-code credible-set membership by fixture",
        "intended-code plausible-or-strong membership by fixture",
        "hard/soft/pass outcome counts by fixture",
        "strong-cell assertion frequency and count distribution on the shaped control",
        "exact-route validity, failure classes, tokens, cost, and latency",
      ],
      controlQualification:
        "The control is post-incident, hand-authored, and not human-adjudicated safe play. It can measure this model's bridge assertions on this shaped input only; it is not a false-positive estimate or calibration set.",
    },
    decisionRule: {
      coPrimaryMetrics: [
        "red_intended_code_plausible_or_strong_credible_support",
        "blue_intended_code_plausible_or_strong_credible_support",
      ],
      mechanisticSecondaryMetric:
        "blue_turret_to_slot_1_actionable_history_edge",
      completeDataRequired: 20,
      lowBand:
        "0-4 of 20: systematic-omission candidate; design a new elicitation instrument",
      indeterminateBand:
        "5-13 of 20: indeterminate; do not redesign or release from this measurement",
      highBand:
        "14-20 of 20: high repeat support for the preregistered target",
      formalInference: "none",
    },
    missingDataRule:
      "The report is globally incomplete after any provider, route, parse, or evaluation failure. Each incident arm's descriptive band is suppressed only by missing data in that arm (or by a global source-integrity failure), so a Red/control failure cannot erase a complete Blue measurement and vice versa. Failed jobs are retained, never counted as model misses, never retried, and never replaced.",
    aggregationRule:
      "Measurement only. Do not union evidence or code hypotheses across draws, do not mint a cross-draw gate, and do not use this shaped control to tune one. Any aggregation is a new instrument requiring separate held-out and human-adjudicated calibration.",
    sourceLineage,
    fixtureInputHash: fixtureInputHash(definitions),
  });

  // This durable write and verified re-read are the ordering boundary: no raw
  // executor is invoked before the exact preregistration is on disk.
  const writeArtifact = options.writeArtifact ?? writeNoClobberJsonReport;
  const preregistrationPath = resolve(outputDir, "preregistration.json");
  await writeArtifact(
    preregistrationPath,
    preregistration,
    "Repeat experiment preregistration",
  );
  await options.afterPreregistrationWritten?.(preregistrationPath);
  const persistedPreregistration =
    await readAndValidatePersistedPreregistration(
      preregistrationPath,
      preregistration,
    );

  const rawExecutor = options.rawExecutor ?? executeCrossRoundAuditorRaw;
  const results = new Array<RepeatExperimentRunFile>(jobs.length);
  let cursor = 0;
  let stopDispatch = false;
  let persistenceFailure: unknown = null;
  const persistRawReceipt = async (
    job: RepeatExperimentJob,
    rawExecution: CrossRoundAuditorRawExecution,
  ): Promise<string> => {
    const receipt = withRawReceiptHash({
      rawReceiptVersion: CROSS_ROUND_REPEAT_RAW_RECEIPT_VERSION,
      experimentVersion: CROSS_ROUND_REPEAT_EXPERIMENT_VERSION,
      preregistrationContentHash:
        persistedPreregistration.preregistrationContentHash,
      job,
      receivedAt: isoNow(options.now),
      rawExecution,
    });
    await writeArtifact(
      resolve(outputDir, job.rawReceiptFile),
      receipt,
      "Repeat experiment raw receipt",
    );
    return receipt.rawReceiptContentHash;
  };
  const worker = async () => {
    while (true) {
      if (stopDispatch) return;
      const index = cursor;
      if (index >= jobs.length) return;
      cursor += 1;
      const job = jobs[index]!;
      const definition = definitionById(definitions, job.caseId);
      try {
        const run = await executeJob({
          job,
          definition,
          rawExecutor,
          preregistrationContentHash:
            persistedPreregistration.preregistrationContentHash,
          persistRawReceipt,
        });
        await writeArtifact(
          resolve(outputDir, job.runFile),
          run,
          "Repeat experiment run",
        );
        results[index] = run;
        const progress = {
          ordinal: job.ordinal,
          caseId: job.caseId,
          repeat: job.repeat,
          status: run.status,
          failurePhase: run.failurePhase,
        };
        if (options.emitProgress) {
          options.emitProgress(progress);
        } else {
          process.stdout.write(`${JSON.stringify(progress)}\n`);
        }
      } catch (error) {
        // A raw receipt or final run file that cannot be published is a
        // durability failure, not a model result. Stop assigning new work at
        // the first observed failure; Promise.all below still awaits every
        // already-in-flight provider call and its attempted persistence.
        stopDispatch = true;
        persistenceFailure ??= error;
        return;
      }
    }
  };
  await Promise.all(
    Array.from({ length: CROSS_ROUND_REPEAT_CONCURRENCY }, () => worker()),
  );

  if (persistenceFailure) {
    const error = new Error(
      `repeat experiment stopped after durable artifact persistence failed; ${results.filter(Boolean).length} final run files were published and no failed job was retried or replaced`,
    );
    Object.assign(error, { cause: persistenceFailure });
    throw error;
  }
  if (results.some((run) => run === undefined)) {
    throw new Error("repeat experiment worker pool left an unscheduled job");
  }
  const ordered = results as RepeatExperimentRunFile[];
  const postRunSourceLineage =
    options.postRunSourceLineage ??
    (options.sourceLineage
      ? sourceLineage
      : await collectRepeatExperimentSourceLineage());
  const mismatches = compareSourceLineages(
    sourceLineage,
    postRunSourceLineage,
  );
  try {
    assertImmutableRepeatExperimentSourceLineage(
      postRunSourceLineage,
      "post-run repeat experiment source lineage",
    );
  } catch {
    mismatches.push("postRunImmutableCommitVerification");
  }
  const uniqueMismatches = [...new Set(mismatches)];
  const postRunVerification: RepeatExperimentPostRunVerification = {
    verifiedAt: isoNow(options.now),
    sourceLineage: postRunSourceLineage,
    matchesPreregisteredSource: uniqueMismatches.length === 0,
    mismatches: uniqueMismatches,
  };
  const summary = summarizeRepeatExperiment(ordered, definitions, {
    integrityValid: postRunVerification.matchesPreregisteredSource,
  });
  const report = withReportHash({
    reportVersion: CROSS_ROUND_REPEAT_REPORT_VERSION,
    experimentVersion: CROSS_ROUND_REPEAT_EXPERIMENT_VERSION,
    generatedAt: isoNow(options.now),
    status:
      summary.complete && postRunVerification.matchesPreregisteredSource
        ? "complete"
        : "incomplete",
    releaseBoundary: "not_a_release_boundary",
    preregistrationContentHash:
      persistedPreregistration.preregistrationContentHash,
    runFiles: jobs.map((job) => job.runFile),
    runs: ordered,
    postRunVerification,
    summary,
  });
  await writeArtifact(
    resolve(outputDir, "report.json"),
    report,
    "Repeat experiment report",
  );
  return report;
}

interface CliOptions {
  outputDir: string;
}

export function parseRepeatExperimentArgs(args: string[]): CliOptions {
  if (args.length !== 2 || args[0] !== "--output-dir" || !args[1]) {
    throw new Error(
      "usage: run-cross-round-repeat-experiment.ts --output-dir <new-directory>",
    );
  }
  if (args[1].startsWith("--")) {
    throw new Error("--output-dir requires a directory path");
  }
  return { outputDir: resolve(args[1]) };
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }
  const options = parseRepeatExperimentArgs(process.argv.slice(2));
  const report = await runCrossRoundRepeatExperiment(options);
  process.stdout.write(
    `${JSON.stringify({
      outputDir: options.outputDir,
      status: report.status,
      reportContentHash: report.reportContentHash,
      validRuns: report.summary.validRuns,
      failedRuns: report.summary.failedRuns,
      redWholeCodeBand:
        report.summary.coPrimaryBands.redIntendedCodeActionableSupport,
      blueWholeCodeBand:
        report.summary.coPrimaryBands.blueIntendedCodeActionableSupport,
      releaseBoundary: report.releaseBoundary,
    })}\n`,
  );
  if (report.status !== "complete") process.exitCode = 1;
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
