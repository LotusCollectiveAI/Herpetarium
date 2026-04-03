import { randomUUID } from "crypto";
import type {
  AIPlayerConfig,
  CoachBeliefUpdate,
  CoachConfig,
  CoachModuleEdit,
  CoachPatchBundle,
  CoachPromptEnvironment,
  CoachProposal,
  CoachReviewResult,
  GenomeModuleKey,
  GenomeModules,
  PatchReviewSummary,
  SprintEvaluation,
  AnchorABReport,
} from "@shared/schema";
import { getDefaultConfig } from "@shared/schema";
import { callAI } from "./ai";
import { compileGenomePrompts } from "./genomeCompiler";
import type { CoachState, SprintResult } from "./coachLoop";

const MODULE_KEYS: GenomeModuleKey[] = [
  "cluePhilosophy",
  "opponentModeling",
  "riskTolerance",
  "memoryPolicy",
  "executionGuidance",
  "deliberationScaffold",
];

function buildCoachAIConfig(config: CoachConfig): AIPlayerConfig {
  return {
    ...getDefaultConfig(config.coachProvider),
    provider: config.coachProvider,
    model: config.coachModel,
  };
}

function asTrimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function isGenomeModuleKey(value: unknown): value is GenomeModuleKey {
  return MODULE_KEYS.includes(value as GenomeModuleKey);
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

function normalizePseudoJson(text: string): string {
  return text
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\s*)'([^'\\]+?)'\s*:/g, "$1\"$2\":")
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'(?=\s*[},\]])/g, (_match, value: string) => `: ${JSON.stringify(value)}`)
    .replace(/,\s*([}\]])/g, "$1");
}

function parseJsonObject(rawResponse: string): Record<string, unknown> | null {
  const candidates = [
    rawResponse.trim(),
    stripMarkdownFences(rawResponse),
    extractJsonObject(stripMarkdownFences(rawResponse)) || "",
  ].filter((candidate) => candidate.length > 0);

  for (const candidate of candidates) {
    for (const attempt of [candidate, normalizePseudoJson(candidate)]) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Try the next candidate.
      }
    }
  }

  return null;
}

function formatGenomeModules(genome: GenomeModules): string {
  return compileGenomePrompts(genome).prompts.coach.systemPrompt;
}

function formatBeliefs(state: CoachState): string {
  const activeBeliefs = state.beliefs.filter((belief) => belief.status === "active");

  if (activeBeliefs.length === 0) {
    return "No active beliefs.";
  }

  return activeBeliefs
    .map((belief, index) =>
      `${index + 1}. [${belief.id}] ${belief.proposition} Confidence ${belief.confidence.toFixed(2)}. Evidence: ${belief.evidence}`,
    )
    .join("\n");
}

function formatPatchHistory(state: CoachState): string {
  if (state.patchHistory.length === 0) {
    return "No committed patch history yet.";
  }

  return state.patchHistory
    .slice(-6)
    .map((patch, index) =>
      `${index + 1}. Sprint ${patch.sprintApplied} ${patch.targetModule}: ${patch.expectedEffect}`,
    )
    .join("\n");
}

function formatSprintResult(sprintResult: SprintResult): string {
  if (sprintResult.matchResults.length === 0) {
    return `Record ${sprintResult.record}, win rate ${sprintResult.winRate.toFixed(2)}. No completed matches.`;
  }

  const lines = sprintResult.matchResults.map((match) => {
    const outcome = match.winner === null
      ? "draw"
      : match.winner === match.ourTeam
        ? "win"
        : "loss";

    return `Match ${match.matchId}: ${outcome}; our team ${match.ourTeam}; rounds ${match.totalRounds}; tokens us ${match.ourWhiteTokens}/${match.ourBlackTokens}, opp ${match.oppWhiteTokens}/${match.oppBlackTokens}.`;
  });

  return [`Record ${sprintResult.record}, win rate ${sprintResult.winRate.toFixed(2)}.`, ...lines].join("\n");
}

function formatPendingPatchReviews(patchReviews: PatchReviewSummary[]): string {
  if (patchReviews.length === 0) {
    return "No pending patch reviews.";
  }

  return patchReviews
    .map((review, index) =>
      `${index + 1}. Proposal ${review.proposalId} from sprint ${review.committedSprint} is ${review.status}; fired triggers: ${review.firedTriggers.join(", ") || "none"}.`,
    )
    .join("\n");
}

function formatPolicyNotices(evaluation: SprintEvaluation): string {
  if (evaluation.policyNotices.length === 0) {
    return "No policy notices.";
  }

  return evaluation.policyNotices
    .map((notice, index) => `${index + 1}. [${notice.severity}] ${notice.code}: ${notice.message}`)
    .join("\n");
}

function formatEvaluation(evaluation: SprintEvaluation): string {
  return [
    `Sprint ${evaluation.sprintNumber} for run ${evaluation.runId}`,
    "",
    "### Training",
    `Wins ${evaluation.training.wins}, losses ${evaluation.training.losses}, draws ${evaluation.training.draws}, win rate ${evaluation.training.winRate.toFixed(4)}, mean rounds ${evaluation.training.meanRoundsPerMatch.toFixed(2)}.`,
    "",
    "### Execution",
    `Own decode ${evaluation.execution.ownDecodeRate.toFixed(4)}, opponent intercept against us ${evaluation.execution.opponentInterceptRateAgainstUs.toFixed(4)}, our intercept ${evaluation.execution.ourInterceptRate.toFixed(4)}, miscommunication ${evaluation.execution.miscommunicationRate.toFixed(4)}, asymmetry ${evaluation.execution.catastrophicAsymmetryRate.toFixed(4)}.`,
    "",
    "### Deliberation",
    `Own consensus ${evaluation.deliberation.ownConsensusRate.toFixed(4)}, intercept consensus ${evaluation.deliberation.interceptConsensusRate.toFixed(4)}, timeout ${evaluation.deliberation.timeoutRate.toFixed(4)}, fallback ${evaluation.deliberation.fallbackRate.toFixed(4)}, mean exchanges ${evaluation.deliberation.meanDeliberationExchanges.toFixed(2)}.`,
    "",
    "### Leakage",
    `Mean leakage ${evaluation.leakage.meanLeakageScore.toFixed(2)}, max leakage ${evaluation.leakage.maxLeakageScore.toFixed(2)}, keyword mention ${evaluation.leakage.keywordMentionRate.toFixed(4)}, code pattern ${evaluation.leakage.codePatternRate.toFixed(4)}.`,
    "",
    "### Side Balance",
    `Amber win rate ${evaluation.sideBalance.amberWinRate.toFixed(4)} over ${evaluation.sideBalance.amberMatchCount} matches; blue win rate ${evaluation.sideBalance.blueWinRate.toFixed(4)} over ${evaluation.sideBalance.blueMatchCount} matches; side gap ${evaluation.sideBalance.sideGap.toFixed(4)}.`,
    "",
    "### Complexity",
    `Genome chars ${evaluation.complexity.genomeCharCount}, sentences ${evaluation.complexity.genomeSentenceCount}, compiled prompt total chars ${evaluation.complexity.compiledPromptTotalChars}, delta genome chars ${evaluation.complexity.deltaGenomeChars ?? "n/a"}, delta compiled prompt chars ${evaluation.complexity.deltaCompiledPromptChars ?? "n/a"}.`,
    "",
    "### Evidence Lines",
    ...(evaluation.evidenceLines.length > 0
      ? evaluation.evidenceLines.map((line, index) => `${index + 1}. ${line}`)
      : ["No evidence lines available."]),
    "",
    "### Pending Patch Reviews",
    formatPendingPatchReviews(evaluation.pendingPatchReviews),
    "",
    "### Policy Notices",
    formatPolicyNotices(evaluation),
  ].join("\n");
}

function formatEnvironment(env?: CoachPromptEnvironment): string {
  if (!env) {
    return "No extra environment context.";
  }

  const lines: string[] = [];

  if (env.arenaId) {
    lines.push(`Arena: ${env.arenaId}`);
  }

  if (env.matchmakingBucket) {
    lines.push(`Matchmaking bucket: ${env.matchmakingBucket}`);
  }

  if (env.disclosureText) {
    lines.push("Disclosure:");
    lines.push(env.disclosureText);
  }

  if (env.opponentGenome) {
    lines.push("Opponent genome:");
    lines.push(formatGenomeModules(env.opponentGenome));
  }

  if (env.arenaBriefing) {
    lines.push("Arena Briefing:");
    lines.push(env.arenaBriefing);
  }

  if (env.researcherPolicy) {
    lines.push(`Researcher policy: ${JSON.stringify(env.researcherPolicy)}`);
  }

  return lines.length > 0 ? lines.join("\n") : "No extra environment context.";
}

function formatProposalPatch(patch: CoachPatchBundle | null): string {
  if (!patch) {
    return "No patch bundle proposed.";
  }

  return [
    `Summary: ${patch.summary}`,
    `Expected effect: ${patch.expectedEffect}`,
    `Complexity intent: ${patch.complexityIntent}`,
    "Edits:",
    ...patch.edits.map((edit, index) => [
      `${index + 1}. ${edit.targetModule}`,
      `Old value: ${edit.oldValue}`,
      `New value: ${edit.newValue}`,
      `Rationale: ${edit.rationale}`,
      `Expected effect: ${edit.expectedEffect}`,
    ].join("\n")),
  ].join("\n");
}

function formatAnchorReport(anchorReport?: AnchorABReport): string {
  if (!anchorReport || anchorReport.incomplete || anchorReport.anchorsUsed.length === 0) {
    return "No anchor data available";
  }

  return [
    `Anchors used: ${anchorReport.anchorsUsed.join(", ")}`,
    `Incumbent win rate: ${anchorReport.incumbentWinRate.toFixed(4)}`,
    `Candidate win rate: ${anchorReport.candidateWinRate.toFixed(4)}`,
    `Delta: ${anchorReport.delta.toFixed(4)}`,
    `Incumbent match ids: ${anchorReport.incumbentMatchIds.join(", ") || "none"}`,
    `Candidate match ids: ${anchorReport.candidateMatchIds.join(", ") || "none"}`,
    ...anchorReport.perAnchor.map((entry, index) =>
      `${index + 1}. ${entry.label}: incumbent ${entry.incumbentWins}, candidate ${entry.candidateWins}, total ${entry.total}`,
    ),
  ].join("\n");
}

function normalizeBeliefUpdates(rawBeliefUpdates: unknown): CoachBeliefUpdate[] {
  if (!Array.isArray(rawBeliefUpdates)) {
    return [];
  }

  return rawBeliefUpdates.flatMap<CoachBeliefUpdate>((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const op = asTrimmedText((entry as { op?: unknown }).op);
    const evidence = asTrimmedText((entry as { evidence?: unknown }).evidence);
    const proposition = asTrimmedText((entry as { proposition?: unknown }).proposition);
    const revisionOf = asTrimmedText((entry as { revisionOf?: unknown }).revisionOf) || undefined;
    const confidence = clampConfidence((entry as { confidence?: unknown }).confidence, 0.5);

    if (!evidence) {
      return [];
    }

    if (op === "assert" && proposition) {
      return [{ op: "assert", proposition, confidence, evidence }];
    }

    if (op === "revise" && revisionOf) {
      return [{
        op: "revise",
        proposition: proposition || undefined,
        confidence,
        evidence,
        revisionOf,
      }];
    }

    if (op === "retract" && revisionOf) {
      return [{ op: "retract", evidence, revisionOf }];
    }

    return [];
  });
}

function normalizeEdit(rawEdit: unknown, genome: GenomeModules): CoachModuleEdit | null {
  if (!rawEdit || typeof rawEdit !== "object") {
    return null;
  }

  const targetModule = (rawEdit as { targetModule?: unknown }).targetModule;
  if (!isGenomeModuleKey(targetModule)) {
    return null;
  }

  const newValue = asTrimmedText((rawEdit as { newValue?: unknown }).newValue);
  const rationale = asTrimmedText((rawEdit as { rationale?: unknown }).rationale);
  const expectedEffect = asTrimmedText((rawEdit as { expectedEffect?: unknown }).expectedEffect);

  if (!newValue || !rationale || !expectedEffect) {
    return null;
  }

  return {
    targetModule,
    oldValue: genome[targetModule],
    newValue,
    rationale,
    expectedEffect,
  };
}

function normalizePatchBundle(
  rawPatch: unknown,
  genome: GenomeModules,
  proposalId: string,
  fallbackSummary: string,
  fallbackHypothesis: string,
): CoachPatchBundle | null {
  if (!rawPatch || typeof rawPatch !== "object") {
    return null;
  }

  const rawEdits = Array.isArray((rawPatch as { edits?: unknown }).edits)
    ? (rawPatch as { edits: unknown[] }).edits
    : [];

  const uniqueEdits = new Map<GenomeModuleKey, CoachModuleEdit>();

  for (const rawEdit of rawEdits) {
    const edit = normalizeEdit(rawEdit, genome);
    if (!edit || uniqueEdits.has(edit.targetModule)) {
      continue;
    }
    uniqueEdits.set(edit.targetModule, edit);
    if (uniqueEdits.size >= 3) {
      break;
    }
  }

  if (uniqueEdits.size === 0) {
    return null;
  }

  const complexityIntentRaw = asTrimmedText((rawPatch as { complexityIntent?: unknown }).complexityIntent);
  const complexityIntent = complexityIntentRaw === "increase"
    || complexityIntentRaw === "decrease"
    || complexityIntentRaw === "neutral"
    ? complexityIntentRaw
    : "neutral";

  return {
    proposalId,
    summary: asTrimmedText((rawPatch as { summary?: unknown }).summary) || fallbackSummary,
    expectedEffect: asTrimmedText((rawPatch as { expectedEffect?: unknown }).expectedEffect) || fallbackHypothesis,
    edits: Array.from(uniqueEdits.values()),
    complexityIntent,
  };
}

function fallbackProposal(): CoachProposal {
  const proposalId = randomUUID();

  return {
    proposalId,
    beliefUpdates: [],
    summary: "No valid patch proposal returned.",
    hypothesis: "Keep the current genome unchanged.",
    patch: null,
  };
}

function normalizeProposal(raw: Record<string, unknown> | null, genome: GenomeModules): CoachProposal {
  if (!raw) {
    return fallbackProposal();
  }

  const proposalId = asTrimmedText(raw.proposalId) || randomUUID();
  const summary = asTrimmedText(raw.summary) || "No patch proposed.";
  const hypothesis = asTrimmedText(raw.hypothesis) || "No new hypothesis provided.";
  const patch = normalizePatchBundle(raw.patch, genome, proposalId, summary, hypothesis);

  return {
    proposalId,
    beliefUpdates: normalizeBeliefUpdates(raw.beliefUpdates),
    summary,
    hypothesis,
    patch,
  };
}

function fallbackReview(reason = "No valid review returned."): CoachReviewResult {
  return {
    decision: "revert",
    rationale: reason,
    confidence: 0,
  };
}

function normalizeReview(raw: Record<string, unknown> | null): CoachReviewResult {
  if (!raw) {
    return fallbackReview();
  }

  const decisionRaw = asTrimmedText(raw.decision).toLowerCase();
  const decision = decisionRaw === "commit" || decisionRaw === "revert"
    ? decisionRaw
    : "revert";
  const rationale = asTrimmedText(raw.rationale) || "No rationale provided.";
  const policyResponse = asTrimmedText(raw.policyResponse) || undefined;

  return {
    decision,
    rationale,
    confidence: clampConfidence(raw.confidence, 0),
    policyResponse,
  };
}

function buildProposalSystemPrompt(
  state: CoachState,
  sprintResult: SprintResult,
  evaluation: SprintEvaluation,
  env?: CoachPromptEnvironment,
): string {
  return [
    "You are the role-specific genome coach for an AI Decrypto team.",
    "Players stay freeform. Every module must remain freeform narrative prose.",
    "Do not introduce structured reasoning protocols, numbered procedures, hard-coded scoring formulas, or mechanical overrides.",
    "Simplifying or shortening a module is valid and often valuable. You may change 1-3 modules.",
    "",
    "## Current Genome",
    formatGenomeModules(state.genome),
    "",
    "## Active Beliefs",
    formatBeliefs(state),
    "",
    "## Recent Patch History",
    formatPatchHistory(state),
    "",
    "## Latest Sprint Result",
    formatSprintResult(sprintResult),
    "",
    "## Sprint Evaluation Evidence",
    formatEvaluation(evaluation),
    "",
    "## Environment",
    formatEnvironment(env),
    "",
    "## Task",
    "Return a CoachProposal as valid JSON with double quotes and no markdown fences.",
    "Patch may be null if the best move is to keep the genome unchanged.",
    "If patch is present, it must be a CoachPatchBundle with 1-3 module edits.",
    "Each edit must rewrite the full target module as narrative prose, not append a rule fragment.",
    "Ground your proposal in the evaluation evidence, especially training, execution, deliberation, leakage, side balance, complexity, and any pending patch reviews.",
    "",
    "Example of a valid simplifying patch bundle. This example intentionally edits executionGuidance and opponentModeling, not cluePhilosophy:",
    "{",
    '  "proposalId": "proposal-example",',
    '  "beliefUpdates": [],',
    '  "summary": "Tighten execution and trim over-modeling",',
    '  "hypothesis": "Shorter operational guidance should improve teammate decode reliability without making our clues easier to intercept.",',
    '  "patch": {',
    '    "proposalId": "proposal-example",',
    '    "summary": "Shorten execution guidance and reduce second-order mind games",',
    '    "expectedEffect": "Raise own decode rate while keeping leakage and interception pressure stable.",',
    '    "complexityIntent": "decrease",',
    '    "edits": [',
    '      {',
    '        "targetModule": "executionGuidance",',
    '        "newValue": "Prefer the clearest clue that preserves one distinctive association. Avoid ornamental cleverness once teammates already have enough signal to decode reliably.",',
    '        "rationale": "Recent losses were driven more by our own decode instability than by opponent reads.",',
    '        "expectedEffect": "Cleaner teammate decoding with less self-inflicted confusion."',
    "      },",
    '      {',
    '        "targetModule": "opponentModeling",',
    '        "newValue": "Model opponents enough to avoid obvious repetitions, but do not spend rounds on second-order mind games unless the board state clearly rewards it.",',
    '        "rationale": "The current module may be inducing unnecessary complexity and hesitation.",',
    '        "expectedEffect": "Lower cognitive overhead without making us predictable."',
    "      }",
    "    ]",
    "  }",
    "}",
  ].join("\n");
}

function buildReviewSystemPrompt(
  state: CoachState,
  proposal: CoachProposal,
  evaluation: SprintEvaluation,
  anchorReport: AnchorABReport | undefined,
  patchReviews: PatchReviewSummary[],
  env?: CoachPromptEnvironment,
): string {
  return [
    "You are the final coach reviewer for the genome system.",
    "Coach makes the final call. There are no mechanical overrides.",
    "Treat anchor data, policy notices, and pending reviews as evidence, not as hard gates.",
    "Players stay freeform. If you commit, the patch bundle will be applied as freeform narrative module rewrites.",
    "",
    "## Current Genome",
    formatGenomeModules(state.genome),
    "",
    "## Proposal Summary",
    `Proposal ID: ${proposal.proposalId}`,
    `Summary: ${proposal.summary}`,
    `Hypothesis: ${proposal.hypothesis}`,
    "",
    "## Proposed Patch Bundle",
    formatProposalPatch(proposal.patch),
    "",
    "## Anchor A/B Results",
    formatAnchorReport(anchorReport),
    "",
    "## Policy Notices",
    formatPolicyNotices(evaluation),
    "",
    "## Pending Patch Reviews",
    formatPendingPatchReviews(patchReviews),
    "",
    "## Latest Sprint Evidence",
    formatEvaluation(evaluation),
    "",
    "## Environment",
    formatEnvironment(env),
    "",
    "## Task",
    "Return valid JSON with double quotes and no markdown fences.",
    "Respond with a CoachReviewResult:",
    "{",
    '  "decision": "commit" | "revert",',
    '  "rationale": "Short explanation grounded in the evidence.",',
    '  "confidence": 0.0,',
    '  "policyResponse": "Optional note about how policy notices affected the decision."',
    "}",
  ].join("\n");
}

export async function coachProposePatch(
  state: CoachState,
  sprintResult: SprintResult,
  evaluation: SprintEvaluation,
  config: CoachConfig,
  env?: CoachPromptEnvironment,
): Promise<CoachProposal> {
  const aiConfig = buildCoachAIConfig(config);
  const systemPrompt = buildProposalSystemPrompt(state, sprintResult, evaluation, env);
  const userPrompt = "Return only valid JSON for a CoachProposal.";

  try {
    const rawResponse = await callAI(aiConfig, systemPrompt, userPrompt, { maxTokens: 4000 });
    return normalizeProposal(parseJsonObject(rawResponse.text), state.genome);
  } catch (error) {
    console.warn(`[coach-prompts] proposal call failed: ${error instanceof Error ? error.message : String(error)}`);
    return fallbackProposal();
  }
}

export async function coachCommitReview(
  state: CoachState,
  proposal: CoachProposal,
  evaluation: SprintEvaluation,
  anchorReport: AnchorABReport | undefined,
  patchReviews: PatchReviewSummary[],
  config: CoachConfig,
  env?: CoachPromptEnvironment,
): Promise<CoachReviewResult> {
  const aiConfig = buildCoachAIConfig(config);
  const systemPrompt = buildReviewSystemPrompt(state, proposal, evaluation, anchorReport, patchReviews, env);
  const userPrompt = "Return only valid JSON for a CoachReviewResult.";

  try {
    const rawResponse = await callAI(aiConfig, systemPrompt, userPrompt, { maxTokens: 2000 });
    return normalizeReview(parseJsonObject(rawResponse.text));
  } catch (error) {
    console.warn(`[coach-prompts] review call failed: ${error instanceof Error ? error.message : String(error)}`);
    return fallbackReview(error instanceof Error ? error.message : String(error));
  }
}
