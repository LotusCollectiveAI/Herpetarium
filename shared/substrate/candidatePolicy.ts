/**
 * Canonical actor-call candidate policy used by The Table's first
 * intermediate-hops treatment and by Herpetarium's matched A/B arm.
 *
 * This is a treatment to evaluate, not a role-isolated semantic auditor and
 * not a validated strategy. Its exact text and composition order are hashed
 * so a result cannot claim to test "the Table treatment" after paraphrasing
 * or dropping part of the prompt.
 */
import { contentHash } from "./hash";

export const CIPHER_ENCRYPT_CANDIDATE_POLICY_ID =
  "within-call-blind-inversion-selection@0.1.0";

export const CIPHER_ENCRYPT_CANDIDATE_POLICY = [
  "Candidate selection is mandatory; do not jump from keyword to final clue.",
  "For each of the three code positions, silently generate at least three",
  "different SINGLE-WORD candidate clues. Compare them before choosing.",
  "For every candidate, run all four checks:",
  "1. Teammate clarity: with all four of your keywords visible, would a",
  "teammate choose the intended keyword over each of the other three?",
  "2. Blind inversion: temporarily hide your keyword list and read only the",
  "candidate. What secret concept would a capable opponent name first? If",
  "the intended keyword, a direct synonym, a famous unique identifier, or a",
  "definition is the obvious reconstruction, reject the candidate.",
  "3. Cross-keyword ambiguity: reject a candidate that points comparably to",
  "another one of your four keywords.",
  "4. History exposure: compare resolved clue-to-number history. Penalize an",
  "association family that lets opponents match this clue to an established",
  "number pattern.",
  "Choose the candidate with the best teammate-clarity / opponent-opacity",
  "tradeoff, not merely the clearest association. Then repeat the blind",
  "inversion test on the final three clues together; replace any clue that",
  "still gives away its target from public language alone.",
  "Return only the final action envelope. Keep candidates, scores, simulated",
  "reads, and private reasoning out of the response.",
].join(" ");

export const CIPHER_ENCRYPT_CANDIDATE_POLICY_HASH = contentHash({
  id: CIPHER_ENCRYPT_CANDIDATE_POLICY_ID,
  instruction: CIPHER_ENCRYPT_CANDIDATE_POLICY,
});

export interface CandidatePolicyArtifact {
  readonly id: string;
  readonly instruction: string;
  readonly contentHash: string;
}

export const CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT: Readonly<CandidatePolicyArtifact> =
  Object.freeze({
    id: CIPHER_ENCRYPT_CANDIDATE_POLICY_ID,
    instruction: CIPHER_ENCRYPT_CANDIDATE_POLICY,
    contentHash: CIPHER_ENCRYPT_CANDIDATE_POLICY_HASH,
  });

/**
 * Compose the exact task-authority layer used for the Table encrypt
 * treatment. The compiled artifact directives come first, the actor-call
 * candidate policy follows, and the app-owned action/output contract remains
 * last and authoritative.
 */
export function composeCandidatePolicyTaskInstruction(input: {
  compiledTaskDirectives: string | null;
  authoritativeActionContract: string;
  policy?: Readonly<CandidatePolicyArtifact>;
}): string {
  const policy =
    input.policy ?? CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT;
  return [
    "OPERATIVE STRATEGY DIRECTIVES FOR THIS ACTION:",
    input.compiledTaskDirectives,
    `ACTOR-CALL CANDIDATE POLICY (${policy.id}): ${policy.instruction}`,
    "AUTHORITATIVE GAME ACTION AND OUTPUT CONTRACT:",
    input.authoritativeActionContract,
  ]
    .filter(Boolean)
    .join("\n\n");
}
