import { describe, it, expect } from "vitest";
import {
  ALL_WORDS,
  EXPANDED_WORDS,
  dealTeamKeywords,
  getRandomKeywords,
  getWordPacks,
  getRandomKeywordsFromPack,
  getWordCardForLabel,
} from "./wordPacks";
import { createSeededRng } from "./game";

describe("ALL_WORDS", () => {
  it("is deduplicated and lowercased", () => {
    expect(new Set(ALL_WORDS).size).toBe(ALL_WORDS.length);
    expect(ALL_WORDS.every(w => w === w.toLowerCase())).toBe(true);
  });

  it("has enough words to deal two teams four keywords each", () => {
    expect(ALL_WORDS.length).toBeGreaterThan(8);
  });
});

describe("getRandomKeywords", () => {
  it("returns the requested count", () => {
    expect(getRandomKeywords(4)).toHaveLength(4);
    expect(getRandomKeywords(1)).toHaveLength(1);
  });

  it("never repeats a word within one draw", () => {
    // The partial Fisher-Yates only shuffles the slots it takes, which is
    // exactly where an off-by-one would start handing out duplicates.
    for (let attempt = 0; attempt < 200; attempt++) {
      const drawn = getRandomKeywords(4);
      expect(new Set(drawn).size).toBe(4);
    }
  });

  it("only ever returns words from the pool", () => {
    const pool = new Set(ALL_WORDS);
    for (let attempt = 0; attempt < 50; attempt++) {
      expect(getRandomKeywords(4).every(w => pool.has(w))).toBe(true);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = getRandomKeywords(4, createSeededRng("same-seed"));
    const b = getRandomKeywords(4, createSeededRng("same-seed"));
    expect(a).toEqual(b);
  });

  it("gives different draws for different seeds", () => {
    const a = getRandomKeywords(4, createSeededRng("seed-one"));
    const b = getRandomKeywords(4, createSeededRng("seed-two"));
    expect(a).not.toEqual(b);
  });

  it("advances a shared rng, so two draws from one rng differ", () => {
    // headlessRunner deals both teams from the same seeded rng and then
    // threads it into the round loop, so consuming from it must move it on.
    const rng = createSeededRng("shared");
    const amber = getRandomKeywords(4, rng);
    const blue = getRandomKeywords(4, rng);
    expect(amber).not.toEqual(blue);
  });

  it("returns an empty list for a count of zero, without touching the rng", () => {
    let calls = 0;
    const counting = () => { calls++; return 0.5; };
    expect(getRandomKeywords(0, counting)).toEqual([]);
    expect(calls).toBe(0);
  });

  it("caps at the pool size rather than repeating to fill the count", () => {
    const drawn = getRandomKeywords(ALL_WORDS.length + 5);
    expect(drawn).toHaveLength(ALL_WORDS.length);
    expect(new Set(drawn).size).toBe(ALL_WORDS.length);
  });

  it("draws only as many random numbers as words requested", () => {
    // The point of the partial shuffle: the old version consumed one draw
    // per word in the whole pool regardless of how few were wanted.
    let calls = 0;
    const counting = () => { calls++; return 0.5; };
    getRandomKeywords(4, counting);
    expect(calls).toBe(4);
  });

  it("does not disturb the shared pool", () => {
    const before = [...ALL_WORDS];
    getRandomKeywords(4);
    expect(ALL_WORDS).toEqual(before);
  });
});

describe("dealTeamKeywords", () => {
  it("never puts the same word on both boards", () => {
    // Drawing each team separately made this happen in roughly one game in
    // ten, and a shared word makes a clue ambiguous however well it is
    // chosen -- the whole interception mechanic rests on a clue pointing at
    // one board and not the other.
    for (let attempt = 0; attempt < 500; attempt++) {
      const { amber, blue } = dealTeamKeywords(4);
      expect(amber).toHaveLength(4);
      expect(blue).toHaveLength(4);
      expect(new Set([...amber, ...blue]).size).toBe(8);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = dealTeamKeywords(4, createSeededRng("deal-seed"));
    const b = dealTeamKeywords(4, createSeededRng("deal-seed"));
    expect(a).toEqual(b);
  });

  it("gives different boards for different seeds", () => {
    const a = dealTeamKeywords(4, createSeededRng("deal-one"));
    const b = dealTeamKeywords(4, createSeededRng("deal-two"));
    expect(a.amber).not.toEqual(b.amber);
  });

  it("honours a team size other than four", () => {
    const { amber, blue } = dealTeamKeywords(3);
    expect(amber).toHaveLength(3);
    expect(blue).toHaveLength(3);
    expect(new Set([...amber, ...blue]).size).toBe(6);
  });
});

describe("the expanded pool", () => {
  it("has no duplicates within itself", () => {
    // ALL_WORDS runs through a Set, so a word pasted twice would vanish
    // silently and quietly shrink the pool instead of failing.
    const seen = new Set<string>();
    const duplicates = EXPANDED_WORDS.filter(w => !seen.add(w));
    expect(duplicates).toEqual([]);
  });

  it("is lowercase and single-word throughout", () => {
    // Clue matching lowercases and trims; a two-word entry would also break
    // the keyword-slot display, which assumes one token per card.
    for (const word of EXPANDED_WORDS) {
      expect(word, word).toBe(word.toLowerCase().trim());
      expect(word, word).not.toContain(" ");
    }
  });

  it("does not contain either team's name", () => {
    // "amber" or "blue" as a keyword would collide with the team labels
    // everywhere they are shown side by side.
    expect(ALL_WORDS).not.toContain("amber");
    expect(ALL_WORDS).not.toContain("blue");
  });

  it("leaves the pool far larger than one game needs", () => {
    expect(ALL_WORDS.length).toBeGreaterThan(500);
  });
});

describe("word packs", () => {
  it("exposes packs whose cards all carry a label", () => {
    const packs = getWordPacks();
    expect(packs.length).toBeGreaterThan(0);
    expect(packs.every(p => p.words.length > 0 && p.words.every(w => !!w.label))).toBe(true);
  });

  it("wraps the pack index rather than running off the end", () => {
    const packs = getWordPacks();
    expect(getRandomKeywordsFromPack(packs.length, 4)).toEqual(getRandomKeywordsFromPack(0, 4));
  });

  it("looks a card up regardless of the label's casing", () => {
    const label = getWordPacks()[0].words[0].label;
    expect(getWordCardForLabel(label.toUpperCase())?.label).toBe(label);
    expect(getWordCardForLabel(label.toLowerCase())?.label).toBe(label);
  });

  it("returns nothing for a word that is in no pack", () => {
    expect(getWordCardForLabel("zzzz-not-a-word")).toBeUndefined();
  });
});
