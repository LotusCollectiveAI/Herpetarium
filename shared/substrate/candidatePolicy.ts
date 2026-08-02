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

/**
 * 0.3.0, 2026-08-01. A TREATMENT-IDENTITY change, not a paraphrase: results
 * measured under 0.1.0 or 0.2.0 may not be pooled with results measured under
 * this id.
 *
 * 0.2.0 fixed the verb — item 4 was the only check whose verb was not a
 * rejection, and the mandatory final sweep re-ran item 2 alone, so an actor
 * could satisfy the policy in full and still ship the 2026-08-01 leak.
 *
 * 0.3.0 fixes something worse that 0.2.0 introduced: a TAUTOLOGY. Item 4 read
 * "if both are natural clues for the same hidden keyword, an opponent can
 * match them". By construction that is true of EVERY legitimate reuse of a
 * slot — both clues really do target the same keyword, always — so the rule
 * as written rejected every candidate for every previously-clued number and
 * made cluegiving after round 1 impossible. A rule that cannot be satisfied
 * is not a safety rule; it is a denial of service that an actor must either
 * ignore or deadlock on.
 *
 * The test is BLIND PUBLIC DISCOVERABILITY, not shared private truth: hide
 * your keywords and the code, and ask what a capable opponent could do with
 * the candidate plus the exact old public clue and nothing else. Sharing a
 * hidden parent is necessary but nowhere near sufficient; what matters is
 * whether the route between the two public words is one an opponent would
 * readily propose.
 */
export const CIPHER_ENCRYPT_CANDIDATE_POLICY_ID =
  "within-call-blind-inversion-selection@0.3.0";

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
  "4. History exposure — a BLIND test, not a private one. Read your public",
  "column ledger: your resolved clues filed under the number each one encoded,",
  "which the opposing team also holds. For each candidate, take it together",
  "with each exact clue already public under the number it would encode, hide",
  "your keywords and the code, and ask what an opponent could do with just",
  "those two public words. Reject the candidate if a capable opponent would",
  "readily propose one salient ordinary shared referent or route linking them,",
  "or would place the candidate into that column on that basis. Changing the",
  "surface word while keeping an obvious route does not clear this.",
  "The fact that both clues really do point at the same hidden keyword is NOT",
  "by itself a reason to reject — that is true of every clue you will ever",
  "write for a number you have clued before, so it cannot be the test. What",
  "disqualifies a candidate is a publicly findable route, not a privately",
  "shared target. A genuinely different route to the same keyword, with no",
  "salient public bridge to the old clue, is exactly what you are looking for.",
  "Choose the candidate with the best teammate-clarity / opponent-opacity",
  "tradeoff, not merely the clearest association. Then repeat BOTH the blind",
  "inversion test and the blind history-exposure test on the final three clues",
  "together; replace any clue that still gives away its target from public",
  "language alone, or whose route from an established column's public clue an",
  "opponent would readily find.",
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
