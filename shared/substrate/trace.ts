/**
 * Standardized trace-envelope contract: the intended shape for one model
 * decision, whether a game ran in Herpetarium's arena or at The Table with
 * humans. As of 2026-08-01 this schema and its conformance checks exist, but
 * neither runtime emits/exports/ingests this envelope yet. Both apps retain
 * native decision telemetry; projecting that telemetry truthfully into this
 * contract is the next integration slice. The envelope cites the exact
 * artifact and exact model (requested AND served), so eventual results can be
 * attributable and alias mutations partitionable.
 *
 * Telemetry contract: `responseText` is provider-visible text only (no
 * chain of thought). Full telemetry — including human table/team dialogue —
 * is research and training material by the founder's explicit direction.
 * A trace normally *references* dialogue (`transcriptRef` into the app's
 * store); it may *carry* dialogue inline only under an operator-controlled
 * research export, in which case `exportStamp` records who exported, when,
 * and under what mode, so access control and lineage travel with the data.
 * Repo source files (fixtures, docs) are not an export channel and carry
 * bot-authored content only.
 */
import type { ModelRef, ResolvedModel } from "./modelRef";
import type { DecryptoAction } from "./actions";
import type { ChatLine } from "./observation";

export const TRACE_VERSION = "0.1";

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

/** Lineage stamp required whenever a trace carries dialogue inline. */
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
  /** The exact strategy artifact seated, if any. */
  artifact?: { id: string; contentHash: string };
  promptVersion?: string;
  modelRequested: ModelRef;
  modelResolved?: ResolvedModel;
  /** sha-256 hashes bind the trace to exact inputs without embedding them. */
  observationHash?: string;
  promptHash?: string;
  responseText?: string;
  parsed?: DecryptoAction;
  outcome?: TraceOutcome;
  timing?: { startedAt?: string; latencyMs?: number };
  usage?: { tokensIn?: number; tokensOut?: number; costUsd?: number };
  /** Pointer to the dialogue this decision saw, in the app's own store. */
  transcriptRef?: string;
  /** Inline dialogue — legal only with an exportStamp (operator-controlled). */
  transcript?: ChatLine[];
  exportStamp?: ResearchExportStamp;
}

const TASK_KINDS: TraceTaskKind[] = [
  "encrypt",
  "decode",
  "intercept",
  "deliberate_own",
  "deliberate_intercept",
  "table_talk",
  "reflection",
];

export function validateTraceEnvelope(trace: TraceEnvelope): string[] {
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
  if (!TASK_KINDS.includes(trace.taskKind)) {
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
