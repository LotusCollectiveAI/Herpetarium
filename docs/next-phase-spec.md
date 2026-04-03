# Herpetarium Next-Phase Spec

## 1. EXECUTIVE SUMMARY
The next phase should keep the coach LLM as the tactical decider while giving it much stronger evidence and much better mutation surfaces. The current loop fails because it asks a coach to commit from sparse win/loss summaries, synthetic mirrored results, short games, and a genome that mostly only mutates `cluePhilosophy`. The next phase should therefore add real side-swapped match batches, configurable longform evaluation games, a deterministic sprint evaluator that converts existing logs into execution and leakage metrics, a richer six-module genome with explicit execution and deliberation surfaces, a two-stage coach flow in which the coach proposes a patch then reviews frozen-anchor A/B results before the final commit, and a patch-aftercare layer that actually evaluates rollback triggers and reports them back to the coach. The code’s job is to improve pressure and observability, not to replace LLM judgment with rules.

## 2. DESIGN PRINCIPLES
- LLM intelligence remains the product; software exists to create pressure and surface evidence.
- Frozen-anchor A/B is information for the coach, not an automatic veto.
- Researcher policy is visible and auditable, not silent and mechanical.
- Natural-language genomes remain freeform prose; structure is metadata around them.
- Mutation pressure should broaden the searchable space, not narrow it.
- Execution fidelity and deliberation quality must become first-class evidence.
- Role-specific prompt rendering should reduce prompt bloat without imposing rigid protocols.
- Longer games are justified if and only if they create more signal per API dollar.
- Role swap is mandatory for arena evidence; synthetic mirroring is not evidence.
- Rollback triggers must be evaluated and shown to the coach.
- Complexity is a tradeoff signal, not a hard ceiling.
- Every new artifact should be queryable after the run.
- Migration should land data collection before behavior changes.

## 3. CHANGES BY PRIORITY

### P1.1 Two-Stage Coach Commit Loop
**What**
- Replace the single `coachAutopsy()` decision with:
- `coachProposePatch()`
- `runAnchorBatch()`
- `coachCommitReview()`
- Keep the final commit decision with the coach.

**Why**
- The coach currently self-approves from weak evidence.
- Anchor A/B should create pressure without hard-coded commit logic.
- A second review step makes the coach look at counterfactual evidence before it commits.

**How**
Files:
- Modify [server/coachLoop.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/coachLoop.ts)
- Add [server/coachPrompts.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/coachPrompts.ts)
- Add [server/anchorEvaluation.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/anchorEvaluation.ts)
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
- Modify [server/storage.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/storage.ts)
Types:
```ts
export interface CoachProposal {
  proposalId: string;
  beliefUpdates: CoachBeliefUpdate[];
  summary: string;
  hypothesis: string;
  patch: CoachPatchBundle | null;
}

export interface CoachReviewResult {
  decision: "commit" | "revert";
  rationale: string;
  confidence: number;
  policyResponse?: string;
}

// Environment passed to coach prompt builders — dependency injection for prompt context
export interface CoachPromptEnvironment {
  opponentGenome?: GenomeModules;
  disclosureText?: string;
  matchmakingBucket?: string;
  researcherPolicy?: ResearcherPolicyThresholds;
  arenaId?: string;
}

// Input bundle for the sprint evaluator
export interface SprintEvaluationInput {
  runId: string;
  sprintNumber: number;
  matchIds: number[];
  focalTeam: "amber" | "blue";
  currentGenome: GenomeModules;
  previousGenome?: GenomeModules;
  compiledPrompts?: CompiledGenomePrompts;
}
```
Functions:
```ts
export async function coachProposePatch(
  state: CoachState,
  sprintResult: SprintResult,
  evaluation: SprintEvaluation,
  config: CoachConfig,
  env?: CoachPromptEnvironment,
): Promise<CoachProposal>;

export async function coachCommitReview(
  state: CoachState,
  proposal: CoachProposal,
  evaluation: SprintEvaluation,
  anchorReport: AnchorABReport,
  patchReviews: PatchReview[],
  config: CoachConfig,
  env?: CoachPromptEnvironment,
): Promise<CoachReviewResult>;
```
Flow:
1. Run training matches.
2. Build `SprintEvaluation`.
3. Ask coach for a proposal.
4. If no patch, persist `revert`.
5. If patch exists, compile candidate genome and run anchor A/B.
   - Default anchor batch: 4 anchors x 2 seeds x both sides = 16 evaluation games per proposal.
   - Anchor batch uses same `globalMatchConcurrency` as training matches.
   - If anchor evaluation fails (e.g., API errors), show partial results to coach with `anchorReport.incomplete = true`.
6. Ask coach to review the proposal with anchor data and policy notices.
7. Persist proposal, anchor summary, final decision, and rationale separately.
Persistence:
- Add `coach_sprints.proposal`
- Add `coach_sprints.anchorSummary`
- Add `patch_index.proposalId`
- Log `coach_proposal` and `coach_commit_review` in `ai_call_logs`.

**Validation**
- Proposal and review calls both persist.
- Review always includes anchor evidence when patch exists.
- Commit rate becomes evidence-sensitive instead of staying flat.

**Scope**
- `L`

### P1.2 Deterministic Sprint Evaluator and Coach Evidence Packet
**What**
- Create a deterministic evaluator that turns matches, rounds, chatter, and quality logs into a `SprintEvaluation`.
- Build a compact coach evidence packet from that evaluation.

**Why**
- The coach currently sees mostly `record`, `winRate`, and round summaries.
- The core failure is low-information decision making, not the existence of LLM judgment.
- A deterministic evaluator is the right place for extraction, correlation, and normalization.

**How**
Files:
- Add [server/sprintEvaluator.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/sprintEvaluator.ts)
- Modify [server/researchAnalyzer.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/researchAnalyzer.ts)
- Modify [server/transcriptAnalyzer.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/transcriptAnalyzer.ts)
- Modify [server/validationHarness.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/validationHarness.ts)
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
Types:
```ts
export interface SprintEvaluation {
  runId: string;
  sprintNumber: number;
  training: TrainingSprintMetrics;
  execution: ExecutionMetrics;
  deliberation: DeliberationExecutionMetrics;
  leakage: LeakageMetrics;
  sideBalance: SideBalanceMetrics;
  complexity: ComplexityMetrics;
  anchor?: AnchorABReport;
  pendingPatchReviews: PatchReviewSummary[];
  policyNotices: ResearcherPolicyNotice[];
  evidenceLines: string[];
}
```
Sub-types (all fields required unless marked optional):
```ts
export interface TrainingSprintMetrics {
  matchIds: number[];
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  meanRoundsPerMatch: number;
}

export interface ExecutionMetrics {
  ownDecodeRate: number;          // fraction of rounds where own team decoded correctly
  opponentInterceptRateAgainstUs: number;  // fraction of rounds opponent intercepted our clues
  ourInterceptRate: number;       // fraction of rounds we intercepted opponent's clues
  miscommunicationRate: number;   // fraction of rounds where own team consensus differed from correct
  catastrophicAsymmetryRate: number; // fraction of matches with > 2 token gap between sides
}

export interface DeliberationExecutionMetrics {
  ownConsensusRate: number;       // fraction of own-guess deliberations reaching consensus
  interceptConsensusRate: number; // fraction of intercept deliberations reaching consensus
  timeoutRate: number;            // fraction of LLM calls that timed out
  fallbackRate: number;           // fraction of LLM calls that used fallback model
  meanDeliberationExchanges: number;
}

export interface LeakageMetrics {
  meanLeakageScore: number;       // from transcriptAnalyzer
  maxLeakageScore: number;
  keywordMentionRate: number;     // fraction of deliberations mentioning a secret keyword
  codePatternRate: number;        // fraction of deliberations referencing code patterns
}

export interface SideBalanceMetrics {
  amberWinRate: number;
  blueWinRate: number;
  sideGap: number;               // abs(amberWinRate - blueWinRate)
  amberMatchCount: number;
  blueMatchCount: number;
}

export interface AnchorABReport {
  incomplete: boolean;            // true if some anchor matches failed
  anchorsUsed: string[];          // anchor labels
  incumbentWinRate: number;       // incumbent genome vs anchors
  candidateWinRate: number;       // proposed genome vs anchors
  delta: number;                  // candidate - incumbent
  incumbentMatchIds: number[];
  candidateMatchIds: number[];
  perAnchor: Array<{
    label: string;
    incumbentWins: number;
    candidateWins: number;
    total: number;
  }>;
}

export interface PatchReviewSummary {
  proposalId: string;
  committedSprint: number;
  status: "clear" | "trigger_fired" | "mixed" | "insufficient_data";
  firedTriggers: string[];
}
```
Function:
```ts
export async function evaluateSprint(input: SprintEvaluationInput): Promise<SprintEvaluation>;
```
Implementation notes:
- Use only stored data; no LLM calls.
- Reuse `analyzeSprintMatches()` and `analyzeMatchTranscripts()` where possible.
- Output should be byte-stable given the same match set.
Persistence:
- Create `sprint_evaluations` table with `run_id`, `sprint_number`, `evaluation`, `created_at`.
- Keep `coach_sprints.researchMetrics` as a smaller legacy summary.

**Validation**
- Every completed sprint writes one evaluation row.
- Same inputs produce the same evaluation JSON.
- Smoke script verifies evaluation generation across a finished arena.

**Scope**
- `M`

### P1.3 Six-Module Genome and Multi-Module Patch Bundles
**What**
- Extend `GenomeModules` with:
- `executionGuidance`
- `deliberationScaffold`
- Replace single-module patches with bundles of 1-3 edits.

**Why**
- The current loop mostly mutates `cluePhilosophy`.
- The earlier analysis found that execution burden and frozen deliberation are central failures.
- A wider genome is necessary, but the bundle cap keeps mutation size bounded.

**How**
Files:
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
- Modify [server/coachLoop.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/coachLoop.ts)
- Modify [server/evolution.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/evolution.ts)
- Modify [server/disclosure.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/disclosure.ts)
Types:
```ts
export interface GenomeModules {
  cluePhilosophy: string;
  opponentModeling: string;
  riskTolerance: string;
  memoryPolicy: string;
  executionGuidance: string;
  deliberationScaffold: string;
}

export interface CoachModuleEdit {
  targetModule: keyof GenomeModules;
  oldValue: string;
  newValue: string;
  rationale: string;
  expectedEffect: string;
  delta?: CoachSemanticDelta;
}

export interface CoachPatchBundle {
  proposalId: string;
  summary: string;
  expectedEffect: string;
  edits: CoachModuleEdit[];
  complexityIntent: "increase" | "decrease" | "neutral";
}
```
Functions:
```ts
export function applyCoachPatchBundle(genome: GenomeModules, patch: CoachPatchBundle): GenomeModules;
export function cloneGenome(genome: GenomeModules): GenomeModules;
```
Rules:
- A bundle may touch 1-3 modules.
- `revert` remains valid with `patch = null`.
- Simplification or removal is explicitly valid.

**CRITICAL**: Update `GENOME_MODULE_KEYS` in `server/coachLoop.ts` (currently hardcoded to 4 modules). Also update `coerceGenomeModules()` which validates genomes against this array — without this fix, genomes with the new fields will be silently rejected.

Default values for new modules in seed genomes:
```ts
executionGuidance: "Focus on clear, unambiguous clues that your teammates can decode reliably. When uncertain, prefer simpler associations over clever ones."
deliberationScaffold: "Discuss openly with your teammates. Share your reasoning, consider alternatives, and reach consensus before committing to an answer."
```

Legacy compatibility for `CoachStructuredPatch`:
- `coach_sprints.patch` column currently stores `CoachStructuredPatch | null`.
- Migration: rename column to `legacyPatch`, add new `patchBundle` JSONB column for `CoachPatchBundle`.
- Backfill script converts existing `CoachStructuredPatch` records into single-edit `CoachPatchBundle` format.

Backfill:
- Add [scripts/backfill-genome-v2.ts](/Users/mstraw/Documents/GitHub/Herpetarium/scripts/backfill-genome-v2.ts)
- Backfill the new module keys into stored genomes in `coach_runs`, `coach_sprints`, `strategy_genomes`, AND `patch_index` (both `genome_before` and `genome_after` columns store `GenomeModules` snapshots).
- Historical `patch_index` records with 4-field genomes get the same defaults added.
- The backfill must be idempotent (safe to re-run).

**Validation**
- At least 40% of committed bundles in pilot touch a non-`cluePhilosophy` module.
- Bundle application is deterministic and reversible from stored old values.

**Scope**
- `M`

### P1.4 Role-Specific Genome Compiler
**What**
- Replace `buildGenomeSystemPrompt()` with a compiler that emits different prompts for:
- cluegiver
- own guesser
- interceptor
- own deliberator
- intercept deliberator
- coach

**Why**
- The same monolithic genome text is currently injected into every role.
- That inflates prompt size and makes execution worse.
- Role slicing lets the system mutate deliberation without mutating clue generation by accident.

**How**
Files:
- Add [server/genomeCompiler.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/genomeCompiler.ts)
- Modify [server/headlessRunner.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/headlessRunner.ts)
- Modify [server/coachLoop.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/coachLoop.ts)
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
Types:
```ts
export type PromptRole =
  | "cluegiver"
  | "own_guesser"
  | "interceptor"
  | "own_deliberator"
  | "intercept_deliberator"
  | "coach";

export interface CompiledPromptArtifact {
  role: PromptRole;
  systemPrompt: string;
  tokenEstimate: number;
  charCount: number;
}

export interface CompiledGenomePrompts {
  genomeHash: string;
  compilerVersion: string;
  prompts: Record<PromptRole, CompiledPromptArtifact>;
}
```
Function:
```ts
export function compileGenomePrompts(genome: GenomeModules, options?: PromptCompileOptions): CompiledGenomePrompts;
```
Compiler behavior:
- `cluegiver`: `cluePhilosophy`, `riskTolerance`, relevant `executionGuidance`
- `own_guesser`: `memoryPolicy`, relevant `executionGuidance`
- `interceptor`: `opponentModeling`, `riskTolerance`, relevant `executionGuidance`
- deliberators: `deliberationScaffold` plus role-specific execution hints
- coach: full genome plus complexity summaries
Constraint:
- Output stays freeform prose.
- No forced numbered reasoning protocol other than the existing `READY:` transport handshake.

**Validation**
- Same genome + same compiler version + same role yields identical prompt bytes.
- Role prompts are shorter than the monolithic prompt.
- Own decode stability improves in pilot runs.

**Scope**
- `L`

### P1.5 Real Side-Swapped Pair Batches; No Synthetic Mirroring
**What**
- Replace synthetic mirrored sprint results with real two-match pairing batches.
- Remove `mirrorSprintResult()` from the production arena path.

**Why**
- The current arena stores one actual match and then mirrors it in software.
- Side asymmetry cannot be trusted under that regime.
- Mirror/self-play is low-value compute relative to role-swapped real games.

**How**
Files:
- Modify [server/arena.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/arena.ts)
- Deprecate [server/coachArena.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/coachArena.ts) — mark as legacy 2-coach ecology, keep functional but add deprecation notice. `mirrorSprintResult()` lives here too and must NOT be called from the arena path.
- Modify [server/matchmaking.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/matchmaking.ts)
- Modify [server/headlessRunner.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/headlessRunner.ts)
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
Function:
```ts
export async function runPairedCoachMatches(
  left: ArenaRuntimeSlot,
  right: ArenaRuntimeSlot,
  config: ArenaConfig,
  sprintNumber: number,
  pairingIndex: number,
): Promise<PairingResult>;
```
`PairingResult` should now contain:
- two actual `SprintResult` objects
- `actualMatchIds`
- `roleSwapGroupId`
Persist on `matches`:
```ts
arenaId: varchar("arena_id", { length: 64 }),
runId: varchar("run_id", { length: 64 }),
opponentRunId: varchar("opponent_run_id", { length: 64 }),
sprintNumber: integer("sprint_number"),
matchKind: varchar("match_kind", { length: 24 }),
anchorLabel: varchar("anchor_label", { length: 64 }),
roleSwapGroupId: varchar("role_swap_group_id", { length: 64 }),
focalTeam: varchar("focal_team", { length: 10 }),
gameRules: jsonb("game_rules").$type<GameRules | null>(),
```
Matchmaking change:
- Role swap becomes default.
- `mirror` is no longer a training bucket.

**Validation**
- `amberWinRate` and `blueWinRate` come from actual matches.
- No synthetic mirrored records remain in arena result computation.

**Scope**
- `L`

### P1.6 Configurable Longform Game Rules for Arena and Anchor Evaluation
**What**
- Add configurable game rules so arena and anchor evaluation can use longer games than classic 2-token Decrypto.

**Why**
- Two-round games create too little signal.
- The system currently ends games before opponent adaptation and deliberation style matter.

**How**
Files:
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
- Modify [server/game.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/game.ts)
- Modify [server/headlessRunner.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/headlessRunner.ts)
- Modify [server/routes.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/routes.ts)
Types:
```ts
export interface GameRules {
  whiteTokenLimit: number;
  blackTokenLimit: number;
  minRoundsBeforeWin: number;
  maxRounds: number;
}

export const DEFAULT_GAME_RULES: GameRules = {
  whiteTokenLimit: 2,
  blackTokenLimit: 2,
  minRoundsBeforeWin: 0,
  maxRounds: 20,
};

export const LONGFORM_ARENA_RULES: GameRules = {
  whiteTokenLimit: 3,
  blackTokenLimit: 3,
  minRoundsBeforeWin: 3,
  maxRounds: 12,
};
```
Integration:
- Add `rules` to `GameState`.
- `createNewGame()` accepts rules.
- `evaluateRound()` reads `game.rules`.
- `HeadlessMatchConfig` accepts `gameRules`.
- Classic UI play remains on defaults if omitted.

**Validation**
- Pilot mean rounds per match rises materially over current arena behavior.
- Reproducibility and seeding still work under custom rules.

**Scope**
- `M`

### P1.7 Patch Aftercare and Rollback Trigger Evaluation
**What**
- Evaluate rollback triggers after commit and persist patch review artifacts.
- Show patch review results to the coach on later sprints.

**Why**
- Rollback triggers are currently written and never read.
- A mutation loop without aftercare is narrative, not pressure.

**How**
Files:
- Add [server/rollbackEvaluator.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/rollbackEvaluator.ts)
- Modify [server/coachLoop.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/coachLoop.ts)
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
- Modify [server/storage.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/storage.ts)
Types:
```ts
export interface CoachRollbackTrigger {
  description: string;
  metricHint?: string;
  comparatorHint?: "gt" | "lt" | "delta_gt" | "delta_lt";
  threshold?: number;
  reviewAfterSprints?: number;
}

export interface RollbackTriggerEvaluation {
  description: string;
  status: "clear" | "fired" | "insufficient_data";
  evidenceLines: string[];
  supportingMetrics: Record<string, number | null>;
}

export interface PatchReview {
  runId: string;
  proposalId: string;
  committedSprint: number;
  reviewSprint: number;
  status: "clear" | "trigger_fired" | "mixed" | "insufficient_data";
  evaluations: RollbackTriggerEvaluation[];
  summary: string;
}
```
Function:
```ts
export async function evaluatePendingPatchReviews(input: {
  runId: string;
  currentSprint: number;
  evaluationsBySprint: Map<number, SprintEvaluation>;
  patchHistory: PatchIndex[];
}): Promise<PatchReview[]>;
```
Persistence:
- Create `patch_reviews`
- Extend `patch_index` with `reviewDueSprint`, `reviewStatus`, `reviewSummary`
Behavior:
- Structured hints are evaluated deterministically.
- Pure freeform triggers remain allowed.
- Freeform-only triggers may yield `insufficient_data`; they are still shown to the coach.
- No automatic revert.

**Validation**
- Every committed patch with due data gets a review artifact.
- Review coverage becomes a top-line validation metric.

**Scope**
- `M`

### P1.8 Coach Prompt Rewrite to Remove `cluePhilosophy` Bias
**What**
- Rewrite prompt examples so the coach is not primed to always patch `cluePhilosophy`.

**Why**
- The current example JSON hard-codes `cluePhilosophy`.
- Earlier analysis suggests the prompt itself is part of the mutation distribution failure.

**How**
Files:
- Move prompt builders into [server/coachPrompts.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/coachPrompts.ts)
Prompt changes:
- include one multi-module example touching `executionGuidance` and `deliberationScaffold`
- include one example touching `opponentModeling`
- include one simplification example
- explicitly state:
- “Removing or shortening a rule is valid.”
- “You may change 1-3 modules if one hypothesis spans them.”

Skeleton prompt template for `coachProposePatch`:
```
You are the coach for a Decrypto team. Your genome has 6 modules:
- cluePhilosophy: how your team generates clues
- opponentModeling: how your team reads opponents
- riskTolerance: when to play safe vs aggressive
- memoryPolicy: how your team tracks game history
- executionGuidance: concrete instructions for how players should act
- deliberationScaffold: how your team discusses and reaches consensus

SPRINT EVIDENCE:
{sprintEvaluation.evidenceLines — rendered as bullet list}

EXECUTION FIDELITY:
- Own decode rate: {execution.ownDecodeRate}
- Opponent intercept rate against us: {execution.opponentInterceptRateAgainstUs}
- Miscommunication rate: {execution.miscommunicationRate}

PENDING PATCH REVIEWS:
{patchReviews — any rollback triggers that fired}

Based on this evidence, propose a patch bundle of 1-3 module edits.
You may edit ANY module — not just cluePhilosophy.
Simplifying or shortening a module is a valid and often valuable change.
If no change is warranted, propose nothing.
```

Skeleton prompt template for `coachCommitReview`:
```
You proposed the following patch:
{proposal.summary}
{proposal.hypothesis}
{proposal.patch.edits — rendered}

ANCHOR A/B RESULTS:
{anchorReport — incumbent vs candidate performance on frozen opponents}

POLICY NOTICES:
{policyNotices — any researcher-configured thresholds that were exceeded}

Given this evidence, do you COMMIT this patch or REVERT?
The anchor results show how your candidate genome performs against fixed baselines.
Consider whether the improvement justifies the complexity change.
```

Validation target:
- proposal distribution broadens
- average edit count is no longer almost always `1`

**Validation**
- Module selection is more diverse in pilot runs.
- Simplification patches actually appear.

**Scope**
- `S`

### P2.1 Frozen Anchor Library and Reusable Anchor Ladder
**What**
- Define a named library of frozen anchors and add scripts to run anchor ladders outside the live arena.

**Why**
- External baselines are necessary because closed-pool win rates stay near 50%.
- Frozen anchors give comparable evidence across runs and across time.

**How**
Files:
- Add [server/anchorLibrary.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/anchorLibrary.ts)
- Add [scripts/run-anchor-ladder.ts](/Users/mstraw/Documents/GitHub/Herpetarium/scripts/run-anchor-ladder.ts)
- Modify [server/validationHarness.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/validationHarness.ts)
Types:
```ts
export interface FrozenAnchorDefinition {
  label: string;
  genome: GenomeModules;
  description: string;
  tags: string[];
  rules?: Partial<GameRules>;
}

export interface AnchorPolicy {
  enabled: boolean;
  anchors: string[];
  matchesPerAnchor: number;
  roleSwap: boolean;
  gameRules?: Partial<GameRules>;
  thresholds?: ResearcherPolicyThresholds;
}
```
Initial set:
- `seed-abstract`
- `seed-concrete`
- `seed-functional`
- `seed-balanced`
- `baseline-simple-clear`
- `baseline-simple-oblique`
Persistence:
- Create `anchor_evaluations` with `runId`, `sprintNumber`, `proposalId`, `variant`, `anchorLabel`, `matchIds`, `summary`.

**Validation**
- Anchor ladder is reproducible for a fixed seed bundle.
- Anchor variance is non-zero across lineages.

**Scope**
- `M`

### P2.2 Simplified Training Matchmaking
**What**
- Remove `mirror` from active training buckets.
- Let side-swap and anchor evaluation carry the balance/control burden.

**Why**
- Mirror/self-play is wasted compute in the current arena setting.
- Side swaps and anchors produce more informative evidence.

**How**
Files:
- Modify [server/matchmaking.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/matchmaking.ts)
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
- Modify [server/routes.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/routes.ts)
Type change:
```ts
export type MatchmakingBucket =
  | "near_peer"
  | "diagnostic"
  | "novelty"
  | "baseline";
```
Migration note:
- accept legacy `mirror` for one release and map it to `baseline` with a warning.
Recommended weights:
```ts
{
  nearPeer: 0.45,
  diagnostic: 0.30,
  novelty: 0.15,
  baseline: 0.10,
}
```

**Validation**
- No training self-play unless an explicit debug flag enables it.
- Compute formerly spent on mirror matches moves into real side-swapped or anchor evidence.

**Scope**
- `S`

### P2.3 Complexity Tracking and Coach-Visible Complexity Tradeoffs
**What**
- Add explicit complexity metrics over genome text and compiled prompt artifacts.
- Show complexity deltas to the coach in training evaluation and commit review.

**Why**
- The earlier analysis found a likely complexity/execution failure mode.
- Simpler genomes may be a positive scientific finding rather than a regression.

**How**
Files:
- Add [server/genomeComplexity.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/genomeComplexity.ts)
- Modify [server/genomeCompiler.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/genomeCompiler.ts)
- Modify [server/sprintEvaluator.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/sprintEvaluator.ts)
- Modify [server/pareto.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/pareto.ts)
Type:
```ts
export interface ComplexityMetrics {
  genomeCharCount: number;
  genomeSentenceCount: number;
  compiledPromptChars: Record<PromptRole, number>;
  compiledPromptTotalChars: number;
  deltaGenomeChars: number | null;
  deltaCompiledPromptChars: number | null;
}
```
Function:
```ts
export function computeGenomeComplexity(
  genome: GenomeModules,
  compiled?: CompiledGenomePrompts,
  previous?: ComplexityMetrics | null,
): ComplexityMetrics;
```
Policy notices may include:
- `complexity_increase_without_anchor_gain`
- `decode_drop_with_prompt_growth`
These remain coach-visible warnings only.

**Validation**
- Complexity is tracked from sprint 1.
- Pareto frontier can switch from raw genome chars to compiled prompt complexity after compiler rollout.

**Scope**
- `S`

### P2.4 API and UI for Evaluations, Anchors, and Patch Reviews
**What**
- Expose the new artifacts over HTTP and add basic research UI pages.

**Why**
- The loop itself is now part of the experiment.
- If these artifacts stay trapped in JSONB, researchers cannot inspect them fast enough.

**How**
Files:
- Modify [server/routes.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/routes.ts)
- Add [client/src/pages/Arena.tsx](/Users/mstraw/Documents/GitHub/Herpetarium/client/src/pages/Arena.tsx)
- Add [client/src/pages/CoachRuns.tsx](/Users/mstraw/Documents/GitHub/Herpetarium/client/src/pages/CoachRuns.tsx)
- Modify [client/src/App.tsx](/Users/mstraw/Documents/GitHub/Herpetarium/client/src/App.tsx)
- Modify [client/src/pages/EvalDashboard.tsx](/Users/mstraw/Documents/GitHub/Herpetarium/client/src/pages/EvalDashboard.tsx)
Routes:
- `GET /api/coach/:id/evaluations`
- `GET /api/coach/:id/patch-reviews`
- `GET /api/coach/:id/anchors`
- `GET /api/arena/:id/evaluations`
UI requirements:
- coach run detail page: sprint record, evidence packet, proposal, anchor deltas, commit rationale, patch review history
- arena page: standings, side balance, module mutation distribution, anchor ladder summary

**Validation**
- Endpoints return typed JSON.
- Completed runs render without relying on removed legacy fields.

**Scope**
- `M`

### P2.5 FOIA as a Typed Disclosure Artifact
**What**
- Replace the current raw text genome dump with a typed disclosure artifact while still rendering readable prompt text.

**Why**
- The genome is becoming larger and role-sliced.
- FOIA should stay versioned and legible as the system evolves.

**How**
Files:
- Modify [server/disclosure.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/disclosure.ts)
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
- Modify [server/arena.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/arena.ts)
- Modify [server/coachLoop.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/coachLoop.ts)
Type:
```ts
export interface DisclosureArtifact {
  disclosureVersion: string;
  generatedAt: string;
  policy: {
    foiaDelaySprints: number;
    source: "arena";
  };
  genomes: Array<{
    label: string;
    modules: Partial<GenomeModules>;
  }>;
}
```
Compatibility:
- keep `coach_sprints.disclosureText` for legacy
- add `coach_sprints.disclosureArtifact` for new code

**Validation**
- FOIA output is versioned and replayable.
- Coaches still receive readable disclosure text in prompts.

**Scope**
- `S`

### P3.1 Patch Archive and Retrieval Surface
**What**
- Build a searchable archive of past patch bundles, anchor outcomes, and rollback reviews.

**Why**
- Once the loop produces real pressure, historical patch memory becomes useful.
- This is the minimal path toward a future patch index or fossil museum.

**How**
Files:
- Add [server/patchArchive.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/patchArchive.ts)
- Modify [server/storage.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/storage.ts)
- Modify [server/routes.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/routes.ts)
Type:
```ts
export interface PatchArchiveCard {
  proposalId: string;
  modules: Array<keyof GenomeModules>;
  summary: string;
  anchorDelta: number | null;
  rollbackStatus: string | null;
  evidenceSnippet: string[];
}
```
Constraint:
- Keep retrieval researcher-facing first.
- Do not inject archive retrieval into live coach prompts until archive quality is proven.

**Validation**
- Query by module and symptom returns stable results.
- Cards summarize historical outcomes, not just patch text.

**Scope**
- `M`

### P3.2 Opponent-Cluster Anchors and Transfer Tests
**What**
- Cluster opponents by observed behavior and measure transfer across clusters.

**Why**
- Some patches may be locally adaptive only.
- Transfer is a stronger scientific readout than closed-pool win rate.

**How**
Files:
- Add [server/opponentClusters.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/opponentClusters.ts)
- Modify [server/anchorLibrary.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/anchorLibrary.ts)
- Modify [server/validationHarness.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/validationHarness.ts)
Cluster features: anchor ladder profile, leakage profile, deliberation fingerprint, interception style, complexity band.

**Validation**
- Cluster assignments are stable enough across repeated runs to be usable.
- Transfer tests report within-cluster vs cross-cluster deltas.

**Scope**
- `M`

### P3.3 Researcher Policy Controls and Policy-Event Inspection
**What**
- Let researchers set visible thresholds for anchor delta, decode drop, side gap, and complexity growth.

**Why**
- The human researcher should set policy.
- The coach should still reason about tactical action inside that policy context.

**How**
Files:
- Modify [shared/schema.ts](/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts)
- Modify [server/routes.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/routes.ts)
- Modify [client/src/pages/CoachRuns.tsx](/Users/mstraw/Documents/GitHub/Herpetarium/client/src/pages/CoachRuns.tsx)
Types:
```ts
export interface ResearcherPolicyThresholds {
  minAnchorDelta?: number;
  maxDecodeDrop?: number;
  maxSideGap?: number;
  maxComplexityGrowthWithoutGain?: number;
}

export interface ResearcherPolicyNotice {
  code: string;
  severity: "info" | "warning";
  message: string;
}
```
Important constraint:
- Policy notices remain advisory.
- The system records policy conflicts; it does not auto-revert.

**Validation**
- Policy notices appear in evaluations and commit reviews.
- Policy conflict rates are inspectable after a run.

**Scope**
- `S`

## 4. MIGRATION PATH

### Phase 0: Schema and Backfill First
Ship before behavior changes:
- `matches` context fields
- `matches.gameRules`
- `sprint_evaluations`
- `anchor_evaluations`
- `patch_reviews`
- `patch_index` extension fields
Migration files:
- `migrations/0005_next_phase_match_context.sql`
- `migrations/0006_sprint_evaluations.sql`
- `migrations/0007_anchor_and_patch_reviews.sql`
Backfill:
- add `executionGuidance` and `deliberationScaffold` to stored genome JSON
- wrap legacy rollback trigger strings as `{ description: legacyString }`
- script: [scripts/backfill-genome-v2.ts](/Users/mstraw/Documents/GitHub/Herpetarium/scripts/backfill-genome-v2.ts)
Do not change yet:
- `coachAutopsy()`
- classic game rules
- tournament routes

### Phase 1: Fix Evidence Quality Before Coach Logic
Turn on:
- real side-swapped pair batches
- longform arena rules
- deterministic sprint evaluation
Feature flags:
- `ARENA_ROLE_SWAP_ENABLED=1`
- `ARENA_LONGFORM_RULES_ENABLED=1`
- `SPRINT_EVALUATOR_ENABLED=1`
Goal:
- side balance and richer evidence exist before coach prompts are changed.

Canary criteria — rollback to Phase 0 if:
- `sideGap > 0.20` after 30 role-swapped games (indicates role-swap implementation bug)
- `meanRoundsPerMatch < 2.0` under longform rules (rules not taking effect)
- Sprint evaluator fails to produce output for > 20% of sprints

### Phase 2: Expand the Genome, Compiler, and Flip the Coach Loop
**This phase ships together** — the v2 coach loop requires the 6-module genome and patch bundles to function, so they land as one unit.

Turn on:
- Six-field genome + patch bundles (P1.3)
- Role-specific genome compiler (P1.4)
- `coachProposePatch()` + `runAnchorBatch()` + `coachCommitReview()` (P1.1)
- Coach prompt rewrite (P1.8)

Feature flags:
- `COACH_LOOP_V2_ENABLED=1`
- `GENOME_V2_ENABLED=1`

Compatibility:
- if disabled, keep `coachAutopsy()` path alive for one release with 4-module genome
- still persist evaluations so old and new loops can be compared

Canary criteria — rollback to v1 loop if:
- Coach prompt parse failure rate > 30% (prompt too complex)
- Anchor batch latency exceeds 10 min per proposal (blocking the loop)
- Commit rate stays flat at > 90% even with anchor evidence showing negative deltas (coach ignoring evidence)

### Phase 3: Add Patch Aftercare and UI
Turn on:
- rollback evaluation (P1.7)
- patch reviews
- coach/arena evaluation pages (P2.4)

Required secondary updates:
- [server/evolution.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/evolution.ts)
- [client/src/pages/Evolution.tsx](/Users/mstraw/Documents/GitHub/Herpetarium/client/src/pages/Evolution.tsx)
- route validation in [server/routes.ts](/Users/mstraw/Documents/GitHub/Herpetarium/server/routes.ts)

Feature flag:
- `PATCH_AFTERCARE_ENABLED=1`

Goal:
- the loop is not considered complete until reviews are visible and queryable.

## 5. VALIDATION PLAN

### 5.1 Rollout Order
1. deterministic fixture validation
2. `g10` smoke ladder
3. 30-game side-balance pilot
4. 100-game next-phase ladder
5. old loop vs new loop A/B, three replications each

### 5.2 Deterministic Fixture Validation
Run a small synthetic fixture set covering:
- one side-imbalanced sprint
- one long deliberation / timeout sprint
- one decode-collapse sprint
- one pending rollback review
Required checks:
- `evaluateSprint()` is deterministic
- `applyCoachPatchBundle()` is deterministic
- `runAnchorBatch()` uses shared seeds for incumbent and candidate
- `coachCommitReview()` receives anchor data whenever a patch exists
Suggested script:
- `scripts/test-sprint-evaluator.ts`

### Cost Estimates Per Validation Tier
Based on observed $0.014/game (2-round) and estimated $0.04-0.06/game (longform 6+ rounds):
- g10 smoke: ~$1.00-1.50 (10 training + 16 anchor games = 26 longform games)
- 30-game pilot: ~$4-6 (30 training + ~60 anchor games, role-swapped)
- 100-game ladder: ~$15-25 (100 training + ~200 anchor games)
- Old vs new A/B (3 replications): ~$50-75 total
- Full validation suite: **~$70-110 total**

### 5.3 `g10` Smoke Ladder
Run:
- 8 coaches
- 2 pairing batches per sprint
- role swap on every batch
- longform rules
- 2 frozen anchors
- target `10` training games
Expect:
- every sprint persists one evaluation row
- no synthetic mirror logic remains
- side gap is measurable from actual matches
- anchor summaries persist for proposal sprints
Suggested script:
- upgrade [scripts/test-validation.ts](/Users/mstraw/Documents/GitHub/Herpetarium/scripts/test-validation.ts)

### 5.4 30-Game Side-Balance Pilot
Run by upgrading [scripts/run-30game-arena.ts](/Users/mstraw/Documents/GitHub/Herpetarium/scripts/run-30game-arena.ts):
- 8 coaches
- 4 sprints
- 2 training pairing batches per sprint
- role swap on every pairing
- `LONGFORM_ARENA_RULES`
- anchors enabled for every proposal
Primary readouts:
- `amberWinRate`
- `blueWinRate`
- `sideGap`
- `meanRoundsPerMatch`
- `commitRate`
- `multiModuleCommitRate`
- `nonClueModuleTouchRate`
Success criteria:
- `sideGap <= 0.10`
- `meanRoundsPerMatch >= 4.5`
- commit rate varies with anchor evidence
- at least `30%` of committed bundles touch `executionGuidance` or `deliberationScaffold`

### 5.5 100-Game Next-Phase Ladder
Run `g10`, `g30`, and `g100` with the next-phase loop enabled.
Primary readouts:
- `rollbackReviewCoverage`
- `anchorCorrelationWithNextSprintWinRate`
- `complexityDeltaCorrelationWithOwnDecodeRate`
- `policyConflictRate`
- `cleanMatchRate`
- `frontierSize`
Success criteria:
- `rollbackReviewCoverage = 1.0` for eligible patches
- `anchorCorrelationWithNextSprintWinRate > 0.25`
- `cleanMatchRate >= 0.90`
- policy conflicts are visible in persisted artifacts

### 5.6 Old Loop vs New Loop A/B
Conditions:
- `loop_v1`: current single-shot autopsy, 4-module genome
- `loop_v2`: evaluator + proposal/review + anchors + bundles + 6-module genome
Controls:
- same model
- same seed genome family
- same training schedule
- same anchor library
- same longform rules if the goal is loop comparison rather than game-rule comparison
Replications:
- 3 arena IDs per condition
Hypotheses:
- `loop_v2` commit rate is more evidence-sensitive
- `loop_v2` mutates a wider module distribution
- `loop_v2` improves external anchor movement even if closed-pool win rates stay noisy
- `loop_v2` reduces the “complexity up, own decode down” pattern
Success criteria:
- `commitRateWhenAnchorPositive - commitRateWhenAnchorNegative >= 0.20`
- `nonClueModuleTouchRate >= 0.40`
- `meanRoundsPerMatch >= 4.5`
- `sideGap <= 0.10`
- `rollbackReviewCoverage = 1.0`

### 5.7 Metrics to Keep Tracking After Launch
- training win rate, anchor win rate, own decode rate, opponent intercept rate against us
- our intercept rate, catastrophic asymmetry rate, deliberation consensus rate, deliberation timeout rate
- leakage score, side gap, genome complexity, compiled prompt complexity
- commit rate, multi-module commit rate, rollback review coverage, policy conflict rate

### 5.8 Failure Criteria That Should Stop Rollout
- `sideGap > 0.15` even after real role-swapped batches
- longform rules increase cost without materially increasing rounds
- coach prompt packets get so large that parse failures spike
- anchor library produces near-zero variance across lineages
- patch bundles collapse into “edit everything every sprint”

## 6. RISKS AND TRADEOFFS
- **Higher cost and latency.** Side swaps and anchor A/B increase compute. Mitigation: small anchor batches, only run anchors when a patch is proposed, cap longform matches at `12` rounds.
- **Metric Goodharting.** A richer evidence packet can become a proxy target. Mitigation: show multiple panels, not one score; keep policy notices advisory.
- **Over-structuring the coach.** Proposal/review orchestration can accidentally turn the coach into a form filler. Mitigation: structure only the envelope; keep genome content and rationales freeform.
- **Compiler overreach.** Role slicing could smuggle in a hidden theory of good play. Mitigation: compiler only projects genome text; it does not invent strategy.
- **Rollback ambiguity.** Freeform rollback triggers may be too vague to evaluate. Mitigation: allow optional structured hints and explicit `insufficient_data`.
- **Anchor overfitting.** Fixed anchors can become a local meta. Mitigation: keep training and anchor reports separate and rotate anchors only between seasons.
- **Game drift.** Longform rules are not standard Decrypto. Mitigation: keep classic rules for UI and classical tournaments; treat longform as arena evaluation mode.
- **Prompt bloat from the broader genome.** Mitigation: pair new modules with role-specific compiler output and track compiled prompt complexity from sprint 1.
- **Landing too much at once.** Mitigation: ship schema, then evidence, then coach behavior, then aftercare/UI in stages.

The implementation is correct if the coach still makes the tactical decision, but now decides while seeing how it executed, how it leaked, how it behaved by side, how the candidate compares to the incumbent on frozen anchors, and whether its own rollback triggers already fired.
