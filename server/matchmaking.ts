import type { ArenaCoachSlot, MatchmakingWeights } from "@shared/schema";

export type MatchmakingBucket = "near_peer" | "diagnostic" | "mirror" | "novelty" | "baseline";

export interface MatchmakingPairing {
  slotA: number;
  slotB: number;
  bucket: MatchmakingBucket;
  reason: string;
}

export interface PairingHistory {
  pairCounts: Map<string, number>;
}

interface DistinctPairOption {
  slotA: ArenaCoachSlot;
  slotB: ArenaCoachSlot;
  remainingA: number;
  remainingB: number;
  pairCount: number;
  winRateGap: number;
}

interface SelfPairOption {
  slot: ArenaCoachSlot;
  remaining: number;
  pairCount: number;
}

const BUCKETS: MatchmakingBucket[] = ["near_peer", "diagnostic", "mirror", "novelty", "baseline"];

const WEIGHT_KEYS: Record<MatchmakingBucket, keyof MatchmakingWeights> = {
  near_peer: "nearPeer",
  diagnostic: "diagnostic",
  mirror: "mirror",
  novelty: "novelty",
  baseline: "baseline",
};

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function getPairKey(slotA: number, slotB: number): string {
  const left = Math.min(slotA, slotB);
  const right = Math.max(slotA, slotB);
  return `${left}-${right}`;
}

function getWinRate(slot: ArenaCoachSlot): number {
  const totalGames = slot.wins + slot.losses + slot.draws;
  return totalGames > 0 ? slot.wins / totalGames : 0;
}

function formatRate(value: number): string {
  return value.toFixed(3);
}

function getRemaining(remainingBySlot: Map<number, number>, slotIndex: number): number {
  return remainingBySlot.get(slotIndex) ?? 0;
}

function applyPairing(
  remainingBySlot: Map<number, number>,
  slotA: number,
  slotB: number,
): void {
  if (slotA === slotB) {
    remainingBySlot.set(slotA, getRemaining(remainingBySlot, slotA) - 2);
    return;
  }

  remainingBySlot.set(slotA, getRemaining(remainingBySlot, slotA) - 1);
  remainingBySlot.set(slotB, getRemaining(remainingBySlot, slotB) - 1);
}

function revertPairing(
  remainingBySlot: Map<number, number>,
  slotA: number,
  slotB: number,
): void {
  if (slotA === slotB) {
    remainingBySlot.set(slotA, getRemaining(remainingBySlot, slotA) + 2);
    return;
  }

  remainingBySlot.set(slotA, getRemaining(remainingBySlot, slotA) + 1);
  remainingBySlot.set(slotB, getRemaining(remainingBySlot, slotB) + 1);
}

function getDistinctPairOptions(
  slots: ArenaCoachSlot[],
  remainingBySlot: Map<number, number>,
  usedPairKeys: Set<string>,
  history: PairingHistory,
): DistinctPairOption[] {
  const options: DistinctPairOption[] = [];

  for (let leftIndex = 0; leftIndex < slots.length; leftIndex++) {
    const slotA = slots[leftIndex];
    const remainingA = getRemaining(remainingBySlot, slotA.slotIndex);

    if (remainingA <= 0) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < slots.length; rightIndex++) {
      const slotB = slots[rightIndex];
      const remainingB = getRemaining(remainingBySlot, slotB.slotIndex);

      if (remainingB <= 0) {
        continue;
      }

      const pairKey = getPairKey(slotA.slotIndex, slotB.slotIndex);
      if (usedPairKeys.has(pairKey)) {
        continue;
      }

      options.push({
        slotA,
        slotB,
        remainingA,
        remainingB,
        pairCount: getPairCount(history, slotA.slotIndex, slotB.slotIndex),
        winRateGap: Math.abs(getWinRate(slotA) - getWinRate(slotB)),
      });
    }
  }

  return options;
}

function getSelfPairOptions(
  slots: ArenaCoachSlot[],
  remainingBySlot: Map<number, number>,
  usedPairKeys: Set<string>,
  history: PairingHistory,
): SelfPairOption[] {
  const options: SelfPairOption[] = [];

  for (const slot of slots) {
    const remaining = getRemaining(remainingBySlot, slot.slotIndex);
    if (remaining < 2) {
      continue;
    }

    const pairKey = getPairKey(slot.slotIndex, slot.slotIndex);
    if (usedPairKeys.has(pairKey)) {
      continue;
    }

    options.push({
      slot,
      remaining,
      pairCount: getPairCount(history, slot.slotIndex, slot.slotIndex),
    });
  }

  return options;
}

function sortByPressure(
  leftRemainingA: number,
  leftRemainingB: number,
  rightRemainingA: number,
  rightRemainingB: number,
): number {
  const leftMax = Math.max(leftRemainingA, leftRemainingB);
  const rightMax = Math.max(rightRemainingA, rightRemainingB);
  if (leftMax !== rightMax) {
    return rightMax - leftMax;
  }

  const leftSum = leftRemainingA + leftRemainingB;
  const rightSum = rightRemainingA + rightRemainingB;
  return rightSum - leftSum;
}

function buildNearPeerCandidates(options: DistinctPairOption[]): MatchmakingPairing[] {
  return options
    .map((option) => ({
      slotA: option.slotA.slotIndex,
      slotB: option.slotB.slotIndex,
      bucket: "near_peer" as const,
      reason: `Near-peer matchup: slot ${option.slotA.slotIndex} (${formatRate(getWinRate(option.slotA))}) vs slot ${option.slotB.slotIndex} (${formatRate(getWinRate(option.slotB))}) have the closest remaining win rates.`,
      winRateGap: option.winRateGap,
      remainingA: option.remainingA,
      remainingB: option.remainingB,
    }))
    .sort((left, right) =>
      left.winRateGap - right.winRateGap
      || sortByPressure(left.remainingA, left.remainingB, right.remainingA, right.remainingB),
    );
}

function buildDiagnosticCandidates(options: DistinctPairOption[]): MatchmakingPairing[] {
  return options
    .map((option) => ({
      slotA: option.slotA.slotIndex,
      slotB: option.slotB.slotIndex,
      bucket: "diagnostic" as const,
      reason: `Diagnostic stress test: slot ${option.slotA.slotIndex} (${formatRate(getWinRate(option.slotA))}) vs slot ${option.slotB.slotIndex} (${formatRate(getWinRate(option.slotB))}) creates one of the widest remaining performance gaps.`,
      winRateGap: option.winRateGap,
      remainingA: option.remainingA,
      remainingB: option.remainingB,
    }))
    .sort((left, right) =>
      right.winRateGap - left.winRateGap
      || sortByPressure(left.remainingA, left.remainingB, right.remainingA, right.remainingB),
    );
}

function buildMirrorCandidates(options: SelfPairOption[]): MatchmakingPairing[] {
  return options
    .map((option) => ({
      slotA: option.slot.slotIndex,
      slotB: option.slot.slotIndex,
      bucket: "mirror" as const,
      reason: `Mirror self-play: slot ${option.slot.slotIndex} runs the same genome on both sides to measure variance.`,
      pairCount: option.pairCount,
      remaining: option.remaining,
    }))
    .sort((left, right) => right.remaining - left.remaining || left.pairCount - right.pairCount);
}

function buildNoveltyCandidates(options: DistinctPairOption[]): MatchmakingPairing[] {
  return options
    .map((option) => ({
      slotA: option.slotA.slotIndex,
      slotB: option.slotB.slotIndex,
      bucket: "novelty" as const,
      reason: `Novelty matchup: slots ${option.slotA.slotIndex} and ${option.slotB.slotIndex} have only played ${option.pairCount} prior time${option.pairCount === 1 ? "" : "s"}, the least among remaining options.`,
      pairCount: option.pairCount,
      remainingA: option.remainingA,
      remainingB: option.remainingB,
    }))
    .sort((left, right) =>
      left.pairCount - right.pairCount
      || sortByPressure(left.remainingA, left.remainingB, right.remainingA, right.remainingB),
    );
}

function buildBaselineCandidates(options: DistinctPairOption[]): MatchmakingPairing[] {
  return shuffle(options).map((option) => ({
    slotA: option.slotA.slotIndex,
    slotB: option.slotB.slotIndex,
    bucket: "baseline" as const,
    reason: `Baseline random matchup: slot ${option.slotA.slotIndex} vs slot ${option.slotB.slotIndex}.`,
  }));
}

function getCandidatesByBucket(
  slots: ArenaCoachSlot[],
  remainingBySlot: Map<number, number>,
  usedPairKeys: Set<string>,
  history: PairingHistory,
): Record<MatchmakingBucket, MatchmakingPairing[]> {
  const distinctPairOptions = getDistinctPairOptions(slots, remainingBySlot, usedPairKeys, history);
  const selfPairOptions = getSelfPairOptions(slots, remainingBySlot, usedPairKeys, history);

  return {
    near_peer: buildNearPeerCandidates(distinctPairOptions),
    diagnostic: buildDiagnosticCandidates(distinctPairOptions),
    mirror: buildMirrorCandidates(selfPairOptions),
    novelty: buildNoveltyCandidates(distinctPairOptions),
    baseline: buildBaselineCandidates(distinctPairOptions),
  };
}

function weightedBucketOrder(
  buckets: MatchmakingBucket[],
  weights: MatchmakingWeights,
): MatchmakingBucket[] {
  const remaining = buckets.map((bucket) => ({
    bucket,
    weight: Math.max(0, weights[WEIGHT_KEYS[bucket]]),
  }));
  const ordered: MatchmakingBucket[] = [];

  while (remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, entry) => sum + entry.weight, 0);

    if (totalWeight <= 0) {
      return [...ordered, ...shuffle(remaining.map((entry) => entry.bucket))];
    }

    let threshold = Math.random() * totalWeight;
    let selectedIndex = remaining.length - 1;

    for (let index = 0; index < remaining.length; index++) {
      threshold -= remaining[index].weight;
      if (threshold <= 0) {
        selectedIndex = index;
        break;
      }
    }

    ordered.push(remaining[selectedIndex].bucket);
    remaining.splice(selectedIndex, 1);
  }

  return ordered;
}

function canSatisfyRemainingAssignments(
  slots: ArenaCoachSlot[],
  remainingBySlot: Map<number, number>,
  usedPairKeys: Set<string>,
): boolean {
  let totalRemaining = 0;
  let availablePairings = 0;

  for (const slot of slots) {
    const remaining = getRemaining(remainingBySlot, slot.slotIndex);
    if (remaining < 0) {
      return false;
    }

    totalRemaining += remaining;
  }

  if (totalRemaining === 0) {
    return true;
  }

  if (totalRemaining % 2 !== 0) {
    return false;
  }

  for (let leftIndex = 0; leftIndex < slots.length; leftIndex++) {
    const slotA = slots[leftIndex];
    const remainingA = getRemaining(remainingBySlot, slotA.slotIndex);
    let capacity = 0;

    if (remainingA <= 0) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < slots.length; rightIndex++) {
      const slotB = slots[rightIndex];
      const remainingB = getRemaining(remainingBySlot, slotB.slotIndex);

      if (remainingA <= 0 || remainingB <= 0) {
        continue;
      }

      const pairKey = getPairKey(slotA.slotIndex, slotB.slotIndex);
      if (usedPairKeys.has(pairKey)) {
        continue;
      }

      availablePairings += 1;
      capacity += 1;
    }

    for (const otherSlot of slots) {
      if (otherSlot.slotIndex === slotA.slotIndex) {
        continue;
      }

      if (getRemaining(remainingBySlot, otherSlot.slotIndex) <= 0) {
        continue;
      }

      const pairKey = getPairKey(slotA.slotIndex, otherSlot.slotIndex);
      if (usedPairKeys.has(pairKey)) {
        continue;
      }

      capacity += 1;
    }

    const selfKey = getPairKey(slotA.slotIndex, slotA.slotIndex);
    if (remainingA >= 2 && !usedPairKeys.has(selfKey)) {
      availablePairings += 1;
      capacity += 2;
    }

    if (remainingA > capacity) {
      return false;
    }
  }

  return totalRemaining / 2 <= availablePairings;
}

function selectCandidatePool(
  bucket: MatchmakingBucket,
  candidates: MatchmakingPairing[],
): MatchmakingPairing[] {
  if (bucket === "baseline") {
    return candidates;
  }

  return shuffle(candidates.slice(0, Math.min(6, candidates.length)));
}

function buildAttempt(
  slots: ArenaCoachSlot[],
  matchesPerCoach: number,
  weights: MatchmakingWeights,
  history: PairingHistory,
): MatchmakingPairing[] | null {
  const totalPairings = (slots.length * matchesPerCoach) / 2;
  const remainingBySlot = new Map(slots.map((slot) => [slot.slotIndex, matchesPerCoach]));
  const usedPairKeys = new Set<string>();
  const pairings: MatchmakingPairing[] = [];

  while (pairings.length < totalPairings) {
    const candidatesByBucket = getCandidatesByBucket(slots, remainingBySlot, usedPairKeys, history);
    const availableBuckets = BUCKETS.filter((bucket) => candidatesByBucket[bucket].length > 0);

    if (availableBuckets.length === 0) {
      return null;
    }

    const bucketOrder = weightedBucketOrder(availableBuckets, weights);
    let selectedPairing: MatchmakingPairing | null = null;

    for (const bucket of bucketOrder) {
      const candidatePool = selectCandidatePool(bucket, candidatesByBucket[bucket]);

      for (const candidate of candidatePool) {
        const pairKey = getPairKey(candidate.slotA, candidate.slotB);

        applyPairing(remainingBySlot, candidate.slotA, candidate.slotB);
        usedPairKeys.add(pairKey);

        if (canSatisfyRemainingAssignments(slots, remainingBySlot, usedPairKeys)) {
          selectedPairing = candidate;
          break;
        }

        usedPairKeys.delete(pairKey);
        revertPairing(remainingBySlot, candidate.slotA, candidate.slotB);
      }

      if (selectedPairing) {
        pairings.push(selectedPairing);
        break;
      }
    }

    if (!selectedPairing) {
      return null;
    }
  }

  return Array.from(remainingBySlot.values()).every((remaining) => remaining === 0)
    ? pairings
    : null;
}

export function createPairingHistory(): PairingHistory {
  return {
    pairCounts: new Map<string, number>(),
  };
}

export function recordPairing(history: PairingHistory, slotA: number, slotB: number): void {
  const pairKey = getPairKey(slotA, slotB);
  history.pairCounts.set(pairKey, (history.pairCounts.get(pairKey) ?? 0) + 1);
}

export function getPairCount(history: PairingHistory, slotA: number, slotB: number): number {
  return history.pairCounts.get(getPairKey(slotA, slotB)) ?? 0;
}

export function selectPairings(
  slots: ArenaCoachSlot[],
  matchesPerCoach: number,
  weights: MatchmakingWeights,
  history: PairingHistory,
): MatchmakingPairing[] {
  if (slots.length < 2) {
    throw new Error("Matchmaking requires at least 2 slots");
  }

  if (!Number.isInteger(matchesPerCoach) || matchesPerCoach <= 0) {
    throw new Error("matchesPerCoach must be a positive integer");
  }

  const totalAssignments = slots.length * matchesPerCoach;
  if (totalAssignments % 2 !== 0) {
    throw new Error("Matchmaking requires an even total number of scheduled games per sprint");
  }

  const maxMatchesPerCoach = slots.length + 1;
  if (matchesPerCoach > maxMatchesPerCoach) {
    throw new Error(`Cannot schedule ${matchesPerCoach} matches per coach without duplicate pairings in a ${slots.length}-coach sprint`);
  }

  for (let attempt = 0; attempt < 400; attempt++) {
    const pairings = buildAttempt(slots, matchesPerCoach, weights, history);
    if (pairings) {
      return pairings;
    }
  }

  throw new Error("Failed to generate sprint pairings with the requested matchmaking constraints");
}
