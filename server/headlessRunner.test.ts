import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AblationFlag, HeadlessMatchConfig } from "@shared/schema";

// This is the path that spends real money, so every provider call is stubbed
// and the assertions are about what the runner *asked for* -- which prompts,
// which options, how many calls -- rather than about model output quality.
vi.mock("./index", () => ({ log: () => {} }));
vi.mock("./matchEvents", () => ({
  emitMatchEvent: async () => {},
  clearMatchEventSequence: () => {},
}));

let nextMatchId = 1;
const createdRounds: unknown[] = [];
vi.mock("./storage", () => ({
  storage: {
    createMatch: async () => ({ id: nextMatchId++ }),
    updateMatch: async () => {},
    createMatchRound: async (row: unknown) => { createdRounds.push(row); },
    createAiCallLog: async () => {},
    createTeamChatter: async () => {},
  },
}));

interface Recorded {
  config: { promptStrategy?: string; model?: string };
  params: Record<string, unknown>;
  options: { disableReasoning?: boolean } | undefined;
}

const calls = {
  clues: [] as Recorded[],
  guesses: [] as Recorded[],
  interceptions: [] as Recorded[],
  deliberations: [] as Recorded[],
  reflections: [] as Recorded[],
};

const record = (bucket: Recorded[]) => (config: any, params: any, options?: any) => {
  bucket.push({ config, params, options });
};

const aiResult = <T,>(result: T) => ({
  result,
  prompt: "stub-prompt",
  rawResponse: "stub-response",
  model: "stub-model",
  latencyMs: 1,
  parseQuality: "clean" as const,
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
});

vi.mock("./ai", async () => {
  const real = await vi.importActual<typeof import("./ai")>("./ai");
  return {
    ADVANCED_STRATEGIES: real.ADVANCED_STRATEGIES,
    estimateCost: () => "0.0001",
    withAICallTimeout: async (_ms: number, promise: Promise<unknown>) => ({
      result: await promise,
      timedOut: false,
    }),
    generateClues: async (config: any, params: any, options?: any) => {
      record(calls.clues)(config, params, options);
      // Echo the code back as clue text so a later assertion can tell which
      // team's code a given clue call was working from.
      return aiResult(params.targetCode.map((n: number) => `clue-${n}`));
    },
    generateGuess: async (config: any, params: any, options?: any) => {
      record(calls.guesses)(config, params, options);
      return aiResult([1, 2, 3] as [number, number, number]);
    },
    generateInterception: async (config: any, params: any, options?: any) => {
      record(calls.interceptions)(config, params, options);
      return aiResult([4, 3, 2] as [number, number, number]);
    },
    generateDeliberationMessage: async (config: any, params: any, options?: any) => {
      record(calls.deliberations)(config, params, options);
      return aiResult("I think slot two points at the third keyword.");
    },
    generateReflection: async (config: any, params: any, options?: any) => {
      record(calls.reflections)(config, params, options);
      return aiResult("Vary the angle on abstract keywords.");
    },
  };
});

const { runHeadlessMatch } = await import("./headlessRunner");

function matchConfig(overrides: Partial<HeadlessMatchConfig> = {}): HeadlessMatchConfig {
  const seat = (n: number, team: "amber" | "blue") => ({
    name: `Bot ${n}`,
    aiProvider: "claude" as const,
    team,
    aiConfig: {
      provider: "claude" as const,
      model: "claude-sonnet-4-5",
      promptStrategy: "advanced" as const,
      reasoningEffort: "high" as const,
      timeoutMs: 5000,
    },
  });

  return {
    players: [
      seat(1, "amber"), seat(2, "amber"), seat(3, "amber"),
      seat(4, "blue"), seat(5, "blue"), seat(6, "blue"),
    ],
    teamSize: 3,
    seed: "headless-fixture",
    ...overrides,
  };
}

const withFlags = (flags: AblationFlag[], overrides: Partial<HeadlessMatchConfig> = {}) =>
  matchConfig({ ablations: { flags }, ...overrides });

// Two per team, which takes the single-shot path instead of deliberation.
const twoVersusTwo = (overrides: Partial<HeadlessMatchConfig> = {}): HeadlessMatchConfig => {
  const all = matchConfig().players;
  return matchConfig({
    teamSize: 2,
    players: [...all.slice(0, 2), ...all.slice(3, 5)],
    ...overrides,
  });
};

beforeEach(() => {
  for (const bucket of Object.values(calls)) bucket.length = 0;
  createdRounds.length = 0;
});

describe("runHeadlessMatch", () => {
  it("plays a match through to a decided result", async () => {
    const result = await runHeadlessMatch(matchConfig());

    expect(result.totalRounds).toBeGreaterThan(0);
    expect(result.players).toHaveLength(6);
    // Every round needs one clue set per team, so clue calls track rounds.
    expect(calls.clues.length).toBe(result.totalRounds * 2);
    // A game ends on a token threshold, so one side must have got there.
    const { amber, blue } = result.teams;
    const decided = amber.whiteTokens >= 2 || amber.blackTokens >= 2
      || blue.whiteTokens >= 2 || blue.blackTokens >= 2;
    expect(decided).toBe(true);
  }, 30000);

  it("deals the same keywords for the same seed", async () => {
    const a = await runHeadlessMatch(matchConfig({ seed: "repeatable" }));
    const b = await runHeadlessMatch(matchConfig({ seed: "repeatable" }));

    expect(a.teams.amber.keywords).toEqual(b.teams.amber.keywords);
    expect(a.teams.blue.keywords).toEqual(b.teams.blue.keywords);
    expect(a.teams.amber.keywords).not.toEqual(a.teams.blue.keywords);
  }, 60000);

  it("deals different keywords for different seeds", async () => {
    const a = await runHeadlessMatch(matchConfig({ seed: "seed-one" }));
    const b = await runHeadlessMatch(matchConfig({ seed: "seed-two" }));
    expect(a.teams.amber.keywords).not.toEqual(b.teams.amber.keywords);
  }, 60000);

  it("gives each clue call only its own team's keywords", async () => {
    const result = await runHeadlessMatch(matchConfig());
    const amber = new Set(result.teams.amber.keywords);
    const blue = new Set(result.teams.blue.keywords);

    for (const call of calls.clues) {
      const keywords = call.params.keywords as string[];
      const fromAmber = keywords.every(k => amber.has(k));
      const fromBlue = keywords.every(k => blue.has(k));
      // A call must draw from exactly one team's pool -- a mixed set would
      // mean the runner handed a clue-giver the wrong roster.
      expect(fromAmber !== fromBlue).toBe(true);
    }
  }, 30000);

  it("runs deliberation for 3v3 and skips it for 2v2", async () => {
    await runHeadlessMatch(matchConfig({ teamSize: 3 }));
    expect(calls.deliberations.length).toBeGreaterThan(0);

    calls.deliberations.length = 0;
    await runHeadlessMatch(twoVersusTwo());
    expect(calls.deliberations).toHaveLength(0);
    // ...and 2v2 reaches its answers by single-shot calls instead.
    expect(calls.guesses.length).toBeGreaterThan(0);
    expect(calls.interceptions.length).toBeGreaterThan(0);
  }, 60000);
});

describe("ablations reaching the AI layer", () => {
  it("passes ablation flags to every 2v2 call type", async () => {
    // 2v2 decides by single-shot calls, so the flags have to reach all
    // three. (3v3 reaches its answers through deliberation instead, so
    // generateGuess/generateInterception are never called there -- they
    // stay as the fallback for a team with too few eligible members.)
    await runHeadlessMatch(twoVersusTwo({ ablations: { flags: ["no_history"] } }));

    for (const [name, bucket] of Object.entries({
      clues: calls.clues, guesses: calls.guesses, interceptions: calls.interceptions,
    })) {
      expect(bucket.length, name).toBeGreaterThan(0);
      for (const call of bucket) {
        expect(call.params.ablations, name).toContain("no_history");
      }
    }
  }, 30000);

  it("passes ablation flags to every 3v3 call type", async () => {
    await runHeadlessMatch(withFlags(["no_history"]));

    for (const [name, bucket] of Object.entries({
      clues: calls.clues, deliberations: calls.deliberations,
    })) {
      expect(bucket.length, name).toBeGreaterThan(0);
      for (const call of bucket) {
        expect(call.params.ablations, name).toContain("no_history");
      }
    }
  }, 30000);

  it("leaves ablations unset when none are configured", async () => {
    await runHeadlessMatch(matchConfig());
    for (const call of calls.clues) {
      expect(call.params.ablations ?? []).toEqual([]);
    }
  }, 30000);

  it("turns off provider reasoning for no_chain_of_thought deliberation", async () => {
    // The ablation is meant to remove step-by-step reasoning. Prompt-level
    // reasoning is dropped by swapping to the default strategy, but a model
    // with native thinking would keep reasoning anyway unless the call also
    // asks for it to be disabled -- which is what made this ablation a
    // no-op on thinking models before.
    await runHeadlessMatch(withFlags(["no_chain_of_thought"]));

    expect(calls.deliberations.length).toBeGreaterThan(0);
    for (const call of calls.deliberations) {
      expect(call.options?.disableReasoning).toBe(true);
    }
  }, 30000);

  it("leaves provider reasoning on when that ablation is absent", async () => {
    await runHeadlessMatch(matchConfig());

    expect(calls.deliberations.length).toBeGreaterThan(0);
    for (const call of calls.deliberations) {
      expect(call.options?.disableReasoning).toBeFalsy();
    }
  }, 30000);

  it("swaps the deliberation prompt off the advanced strategy for no_chain_of_thought", async () => {
    await runHeadlessMatch(withFlags(["no_chain_of_thought"]));
    const ablated = calls.deliberations.map(c => c.params.systemPrompt as string);

    calls.deliberations.length = 0;
    await runHeadlessMatch(matchConfig());
    const normal = calls.deliberations.map(c => c.params.systemPrompt as string);

    expect(ablated.length).toBeGreaterThan(0);
    expect(normal.length).toBeGreaterThan(0);
    expect(new Set(ablated)).not.toEqual(new Set(normal));
  }, 60000);
});

describe("post-match reflection", () => {
  it("is skipped unless asked for", async () => {
    await runHeadlessMatch(matchConfig());
    expect(calls.reflections).toHaveLength(0);
  }, 30000);

  it("runs once per team and returns the updated notes", async () => {
    const result = await runHeadlessMatch(matchConfig({
      enablePostMatchReflection: true,
      reflectionTokenBudget: 500,
    }));

    expect(calls.reflections).toHaveLength(2);
    expect(result.updatedScratchNotes?.amber?.notesText).toBeTruthy();
    expect(result.updatedScratchNotes?.blue?.notesText).toBeTruthy();
  }, 30000);

  it("keeps each reflection to its own team's material", async () => {
    const result = await runHeadlessMatch(matchConfig({
      enablePostMatchReflection: true,
      reflectionTokenBudget: 500,
    }));

    const byTeam = new Map(calls.reflections.map(c => [c.params.myTeam, c.params]));
    expect(byTeam.get("amber")!.teamKeywords).toEqual(result.teams.amber.keywords);
    expect(byTeam.get("blue")!.teamKeywords).toEqual(result.teams.blue.keywords);
  }, 30000);
});
