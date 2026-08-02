/**
 * Standardized trace contracts. v0.1 remains for legacy readers. v0.2 is one
 * bot decoder provider attempt with evidence The Table already persists:
 * exact request JSON value, provider-visible response text, allowlisted
 * response metadata, tokens, latency, parsed action, and application/outcome
 * events. It does not claim raw HTTP serialization or hidden chain of thought.
 */
import type { ModelRef, ResolvedModel } from "./modelRef";
import type { DecryptoAction } from "./actions";
import type { ChatLine } from "./observation";
import {
  validateRequestedModelRoute,
  type RequestedModelRoute,
} from "./botBuild";
import { contentHash } from "./hash";
import {
  SHA256_HEX_PATTERN,
  assertNoSecretBearingFields,
  cloneAndDeepFreeze,
  exactKeys,
  sameContentIdentity,
  validateContentIdentityRef,
  validateExactContentIdentityRef,
  type ContentIdentityRef,
} from "./identity";
import {
  verifyObservationV2,
  type CodeTriple,
  type DecryptoObservationV2,
  type ObservationActorV2,
} from "./observation";
import {
  validateTableCompetitiveIdentities,
  type CompetitiveIdentitySet,
} from "./protocol";

export const TRACE_VERSION = "0.1";
export const TRACE_V2_VERSION = "0.2";

export type TraceApp = "herpetarium" | "the-table";

export type TraceTaskKind =
  | "encrypt"
  | "decode"
  | "intercept"
  | "deliberate_own"
  | "deliberate_intercept"
  | "table_talk"
  | "reflection";

export interface TraceOutcome {
  /** Whether the parsed action was applied to authoritative game state. */
  applied: boolean;
  correct?: boolean;
  intercepted?: boolean;
  failureStage?: "provider" | "parse" | "application";
}

/** Lineage stamp required whenever a legacy trace carries dialogue inline. */
export interface ResearchExportStamp {
  mode: "operator_research";
  exportedAt: string;
  approvedBy: string;
}

export interface TraceEnvelope {
  traceVersion: string;
  app: TraceApp;
  gameId: string;
  roundNumber?: number;
  seatId: string;
  team: string;
  taskKind: TraceTaskKind;
  artifact?: { id: string; contentHash: string };
  promptVersion?: string;
  modelRequested: ModelRef;
  modelResolved?: ResolvedModel;
  observationHash?: string;
  promptHash?: string;
  responseText?: string;
  parsed?: DecryptoAction;
  outcome?: TraceOutcome;
  timing?: { startedAt?: string; latencyMs?: number };
  usage?: { tokensIn?: number; tokensOut?: number; costUsd?: number };
  transcriptRef?: string;
  transcript?: ChatLine[];
  exportStamp?: ResearchExportStamp;
}

const LEGACY_TASK_KINDS: TraceTaskKind[] = [
  "encrypt",
  "decode",
  "intercept",
  "deliberate_own",
  "deliberate_intercept",
  "table_talk",
  "reflection",
];

function validateLegacyTraceEnvelope(trace: TraceEnvelope): string[] {
  const problems: string[] = [];
  if (trace.traceVersion !== TRACE_VERSION) {
    problems.push(
      `traceVersion "${trace.traceVersion}" is not "${TRACE_VERSION}"`,
    );
  }
  if (trace.app !== "herpetarium" && trace.app !== "the-table") {
    problems.push(`app "${String(trace.app)}" is unknown`);
  }
  if (!trace.gameId) problems.push("gameId is required");
  if (!trace.seatId) problems.push("seatId is required");
  if (!trace.team) problems.push("team is required");
  if (!LEGACY_TASK_KINDS.includes(trace.taskKind)) {
    problems.push(`taskKind "${String(trace.taskKind)}" is unknown`);
  }
  if (!trace.modelRequested?.provider || !trace.modelRequested?.model) {
    problems.push("modelRequested must carry provider and model");
  }
  if (trace.artifact && (!trace.artifact.id || !trace.artifact.contentHash)) {
    problems.push("artifact reference must carry id and contentHash");
  }
  if (trace.transcript !== undefined && trace.transcript.length > 0) {
    if (!trace.exportStamp || trace.exportStamp.mode !== "operator_research") {
      problems.push(
        "inline transcript requires an operator_research exportStamp",
      );
    } else {
      if (!/^\d{4}-\d{2}-\d{2}/.test(trace.exportStamp.exportedAt ?? "")) {
        problems.push("exportStamp.exportedAt must be an ISO date");
      }
      if (!trace.exportStamp.approvedBy) {
        problems.push("exportStamp.approvedBy is required");
      }
    }
  }
  return problems;
}

export type TraceTaskKindV2 = "decode";
export type TraceClassification = "team_private" | "operator";

export interface ContentBlobRef {
  readonly contentHash: string;
  readonly blobRef: string;
  readonly classification: TraceClassification;
}

export interface ActionEventRef extends ContentIdentityRef {
  readonly sequence: number;
}

export interface TraceUsageV2 {
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
}

export interface TraceOutcomeV2 {
  readonly status: "pending" | "resolved";
  readonly outcomeEvent: ActionEventRef | null;
}

export interface TraceEnvelopeV2Source {
  readonly traceVersion: typeof TRACE_V2_VERSION;
  readonly app: TraceApp;
  readonly gameId: string;
  readonly roundNumber: number;
  readonly decisionId: string;
  readonly attemptId: string;
  readonly logicalActionKey: string;
  readonly actor: ObservationActorV2 & { readonly role: "decoder" };
  readonly role: "decoder";
  readonly taskKind: TraceTaskKindV2;
  readonly identities: CompetitiveIdentitySet & {
    readonly botBuild: ContentIdentityRef;
  };
  readonly inputs: {
    readonly observation: ContentBlobRef;
    /** Canonical hash of the exact JSON value retained in ai_calls.requestJson. */
    readonly requestJson: ContentBlobRef | null;
  };
  readonly outputs: {
    /** Exact provider-visible text retained in ai_calls.responseRaw. */
    readonly responseText: ContentBlobRef | null;
    /** Canonical hash of allowlisted ai_calls.responseMeta JSON, when present. */
    readonly responseMeta: ContentBlobRef | null;
  };
  readonly provider: {
    readonly requested: RequestedModelRoute;
    readonly servedModel: string | null;
    readonly upstream: string | null;
    readonly routeAttempt: number | null;
    readonly status: "succeeded" | "failed";
    readonly failureStage: "provider" | "parse" | "application" | null;
  };
  readonly parsedAction: {
    readonly action: {
      readonly kind: "guess";
      readonly role: "decode";
      readonly guess: CodeTriple;
    };
    readonly contentHash: string;
  } | null;
  readonly validation: {
    readonly status: "accepted" | "rejected" | "not_run";
    readonly validator: ContentIdentityRef;
    readonly problems: readonly string[];
  };
  readonly application: {
    readonly applied: boolean;
    readonly logicalActionKey: string;
    readonly parsedActionHash: string | null;
    readonly actionEvent: ActionEventRef | null;
  };
  readonly outcome: TraceOutcomeV2;
  readonly telemetry: {
    /** ai_calls.createdAt (record time), not an invented request start time. */
    readonly recordedAt: string;
    readonly latencyMs: number;
    readonly usage: TraceUsageV2;
  };
}

export interface TraceEnvelopeV2 extends TraceEnvelopeV2Source {
  readonly contentHash: string;
}

export type AnyTraceEnvelope = TraceEnvelope | TraceEnvelopeV2;

const ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const OPAQUE_BLOB_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function blobProblems(
  blob: ContentBlobRef | null,
  label: string,
  requiredClassification: TraceClassification | null,
): string[] {
  if (blob === null) return [];
  const problems = exactKeys(
    blob,
    ["contentHash", "blobRef", "classification"],
    label,
  );
  if (
    typeof blob?.contentHash !== "string" ||
    !SHA256_HEX_PATTERN.test(blob.contentHash)
  ) {
    problems.push(`${label}.contentHash must be a lowercase sha-256 digest`);
  }
  if (
    !nonEmpty(blob?.blobRef) ||
    !OPAQUE_BLOB_PATTERN.test(blob.blobRef) ||
    blob.blobRef.includes("..") ||
    blob.blobRef.includes("://") ||
    /[?#\\]/.test(blob.blobRef)
  ) {
    problems.push(`${label}.blobRef must be an opaque store key`);
  }
  if (
    blob?.classification !== "team_private" &&
    blob?.classification !== "operator"
  ) {
    problems.push(`${label}.classification is unknown`);
  }
  if (
    requiredClassification !== null &&
    blob?.classification !== requiredClassification
  ) {
    problems.push(
      `${label}.classification must be ${requiredClassification}`,
    );
  }
  return problems;
}

function eventProblems(
  event: ActionEventRef | null,
  label: string,
): string[] {
  if (event === null) return [];
  const problems = [
    ...exactKeys(event, ["id", "contentHash", "sequence"], label),
    ...validateContentIdentityRef(event, label),
  ];
  if (!Number.isInteger(event?.sequence) || event.sequence < 0) {
    problems.push(`${label}.sequence must be a non-negative integer`);
  }
  return problems;
}

function codeProblems(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length !== 3) {
    return [`${label} must contain exactly three digits`];
  }
  const problems: string[] = [];
  if (
    value.some(
      (digit) => !Number.isInteger(digit) || digit < 1 || digit > 4,
    )
  ) {
    problems.push(`${label} digits must be integers in 1..4`);
  }
  if (new Set(value).size !== 3) problems.push(`${label} digits must be distinct`);
  return problems;
}

export function validateTraceEnvelopeV2(
  trace: TraceEnvelopeV2Source | TraceEnvelopeV2,
): string[] {
  const problems: string[] = [];
  try {
    const sourceKeys = [
      "traceVersion",
      "app",
      "gameId",
      "roundNumber",
      "decisionId",
      "attemptId",
      "logicalActionKey",
      "actor",
      "role",
      "taskKind",
      "identities",
      "inputs",
      "outputs",
      "provider",
      "parsedAction",
      "validation",
      "application",
      "outcome",
      "telemetry",
    ];
    problems.push(
      ...exactKeys(
        trace,
        "contentHash" in trace ? [...sourceKeys, "contentHash"] : sourceKeys,
        "trace",
      ),
    );
    if (trace?.traceVersion !== TRACE_V2_VERSION) {
      problems.push(`traceVersion must be "${TRACE_V2_VERSION}"`);
    }
    if (trace?.app !== "herpetarium" && trace?.app !== "the-table") {
      problems.push("app must be herpetarium|the-table");
    }
    for (const [label, value] of [
      ["gameId", trace?.gameId],
      ["decisionId", trace?.decisionId],
      ["attemptId", trace?.attemptId],
      ["logicalActionKey", trace?.logicalActionKey],
    ] as const) {
      if (!nonEmpty(value)) problems.push(`${label} is required`);
    }
    if (!Number.isInteger(trace?.roundNumber) || trace.roundNumber < 1) {
      problems.push("roundNumber must be a positive integer");
    }
    if (trace?.role !== "decoder" || trace?.taskKind !== "decode") {
      problems.push("v0.2 trace supports only decoder/decode");
    }
    problems.push(
      ...exactKeys(
        trace?.actor,
        ["actorId", "seatId", "team", "role"],
        "actor",
      ),
    );
    if (
      !nonEmpty(trace?.actor?.actorId) ||
      !nonEmpty(trace?.actor?.seatId) ||
      !nonEmpty(trace?.actor?.team) ||
      trace?.actor?.role !== "decoder"
    ) {
      problems.push("actor must be a complete decoder actor");
    }
    problems.push(
      ...exactKeys(
        trace?.identities,
        ["botBuild", "protocol", "visibility", "rules"],
        "identities",
      ),
      ...validateExactContentIdentityRef(
        trace?.identities?.botBuild,
        "identities.botBuild",
      ),
      ...validateTableCompetitiveIdentities(
        {
          protocol: trace?.identities?.protocol,
          visibility: trace?.identities?.visibility,
          rules: trace?.identities?.rules,
        },
        "identities",
      ),
      ...exactKeys(trace?.inputs, ["observation", "requestJson"], "inputs"),
      ...blobProblems(
        trace?.inputs?.observation,
        "inputs.observation",
        null,
      ),
      ...blobProblems(
        trace?.inputs?.requestJson,
        "inputs.requestJson",
        "operator",
      ),
      ...exactKeys(
        trace?.outputs,
        ["responseText", "responseMeta"],
        "outputs",
      ),
      ...blobProblems(
        trace?.outputs?.responseText,
        "outputs.responseText",
        "operator",
      ),
      ...blobProblems(
        trace?.outputs?.responseMeta,
        "outputs.responseMeta",
        "operator",
      ),
    );
    if (trace?.inputs?.observation === null) {
      problems.push("inputs.observation is required");
    } else if (
      trace?.inputs?.observation?.classification !== "team_private" &&
      trace?.inputs?.observation?.classification !== "operator"
    ) {
      problems.push(
        "inputs.observation.classification must be team_private|operator",
      );
    }

    problems.push(
      ...exactKeys(
        trace?.provider,
        [
          "requested",
          "servedModel",
          "upstream",
          "routeAttempt",
          "status",
          "failureStage",
        ],
        "provider",
      ),
      ...validateRequestedModelRoute(
        trace?.provider?.requested,
        trace?.telemetry?.recordedAt?.slice(0, 10) ?? "",
      ),
    );
    for (const [label, value] of [
      ["provider.servedModel", trace?.provider?.servedModel],
      ["provider.upstream", trace?.provider?.upstream],
    ] as const) {
      if (value !== null && !nonEmpty(value)) {
        problems.push(`${label} must be non-empty string|null`);
      }
    }
    if (
      trace?.provider?.routeAttempt !== null &&
      (!Number.isInteger(trace?.provider?.routeAttempt) ||
        trace.provider.routeAttempt < 1)
    ) {
      problems.push("provider.routeAttempt must be a positive integer|null");
    }
    if (
      trace?.provider?.status !== "succeeded" &&
      trace?.provider?.status !== "failed"
    ) {
      problems.push("provider.status must be succeeded|failed");
    }
    if (
      trace?.provider?.failureStage !== null &&
      trace?.provider?.failureStage !== "provider" &&
      trace?.provider?.failureStage !== "parse" &&
      trace?.provider?.failureStage !== "application"
    ) {
      problems.push("provider.failureStage is unknown");
    }
    if (trace?.provider?.status === "succeeded") {
      if (
        trace.provider.failureStage !== null ||
        !nonEmpty(trace.provider.servedModel) ||
        trace.provider.routeAttempt === null ||
        trace.inputs.requestJson === null ||
        trace.outputs.responseText === null
      ) {
        problems.push(
          "successful provider attempt requires route, request JSON, response text, and null failureStage",
        );
      }
    } else if (trace?.provider?.failureStage === null) {
      problems.push("failed provider attempt requires failureStage");
    }

    if (trace?.parsedAction !== null) {
      problems.push(
        ...exactKeys(
          trace?.parsedAction,
          ["action", "contentHash"],
          "parsedAction",
        ),
        ...exactKeys(
          trace?.parsedAction?.action,
          ["kind", "role", "guess"],
          "parsedAction.action",
        ),
        ...codeProblems(trace?.parsedAction?.action?.guess, "parsedAction.guess"),
      );
      if (
        trace?.parsedAction?.action?.kind !== "guess" ||
        trace?.parsedAction?.action?.role !== "decode"
      ) {
        problems.push("parsedAction must be a decode guess");
      }
      if (
        trace?.parsedAction?.contentHash !==
        contentHash(trace?.parsedAction?.action)
      ) {
        problems.push("parsedAction.contentHash must bind the exact action");
      }
    }

    problems.push(
      ...exactKeys(
        trace?.validation,
        ["status", "validator", "problems"],
        "validation",
      ),
      ...validateExactContentIdentityRef(
        trace?.validation?.validator,
        "validation.validator",
      ),
    );
    if (
      trace?.validation?.status !== "accepted" &&
      trace?.validation?.status !== "rejected" &&
      trace?.validation?.status !== "not_run"
    ) {
      problems.push("validation.status is unknown");
    }
    if (
      !Array.isArray(trace?.validation?.problems) ||
      !trace.validation.problems.every(nonEmpty)
    ) {
      problems.push("validation.problems must contain non-empty strings");
    }
    if (
      (trace?.validation?.status === "accepted" &&
        (trace?.parsedAction === null ||
          trace.validation.problems.length !== 0)) ||
      (trace?.validation?.status === "rejected" &&
        (trace?.parsedAction === null ||
          trace.validation.problems.length === 0)) ||
      (trace?.validation?.status === "not_run" &&
        trace.validation.problems.length !== 0)
    ) {
      problems.push("validation status/action/problems are incoherent");
    }

    problems.push(
      ...exactKeys(
        trace?.application,
        ["applied", "logicalActionKey", "parsedActionHash", "actionEvent"],
        "application",
      ),
      ...eventProblems(trace?.application?.actionEvent, "application.actionEvent"),
    );
    if (typeof trace?.application?.applied !== "boolean") {
      problems.push("application.applied must be boolean");
    }
    if (trace?.application?.logicalActionKey !== trace?.logicalActionKey) {
      problems.push("application.logicalActionKey must bind logicalActionKey");
    }
    if (trace?.application?.applied) {
      if (
        trace?.provider?.status !== "succeeded" ||
        trace?.parsedAction === null ||
        trace?.validation?.status !== "accepted" ||
        trace?.application?.parsedActionHash !==
          trace?.parsedAction?.contentHash ||
        trace?.application?.actionEvent === null
      ) {
        problems.push(
          "applied action requires successful provider, accepted parsed action hash, and action event",
        );
      }
    } else if (
      trace?.application?.parsedActionHash !== null ||
      trace?.application?.actionEvent !== null
    ) {
      problems.push("unapplied action cannot claim action evidence");
    }

    problems.push(
      ...exactKeys(trace?.outcome, ["status", "outcomeEvent"], "outcome"),
      ...eventProblems(trace?.outcome?.outcomeEvent, "outcome.outcomeEvent"),
    );
    if (trace?.outcome?.status === "pending") {
      if (trace?.outcome?.outcomeEvent !== null) {
        problems.push("pending outcome must not carry outcomeEvent");
      }
    } else if (trace?.outcome?.status === "resolved") {
      if (
        !trace?.application?.applied ||
        trace?.outcome?.outcomeEvent === null ||
        trace.outcome.outcomeEvent.sequence <
          trace.application.actionEvent!.sequence
      ) {
        problems.push(
          "resolved outcome requires an applied action and non-earlier outcome event",
        );
      }
    } else {
      problems.push("outcome.status must be pending|resolved");
    }

    problems.push(
      ...exactKeys(
        trace?.telemetry,
        ["recordedAt", "latencyMs", "usage"],
        "telemetry",
      ),
      ...exactKeys(
        trace?.telemetry?.usage,
        ["tokensIn", "tokensOut"],
        "telemetry.usage",
      ),
    );
    if (
      !ISO_PATTERN.test(trace?.telemetry?.recordedAt ?? "") ||
      !Number.isFinite(Date.parse(trace?.telemetry?.recordedAt ?? ""))
    ) {
      problems.push("telemetry.recordedAt must be an ISO UTC timestamp");
    }
    if (
      !Number.isInteger(trace?.telemetry?.latencyMs) ||
      trace.telemetry.latencyMs < 0
    ) {
      problems.push("telemetry.latencyMs must be a non-negative integer");
    }
    for (const key of ["tokensIn", "tokensOut"] as const) {
      const value = trace?.telemetry?.usage?.[key];
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        problems.push(`telemetry.usage.${key} must be integer|null`);
      }
    }
    assertNoSecretBearingFields(trace, "trace");
  } catch (error) {
    problems.push(
      `trace validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

export function traceV2ContentHash(source: TraceEnvelopeV2Source): string {
  return contentHash(source);
}

export function mintTraceEnvelopeV2(
  source: TraceEnvelopeV2Source,
): TraceEnvelopeV2 {
  const problems = validateTraceEnvelopeV2(source);
  if (problems.length > 0) {
    throw new Error(`invalid trace v0.2: ${problems.join("; ")}`);
  }
  const cloned = structuredClone(source);
  return cloneAndDeepFreeze({
    ...cloned,
    contentHash: traceV2ContentHash(cloned),
  });
}

export function verifyTraceEnvelopeV2(trace: TraceEnvelopeV2): boolean {
  try {
    const { contentHash: recorded, ...source } = trace;
    return (
      validateTraceEnvelopeV2(trace).length === 0 &&
      traceV2ContentHash(source) === recorded
    );
  } catch {
    return false;
  }
}

/**
 * Cross-object gate used before ingestion. It proves the trace is for this
 * exact role-legal observation and that every duplicated decision/application
 * identity agrees. BotBuild registry resolution remains a separate boundary.
 */
export function validateDecisionChain(
  observation: DecryptoObservationV2,
  trace: TraceEnvelopeV2,
): string[] {
  const problems: string[] = [];
  try {
    if (!verifyObservationV2(observation)) {
      problems.push("observation must verify");
    }
    if (!verifyTraceEnvelopeV2(trace)) problems.push("trace must verify");
    if (trace.inputs.observation.contentHash !== observation.contentHash) {
      problems.push("trace observation hash mismatch");
    }
    for (const key of [
      "gameId",
      "roundNumber",
      "decisionId",
      "logicalActionKey",
      "role",
    ] as const) {
      if (trace[key] !== observation[key]) {
        problems.push(`${key} mismatch`);
      }
    }
    for (const key of ["actorId", "seatId", "team", "role"] as const) {
      if (trace.actor[key] !== observation.actor[key]) {
        problems.push(`actor.${key} mismatch`);
      }
    }
    for (const key of ["botBuild", "protocol", "visibility", "rules"] as const) {
      if (
        !sameContentIdentity(
          trace.identities[key],
          observation.identities[key],
        )
      ) {
        problems.push(`identities.${key} mismatch`);
      }
    }
    if (observation.role !== "decoder" || trace.taskKind !== "decode") {
      problems.push("task mismatch: v0.2 chain supports decoder/decode only");
    }
    if (
      trace.application.logicalActionKey !== observation.logicalActionKey ||
      (trace.application.applied &&
        trace.application.parsedActionHash !== trace.parsedAction?.contentHash)
    ) {
      problems.push("application mismatch");
    }
  } catch (error) {
    problems.push(
      `decision chain validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

export function validateTraceEnvelope(trace: AnyTraceEnvelope): string[] {
  if (trace?.traceVersion === TRACE_V2_VERSION) {
    return validateTraceEnvelopeV2(trace as TraceEnvelopeV2);
  }
  if (trace?.traceVersion === TRACE_VERSION) {
    return validateLegacyTraceEnvelope(trace as TraceEnvelope);
  }
  return [
    `traceVersion "${String(
      (trace as { traceVersion?: unknown })?.traceVersion,
    )}" is unknown`,
  ];
}
