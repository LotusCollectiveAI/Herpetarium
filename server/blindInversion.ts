import { z } from "zod";
import type { AIPlayerConfig } from "@shared/schema";
import {
  BLIND_INVERSION_PROTOCOL_VERSION,
  DEEPSEEK_V4_FLASH_CANONICAL,
  type BlindInversionAudit,
} from "@shared/substrate";
import {
  getConfigForModel,
  getModelCost,
} from "@shared/modelRegistry";
import { callAI } from "./ai";

export {
  BLIND_INVERSION_PROTOCOL_VERSION,
  conceptRecoversTarget,
  evaluateBlindInversion,
} from "@shared/substrate";
export type {
  BlindInversionAudit,
  BlindInversionEvaluation,
} from "@shared/substrate";

const conceptSchema = z
  .object({
    concept: z.string().min(1).max(120),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const auditSchema = z
  .object({
    index: z.number().int().positive(),
    concepts: z.array(conceptSchema).min(1).max(3),
    definitionShaped: z.boolean(),
    directness: z.number().min(0).max(1),
  })
  .strict();

const responseSchema = z
  .object({
    audits: z.array(auditSchema),
  })
  .strict();

export interface BlindInversionRun {
  protocolVersion: typeof BLIND_INVERSION_PROTOCOL_VERSION;
  status: "probe";
  auditedAt: string;
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
  audits: BlindInversionAudit[];
}

function defaultAuditorConfig(): AIPlayerConfig {
  return getConfigForModel(
    "openrouter",
    DEEPSEEK_V4_FLASH_CANONICAL.model,
  );
}

const AUDITOR_SYSTEM_PROMPT = `You are a blind Decrypto clue-leakage auditor.

You receive clue text only. You never receive the target words, secret code,
keyword set, or candidate answers. For each clue:
1. infer up to three likely hidden words or concepts, most likely first;
2. attach a calibrated confidence from 0 to 1 to each inference;
3. mark definitionShaped true when the clue functions like a definition,
   encyclopedia lookup, named-entity lookup, or direct cultural reference;
4. rate directness from 0 (oblique association) to 1 (nearly names its target).

Treat each clue independently. Return strict JSON and no prose.`;

function buildAuditorPrompt(clues: string[]): string {
  const numbered = clues
    .map((clue, index) => `${index + 1}. ${JSON.stringify(clue)}`)
    .join("\n");
  return `Audit these ${clues.length} clues:
${numbered}

Return exactly:
{"audits":[{"index":1,"concepts":[{"concept":"...","confidence":0.0}],"definitionShaped":false,"directness":0.0}]}

Include exactly one audit for every index from 1 through ${clues.length}.`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1]);
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new Error("Blind-inversion response did not contain JSON");
  }
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

export async function auditBlindClues(
  clues: string[],
  options: {
    config?: AIPlayerConfig;
    now?: () => Date;
  } = {},
): Promise<BlindInversionRun> {
  if (clues.length === 0 || clues.length > 60) {
    throw new Error("Blind inversion requires 1-60 clues");
  }
  for (const clue of clues) {
    if (clue.trim().length === 0 || clue.length > 240) {
      throw new Error("Blind-inversion clues must contain 1-240 characters");
    }
  }

  const config = options.config ?? defaultAuditorConfig();
  if (
    config.provider !== "openrouter" ||
    config.model !== DEEPSEEK_V4_FLASH_CANONICAL.model
  ) {
    throw new Error(
      `Probe protocol requires ${DEEPSEEK_V4_FLASH_CANONICAL.provider}/${DEEPSEEK_V4_FLASH_CANONICAL.model}`,
    );
  }

  const startedAt = Date.now();
  const raw = await callAI(
    config,
    AUDITOR_SYSTEM_PROMPT,
    buildAuditorPrompt(clues),
    {
      // V4 Flash's max-effort reasoning consumes the same completion budget as
      // the final JSON. The first 30-clue calibration exhausted 7,112 tokens
      // before emitting a complete response when capped at 12k. Preserve a
      // strict "stop" requirement and give the auditor the endpoint's full
      // completion allowance instead of accepting a truncated audit.
      maxTokens: 65_536,
      strictExecution: true,
    },
  );
  const parsed = responseSchema.parse(extractJson(raw.text));
  if (parsed.audits.length !== clues.length) {
    throw new Error(
      `Blind-inversion response contained ${parsed.audits.length} audits for ${clues.length} clues`,
    );
  }
  const byIndex = new Map(parsed.audits.map((audit) => [audit.index, audit]));
  if (byIndex.size !== clues.length) {
    throw new Error("Blind-inversion response repeated an audit index");
  }

  const audits = clues.map((clue, index) => {
    const audit = byIndex.get(index + 1);
    if (!audit) {
      throw new Error(`Blind-inversion response omitted clue ${index + 1}`);
    }
    return {
      clue,
      concepts: audit.concepts,
      definitionShaped: audit.definitionShaped,
      directness: audit.directness,
    };
  });
  const estimatedCostUsd = registryEstimatedCost(
    config,
    raw.promptTokens,
    raw.completionTokens,
  );
  const providerReportedCostUsd = providerReportedCost(raw.providerMetadata);

  return {
    protocolVersion: BLIND_INVERSION_PROTOCOL_VERSION,
    status: "probe",
    auditedAt: (options.now?.() ?? new Date()).toISOString(),
    modelRequested: {
      provider: "openrouter",
      model: config.model,
      upstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream ?? "deepinfra",
      reasoningEffort: config.reasoningEffort,
      wireReasoningEffort: providerWireReasoningEffort(raw.providerMetadata),
    },
    providerMetadata: raw.providerMetadata,
    usage: {
      promptTokens: raw.promptTokens,
      completionTokens: raw.completionTokens,
      totalTokens: raw.totalTokens,
      estimatedCostUsd,
      providerReportedCostUsd,
      effectiveCostUsd:
        providerReportedCostUsd ??
        (estimatedCostUsd === undefined
          ? undefined
          : Number(estimatedCostUsd)),
      costSource:
        providerReportedCostUsd !== undefined
          ? "provider_reported"
          : estimatedCostUsd !== undefined
            ? "registry_estimate"
            : undefined,
      latencyMs: Date.now() - startedAt,
    },
    audits,
  };
}
