import type { MatchQualityEvent } from "@shared/schema";
import type { AICallResult } from "./ai";
import { validateCodeGuess } from "@shared/substrate";

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

export type HeadlessCodeActionType =
  | "generate_guess"
  | "generate_interception";

/**
 * Ordinary guess/interception application policy.
 *
 * - Every candidate is checked by the shared `validateCodeGuess` boundary.
 * - Invalid triples and timeout/error/fallback placeholders are rejected in
 *   both strict and exploratory matches, with no retry or replacement.
 * - A valid `partial_recovery` triple is accepted only in exploratory mode;
 *   strict research execution continues to require a clean parse.
 */
export function resolveCodeActionValidationDisposition(input: {
  actionType: HeadlessCodeActionType;
  candidate: unknown;
  parseQuality: AICallResult<unknown>["parseQuality"];
  timedOut: boolean;
  error?: string | null;
  strictExecution: boolean | undefined;
}): ActionValidationDisposition {
  const codeProblems = validateCodeGuess(input.candidate);
  const sourceProblems: string[] = [];
  const parseQuality = input.parseQuality ?? null;

  if (input.timedOut) sourceProblems.push("provider call timed out");
  if (input.error) sourceProblems.push(input.error);
  if (parseQuality === "fallback_used") {
    sourceProblems.push("parser produced a fallback placeholder");
  } else if (parseQuality === "error") {
    sourceProblems.push("provider or parser returned an error result");
  } else if (parseQuality === null) {
    sourceProblems.push("parse quality is missing");
  } else if (
    codeProblems.length === 0 &&
    parseQuality === "partial_recovery" &&
    input.strictExecution === true
  ) {
    sourceProblems.push(
      "strict execution rejects valid partial-recovery triples",
    );
  } else if (
    parseQuality !== "clean" &&
    parseQuality !== "partial_recovery"
  ) {
    sourceProblems.push(`unsupported parse quality ${String(parseQuality)}`);
  }

  const passed =
    codeProblems.length === 0 && sourceProblems.length === 0;
  const acceptedPartialRecovery =
    passed && parseQuality === "partial_recovery";
  const disposition = passed
    ? acceptedPartialRecovery
      ? "accepted_partial_recovery_exploratory"
      : "accepted_clean"
    : codeProblems.length > 0
      ? "rejected_invalid_code"
      : parseQuality === "partial_recovery" &&
          input.strictExecution === true
        ? "rejected_partial_recovery_strict"
        : "rejected_source_failure";

  return {
    actionApplied: passed,
    rejectMatch: !passed,
    taintsMatch: !passed,
    validationMetadata: {
      validator: "headless.code-action-application@0.2",
      codeValidator: "shared.validateCodeGuess@substrate",
      actionType: input.actionType,
      passed,
      problems: [...codeProblems, ...sourceProblems],
      codeProblems,
      sourceProblems,
      parseQuality,
      timedOut: input.timedOut,
      providerError: input.error ?? null,
      policy: acceptedPartialRecovery
        ? "valid partial recovery is exploratory-only"
        : "invalid or fabricated code actions fail closed in all modes",
      disposition,
      actionApplied: passed,
      taintsMatch: !passed,
    },
  };
}

export interface ReadyCodeSignalParse {
  present: boolean;
  candidate: unknown;
}

/**
 * Extract the first numeric READY candidate without requiring READY to occupy
 * its own line. The live prompt explicitly permits prose around the signal,
 * and models commonly add Markdown or terminal punctuation.
 *
 * Numeric but illegal triples (duplicates or values outside 1..4) remain
 * visible to the shared validator. A nonnumeric or incomplete mention is not
 * an action candidate; it can never occupy a game-state slot, and a
 * deliberation which never produces two matching legal candidates still
 * fails closed at its exchange cap.
 */
export function parseReadyCodeSignal(content: string): ReadyCodeSignalParse {
  const match = content.match(
    /\bREADY:\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)(?=$|[\s.!?;:)\]}>*—-])/i,
  );
  if (!match) return { present: false, candidate: null };
  return {
    present: true,
    candidate: [Number(match[1]), Number(match[2]), Number(match[3])],
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
