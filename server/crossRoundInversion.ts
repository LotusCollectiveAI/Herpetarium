/**
 * Research-side runner for the shared
 * `cross-round-referent-evidence@0.3-probe` instrument.
 *
 * Sibling of `blindInversion.ts`, and deliberately NOT a second copy of the
 * instrument. Prompt text, task rendering, batch size, ledger construction,
 * and veto tiers all come from `@shared/substrate`, so this and The Table's
 * runtime gate are provably the same instrument — the defect recorded in
 * `docs/SUBSTRATE_SPEC_V0.md` §4b, where two different auditors shared the
 * `blind-inversion@0.1-probe` id and their flag rates could never be pooled.
 *
 * Scope: offline evaluation over durable rounds. This module does not gate
 * Herpetarium's play loop. Enforcing a veto inside `headlessRunner` would
 * change the treatment every existing arm was measured under, which is a
 * research-design decision rather than a defect fix; the calibration work in
 * `CROSS_ROUND_COLUMN_VETO_POLICY.pendingBeforeFreeze` has to come first, and
 * that is exactly what this module exists to make possible.
 */
import type { AIPlayerConfig } from "@shared/schema";
import {
  CROSS_ROUND_AUDITOR_BATCH_SIZE,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_AUDITOR_SYSTEM_PROMPT,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  DEEPSEEK_V4_FLASH_CANONICAL,
  buildPublicClueLedger,
  composeCrossRoundAuditorTask,
  evaluateCrossRoundInversion,
  parseCrossRoundAuditorReply as parseSharedCrossRoundAuditorReply,
  publicLedgerClueCount,
  publicLedgerHasHistory,
  sha256Hex,
  type CrossRoundAuditorReply,
  type PublicClueLedger,
  type ResolvedClueRound,
} from "@shared/substrate";
import { getConfigForModel, getModelCost } from "@shared/modelRegistry";
import {
  callAI,
  providerResponseReceiptFromError,
  type RawAIResponse,
} from "./ai";

export {
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  buildPublicClueLedger,
  evaluateCrossRoundInversion,
  publicLedgerHasHistory,
} from "@shared/substrate";
export type {
  CrossRoundAuditorReply,
  CrossRoundClueAudit,
  CrossRoundInversionEvaluation,
  PublicClueLedger,
} from "@shared/substrate";

/** One team's resolved rounds, in the shape the substrate ledger expects. */
export interface TeamRoundHistoryEntry {
  clues: string[];
  targetCode: [number, number, number];
}

export interface CrossRoundInversionRun {
  protocolVersion: typeof CROSS_ROUND_INVERSION_PROTOCOL_VERSION;
  policyId: typeof CROSS_ROUND_COLUMN_VETO_POLICY_ID;
  policyHash: typeof CROSS_ROUND_COLUMN_VETO_POLICY_HASH;
  /** Instrument identity: pooling across differing values is not a measurement. */
  auditorPromptHash: typeof CROSS_ROUND_AUDITOR_PROMPT_HASH;
  auditorBatchSize: typeof CROSS_ROUND_AUDITOR_BATCH_SIZE;
  status: "probe";
  auditedAt: string;
  ledgerClueCount: number;
  modelRequested: {
    provider: "openrouter";
    model: string;
    upstream: string;
    reasoningEffort: AIPlayerConfig["reasoningEffort"];
    wireReasoningEffort?: string;
  };
  providerMetadata?: Record<string, unknown>;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: string;
    providerReportedCostUsd?: number;
    effectiveCostUsd?: number;
    costSource?: "provider_reported" | "registry_estimate";
    latencyMs: number;
  };
  /**
   * The parsed auditor reply: a complete 3x4 referent-evidence grid plus the
   * auditor's support-tiered legal-code credible set. Both are recorded raw so
   * a later re-scoring under a different policy does not need a provider call.
   */
  reply: CrossRoundAuditorReply;
}

/**
 * Exact visible request/response trace before parsing.
 *
 * OpenRouter is deliberately asked to exclude hidden chain-of-thought. The
 * visible assistant bytes and reasoning-token counts are retained; hidden
 * reasoning text is neither available nor claimed.
 */
export interface CrossRoundAuditorRawExecution {
  protocolVersion: typeof CROSS_ROUND_INVERSION_PROTOCOL_VERSION;
  policyId: typeof CROSS_ROUND_COLUMN_VETO_POLICY_ID;
  policyHash: typeof CROSS_ROUND_COLUMN_VETO_POLICY_HASH;
  auditorPromptHash: typeof CROSS_ROUND_AUDITOR_PROMPT_HASH;
  auditorBatchSize: typeof CROSS_ROUND_AUDITOR_BATCH_SIZE;
  startedAt: string;
  completedAt: string;
  ledgerClueCount: number;
  request: {
    systemPrompt: string;
    systemPromptSha256: string;
    taskPrompt: string;
    taskPromptSha256: string;
  };
  modelRequested: CrossRoundInversionRun["modelRequested"];
  providerMetadata?: Record<string, unknown>;
  usage: CrossRoundInversionRun["usage"] & {
    reasoningTokens?: number;
  };
  assistant: {
    text: string;
    textSha256: string;
    hiddenReasoningStored: false;
  };
}

interface CrossRoundAuditorErrorWithRawExecution extends Error {
  rawExecution: CrossRoundAuditorRawExecution;
}

/** Recover a received response from a strict-route failure without validating it. */
export function crossRoundRawExecutionFromError(
  error: unknown,
): CrossRoundAuditorRawExecution | undefined {
  if (!error || typeof error !== "object") return undefined;
  const rawExecution = (
    error as { rawExecution?: CrossRoundAuditorRawExecution }
  ).rawExecution;
  return rawExecution &&
    typeof rawExecution === "object" &&
    typeof rawExecution.assistant?.text === "string"
    ? rawExecution
    : undefined;
}

function defaultAuditorConfig(): AIPlayerConfig {
  return getConfigForModel("openrouter", DEEPSEEK_V4_FLASH_CANONICAL.model);
}

/** Fold a team's resolved-round history into the public per-slot ledger. */
export function ledgerFromTeamHistory(
  history: readonly TeamRoundHistoryEntry[],
): PublicClueLedger {
  const rounds: ResolvedClueRound[] = [];
  for (const entry of history) {
    if (entry.clues.length !== 3) continue;
    rounds.push({
      clues: [entry.clues[0]!, entry.clues[1]!, entry.clues[2]!],
      code: entry.targetCode,
    });
  }
  return buildPublicClueLedger(rounds);
}

function providerReportedCost(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
  const usage =
    metadata?.usage &&
    typeof metadata.usage === "object" &&
    !Array.isArray(metadata.usage)
      ? (metadata.usage as Record<string, unknown>)
      : undefined;
  return typeof usage?.costUsd === "number" && Number.isFinite(usage.costUsd)
    ? usage.costUsd
    : undefined;
}

function providerWireReasoningEffort(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return typeof metadata?.wireReasoningEffort === "string"
    ? metadata.wireReasoningEffort
    : undefined;
}

function registryEstimatedCost(
  config: Pick<AIPlayerConfig, "provider" | "model">,
  promptTokens?: number,
  completionTokens?: number,
): string | undefined {
  if (promptTokens === undefined && completionTokens === undefined) {
    return undefined;
  }
  const pricing = getModelCost(config);
  if (!pricing) return undefined;
  return (
    ((promptTokens ?? 0) / 1_000) * pricing.input +
    ((completionTokens ?? 0) / 1_000) * pricing.output
  ).toFixed(9);
}

function buildCrossRoundRawExecution(input: {
  ledger: PublicClueLedger;
  config: AIPlayerConfig;
  systemPrompt: string;
  taskPrompt: string;
  startedAt: string;
  completedAt: string;
  startedMs: number;
  raw: RawAIResponse;
}): CrossRoundAuditorRawExecution {
  const estimatedCostUsd = registryEstimatedCost(
    input.config,
    input.raw.promptTokens,
    input.raw.completionTokens,
  );
  const providerReportedCostUsd = providerReportedCost(
    input.raw.providerMetadata,
  );
  const metadataUsage =
    input.raw.providerMetadata?.usage &&
    typeof input.raw.providerMetadata.usage === "object" &&
    !Array.isArray(input.raw.providerMetadata.usage)
      ? (input.raw.providerMetadata.usage as Record<string, unknown>)
      : undefined;
  const reasoningTokens =
    typeof metadataUsage?.reasoningTokens === "number" &&
    Number.isFinite(metadataUsage.reasoningTokens)
      ? metadataUsage.reasoningTokens
      : undefined;

  return {
    protocolVersion: CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
    policyId: CROSS_ROUND_COLUMN_VETO_POLICY_ID,
    policyHash: CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
    auditorPromptHash: CROSS_ROUND_AUDITOR_PROMPT_HASH,
    auditorBatchSize: CROSS_ROUND_AUDITOR_BATCH_SIZE,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ledgerClueCount: publicLedgerClueCount(input.ledger),
    request: {
      systemPrompt: input.systemPrompt,
      systemPromptSha256: sha256Hex(input.systemPrompt),
      taskPrompt: input.taskPrompt,
      taskPromptSha256: sha256Hex(input.taskPrompt),
    },
    modelRequested: {
      provider: "openrouter",
      model: input.config.model,
      upstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream ?? "deepinfra",
      reasoningEffort: input.config.reasoningEffort,
      wireReasoningEffort: providerWireReasoningEffort(
        input.raw.providerMetadata,
      ),
    },
    providerMetadata: input.raw.providerMetadata,
    usage: {
      promptTokens: input.raw.promptTokens,
      completionTokens: input.raw.completionTokens,
      totalTokens: input.raw.totalTokens,
      reasoningTokens,
      estimatedCostUsd,
      providerReportedCostUsd,
      effectiveCostUsd:
        providerReportedCostUsd ??
        (estimatedCostUsd === undefined ? undefined : Number(estimatedCostUsd)),
      costSource:
        providerReportedCostUsd !== undefined
          ? "provider_reported"
          : estimatedCostUsd !== undefined
            ? "registry_estimate"
            : undefined,
      latencyMs: Date.now() - input.startedMs,
    },
    assistant: {
      text: input.raw.text,
      textSha256: sha256Hex(input.raw.text),
      hiddenReasoningStored: false,
    },
  };
}

/**
 * Parse one auditor reply and bind assignments to clues by CALLER-owned
 * position, matching The Table's contract. The 0.1 Herpetarium auditor let the
 * model supply its own `index`; that is a weaker binding and is not repeated.
 */
export function parseCrossRoundAuditorReply(
  text: string,
  clues: readonly [string, string, string],
): CrossRoundAuditorReply {
  return parseSharedCrossRoundAuditorReply(text, clues);
}

function validateCrossRoundAuditInput(
  ledger: PublicClueLedger,
  clues: readonly [string, string, string],
): void {
  if (clues.length !== CROSS_ROUND_AUDITOR_BATCH_SIZE) {
    throw new Error(
      `Cross-round inversion requires exactly ${CROSS_ROUND_AUDITOR_BATCH_SIZE} clues`,
    );
  }
  for (const clue of clues) {
    if (clue.trim().length === 0 || clue.length > 240) {
      throw new Error("Cross-round clues must contain 1-240 characters");
    }
  }
  if (!publicLedgerHasHistory(ledger)) {
    throw new Error(
      "Cross-round inversion needs a non-empty public ledger; round 1 has no history to match against",
    );
  }
}

function validateCrossRoundAuditorConfig(config: AIPlayerConfig): void {
  if (
    config.provider !== "openrouter" ||
    config.model !== DEEPSEEK_V4_FLASH_CANONICAL.model ||
    config.reasoningEffort !== "xhigh"
  ) {
    throw new Error(
      `Probe protocol requires ${DEEPSEEK_V4_FLASH_CANONICAL.provider}/${DEEPSEEK_V4_FLASH_CANONICAL.model} at xhigh (wire max) reasoning`,
    );
  }
}

/**
 * Execute one exact auditor request without parsing it.
 *
 * This seam exists so long repeat experiments can durably preserve malformed
 * assistant output instead of throwing away the trace at the parser boundary.
 */
export async function executeCrossRoundAuditorRaw(
  ledger: PublicClueLedger,
  clues: readonly [string, string, string],
  options: {
    config?: AIPlayerConfig;
    now?: () => Date;
  } = {},
): Promise<CrossRoundAuditorRawExecution> {
  validateCrossRoundAuditInput(ledger, clues);
  const config = options.config ?? defaultAuditorConfig();
  validateCrossRoundAuditorConfig(config);

  const systemPrompt = CROSS_ROUND_AUDITOR_SYSTEM_PROMPT;
  const taskPrompt = composeCrossRoundAuditorTask(ledger, clues);
  const startedAt = (options.now?.() ?? new Date()).toISOString();
  const startedMs = Date.now();
  let raw: RawAIResponse;
  try {
    raw = await callAI(config, systemPrompt, taskPrompt, {
      maxTokens: 65_536,
      strictExecution: true,
    });
  } catch (error) {
    const receivedResponse = providerResponseReceiptFromError(error);
    if (receivedResponse) {
      const rawExecution = buildCrossRoundRawExecution({
        ledger,
        config,
        systemPrompt,
        taskPrompt,
        startedAt,
        completedAt: (options.now?.() ?? new Date()).toISOString(),
        startedMs,
        raw: receivedResponse,
      });
      const surfaced =
        error instanceof Error ? error : new Error(String(error));
      Object.defineProperty(surfaced, "rawExecution", {
        value:
          rawExecution satisfies CrossRoundAuditorErrorWithRawExecution["rawExecution"],
        enumerable: false,
        configurable: false,
        writable: false,
      });
      throw surfaced;
    }
    throw error;
  }
  const completedAt = (options.now?.() ?? new Date()).toISOString();
  return buildCrossRoundRawExecution({
    ledger,
    config,
    systemPrompt,
    taskPrompt,
    startedAt,
    completedAt,
    startedMs,
    raw,
  });
}

/**
 * Validate every exact visible byte binding before parsing model-controlled
 * JSON. A self-consistent but substituted prompt is rejected by comparison to
 * the substrate renderer, not merely by trusting the receipt's own hashes.
 */
export function validateCrossRoundRawExecution(
  raw: CrossRoundAuditorRawExecution,
  ledger: PublicClueLedger,
  clues: readonly [string, string, string],
): void {
  validateCrossRoundAuditInput(ledger, clues);
  if (
    raw.protocolVersion !== CROSS_ROUND_INVERSION_PROTOCOL_VERSION ||
    raw.policyId !== CROSS_ROUND_COLUMN_VETO_POLICY_ID ||
    raw.policyHash !== CROSS_ROUND_COLUMN_VETO_POLICY_HASH ||
    raw.auditorPromptHash !== CROSS_ROUND_AUDITOR_PROMPT_HASH ||
    raw.auditorBatchSize !== CROSS_ROUND_AUDITOR_BATCH_SIZE
  ) {
    throw new Error("Cross-round raw receipt instrument identity mismatch");
  }
  if (
    raw.ledgerClueCount !== publicLedgerClueCount(ledger) ||
    raw.request.systemPrompt !== CROSS_ROUND_AUDITOR_SYSTEM_PROMPT ||
    raw.request.taskPrompt !== composeCrossRoundAuditorTask(ledger, clues)
  ) {
    throw new Error("Cross-round raw receipt prompt bytes mismatch");
  }
  if (
    raw.request.systemPromptSha256 !==
      sha256Hex(raw.request.systemPrompt) ||
    raw.request.taskPromptSha256 !== sha256Hex(raw.request.taskPrompt)
  ) {
    throw new Error("Cross-round raw receipt prompt hash mismatch");
  }
  if (raw.assistant.textSha256 !== sha256Hex(raw.assistant.text)) {
    throw new Error("Cross-round raw receipt assistant text hash mismatch");
  }
  if (raw.assistant.hiddenReasoningStored !== false) {
    throw new Error("Cross-round raw receipt hidden-reasoning claim mismatch");
  }
}

/** Validate and parse a preserved raw execution into the compatibility shape. */
export function crossRoundInversionRunFromRawExecution(
  raw: CrossRoundAuditorRawExecution,
  ledger: PublicClueLedger,
  clues: readonly [string, string, string],
): CrossRoundInversionRun {
  validateCrossRoundRawExecution(raw, ledger, clues);
  return {
    protocolVersion: raw.protocolVersion,
    policyId: raw.policyId,
    policyHash: raw.policyHash,
    auditorPromptHash: raw.auditorPromptHash,
    auditorBatchSize: raw.auditorBatchSize,
    status: "probe",
    auditedAt: raw.completedAt,
    ledgerClueCount: raw.ledgerClueCount,
    modelRequested: raw.modelRequested,
    providerMetadata: raw.providerMetadata,
    usage: raw.usage,
    reply: parseCrossRoundAuditorReply(raw.assistant.text, clues),
  };
}

/**
 * Audit one submission against a team's public ledger.
 *
 * The auditor receives the ledger and the three clues and nothing else. It is
 * never given the keywords or the intended code; the caller compares the blind
 * prediction to the code afterwards via `evaluateCrossRoundInversion`.
 */
export async function auditCrossRoundColumns(
  ledger: PublicClueLedger,
  clues: readonly [string, string, string],
  options: {
    config?: AIPlayerConfig;
    now?: () => Date;
  } = {},
): Promise<CrossRoundInversionRun> {
  const raw = await executeCrossRoundAuditorRaw(ledger, clues, options);
  return crossRoundInversionRunFromRawExecution(raw, ledger, clues);
}
