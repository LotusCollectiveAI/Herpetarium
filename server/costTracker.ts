import { storage } from "./storage";

// storage.getCumulativeCost(matchIds) re-sums every ai_call_log row for
// every id in the list on every call. Every long-running orchestrator here
// (tournament/evolution/series/coach/arena) passes it an ever-growing list
// of completed matchIds, so calling it once per new match/sprint/generation
// makes total DB work grow O(n^2) over a run's lifetime instead of O(n).
//
// THE INVARIANT CALLERS MUST HOLD: a matchId passed to update() must have
// all of its ai_call_log rows already written, because its cost is summed
// once and that figure is then cached forever. It is NOT true that a match
// stops accruing rows the moment it finishes -- seriesRunner logs a
// per-player "reflection" AI call against a match *after* runHeadlessMatch
// returns and after the id is pushed onto its completed list. What makes
// that safe today is ordering, not the match being over: series prices a
// match only on a later loop iteration (or in the final tally), by which
// point its reflections have landed. headlessRunner's own post-match
// reflection is awaited before it returns, so coach/arena/tournament ids
// are already complete when recorded.
//
// So: if you add post-match AI logging, or move a budget check to the
// bottom of a loop, price the match only after that logging completes --
// otherwise its cost is silently undercounted for the rest of the run.
export interface CostTracker {
  // matchIds may be passed in any order, on any call, and may repeat ids
  // already seen -- only ids not yet priced are fetched from storage.
  update(matchIds: number[]): Promise<number>;
  readonly costUsd: number;
}

// update() calls on one tracker are serialized (see below), so a
// storage.getCumulativeCost call that never resolves would otherwise wedge
// every later update() on that same tracker forever -- not just the one
// caller waiting on it, as would happen without the serialization queue.
// Bounding it here means a hang degrades to "that one price lookup failed"
// instead of "this run's cost tracking is stuck forever."
const GET_COST_TIMEOUT_MS = 30000;

// Distinct from ai.ts's withAICallTimeout, which resolves to a fallback
// result -- this one rejects, because a cost lookup has no meaningful
// fallback value and the caller must not record a wrong total.
function rejectAfterTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

function makeTracker(): CostTracker {
  let total = 0;
  const priced = new Set<number>();

  async function doUpdate(matchIds: number[]): Promise<number> {
    const newIds = matchIds.filter(id => !priced.has(id));
    if (newIds.length > 0) {
      total += await rejectAfterTimeout(
        storage.getCumulativeCost(newIds),
        GET_COST_TIMEOUT_MS,
        `getCumulativeCost timed out after ${GET_COST_TIMEOUT_MS}ms`,
      );
      for (const id of newIds) priced.add(id);
    }
    return total;
  }

  // Serializes overlapping update() calls on this one tracker instance.
  // Without this, two concurrent calls could both read `priced` before
  // either finishes awaiting storage.getCumulativeCost, both see the same
  // ids as unpriced, and both add that match's cost -- a real, reachable
  // race on an ordinary failure path: e.g. a rejected Promise.all doesn't
  // cancel its still-running sibling callbacks, so a catch-block's
  // finalize-and-price call can overlap a straggler's own price call for
  // the same run. `queue` only sequences work; a failed update() must not
  // wedge it for later callers, so the queue itself never carries a
  // rejection forward (the caller's own promise still does).
  let queue: Promise<unknown> = Promise.resolve();

  return {
    update(matchIds: number[]): Promise<number> {
      const result = queue.then(() => doUpdate(matchIds));
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
    get costUsd() {
      return total;
    },
  };
}

// For an orchestrator whose whole run executes inside one long-lived async
// function (tournament/evolution/series) -- the function's own closure IS
// the tracker's lifetime, so a fresh tracker per run is all that's needed.
export function createCostTracker(): CostTracker {
  return makeTracker();
}

// For coach runs, whose cost check is called from several separate entry
// points that don't share a closure (persistCoachRunProgress, the sprint
// loop's own budget check, run finalization, and -- for arena/ecology-driven
// runs -- arena.ts/coachArena.ts's own progress persistence) -- keyed by the
// run's own id instead. Call clearCostTracker once a run reaches a terminal
// state so this doesn't grow unbounded across the process's lifetime.
const registry = new Map<string, CostTracker>();

export function getCostTracker(key: string): CostTracker {
  let tracker = registry.get(key);
  if (!tracker) {
    tracker = makeTracker();
    registry.set(key, tracker);
  }
  return tracker;
}

export function clearCostTracker(key: string): void {
  registry.delete(key);
}
