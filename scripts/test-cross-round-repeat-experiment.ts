/**
 * Provider-free checks for the fixed 60-call v0.3 repeat measurement.
 */
import assert from "node:assert/strict";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  CROSS_ROUND_AUDITOR_BATCH_SIZE,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_AUDITOR_SYSTEM_PROMPT,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  DEEPSEEK_V4_FLASH_CANONICAL,
  contentHash,
  composeCrossRoundAuditorTask,
  publicLedgerClueCount,
  sha256Hex,
  type PublicClueLedger,
} from "../shared/substrate";
import {
  crossRoundInversionRunFromRawExecution,
  crossRoundRawExecutionFromError,
  executeCrossRoundAuditorRaw,
  type CrossRoundAuditorRawExecution,
} from "../server/crossRoundInversion";
import { getConfigForModel } from "../shared/modelRegistry";
import {
  fixtureCanaryDefinitions,
  writeNoClobberJsonReport,
} from "./run-cross-round-fixture-canary";
import {
  CROSS_ROUND_REPEAT_CONCURRENCY,
  CROSS_ROUND_REPEAT_K_PER_CASE,
  assertFixedRepeatExperimentDesign,
  assertImmutableRepeatExperimentSourceLineage,
  parseRepeatExperimentArgs,
  repeatExperimentJobs,
  runCrossRoundRepeatExperiment,
  summarizeRepeatExperiment,
  type RepeatExperimentRunFile,
  type RepeatExperimentSourceLineage,
} from "./run-cross-round-repeat-experiment";

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
      `${message}: unexpected error "${normalized}"`,
    );
    return;
  }
  assert.fail(`${message}: expected rejection`);
}

const RUNTIME_IDENTITY: RepeatExperimentSourceLineage["runtimeIdentity"] = {
  nodeVersion: process.version,
  v8Version: process.versions.v8,
  platform: process.platform,
  architecture: process.arch,
  execPath: process.execPath,
};
const SOURCE_FILE = {
  path: "scripts/run-cross-round-repeat-experiment.ts",
  sha256: "b".repeat(64),
  committedSha256: "b".repeat(64),
  matchesCommittedBytes: true,
};
const SOURCE_LINEAGE: RepeatExperimentSourceLineage = {
  repositoryRoot: "/fixture/repository",
  capturedAt: "2026-08-02T05:00:00.000Z",
  gitCommitSha: "a".repeat(40),
  gitTreeSha: "c".repeat(40),
  gitCommitObjectType: "commit",
  gitDirty: false,
  gitStatusSha256: sha256Hex(""),
  files: [SOURCE_FILE],
  allSourceFilesMatchCommit: true,
  sourceSetHash: contentHash([SOURCE_FILE]),
  runtimeIdentity: RUNTIME_IDENTITY,
  runtimeIdentityHash: contentHash(RUNTIME_IDENTITY),
};

function externalReply(
  ledger: PublicClueLedger,
  clues: readonly [string, string, string],
): string {
  const caseId =
    clues[0] === "blast"
      ? "red"
      : clues[0] === "treetop"
        ? "blue"
        : "control";
  const intended =
    caseId === "blue" ? ([4, 1, 3] as const) : ([1, 3, 4] as const);
  const control = caseId === "control";
  return JSON.stringify({
    historyMatches: clues.map((_, clueIndex) => ({
      clueIndex: clueIndex + 1,
      matches: [1, 2, 3, 4].map((slot) => {
        const column = ledger.find((candidate) => candidate.number === slot);
        const edge =
          !control &&
          slot === intended[clueIndex] &&
          (column?.clues.length ?? 0) > 0;
        return {
          slot,
          sharedReferent: edge ? `shared-parent-${clueIndex + 1}` : null,
          publicClue: edge ? column!.clues[0]! : null,
          strength: edge ? "strong" : "none",
        };
      }),
    })),
    codeHypotheses: [
      {
        code: intended,
        support: control ? "weak" : "strong",
        rationale: null,
      },
    ],
  });
}

function rawExecution(
  ledger: PublicClueLedger,
  clues: readonly [string, string, string],
  assistantText = externalReply(ledger, clues),
): CrossRoundAuditorRawExecution {
  const promptTokens = 100;
  const completionTokens = 60;
  const totalTokens = 160;
  const reasoningTokens = 47;
  const costUsd = 0.000019;
  const systemPrompt = CROSS_ROUND_AUDITOR_SYSTEM_PROMPT;
  const taskPrompt = composeCrossRoundAuditorTask(ledger, clues);
  return {
    protocolVersion: CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
    policyId: CROSS_ROUND_COLUMN_VETO_POLICY_ID,
    policyHash: CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
    auditorPromptHash: CROSS_ROUND_AUDITOR_PROMPT_HASH,
    auditorBatchSize: CROSS_ROUND_AUDITOR_BATCH_SIZE,
    startedAt: "2026-08-02T05:00:00.000Z",
    completedAt: "2026-08-02T05:00:00.012Z",
    ledgerClueCount: publicLedgerClueCount(ledger),
    request: {
      systemPrompt,
      systemPromptSha256: sha256Hex(systemPrompt),
      taskPrompt,
      taskPromptSha256: sha256Hex(taskPrompt),
    },
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
      upstreamProvider: "DeepInfra",
      openrouterMetadata: {
        attempt: 1,
        strategy: "single",
        attempts: [{ provider: "DeepInfra", status: 200 }],
        endpoints: {
          available: [{ provider: "DeepInfra", selected: true }],
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
      reasoningTokens,
      estimatedCostUsd: "0.000019000",
      providerReportedCostUsd: costUsd,
      effectiveCostUsd: costUsd,
      costSource: "provider_reported",
      latencyMs: 12,
    },
    assistant: {
      text: assistantText,
      textSha256: sha256Hex(assistantText),
      hiddenReasoningStored: false,
    },
  };
}

async function realTemporaryParent(): Promise<string> {
  return realpath(
    await mkdtemp(join(tmpdir(), "cross-round-repeat-experiment-test-")),
  );
}

function testFixedJobMatrixAndArgs(): void {
  const jobs = repeatExperimentJobs();
  equal(jobs.length, 60, "fixed matrix schedules exactly 60 calls");
  equal(
    CROSS_ROUND_REPEAT_K_PER_CASE,
    20,
    "k per case is fixed at twenty",
  );
  equal(CROSS_ROUND_REPEAT_CONCURRENCY, 5, "concurrency is fixed at five");
  deepEqual(
    jobs.slice(0, 4).map((job) => [job.ordinal, job.repeat, job.caseId]),
    [
      [1, 1, "red-production-incident-2026-08-01"],
      [2, 1, "blue-production-incident-2026-08-01"],
      [3, 1, "synthetic-opaque-negative-control"],
      [4, 2, "red-production-incident-2026-08-01"],
    ],
    "job order is repeat-major and deterministic",
  );
  ok(
    jobs[59]!.runFile.startsWith(
      "runs/0060-synthetic-opaque-negative-control-r20",
    ),
    "last run filename binds ordinal, case, and repeat",
  );
  ok(
    parseRepeatExperimentArgs(["--output-dir", "./evidence"]).outputDir.endsWith(
      "/evidence",
    ),
    "CLI accepts only an explicit output directory",
  );
  assert.throws(
    () => parseRepeatExperimentArgs(["--repeat", "3"]),
    /usage:/,
  );
  assertions += 1;
}

async function testCompleteConcurrentMeasurement(): Promise<
  RepeatExperimentRunFile[]
> {
  const parent = await realTemporaryParent();
  const outputDir = resolve(parent, "complete");
  let calls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let preregistrationObservedBeforeFirstCall = false;
  let releaseFirstWave: (() => void) | null = null;
  const firstWave = new Promise<void>((resolveFirst) => {
    releaseFirstWave = resolveFirst;
  });
  try {
    const report = await runCrossRoundRepeatExperiment({
      outputDir,
      sourceLineage: SOURCE_LINEAGE,
      now: () => new Date("2026-08-02T05:00:00.000Z"),
      emitProgress: () => undefined,
      rawExecutor: async (ledger, clues) => {
        calls += 1;
        if (calls === 1) {
          preregistrationObservedBeforeFirstCall = (
            await lstat(resolve(outputDir, "preregistration.json"))
          ).isFile();
        }
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (calls <= 5) {
          if (inFlight === 5) releaseFirstWave?.();
          await firstWave;
        }
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, (calls % 3) + 1),
        );
        inFlight -= 1;
        return rawExecution(ledger, clues);
      },
    });

    equal(calls, 60, "complete experiment makes exactly sixty calls");
    equal(maxInFlight, 5, "worker pool reaches but never exceeds five calls");
    ok(
      preregistrationObservedBeforeFirstCall,
      "preregistration exists before first provider dispatch",
    );
    equal(report.status, "complete", "all valid runs complete the measurement");
    equal(report.summary.validRuns, 60, "all sixty runs validate");
    equal(report.summary.failedRuns, 0, "no failures are invented");
    equal(
      report.summary.coPrimaryBands.redIntendedCodeActionableSupport,
      "high_repeat_recall",
      "20/20 Red whole-code support reaches the preregistered high band",
    );
    equal(
      report.summary.coPrimaryBands.blueIntendedCodeActionableSupport,
      "high_repeat_recall",
      "20/20 Blue whole-code support reaches the preregistered high band",
    );
    equal(
      report.summary.blueTurretSlot1MechanisticSecondary.band,
      "high_repeat_recall",
      "20/20 turret recall remains a mechanistic secondary high band",
    );
    equal(
      report.summary.cases["blue-production-incident-2026-08-01"].cells[1]!
        .actionableCount,
      20,
      "Blue turret-to-slot-1 actionable recall is counted per draw",
    );
    equal(
      report.summary.controlStrongBridgeAssertion.drawsWithAnyStrongCell,
      0,
      "control strong-cell assertion count is separate from incident recall",
    );
    deepEqual(
      report.runs.map((run) => run.job.ordinal),
      Array.from({ length: 60 }, (_, index) => index + 1),
      "report order is deterministic despite concurrent completion",
    );
    equal(
      report.reportContentHash,
      contentHash(
        Object.fromEntries(
          Object.entries(report).filter(
            ([key]) => key !== "reportContentHash",
          ),
        ),
      ),
      "report self-excluding content hash recomputes",
    );
    const preregistration = JSON.parse(
      await readFile(resolve(outputDir, "preregistration.json"), "utf8"),
    ) as Record<string, unknown>;
    const preregistrationHash =
      preregistration["preregistrationContentHash"];
    delete preregistration["preregistrationContentHash"];
    equal(
      preregistrationHash,
      contentHash(preregistration),
      "preregistration self-excluding content hash recomputes",
    );
    const runFiles = await readdir(resolve(outputDir, "runs"));
    equal(
      runFiles.length,
      120,
      "each completed call has an early raw receipt and final run file",
    );
    equal(
      (await lstat(resolve(outputDir, "report.json"))).mode & 0o777,
      0o600,
      "final report is owner-only",
    );
    equal(
      (await lstat(resolve(outputDir, "runs", runFiles[0]!))).mode & 0o777,
      0o600,
      "individual raw trace is owner-only",
    );
    equal(
      (await lstat(outputDir)).mode & 0o777,
      0o700,
      "experiment directory is owner-only",
    );
    const serialized = [
      await readFile(resolve(outputDir, "preregistration.json"), "utf8"),
      await readFile(resolve(outputDir, "report.json"), "utf8"),
    ].join("\n");
    ok(
      !/Authorization|Bearer\s|sk-[A-Za-z0-9]/i.test(serialized),
      "durable artifacts contain no credential/header material",
    );
    const firstRun = JSON.parse(
      await readFile(resolve(outputDir, report.runFiles[0]!), "utf8"),
    ) as Record<string, unknown>;
    const firstRunHash = firstRun.runContentHash;
    delete firstRun.runContentHash;
    equal(
      firstRunHash,
      contentHash(firstRun),
      "per-run self-excluding content hash recomputes",
    );
    equal(
      firstRun.preregistrationContentHash,
      report.preregistrationContentHash,
      "per-run record binds to the persisted preregistration",
    );
    const firstReceipt = JSON.parse(
      await readFile(
        resolve(outputDir, report.runs[0]!.job.rawReceiptFile),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const firstReceiptHash = firstReceipt.rawReceiptContentHash;
    delete firstReceipt.rawReceiptContentHash;
    equal(
      firstReceiptHash,
      contentHash(firstReceipt),
      "early raw receipt self-excluding content hash recomputes",
    );
    equal(
      report.runs[0]!.rawReceiptContentHash,
      firstReceiptHash,
      "final run record cryptographically binds its early raw receipt",
    );
    equal(
      firstReceipt.preregistrationContentHash,
      report.preregistrationContentHash,
      "early raw receipt binds to the persisted preregistration",
    );
    ok(
      report.postRunVerification.matchesPreregisteredSource,
      "post-run source and runtime identity verification is captured",
    );
    return report.runs;
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function testFailuresAreRetainedWithoutReplacement(): Promise<void> {
  const parent = await realTemporaryParent();
  const outputDir = resolve(parent, "incomplete");
  let calls = 0;
  try {
    const report = await runCrossRoundRepeatExperiment({
      outputDir,
      sourceLineage: SOURCE_LINEAGE,
      now: () => new Date("2026-08-02T05:10:00.000Z"),
      emitProgress: () => undefined,
      rawExecutor: async (ledger, clues) => {
        calls += 1;
        if (calls === 1) {
          const error = new Error(
            "provider failed with Bearer secret-token and sk-testcredential123456",
          ) as Error & { providerMetadata?: Record<string, unknown> };
          error.providerMetadata = {
            requestedModel: DEEPSEEK_V4_FLASH_CANONICAL.model,
            physicalAttempt: 1,
            authorization: "must-not-persist",
          };
          throw error;
        }
        if (calls === 2) {
          const malformed = rawExecution(ledger, clues, "not valid JSON");
          malformed.usage.promptTokens = undefined;
          return malformed;
        }
        if (calls === 3) {
          const received = rawExecution(
            ledger,
            clues,
            "route-invalid-visible-assistant-bytes",
          );
          received.providerMetadata = {
            ...received.providerMetadata,
            upstreamProvider: "UnexpectedProvider",
          };
          const error = new Error(
            "strict route validation rejected served provider",
          ) as Error & {
            providerMetadata?: Record<string, unknown>;
            rawExecution?: CrossRoundAuditorRawExecution;
          };
          error.providerMetadata = received.providerMetadata;
          error.rawExecution = received;
          throw error;
        }
        return rawExecution(ledger, clues);
      },
    });

    equal(calls, 60, "failures are neither retried nor replaced");
    equal(report.status, "incomplete", "any invalid run makes report incomplete");
    equal(report.summary.validRuns, 57, "only structurally valid runs count");
    equal(report.summary.failedRuns, 3, "all failure classes are retained");
    equal(
      report.summary.coPrimaryBands.redIntendedCodeActionableSupport,
      "suppressed_incomplete_arm",
      "Red band is suppressed by Red-arm missing data",
    );
    equal(
      report.summary.coPrimaryBands.blueIntendedCodeActionableSupport,
      "suppressed_incomplete_arm",
      "Blue band is suppressed by Blue-arm missing data",
    );
    equal(
      report.runs[0]!.failurePhase,
      "provider_or_route",
      "provider failure is classified",
    );
    equal(
      report.runs[0]!.rawExecution,
      null,
      "provider failure does not fabricate a raw response",
    );
    ok(
      report.runs[0]!.error!.message.includes("[REDACTED"),
      "credential-shaped text is redacted from failure records",
    );
    ok(
      !JSON.stringify(report.runs[0]!.error).includes("authorization"),
      "non-allowlisted provider metadata is discarded",
    );
    equal(
      report.runs[1]!.failurePhase,
      "parse_or_validation",
      "malformed response is classified at parser boundary",
    );
    equal(
      report.runs[1]!.rawExecution!.assistant.text,
      "not valid JSON",
      "malformed assistant bytes survive the parse failure",
    );
    const persisted = JSON.parse(
      await readFile(resolve(outputDir, report.runFiles[1]!), "utf8"),
    ) as { rawExecution: CrossRoundAuditorRawExecution };
    equal(
      persisted.rawExecution.assistant.textSha256,
      sha256Hex("not valid JSON"),
      "persisted malformed response carries its exact digest",
    );
    equal(
      report.runs[2]!.failurePhase,
      "provider_or_route",
      "strict route validation failure remains a provider-or-route failure",
    );
    equal(
      report.runs[2]!.rawExecution!.assistant.text,
      "route-invalid-visible-assistant-bytes",
      "route-invalid response preserves exact assistant bytes",
    );
    equal(
      report.runs[2]!.rawExecution!.providerMetadata!.upstreamProvider,
      "UnexpectedProvider",
      "route-invalid response preserves served-provider metadata",
    );
    equal(
      report.summary.operations.receivedRawExecutions,
      59,
      "operations include the malformed parse-failure response",
    );
    equal(
      report.summary.operations.promptTokens,
      5_800,
      "prompt-token total includes every received value without fabricating the unknown parse-failure value",
    );
    equal(
      report.summary.operations.unknownCounts.promptTokens,
      1,
      "unknown parse-failure prompt usage is reported explicitly",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function testExactRawHashValidationBeforeParse(): void {
  const definition = fixtureCanaryDefinitions()[0]!;
  const base = rawExecution(definition.ledger, definition.clues);

  const promptHashMismatch = structuredClone(base);
  promptHashMismatch.request.taskPromptSha256 = "0".repeat(64);
  assert.throws(
    () =>
      crossRoundInversionRunFromRawExecution(
        promptHashMismatch,
        definition.ledger,
        definition.clues,
      ),
    /prompt hash mismatch/,
  );
  assertions += 1;

  const substitutedPrompt = structuredClone(base);
  substitutedPrompt.request.taskPrompt = `${base.request.taskPrompt}\nchanged`;
  substitutedPrompt.request.taskPromptSha256 = sha256Hex(
    substitutedPrompt.request.taskPrompt,
  );
  assert.throws(
    () =>
      crossRoundInversionRunFromRawExecution(
        substitutedPrompt,
        definition.ledger,
        definition.clues,
      ),
    /prompt bytes mismatch/,
  );
  assertions += 1;

  const textHashMismatch = structuredClone(base);
  textHashMismatch.assistant.text = "not valid JSON";
  assert.throws(
    () =>
      crossRoundInversionRunFromRawExecution(
        textHashMismatch,
        definition.ledger,
        definition.clues,
      ),
    /assistant text hash mismatch/,
  );
  assertions += 1;

  const validHashMalformedJson = structuredClone(base);
  validHashMalformedJson.assistant.text = "not valid JSON";
  validHashMalformedJson.assistant.textSha256 = sha256Hex("not valid JSON");
  assert.throws(
    () =>
      crossRoundInversionRunFromRawExecution(
        validHashMalformedJson,
        definition.ledger,
        definition.clues,
      ),
    /JSON|parse/i,
  );
  assertions += 1;
}

async function testProviderValidationRetainsResponseReceipts(): Promise<void> {
  const definition = fixtureCanaryDefinitions()[0]!;
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousFetch = globalThis.fetch;
  const sentinel = "exact-visible-assistant-response";
  const cases = [
    {
      label: "served model",
      mutate: (payload: Record<string, any>) => {
        payload.model = "deepseek/unexpected-model";
      },
      pattern: /served model/,
    },
    {
      label: "served upstream",
      mutate: (payload: Record<string, any>) => {
        payload.provider = "UnexpectedProvider";
      },
      pattern: /served provider/,
    },
    {
      label: "route proof",
      mutate: (payload: Record<string, any>) => {
        payload.openrouter_metadata.attempt = 2;
      },
      pattern: /route proof/,
    },
    {
      label: "finish reason",
      mutate: (payload: Record<string, any>) => {
        payload.choices[0].finish_reason = "length";
      },
      pattern: /instead of stop/,
    },
  ] as const;
  let fetchCalls = 0;
  try {
    process.env.OPENROUTER_API_KEY = "test-only-placeholder";
    for (const testCase of cases) {
      const payload: Record<string, any> = {
        id: `generation-${testCase.label}`,
        model: DEEPSEEK_V4_FLASH_CANONICAL.model,
        provider: "DeepInfra",
        choices: [
          {
            message: { content: sentinel },
            finish_reason: "stop",
            native_finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 60,
          total_tokens: 160,
          cost: 0.000019,
          completion_tokens_details: { reasoning_tokens: 47 },
        },
        openrouter_metadata: {
          attempt: 1,
          strategy: "single",
          attempts: [{ provider: "DeepInfra", status: 200 }],
          endpoints: {
            available: [{ provider: "DeepInfra", selected: true }],
          },
        },
      };
      testCase.mutate(payload);
      globalThis.fetch = (async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": `request-${testCase.label}`,
          },
        });
      }) as typeof fetch;

      let caught: unknown;
      try {
        await executeCrossRoundAuditorRaw(
          definition.ledger,
          definition.clues,
        );
      } catch (error) {
        caught = error;
      }
      ok(caught instanceof Error, `${testCase.label} mismatch rejects`);
      ok(
        testCase.pattern.test(caught.message),
        `${testCase.label} mismatch is classified precisely`,
      );
      const received = crossRoundRawExecutionFromError(caught);
      ok(received, `${testCase.label} mismatch retains a raw execution`);
      equal(
        received.assistant.text,
        sentinel,
        `${testCase.label} mismatch retains exact assistant bytes`,
      );
      equal(
        received.assistant.textSha256,
        sha256Hex(sentinel),
        `${testCase.label} mismatch retains assistant digest`,
      );
      ok(
        received.providerMetadata,
        `${testCase.label} mismatch retains provider metadata`,
      );
      ok(
        !Object.keys(caught).includes("providerResponseReceipt") &&
          !Object.keys(caught).includes("rawExecution"),
        `${testCase.label} response receipt is non-enumerable on the error`,
      );
      ok(
        !JSON.stringify(caught).includes(sentinel),
        `${testCase.label} generic error serialization omits assistant text`,
      );
    }
    equal(
      fetchCalls,
      cases.length,
      "four strict validation failures make exactly one physical request each",
    );
    equal(
      getConfigForModel(
        "openrouter",
        DEEPSEEK_V4_FLASH_CANONICAL.model,
      ).timeoutMs,
      45 * 60 * 1000,
      "V4 Flash full-strength timeout is safely bounded at forty-five minutes",
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousKey;
    }
  }
}

function setArmSupportCount(
  runs: RepeatExperimentRunFile[],
  caseId:
    | "red-production-incident-2026-08-01"
    | "blue-production-incident-2026-08-01",
  count: number,
): void {
  const selected = runs.filter(
    (run) => run.job.caseId === caseId && run.validatedRun !== null,
  );
  selected.forEach((run, index) => {
    run.validatedRun!.audit.evaluation.intendedSupport =
      index < count ? "plausible" : null;
  });
}

function setBlueTurretCount(
  runs: RepeatExperimentRunFile[],
  count: number,
): void {
  const selected = runs.filter(
    (run) =>
      run.job.caseId === "blue-production-incident-2026-08-01" &&
      run.validatedRun !== null,
  );
  selected.forEach((run, index) => {
    const position = run.validatedRun!.audit.evaluation.positions[1]!;
    position.intendedHistoryEdge = index < count;
    position.intendedStrongHistoryEdge = index < count;
  });
}

function testPreregisteredBandBoundariesAndArmLocalMissingness(
  baseRuns: RepeatExperimentRunFile[],
): void {
  const boundaries = [
    [4, "systematic_omission_candidate"],
    [5, "indeterminate"],
    [13, "indeterminate"],
    [14, "high_repeat_recall"],
  ] as const;
  for (const [count, expected] of boundaries) {
    const runs = structuredClone(baseRuns);
    setArmSupportCount(runs, "red-production-incident-2026-08-01", count);
    setArmSupportCount(runs, "blue-production-incident-2026-08-01", count);
    setBlueTurretCount(runs, count);
    const summary = summarizeRepeatExperiment(runs);
    equal(
      summary.coPrimaryBands.redIntendedCodeActionableSupport,
      expected,
      `Red whole-code support count ${count} respects the preregistered boundary`,
    );
    equal(
      summary.coPrimaryBands.blueIntendedCodeActionableSupport,
      expected,
      `Blue whole-code support count ${count} respects the preregistered boundary`,
    );
    equal(
      summary.blueTurretSlot1MechanisticSecondary.band,
      expected,
      `Blue turret mechanism count ${count} respects the descriptive boundary`,
    );
  }

  const redMissing = structuredClone(baseRuns);
  const redFailure = redMissing.find(
    (run) => run.job.caseId === "red-production-incident-2026-08-01",
  )!;
  redFailure.status = "failure";
  redFailure.failurePhase = "parse_or_validation";
  redFailure.validatedRun = null;
  const redMissingSummary = summarizeRepeatExperiment(redMissing);
  equal(
    redMissingSummary.coPrimaryBands.redIntendedCodeActionableSupport,
    "suppressed_incomplete_arm",
    "Red missing data suppresses only Red's co-primary band",
  );
  equal(
    redMissingSummary.coPrimaryBands.blueIntendedCodeActionableSupport,
    "high_repeat_recall",
    "Red missing data does not erase a complete Blue co-primary measurement",
  );

  const controlMissing = structuredClone(baseRuns);
  const controlFailure = controlMissing.find(
    (run) => run.job.caseId === "synthetic-opaque-negative-control",
  )!;
  controlFailure.status = "failure";
  controlFailure.failurePhase = "parse_or_validation";
  controlFailure.validatedRun = null;
  const controlMissingSummary = summarizeRepeatExperiment(controlMissing);
  equal(
    controlMissingSummary.coPrimaryBands.redIntendedCodeActionableSupport,
    "high_repeat_recall",
    "ungrounded shaped-arm missingness does not suppress Red",
  );
  equal(
    controlMissingSummary.coPrimaryBands.blueIntendedCodeActionableSupport,
    "high_repeat_recall",
    "ungrounded shaped-arm missingness does not suppress Blue",
  );
}

async function testPreregistrationRereadAndHashValidation(): Promise<void> {
  const parent = await realTemporaryParent();
  try {
    for (const rehash of [false, true]) {
      const outputDir = resolve(
        parent,
        rehash ? "tampered-rehashed" : "tampered-self-hash",
      );
      let calls = 0;
      await rejects(
        () =>
          runCrossRoundRepeatExperiment({
            outputDir,
            sourceLineage: SOURCE_LINEAGE,
            emitProgress: () => undefined,
            afterPreregistrationWritten: async (path) => {
              const preregistration = JSON.parse(
                await readFile(path, "utf8"),
              ) as Record<string, any>;
              preregistration.fixedDesign.scheduledCalls = 59;
              if (rehash) {
                delete preregistration.preregistrationContentHash;
                preregistration.preregistrationContentHash =
                  contentHash(preregistration);
              }
              await writeFile(
                path,
                `${JSON.stringify(preregistration, null, 2)}\n`,
                { mode: 0o600 },
              );
            },
            rawExecutor: async (ledger, clues) => {
              calls += 1;
              return rawExecution(ledger, clues);
            },
          }),
        rehash ? /differs from the fixed/ : /self-hash mismatch/,
        rehash
          ? "a rehashed substituted preregistration is rejected"
          : "a preregistration with a stale self-hash is rejected",
      );
      equal(
        calls,
        0,
        "no provider dispatch occurs before persisted preregistration validation",
      );
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function testPersistenceFailureStopsDispatchAndAwaitsInflight(): Promise<void> {
  const parent = await realTemporaryParent();
  const outputDir = resolve(parent, "persistence-failure");
  let calls = 0;
  let completions = 0;
  let persistenceFailed = false;
  let dispatchesAfterFailure = 0;
  const writeOrder: string[] = [];
  try {
    await rejects(
      () =>
        runCrossRoundRepeatExperiment({
          outputDir,
          sourceLineage: SOURCE_LINEAGE,
          emitProgress: () => undefined,
          rawExecutor: async (ledger, clues) => {
            calls += 1;
            const call = calls;
            if (persistenceFailed) dispatchesAfterFailure += 1;
            if (call !== 1) {
              await new Promise((resolveDelay) =>
                setTimeout(resolveDelay, 25),
              );
            }
            completions += 1;
            return rawExecution(ledger, clues);
          },
          writeArtifact: async (path, report, label) => {
            writeOrder.push(`${label}:${path}`);
            if (
              label === "Repeat experiment run" &&
              path.includes("0001-")
            ) {
              persistenceFailed = true;
              throw new Error("injected final-run persistence failure");
            }
            await writeNoClobberJsonReport(path, report, label);
          },
        }),
      /durable artifact persistence failed/,
      "runner surfaces durable persistence failure",
    );
    equal(calls, 5, "no work beyond the initial in-flight wave is dispatched");
    equal(
      completions,
      5,
      "runner awaits every already-in-flight worker before rejecting",
    );
    equal(
      dispatchesAfterFailure,
      0,
      "no new provider dispatch begins after persistence failure is observed",
    );
    ok(
      writeOrder.findIndex((entry) =>
        entry.includes("raw receipt:"),
      ) <
        writeOrder.findIndex((entry) =>
          entry.includes("experiment run:"),
        ),
      "raw receipt publication precedes final run publication",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function testImmutableLineageAndPostRunVerification(): Promise<void> {
  assert.doesNotThrow(() =>
    assertImmutableRepeatExperimentSourceLineage(SOURCE_LINEAGE),
  );
  assertions += 1;
  assert.throws(
    () =>
      assertImmutableRepeatExperimentSourceLineage({
        ...SOURCE_LINEAGE,
        gitDirty: true,
      }),
    /clean, verified immutable commit/,
  );
  assertions += 1;

  const definitions = fixtureCanaryDefinitions();
  const jobs = repeatExperimentJobs(definitions);
  assert.doesNotThrow(() =>
    assertFixedRepeatExperimentDesign(definitions, jobs),
  );
  assertions += 1;
  assert.throws(
    () => assertFixedRepeatExperimentDesign(definitions, jobs.slice(0, 59)),
    /exactly three fixed cases and sixty/,
  );
  assertions += 1;

  const dirtyParent = await realTemporaryParent();
  let dirtyCalls = 0;
  try {
    await rejects(
      () =>
        runCrossRoundRepeatExperiment({
          outputDir: resolve(dirtyParent, "dirty-source"),
          sourceLineage: { ...SOURCE_LINEAGE, gitDirty: true },
          rawExecutor: async (ledger, clues) => {
            dirtyCalls += 1;
            return rawExecution(ledger, clues);
          },
        }),
      /clean, verified immutable commit/,
      "dirty source is rejected before measurement",
    );
    equal(dirtyCalls, 0, "dirty source cannot dispatch provider work");
  } finally {
    await rm(dirtyParent, { recursive: true, force: true });
  }

  const parent = await realTemporaryParent();
  try {
    const postRunSourceLineage: RepeatExperimentSourceLineage = {
      ...SOURCE_LINEAGE,
      capturedAt: "2026-08-02T06:00:00.000Z",
      gitCommitSha: "d".repeat(40),
    };
    const report = await runCrossRoundRepeatExperiment({
      outputDir: resolve(parent, "post-run-drift"),
      sourceLineage: SOURCE_LINEAGE,
      postRunSourceLineage,
      emitProgress: () => undefined,
      rawExecutor: async (ledger, clues) => rawExecution(ledger, clues),
    });
    equal(
      report.status,
      "incomplete",
      "post-run immutable identity drift invalidates the report",
    );
    ok(
      report.postRunVerification.mismatches.includes("gitCommitSha"),
      "post-run verification records the exact immutable-identity mismatch",
    );
    equal(
      report.postRunVerification.sourceLineage.runtimeIdentityHash,
      SOURCE_LINEAGE.runtimeIdentityHash,
      "post-run verification captures runtime identity",
    );
    equal(
      report.summary.coPrimaryBands.blueIntendedCodeActionableSupport,
      "suppressed_integrity_failure",
      "global source-integrity failure suppresses otherwise complete bands",
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function testNoClobberDirectory(): Promise<void> {
  const parent = await realTemporaryParent();
  const outputDir = resolve(parent, "existing");
  try {
    await runCrossRoundRepeatExperiment({
      outputDir,
      sourceLineage: SOURCE_LINEAGE,
      emitProgress: () => undefined,
      rawExecutor: async (ledger, clues) => rawExecution(ledger, clues),
      now: () => new Date("2026-08-02T05:20:00.000Z"),
    });
    let unexpectedCalls = 0;
    await rejects(
      () =>
        runCrossRoundRepeatExperiment({
          outputDir,
          sourceLineage: SOURCE_LINEAGE,
          emitProgress: () => undefined,
          rawExecutor: async (ledger, clues) => {
            unexpectedCalls += 1;
            return rawExecution(ledger, clues);
          },
        }),
      /EEXIST|exist/i,
      "an existing output directory is no-clobber",
    );
    equal(unexpectedCalls, 0, "no provider call occurs after no-clobber failure");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  testFixedJobMatrixAndArgs();
  const baseRuns = await testCompleteConcurrentMeasurement();
  await testFailuresAreRetainedWithoutReplacement();
  testExactRawHashValidationBeforeParse();
  await testProviderValidationRetainsResponseReceipts();
  testPreregisteredBandBoundariesAndArmLocalMissingness(baseRuns);
  await testPreregistrationRereadAndHashValidation();
  await testPersistenceFailureStopsDispatchAndAwaitsInflight();
  await testImmutableLineageAndPostRunVerification();
  await testNoClobberDirectory();
  console.log(
    `cross-round repeat experiment: ${assertions} assertions passed`,
  );
}

void main();
