/**
 * Shared Decrypto substrate — the versioned vocabulary that lets Herpetarium
 * train and evaluate named immutable strategy artifacts, and lets The Table
 * seat those exact artifacts in human games and return standardized traces.
 *
 * This directory is intentionally dependency-free (node:crypto only) and is
 * vendored byte-identically into both applications:
 *   Herpetarium:        shared/substrate/
 *   the-table-handoff:  lib/decrypto-substrate/src/
 * Any change must land in both copies; `runConformance()` plus the parity
 * script prove the copies agree. Do not add app-specific imports here.
 */
export const SUBSTRATE_NAME = "decrypto-substrate";
/**
 * 2026-08-02 contract-only additive note: `BotBuildManifest@0.1`,
 * `CluegiverBotBuildManifest@cluegiver-0.1`, the content-addressed
 * `table-competitive-v1` protocol, Observation/Trace v0.2, and the sibling
 * cluegiver observation v0.1 each carry their own schema identity. They
 * deliberately do NOT bump this global value yet: `SUBSTRATE_VERSION` is
 * embedded in compiled strategy carriers, so changing it before runtime
 * adoption would silently change the legacy compiled-carrier golden. A later
 * integration release may bump it only with an explicit carrier migration and
 * re-evaluation boundary.
 *
 * 0.2.0 added `crossRoundInversion.ts` — the history-aware set-level audit the
 * 0.1 roadmap named as the only way to reach the accumulated-history leak
 * class. Additive surface: no existing artifact, compiler, or golden hash
 * changed, and `blind-inversion@0.1-probe` keeps its own id and frozen policy.
 *
 * 0.3.0 replaced that instrument's elicitation and decision procedure after it
 * scored the 2026-08-01 Red production incident `pass` against the exact dated
 * model. 0.4.0 replaces it AGAIN, because `@0.2-probe` was then run live and
 * scored the same incident `pass` too, at 26,716 reasoning tokens. Both raw
 * traces are preserved in `fixtures.ts`.
 *
 * `cross-round-referent-evidence@0.3-probe` stops asking the auditor for a
 * verdict and asks it for evidence: a per-clue-per-slot shared-referent grid
 * with qualitative strengths, judged independently rather than normalised
 * across slots, plus a small support-tiered credible set of legal codes that keeps
 * equal-support alternatives. This was designed to preserve ambiguity rather
 * than collapse it to one pick. The 2026-08-02 live Blue call proved the design
 * goal is not guaranteed by the schema: the reply still omitted one plausible
 * branch and the intended code, so the fixed evaluator passed an intercepted
 * clue set.
 *
 * 0.5.0 hardens the same instrument after a third review. The reply contract
 * gains per-row `clueIndex` identity, an exact `publicClue` binding on every
 * bridge, and machine-readable `support` tiers whose ARRAY ORDER IS NEVER
 * READ; the evaluator re-validates all of it and `combineInversionOutcomes`
 * fails closed on an empty or unknown list. It also retracts two claims: the
 * empty-slot "no-information baseline" inference, and the "exact binomial
 * against p0 = 1/24" successor. Separately, `candidatePolicy` goes to 0.3.0 to
 * remove a TAUTOLOGY that made cluegiving after round 1 impossible. The
 * auditor prompt likewise asks what is publicly FINDABLE and explicitly says
 * that the private existence of a shared keyword on every intended edge is
 * not evidence. These are instrument changes, not validated performance
 * claims; `CROSS_ROUND_RUNTIME_ENFORCEMENT_RELEASED` remains false.
 *
 * Breaking within that instrument only: the auditor reply contract,
 * `parseCrossRoundAuditorReply`, and `evaluateCrossRoundInversion` all change,
 * and `associationMatrix`/`solveColumnAssignment`/`rankColumnGuesses` are
 * gone. Both earlier protocol and policy records are preserved verbatim with
 * their own ids, and `blind-inversion@0.1-probe` remains untouched.
 */
export const SUBSTRATE_VERSION = "0.5.0";
