import type {
  InsertProviderAttempt,
  ProviderAttempt,
  ProviderAttemptStatus,
} from "@shared/schema";
import type {
  ProviderAttemptTelemetry,
  ProviderAttemptTerminalStatus,
} from "./ai";

/**
 * Narrow storage contract so lifecycle behavior can be tested without loading
 * the application database module.
 */
export interface ProviderAttemptStore {
  createProviderAttempt(
    entry: InsertProviderAttempt,
  ): Promise<ProviderAttempt>;
  updateProviderAttempt(
    id: number,
    data: Partial<InsertProviderAttempt>,
  ): Promise<ProviderAttempt | undefined>;
}

export interface StrictProviderAttemptContext {
  matchId: number;
  gameId: string;
  roundNumber: number;
  actionType: string;
  provider: "openrouter";
  model: string;
  physicalAttempt?: number;
}

export interface StrictProviderAttemptHandle {
  attemptId: number;
  abortController: AbortController;
  telemetry: ProviderAttemptTelemetry;
  markFailed(
    error: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  markTimedOut(timeoutMs: number): Promise<void>;
  linkAiCallLog(aiCallLogId: number): Promise<void>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Inserts the durable write-ahead row. Callers must await this before invoking
 * the provider. A process death after this function returns therefore leaves a
 * truthful `started`/indeterminate record rather than an invisible attempt.
 */
export async function beginStrictOpenRouterAttempt(
  store: ProviderAttemptStore,
  context: StrictProviderAttemptContext,
): Promise<StrictProviderAttemptHandle> {
  const attempt = await store.createProviderAttempt({
    matchId: context.matchId,
    gameId: context.gameId,
    roundNumber: context.roundNumber,
    actionType: context.actionType,
    provider: context.provider,
    model: context.model,
    physicalAttempt: context.physicalAttempt ?? 1,
    status: "started",
    requestMetadata: null,
    terminalMetadata: null,
    error: null,
    aiCallLogId: null,
    completedAt: null,
  });

  let terminalStatus: ProviderAttemptStatus | undefined;
  let terminalWrite: Promise<void> | undefined;

  const persistUpdate = async (
    data: Partial<InsertProviderAttempt>,
  ): Promise<void> => {
    const updated = await store.updateProviderAttempt(attempt.id, data);
    if (!updated) {
      throw new Error(`Provider attempt ${attempt.id} no longer exists`);
    }
  };

  const markTerminal = (
    input: {
      status: ProviderAttemptTerminalStatus;
      metadata: Record<string, unknown>;
      error?: string | null;
    },
  ): Promise<void> => {
    // The first terminal observation wins. In particular, a deadline cannot
    // later be overwritten by a provider success that raced with cancellation.
    if (terminalWrite) return terminalWrite;
    terminalStatus = input.status;
    terminalWrite = persistUpdate({
      status: input.status,
      terminalMetadata: input.metadata,
      error: input.error ?? null,
      completedAt: new Date(),
    });
    return terminalWrite;
  };

  const telemetry: ProviderAttemptTelemetry = {
    attemptId: attempt.id,
    async markRequest(metadata) {
      if (terminalStatus) {
        throw new Error(
          `Provider attempt ${attempt.id} is already ${terminalStatus}`,
        );
      }
      await persistUpdate({ requestMetadata: metadata });
    },
    markTerminal,
  };

  return {
    attemptId: attempt.id,
    abortController: new AbortController(),
    telemetry,
    markFailed(error, metadata = {}) {
      return markTerminal({
        status: "failed",
        metadata,
        error,
      });
    },
    markTimedOut(timeoutMs) {
      return markTerminal({
        status: "timed_out",
        metadata: {
          timeoutMs,
          cancellationRequested: true,
        },
        error: `Timed out after ${timeoutMs}ms`,
      });
    },
    async linkAiCallLog(aiCallLogId) {
      try {
        await persistUpdate({ aiCallLogId });
      } catch (error) {
        throw new Error(
          `Could not link provider attempt ${attempt.id} to AI call log ${aiCallLogId}: ${errorText(error)}`,
        );
      }
    },
  };
}
