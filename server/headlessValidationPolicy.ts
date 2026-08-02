import type { MatchQualityEvent } from "@shared/schema";
import type { AICallResult } from "./ai";

export interface ActionValidationDisposition {
  actionApplied: boolean;
  rejectMatch: boolean;
  taintsMatch: boolean;
  validationMetadata: Record<string, unknown>;
}

/**
 * Shared validators are an enforcement boundary only in strict research
 * execution. Exploratory/non-strict runs historically played the parsed or
 * fallback action without retrying; preserve that continuity, but make the
 * failed validation and resulting taint durable instead of silently blessing
 * the action.
 */
export function resolveActionValidationDisposition(
  validationMetadata: Record<string, unknown>,
  strictExecution: boolean | undefined,
): ActionValidationDisposition {
  const passed = validationMetadata.passed === true;
  const strict = strictExecution === true;
  const actionApplied = passed || !strict;
  return {
    actionApplied,
    rejectMatch: !passed && strict,
    taintsMatch: !passed,
    validationMetadata: {
      ...validationMetadata,
      disposition: passed
        ? "accepted"
        : strict
          ? "rejected_strict"
          : "applied_non_strict_continuity",
      actionApplied,
      taintsMatch: !passed,
    },
  };
}

export function hasActionValidationFailure(
  events: MatchQualityEvent[],
): boolean {
  return events.some((event) => event.type === "validation_failure");
}

export function rejectedHeadlessCallResult<T>(input: {
  fallback: T;
  model: string;
  prompt: string;
  error: unknown;
  timedOut: boolean;
  timeoutMs: number;
  providerMetadata?: Record<string, unknown>;
}): AICallResult<T> {
  return {
    result: input.fallback,
    prompt: input.prompt,
    rawResponse: "",
    model: input.model,
    latencyMs: input.timedOut ? input.timeoutMs : 0,
    error:
      input.error instanceof Error
        ? input.error.message
        : String(input.error),
    parseQuality: "error",
    providerMetadata: input.providerMetadata,
  };
}
