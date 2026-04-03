import { randomUUID } from "crypto";
import type {
  AIPlayerConfig,
  AIProvider,
  CoachDeltaOp,
  CoachEvidenceRef,
  CoachPatchBundle,
  CoachResearchMetrics,
  CoachRun as PersistedCoachRun,
  CoachSemanticDelta,
  CoachSprint as PersistedCoachSprint,
  GenomeModules,
  HeadlessMatchConfig,
  HeadlessPromptOverrides,
  MatchRound,
  PatchMeasuredOutcome,
  ScratchNotesSnapshot,
  SearchPolicy,
} from "@shared/schema";
import { DEFAULT_SEARCH_POLICY, getDefaultConfig } from "@shared/schema";
import { callAI, estimateCost } from "./ai";
import { runBoundedSettledPool } from "./boundedPool";
import { compileGenomePrompts } from "./genomeCompiler";
import { runHeadlessMatch } from "./headlessRunner";
import { log } from "./index";
import { storage } from "./storage";

type Team = "amber" | "blue";
export type CoachDecision = "commit" | "revert";
type CoachRunStatus = "pending" | "running" | "completed" | "failed" | "stopped" | "budget_exceeded";

const COACH_SOURCE = "coach";
const COACH_ACTION_TYPE = "coach_autopsy";
const DEFAULT_EXECUTION_GUIDANCE = "Focus on clear, unambiguous clues that your teammates can decode reliably. When uncertain, prefer simpler associations over clever ones.";
const DEFAULT_DELIBERATION_SCAFFOLD = "Discuss openly with your teammates. Share your reasoning, consider alternatives, and reach consensus before committing to an answer.";
const DEFAULT_GENOME_EXTENSION_FIELDS: Pick<GenomeModules, "executionGuidance" | "deliberationScaffold"> = {
  executionGuidance: DEFAULT_EXECUTION_GUIDANCE,
  deliberationScaffold: DEFAULT_DELIBERATION_SCAFFOLD,
};
const GENOME_MODULE_KEYS: Array<keyof GenomeModules> = [
  "cluePhilosophy",
  "opponentModeling",
  "riskTolerance",
  "memoryPolicy",
  "executionGuidance",
  "deliberationScaffold",
];

export const SEED_GENOME_TEMPLATES: GenomeModules[] = [
  {
    cluePhilosophy: "Use abstract, metaphorical associations. Prefer poetic and lateral thinking over direct synonyms. Aim for clues that feel thematic rather than dictionary-like.",
    opponentModeling: "Assume opponents are tracking patterns. Vary your clue style each round to prevent pattern recognition. Occasionally sacrifice clarity for unpredictability.",
    riskTolerance: "Moderate risk. Prefer clues your team will likely understand even if they're not perfectly obscure. Avoid overly clever clues that might confuse teammates.",
    memoryPolicy: "Track which clue styles have been intercepted in past rounds. Avoid repeating approaches that led to interceptions. Build on successful patterns from earlier rounds.",
    ...DEFAULT_GENOME_EXTENSION_FIELDS,
  },
  {
    cluePhilosophy: "Use concrete, sensory-based associations. Think about what the keyword looks like, sounds like, or feels like. Ground clues in physical experience.",
    opponentModeling: "Aggressive interception focus. Study opponent clue patterns closely and try to decode their keyword mapping. Prioritize breaking their code over protecting your own.",
    riskTolerance: "High risk tolerance. Willing to use obscure clues that only deep teammates would catch. Accept some miscommunication for better security against interception.",
    memoryPolicy: "Maintain a mental map of opponent keyword-clue associations. Each round, refine your model of what their keywords might be based on accumulated evidence.",
    ...DEFAULT_GENOME_EXTENSION_FIELDS,
  },
  {
    cluePhilosophy: "Use functional and relational associations. Think about what the keyword does, what category it belongs to, or what it relates to in everyday use.",
    opponentModeling: "Defensive posture. Focus primarily on making your own clues clear to teammates rather than trying to intercept. Only attempt interception when very confident.",
    riskTolerance: "Low risk. Prioritize team communication clarity above all else. Use straightforward associations that minimize miscommunication risk.",
    memoryPolicy: "Focus on consistency. Establish clue patterns early and maintain them so teammates can predict your style. Consistency builds team trust and accuracy.",
    ...DEFAULT_GENOME_EXTENSION_FIELDS,
  },
  {
    cluePhilosophy: "Use cultural and contextual references. Draw from shared cultural knowledge—movies, books, common expressions. Assume your teammates share similar cultural context.",
    opponentModeling: "Balanced approach. Split attention equally between making good clues and attempting interceptions. Adapt based on the score—more aggressive when behind, more defensive when ahead.",
    riskTolerance: "Adaptive risk. Take bigger risks early in the game to establish advantages, then become more conservative as token counts accumulate.",
    memoryPolicy: "Learn from mistakes. If a clue was too obvious (intercepted), shift to more obscure associations next round. If too obscure (miscommunicated), shift to clearer ones.",
    ...DEFAULT_GENOME_EXTENSION_FIELDS,
  },
  {
    cluePhilosophy: "Use oppositional and negative space associations. Think about what the keyword is NOT, or what contrasts with it. Clue by exclusion and contrast rather than similarity.",
    opponentModeling: "Theory of mind focused. Try to think about what opponents think you're thinking. Use second and third-order reasoning to stay ahead of their interception attempts.",
    riskTolerance: "Variable risk based on game state. Very conservative when close to losing (2 white tokens), very aggressive when opponent is close to losing.",
    memoryPolicy: "Build a comprehensive game model. Track all clues, codes, and outcomes for both teams. Use this complete history to make increasingly informed decisions.",
    ...DEFAULT_GENOME_EXTENSION_FIELDS,
  },
  {
    cluePhilosophy: "Use phonetic and linguistic associations. Think about how words sound, rhyme, or share etymological roots. Wordplay and language structure over meaning.",
    opponentModeling: "Minimal opponent modeling. Focus entirely on your own team's communication efficiency. Assume opponents will sometimes intercept and plan around it.",
    riskTolerance: "Extremely high risk. Use creative, unusual associations that require lateral thinking. Accept higher miscommunication rates for near-zero interception vulnerability.",
    memoryPolicy: "Short memory. Treat each round relatively fresh. Don't over-anchor on past patterns—stay flexible and responsive to the current situation.",
    ...DEFAULT_GENOME_EXTENSION_FIELDS,
  },
  {
    cluePhilosophy: "Use hierarchical category associations. Place the keyword in taxonomic categories (genus, species, family). Think like a classifier or encyclopedia.",
    opponentModeling: "Pattern-breaking focus. Actively change your clue strategy every 2-3 rounds to keep opponents off-balance. Use unpredictability as a weapon.",
    riskTolerance: "Medium-low risk. Slightly favor clarity over security but maintain enough variety to avoid being fully predictable.",
    memoryPolicy: "Selective memory. Remember only the most important events—interceptions and miscommunications. Ignore neutral rounds to avoid information overload.",
    ...DEFAULT_GENOME_EXTENSION_FIELDS,
  },
  {
    cluePhilosophy: "Use emotional and psychological associations. Connect keywords to feelings, moods, or psychological states they evoke. Tap into shared emotional understanding.",
    opponentModeling: "Exploit-focused. Look for weaknesses in opponent patterns. If they consistently struggle with certain types of clues, exploit those patterns aggressively.",
    riskTolerance: "Calculated risk. Assign rough probabilities to whether teammates and opponents will decode each clue. Choose the option with the best expected value.",
    memoryPolicy: "Strategic note-taking. Keep running notes on what works and what doesn't. Refine strategy between rounds based on accumulated intelligence.",
    ...DEFAULT_GENOME_EXTENSION_FIELDS,
  },
];

const DEFAULT_OPPONENT_GENOME = { ...SEED_GENOME_TEMPLATES[1] };

export type CoachBeliefStatus = "active" | "superseded" | "retracted";

export interface CoachBelief {
  id: string;
  proposition: string;
  confidence: number;
  evidence: string;
  sprintFormed: number;
  revisionOf?: string;
  status: CoachBeliefStatus;
}

export type CoachBeliefUpdateOp = "assert" | "revise" | "retract";

export interface CoachBeliefUpdate {
  op: CoachBeliefUpdateOp;
  proposition?: string;
  confidence?: number;
  evidence: string;
  revisionOf?: string;
}

export interface CoachPatch {
  targetModule: keyof GenomeModules;
  oldValue: string;
  newValue: string;
  rationale: string;
  expectedEffect: string;
}

export interface CoachStructuredPatch extends CoachPatch {
  delta?: CoachSemanticDelta;
}

export interface SprintResult {
  sprintNumber: number;
  matchResults: Array<{
    matchId: number;
    winner: "amber" | "blue" | null;
    ourTeam: "amber" | "blue";
    ourWhiteTokens: number;
    ourBlackTokens: number;
    oppWhiteTokens: number;
    oppBlackTokens: number;
    totalRounds: number;
    roundSummaries: string[];
  }>;
  winRate: number;
  record: string;
  finalScratchNotesByTeam?: Partial<Record<Team, ScratchNotesSnapshot>>;
}

export interface CoachState {
  teamId: string;
  genome: GenomeModules;
  beliefs: CoachBelief[];
  patchHistory: Array<CoachStructuredPatch & { sprintApplied: number; decision: "commit" | "revert"; postCommitWinRate?: number }>;
  sprintHistory: SprintResult[];
  currentSprint: number;
}

export interface CoachConfig {
  coachProvider: AIProvider;
  coachModel: string;
  playerProvider: AIProvider;
  playerModel: string;
  matchesPerSprint: number;
  sprintConcurrency: number;
  totalSprints: number;
  opponentGenome?: GenomeModules;
  teamSize: 2 | 3;
  budgetCapUsd?: number;
}

export interface CoachSprintEnvironment {
  opponentRunId?: string;
  opponentGenome: GenomeModules;
  disclosureText?: string;
  matchmakingBucket?: string;
  seedTag?: string;
  teamSequence?: Team[];
  matchConfigOverrides?: Array<Partial<HeadlessMatchConfig>>;
  teamScratchNotes?: Partial<Record<Team, string>>;
  enablePostMatchReflection?: boolean;
  reflectionTokenBudget?: number;
}

export interface CoachRunRecord {
  id: string;
  config: CoachConfig;
  searchPolicy: SearchPolicy;
  status: CoachRunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  arenaId?: string;
  budgetCapUsd?: string;
  actualCostUsd?: string;
  initialGenome: GenomeModules;
  currentGenome: GenomeModules;
  currentBeliefs: CoachBelief[];
  currentSprint: number;
  currentScratchNotes?: ScratchNotesSnapshot | null;
  sprints: CoachSprintRecord[];
  isActive: boolean;
}

interface CoachLoopOutcome {
  state: CoachState;
  budgetExceeded: boolean;
}

interface RawCoachBeliefUpdate {
  op?: unknown;
  proposition?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  revisionOf?: unknown;
}

interface RawCoachPatch {
  targetModule?: unknown;
  newValue?: unknown;
  rationale?: unknown;
  expectedEffect?: unknown;
  delta?: unknown;
}

interface RawCoachEvidenceRef {
  sprintNumber?: unknown;
  matchId?: unknown;
  observation?: unknown;
}

interface RawCoachSemanticDelta {
  op?: unknown;
  module?: unknown;
  oldText?: unknown;
  newText?: unknown;
  rationale?: unknown;
  evidenceChain?: unknown;
  rollbackTriggers?: unknown;
}

interface RawCoachResponse {
  beliefUpdates?: unknown;
  decision?: unknown;
  patch?: unknown;
}

const activeCoachRuns = new Map<string, boolean>();

export interface CoachSprintRecord {
  id: number;
  runId: string;
  sprintNumber: number;
  opponentRunId?: string;
  matchIds: number[];
  record: string;
  winRate: number;
  genomeBefore: GenomeModules;
  genomeAfter: GenomeModules;
  beliefsAfter: CoachBelief[];
  decision: CoachDecision;
  patch: CoachStructuredPatch | null;
  disclosureText?: string;
  researchMetrics: CoachResearchMetrics;
  scratchNotesSnapshot?: ScratchNotesSnapshot | null;
  createdAt: string;
}

type PersistedPatchDecision = {
  decision: CoachDecision;
  patch: CoachStructuredPatch | null;
  patchBundle?: CoachPatchBundle | null;
  proposalId?: string | null;
  reviewDueSprint?: number | null;
};

function isAIProvider(value: unknown): value is AIProvider {
  return value === "chatgpt" || value === "claude" || value === "gemini" || value === "openrouter";
}

function asPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function coerceBudgetCap(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function coerceGenomeModules(value: unknown): GenomeModules | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<Record<keyof GenomeModules, unknown>>;
  const modules = GENOME_MODULE_KEYS.reduce<Partial<GenomeModules>>((acc, key) => {
    const normalized = typeof candidate[key] === "string" ? candidate[key].trim() : "";
    if (normalized.length > 0) {
      acc[key] = normalized;
      return acc;
    }

    if (key === "executionGuidance") {
      acc[key] = DEFAULT_EXECUTION_GUIDANCE;
      return acc;
    }

    if (key === "deliberationScaffold") {
      acc[key] = DEFAULT_DELIBERATION_SCAFFOLD;
      return acc;
    }

    acc[key] = "";
    return acc;
  }, {});

  return GENOME_MODULE_KEYS.every((key) => typeof modules[key] === "string" && modules[key]!.trim().length > 0)
    ? modules as GenomeModules
    : undefined;
}

export function cloneGenome(genome: GenomeModules): GenomeModules {
  return { ...genome };
}

export function buildGenomeSystemPrompt(modules: GenomeModules): string {
  return `You are a highly competitive Decrypto player with the following strategic profile:

CLUE PHILOSOPHY: ${modules.cluePhilosophy}

OPPONENT MODELING: ${modules.opponentModeling}

RISK TOLERANCE: ${modules.riskTolerance}

MEMORY POLICY: ${modules.memoryPolicy}

EXECUTION GUIDANCE: ${modules.executionGuidance}

DELIBERATION SCAFFOLD: ${modules.deliberationScaffold}

Apply these strategic principles when generating clues, making guesses, attempting interceptions, and coordinating with teammates. Your goal is to win the game by getting your team 2 interception tokens or forcing the opponent into 2 miscommunication tokens.`;
}

function buildAIConfig(provider: AIProvider, model: string): AIPlayerConfig {
  return {
    ...getDefaultConfig(provider),
    provider,
    model,
  };
}

export function createCoachState(seedGenome: GenomeModules, teamId = `coach-${randomUUID().slice(0, 8)}`): CoachState {
  return {
    teamId,
    genome: cloneGenome(seedGenome),
    beliefs: [],
    patchHistory: [],
    sprintHistory: [],
    currentSprint: 0,
  };
}

function createInitialCoachState(config: CoachConfig, teamId = `coach-${randomUUID().slice(0, 8)}`): CoachState {
  const seedGenome = cloneGenome(SEED_GENOME_TEMPLATES[0]);
  const opponentGenome = config.opponentGenome ? cloneGenome(config.opponentGenome) : cloneGenome(DEFAULT_OPPONENT_GENOME);
  const distinctSeed = GENOME_MODULE_KEYS.some((key) => seedGenome[key] !== opponentGenome[key])
    ? seedGenome
    : cloneGenome(SEED_GENOME_TEMPLATES[2] || SEED_GENOME_TEMPLATES[0]);

  return createCoachState(distinctSeed, teamId);
}

function isGenomeModuleKey(value: unknown): value is keyof GenomeModules {
  return typeof value === "string" && GENOME_MODULE_KEYS.includes(value as keyof GenomeModules);
}

function isCoachBeliefUpdateOp(value: unknown): value is CoachBeliefUpdateOp {
  return value === "assert" || value === "revise" || value === "retract";
}

function isCoachDeltaOp(value: unknown): value is CoachDeltaOp {
  return value === "add_rule" || value === "modify_rule" || value === "retire_rule";
}

function asTeam(value: unknown): Team | null {
  return value === "amber" || value === "blue" ? value : null;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function asTrimmedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asPositiveIntegerOrUndefined(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function normalizeCode(code: unknown): string {
  if (!Array.isArray(code)) return "?";
  const digits = code
    .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
    .slice(0, 3);
  return digits.length === 3 ? digits.join("-") : "?";
}

function normalizeClues(clues: unknown): string[] {
  if (!Array.isArray(clues)) return [];
  return clues
    .map((clue) => typeof clue === "string" ? clue.trim() : "")
    .filter((clue) => clue.length > 0);
}

function buildRoundSummaryForTeam(round: MatchRound, team: Team): string {
  const opposingTeam = team === "amber" ? "blue" : "amber";
  const clues = normalizeClues(round.clues);
  const clueText = clues.length > 0 ? `[${clues.join(", ")}]` : "[unknown clues]";
  const codeText = normalizeCode(round.code);
  const ownDecodeText = round.ownCorrect ? "decoded correctly" : "misdecoded";
  const interceptText = round.intercepted ? `${capitalize(opposingTeam)} intercepted.` : `${capitalize(opposingTeam)} failed intercept.`;

  return `${capitalize(team)} gave clues ${clueText} for code ${codeText}. ${capitalize(team)} ${ownDecodeText}. ${interceptText}`;
}

function buildRoundGroups(rounds: MatchRound[]): Map<number, Partial<Record<Team, MatchRound>>> {
  const grouped = new Map<number, Partial<Record<Team, MatchRound>>>();

  for (const round of rounds) {
    const team = asTeam(round.team);
    if (!team) continue;

    const existing = grouped.get(round.roundNumber) || {};
    existing[team] = round;
    grouped.set(round.roundNumber, existing);
  }

  return grouped;
}

function buildHeadlessPlayers(config: CoachConfig, sprintNumber: number, matchIndex: number): HeadlessMatchConfig["players"] {
  const baseAIConfig = buildAIConfig(config.playerProvider, config.playerModel);
  const players: HeadlessMatchConfig["players"] = [];

  for (const team of ["amber", "blue"] as const) {
    for (let seat = 1; seat <= config.teamSize; seat++) {
      players.push({
        name: `${team}-s${sprintNumber}-m${matchIndex + 1}-p${seat}`,
        aiProvider: config.playerProvider,
        team,
        aiConfig: { ...baseAIConfig },
      });
    }
  }

  return players;
}

export function applyCoachPatch(genome: GenomeModules, patch: CoachPatch): GenomeModules {
  return {
    ...genome,
    [patch.targetModule]: patch.newValue,
  };
}

export function applyCoachPatchBundle(genome: GenomeModules, patch: CoachPatchBundle): GenomeModules {
  const updatedGenome = cloneGenome(genome);

  for (const edit of patch.edits) {
    updatedGenome[edit.targetModule] = edit.newValue;
  }

  return updatedGenome;
}

export function hydrateMeasuredPatchOutcome(
  patchHistory: CoachState["patchHistory"],
  sprintResult: SprintResult,
): CoachState["patchHistory"] {
  const hydrated = patchHistory.map((patch) => ({ ...patch }));

  for (let index = hydrated.length - 1; index >= 0; index--) {
    const patch = hydrated[index];
    if (patch.decision === "commit" && patch.postCommitWinRate === undefined) {
      hydrated[index] = {
        ...patch,
        postCommitWinRate: sprintResult.winRate,
      };
      break;
    }
  }

  return hydrated;
}

function getActiveBeliefs(beliefs: CoachBelief[]): CoachBelief[] {
  return beliefs.filter((belief) => belief.status === "active");
}

function formatGenomeModules(modules: GenomeModules): string {
  return GENOME_MODULE_KEYS
    .map((key) => `- ${key}: ${modules[key]}`)
    .join("\n");
}

function formatBeliefMemory(beliefs: CoachBelief[]): string {
  if (beliefs.length === 0) {
    return "No active beliefs yet — this is your first sprint.";
  }

  return beliefs
    .map((belief, index) => {
      const revision = belief.revisionOf ? ` Revises belief ${belief.revisionOf}.` : "";
      return `${index + 1}. [${belief.id}] ${belief.proposition} Confidence: ${belief.confidence.toFixed(2)}. Evidence: ${belief.evidence}. Formed in sprint ${belief.sprintFormed}. Status: ${belief.status}.${revision}`;
    })
    .join("\n");
}

function formatPatchHistory(patchHistory: CoachState["patchHistory"]): string {
  if (patchHistory.length === 0) {
    return "No patches yet.";
  }

  return patchHistory
    .map((patch, index) => {
      const measuredOutcome = patch.postCommitWinRate === undefined
        ? "Outcome pending."
        : `Observed next-sprint win rate: ${patch.postCommitWinRate.toFixed(2)}.`;
      return `${index + 1}. Sprint ${patch.sprintApplied} ${patch.decision.toUpperCase()} ${patch.targetModule}. Old: ${patch.oldValue} New: ${patch.newValue} Rationale: ${patch.rationale} Expected effect: ${patch.expectedEffect} ${measuredOutcome}`;
    })
    .join("\n");
}

function describeMatchOutcome(match: SprintResult["matchResults"][number]): string {
  if (match.winner === null) return "DRAW";
  return match.winner === match.ourTeam ? "WIN" : "LOSS";
}

function formatSprintForCoach(sprintResult: SprintResult): string {
  const header = [`Record: ${sprintResult.record}`, `Win rate: ${sprintResult.winRate.toFixed(2)}`];

  if (sprintResult.matchResults.length === 0) {
    header.push("No completed matches. Every scheduled match failed.");
    return header.join("\n");
  }

  const matchBlocks = sprintResult.matchResults.map((match, index) => {
    const roundText = match.roundSummaries.length > 0
      ? match.roundSummaries.map((summary) => `- ${summary}`).join("\n")
      : "- No round summaries available.";

    return [
      `Match ${index + 1} (id ${match.matchId})`,
      `Outcome: ${describeMatchOutcome(match)}`,
      `Winner: ${match.winner ?? "none"}`,
      `Our team: ${match.ourTeam}`,
      `Total rounds: ${match.totalRounds}`,
      "Round summaries:",
      roundText,
    ].join("\n");
  });

  return `${header.join("\n")}\n\n${matchBlocks.join("\n\n")}`;
}

function buildCoachPrompt(
  state: CoachState,
  sprintResult: SprintResult,
  env?: Pick<CoachSprintEnvironment, "disclosureText">,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are the head coach for an AI Decrypto team in a competitive research arena.

How Decrypto works: Each team has 4 secret keywords in fixed positions (1-4). Each round, a clue-giver gets a 3-digit code (e.g. 2-4-1) and gives 3 clues — one per digit — that help teammates decode the code back into positions. The opposing team hears the same clues and tries to intercept (guess the code). The tension: clues must be clear enough for teammates but opaque enough that opponents can't intercept. Over rounds, opponents accumulate evidence about your keyword mappings.

Win conditions: 2 interception tokens (successful intercepts) or forcing opponent into 2 white tokens (miscommunication — team fails to decode own clues).

You are the intelligence. The code just executes your decisions. Patch value is measured after the fact, not pre-screened. You have complete freedom in what you propose.

When you propose a patch, keep the module text itself as full freeform narrative prose. Also include a structured semantic delta as metadata about the change. The structured delta must describe the semantic rule change, not replace the freeform module narrative.`;

  const userPrompt = [
    "## Your Team's Current Strategy",
    formatGenomeModules(state.genome),
    "",
    "## Your Current Active Beliefs",
    formatBeliefMemory(getActiveBeliefs(state.beliefs)),
    "",
    `## Sprint ${sprintResult.sprintNumber} Results`,
    formatSprintForCoach(sprintResult),
    "",
    "## Patch History",
    formatPatchHistory(state.patchHistory),
    "",
    ...(env?.disclosureText
      ? [
          env.disclosureText,
          "",
        ]
      : []),
    "## Your Task",
    "1. BELIEF UPDATES: Return an array of belief update operations.",
    "   - Use \"assert\" to add a new belief.",
    "   - Use \"revise\" to replace an active belief by ID. Include \"revisionOf\" and evidence. Include \"proposition\" if the wording changes; omit it to keep the old proposition.",
    "   - Use \"retract\" to retract an active belief by ID. Include \"revisionOf\" and evidence.",
    "   - Only reference belief IDs from the active belief list above.",
    "   - Do not return the full belief list or restate unchanged beliefs.",
    "   - Return an empty array if no belief changes are needed this sprint.",
    "   - Keep evidence specific and grounded in this sprint's round summaries.",
    "2. DECISION: Either propose ONE strategic patch or revert (keep current strategy unchanged).",
    "   - If proposing a patch: specify which module to change, the new freeform narrative value, your rationale, what you expect to happen, and a structured delta in patch.delta.",
    "   - patch.delta must include: op, module, rationale, evidenceChain, rollbackTriggers, plus oldText/newText when appropriate.",
    "   - Use evidenceChain entries grounded in this sprint. Each entry needs sprintNumber, optional matchId, and observation.",
    "   - Keep patch.delta.module aligned with patch.targetModule.",
    "   - If reverting: explain why the current strategy should be kept.",
    "",
    "Respond in valid JSON with double quotes and no markdown fences. Use one of these two shapes exactly:",
    "{",
    '  "beliefUpdates": [',
    '    { "op": "assert", "proposition": "...", "confidence": 0.8, "evidence": "..." },',
    '    { "op": "revise", "revisionOf": "belief-uuid", "proposition": "...", "confidence": 0.7, "evidence": "..." },',
    '    { "op": "retract", "revisionOf": "belief-uuid", "evidence": "..." }',
    "  ],",
    '  "decision": "commit",',
    '  "patch": {',
    '    "targetModule": "cluePhilosophy",',
    '    "newValue": "Full freeform narrative text for the entire module after the change.",',
    '    "rationale": "...",',
    '    "expectedEffect": "...",',
    '    "delta": {',
    '      "op": "modify_rule",',
    '      "module": "cluePhilosophy",',
    '      "oldText": "...",',
    '      "newText": "...",',
    '      "rationale": "...",',
    '      "evidenceChain": [',
    '        { "sprintNumber": 3, "matchId": 42, "observation": "..." }',
    "      ],",
    '      "rollbackTriggers": ["..."]',
    "    }",
    "  }",
    "}",
    "or",
    "{",
    '  "beliefUpdates": [],',
    '  "decision": "revert",',
    '  "patch": null',
    "}",
  ].join("\n");

  return { systemPrompt, userPrompt };
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
  if (start === -1 || end === -1 || end <= start) return null;
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

function parseCoachResponseJson(rawResponse: string): RawCoachResponse | null {
  const candidates = [
    rawResponse.trim(),
    stripMarkdownFences(rawResponse),
    extractJsonObject(stripMarkdownFences(rawResponse)) || "",
  ].filter((candidate) => candidate.length > 0);

  for (const candidate of candidates) {
    for (const attempt of [candidate, normalizePseudoJson(candidate)]) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && typeof parsed === "object") {
          return parsed as RawCoachResponse;
        }
      } catch {
        // Ignore and try the next attempt.
      }
    }
  }

  return null;
}

function normalizeBeliefUpdates(rawBeliefUpdates: unknown): CoachBeliefUpdate[] | null {
  if (!Array.isArray(rawBeliefUpdates)) return null;

  return rawBeliefUpdates.flatMap<CoachBeliefUpdate>((entry) => {
    if (!entry || typeof entry !== "object") return [];

    const update = entry as RawCoachBeliefUpdate;
    if (!isCoachBeliefUpdateOp(update.op)) return [];

    const evidence = typeof update.evidence === "string" ? update.evidence.trim() : "";
    const proposition = typeof update.proposition === "string" ? update.proposition.trim() : "";
    const revisionOf = typeof update.revisionOf === "string" && update.revisionOf.trim()
      ? update.revisionOf.trim()
      : undefined;
    const confidence = typeof update.confidence === "number" && Number.isFinite(update.confidence)
      ? clampConfidence(update.confidence)
      : undefined;

    if (!evidence) return [];

    if (update.op === "assert") {
      if (!proposition) return [];
      return [{
        op: "assert",
        proposition,
        confidence,
        evidence,
      }];
    }

    if (update.op === "revise") {
      if (!revisionOf) return [];
      return [{
        op: "revise",
        proposition: proposition || undefined,
        confidence,
        evidence,
        revisionOf,
      }];
    }

    if (!revisionOf) return [];
    return [{
      op: "retract",
      evidence,
      revisionOf,
    }];
  });
}

export function mergeBeliefUpdates(
  previousBeliefs: CoachBelief[],
  updates: CoachBeliefUpdate[],
  sprintNumber: number,
): CoachBelief[] {
  const mergedBeliefs = previousBeliefs.map((belief) => ({ ...belief }));
  const beliefIndex = new Map<string, number>(
    mergedBeliefs.map((belief, index) => [belief.id, index]),
  );

  for (const update of updates) {
    if (update.op === "assert") {
      if (!update.proposition) continue;

      const newBelief: CoachBelief = {
        id: randomUUID(),
        proposition: update.proposition,
        confidence: update.confidence ?? 0.5,
        evidence: update.evidence,
        sprintFormed: sprintNumber,
        status: "active",
      };
      beliefIndex.set(newBelief.id, mergedBeliefs.push(newBelief) - 1);
      continue;
    }

    if (!update.revisionOf) continue;

    const targetIndex = beliefIndex.get(update.revisionOf);
    if (targetIndex === undefined) continue;

    const targetBelief = mergedBeliefs[targetIndex];
    if (targetBelief.status !== "active") continue;

    if (update.op === "retract") {
      mergedBeliefs[targetIndex] = {
        ...targetBelief,
        status: "retracted",
      };
      continue;
    }

    const revisedBelief: CoachBelief = {
      id: randomUUID(),
      proposition: update.proposition ?? targetBelief.proposition,
      confidence: update.confidence ?? targetBelief.confidence,
      evidence: update.evidence,
      sprintFormed: sprintNumber,
      revisionOf: targetBelief.id,
      status: "active",
    };

    mergedBeliefs[targetIndex] = {
      ...targetBelief,
      status: "superseded",
    };
    beliefIndex.set(revisedBelief.id, mergedBeliefs.push(revisedBelief) - 1);
  }

  return mergedBeliefs;
}

function normalizeEvidenceRef(rawEvidenceRef: unknown): CoachEvidenceRef | null {
  if (!rawEvidenceRef || typeof rawEvidenceRef !== "object") return null;

  const evidenceRef = rawEvidenceRef as RawCoachEvidenceRef;
  const sprintNumber = asPositiveIntegerOrUndefined(evidenceRef.sprintNumber);
  const observation = asTrimmedText(evidenceRef.observation);

  if (!sprintNumber || !observation) {
    return null;
  }

  const matchId = asPositiveIntegerOrUndefined(evidenceRef.matchId);

  return {
    sprintNumber,
    matchId,
    observation,
  };
}

function normalizeSemanticDelta(
  rawDelta: unknown,
  patch: CoachPatch,
): CoachSemanticDelta | undefined {
  if (!rawDelta || typeof rawDelta !== "object") return undefined;

  const delta = rawDelta as RawCoachSemanticDelta;
  if (!isCoachDeltaOp(delta.op) || !isGenomeModuleKey(delta.module) || delta.module !== patch.targetModule) {
    return undefined;
  }

  if (!Array.isArray(delta.evidenceChain) || !Array.isArray(delta.rollbackTriggers)) {
    return undefined;
  }

  const evidenceChain = delta.evidenceChain
    .map((entry) => normalizeEvidenceRef(entry))
    .filter((entry): entry is CoachEvidenceRef => entry !== null);
  const rollbackTriggers = delta.rollbackTriggers
    .map((entry) => asTrimmedText(entry))
    .filter((entry): entry is string => Boolean(entry));
  const rationale = asTrimmedText(delta.rationale) || patch.rationale;
  const oldText = asTrimmedText(delta.oldText) || (delta.op === "add_rule" ? undefined : patch.oldValue);
  const newText = asTrimmedText(delta.newText) || (delta.op === "retire_rule" ? undefined : patch.newValue);

  if (!rationale || evidenceChain.length === 0) {
    return undefined;
  }

  if (delta.op === "add_rule" && !newText) {
    return undefined;
  }

  if (delta.op === "modify_rule" && (!oldText || !newText)) {
    return undefined;
  }

  if (delta.op === "retire_rule" && !oldText) {
    return undefined;
  }

  return {
    op: delta.op,
    module: delta.module,
    oldText,
    newText,
    rationale,
    evidenceChain,
    rollbackTriggers,
  };
}

function normalizePatch(rawPatch: unknown, genome: GenomeModules): CoachStructuredPatch | null {
  if (!rawPatch || typeof rawPatch !== "object") return null;

  const patch = rawPatch as RawCoachPatch;
  if (!isGenomeModuleKey(patch.targetModule)) return null;

  const newValue = typeof patch.newValue === "string" ? patch.newValue.trim() : "";
  const rationale = typeof patch.rationale === "string" ? patch.rationale.trim() : "";
  const expectedEffect = typeof patch.expectedEffect === "string" ? patch.expectedEffect.trim() : "";

  if (!newValue || !rationale || !expectedEffect) {
    return null;
  }

  const normalizedPatch: CoachStructuredPatch = {
    targetModule: patch.targetModule,
    oldValue: genome[patch.targetModule],
    newValue,
    rationale,
    expectedEffect,
  };

  const delta = normalizeSemanticDelta(patch.delta, normalizedPatch);
  if (delta) {
    normalizedPatch.delta = delta;
  }

  return normalizedPatch;
}

function normalizeDecision(rawDecision: unknown): CoachDecision | null {
  if (typeof rawDecision !== "string") return null;
  const decision = rawDecision.trim().toLowerCase();
  return decision === "commit" || decision === "revert" ? decision : null;
}

async function persistCoachCallLog(
  state: CoachState,
  aiConfig: AIPlayerConfig,
  sprintNumber: number,
  prompt: string,
  rawResponse: string | null,
  parsedResult: unknown,
  latencyMs: number,
  error?: string,
  promptTokens?: number,
  completionTokens?: number,
  totalTokens?: number,
  reasoningTrace?: string,
) {
  try {
    await storage.createAiCallLog({
      matchId: null,
      gameId: `coach-${state.teamId}`,
      roundNumber: sprintNumber,
      provider: aiConfig.provider,
      model: aiConfig.model,
      actionType: COACH_ACTION_TYPE,
      prompt,
      rawResponse,
      parsedResult: parsedResult ?? null,
      latencyMs,
      timedOut: false,
      error: error || null,
      parseQuality: error ? "error" : "clean",
      usedFallback: Boolean(error),
      promptTokens: promptTokens ?? null,
      completionTokens: completionTokens ?? null,
      totalTokens: totalTokens ?? null,
      estimatedCostUsd: estimateCost(aiConfig, promptTokens, completionTokens) || null,
      reasoningTrace: reasoningTrace || null,
    });
  } catch (loggingError) {
    log(`[coach] Failed to persist coach AI call log: ${formatError(loggingError)}`, COACH_SOURCE);
  }
}

async function getRecordedMatchCostUsd(state: CoachState): Promise<number> {
  const matchIds = state.sprintHistory.flatMap((sprint) => sprint.matchResults.map((match) => match.matchId));
  if (matchIds.length === 0) return 0;
  return storage.getCumulativeCost(matchIds);
}

function toIsoString(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

export function cloneCoachBeliefs(beliefs: CoachBelief[]): CoachBelief[] {
  return beliefs.map((belief) => ({ ...belief }));
}

export function applySprintResultToCoachState(state: CoachState, sprintResult: SprintResult): CoachState {
  return {
    ...state,
    currentSprint: sprintResult.sprintNumber,
    patchHistory: hydrateMeasuredPatchOutcome(state.patchHistory, sprintResult),
    sprintHistory: [...state.sprintHistory, sprintResult],
  };
}

export function applyCoachAutopsyResult(
  state: CoachState,
  sprintResult: SprintResult,
  autopsy: { beliefs: CoachBelief[]; patch: CoachStructuredPatch | null; decision: CoachDecision },
): CoachState {
  const nextState: CoachState = {
    ...state,
    beliefs: autopsy.beliefs,
  };

  if (autopsy.decision !== "commit" || !autopsy.patch) {
    return nextState;
  }

  return {
    ...nextState,
    genome: applyCoachPatch(nextState.genome, autopsy.patch),
    patchHistory: [
      ...nextState.patchHistory,
      {
        ...autopsy.patch,
        sprintApplied: sprintResult.sprintNumber,
        decision: "commit",
      },
    ],
  };
}

function createInitialCoachStateFromRun(run: PersistedCoachRun): CoachState {
  return {
    teamId: run.arenaId || `coach-${run.id.slice(0, 8)}`,
    genome: cloneGenome(run.initialGenome),
    beliefs: [],
    patchHistory: [],
    sprintHistory: [],
    currentSprint: 0,
  };
}

function summarizeSprintResearchMetrics(sprintResult: SprintResult): CoachResearchMetrics {
  const wins = sprintResult.matchResults.filter((match) => match.winner === match.ourTeam).length;
  const losses = sprintResult.matchResults.filter((match) => match.winner !== null && match.winner !== match.ourTeam).length;
  const draws = sprintResult.matchResults.filter((match) => match.winner === null).length;

  return {
    completedMatches: sprintResult.matchResults.length,
    wins,
    losses,
    draws,
  };
}

function summarizePatchMeasuredOutcome(sprintResult: SprintResult): PatchMeasuredOutcome {
  const metrics = summarizeSprintResearchMetrics(sprintResult);

  return {
    wins: metrics.wins ?? 0,
    losses: metrics.losses ?? 0,
    draws: metrics.draws ?? 0,
  };
}

export async function persistPatchIndexRecord(
  runId: string,
  sprintResult: SprintResult,
  genomeBefore: GenomeModules,
  state: CoachState,
  autopsy: PersistedPatchDecision,
): Promise<void> {
  const committedEdits = autopsy.decision === "commit"
    ? autopsy.patchBundle?.edits.length
      ? autopsy.patchBundle.edits
      : autopsy.patch
        ? [autopsy.patch]
        : []
    : [];

  if (committedEdits.length === 0) {
    await storage.createPatchIndexEntry({
      runId,
      sprintNumber: sprintResult.sprintNumber,
      module: autopsy.patch?.targetModule ?? "none",
      decision: "reverted",
      proposalId: autopsy.proposalId ?? null,
      delta: autopsy.patch?.delta ?? null,
      genomeBefore: cloneGenome(genomeBefore),
      genomeAfter: null,
      measuredOutcome: summarizePatchMeasuredOutcome(sprintResult),
    });
    return;
  }

  await Promise.all(committedEdits.map((edit) =>
    storage.createPatchIndexEntry({
      runId,
      sprintNumber: sprintResult.sprintNumber,
      module: edit.targetModule,
      decision: "committed",
      proposalId: autopsy.proposalId ?? autopsy.patchBundle?.proposalId ?? null,
      delta: edit.delta ?? null,
      genomeBefore: cloneGenome(genomeBefore),
      genomeAfter: cloneGenome(state.genome),
      measuredOutcome: summarizePatchMeasuredOutcome(sprintResult),
      reviewDueSprint: autopsy.reviewDueSprint ?? null,
    }),
  ));
}

function toCoachSprintRecord(sprint: PersistedCoachSprint): CoachSprintRecord {
  return {
    id: sprint.id,
    runId: sprint.runId,
    sprintNumber: sprint.sprintNumber,
    opponentRunId: sprint.opponentRunId || undefined,
    matchIds: sprint.matchIds ?? [],
    record: sprint.record,
    winRate: Number(sprint.winRate),
    genomeBefore: cloneGenome(sprint.genomeBefore),
    genomeAfter: cloneGenome(sprint.genomeAfter),
    beliefsAfter: cloneCoachBeliefs((sprint.beliefsAfter ?? []) as CoachBelief[]),
    decision: sprint.decision,
    patch: sprint.patch ? { ...sprint.patch } : null,
    disclosureText: sprint.disclosureText || undefined,
    researchMetrics: sprint.researchMetrics ?? {},
    scratchNotesSnapshot: sprint.scratchNotesSnapshot ?? null,
    createdAt: sprint.createdAt.toISOString(),
  };
}

function toCoachRunRecord(run: PersistedCoachRun, sprints: PersistedCoachSprint[]): CoachRunRecord {
  return {
    id: run.id,
    config: defaultCoachConfig(run.config),
    searchPolicy: run.searchPolicy ?? DEFAULT_SEARCH_POLICY,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    startedAt: toIsoString(run.startedAt),
    completedAt: toIsoString(run.completedAt),
    arenaId: run.arenaId || undefined,
    budgetCapUsd: run.budgetCapUsd || undefined,
    actualCostUsd: run.actualCostUsd || undefined,
    initialGenome: cloneGenome(run.initialGenome),
    currentGenome: cloneGenome(run.currentGenome),
    currentBeliefs: cloneCoachBeliefs((run.currentBeliefs ?? []) as CoachBelief[]),
    currentSprint: run.currentSprint,
    currentScratchNotes: run.currentScratchNotes ?? null,
    sprints: sprints.map(toCoachSprintRecord),
    isActive: activeCoachRuns.get(run.id) === true,
  };
}

export async function persistCoachRunProgress(runId: string, state: CoachState): Promise<string | null> {
  const recordedCost = await getRecordedMatchCostUsd(state);
  const actualCostUsd = recordedCost > 0 ? recordedCost.toFixed(6) : null;

  await storage.updateCoachRun(runId, {
    currentGenome: cloneGenome(state.genome),
    currentBeliefs: cloneCoachBeliefs(state.beliefs),
    currentSprint: state.currentSprint,
    actualCostUsd,
  });

  return actualCostUsd;
}

export async function persistCoachSprintRecord(
  runId: string,
  env: CoachSprintEnvironment,
  sprintResult: SprintResult,
  genomeBefore: GenomeModules,
  state: CoachState,
  autopsy: { decision: CoachDecision; patch: CoachStructuredPatch | null },
): Promise<void> {
  await storage.createCoachSprint({
    runId,
    sprintNumber: sprintResult.sprintNumber,
    opponentRunId: env.opponentRunId || null,
    matchIds: sprintResult.matchResults.map((match) => match.matchId),
    record: sprintResult.record,
    winRate: sprintResult.winRate.toFixed(6),
    genomeBefore: cloneGenome(genomeBefore),
    genomeAfter: cloneGenome(state.genome),
    beliefsAfter: cloneCoachBeliefs(state.beliefs),
    decision: autopsy.decision,
    patch: autopsy.patch ? { ...autopsy.patch } : null,
    disclosureText: env.disclosureText || null,
    researchMetrics: summarizeSprintResearchMetrics(sprintResult),
  });

  await persistPatchIndexRecord(runId, sprintResult, genomeBefore, state, autopsy);
}

export function defaultCoachConfig(overrides: Partial<CoachConfig> = {}): CoachConfig {
  const coachProvider = isAIProvider(overrides.coachProvider) ? overrides.coachProvider : "openrouter";
  const playerProvider = isAIProvider(overrides.playerProvider) ? overrides.playerProvider : coachProvider;
  const coachModel = typeof overrides.coachModel === "string" && overrides.coachModel.trim()
    ? overrides.coachModel
    : "deepseek/deepseek-v3.2";
  const playerModel = typeof overrides.playerModel === "string" && overrides.playerModel.trim()
    ? overrides.playerModel
    : coachModel;

  return {
    coachProvider,
    coachModel,
    playerProvider,
    playerModel,
    matchesPerSprint: asPositiveInteger(overrides.matchesPerSprint, 3),
    sprintConcurrency: asPositiveInteger(overrides.sprintConcurrency, 5),
    totalSprints: asPositiveInteger(overrides.totalSprints, 10),
    opponentGenome: coerceGenomeModules(overrides.opponentGenome),
    teamSize: overrides.teamSize === 2 ? 2 : 3,
    budgetCapUsd: coerceBudgetCap(overrides.budgetCapUsd),
  };
}

export function isCoachRunActive(id: string): boolean {
  return activeCoachRuns.get(id) === true;
}

export async function getCoachRun(id: string): Promise<CoachRunRecord | undefined> {
  const run = await storage.getCoachRun(id);
  if (!run) return undefined;

  const sprints = await storage.getCoachSprints(id);
  return toCoachRunRecord(run, sprints);
}

export async function stopCoachRun(id: string): Promise<void> {
  if (id === "*") {
    for (const activeId of activeCoachRuns.keys()) {
      activeCoachRuns.set(activeId, false);
    }

    const runs = await storage.listCoachRuns();
    const stoppedAt = new Date();

    for (const run of runs) {
      if (run.status === "running") {
        await storage.updateCoachRun(run.id, {
          status: "stopped",
          completedAt: stoppedAt,
        });
      }
    }

    return;
  }

  activeCoachRuns.set(id, false);

  const run = await storage.getCoachRun(id);
  if (!run || run.status !== "running") return;

  await storage.updateCoachRun(id, {
    status: "stopped",
    completedAt: new Date(),
  });
}

export async function generateRoundSummaries(matchId: number): Promise<string[]> {
  const rounds = await storage.getMatchRounds(matchId);
  const groupedRounds = buildRoundGroups(rounds);
  const orderedRoundNumbers = Array.from(groupedRounds.keys()).sort((left, right) => left - right);

  return orderedRoundNumbers.flatMap((roundNumber) => {
    const roundGroup = groupedRounds.get(roundNumber);
    if (!roundGroup) return [];

    const fragments = (["amber", "blue"] as const)
      .map((team) => roundGroup[team] ? buildRoundSummaryForTeam(roundGroup[team]!, team) : null)
      .filter((fragment): fragment is string => fragment !== null);

    if (fragments.length === 0) return [];
    return [`R${roundNumber}: ${fragments.join(" ")}`];
  });
}

export async function runCoachSprint(
  state: CoachState,
  config: CoachConfig,
  env: CoachSprintEnvironment,
): Promise<SprintResult> {
  const sprintNumber = state.currentSprint + 1;
  const opponentGenome = cloneGenome(env.opponentGenome);

  // Compile role-specific prompts once per sprint
  const ownCompiledPrompts = compileGenomePrompts(state.genome);
  const opponentCompiledPrompts = compileGenomePrompts(opponentGenome);
  const ownMonolithic = buildGenomeSystemPrompt(state.genome);
  const opponentMonolithic = buildGenomeSystemPrompt(opponentGenome);

  log(`[coach] Sprint ${sprintNumber} starting with ${config.matchesPerSprint} scheduled matches`, COACH_SOURCE);

  // Track accumulated scratch notes across sprint matches
  const sprintScratchNotes: Partial<Record<Team, ScratchNotesSnapshot>> = {};

  const scheduledMatches = Array.from({ length: config.matchesPerSprint }, (_, matchIndex) => async () => {
    const ourTeam: Team = env.teamSequence?.[matchIndex] || (matchIndex % 2 === 0 ? "amber" : "blue");
    const promptOverrides: HeadlessPromptOverrides = ourTeam === "amber"
      ? {
          amber: {
            compiledPrompts: ownCompiledPrompts,
            monolithicSystemPrompt: ownMonolithic,
          },
          blue: {
            compiledPrompts: opponentCompiledPrompts,
            monolithicSystemPrompt: opponentMonolithic,
          },
        }
      : {
          amber: {
            compiledPrompts: opponentCompiledPrompts,
            monolithicSystemPrompt: opponentMonolithic,
          },
          blue: {
            compiledPrompts: ownCompiledPrompts,
            monolithicSystemPrompt: ownMonolithic,
          },
        };

    // Build scratch notes config for this match
    const scratchNotesByTeam: Partial<Record<Team, string>> | undefined = env.teamScratchNotes
      ? { ...env.teamScratchNotes }
      : undefined;

    try {
      const matchConfigOverride = env.matchConfigOverrides?.[matchIndex] || {};
      const seedTag = env.seedTag || env.matchmakingBucket;
      const result = await runHeadlessMatch({
        players: buildHeadlessPlayers(config, sprintNumber, matchIndex),
        fastMode: true,
        seed: seedTag
          ? `${state.teamId}-s${sprintNumber}-${seedTag}-m${matchIndex + 1}`
          : `${state.teamId}-s${sprintNumber}-m${matchIndex + 1}`,
        experimentId: `coach-${state.teamId}`,
        teamSize: config.teamSize,
        promptOverrides,
        matchmakingBucket: env.matchmakingBucket,
        ...(scratchNotesByTeam ? { scratchNotesByTeam } : {}),
        ...(env.enablePostMatchReflection != null ? { enablePostMatchReflection: env.enablePostMatchReflection } : {}),
        ...(env.reflectionTokenBudget != null ? { reflectionTokenBudget: env.reflectionTokenBudget } : {}),
        ...matchConfigOverride,
      });

      // Capture updated scratch notes for the sprint result
      if (result.updatedScratchNotes) {
        for (const [team, snapshot] of Object.entries(result.updatedScratchNotes) as Array<[Team, ScratchNotesSnapshot]>) {
          if (snapshot) {
            sprintScratchNotes[team] = snapshot;
          }
        }
      }

      const opposingTeam: Team = ourTeam === "amber" ? "blue" : "amber";
      const ourScore = result.teams[ourTeam];
      const opponentScore = result.teams[opposingTeam];
      const roundSummaries = await generateRoundSummaries(result.matchId);
      const matchResult: SprintResult["matchResults"][number] = {
        matchId: result.matchId,
        winner: result.winner,
        ourTeam,
        ourWhiteTokens: ourScore.whiteTokens,
        ourBlackTokens: ourScore.blackTokens,
        oppWhiteTokens: opponentScore.whiteTokens,
        oppBlackTokens: opponentScore.blackTokens,
        totalRounds: result.totalRounds,
        roundSummaries,
      };

      log(
        `[coach] Sprint ${sprintNumber} match ${matchIndex + 1}/${config.matchesPerSprint} completed: ${describeMatchOutcome(matchResult)} (match ${result.matchId})`,
        COACH_SOURCE,
      );

      return matchResult;
    } catch (error) {
      log(`[coach] Sprint ${sprintNumber} match ${matchIndex + 1}/${config.matchesPerSprint} failed: ${formatError(error)}`, COACH_SOURCE);
      throw error;
    }
  });

  const matchSettlements = await runBoundedSettledPool(scheduledMatches, config.sprintConcurrency);
  const matchResults = matchSettlements.flatMap((settlement) => settlement.status === "fulfilled" ? [settlement.value] : []);

  const wins = matchResults.filter((match) => match.winner === match.ourTeam).length;
  const losses = matchResults.filter((match) => match.winner !== null && match.winner !== match.ourTeam).length;
  const draws = matchResults.filter((match) => match.winner === null).length;
  const completedMatches = matchResults.length;
  const record = draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
  const winRate = completedMatches > 0 ? wins / completedMatches : 0;

  log(`[coach] Sprint ${sprintNumber} complete. Record ${record}, win rate ${winRate.toFixed(2)}`, COACH_SOURCE);

  return {
    sprintNumber,
    matchResults,
    winRate,
    record,
    finalScratchNotesByTeam: Object.keys(sprintScratchNotes).length > 0 ? sprintScratchNotes : undefined,
  };
}

export async function coachAutopsy(
  state: CoachState,
  sprintResult: SprintResult,
  config: CoachConfig,
  env?: Pick<CoachSprintEnvironment, "disclosureText">,
): Promise<{ beliefs: CoachBelief[]; patch: CoachStructuredPatch | null; decision: "commit" | "revert" }> {
  const aiConfig = buildAIConfig(config.coachProvider, config.coachModel);
  const { systemPrompt, userPrompt } = buildCoachPrompt(state, sprintResult, env);
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
  const startTime = Date.now();

  try {
    const rawResponse = await callAI(aiConfig, systemPrompt, userPrompt, { maxTokens: 4000 });
    const latencyMs = Date.now() - startTime;
    const parsedResponse = parseCoachResponseJson(rawResponse.text);

    if (!parsedResponse) {
      await persistCoachCallLog(
        state,
        aiConfig,
        sprintResult.sprintNumber,
        fullPrompt,
        rawResponse.text,
        null,
        latencyMs,
        "Failed to parse coach response as JSON",
        rawResponse.promptTokens,
        rawResponse.completionTokens,
        rawResponse.totalTokens,
        rawResponse.reasoningTrace,
      );

      log(`[coach] Sprint ${sprintResult.sprintNumber} autopsy parse failed. Defaulting to REVERT.`, COACH_SOURCE);

      return {
        beliefs: state.beliefs,
        patch: null,
        decision: "revert",
      };
    }

    const beliefUpdates = normalizeBeliefUpdates(parsedResponse.beliefUpdates);
    const beliefs = beliefUpdates
      ? mergeBeliefUpdates(state.beliefs, beliefUpdates, sprintResult.sprintNumber)
      : state.beliefs;
    const decision = normalizeDecision(parsedResponse.decision);
    const patch = normalizePatch(parsedResponse.patch, state.genome);
    const finalDecision: CoachDecision = decision === "commit" && patch ? "commit" : "revert";
    const normalizedResult = {
      beliefs,
      decision: finalDecision,
      patch: finalDecision === "commit" ? patch : null,
    };

    await persistCoachCallLog(
      state,
      aiConfig,
      sprintResult.sprintNumber,
      fullPrompt,
      rawResponse.text,
      normalizedResult,
      latencyMs,
      decision === "commit" && !patch ? "Coach requested commit but patch payload was invalid" : undefined,
      rawResponse.promptTokens,
      rawResponse.completionTokens,
      rawResponse.totalTokens,
      rawResponse.reasoningTrace,
    );

    log(
      `[coach] Sprint ${sprintResult.sprintNumber} autopsy decided ${finalDecision.toUpperCase()}${normalizedResult.patch ? ` ${normalizedResult.patch.targetModule}` : ""}`,
      COACH_SOURCE,
    );

    return normalizedResult;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = formatError(error);

    await persistCoachCallLog(
      state,
      aiConfig,
      sprintResult.sprintNumber,
      fullPrompt,
      null,
      null,
      latencyMs,
      errorMessage,
    );

    log(`[coach] Sprint ${sprintResult.sprintNumber} autopsy call failed: ${errorMessage}. Defaulting to REVERT.`, COACH_SOURCE);

    return {
      beliefs: state.beliefs,
      patch: null,
      decision: "revert",
    };
  }
}

async function runCoachLoopInternal(config: CoachConfig, initialState: CoachState, runId: string): Promise<CoachLoopOutcome> {
  let state = structuredClone(initialState);
  let budgetExceeded = false;
  const sprintEnvironment: CoachSprintEnvironment = {
    opponentGenome: config.opponentGenome ? cloneGenome(config.opponentGenome) : cloneGenome(DEFAULT_OPPONENT_GENOME),
  };

  log(
    `[coach] Starting coach loop for ${state.teamId}. ${config.totalSprints} sprints, ${config.matchesPerSprint} matches per sprint.`,
    COACH_SOURCE,
  );

  for (let sprintIndex = 0; sprintIndex < config.totalSprints; sprintIndex++) {
    if (activeCoachRuns.get(runId) !== true) {
      log(`[coach] Run ${runId} stopped before sprint ${sprintIndex + 1}`, COACH_SOURCE);
      break;
    }

    if (config.budgetCapUsd !== undefined) {
      const recordedCost = await getRecordedMatchCostUsd(state);
      await storage.updateCoachRun(runId, {
        actualCostUsd: recordedCost > 0 ? recordedCost.toFixed(6) : null,
      });

      if (recordedCost >= config.budgetCapUsd) {
        budgetExceeded = true;
        log(`[coach] Budget cap of $${config.budgetCapUsd.toFixed(2)} reached before sprint ${sprintIndex + 1}. Stopping early.`, COACH_SOURCE);
        break;
      }
    }

    const genomeBefore = cloneGenome(state.genome);
    const sprintResult = await runCoachSprint(state, config, sprintEnvironment);
    const hydratedPatchHistory = hydrateMeasuredPatchOutcome(state.patchHistory, sprintResult);

    state = {
      ...state,
      currentSprint: sprintResult.sprintNumber,
      patchHistory: hydratedPatchHistory,
      sprintHistory: [...state.sprintHistory, sprintResult],
    };

    const autopsy = await coachAutopsy(state, sprintResult, config, sprintEnvironment);
    state = {
      ...state,
      beliefs: autopsy.beliefs,
    };

    if (autopsy.decision === "commit" && autopsy.patch) {
      state = {
        ...state,
        genome: applyCoachPatch(state.genome, autopsy.patch),
        patchHistory: [
          ...state.patchHistory,
          {
            ...autopsy.patch,
            sprintApplied: sprintResult.sprintNumber,
            decision: "commit",
          },
        ],
      };

      log(
        `[coach] Sprint ${sprintResult.sprintNumber} COMMIT ${autopsy.patch.targetModule}: ${autopsy.patch.expectedEffect}`,
        COACH_SOURCE,
      );
    } else {
      log(`[coach] Sprint ${sprintResult.sprintNumber} REVERT: keeping current genome`, COACH_SOURCE);
    }

    await persistCoachSprintRecord(runId, sprintEnvironment, sprintResult, genomeBefore, state, autopsy);
    await persistCoachRunProgress(runId, state);
  }

  log(`[coach] Coach loop finished for ${state.teamId} after ${state.currentSprint} completed sprints`, COACH_SOURCE);

  return { state, budgetExceeded };
}

export async function runCoachLoop(config: CoachConfig): Promise<CoachState> {
  const run = await createCoachRun(config);
  return runCoachRun(run.id);
}

export async function createCoachRunWithInitialState(
  config: CoachConfig,
  initialState: CoachState,
  arenaId?: string,
): Promise<CoachRunRecord> {
  const normalizedConfig = defaultCoachConfig(config);
  if (!normalizedConfig.opponentGenome) {
    normalizedConfig.opponentGenome = cloneGenome(DEFAULT_OPPONENT_GENOME);
  }

  const persistedRun = await storage.createCoachRun({
    id: randomUUID(),
    config: normalizedConfig,
    status: "pending",
    initialGenome: cloneGenome(initialState.genome),
    currentGenome: cloneGenome(initialState.genome),
    currentBeliefs: [],
    currentSprint: 0,
    arenaId: arenaId ?? initialState.teamId,
    searchPolicy: DEFAULT_SEARCH_POLICY,
    budgetCapUsd: normalizedConfig.budgetCapUsd?.toFixed(2) ?? null,
    actualCostUsd: null,
  });

  activeCoachRuns.set(persistedRun.id, false);

  log(`[coach] Created coach run ${persistedRun.id} for ${persistedRun.arenaId}`, COACH_SOURCE);

  return toCoachRunRecord(persistedRun, []);
}

export async function createCoachRun(
  config: CoachConfig,
  initialState?: CoachState,
  arenaId?: string,
): Promise<CoachRunRecord> {
  const normalizedConfig = defaultCoachConfig(config);
  return createCoachRunWithInitialState(
    normalizedConfig,
    initialState ?? createInitialCoachState(normalizedConfig),
    arenaId,
  );
}

export async function runCoachRun(id: string): Promise<CoachState> {
  const existing = await storage.getCoachRun(id);
  if (!existing) {
    throw new Error(`Coach run ${id} not found`);
  }

  if (activeCoachRuns.get(id) === true) {
    throw new Error(`Coach run ${id} is already active`);
  }

  if (existing.status !== "pending") {
    throw new Error(`Coach run ${id} is not pending`);
  }

  activeCoachRuns.set(id, true);
  await storage.updateCoachRun(id, {
    status: "running",
    startedAt: new Date(),
  });

  try {
    const outcome = await runCoachLoopInternal(defaultCoachConfig(existing.config), createInitialCoachStateFromRun(existing), id);
    const latestRun = await storage.getCoachRun(id);
    const stopped = activeCoachRuns.get(id) === false && latestRun?.status === "stopped";
    const status: CoachRunStatus = stopped ? "stopped" : outcome.budgetExceeded ? "budget_exceeded" : "completed";
    const actualCostUsd = await getRecordedMatchCostUsd(outcome.state);

    await storage.updateCoachRun(id, {
      status,
      currentGenome: cloneGenome(outcome.state.genome),
      currentBeliefs: cloneCoachBeliefs(outcome.state.beliefs),
      currentSprint: outcome.state.currentSprint,
      actualCostUsd: actualCostUsd > 0 ? actualCostUsd.toFixed(6) : null,
      completedAt: new Date(),
    });

    activeCoachRuns.delete(id);
    return outcome.state;
  } catch (error) {
    activeCoachRuns.delete(id);
    await storage.updateCoachRun(id, {
      status: "failed",
      completedAt: new Date(),
    });
    throw error;
  }
}

export async function createAndStartCoachRun(config: CoachConfig): Promise<CoachRunRecord> {
  const run = await createCoachRun(config);

  runCoachRun(run.id).catch((error) => {
    log(`[coach] Background coach run ${run.id} failed: ${formatError(error)}`, COACH_SOURCE);
  });

  return run;
}
