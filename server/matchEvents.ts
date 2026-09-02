import { storage } from "./storage";
import { log } from "./index";
import type { MatchEventPayload } from "@shared/schema";

// Monotonic per-game sequence counter. This (not createdAt) is what
// guarantees strict, unambiguous event ordering for replay — timestamps
// alone can collide or skew, a counter can't.
const sequenceCounters = new Map<string, number>();

function nextSequence(gameId: string): number {
  const next = (sequenceCounters.get(gameId) ?? 0) + 1;
  sequenceCounters.set(gameId, next);
  return next;
}

// Call when a game is torn down (same lifecycle as gameMatchIds.delete /
// cleanupPersistedRounds in websocket.ts) so the counter map doesn't grow
// unbounded across a long-running server.
export function clearMatchEventSequence(gameId: string): void {
  sequenceCounters.delete(gameId);
}

interface EmitMatchEventOptions {
  round?: number | null;
  team?: "amber" | "blue" | null;
  playerId?: string | null;
}

export async function emitMatchEvent(
  gameId: string,
  matchId: number | null,
  payload: MatchEventPayload,
  options: EmitMatchEventOptions = {},
): Promise<void> {
  try {
    await storage.createMatchEvent({
      matchId,
      gameId,
      sequence: nextSequence(gameId),
      round: options.round ?? null,
      team: options.team ?? null,
      playerId: options.playerId ?? null,
      eventType: payload.eventType,
      payload,
    });
  } catch (err) {
    log(`Failed to log match event (${payload.eventType}): ${err}`, "match-events");
  }
}
