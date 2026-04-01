export type ModelFailureType = "config" | "rate_limit" | "transient" | "timeout" | "unknown";
export type ModelAvailabilityState = "healthy" | "paused" | "disabled";

export interface ModelHealthStatus {
  key: string;
  state: ModelAvailabilityState;
  available: boolean;
  currentErrorType: ModelFailureType | null;
  consecutiveFailures: number;
  totalFailuresByType: Partial<Record<ModelFailureType, number>>;
  pauseCountByType: Partial<Record<ModelFailureType, number>>;
  pausedUntil: number | null;
  lastError: string | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
}

interface ModelHealthEntry {
  state: ModelAvailabilityState;
  consecutiveFailureType: ModelFailureType | null;
  consecutiveFailures: number;
  totalFailuresByType: Partial<Record<ModelFailureType, number>>;
  pauseCountByType: Partial<Record<ModelFailureType, number>>;
  pausedUntil: number | null;
  pausedErrorType: ModelFailureType | null;
  lastError: string | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
}

const PAUSE_THRESHOLD = 5;
const DISABLE_THRESHOLD = 25;
const BASE_PAUSE_MS = 30_000;
const MAX_PAUSE_MS = 30 * 60 * 1000;

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getNumericStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = (error as any).status ?? (error as any).statusCode ?? (error as any).code;
  if (typeof candidate === "number") return candidate;
  if (typeof candidate === "string" && /^\d+$/.test(candidate)) {
    return Number(candidate);
  }
  return undefined;
}

export function classifyModelFailure(error: unknown): ModelFailureType {
  const message = stringifyError(error).toLowerCase();
  const status = getNumericStatus(error);
  const code = typeof (error as any)?.code === "string" ? (error as any).code.toLowerCase() : "";

  if (status !== undefined && [400, 401, 403, 404].includes(status)) {
    return "config";
  }

  if (
    status === 429 ||
    code === "resource_exhausted" ||
    message.includes("resource_exhausted") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "rate_limit";
  }

  if (
    code === "etimedout" ||
    code === "aborterror" ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("deadline exceeded")
  ) {
    return "timeout";
  }

  if (
    (status !== undefined && status >= 500 && status < 600) ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("connection reset") ||
    message.includes("econnreset") ||
    message.includes("json parse") ||
    message.includes("failed to parse json") ||
    message.includes("unexpected token")
  ) {
    return "transient";
  }

  return "unknown";
}

export class ModelHealthTracker {
  private readonly models = new Map<string, ModelHealthEntry>();

  private getEntry(key: string): ModelHealthEntry {
    let entry = this.models.get(key);
    if (!entry) {
      entry = {
        state: "healthy",
        consecutiveFailureType: null,
        consecutiveFailures: 0,
        totalFailuresByType: {},
        pauseCountByType: {},
        pausedUntil: null,
        pausedErrorType: null,
        lastError: null,
        lastFailureAt: null,
        lastSuccessAt: null,
      };
      this.models.set(key, entry);
    }
    this.normalizeEntry(entry);
    return entry;
  }

  private normalizeEntry(entry: ModelHealthEntry, now = Date.now()) {
    if (entry.state === "paused" && entry.pausedUntil !== null && entry.pausedUntil <= now) {
      entry.state = "healthy";
      entry.pausedUntil = null;
      entry.pausedErrorType = null;
    }
  }

  recordSuccess(key: string): ModelHealthStatus {
    const entry = this.getEntry(key);
    entry.lastSuccessAt = Date.now();

    if (entry.state === "disabled") {
      return this.getStatus(key);
    }

    entry.state = "healthy";
    entry.pausedUntil = null;
    entry.pausedErrorType = null;

    entry.consecutiveFailureType = null;
    entry.consecutiveFailures = 0;
    entry.lastError = null;

    return this.getStatus(key);
  }

  recordFailure(key: string, error: unknown): ModelHealthStatus {
    const entry = this.getEntry(key);
    const now = Date.now();
    const failureType = classifyModelFailure(error);

    entry.lastFailureAt = now;
    entry.lastError = stringifyError(error);
    entry.totalFailuresByType[failureType] = (entry.totalFailuresByType[failureType] || 0) + 1;

    if (entry.consecutiveFailureType === failureType) {
      entry.consecutiveFailures += 1;
    } else {
      entry.consecutiveFailureType = failureType;
      entry.consecutiveFailures = 1;
    }

    if ((entry.totalFailuresByType[failureType] || 0) >= DISABLE_THRESHOLD) {
      entry.state = "disabled";
      entry.pausedUntil = null;
      entry.pausedErrorType = failureType;
      return this.getStatus(key);
    }

    if (entry.consecutiveFailures >= PAUSE_THRESHOLD) {
      const alreadyPausedForSameType =
        entry.state === "paused" &&
        entry.pausedUntil !== null &&
        entry.pausedUntil > now &&
        entry.pausedErrorType === failureType;

      if (!alreadyPausedForSameType) {
        const pauseCount = (entry.pauseCountByType[failureType] || 0) + 1;
        entry.pauseCountByType[failureType] = pauseCount;
        entry.state = "paused";
        entry.pausedErrorType = failureType;
        entry.pausedUntil = now + Math.min(BASE_PAUSE_MS * Math.pow(2, pauseCount - 1), MAX_PAUSE_MS);
      }
    }

    return this.getStatus(key);
  }

  isAvailable(key: string): boolean {
    return this.getStatus(key).available;
  }

  getStatus(key: string): ModelHealthStatus {
    const entry = this.getEntry(key);
    this.normalizeEntry(entry);

    return {
      key,
      state: entry.state,
      available: entry.state === "healthy",
      currentErrorType: entry.state === "paused" ? entry.pausedErrorType : entry.consecutiveFailureType,
      consecutiveFailures: entry.consecutiveFailures,
      totalFailuresByType: { ...entry.totalFailuresByType },
      pauseCountByType: { ...entry.pauseCountByType },
      pausedUntil: entry.pausedUntil,
      lastError: entry.lastError,
      lastFailureAt: entry.lastFailureAt,
      lastSuccessAt: entry.lastSuccessAt,
    };
  }

  getHealthSummary(): Record<string, ModelHealthStatus> {
    const summary: Record<string, ModelHealthStatus> = {};
    for (const key of this.models.keys()) {
      summary[key] = this.getStatus(key);
    }
    return summary;
  }
}
