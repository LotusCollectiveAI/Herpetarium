import { describe, it, expect } from "vitest";
import { analyzeScratchNoteTom, computeMatchTomMetrics } from "./tomAnalyzer";
import type { AiCallLog } from "@shared/schema";

// Sentences chosen to match one specific pattern group each, so a level
// assertion says something about the group rather than about the sentence.
const NONE = "The weather is pleasant and the room is quiet today.";
const L0 = "I am not sure what these clues mean so I will just guess randomly.";
const L1 = "I should vary my clues a little more this round.";
const L2 = "They might notice the pattern building up over rounds.";
const L3 = "They think that I know their strategy already.";

describe("reactive reasoning", () => {
  it("does not read an admission of guessing as self-awareness", () => {
    // "I will just guess randomly" trips the first-person-intent pattern
    // that level 1 uses, so the most reactive text there is was being
    // reported a level above what it is.
    const result = analyzeScratchNoteTom(L0);
    expect(result.level).toBe(0);
    expect(result.label).toBe("Reactive");
    expect(result.score).toBe(0);
  });

  it("quotes what made it call the text reactive", () => {
    // Level 2 and 3 always showed their working; level 0 never did, so a
    // reactive verdict could not be checked.
    const result = analyzeScratchNoteTom(L0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0]).toContain("guess");
  });

  it("still lets reasoning about the opponent outrank a hedge", () => {
    // Hedging is not the same as not reasoning: "not sure, but they might
    // expect X" is a claim about the opponent and stays level 2.
    const result = analyzeScratchNoteTom(`I am not sure. ${L2}`);
    expect(result.level).toBe(2);
  });

  it("leaves genuine self-aware text at level 1", () => {
    expect(analyzeScratchNoteTom(L1).level).toBe(1);
  });
});

describe("distinguishing no signal from a reactive verdict", () => {
  it("counts nothing when there is nothing to read", () => {
    // An empty reasoning trace is common -- some providers expose none --
    // and used to be indistinguishable from a measured level 0, dragging
    // any aggregate down with a finding that was never made.
    const result = analyzeScratchNoteTom("");
    expect(result.sentencesAnalyzed).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it("counts the sentences it did read, even when nothing matched", () => {
    const result = analyzeScratchNoteTom(NONE);
    expect(result.sentencesAnalyzed).toBe(1);
    expect(result.level).toBe(0);
    // Read but unrecognised: no quote to offer, unlike a positive level 0.
    expect(result.evidence).toEqual([]);
  });

  it("separates the three ways a level 0 can arise", () => {
    const nothingToRead = analyzeScratchNoteTom("");
    const readNothingMatched = analyzeScratchNoteTom(NONE);
    const positivelyReactive = analyzeScratchNoteTom(L0);

    for (const r of [nothingToRead, readNothingMatched, positivelyReactive]) {
      expect(r.level).toBe(0);
    }
    expect(nothingToRead.sentencesAnalyzed).toBe(0);
    expect(readNothingMatched.sentencesAnalyzed).toBeGreaterThan(0);
    expect(readNothingMatched.evidence).toEqual([]);
    expect(positivelyReactive.evidence.length).toBeGreaterThan(0);
  });
});

describe("analyzeScratchNoteTom levels", () => {
  it("reports level 0 and no score for text with no theory-of-mind markers", () => {
    const result = analyzeScratchNoteTom(NONE);
    expect(result.level).toBe(0);
    expect(result.score).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it("recognizes reasoning about oneself as level 1", () => {
    expect(analyzeScratchNoteTom(L1).level).toBe(1);
  });

  it("recognizes reasoning about the opponent as level 2", () => {
    expect(analyzeScratchNoteTom(L2).level).toBe(2);
  });

  it("recognizes reasoning about the opponent's model of you as level 3", () => {
    expect(analyzeScratchNoteTom(L3).level).toBe(3);
  });

  it("takes the highest level found across sentences", () => {
    expect(analyzeScratchNoteTom(`${L1} ${L2} ${L3}`).level).toBe(3);
    expect(analyzeScratchNoteTom(`${L1} ${L2}`).level).toBe(2);
  });

  it("ignores fragments too short to be a sentence", () => {
    // The filter keeps only sentences longer than ten characters, so a
    // stray "I will." must not register as level 1.
    expect(analyzeScratchNoteTom("I will. Ok. Hmm.").level).toBe(0);
  });
});

describe("analyzeScratchNoteTom scoring", () => {
  // L3 deliberately also matches a level-2 pattern ("their strategy").
  // Evidence and maxLevel consider every group, but the score takes only
  // the highest group per sentence. Scanning each group once and reusing
  // the result for both has to preserve that difference.
  it("scores a sentence at its highest level only, not the sum of its levels", () => {
    const result = analyzeScratchNoteTom(L3);
    expect(result.level).toBe(3);
    expect(result.score).toBe(3);
  });

  it("lists a sentence matching two groups only once as evidence", () => {
    expect(analyzeScratchNoteTom(L3).evidence).toHaveLength(1);
  });

  it("averages the per-sentence level over every qualifying sentence", () => {
    // One level-3 sentence and one that matches nothing: 3 / 2.
    expect(analyzeScratchNoteTom(`${L3} ${NONE}`).score).toBe(1.5);
    // Level 1 and level 2 alongside each other: (1 + 2) / 2.
    expect(analyzeScratchNoteTom(`${L1} ${L2}`).score).toBe(1.5);
  });

  it("caps evidence at five sentences", () => {
    const eight = [
      "They might notice the pattern building over rounds.",
      "They could expect a repeat of that association.",
      "They would see the link to the second keyword.",
      "They will know the theme after another clue.",
      "They may think the third slot is stable.",
      "Their strategy seems to lean on obscure links.",
      "Their approach favours concrete nouns lately.",
      "The opponent might read that clue too easily.",
    ].join(" ");
    expect(analyzeScratchNoteTom(eight).evidence).toHaveLength(5);
  });

  it("collects a repeated sentence as evidence only once", () => {
    // The level-2 branch checks the sentence against all evidence gathered
    // so far, not just its own group, so the same sentence said five times
    // contributes one entry -- while still counting toward the score each
    // time it appears.
    const result = analyzeScratchNoteTom(Array(5).fill(L2).join(" "));
    expect(result.evidence).toHaveLength(1);
    expect(result.score).toBe(2);
  });
});

describe("computeMatchTomMetrics", () => {
  const log = (provider: string, model: string, rawResponse: string): AiCallLog => ({
    provider,
    model,
    rawResponse,
  } as AiCallLog);

  it("groups by provider and model, taking the max level and mean score of each", () => {
    const metrics = computeMatchTomMetrics([
      log("claude", "sonnet", L1),
      log("claude", "sonnet", L3),
      log("chatgpt", "gpt-5", L2),
    ]);

    expect(Object.keys(metrics).sort()).toEqual(["chatgpt:gpt-5", "claude:sonnet"]);
    expect(metrics["claude:sonnet"].level).toBe(3);
    expect(metrics["claude:sonnet"].score).toBe(2);
    expect(metrics["chatgpt:gpt-5"].level).toBe(2);
  });

  it("aggregates a whole batch the same way as one call per row would", () => {
    // /api/eval/tom used to invoke this once per log row with a
    // single-element array and re-derive the max and mean itself.
    const logs = [log("claude", "sonnet", L1), log("claude", "sonnet", L3)];
    const batched = computeMatchTomMetrics(logs)["claude:sonnet"];

    const perRow = logs.map(l => computeMatchTomMetrics([l])["claude:sonnet"]);
    expect(batched.level).toBe(Math.max(...perRow.map(r => r.level)));
    expect(batched.score).toBe(
      +(perRow.reduce((s, r) => s + r.score, 0) / perRow.length).toFixed(2),
    );
  });

  it("returns nothing for no logs rather than throwing", () => {
    expect(computeMatchTomMetrics([])).toEqual({});
  });
});
