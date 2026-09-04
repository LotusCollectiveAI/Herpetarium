import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked with a factory so the real module -- and through it db.ts, which
// demands DATABASE_URL and opens a pool -- is never loaded.
vi.mock("./storage", () => ({
  storage: { getCumulativeCost: vi.fn() },
}));

import { storage } from "./storage";
import { createCostTracker, getCostTracker, clearCostTracker } from "./costTracker";

const getCumulativeCost = vi.mocked(storage.getCumulativeCost);

// Every match costs $1, so an expected total is just "distinct matches
// counted", and the ids each call asked for are recorded for inspection.
function pricePerMatch() {
  const calls: number[][] = [];
  getCumulativeCost.mockImplementation(async (matchIds: number[]) => {
    calls.push([...matchIds]);
    // Mirrors the real SQL: WHERE match_id IN (...) counts a row once
    // however many times its id repeats in the list.
    return new Set(matchIds).size;
  });
  return calls;
}

beforeEach(() => {
  getCumulativeCost.mockReset();
});

describe("createCostTracker", () => {
  it("only queries matches it has not already priced", async () => {
    const calls = pricePerMatch();
    const tracker = createCostTracker();

    expect(await tracker.update([1, 2])).toBe(2);
    expect(await tracker.update([1, 2, 3])).toBe(3);

    expect(calls).toEqual([[1, 2], [3]]);
  });

  it("issues no query at all when nothing is new", async () => {
    const calls = pricePerMatch();
    const tracker = createCostTracker();

    await tracker.update([1, 2]);
    expect(await tracker.update([1, 2])).toBe(2);

    expect(calls).toHaveLength(1);
  });

  it("counts a match once even when its id repeats within one call", async () => {
    pricePerMatch();
    // The arena passes a flattened list where a shared match appears once
    // per participating slot.
    expect(await createCostTracker().update([1, 1, 2, 2])).toBe(2);
  });

  it("handles an empty list without querying", async () => {
    const calls = pricePerMatch();
    expect(await createCostTracker().update([])).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("counts a match once when two updates for it overlap", async () => {
    // The race this guards against: both calls read the priced-id set
    // before either finishes, so both would treat the id as new. Reachable
    // when a rejected Promise.all's straggler overlaps the catch block's
    // own finalize-and-price call for the same run.
    const calls = pricePerMatch();
    const tracker = createCostTracker();

    const [first, second] = await Promise.all([tracker.update([7]), tracker.update([7])]);

    expect([first, second]).toEqual([1, 1]);
    expect(tracker.costUsd).toBe(1);
    expect(calls).toEqual([[7]]);
  });

  it("keeps a failed lookup out of the total and retries it next time", async () => {
    const tracker = createCostTracker();
    getCumulativeCost.mockRejectedValueOnce(new Error("db down"));

    await expect(tracker.update([1])).rejects.toThrow("db down");
    expect(tracker.costUsd).toBe(0);

    pricePerMatch();
    expect(await tracker.update([1])).toBe(1);
  });

  it("stays usable for later callers after one update fails", async () => {
    const tracker = createCostTracker();
    getCumulativeCost.mockRejectedValueOnce(new Error("db down"));

    const failing = tracker.update([1]);
    pricePerMatch();
    const following = tracker.update([2]);

    await expect(failing).rejects.toThrow("db down");
    // A rejection must not wedge the queue that serializes updates.
    expect(await following).toBe(1);
  });
});

describe("getCostTracker registry", () => {
  beforeEach(() => {
    for (const key of ["slotA", "slotB", "arena:x"]) clearCostTracker(key);
  });

  it("keeps separate totals per key, and the same instance for one key", async () => {
    pricePerMatch();
    expect(getCostTracker("slotA")).toBe(getCostTracker("slotA"));

    await getCostTracker("slotA").update([1]);
    expect(getCostTracker("slotA").costUsd).toBe(1);
    expect(getCostTracker("slotB").costUsd).toBe(0);
  });

  it("double-counts a shared match if per-slot totals are summed", async () => {
    // Not a defect in the tracker but the reason arena.ts must not add its
    // slots' totals together: an arena match is between two slots and both
    // record its id, so each slot's own tracker prices it. Pinned here
    // because summing them silently halved the effective budget cap.
    pricePerMatch();
    const shared = [10, 11];
    await getCostTracker("slotA").update(shared);
    await getCostTracker("slotB").update(shared);

    const summed = getCostTracker("slotA").costUsd + getCostTracker("slotB").costUsd;
    expect(summed).toBe(4);

    // One tracker over the same flattened list is the correct total.
    expect(await getCostTracker("arena:x").update([...shared, ...shared])).toBe(2);
  });

  it("forgets a cleared key", async () => {
    pricePerMatch();
    await getCostTracker("slotA").update([1]);
    expect(getCostTracker("slotA").costUsd).toBe(1);

    clearCostTracker("slotA");
    expect(getCostTracker("slotA").costUsd).toBe(0);
  });
});
