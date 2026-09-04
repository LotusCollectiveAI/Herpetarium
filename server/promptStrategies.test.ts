import { describe, it, expect } from "vitest";
import {
  applyAblations,
  formatHistory,
  formatScratchNotes,
  getPromptStrategy,
  listPromptStrategies,
} from "./promptStrategies";
import { ADVANCED_STRATEGIES } from "./ai";

const HISTORY = [
  { clues: ["flower", "sketch", "barn"], targetCode: [1, 4, 2] as [number, number, number] },
  { clues: ["tusk", "pond", "room"], targetCode: [3, 1, 4] as [number, number, number] },
];

describe("getPromptStrategy", () => {
  it("returns the strategy asked for", () => {
    for (const name of ["default", "advanced", "k-level", "enriched"]) {
      expect(getPromptStrategy(name).name).toBe(name);
    }
  });

  it("falls back to default for an unknown name rather than throwing", () => {
    expect(getPromptStrategy("does-not-exist").name).toBe("default");
    expect(getPromptStrategy("").name).toBe("default");
  });

  it("registers every strategy the reasoning gates switch on", () => {
    // ai.ts turns native provider reasoning on for exactly these, and the
    // no_chain_of_thought ablation swaps them to default. A name in that
    // list with no strategy behind it would silently mean "default".
    const registered = new Set(listPromptStrategies().map(s => s.name));
    for (const name of ADVANCED_STRATEGIES) {
      expect(registered.has(name as string)).toBe(true);
    }
  });

  it("gives every strategy a system prompt and all three templates", () => {
    for (const { name } of listPromptStrategies()) {
      const strategy = getPromptStrategy(name);
      expect(strategy.systemPrompt.length).toBeGreaterThan(0);
      expect(typeof strategy.clueTemplate).toBe("function");
      expect(typeof strategy.guessTemplate).toBe("function");
      expect(typeof strategy.interceptionTemplate).toBe("function");
    }
  });

  it("gives the advanced strategies a different system prompt from default", () => {
    // The no_chain_of_thought ablation works by swapping to default, so it
    // only means anything if the prompts actually differ.
    const base = getPromptStrategy("default").systemPrompt;
    for (const name of ADVANCED_STRATEGIES) {
      expect(getPromptStrategy(name as string).systemPrompt).not.toBe(base);
    }
  });
});

describe("formatHistory", () => {
  it("returns nothing for an empty history", () => {
    expect(formatHistory([])).toBe("");
  });

  it("numbers rounds from one and pairs each clue set with its code", () => {
    const lines = formatHistory(HISTORY).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Round 1");
    expect(lines[0]).toContain("flower, sketch, barn");
    expect(lines[0]).toContain("1, 4, 2");
    expect(lines[1]).toContain("Round 2");
  });
});

describe("formatScratchNotes", () => {
  it("returns nothing when there are no notes", () => {
    expect(formatScratchNotes()).toBe("");
    expect(formatScratchNotes("")).toBe("");
  });

  it("wraps notes in delimiters that bracket the content", () => {
    const formatted = formatScratchNotes("Vary the angle on keyword 3.");
    expect(formatted).toContain("Vary the angle on keyword 3.");
    expect(formatted.indexOf("STRATEGIC NOTES")).toBeLessThan(formatted.indexOf("Vary the angle"));
    expect(formatted.indexOf("Vary the angle")).toBeLessThan(formatted.indexOf("END STRATEGIC NOTES"));
  });
});

describe("applyAblations", () => {
  const params = { history: HISTORY, scratchNotes: "some notes" };

  it("returns the params untouched when nothing is ablated", () => {
    expect(applyAblations(params, undefined, "clue")).toBe(params);
    expect(applyAblations(params, [], "clue")).toBe(params);
  });

  it("strips history for no_history on any call type", () => {
    for (const callType of ["clue", "guess", "interception"] as const) {
      expect(applyAblations(params, ["no_history"], callType).history).toEqual([]);
    }
  });

  it("strips history for no_opponent_history only on interceptions", () => {
    // Only the interception prompt shows the opponent's history, so the
    // flag must be inert for a team reading its own.
    expect(applyAblations(params, ["no_opponent_history"], "interception").history).toEqual([]);
    expect(applyAblations(params, ["no_opponent_history"], "clue").history).toEqual(HISTORY);
    expect(applyAblations(params, ["no_opponent_history"], "guess").history).toEqual(HISTORY);
  });

  it("drops scratch notes for no_scratch_notes", () => {
    expect(applyAblations(params, ["no_scratch_notes"], "clue").scratchNotes).toBeUndefined();
  });

  it("applies several ablations together", () => {
    const result = applyAblations(params, ["no_history", "no_scratch_notes"], "clue");
    expect(result.history).toEqual([]);
    expect(result.scratchNotes).toBeUndefined();
  });

  it("copies rather than mutating the caller's params", () => {
    const original = { history: HISTORY, scratchNotes: "some notes" };
    applyAblations(original, ["no_history", "no_scratch_notes"], "clue");
    expect(original.history).toEqual(HISTORY);
    expect(original.scratchNotes).toBe("some notes");
  });

  it("ignores flags that don't touch these fields", () => {
    // no_chain_of_thought is handled by swapping strategy in ai.ts, not
    // here, so it must leave the params alone.
    const result = applyAblations(params, ["no_chain_of_thought"], "clue");
    expect(result.history).toEqual(HISTORY);
    expect(result.scratchNotes).toBe("some notes");
  });
});
