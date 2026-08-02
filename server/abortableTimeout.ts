export type AbortableTimeoutOutcome<T> =
  | {
      state: "fulfilled";
      value: T;
      timedOut: boolean;
    }
  | {
      state: "rejected";
      error: unknown;
      timedOut: boolean;
    }
  | {
      state: "abandoned";
      timedOut: true;
    };

export interface AbortableTimeoutOptions<T> {
  timeoutMs: number;
  operation: Promise<T>;
  /**
   * When present, the deadline aborts the same signal used by the underlying
   * provider call and briefly waits for that call to settle.
   */
  abortController?: AbortController;
  /**
   * Persist the timeout before returning control to strict execution.
   */
  onTimeout?: () => Promise<void>;
  abortSettleGraceMs?: number;
}

/**
 * Exploratory calls retain their historical "stop waiting" timeout behavior.
 * Strict calls supply an AbortController and receive active cancellation plus
 * a bounded settlement window so provider telemetry can reach a terminal row.
 */
export function runWithAbortableTimeout<T>(
  options: AbortableTimeoutOptions<T>,
): Promise<AbortableTimeoutOutcome<T>> {
  const timeoutMs = Math.max(1, options.timeoutMs);
  const abortSettleGraceMs = Math.max(
    1,
    options.abortSettleGraceMs ?? 5_000,
  );

  return new Promise((resolve) => {
    let finished = false;
    let timedOut = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutWrite: Promise<void> | undefined;

    const finish = (outcome: AbortableTimeoutOutcome<T>) => {
      if (finished) return;
      finished = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve(outcome);
    };

    const settleAfterTimeoutWrite = async (
      outcome: AbortableTimeoutOutcome<T>,
    ) => {
      try {
        await timeoutWrite;
      } catch (error) {
        finish({ state: "rejected", error, timedOut: true });
        return;
      }
      finish(outcome);
    };

    options.operation.then(
      (value) => {
        void settleAfterTimeoutWrite({
          state: "fulfilled",
          value,
          timedOut,
        });
      },
      (error) => {
        void settleAfterTimeoutWrite({
          state: "rejected",
          error,
          timedOut,
        });
      },
    );

    deadlineTimer = setTimeout(() => {
      timedOut = true;
      timeoutWrite = options.onTimeout
        ? Promise.resolve().then(options.onTimeout)
        : Promise.resolve();

      if (!options.abortController) {
        void settleAfterTimeoutWrite({
          state: "abandoned",
          timedOut: true,
        });
        return;
      }

      const timeoutError = new DOMException(
        `Timed out after ${timeoutMs}ms`,
        "TimeoutError",
      );
      options.abortController.abort(timeoutError);

      graceTimer = setTimeout(() => {
        void settleAfterTimeoutWrite({
          state: "abandoned",
          timedOut: true,
        });
      }, abortSettleGraceMs);
    }, timeoutMs);
  });
}
