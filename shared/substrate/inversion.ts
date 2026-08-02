/**
 * Pure blind-inversion policy.
 *
 * The auditor itself is app-owned because provider calls and persistence are
 * runtime concerns. Target matching and veto decisions are substrate-owned so
 * Herpetarium evaluations and The Table's eventual role-isolated auditor
 * cannot silently interpret the same audit differently.
 */
import { PROVISIONAL_INVERSION_VETO_POLICY } from "./fixtures";
import { contentHash } from "./hash";

export const BLIND_INVERSION_PROTOCOL_VERSION =
  "blind-inversion@0.1-probe";
export const PROVISIONAL_INVERSION_VETO_POLICY_ID =
  "provisional-inversion-veto@2026-08-01";
export const PROVISIONAL_INVERSION_VETO_POLICY_HASH = contentHash(
  PROVISIONAL_INVERSION_VETO_POLICY,
);

export interface BlindInversionConcept {
  concept: string;
  confidence: number;
}

export interface BlindInversionAudit {
  clue: string;
  concepts: BlindInversionConcept[];
  definitionShaped: boolean;
  directness: number;
}

export type InversionVetoOutcome =
  | "hard_veto"
  | "soft_regenerate_once"
  | "pass";

export interface BlindInversionEvaluation {
  target: string;
  recovered: boolean;
  highestMatchingConfidence: number | null;
  matchingConceptRank: number | null;
  definitionShaped: boolean;
  directness: number;
  outcome: InversionVetoOutcome;
  hardVeto: boolean;
  softRegenerateOnce: boolean;
  /** @deprecated Use `hardVeto` or `outcome`; retained for probe reports. */
  flag: boolean;
}

/**
 * Normalize English clue concepts for conservative target recovery.
 *
 * This intentionally handles only separator/case differences and the same
 * small plural family used by the original Herpetarium probe. It does not use
 * fuzzy similarity: a target token must still appear as a complete normalized
 * concept token.
 */
export function normalizeInversionTokens(text: string): string[] {
  return text
    .toLocaleLowerCase("en")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => {
      if (token.length > 4 && token.endsWith("ies")) {
        return `${token.slice(0, -3)}y`;
      }
      if (token.length > 4 && token.endsWith("es")) {
        return token.slice(0, -2);
      }
      if (token.length > 3 && token.endsWith("s")) {
        return token.slice(0, -1);
      }
      return token;
    });
}

export function conceptRecoversTarget(
  concept: string,
  target: string,
): boolean {
  const conceptTokens = new Set(normalizeInversionTokens(concept));
  const targetTokens = normalizeInversionTokens(target);
  return (
    targetTokens.length > 0 &&
    targetTokens.every((targetToken) => conceptTokens.has(targetToken))
  );
}

/**
 * Apply the shared provisional veto tiers to blind, role-isolated audits.
 *
 * `threshold` remains injectable for calibration probes. Product/research
 * runtime callers should omit it and therefore execute the versioned shared
 * policy threshold.
 */
export function evaluateBlindInversion(
  audits: readonly BlindInversionAudit[],
  targets: readonly string[],
  threshold = PROVISIONAL_INVERSION_VETO_POLICY.confidenceThreshold,
): BlindInversionEvaluation[] {
  if (audits.length !== targets.length) {
    throw new Error("Blind-inversion audits and targets must have equal length");
  }
  return audits.map((audit, index) => {
    const matchingConceptIndex = audit.concepts.findIndex((candidate) =>
      conceptRecoversTarget(candidate.concept, targets[index]),
    );
    const matching = audit.concepts.filter((candidate) =>
      conceptRecoversTarget(candidate.concept, targets[index]),
    );
    const highestMatchingConfidence =
      matching.length > 0
        ? Math.max(...matching.map((candidate) => candidate.confidence))
        : null;
    const recovered = highestMatchingConfidence !== null;
    const matchingConceptRank =
      matchingConceptIndex === -1 ? null : matchingConceptIndex + 1;
    const hardVeto =
      (highestMatchingConfidence ?? 0) >= threshold ||
      (audit.definitionShaped && audit.directness >= threshold);
    const softRegenerateOnce =
      !hardVeto &&
      (matchingConceptRank === 1 ||
        (recovered && audit.definitionShaped));
    const outcome: InversionVetoOutcome = hardVeto
      ? "hard_veto"
      : softRegenerateOnce
        ? "soft_regenerate_once"
        : "pass";
    return {
      target: targets[index],
      recovered,
      highestMatchingConfidence,
      matchingConceptRank,
      definitionShaped: audit.definitionShaped,
      directness: audit.directness,
      outcome,
      hardVeto,
      softRegenerateOnce,
      flag: hardVeto,
    };
  });
}
