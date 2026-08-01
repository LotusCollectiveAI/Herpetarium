/**
 * Pinned model identity. Two lessons drive this file:
 *
 * 1. Herpetarium Tournament 1 burned 5,661 calls on model ids that did not
 *    exist (nonexistent Qwen id, typo'd DeepSeek prefix) and the failures
 *    silently became fallback play. Identity handling is part of the
 *    instrument.
 * 2. Providers mutate names. On 2026-07-31 DeepSeek re-post-trained the
 *    model behind its direct-API alias `deepseek-v4-flash` (V4-Flash-0731)
 *    with no dated id offered, while OpenRouter added a *distinct* dated
 *    model `deepseek/deepseek-v4-flash-0731` and kept the generic slug on
 *    the April preview. The same string can mean three different models
 *    depending on provider and date.
 *
 * Every artifact pins ModelRefs; every trace records the requested ref AND
 * what the provider actually served.
 */

export interface ModelRef {
  /** API surface: "openrouter" | "deepseek" | "anthropic" | "openai" | ... */
  provider: string;
  /** Canonical model id/slug as sent to the provider. Prefer dated slugs. */
  model: string;
  /** For aggregators: the pinned upstream endpoint (e.g. "deepinfra"). */
  upstream?: string;
  /**
   * For mutable aliases: the alias epoch this ref means, i.e. the release
   * date of the build the alias pointed to when pinned (e.g. "2026-07-31").
   * Required when `model` appears in KNOWN_ALIAS_MUTATIONS.
   */
  aliasEpoch?: string;
  reasoningEffort?: string;
}

/** What the provider reports having actually served for a call. */
export interface ResolvedModel {
  servedModel?: string;
  upstream?: string;
  routeAttempt?: number;
  /** Provider fingerprint/system_fingerprint when offered (direct APIs). */
  fingerprint?: string;
}

export interface AliasMutation {
  provider: string;
  alias: string;
  mutatedOn: string;
  from: string;
  to: string;
  source: string;
}

/**
 * Ledger of known in-place alias mutations. Append-only; evaluations that
 * span an entry's date must partition their data by alias epoch.
 */
export const KNOWN_ALIAS_MUTATIONS: AliasMutation[] = [
  {
    provider: "deepseek",
    alias: "deepseek-v4-flash",
    mutatedOn: "2026-07-31",
    from: "DeepSeek-V4-Flash-Preview (introduced 2026-04-24)",
    to: "DeepSeek-V4-Flash-0731 (re-post-train, same architecture)",
    source: "https://api-docs.deepseek.com/updates/",
  },
];

/**
 * Alias epoch for a (provider, model) as of an ISO date: the latest known
 * mutation date not after `asOf`, or "pre" + first mutation if none. Returns
 * null for names with no known mutations (stable or unknown).
 */
export function aliasEpochFor(provider: string, model: string, asOf: string): string | null {
  const mutations = KNOWN_ALIAS_MUTATIONS.filter(
    (m) => m.provider === provider && m.alias === model,
  ).sort((a, b) => (a.mutatedOn < b.mutatedOn ? -1 : 1));
  if (mutations.length === 0) return null;
  let epoch = `pre-${mutations[0].mutatedOn}`;
  for (const m of mutations) {
    if (m.mutatedOn <= asOf) epoch = m.mutatedOn;
  }
  return epoch;
}

/**
 * The two sanctioned DeepSeek V4-Flash lanes (resolved decision, 2026-08-01;
 * diagnostic §5): the dated, upstream-pinned OpenRouter route is the
 * canonical experiment workhorse, in use now. The official direct alias is
 * a provenance canary only — it runs solely when its own credential is
 * available, its traces must carry an alias epoch and a distinct label, and
 * canary data is never pooled with workhorse data in any evaluation.
 */
export const DEEPSEEK_V4_FLASH_CANONICAL: ModelRef = {
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash-0731",
  upstream: "deepinfra",
};

export const DEEPSEEK_V4_FLASH_PROVENANCE_CANARY: ModelRef = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  aliasEpoch: "2026-07-31",
};

export function validateModelRef(ref: ModelRef, asOf: string): string[] {
  const problems: string[] = [];
  if (!ref.provider) problems.push("provider is required");
  if (!ref.model) problems.push("model is required");
  const epoch = aliasEpochFor(ref.provider, ref.model, asOf);
  if (epoch !== null && !ref.aliasEpoch) {
    problems.push(
      `model "${ref.model}" on "${ref.provider}" is a known mutable alias; aliasEpoch is required (as of ${asOf}: ${epoch})`,
    );
  }
  return problems;
}
