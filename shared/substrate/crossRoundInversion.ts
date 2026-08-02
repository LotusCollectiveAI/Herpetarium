/**
 * Cross-round referent-evidence audit.
 *
 * `inversion.ts` audits ONE clue against ONE secret keyword and asks "would a
 * capable opponent name this target from this clue alone?". That instrument is
 * structurally blind to the channel that actually loses Decrypto games: a new
 * clue does not have to reveal its keyword, it only has to reveal its NUMBER.
 * Once a round resolves, the code is public, so every past clue is publicly
 * filed under the digit it encoded. An opponent intercepts by matching a new
 * clue to an established column, never by naming the hidden word.
 *
 * Production incident 2026-08-01 (CROSS_ROUND_COLUMN_LEAK_2026_08_01): round-1
 * red clues Aggregate/Bengal/Firetruck for code 1,3,4; round-2 clues
 * blast/orange/ascent for the same code. Every single-clue audit passed
 * honestly — "orange" really does read as fruit/colour on its own — while the
 * whole code sat in public view through the shared hidden parents
 * Aggregate/blast (QUARRY), Bengal/orange (TIGER), Firetruck/ascent (LADDER).
 *
 * The auditor stays blind to secret state. It receives only the PUBLIC
 * resolved clue ledger (which every opponent already holds) and the three new
 * clues, and it never learns the keywords or the intended code. Deterministic
 * application code compares its blind output to the intended code afterwards.
 *
 * ---- Why 0.1 and 0.2 both failed, and what 0.3 changes ----
 *
 * Two live runs of the exact dated model (deepseek-v4-flash-0731 via
 * OpenRouter/DeepInfra at xhigh -> wire max) scored this incident `pass`.
 * Both traces are preserved verbatim in `fixtures.ts`. Read them before
 * changing anything here; the earlier diagnosis in this file was wrong, and it
 * was wrong in a way that cost a whole design round.
 *
 * `@0.1-probe` asked for per-clue slot rankings and returned
 * blast 4:.45/1:.25/2:.15/3:.15, orange 3:.50/4:.25/2:.15/1:.10,
 * ascent 1:.40/4:.25/2:.20/3:.15. `@0.2-probe` added a complete 4-slot
 * matrix, explicit latent-keyword prose, an explicit one-to-one instruction,
 * and a deterministic global assignment over the 24 legal codes. At 26,716
 * reasoning tokens it returned blast 4:.80, orange 3:.85, ascent 1:.65 and
 * declared [4,3,1].
 *
 * THE DECISIVE FACT: the 0.1 marginals already argmax to [4,3,1], which is a
 * LEGAL permutation. There was never a duplicate slot, never a collision,
 * never an illegal joint hypothesis. The global assignment 0.2 added returns
 * [4,3,1] from those same marginals and changes nothing. 0.2's latent-parent
 * prose did not repair the elicitation either — it made the identical error
 * MORE confident, moving blast->slot4 from .45 to .80.
 *
 * The real failure is a confident 1<->4 SWAP in the latent-parent inference.
 * The model took blast~Firetruck via FIRE and ascent~Aggregate via RISING
 * TOTAL, missing blast~Aggregate via QUARRY and ascent~Firetruck via LADDER.
 * Only orange~Bengal via TIGER was right. Blue failed the same way: the solve
 * returned [1,4,3] at margin .38 against an intended [4,1,3], because
 * crown+treetop => a hidden TREE genuinely competes with crown+turret => a
 * hidden CASTLE.
 *
 * So the defect was never the joint step and never the confidence floor. It
 * is that the instrument asked the WRONG QUESTION:
 *
 *     0.1/0.2 asked "did this auditor identify the code?"
 *     0.3 asks  "is this code identifiable from public history?"
 *
 * Those two questions differ exactly when the latent-parent inference is
 * ambiguous — which is the common case, because one ledger clue underdetermines
 * its keyword. `Aggregate` is an honest clue for QUARRY or for a running
 * total; `crown` for CASTLE or for TREE. A point-estimate auditor must pick a
 * branch and can pick the wrong one on a genuine two-way. The gate can then
 * report `pass` while a serious alternative sharply narrows the opponent's
 * search. That is not evidence of opacity.
 *
 * 0.3 therefore elicits EVIDENCE rather than a verdict, in two layers:
 *
 *   1. `historyMatches` — for each clue, against each of the four slots, a
 *      salient ordinary `sharedReferent` hypothesis (a hidden word that could
 *      naturally have produced both this clue and something already filed
 *      under that slot) or null, with a qualitative `strength`. This is
 *      per-edge and NON-COMPETITIVE: one clue may carry a strong bridge to two
 *      different slots, and recording both is the entire point. The 0.1/0.2
 *      confidence was normalised across slots, so reporting the second-best
 *      bridge cost the model probability mass on its first.
 *   2. `codeHypotheses` — a small credible set of legal codes that
 *      deliberately PRESERVES equal-support alternatives instead of forcing
 *      one.
 *
 * Recovery is then a property of the evidence, not of the auditor's pick.
 *
 * ---- WHAT THIS STILL DOES NOT FIX, stated plainly ----
 *
 * v0.3 HAS NOW BEEN RUN LIVE, on 2026-08-02, and IT FAILED THE BOUNDARY.
 * Red hard-vetoed and the post-incident shaped input passed, but BLUE PASSED
 * WHERE IT MUST HARD-VETO, so `releaseBoundarySatisfied` is false and this
 * instrument is not releasable. The parsed evidence record is
 * `CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02` in `fixtures.ts`; its report is
 * committed at `docs/evidence/cross-round-v03-live-20260802T041600Z.json`.
 * Exact raw assistant text and complete executing-source lineage were not
 * preserved, so exact provider-run reproducibility is not established.
 *
 * Read that record for what it is: n = 1 per case. It is an existence proof of
 * a miss, not a rate, and cannot estimate repeat stability in either direction.
 *
 * What IS established, deterministically and independent of sample size: the
 * reply is not reachable by changing the published threshold fields. Sweeping
 * all 1944 legal hard-tier configurations against the parsed Blue reply
 * hard-vetoes it in ZERO of them, because the fixed decision logic gates every
 * tier on `intendedBelieved` and the intended code is absent from the credible
 * set. This rules out a threshold-only repair. It does not distinguish a
 * broader elicitation from redesigning that fixed membership requirement. See
 * `CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02` and
 * `scripts/test-cross-round-v03-postmortem.ts`.
 *
 * TWO SELF-INCONSISTENCIES IN THIS PROMPT are recorded here as PRE-REGISTERED
 * CANDIDATE REPAIRS for a future `@0.4-probe`. They are deliberately NOT
 * applied, because changing the prompt moves `CROSS_ROUND_AUDITOR_PROMPT_HASH`
 * and would destroy the baseline arm the next experiment needs:
 *   1. `strong` is defined below as "you would act on that placement from the
 *      ledger alone" — a single-action decision predicate — three lines before
 *      the grid is declared a set of INDEPENDENT judgements. You cannot act on
 *      two placements for one clue. The format was de-normalised in v0.3; this
 *      sentence re-imports the competition the format removed, and the observed
 *      Blue grid is a perfect partial permutation with zero slot collisions at
 *      `plausible` or better, which is the signature of an assignment solve.
 *   2. The system text says an empty slot "remains a legal placement, but only
 *      by elimination", but `composeCrossRoundAuditorTask` drops that clause
 *      from the rendered task, and STEP 2 never asks for an elimination pass.
 *      Blue's intended code REQUIRES placing a clue on the history-free slot 4.
 * Neither is established as causal. Each predicts one of the two independent
 * failures actually observed, which is why they are worth testing rather than
 * assuming.
 *
 * A RETRACTED inference, recorded so it is not re-derived. An earlier draft
 * argued from slot 2 of the v0.2 trace — which was empty — that the model had
 * affirmatively judged the true bridges "worse than nothing", and concluded
 * this was a model-capability limit. That argument was invalid. The v0.2
 * prompt told the auditor: "A slot with no past clues gives you nothing to
 * match, so score it only from the clue itself; it is still a legal answer and
 * is sometimes the only placement left." Those values therefore conflate
 * clue-alone plausibility with elimination value; they are not a calibrated
 * no-information baseline for shared-referent strength, and comparing .20/.30
 * against .45/.50 establishes nothing about latent-parent judgement. The raw
 * scores are preserved in `fixtures.ts`; the inference drawn from them is
 * withdrawn. Only a live v0.3 trace can establish how v0.3 behaves.
 *
 * The hand-authored fixtures in conformance are labelled for what they are:
 * tests of TIER SHAPE and of the parse/evaluate contract. They are NOT
 * predictions about any model. Fabricating an optimistic reply and calling it
 * a regression is precisely the error that shipped 0.2.
 *
 * ---- What v0.3 binds, beyond the two layers ----
 *
 * Every non-`none` cell must carry the EXACT public clue it bridges from,
 * copied out of that ledger slot. A cell naming a clue from another slot, a
 * clue that is not in the ledger at all, or any claim on an empty slot is a
 * hard reject. This is the cheapest available check on hallucinated evidence:
 * it does not verify that the referent is a good one, but it does make the
 * bridge point at a real, checkable, public object rather than at nothing.
 *
 * Every evidence row must carry its own `clueIndex`. The parser attaches
 * caller-owned clue TEXT by position, but position alone is not identity — a
 * model that silently reorders its rows would previously have had its rows
 * relabelled to match the caller's order and nobody would have noticed.
 *
 * Credible-set ordering is NOT read. Array order is ignored entirely and each
 * hypothesis carries a machine-readable `support` tier. The tiers count only
 * hypotheses supported STRICTLY more strongly than the intended one and read
 * credible-set size separately. Permuting equally-supported entries cannot
 * change the verdict.
 *
 * Veto tiers live here, not in either app, so The Table's runtime gate and
 * Herpetarium's evaluations cannot silently diverge.
 */
import { CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY } from "./fixtures";
import { contentHash } from "./hash";
import type { InversionVetoOutcome } from "./inversion";

export const CROSS_ROUND_INVERSION_PROTOCOL_VERSION =
  "cross-round-referent-evidence@0.3-probe";
export const CROSS_ROUND_COLUMN_VETO_POLICY_ID =
  "cross-round-referent-evidence-veto@2026-08-01";
export const CROSS_ROUND_COLUMN_VETO_POLICY_HASH = contentHash(
  CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
);

/** The four numbered keyword slots every Decrypto team holds. */
export const CLUE_COLUMN_NUMBERS: readonly number[] = [1, 2, 3, 4];

/**
 * Qualitative bridge strength, ascending. Deliberately NOT a probability.
 *
 * A probability over slots is normalised and therefore competitive: naming a
 * second bridge costs the first. These are independent judgements about
 * individual clue-to-slot bridges, so a clue with two genuine parents scores
 * both — which is exactly the state the 2026-08-01 incidents were in and
 * exactly what the earlier formats could not express.
 */
export const REFERENT_STRENGTHS = [
  "none",
  "weak",
  "plausible",
  "strong",
] as const;
export type ReferentStrength = (typeof REFERENT_STRENGTHS)[number];

/** Ascending index for policy-controlled bridge thresholds. */
function referentRank(strength: ReferentStrength): number {
  return REFERENT_STRENGTHS.indexOf(strength);
}

export interface PublicLedgerColumn {
  /** Keyword slot, 1..4. */
  number: number;
  /** This team's resolved public clues for that slot, oldest first. */
  clues: string[];
}

/** Always four columns, numbers 1..4 ascending. Public information only. */
export type PublicClueLedger = PublicLedgerColumn[];

export interface ResolvedClueRound {
  clues: readonly [string, string, string];
  code: readonly [number, number, number];
}

/**
 * One cell of the evidence grid: would an opponent, seeing only the public
 * clues, readily discover a single ordinary hidden word that could have
 * produced BOTH this clue and one already filed under this slot?
 */
export interface HistoryMatch {
  /** Keyword slot, 1..4. */
  number: number;
  /**
   * The auditor's hypothesised hidden word, or null when it found none.
   *
   * This is a HYPOTHESIS the auditor invents, not supplied truth. Earlier
   * prompts told the auditor it "must not invent" keywords while simultaneously
   * requiring it to reason through them, which is a contradiction the model
   * resolved by guessing silently and reporting only the winner.
   */
  sharedReferent: string | null;
  /**
   * The EXACT public clue this bridge runs from, copied out of that ledger
   * slot, or null when there is no bridge.
   *
   * This is what makes a claimed bridge falsifiable. The evaluator checks the
   * string against the ledger slot it was filed under, so a cell quoting
   * another slot's clue, a clue that is not in the ledger at all, or any claim
   * on an empty slot is rejected outright. It does not verify that the
   * referent is a GOOD one — nothing here can — but it forces the bridge to
   * point at a real, checkable, public object.
   */
  publicClue: string | null;
  strength: ReferentStrength;
}

export interface CrossRoundClueAudit {
  /** 1-based position of this clue in the caller's submission. */
  clueIndex: number;
  clue: string;
  /** Exactly one entry per slot, 1..4, in whatever order it was returned. */
  historyMatches: HistoryMatch[];
}

/**
 * Qualitative support for one candidate code, ascending. Machine-readable on
 * purpose: an earlier draft carried only free text plus array position, so
 * equal-support alternatives were indistinguishable from a strict ranking and
 * permuting two tied entries silently changed the verdict.
 */
export const HYPOTHESIS_SUPPORTS = ["weak", "plausible", "strong"] as const;
export type HypothesisSupport = (typeof HYPOTHESIS_SUPPORTS)[number];

/** One legal code the auditor considers credible, with its qualitative case. */
export interface CodeHypothesis {
  code: readonly [number, number, number];
  support: HypothesisSupport;
  /** Optional short prose, recorded for human review and never scored. */
  rationale: string | null;
}

export interface CrossRoundAuditorReply {
  audits: CrossRoundClueAudit[];
  /**
   * The credible set. Small on purpose: a set approaching the full 24 legal
   * codes says nothing, and one forced down to a single entry throws away the
   * ambiguity that IS the leak.
   *
   * ARRAY ORDER IS NOT READ. Ordering is `support` alone, so two equally
   * supported codes are genuinely equal and the evaluator is invariant to
   * their order.
   */
  codeHypotheses: CodeHypothesis[];
}

/** Ascending index of a support tier, for order-free comparison. */
function supportRank(support: HypothesisSupport): number {
  return HYPOTHESIS_SUPPORTS.indexOf(support);
}

/** Upper bound on a serious credible set. See the policy record for why. */
export const MAX_CODE_HYPOTHESES = 6;

/**
 * The intended hypothesis must be believed at least this much before any veto.
 * `weak` is the bottom tier, so without an absolute floor a relative count
 * treats the auditor's own least-credible entry as evidence against the team.
 */
export const MINIMUM_HARD_VETO_SUPPORT: HypothesisSupport =
  CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY.minimumHardVetoSupport;

/** The 24 legal codes: three DISTINCT slots from 1..4, in published order. */
export const LEGAL_CODE_TRIPLES: readonly (readonly [
  number,
  number,
  number,
])[] = CLUE_COLUMN_NUMBERS.flatMap((first) =>
  CLUE_COLUMN_NUMBERS.filter((second) => second !== first).flatMap((second) =>
    CLUE_COLUMN_NUMBERS.filter(
      (third) => third !== first && third !== second,
    ).map((third) => [first, second, third] as const),
  ),
);

/**
 * Extract the first complete JSON object from a model reply.
 *
 * Direct JSON and fenced JSON are tried first. The balanced-object fallback is
 * string-aware and keeps scanning after an invalid object, so prose, a broken
 * example, or a trailing object cannot make Table and Herpetarium accept
 * different bytes. This parser lives with the instrument specifically to keep
 * its accept/reject population shared.
 */
function extractCrossRoundJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to tolerant extraction.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // Fall through: a later valid object may still be the answer.
    }
  }

  for (let start = trimmed.indexOf("{"); start >= 0; ) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index]!;
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
    start = trimmed.indexOf("{", start + 1);
  }
  throw new Error("Cross-round reply did not contain valid JSON");
}

function parseCodeTriple(
  raw: unknown,
  label: string,
): [number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new Error(`${label} must be an array of 3 slots`);
  }
  const seen = new Set<number>();
  const code = raw.map((slot, index) => {
    if (
      typeof slot !== "number" ||
      !Number.isInteger(slot) ||
      !CLUE_COLUMN_NUMBERS.includes(slot)
    ) {
      throw new Error(`${label} entry ${index + 1} must be an integer 1 to 4`);
    }
    if (seen.has(slot)) {
      throw new Error(`${label} must name three distinct slots`);
    }
    seen.add(slot);
    return slot;
  });
  return code as [number, number, number];
}

/**
 * Parse one shared auditor reply and bind evidence to caller-owned clue
 * positions. Unknown object keys are ignored deliberately; both apps must
 * have one accept set for this versioned instrument.
 *
 * The model cannot relabel which clue an evidence row belongs to: row order is
 * the caller's clue order, and the clue text is attached here rather than read
 * from the reply.
 */
export function parseCrossRoundAuditorReply(
  text: string,
  clues: readonly [string, string, string],
): CrossRoundAuditorReply {
  const parsed = extractCrossRoundJsonObject(text) as {
    historyMatches?: unknown;
    codeHypotheses?: unknown;
  };
  if (
    !Array.isArray(parsed.historyMatches) ||
    parsed.historyMatches.length !== clues.length
  ) {
    throw new Error("cross-round reply must contain exactly 3 historyMatches");
  }
  if (
    !Array.isArray(parsed.codeHypotheses) ||
    parsed.codeHypotheses.length < 1 ||
    parsed.codeHypotheses.length > MAX_CODE_HYPOTHESES
  ) {
    throw new Error(
      `cross-round reply must contain 1 to ${MAX_CODE_HYPOTHESES} codeHypotheses`,
    );
  }

  const seenClueIndexes = new Set<number>();
  const audits = parsed.historyMatches.map((rawEntry, entryIndex) => {
    if (
      typeof rawEntry !== "object" ||
      rawEntry === null ||
      Array.isArray(rawEntry)
    ) {
      throw new Error(
        `cross-round historyMatches ${entryIndex + 1} is not an object`,
      );
    }
    const entry = rawEntry as { clueIndex?: unknown; matches?: unknown };
    // ROW IDENTITY. The caller owns the clue TEXT, but position alone is not
    // identity: a model that silently reordered its rows used to have them
    // relabelled to match the caller's order with nobody the wiser. Require
    // the model to state which clue each row is about, and reject any
    // disagreement rather than repairing it.
    if (
      typeof entry.clueIndex !== "number" ||
      !Number.isInteger(entry.clueIndex) ||
      entry.clueIndex < 1 ||
      entry.clueIndex > clues.length
    ) {
      throw new Error(
        `cross-round historyMatches ${entryIndex + 1} needs an integer clueIndex from 1 to ${clues.length}`,
      );
    }
    if (seenClueIndexes.has(entry.clueIndex)) {
      throw new Error(
        `cross-round historyMatches repeats clueIndex ${entry.clueIndex}`,
      );
    }
    seenClueIndexes.add(entry.clueIndex);
    if (entry.clueIndex !== entryIndex + 1) {
      throw new Error(
        `cross-round historyMatches ${entryIndex + 1} is out of order: clueIndex ${entry.clueIndex}`,
      );
    }
    if (
      !Array.isArray(entry.matches) ||
      entry.matches.length !== CLUE_COLUMN_NUMBERS.length
    ) {
      throw new Error(
        `cross-round historyMatches ${entryIndex + 1} must cover all 4 slots`,
      );
    }

    const seenSlots = new Set<number>();
    const historyMatches = entry.matches.map((rawMatch, matchIndex) => {
      const label = `cross-round match ${entryIndex + 1}.${matchIndex + 1}`;
      if (
        typeof rawMatch !== "object" ||
        rawMatch === null ||
        Array.isArray(rawMatch)
      ) {
        throw new Error(`${label} is not an object`);
      }
      const match = rawMatch as {
        slot?: unknown;
        sharedReferent?: unknown;
        publicClue?: unknown;
        strength?: unknown;
      };
      if (
        typeof match.slot !== "number" ||
        !Number.isInteger(match.slot) ||
        !CLUE_COLUMN_NUMBERS.includes(match.slot)
      ) {
        throw new Error(`${label} slot must be an integer from 1 to 4`);
      }
      if (seenSlots.has(match.slot)) {
        throw new Error(`${label} repeats slot ${match.slot}`);
      }
      seenSlots.add(match.slot);
      if (
        typeof match.strength !== "string" ||
        !(REFERENT_STRENGTHS as readonly string[]).includes(match.strength)
      ) {
        throw new Error(
          `${label} strength must be one of ${REFERENT_STRENGTHS.join(", ")}`,
        );
      }
      const strength = match.strength as ReferentStrength;
      const optionalText = (value: unknown, field: string): string | null => {
        if (value === null || value === undefined) return null;
        if (typeof value !== "string") {
          throw new Error(`${label} ${field} must be a string or null`);
        }
        const trimmed = value.trim();
        if (trimmed.length === 0) return null;
        if (trimmed.length > 200) {
          throw new Error(`${label} ${field} must be 1-200 characters`);
        }
        return trimmed;
      };
      const sharedReferent = optionalText(
        match.sharedReferent,
        "sharedReferent",
      );
      const publicClue = optionalText(match.publicClue, "publicClue");
      // A bridge is a triple: a strength, the hidden word it runs through, and
      // the exact public clue it runs from. Any two without the third is an
      // incoherent row, and accepting one would let the evidence layer drift
      // into free text the evaluator cannot check.
      const claimed = strength !== "none";
      if (
        claimed !== (sharedReferent !== null) ||
        claimed !== (publicClue !== null)
      ) {
        throw new Error(
          `${label} must pair a strength above none with both a sharedReferent and the exact publicClue it bridges from`,
        );
      }
      return { number: match.slot, sharedReferent, publicClue, strength };
    });

    return {
      clueIndex: entry.clueIndex,
      clue: clues[entryIndex]!,
      historyMatches,
    };
  });

  const seenCodes = new Set<string>();
  const codeHypotheses = parsed.codeHypotheses.map((rawHypothesis, index) => {
    const label = `cross-round codeHypothesis ${index + 1}`;
    if (
      typeof rawHypothesis !== "object" ||
      rawHypothesis === null ||
      Array.isArray(rawHypothesis)
    ) {
      throw new Error(`${label} is not an object`);
    }
    const hypothesis = rawHypothesis as {
      code?: unknown;
      support?: unknown;
      rationale?: unknown;
    };
    const code = parseCodeTriple(hypothesis.code, `${label} code`);
    const key = code.join(",");
    if (seenCodes.has(key)) {
      throw new Error(`${label} repeats code ${key}`);
    }
    seenCodes.add(key);
    if (
      typeof hypothesis.support !== "string" ||
      !(HYPOTHESIS_SUPPORTS as readonly string[]).includes(hypothesis.support)
    ) {
      throw new Error(
        `${label} support must be one of ${HYPOTHESIS_SUPPORTS.join(", ")}`,
      );
    }
    let rationale: string | null = null;
    if (hypothesis.rationale !== null && hypothesis.rationale !== undefined) {
      if (typeof hypothesis.rationale !== "string") {
        throw new Error(`${label} rationale must be a string or null`);
      }
      const trimmed = hypothesis.rationale.trim();
      if (trimmed.length > 400) {
        throw new Error(`${label} rationale must be at most 400 characters`);
      }
      rationale = trimmed.length > 0 ? trimmed : null;
    }
    return {
      code,
      support: hypothesis.support as HypothesisSupport,
      rationale,
    };
  });

  return { audits, codeHypotheses };
}

export interface CrossRoundPositionEvaluation {
  clue: string;
  intendedNumber: number;
  /** Did the intended column already carry public clue history? */
  columnHadHistory: boolean;
  /** The auditor's bridge hypothesis for the INTENDED slot, if any. */
  intendedSharedReferent: string | null;
  /** The exact public clue that bridge runs from, verified against the ledger. */
  intendedPublicClue: string | null;
  intendedStrength: ReferentStrength;
  /**
   * An opponent-actionable historical bridge onto the intended column:
   * plausible or strong AND the column actually carries history. A bridge
   * claimed on an empty column is not evidence of anything and cannot reach
   * this flag.
   */
  intendedHistoryEdge: boolean;
  /** The same, restricted to `strong`. */
  intendedStrongHistoryEdge: boolean;
  /**
   * The intended slot has no public history, yet some credible hypothesis
   * still places this clue there — i.e. it was reached only because the other
   * slots were taken. Recorded, never counted as evidence.
   */
  eliminationOnly: boolean;
  /** How many credible hypotheses place this clue on its intended slot. */
  hypothesesOnIntendedSlot: number;
}

export interface CrossRoundInversionEvaluation {
  outcome: InversionVetoOutcome;
  positions: CrossRoundPositionEvaluation[];
  /** How many of the three intended columns carried public history. */
  historyBearingPositions: number;
  /**
   * How many hypotheses the auditor believes MORE than the intended one; null
   * when the intended code is absent. Computed from support tiers alone, so it
   * is invariant to array order and to changes in weaker entries.
   */
  dominatingHypotheses: number | null;
  /** How many others share the intended hypothesis's tier. */
  coDominatingHypotheses: number | null;
  /** The intended hypothesis's own support tier, or null when absent. */
  intendedSupport: HypothesisSupport | null;
  credibleSetSize: number;
  /** Intended positions with an opponent-actionable historical bridge. */
  actionableIntendedEdges: number;
  /** Intended positions whose historical bridge is `strong`. */
  strongIntendedEdges: number;
  eliminationOnlyPositions: number;
  hardVeto: boolean;
  softRegenerateOnce: boolean;
}

/**
 * Every executable threshold represented in the hashed policy record.
 *
 * Keeping these fields injectable is not test convenience: if the recorded
 * policy hash can change a value that the evaluator ignores, telemetry can
 * claim one policy while gameplay executes another.
 */
export interface CrossRoundInversionPolicy {
  hardVetoDominatedByAtMost: number;
  softVetoDominatedByAtMost: number;
  hardVetoCredibleSetSizeAtMost: number;
  minimumHardVetoSupport: HypothesisSupport;
  minimumActionableReferentStrength: ReferentStrength;
  hardVetoMinimumActionableEdges: number;
  softVetoMinimumActionableEdges: number;
  softVetoNarrowDominatedByAtMost: number;
  softVetoNarrowMinimumActionableEdges: number;
  requiresAtLeastOneStrongIntendedEdge: boolean;
  maxCodeHypotheses: number;
}

/**
 * Fold resolved rounds into the public per-column clue ledger.
 *
 * Callers MUST pass only rounds whose code has been publicly revealed. A live
 * round's code is secret, and filing its clues under their true numbers would
 * hand the auditor the answer it is supposed to have to infer.
 */
export function buildPublicClueLedger(
  rounds: readonly ResolvedClueRound[],
): PublicClueLedger {
  const ledger: PublicClueLedger = CLUE_COLUMN_NUMBERS.map((number) => ({
    number,
    clues: [],
  }));
  for (const round of rounds) {
    for (let index = 0; index < 3; index += 1) {
      const number = round.code[index];
      const clue = round.clues[index];
      if (number === undefined || clue === undefined) continue;
      const column = ledger.find((candidate) => candidate.number === number);
      if (column) column.clues.push(clue);
    }
  }
  return ledger;
}

export function publicLedgerClueCount(ledger: PublicClueLedger): number {
  return ledger.reduce((total, column) => total + column.clues.length, 0);
}

/**
 * Whether any column carries public history at all.
 *
 * The runtime gates the auditor call on THIS predicate rather than on the
 * intended code, so the mere existence of a cross-round audit call carries no
 * information about which columns the live code names.
 */
export function publicLedgerHasHistory(ledger: PublicClueLedger): boolean {
  return publicLedgerClueCount(ledger) > 0;
}

export function ledgerColumnHasHistory(
  ledger: PublicClueLedger,
  number: number,
): boolean {
  const column = ledger.find((candidate) => candidate.number === number);
  return column !== undefined && column.clues.length > 0;
}

function assertValidLedger(ledger: PublicClueLedger): void {
  if (
    ledger.length !== CLUE_COLUMN_NUMBERS.length ||
    !ledger.every(
      (column, index) =>
        column.number === CLUE_COLUMN_NUMBERS[index] &&
        Array.isArray(column.clues) &&
        column.clues.every(
          (clue) =>
            typeof clue === "string" &&
            clue.trim().length > 0 &&
            clue.length <= 200,
        ),
    )
  ) {
    throw new Error("Cross-round ledger must carry columns 1..4 in order");
  }
}

/**
 * Apply the shared cross-round veto tiers.
 *
 * `policy` remains injectable for calibration probes. Product and research
 * runtime callers omit it and therefore execute the versioned shared policy.
 *
 * This function is exported substrate surface and is the only thing standing
 * between a malformed audit and a silent `pass`. It re-validates rather than
 * trusting whichever app-side parser happened to produce the input.
 */
export function evaluateCrossRoundInversion(
  reply: CrossRoundAuditorReply,
  intendedCode: readonly [number, number, number],
  ledger: PublicClueLedger,
  policy: CrossRoundInversionPolicy = CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
): CrossRoundInversionEvaluation {
  assertValidLedger(ledger);
  if (!Array.isArray(intendedCode) || intendedCode.length !== 3) {
    throw new Error("Cross-round intended code must have exactly 3 positions");
  }
  const intendedNumbers = new Set<number>();
  for (const intendedNumber of intendedCode) {
    if (
      !Number.isInteger(intendedNumber) ||
      !CLUE_COLUMN_NUMBERS.includes(intendedNumber) ||
      intendedNumbers.has(intendedNumber)
    ) {
      throw new Error(
        "Cross-round intended code must contain three distinct columns from 1 to 4",
      );
    }
    intendedNumbers.add(intendedNumber);
  }

  const audits = reply?.audits;
  const codeHypotheses = reply?.codeHypotheses;
  if (!Array.isArray(audits) || audits.length !== intendedCode.length) {
    throw new Error(
      "Cross-round audits and intended code must have equal length",
    );
  }
  if (
    !Array.isArray(codeHypotheses) ||
    codeHypotheses.length < 1 ||
    codeHypotheses.length > MAX_CODE_HYPOTHESES
  ) {
    throw new Error(
      `Cross-round reply must carry 1 to ${MAX_CODE_HYPOTHESES} code hypotheses`,
    );
  }
  if (
    !Number.isInteger(policy.hardVetoDominatedByAtMost) ||
    !Number.isInteger(policy.softVetoDominatedByAtMost) ||
    !Number.isInteger(policy.hardVetoCredibleSetSizeAtMost) ||
    !Number.isInteger(policy.maxCodeHypotheses) ||
    policy.hardVetoDominatedByAtMost < 0 ||
    policy.softVetoDominatedByAtMost < policy.hardVetoDominatedByAtMost ||
    policy.maxCodeHypotheses < 1 ||
    policy.maxCodeHypotheses > MAX_CODE_HYPOTHESES ||
    policy.softVetoDominatedByAtMost >= policy.maxCodeHypotheses ||
    policy.hardVetoCredibleSetSizeAtMost < 1 ||
    policy.hardVetoCredibleSetSizeAtMost > policy.maxCodeHypotheses ||
    !(HYPOTHESIS_SUPPORTS as readonly string[]).includes(
      policy.minimumHardVetoSupport,
    ) ||
    !(REFERENT_STRENGTHS as readonly string[]).includes(
      policy.minimumActionableReferentStrength,
    ) ||
    policy.minimumActionableReferentStrength === "none" ||
    !Number.isInteger(policy.hardVetoMinimumActionableEdges) ||
    !Number.isInteger(policy.softVetoMinimumActionableEdges) ||
    !Number.isInteger(policy.softVetoNarrowDominatedByAtMost) ||
    !Number.isInteger(policy.softVetoNarrowMinimumActionableEdges) ||
    policy.hardVetoMinimumActionableEdges < 1 ||
    policy.hardVetoMinimumActionableEdges > intendedCode.length ||
    policy.softVetoMinimumActionableEdges < 1 ||
    policy.softVetoMinimumActionableEdges > intendedCode.length ||
    policy.softVetoNarrowDominatedByAtMost < 0 ||
    policy.softVetoNarrowDominatedByAtMost >
      policy.softVetoDominatedByAtMost ||
    policy.softVetoNarrowMinimumActionableEdges < 1 ||
    policy.softVetoNarrowMinimumActionableEdges > intendedCode.length ||
    typeof policy.requiresAtLeastOneStrongIntendedEdge !== "boolean"
  ) {
    throw new Error(
      "Cross-round policy must carry executable support, strong-edge and set-size thresholds within the protocol cap",
    );
  }
  if (codeHypotheses.length > policy.maxCodeHypotheses) {
    throw new Error(
      `Cross-round reply exceeds the policy cap of ${policy.maxCodeHypotheses} code hypotheses`,
    );
  }

  // Everything below re-validates rather than trusting whichever app-side
  // parser produced the input. This function is exported substrate surface and
  // is the last thing between a malformed audit and a silent `pass`; an app
  // that hand-builds a reply must not be able to reach the tiers with one.
  const seenHypotheses = new Set<string>();
  for (const [index, hypothesis] of codeHypotheses.entries()) {
    const label = `Cross-round hypothesis ${index + 1}`;
    if (
      typeof hypothesis !== "object" ||
      hypothesis === null ||
      Array.isArray(hypothesis)
    ) {
      throw new Error(`${label} is not an object`);
    }
    const code = parseCodeTriple(hypothesis.code, `${label} code`);
    const key = code.join(",");
    if (seenHypotheses.has(key)) {
      throw new Error("Cross-round code hypotheses must be unique");
    }
    seenHypotheses.add(key);
    if (
      typeof hypothesis.support !== "string" ||
      !(HYPOTHESIS_SUPPORTS as readonly string[]).includes(hypothesis.support)
    ) {
      throw new Error(
        `${label} support must be one of ${HYPOTHESIS_SUPPORTS.join(", ")}`,
      );
    }
    if (hypothesis.rationale !== null) {
      if (
        typeof hypothesis.rationale !== "string" ||
        hypothesis.rationale.length > 400
      ) {
        throw new Error(
          `${label} rationale must be null or at most 400 characters`,
        );
      }
    }
  }

  const seenClueIndexes = new Set<number>();
  for (const [index, audit] of audits.entries()) {
    const label = `Cross-round audit ${index + 1}`;
    if (typeof audit !== "object" || audit === null || Array.isArray(audit)) {
      throw new Error(`${label} is not an object`);
    }
    if (typeof audit.clue !== "string" || audit.clue.trim().length === 0) {
      throw new Error("Cross-round audit must carry non-empty clue text");
    }
    if (
      !Number.isInteger(audit.clueIndex) ||
      audit.clueIndex !== index + 1 ||
      seenClueIndexes.has(audit.clueIndex)
    ) {
      throw new Error(
        `${label} must carry clueIndex ${index + 1}; evidence rows may not be reordered`,
      );
    }
    seenClueIndexes.add(audit.clueIndex);
    if (
      !Array.isArray(audit.historyMatches) ||
      audit.historyMatches.length !== CLUE_COLUMN_NUMBERS.length
    ) {
      throw new Error("Cross-round audit must cover all 4 columns");
    }
    const seenNumbers = new Set<number>();
    for (const match of audit.historyMatches) {
      if (typeof match !== "object" || match === null || Array.isArray(match)) {
        throw new Error(`${label} history match is not an object`);
      }
      if (
        !Number.isInteger(match.number) ||
        !CLUE_COLUMN_NUMBERS.includes(match.number)
      ) {
        throw new Error("Cross-round match slot must be an integer from 1 to 4");
      }
      if (seenNumbers.has(match.number)) {
        throw new Error("Cross-round audit cannot repeat a column");
      }
      seenNumbers.add(match.number);
      if (!(REFERENT_STRENGTHS as readonly string[]).includes(match.strength)) {
        throw new Error("Cross-round match strength is not a known value");
      }
      const claimed = match.strength !== "none";
      const referentOk =
        match.sharedReferent === null ||
        (typeof match.sharedReferent === "string" &&
          match.sharedReferent.trim().length > 0 &&
          match.sharedReferent.length <= 200);
      const clueOk =
        match.publicClue === null ||
        (typeof match.publicClue === "string" &&
          match.publicClue.trim().length > 0 &&
          match.publicClue.length <= 200);
      if (!referentOk || !clueOk) {
        throw new Error(
          "Cross-round sharedReferent and publicClue must be null or 1-200 character strings",
        );
      }
      if (
        claimed !== (match.sharedReferent !== null) ||
        claimed !== (match.publicClue !== null)
      ) {
        throw new Error(
          "Cross-round match must pair a strength above none with both a sharedReferent and a publicClue",
        );
      }
      if (!claimed) continue;
      // EXACT LEDGER MEMBERSHIP. The quoted clue must actually sit in the slot
      // the bridge is claimed on. This catches a cell quoting another slot's
      // clue, a clue invented outright, and every claim on an empty column,
      // which by construction has nothing to bridge from.
      const column = ledger.find(
        (candidate) => candidate.number === match.number,
      );
      if (!column || column.clues.length === 0) {
        throw new Error(
          `Cross-round slot ${match.number} has no public history and must report strength none`,
        );
      }
      if (!column.clues.includes(match.publicClue as string)) {
        throw new Error(
          `Cross-round slot ${match.number} bridge quotes a clue that is not filed under it`,
        );
      }
    }
  }

  const intendedKey = intendedCode.join(",");
  const intendedHypothesis = codeHypotheses.find(
    (hypothesis) => hypothesis.code.join(",") === intendedKey,
  );
  // ORDER-FREE SUPPORT COMPARISON. Array position is never read.
  // `dominatingHypotheses` counts only hypotheses the auditor supports MORE
  // strongly than the intended one; `coDominatingHypotheses` separately
  // records equal-support alternatives. Permuting entries therefore cannot
  // move the result.
  //
  // An earlier draft counted "at least as strongly", which had two defects.
  // It was blind to credible-set size, so a 2-entry and a 6-entry set scored
  // identically — contradicting the 24 -> 6 -> 2 -> 1 rationale the tiers are
  // built on. And it was eviction-perverse at the cap: DOWNGRADING an
  // alternative, i.e. believing it less, lowered the count and strengthened
  // the verdict, with no change to the intended code's own evidence.
  // `dominating` is invariant under both, and set size is now read as its own
  // explicit term rather than smuggled through a counting rule.
  const dominatingHypotheses = intendedHypothesis
    ? codeHypotheses.filter(
        (hypothesis) =>
          supportRank(hypothesis.support) >
          supportRank(intendedHypothesis.support),
      ).length
    : null;
  const coDominatingHypotheses = intendedHypothesis
    ? codeHypotheses.filter(
        (hypothesis) =>
          supportRank(hypothesis.support) ===
          supportRank(intendedHypothesis.support),
      ).length - 1
    : null;

  const positions = audits.map((audit, index) => {
    const intendedNumber = intendedCode[index]!;
    const columnHadHistory = ledgerColumnHasHistory(ledger, intendedNumber);
    const match = audit.historyMatches.find(
      (candidate) => candidate.number === intendedNumber,
    );
    const intendedStrength: ReferentStrength = match?.strength ?? "none";
    const actionable =
      referentRank(intendedStrength) >=
      referentRank(policy.minimumActionableReferentStrength);
    const hypothesesOnIntendedSlot = codeHypotheses.filter(
      (hypothesis) => hypothesis.code[index] === intendedNumber,
    ).length;
    return {
      clue: audit.clue,
      intendedNumber,
      columnHadHistory,
      intendedSharedReferent: match?.sharedReferent ?? null,
      intendedPublicClue: match?.publicClue ?? null,
      intendedStrength,
      intendedHistoryEdge: columnHadHistory && actionable,
      intendedStrongHistoryEdge:
        columnHadHistory && intendedStrength === "strong",
      eliminationOnly: !columnHadHistory && hypothesesOnIntendedSlot > 0,
      hypothesesOnIntendedSlot,
    } satisfies CrossRoundPositionEvaluation;
  });

  const historyBearingPositions = positions.filter(
    (position) => position.columnHadHistory,
  ).length;
  const actionableIntendedEdges = positions.filter(
    (position) => position.intendedHistoryEdge,
  ).length;
  const strongIntendedEdges = positions.filter(
    (position) => position.intendedStrongHistoryEdge,
  ).length;
  const eliminationOnlyPositions = positions.filter(
    (position) => position.eliminationOnly,
  ).length;

  // EVERY tier requires BOTH layers. There is no evidence-only clause and no
  // rank-only clause, and that is a correction, not a stylistic choice.
  //
  // A draft of this policy hard-vetoed on `strongIntendedEdges >= 2` alone.
  // That clause has model-independent code-match breadth: whatever the
  // auditor's quality, some fraction of the 24 possible intended codes
  // hard-veto on a fixed reply purely by matching its strong cells.
  //
  // SHARPENED 2026-08-02, and the correction makes the rejected clause look
  // WORSE, not better. The figure previously recorded here was "for ANY reply
  // carrying three strong cells, exactly 4 of 24, so 16.7%". Two errors:
  //   - 16.7% is a MAXIMUM over three-strong-cell replies, not a floor. Over
  //     the 64 replies with one strong cell per clue, 60 give exactly 4/24 and
  //     4 give 0/24 (mean 3.75/24 = 15.6%). It is exactly 4/24 whenever the
  //     three strong cells form a legal code.
  //   - It is not a bound at all once a reply carries more strong cells, and
  //     nothing caps that. At two strong slots per clue it is 12/24 = 50%; at
  //     three, 20/24 = 83.3%; at a saturated grid, 24/24 = 100%.
  // So the evidence layer's entire selectivity is grid SPARSITY, and it decays
  // to nothing well before saturation. Any redesign that makes the auditor
  // more forthcoming per cell — which is the obvious response to a missed cell
  // — buys recall by spending exactly this. Measure breadth when you do it.
  //
  // The clean statement, since an injective strong-cell grid IS a legal code:
  // `strongIntendedEdges >= t` is the Hamming ball of radius 3 - t around that
  // code, so the counts are 13/24, 4/24 and 1/24 for t = 1, 2 and 3.
  //
  // Symmetrically, a rank-only clause is worth roughly k/24 against a null
  // auditor emitting k legal codes — but only because `credibleSetSizeAtMost`
  // truncates it to zero above k = 3. That cap is the sole reason the rank
  // layer is bounded; without it the rank layer is worth k/24 unboundedly.
  //
  // The two layers are not independent — the credible set is built from the
  // evidence grid — so conjoining them is not a probability product. It is
  // simply the strictest reading available, and after two live failures the
  // strictest reading is the only defensible default.
  //
  // Both counts include only history-bearing columns, so this instrument stays
  // aimed at the cross-round channel instead of re-litigating single-clue
  // transparency, which `inversion.ts` owns. No tier reads a numeric
  // confidence.
  // An ABSOLUTE belief floor, not merely a relative one. Because `weak` is the
  // bottom tier, a relative count made every entry in a set count as "at least
  // as supported as the weakest", so a reply saying in plain English "I
  // strongly believe A; the intended code is a weak also-ran" hard-vetoed. A
  // hard veto must never fire on the auditor's own lowest-belief entry.
  const intendedBelieved =
    intendedHypothesis !== undefined &&
    supportRank(intendedHypothesis.support) >=
      supportRank(policy.minimumHardVetoSupport);
  const hardVeto =
    intendedBelieved &&
    dominatingHypotheses !== null &&
    dominatingHypotheses <= policy.hardVetoDominatedByAtMost &&
    codeHypotheses.length <= policy.hardVetoCredibleSetSizeAtMost &&
    actionableIntendedEdges >= policy.hardVetoMinimumActionableEdges &&
    // At least one bridge the auditor would act on. `strength` is admitted
    // uncalibrated, so this is the cheapest guard against a reply that calls
    // everything `plausible`; both 2026-08-01 incidents clear it.
    (!policy.requiresAtLeastOneStrongIntendedEdge ||
      strongIntendedEdges >= 1);
  const softRegenerateOnce =
    !hardVeto &&
    intendedBelieved &&
    dominatingHypotheses !== null &&
    ((dominatingHypotheses <= policy.softVetoDominatedByAtMost &&
      actionableIntendedEdges >= policy.softVetoMinimumActionableEdges) ||
      (dominatingHypotheses <= policy.softVetoNarrowDominatedByAtMost &&
        actionableIntendedEdges >=
          policy.softVetoNarrowMinimumActionableEdges));
  const outcome: InversionVetoOutcome = hardVeto
    ? "hard_veto"
    : softRegenerateOnce
      ? "soft_regenerate_once"
      : "pass";

  return {
    outcome,
    positions,
    historyBearingPositions,
    dominatingHypotheses,
    coDominatingHypotheses,
    intendedSupport: intendedHypothesis?.support ?? null,
    credibleSetSize: codeHypotheses.length,
    actionableIntendedEdges,
    strongIntendedEdges,
    eliminationOnlyPositions,
    hardVeto,
    softRegenerateOnce,
  };
}

/**
 * Combine the two independent gates into the single disposition the runtime
 * acts on. Neither instrument may weaken the other: the strictest outcome
 * wins, and both remain individually recorded.
 */
export function combineInversionOutcomes(
  outcomes: readonly InversionVetoOutcome[],
): InversionVetoOutcome {
  // Fail closed on both degenerate shapes. An empty list used to return
  // `pass`, which silently converts "no gate ran" into "the gate approved
  // this" — the exact confusion `crossRoundAuditStatus` exists to prevent on
  // the telemetry side. An unrecognised runtime value is likewise a caller
  // bug, not a licence.
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    throw new Error("Cannot combine an empty set of inversion outcomes");
  }
  const known: readonly InversionVetoOutcome[] = [
    "hard_veto",
    "soft_regenerate_once",
    "pass",
  ];
  for (const outcome of outcomes) {
    if (!known.includes(outcome)) {
      throw new Error(`Unknown inversion outcome: ${String(outcome)}`);
    }
  }
  if (outcomes.some((outcome) => outcome === "hard_veto")) return "hard_veto";
  if (outcomes.some((outcome) => outcome === "soft_regenerate_once")) {
    return "soft_regenerate_once";
  }
  return "pass";
}

// ---- Shared auditor instrument ----
//
// `blind-inversion@0.1-probe` was stamped on two DIFFERENT auditors — The
// Table's and Herpetarium's — with different prompts and batch sizes, so their
// flag rates were never poolable. This protocol does not repeat that: the
// auditor's system prompt and its user-side task rendering live HERE,
// content-hashed, and both apps call the same text at the same fixed batch
// size. Provider calls, persistence, and the surrounding envelope stay
// app-owned; the instrument itself is shared.
//
// The examples below are deliberately drawn from a domain neither production
// incident touches. A prompt that names the incident's own words, keywords, or
// bridges would be fitted to its own regression, and conformance asserts that
// none of them appear.

/** Fixed batch: exactly the three clues of one submission. */
export const CROSS_ROUND_AUDITOR_BATCH_SIZE = 3;

export const CROSS_ROUND_AUDITOR_SYSTEM_PROMPT = [
  "You are simulating the opposing interceptor in a word-association game.",
  "Each team holds four secret keywords numbered 1 to 4. Every round its",
  "encryptor publishes three clues encoding three DIFFERENT numbers from 1",
  "to 4, in order. Once a round ends, that round's numbers become public, so",
  "past clues are publicly filed under the number each one encoded. You",
  "receive that public ledger and three brand-new clues from the same team.",
  "You never receive the keywords or the new numbers.",
  // The contradiction 0.2 shipped: the prompt demanded latent-keyword
  // reasoning and forbade inventing keywords in the same breath. The model
  // resolved it by guessing privately and reporting only the winner.
  "Your job is to HYPOTHESISE the hidden words. You are expected to invent",
  "candidate keywords and name them — that is the task, not a violation of",
  "it. Your hypotheses are your own guesses, never supplied truth, and you",
  "will not be told whether any of them is right.",
  "",
  "STEP 1 — evidence. For each new clue, consider EACH of the four slots in",
  "turn and ask what a capable opponent could FIND from the public words:",
  "would that opponent readily discover one salient, ordinary hidden word",
  "that could naturally have produced BOTH this new clue and at least one",
  "clue already filed under that slot? Name that word as sharedReferent.",
  "Do not mark an edge merely because such a word might exist in private.",
  "When a slot is the true one, both clues were necessarily written for its",
  "keyword; that private fact is true of every intended edge and is not",
  "evidence that an opponent could discover the route. Judge public",
  "findability from the clue pair itself.",
  "Search conventional one- or two-hop bridges: object and tool, member and",
  "category, activity and place, attribute and bearer, compound word or fixed",
  "collocation, cause and effect. For example, a slot holding the past clue",
  "\"yeast\" and a new clue \"crust\" are both natural clues for a hidden",
  "BREAD, though the two clues share no topic with each other.",
  "Reject arbitrary chains, spelling or sound tricks, obscure encyclopedic",
  "trivia, and anything needing more than two hops. Direct topical similarity",
  "between the two clues is neither necessary nor sufficient: clues for one",
  "hidden word often look unrelated, and clues that look related often have",
  "no common parent.",
  "Report strength as one of none, weak, plausible, strong. Use strong when",
  "you would act on that placement from the ledger alone, plausible when a",
  "competent opponent would seriously consider it, weak for a stretch, and",
  "none when you find no such word.",
  "Whenever strength is not none you must also quote publicClue: the EXACT",
  "text of the clue already filed under that slot which your hidden word also",
  "explains, copied character for character from the ledger above. When",
  "strength is none, both sharedReferent and publicClue are null.",
  "Judge every clue-slot pair on its own merits. These are INDEPENDENT",
  "judgements, not a ranking: one clue may well have a strong bridge to two",
  "different slots, and when it does you must report both. Do not weaken one",
  "bridge because you prefer another.",
  "A slot with no clues filed under it has nothing to match, so its",
  "sharedReferent is null and its strength is none. It remains a legal",
  "placement, but only by elimination.",
  "",
  "STEP 2 — codes. Give the smallest serious set of codes you would actually",
  "consider. Each is three DIFFERENT numbers from 1 to 4, one per clue in",
  "order. Label each with support: strong, plausible or weak.",
  "Order does not matter and is not read. Two codes you find equally good",
  "must carry the SAME support label — do not break a genuine tie by",
  "listing one first, and do not invent a preference you do not hold. If",
  "two readings are equally well supported, say so with equal labels.",
  "Do not pad the set with codes you do not believe.",
  "Return only the requested JSON, with no prose outside it.",
].join(" ");

function renderLedger(ledger: PublicClueLedger): string {
  return ledger
    .map((column) => {
      const clues =
        column.clues.length > 0
          ? column.clues.map((clue) => JSON.stringify(clue)).join(", ")
          : "(no public clues yet)";
      return `  slot ${column.number}: ${clues}`;
    })
    .join("\n");
}

/**
 * Render the auditor's task from PUBLIC state alone.
 *
 * The signature has no parameter for keywords or the intended code, so the
 * output is provably a pure function of what the opposing team already holds.
 * Adding a secret-bearing parameter is a security-boundary change.
 */
export function composeCrossRoundAuditorTask(
  ledger: PublicClueLedger,
  clues: readonly [string, string, string],
): string {
  const emptySlots = ledger
    .filter((column) => column.clues.length === 0)
    .map((column) => column.number);
  return [
    "PUBLIC LEDGER — this team's resolved clues, filed under the number",
    "each one turned out to encode, oldest first:",
    renderLedger(ledger),
    emptySlots.length > 0
      ? `Slots with no public clues: ${emptySlots.join(", ")}. Report sharedReferent null and strength "none" for each of these.`
      : "Every slot carries public clues.",
    "",
    "THREE NEW CLUES from the same team, in published order:",
    JSON.stringify(clues),
    "",
    "Reply with strict JSON exactly of the form:",
    '{ "historyMatches": [',
    '  { "clueIndex": 1, "matches": [',
    '      { "slot": 1, "sharedReferent": <word or null>, "publicClue": <exact ledger clue or null>, "strength": "none|weak|plausible|strong" },',
    '      { "slot": 2, "sharedReferent": ..., "publicClue": ..., "strength": "..." },',
    '      { "slot": 3, "sharedReferent": ..., "publicClue": ..., "strength": "..." },',
    '      { "slot": 4, "sharedReferent": ..., "publicClue": ..., "strength": "..." }',
    "    ] },",
    '  { "clueIndex": 2, "matches": [ ... ] },',
    '  { "clueIndex": 3, "matches": [ ... ] }',
    "],",
    '  "codeHypotheses": [',
    '    { "code": [<slot for clue 1>, <slot for clue 2>, <slot for clue 3>],',
    '      "support": "strong|plausible|weak", "rationale": "<short note or null>" },',
    "    <further entries; order is not read>",
    "  ]",
    "}",
    "Return exactly three historyMatches entries, one per new clue, with",
    "clueIndex 1, 2, 3 in that order. Each must cover all four slots exactly",
    "once. sharedReferent and publicClue are both null if and only if strength",
    'is "none", and publicClue must be copied exactly from the slot it is',
    "reported under.",
    `Return between 1 and ${MAX_CODE_HYPOTHESES} codeHypotheses, each three`,
    "DIFFERENT slot numbers, no code repeated.",
    "Do not repeat the clue text and do not include any other field.",
  ].join("\n");
}

/**
 * Identity of the shared instrument. Both apps record this in call metadata,
 * so a pooled statistic is only ever computed over calls that provably ran the
 * same prompt at the same batch size.
 */
export const CROSS_ROUND_AUDITOR_PROMPT_HASH = contentHash({
  protocol: CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  batchSize: CROSS_ROUND_AUDITOR_BATCH_SIZE,
  system: CROSS_ROUND_AUDITOR_SYSTEM_PROMPT,
  // Pin the task rendering too: a change to the JSON contract or the ledger
  // layout changes the instrument just as much as a change to the system text.
  //
  // The probe ledger must exercise BOTH render branches — a populated column
  // with more than one clue and an empty one. Hashing an empty ledger would
  // leave the clue-bearing branch unpinned, and since the auditor is only ever
  // called with a non-empty ledger, every production prompt could change while
  // this hash stayed put.
  taskShape: composeCrossRoundAuditorTask(
    buildPublicClueLedger([
      { clues: ["<a1>", "<a3>", "<a4>"], code: [1, 3, 4] },
      { clues: ["<b1>", "<b3>", "<b4>"], code: [1, 3, 4] },
    ]),
    ["<clue-1>", "<clue-2>", "<clue-3>"],
  ),
});
