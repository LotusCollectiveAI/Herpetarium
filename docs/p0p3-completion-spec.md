# Herpetarium Phases 0-3 Completion Spec
Status: implementation spec
Audience: server/runtime owners working in the current Herpetarium codebase
Baseline branch state: code as inspected on 2026-04-03
Primary files inspected:
- `server/genomeCompiler.ts`; `server/coachLoop.ts`; `server/headlessRunner.ts`
- `server/arena.ts`; `server/coachPrompts.ts`; `server/sprintEvaluator.ts`
- `server/transcriptAnalyzer.ts`; `server/researchAnalyzer.ts`; `server/disclosure.ts`
- `server/seriesRunner.ts`; `server/storage.ts`; `server/matchmaking.ts`
- `server/routes.ts`; `shared/schema.ts`
Current-state anchors used in this spec:
- `server/genomeCompiler.ts` already compiles per-role prompts from the six freeform genome modules.; `server/coachLoop.ts:1273-1306` still builds one monolithic system prompt per team via `buildGenomeSystemPrompt()`.; `server/headlessRunner.ts:212-361` still routes the same `teamSystemPrompts?.[team]` string to clueing, guessing, and interception.
- `server/headlessRunner.ts:476-542` still uses the same team-level prompt for both deliberation phases.; `server/arena.ts:130-140` defines `createIncompleteAnchorReport()`.; `server/arena.ts:1023-1039` still passes the incomplete anchor stub into `coachCommitReview()`.
- `server/sprintEvaluator.ts:352-376` produces nine aggregate evidence lines and nothing match-specific.; `shared/schema.ts:936-952` defines `SearchPolicy`, but the field is not read anywhere outside persistence.; `shared/schema.ts:1045-1058` defines `AnchorABReport`, but only win-rate fields exist today.
- `shared/schema.ts:1070-1083` defines `SprintEvaluation`, but it has no `perMatchSummaries`.; `server/disclosure.ts` currently renders a flat FOIA text dump of all six modules and nothing else.; `shared/schema.ts` currently does not contain a `DisclosureArtifact` type despite the project note saying it is partially defined.
Non-goals for this document:
- Do not redesign the Decrypto game engine.; Do not change the classic interactive UI game path.; Do not replace LLM coach judgment with deterministic commit gates.
- Do not introduce structured schemas into player clueing, guessing, interception, or deliberation outputs.; Do not refactor the entire arena architecture just to satisfy these phases.
## 1. EXECUTIVE SUMMARY
Phases 0-3 should be finished by wiring the already-built role compiler into the arena runtime, replacing the fake anchor stub with a real seeded A/B evaluator, giving arena slots persistent scratch notes and match-level evidence, and then layering richer disclosure, cross-slot intelligence, and operative `SearchPolicy` guidance on top of the existing coach loop. The implementation should stay close to the current call graph: `server/coachLoop.ts` continues to schedule headless matches, `server/headlessRunner.ts` remains the only place that decides which prompt a player action sees, `server/arena.ts` remains the sprint orchestrator, `server/sprintEvaluator.ts` remains the deterministic evaluator, and `server/coachPrompts.ts` remains the only place that turns evidence into coach-facing prompt text. The product remains LLM judgment; these changes increase the quality and granularity of the evidence packet without converting coach decisions into mechanical rules.
## 2. DESIGN PRINCIPLES
- Keep the locus of intelligence in the coach prompts, not in deterministic veto code.; Treat every new metric as evidence for the coach, not as an automatic pass/fail threshold.; Prefer raw but concise match evidence over additional aggregate scoring layers.
- Preserve freeform genome modules as full narrative rewrites.; Preserve freeform player outputs for clues, guesses, and deliberation.; Keep the classic UI path unchanged.
- Limit runtime plumbing changes to arena/headless execution paths.; Reuse existing types and tables when they already fit.; When existing tables do not fit semantically, add the smallest new field necessary instead of forcing an awkward reuse.
- Preserve backward compatibility on internal function signatures where possible during rollout.; Favor additive changes in `shared/schema.ts` because most persistence fields are JSONB-backed already.; Avoid creating a second evaluation pipeline for anchors; reuse `runHeadlessMatch()` and the existing deterministic sprint metrics.
- Make side-swapped seeds reproducible and auditable.; Keep prompt selection explicit at the action site.; Reduce prompt size where specialization is already available.
- Persist the same evidence that the coach saw whenever practical.; If a new field is advisory, name it that way in prompts and comments.; Keep per-match summaries short enough to fit in coach prompts without truncating the rest of the evidence packet.
- Use delayed disclosure and delayed cross-slot learning to preserve discovery pressure.; Do not let “meta-evolution” become a rigid controller; `SearchPolicy` should bias prompt framing, not hard-code outcomes.; Ship in dependency order so each later phase can rely on real runtime evidence from earlier phases.
## 3. CHANGES BY PRIORITY
## P0-A. Wire Compiled Prompts Into Arena Runtime
### What and Why
- The compiler in `server/genomeCompiler.ts` already partitions the six-module genome by role.; The arena runtime currently throws that work away.; `runCoachSprint()` still calls `buildGenomeSystemPrompt()` and hands one full-genome prompt to every player action on a team.
- This means cluegivers, guessers, interceptors, and deliberators all see irrelevant module text.; It inflates prompt cost.; It muddies responsibility boundaries between roles.
- It makes the `compiledPromptChars` metric partially meaningless because the runtime does not use those compiled prompts.; Phase 0 is not complete until the runtime actually consumes the compiled artifacts.
### Current Code References
- `server/genomeCompiler.ts`:; `compileGenomePrompts(genome)` returns `CompiledGenomePrompts`.; `ROLE_MODULES` already defines the intended mapping:
- `cluegiver` gets `cluePhilosophy`, `riskTolerance`, `executionGuidance`.; `own_guesser` gets `memoryPolicy`, `executionGuidance`.; `interceptor` gets `opponentModeling`, `riskTolerance`, `executionGuidance`.
- `own_deliberator` gets `deliberationScaffold`, `executionGuidance`.; `intercept_deliberator` gets `deliberationScaffold`, `opponentModeling`, `executionGuidance`.; `server/coachLoop.ts:326-341`:
- `buildGenomeSystemPrompt()` concatenates all six modules into one monolithic prompt.; `server/coachLoop.ts:1285-1293`:; `runCoachSprint()` creates `teamSystemPrompts` as `Record<string, string>`.
- `server/headlessRunner.ts:239`:; clue generation receives `systemPromptOverride: teamSystemPrompts?.[team]`.; `server/headlessRunner.ts:311`:
- guess generation receives the same team-level override.; `server/headlessRunner.ts:361`:; interception receives the same team-level override.
- `server/headlessRunner.ts:490-521`:; both deliberation template builders receive the same team-level override.; `server/headlessRunner.ts:542`:
- the actual deliberation AI call also receives the same team-level override.
### Target Behavior
- Arena/headless matches should accept role-specific prompt bundles per team.; Each action should consume only the relevant compiled role prompt.; The monolithic prompt path should remain available as a fallback.
- The classic UI path should remain untouched.; Existing series/tournament callers should continue to work during rollout.; Compiled prompts should be optional at the headless runner boundary.
- If no compiled prompts are provided for a team, the runner should use the monolithic team override if present.; If neither compiled prompts nor monolithic override is provided, the runner should fall back to the prompt strategy default already in `promptStrategies`.
### How
#### Shared Types
- Move `MatchmakingBucket` into `shared/schema.ts`.; Rationale:; later phases need the same type in `matches`, `HeadlessMatchConfig`, and evaluation summaries.
- Add new prompt override types in `shared/schema.ts`:
```ts
export type TeamId = "amber" | "blue";
export interface HeadlessTeamPromptOverrides {
  monolithicSystemPrompt?: string;
  compiledPrompts?: CompiledGenomePrompts;
}
export interface HeadlessPromptOverrides {
  amber?: HeadlessTeamPromptOverrides;
  blue?: HeadlessTeamPromptOverrides;
}
```
- Extend `HeadlessMatchConfig` in `shared/schema.ts`:
```ts
export interface HeadlessMatchConfig {
  // existing fields...
  promptOverrides?: HeadlessPromptOverrides;
  matchmakingBucket?: MatchmakingBucket;
}
```
- Do not remove any existing `HeadlessMatchConfig` fields in this pass.
#### Headless Runner Prompt Resolution
- Add a helper in `server/headlessRunner.ts`:
```ts
function resolveRoleSystemPrompt(
  overrides: HeadlessPromptOverrides | undefined,
  team: TeamId,
  role: Exclude<PromptRole, "coach">,
): string | undefined
```
- Resolution order should be:; `overrides?.[team]?.compiledPrompts?.prompts[role].systemPrompt`; `overrides?.[team]?.monolithicSystemPrompt`
- `undefined`; Add a second helper in `server/headlessRunner.ts`:
```ts
function resolveDeliberationPromptRole(
  phase: DeliberationContext["phase"],
): "own_deliberator" | "intercept_deliberator"
```
- Route each action to its role:; `processClues()` -> `cluegiver`; `processGuesses()` -> `own_guesser`
- `processInterceptions()` -> `interceptor`; `processDeliberation()` own phase -> `own_deliberator`; `processDeliberation()` intercept phase -> `intercept_deliberator`
- Replace all current `teamSystemPrompts?.[team]` reads with role-specific resolution.; Specific call-site changes:; `server/headlessRunner.ts:239`
- replace `systemPromptOverride: teamSystemPrompts?.[team]`; with `systemPromptOverride: resolveRoleSystemPrompt(promptOverrides, team, "cluegiver")`; `server/headlessRunner.ts:311`
- replace with role `"own_guesser"`; `server/headlessRunner.ts:361`; replace with role `"interceptor"`
- `server/headlessRunner.ts:490`; own deliberation template receives role `"own_deliberator"`; `server/headlessRunner.ts:521`
- intercept deliberation template receives role `"intercept_deliberator"`; `server/headlessRunner.ts:542`; actual deliberation system prompt resolves by phase-specific role
#### Headless Runner Signature
- Keep backward compatibility for one pass.; Recommended transition signature:
```ts
export async function runHeadlessMatch(
  config: HeadlessMatchConfig,
  scratchNotesMap?: Record<string, string>,
  legacyTeamSystemPrompts?: Record<string, string>,
  healthTracker?: ModelHealthTracker,
): Promise<HeadlessResult>
```
- Inside `runHeadlessMatch()`, normalize legacy team prompts into `config.promptOverrides` if the new field is absent.; That allows:; `seriesRunner` to keep working unchanged initially.
- any other internal caller to keep working while arena is migrated.; Add a local normalizer:
```ts
function normalizePromptOverrides(
  config: HeadlessMatchConfig,
  legacyTeamSystemPrompts?: Record<string, string>,
): HeadlessPromptOverrides | undefined
```
- This shim is transitional.; The arena path should use `config.promptOverrides` directly.
#### Coach Loop Wiring
- In `server/coachLoop.ts`, keep `buildGenomeSystemPrompt()` as the legacy fallback.; Do not delete it in P0.; Arena/headless should use compiled prompts when available.
- Extend `CoachSprintEnvironment`:
```ts
export interface CoachSprintEnvironment {
  opponentRunId?: string;
  opponentGenome: GenomeModules;
  disclosureText?: string;
  matchmakingBucket?: MatchmakingBucket;
  seedTag?: string;
  teamSequence?: Team[];
  matchConfigOverrides?: Array<Partial<HeadlessMatchConfig>>;
}
```
- Rationale:; current `matchmakingBucket` in `runPairedCoachMatches()` is being used as a seed suffix string, not as the actual bucket.; split seed construction from real bucket semantics now.
- In `runCoachSprint()`:; compile the focal genome once per sprint call:
```ts
const ownCompiledPrompts = compileGenomePrompts(state.genome);
const opponentCompiledPrompts = compileGenomePrompts(opponentGenome);
```
- For each scheduled match:; determine `ourTeam` as today.; create `HeadlessPromptOverrides` instead of `Record<string, string>`.
- map team sides to compiled prompt bundles.; preserve a monolithic fallback string in the same structure for safety during rollout.
Example:
```ts
const promptOverrides: HeadlessPromptOverrides = ourTeam === "amber"
  ? {
      amber: {
        compiledPrompts: ownCompiledPrompts,
        monolithicSystemPrompt: buildGenomeSystemPrompt(state.genome),
      },
      blue: {
        compiledPrompts: opponentCompiledPrompts,
        monolithicSystemPrompt: buildGenomeSystemPrompt(opponentGenome),
      },
    }
  : {
      amber: {
        compiledPrompts: opponentCompiledPrompts,
        monolithicSystemPrompt: buildGenomeSystemPrompt(opponentGenome),
      },
      blue: {
        compiledPrompts: ownCompiledPrompts,
        monolithicSystemPrompt: buildGenomeSystemPrompt(state.genome),
      },
    };
```
- Pass that through `HeadlessMatchConfig.promptOverrides`.; Stop passing `teamSystemPrompts` from `runCoachSprint()` after the shim is in place.; Update seed generation:
- use `env.seedTag` if present.; otherwise use actual `env.matchmakingBucket`.; otherwise use current sprint/match fallback.
#### Arena Wiring
- `server/arena.ts` should not compile prompts itself for training match execution.; Let `runCoachSprint()` own that concern.; `server/arena.ts` should keep calling `compileGenomePrompts(genomeBefore)` for evaluation complexity metrics because `evaluateSprint()` already accepts `compiledPrompts`.
- In `runPairedCoachMatches()`:; pass `matchmakingBucket: pairing.bucket` through `matchConfigOverrides`.; pass a distinct `seedTag` string for deterministic seed naming.
- Example shape per first match override:
```ts
{
  seed: `${baseSeedPrefix}-g1`,
  arenaId: config.arenaId,
  runId: left.runId,
  opponentRunId: right.runId,
  sprintNumber,
  matchKind: "training",
  matchmakingBucket: pairing.bucket,
  roleSwapGroupId,
  focalTeam: "amber",
  gameRules,
}
```
#### Match Persistence
- Add `matchmakingBucket` to the `matches` table in `shared/schema.ts`.
```ts
matchmakingBucket: varchar("matchmaking_bucket", { length: 24 }).$type<MatchmakingBucket | null>(),
```
- Persist it in `runHeadlessMatch()` when calling `storage.createMatch()`.
#### Routes
- Update `server/routes.ts` only if any public schema needs the new field.; `HeadlessMatchConfig` is not directly parsed in the arena route today.; `ArenaConfig` already comes through `arenaConfigInputSchema`.
- `matchmakingBucket` is internal.; No route payload change is required for P0-A.
#### Storage
- No new table is required.; `server/storage.ts` insert/update types should pick up the `matches.matchmakingBucket` addition automatically through the generated insert type.
### Validation Criteria
- In an arena training match, clue generation should see the `cluegiver` compiled prompt, not the full six-module prompt.; In an arena training match, own guesses should see the `own_guesser` compiled prompt.; In an arena training match, interceptions should see the `interceptor` compiled prompt.
- In a 3v3 arena training match, own deliberation should see the `own_deliberator` compiled prompt.; In a 3v3 arena training match, intercept deliberation should see the `intercept_deliberator` compiled prompt.; If `promptOverrides.compiledPrompts` is missing for a team but `monolithicSystemPrompt` exists, the runner should still function.
- If neither override exists, the runner should still use the existing prompt strategy default.; `compiledPromptChars` in `SprintEvaluation.complexity` should now describe prompts actually used by the arena runtime.; Classic UI game behavior should remain unchanged because it does not call this headless override path.
### Scope Estimate
- Scope: M; Reason:; runtime plumbing touches three files and one table column.
- behavior change is high impact but localized.; fallback path keeps rollback cost low.
## P0-B. Implement Real Anchor A/B Evaluation
### What and Why
- The review-stage prompt already has an anchor section.; The formatting code in `server/coachPrompts.ts` already knows how to print a real anchor report.; The runtime never generates one.
- `server/arena.ts:1030` always uses `createIncompleteAnchorReport()`.; That means `coachCommitReview()` currently decides blindly.; Phase 0 is not complete until each proposed patch can be compared against the incumbent on a frozen, reproducible anchor set.
### Current Code References
- `server/arena.ts:130-140`; defines the incomplete stub.; `server/arena.ts:1023-1039`
- proposal is created.; incomplete anchor report is created if `proposal.patch` exists.; review receives the stub.
- `server/coachPrompts.ts:260-273`; `formatAnchorReport()` already expects real data.; `shared/schema.ts:1045-1058`
- `AnchorABReport` only tracks win-rate fields today.; `shared/schema.ts:1281-1290`; `anchor_evaluations` table already exists.
- `server/storage.ts:506-519`; storage methods already exist for creating and reading anchor evaluation records.
### Target Behavior
- After `coachProposePatch()` returns a non-null patch bundle:; generate a candidate genome by applying that bundle to the current genome.; run an anchor batch:
- incumbent genome vs frozen anchor opponents; candidate genome vs the same frozen anchor opponents; with identical seeds per anchor/side/replicate
- and role swaps enabled by default; summarize win rate delta, own decode rate delta, and our intercept rate delta; persist per-anchor variant records
- pass the real report to `coachCommitReview()`; let the coach decide; do not add any deterministic veto logic
### How
#### Shared Types
- Extend `AnchorABReport` in `shared/schema.ts`:
```ts
export interface AnchorABPerAnchor {
  label: string;
  seeds: string[];
  incumbentWins: number;
  candidateWins: number;
  incumbentOwnDecodeRate: number;
  candidateOwnDecodeRate: number;
  incumbentOurInterceptRate: number;
  candidateOurInterceptRate: number;
  incumbentMatchIds: number[];
  candidateMatchIds: number[];
  total: number;
}
export interface AnchorABReport {
  incomplete: boolean;
  anchorsUsed: string[];
  incumbentWinRate: number;
  candidateWinRate: number;
  delta: number;
  incumbentOwnDecodeRate: number;
  candidateOwnDecodeRate: number;
  ownDecodeDelta: number;
  incumbentOurInterceptRate: number;
  candidateOurInterceptRate: number;
  ourInterceptDelta: number;
  incumbentMatchIds: number[];
  candidateMatchIds: number[];
  perAnchor: AnchorABPerAnchor[];
}
```
- Preserve existing fields for backward compatibility:; `delta` remains win-rate delta.; `incumbentMatchIds`, `candidateMatchIds`, and `perAnchor` remain present.
- Add new arena config types in `shared/schema.ts`:
```ts
export interface AnchorOpponentSpec {
  label: string;
  genome: GenomeModules;
}
export interface AnchorEvaluationConfig {
  enabled: boolean;
  opponents: AnchorOpponentSpec[];
  gamesPerAnchor: number;
  roleSwap: boolean;
  gameRules?: GameRules;
}
```
- Extend `ArenaConfig`:
```ts
export interface ArenaConfig {
  // existing fields...
  anchorConfig?: Partial<AnchorEvaluationConfig>;
}
```
- Add a default constant in a runtime file, not in `shared/schema.ts`:; keep configuration source of truth in code that owns anchor execution.
#### New File: `server/anchorEvaluator.ts`
- Create a new runtime module with the following exports:
```ts
export interface AnchorBatchInput {
  runId: string;
  sprintNumber: number;
  proposalId: string;
  incumbentGenome: GenomeModules;
  candidateGenome: GenomeModules;
  playerProvider: AIProvider;
  playerModel: string;
  teamSize: 2 | 3;
  config: AnchorEvaluationConfig;
  gameRules: GameRules;
}
export async function runAnchorBatch(
  input: AnchorBatchInput,
): Promise<AnchorABReport>
```
- Internal helpers:
```ts
function resolveAnchorConfig(
  arenaConfig: ArenaConfig,
): AnchorEvaluationConfig
function buildAnchorMatchSeeds(
  runId: string,
  sprintNumber: number,
  proposalId: string,
  anchorLabel: string,
  gamesPerAnchor: number,
  roleSwap: boolean,
): Array<{ seed: string; focalTeam: TeamId }>
function summarizeAnchorVariantMatches(
  matchIds: number[],
  runId: string,
): Promise<{
  winRate: number;
  ownDecodeRate: number;
  ourInterceptRate: number;
}>
```
- Use `compileGenomePrompts()` for both incumbent and candidate.; Use the same prompt plumbing as P0-A.; Use `runHeadlessMatch()` directly rather than re-entering the full coach loop.
- Reason:; anchors are evaluation-only.; they do not need coach proposal/review calls.
- they should not mutate scratch notes.
#### Default Anchors
- Define `DEFAULT_ANCHOR_OPPONENTS` in `server/anchorEvaluator.ts`.; Initial implementation should use a frozen subset of `SEED_GENOME_TEMPLATES`.; Recommended first pass:
- `SEED_GENOME_TEMPLATES.slice(0, 4)`; labels: `seed_1`, `seed_2`, `seed_3`, `seed_4`; This is simple.
- It is reproducible.; It avoids inventing a second source of seed genomes.; Researchers can override it through `ArenaConfig.anchorConfig`.
#### Seed Reproducibility
- Every anchor replicate should be paired by seed across incumbent and candidate.; Example deterministic seed scheme:
```ts
const seed = `${runId}-s${sprintNumber}-${proposalId}-anchor-${label}-g${gameIndex + 1}-${focalTeam}`;
```
- If `roleSwap` is true:; create one seed with focal team amber; create one seed with focal team blue
- For each generated seed:; run incumbent on that seed; run candidate on that same seed
- This controls variance without requiring identical transcripts.
#### Match Persistence
- Use existing `matches` fields:; `matchKind: "anchor"`; `anchorLabel`
- `arenaId`; `runId`; `sprintNumber`
- `roleSwapGroupId` optional if helpful for grouping; `focalTeam`; `gameRules`
- Use existing `anchor_evaluations` table via `storage.createAnchorEvaluation()`.; Persist one record per:; `variant` x `anchorLabel`
- Populate:; `runId`; `sprintNumber`
- `proposalId`; `variant`; `anchorLabel`
- `matchIds`; `summary`; `summary` should contain at least:
- `winRate`; `ownDecodeRate`; `ourInterceptRate`
- `seedCount`; `seeds`; No SQL migration is required for this.
- The `summary` column is already JSONB.
#### Arena Integration
- Remove `createIncompleteAnchorReport()` from active flow.; It may remain as a helper for incomplete data fallback only if anchor execution fails.; In `server/arena.ts`:
- after `proposal` is returned and before `coachCommitReview()`:; if `proposal.patch` is null:; skip anchors
- pass `undefined` as anchor report; if `proposal.patch` exists:; build `candidateGenome` using `applyCoachPatchBundle(sprintState.genome, proposal.patch)`
- resolve anchor config; run `runAnchorBatch()`; capture the report
- set `evaluation.anchor = anchorSummary`; persist the enriched evaluation back to storage; pass the report to `coachCommitReview()`
- Add a storage update method:
```ts
async updateSprintEvaluation(
  runId: string,
  sprintNumber: number,
  evaluation: SprintEvaluation,
): Promise<SprintEvaluationRecord | undefined>
```
- Reason:; `evaluateSprint()` currently inserts the evaluation before anchors exist.; P1 later also enriches the evaluation after initial creation.
- the persisted row should match what the coach actually saw.
#### Coach Prompt Rendering
- Extend `formatAnchorReport()` in `server/coachPrompts.ts` to render the new fields.; Recommended top-level lines:; anchors used
- incumbent win / candidate win / delta; incumbent own decode / candidate own decode / delta; incumbent intercept / candidate intercept / delta
- match ids; For each per-anchor entry, render:; label
- wins incumbent vs candidate; decode incumbent vs candidate; intercept incumbent vs candidate
- total seeds; Keep wording explicitly advisory:; do not use language like “must revert”.
- do use language like “anchor evidence”.
#### Routes
- Extend `arenaConfigInputSchema` in `server/routes.ts`:
```ts
anchorConfig: z.object({
  enabled: z.boolean().optional(),
  opponents: z.array(z.object({
    label: z.string().min(1),
    genome: genomeModulesSchema,
  })).optional(),
  gamesPerAnchor: z.number().int().min(1).max(10).optional(),
  roleSwap: z.boolean().optional(),
  gameRules: gameRulesSchema.optional(),
}).optional(),
```
- Extend `validationConfigInputSchema` the same way if validation routes should exercise anchors.; If omitted, use runtime defaults.
### Validation Criteria
- A patch proposal with `proposal.patch !== null` should generate a non-incomplete anchor report unless anchor execution fails.; The same proposal run twice with the same run id, sprint number, proposal id, and anchor config should generate the same anchor seed set.; Incumbent and candidate variants should use the same seeds and opponent genomes.
- Anchor matches should be queryable through `/api/coach/:id/anchors`.; `coach_sprints.anchorSummary` should contain the real report.; `sprint_evaluations.evaluation.anchor` should match the report after the storage update call.
- `coachCommitReview()` should receive real anchor data.; No code path should auto-revert or auto-commit based on the report.
### Scope Estimate
- Scope: M; Reason:; new file
- additive config; reuses existing tables and storage methods; one prompt formatter update
- no new engine abstractions
## P1-A. Enable Player Scratch Notes In Arena Mode
### What and Why
- Arena players are currently stateless between games.; Series mode already has note persistence and post-game reflection.; Headless runtime already knows how to inject scratch notes into prompts.
- Arena does not currently feed those notes in or collect reflections back out.; This means arena coaches are training players that never accumulate local tactical memory.; The goal is not to create a second coach.
- The goal is to preserve lightweight player memory across games within a slot.
### Current Code References
- `server/headlessRunner.ts:216`, `282`, `337`, `535-539`; clueing, guessing, interception, and deliberation already accept scratch notes.; `server/seriesRunner.ts`
- fetches note text from storage; passes `scratchNotesMap` to `runHeadlessMatch()`; calls `generateReflection()` after each game
- writes notes to `scratch_notes`; `server/ai.ts:734-818`; `ReflectionParams`
- `buildReflectionPrompt()`; `generateReflection()`; already exist and are usable.
- `shared/schema.ts:720-732`; `scratch_notes` is keyed by `seriesId` and `playerConfigHash`.; That table is semantically tied to series mode, not coach runs.
### Design Decision
- Do not reuse `scratch_notes` for arena slot memory.; Reason:; `seriesId` is required and integer-backed.
- arena slots are naturally keyed by `coach_runs.id`.; arena notes are per slot, not per player config hash.; forcing coach runs into `series` would create misleading data and odd lifecycle coupling.
- Use run-level scratch note state instead.
### Target Behavior
- Each arena slot owns one shared note store.; The note store follows the slot across sides.; If the slot plays as amber, its notes are injected on amber.
- If the slot plays as blue, its notes are injected on blue.; Opponent slots should also receive their own notes in the same headless match.; After every training match, both teams can reflect and update their note store.
- The updated notes should be available to the next training match in the same slot.; The coach should see the accumulated slot notes in its evidence packet.
### How
#### New Types
- Add in `shared/schema.ts`:
```ts
export interface ScratchNotesSnapshot {
  notesText: string;
  tokenCount: number;
  lastUpdatedMatchId?: number;
  lastUpdatedSprint?: number;
}
```
- Extend `CoachPromptEnvironment`:
```ts
export interface CoachPromptEnvironment {
  opponentGenome?: GenomeModules;
  disclosureText?: string;
  matchmakingBucket?: string;
  researcherPolicy?: ResearcherPolicyThresholds;
  arenaId?: string;
  scratchNotes?: string;
}
```
- Extend `HeadlessMatchConfig`:
```ts
export interface HeadlessMatchConfig {
  // existing fields...
  scratchNotesByTeam?: Partial<Record<TeamId, string>>;
  enablePostMatchReflection?: boolean;
  reflectionTokenBudget?: number;
}
```
- Extend `HeadlessResult` in `shared/schema.ts` or local result type definition if it lives elsewhere:
```ts
updatedScratchNotes?: Partial<Record<TeamId, ScratchNotesSnapshot>>;
```
- Extend `SprintResult` in `server/coachLoop.ts`:
```ts
finalScratchNotesByTeam?: Partial<Record<Team, ScratchNotesSnapshot>>;
```
#### DB Changes
- Add `currentScratchNotes` to `coach_runs`:
```ts
currentScratchNotes: jsonb("current_scratch_notes").$type<ScratchNotesSnapshot | null>(),
```
- Add `scratchNotesSnapshot` to `coach_sprints`:
```ts
scratchNotesSnapshot: jsonb("scratch_notes_snapshot").$type<ScratchNotesSnapshot | null>(),
```
- SQL migration:
```sql
ALTER TABLE coach_runs
ADD COLUMN current_scratch_notes JSONB;
ALTER TABLE coach_sprints
ADD COLUMN scratch_notes_snapshot JSONB;
```
- No backfill is required.; Existing rows can remain null.
#### Headless Runner Reflection Flow
- Add a helper in `server/headlessRunner.ts`:
```ts
async function buildUpdatedScratchNotes(
  game: GameState,
  matchId: number,
  gameId: string,
  config: HeadlessMatchConfig,
): Promise<Partial<Record<TeamId, ScratchNotesSnapshot>>>
```
- Behavior:; if `enablePostMatchReflection` is false or absent:; return empty object
- otherwise:; for each team with at least one AI player:; choose the first AI player's config as the reflection model
- read `config.scratchNotesByTeam?.[team]` as `currentNotes`; build `ReflectionParams`; call `generateReflection()`
- log the reflection AI call; return `ScratchNotesSnapshot`; Move the reflection AI logging helper out of `server/seriesRunner.ts` into a shared location.
- Simplest implementation:; copy `logReflectionCall()` into `server/headlessRunner.ts`; later cleanup can deduplicate if desired
- Reuse the existing `generateReflection()` prompt unchanged in P1.; Rationale:; the prompt is already aligned with “update your strategic notes based on this game”.
#### Headless Runner Prompt Injection
- In `processClues()`, `processGuesses()`, `processInterceptions()`, and `processDeliberation()`:; first look for `config.scratchNotesByTeam?.[team]`; then fall back to the legacy `scratchNotesMap` if still present
- This allows series mode to keep working while arena migrates to the new config field.
#### Coach Loop
- Extend `CoachSprintEnvironment`:
```ts
export interface CoachSprintEnvironment {
  // existing fields...
  teamScratchNotes?: Partial<Record<Team, string>>;
  enablePostMatchReflection?: boolean;
  reflectionTokenBudget?: number;
}
```
- In `runCoachSprint()`:; pass `scratchNotesByTeam`, `enablePostMatchReflection`, and `reflectionTokenBudget` through `HeadlessMatchConfig`; after each `runHeadlessMatch()` call:
- capture `result.updatedScratchNotes`; merge them into a local `finalScratchNotesByTeam`; return them as part of `SprintResult`
- Because arena pair execution already calls `runCoachSprint()` with `matchesPerSprint: 1`, no new intra-sprint sequencing logic is required inside `runCoachSprint()` for P1.; This is important:; do not accidentally widen the scope into a standalone multi-match note scheduler.
#### Arena Runtime State
- Extend `ArenaRuntimeSlot` in `server/arena.ts`:
```ts
interface ArenaRuntimeSlot {
  slotIndex: number;
  runId: string;
  seedGenome: GenomeModules;
  state: CoachState;
  scratchNotes: ScratchNotesSnapshot | null;
  wins: number;
  losses: number;
  draws: number;
}
```
- Initialize `scratchNotes` from `coach_runs.currentScratchNotes` when resuming from storage.; Initialize to `null` for new runs.
#### Arena Pair Execution
- Update `runPairedCoachMatches()` to thread notes through both side-swapped games.; First match:; left slot plays amber
- pass:; amber notes = `left.scratchNotes?.notesText`; blue notes = `right.scratchNotes?.notesText`
- After first match:; update temporary note snapshots from `firstResult.finalScratchNotesByTeam`; left gets amber snapshot
- right gets blue snapshot; Second match:; left slot plays blue
- pass:; amber notes = updated right notes; blue notes = updated left notes
- After second match:; left gets blue snapshot; right gets amber snapshot
- Add the final snapshots to `PairingResult`:
```ts
interface PairingResult {
  // existing fields...
  scratchNotesAfterA?: ScratchNotesSnapshot | null;
  scratchNotesAfterB?: ScratchNotesSnapshot | null;
}
```
- After pairing settlement, update each slot’s in-memory `scratchNotes`.
#### Coach Evidence Packet
- Add accumulated notes to the proposal prompt environment:
```ts
const promptEnv = {
  arenaId: config.arenaId,
  disclosureText: ...,
  matchmakingBucket: ...,
  opponentGenome: ...,
  scratchNotes: slot.scratchNotes?.notesText,
};
```
- In `server/coachPrompts.ts`, extend `formatEnvironment()`:; if `env.scratchNotes` exists:; print a `Scratch Notes:` section
- include the full note text; Keep this in the environment section, not in the metric section.; Notes are raw intelligence, not evaluated metrics.
#### Persistence
- Update `persistArenaRunProgress()`:; store `currentScratchNotes` on `coach_runs`; Update `persistArenaSprintRecord()`:
- store `scratchNotesSnapshot` on `coach_sprints`; Update `toCoachRunRecord()` and `toCoachSprintRecord()` if those public shapes should expose notes.; Recommended:
- expose `scratchNotesSnapshot` on the sprint record; expose `currentScratchNotes` on the run record
### Validation Criteria
- A two-game side-swapped arena pairing should inject empty notes on game 1 and non-empty notes on game 2.; The second match in a side-swapped pair should receive the note text written after the first match.; After a sprint completes, `coach_runs.currentScratchNotes` should be non-null for slots that played at least one match.
- `coach_sprints.scratchNotesSnapshot` should store the end-of-sprint note state.; The proposal-stage coach prompt should include the accumulated notes.; If reflections fail, the previous notes should remain unchanged rather than being cleared.
- Series mode should still work via the legacy scratch note path until it is explicitly migrated.
### Scope Estimate
- Scope: M; Reason:; reuses existing reflection prompt and headless prompt injection
- needs small DB migration; needs careful side-swap note threading in `server/arena.ts`
## P1-B. Surface Per-Match Evidence To Coach Prompts
### What and Why
- The deterministic evaluator already computes solid aggregates.; The coach is still under-informed because it does not see which specific matches were fragile.; `server/transcriptAnalyzer.ts` and `server/researchAnalyzer.ts` already produce match-level raw material.
- That evidence should be surfaced directly to the coach in concise per-match mini-summaries.; This is exactly the kind of “more raw data, less compression” change that the design constraints ask for.
### Current Code References
- `server/sprintEvaluator.ts:379-422`; builds `SprintEvaluation`; includes only aggregate metrics and `evidenceLines`
- `server/transcriptAnalyzer.ts`; `analyzeMatchTranscripts(matchId)` returns per-transcript leakage scores, qualitative tags, and signal counts; `server/researchAnalyzer.ts:716-800`
- `analyzeSprintMatches(matchIds, team)` returns:; `deceptionReports`; `deliberationPatterns`
- aggregate deception; aggregate patterns; `shared/schema.ts:1070-1083`
- `SprintEvaluation` has no per-match summary field today
### Target Behavior
- Every sprint evaluation should include one concise match summary per match.; Each summary should tell the coach:; who the opponent was
- which bucket the match came from; whether the focal team won, lost, or drew; how many rounds the match ran
- own decode success by round; opponent intercepts against us by round; max leakage score
- notable deliberation/deception patterns; The summary should stay short.; Cap it at two to three lines per match.
- Do not paste raw transcripts into the proposal prompt.
### How
#### Shared Types
- Add `MatchSummary` to `shared/schema.ts`:
```ts
export interface MatchSummary {
  matchId: number;
  opponentRunId?: string;
  matchKind?: string | null;
  opponentBucket?: MatchmakingBucket | null;
  focalTeam: TeamId;
  outcome: "win" | "loss" | "draw";
  roundsPlayed: number;
  ownDecodeByRound: Array<{ roundNumber: number; correct: boolean }>;
  opponentInterceptByRound: Array<{ roundNumber: number; intercepted: boolean }>;
  maxLeakageScore: number;
  qualitativeTags: string[];
  deliberationPatterns: DeliberationPatternVector;
  deceptionHighlights: string[];
  summaryLines: string[];
}
```
- Extend `SprintEvaluation`:
```ts
export interface SprintEvaluation {
  // existing fields...
  perMatchSummaries: MatchSummary[];
}
```
- This is JSONB-backed in `sprint_evaluations`, so no SQL migration is required for the evaluation payload.
#### Match Bucket Persistence
- Add `matchmakingBucket` to the `matches` table as described in P0-A.; This is required for accurate per-match summaries.; Do not try to infer the bucket later from seed strings.
#### Evaluator Changes
- In `server/sprintEvaluator.ts`, add:
```ts
async function buildPerMatchSummaries(
  matches: Match[],
  rounds: MatchRound[],
  chatter: TeamChatter[],
  input: SprintEvaluationInput,
): Promise<MatchSummary[]>
```
- Implementation plan:; build a `roundsByMatchId` map; build a `chatterByMatchId` map
- build a `focalTeamByMatchId` map using existing `resolveFocalTeam()`; call `analyzeMatchTranscripts(match.id)` once per match and cache the result; group match ids by focal team
- call `analyzeSprintMatches()` once for amber-group ids and once for blue-group ids; map `deceptionReports` and `deliberationPatterns` back to each match; Keep the implementation straightforward.
- It is acceptable to call `analyzeMatchTranscripts()` per match in the first pass.; The dominant runtime cost in the arena is model calls, not these DB reads.
#### Summary Content Rules
- `summaryLines[0]`:; `Match 1843 | bucket novelty | loss | side blue | 7 rounds | opponent run abc123`; `summaryLines[1]`:
- `Own decode: R1 hit, R2 miss, R3 hit, R4 hit, R5 miss, R6 hit, R7 hit. Opponent intercept against us: R1 clean, R2 clean, R3 picked, ...`; `summaryLines[2]`:; `Leakage max 1.50. Deliberation patterns: hedge 0.18, disagreement 0.25, revision 0.12. Highlights: selective omission 0.50; keyword mention; direct code references.`
- Cap `qualitativeTags` and `deceptionHighlights` to the most informative two or three items.; Prefer concrete findings over generalized prose.
#### Prompt Formatting
- Add a formatter in `server/coachPrompts.ts`:
```ts
function formatPerMatchSummaries(evaluation: SprintEvaluation): string
```
- Render:; each match as a numbered block; lines from `summaryLines`
- no transcript dumps; Update `formatEvaluation()`:; include a `### Per-Match Summaries` section after aggregate evidence lines
- keep aggregate sections first; Update `buildProposalSystemPrompt()`:; no further prompt API changes are needed if `formatEvaluation()` already includes the summaries
#### Evaluation Persistence
- `evaluateSprint()` should populate `perMatchSummaries` before writing the initial evaluation record.; After P0-B anchor enrichment and pending-review refreshes occur in `server/arena.ts`, the new `updateSprintEvaluation()` storage method should overwrite the persisted evaluation so it remains identical to coach-visible evidence.
#### Routes
- No new routes are required.; Existing evaluation endpoints will return the richer payload automatically.
### Validation Criteria
- Every `SprintEvaluation` record should contain `perMatchSummaries.length === training.matchIds.length`.; Each summary should have exactly the focal team’s decode/intercept traces, not both teams mixed together.; The bucket in each summary should match the `matches.matchmakingBucket` column.
- The max leakage score should match the max focal-team transcript leakage in `analyzeMatchTranscripts()`.; Proposal prompts should include a per-match section with two to three lines per match.; Prompt length should remain acceptable for the typical arena sprint.
### Scope Estimate
- Scope: M; Reason:; uses already-existing analyzers
- needs one new shared type; one new match column; one prompt formatter
## P2-A. Tiered Disclosure (Patch Cards, Exemplar Clues, Delayed Dossier)
### What and Why
- Current disclosure is a text wall.; `server/disclosure.ts` currently emits:; header
- “Current opponent genome modules”; all six raw module texts; This is low-signal and too complete too early.
- The richer ecology described in the project note requires structured, staged artifacts.
### Current Code References
- `server/disclosure.ts`; only `buildDisclosureText(genome)` exists; `server/arena.ts:320-331`
- `buildDisclosureBundle()` deduplicates genomes and concatenates `buildDisclosureText()`; `shared/schema.ts`; there is no `DisclosureArtifact` type in the inspected codebase
- `coach_sprints.disclosureText` already exists and is persisted by `persistArenaSprintRecord()`
### Target Behavior
- Replace immediate full-genome disclosure with three artifact classes:; patch cards; exemplar clues
- delayed dossier; Patch cards:; short summary of what the opponent changed last sprint and why
- Exemplar clues:; two or three real clue sets that illustrate style; Delayed dossier:
- the full six-module genome text only after the configured delay; Coaches should see actionable intelligence first.; Full-text disclosure should become the delayed, heavy artifact.
### How
#### New Shared Types
- Add `DisclosureArtifact` to `shared/schema.ts`.; Note:; this type is absent in the current repo state and must be created fresh.
```ts
export type DisclosureArtifactType =
  | "patch_card"
  | "exemplar_clue"
  | "delayed_dossier";
export interface DisclosureArtifact {
  type: DisclosureArtifactType;
  title: string;
  body: string;
  sourceRunId?: string;
  sourceSprint?: number;
}
```
- Do not add a DB column in P2-A.; Continue persisting the rendered disclosure string in `coach_sprints.disclosureText`.; This keeps the first implementation small.
#### Disclosure Builder API
- Replace the current single function in `server/disclosure.ts` with:
```ts
export interface DisclosureBuildInput {
  opponentRunId: string;
  currentSprint: number;
  foiaEnabled: boolean;
  foiaDelaySprints: number;
  latestOpponentSprint?: CoachSprint;
  exemplarClues: string[];
  currentGenome: GenomeModules;
}
export function buildDisclosureArtifacts(
  input: DisclosureBuildInput,
): DisclosureArtifact[]
export function renderDisclosureArtifacts(
  artifacts: DisclosureArtifact[],
): string
export function buildDisclosureText(
  input: DisclosureBuildInput,
): string
```
- `buildDisclosureText()` becomes a wrapper over artifacts plus renderer.
#### Artifact Construction Rules
- Patch card:; if the opponent has a latest sprint with `proposal.patch` or `patchBundle`; use:
- proposal summary; affected modules; expected effect
- if review exists, append commit/revert result; Example body:; `Sprint 6 committed edits to executionGuidance and riskTolerance to raise own decode reliability while keeping clue pressure stable.`
- Exemplar clues:; sample from actual `match_rounds.clues`; prefer recent, non-empty clue arrays
- prefer matches from the opponent’s latest completed sprint; cap at two or three entries; include short context:
- round number; whether the opponent decoded correctly; whether it was intercepted
- Delayed dossier:; only include after `currentSprint >= foiaDelaySprints`; body should render the full six module texts
- the old FOIA full dump becomes this artifact only
#### Arena Integration
- Update `buildDisclosureBundle()` in `server/arena.ts`:; stop deduplicating only by genome JSON; instead collect unique opponent runs
- for each opponent run, gather:; latest opponent sprint record; exemplar clues from opponent match ids
- current opponent genome; then call `buildDisclosureArtifacts()`; The current helper should become:
```ts
async function buildDisclosureBundle(
  opponents: SprintOpponentContext[],
  foiaEnabled: boolean,
  foiaDelaySprints: number,
  currentSprint: number,
): Promise<string | undefined>
```
- This requires `buildDisclosureBundle()` to become async.; That is acceptable because `server/arena.ts` already runs async code in the sprint loop.
#### Exemplar Clue Collection
- Add a small helper in `server/arena.ts`:
```ts
async function collectExemplarClues(
  runId: string,
  limit = 3,
): Promise<string[]>
```
- Implementation:; fetch latest `CoachSprint` for the opponent run; fetch `matches` and `match_rounds` for those match ids
- determine the opponent’s focal side in each match using `matches.runId`, `matches.opponentRunId`, and `matches.focalTeam`; collect `round.clues` where `round.team` equals the opponent focal team; format clue arrays as human-readable examples
- Keep it simple.; No ranking model is required.; Prefer recency, then successful decode, then clean formatting.
#### Routes and Config
- Keep the existing `foiaEnabled` and `foiaDelaySprints` route fields for this phase.; Do not add a second public disclosure config object unless a later UI pass needs more controls.; Interpret `foiaEnabled` as “disclosure system on”.
- Interpret `foiaDelaySprints` as delayed dossier threshold.
#### Prompt Formatting
- No `CoachPromptEnvironment` schema change is required if disclosure remains rendered as text.; `formatEnvironment()` already prints `Disclosure:`.; The disclosure text just becomes richer and staged.
### Validation Criteria
- Before the disclosure delay, coaches should see patch cards and exemplar clues but not full module dumps.; After the disclosure delay, coaches should see the delayed dossier artifact with full module text.; Patch cards should be grounded in persisted `coach_sprints.proposal` or `patchBundle`.
- Exemplar clues should come from real `match_rounds.clues`, not invented examples.; The disclosure section should be materially shorter and more actionable than the old six-module dump in early sprints.
### Scope Estimate
- Scope: M; Reason:; data already exists
- no SQL migration; main work is gathering and rendering the right artifacts
## P2-B. Cross-Slot Learning
### What and Why
- Arena slots currently only learn from their own games and whatever FOIA/disclosure gives them about opponents.; There is no arena-wide intelligence pass.; This creates unnecessary information silos.
- The goal is not to couple slot decisions mechanically.; The goal is to give every coach a short intelligence briefing about arena-wide movement.
### Target Behavior
- After each arena sprint, build a short briefing summarizing:; which modules are being mutated most; which slots improved or declined most
- which rollback trigger patterns are recurring; optional delayed patch highlights from other slots; The briefing should be available to all coaches on the next sprint’s proposal call.
- The briefing should be advisory.; It should not affect match scheduling or commit logic deterministically.
### How
#### Prompt Environment
- Extend `CoachPromptEnvironment`:
```ts
export interface CoachPromptEnvironment {
  opponentGenome?: GenomeModules;
  disclosureText?: string;
  matchmakingBucket?: string;
  researcherPolicy?: ResearcherPolicyThresholds;
  arenaId?: string;
  scratchNotes?: string;
  arenaBriefing?: string;
}
```
#### Arena Builder
- Add a new helper in `server/arena.ts`:
```ts
async function buildArenaBriefing(
  slots: ArenaRuntimeSlot[],
  sprintNumber: number,
): Promise<string>
```
- Data sources:; `storage.getCoachSprints(runId)` for latest proposal/decision data; `storage.getSprintEvaluations(runId)` for performance change
- `storage.getPatchReviews(runId)` for rollback review outcomes; in-memory slot records for current win/loss totals
#### Briefing Content Rules
- Section 1:; module mutation frequency in the completed sprint; count edits by `targetModule`
- show top three modules; Section 2:; biggest movers
- compare current sprint win rate vs previous sprint win rate; show top improver and top decliner; Section 3:
- rollback trigger patterns; aggregate structured trigger descriptions or metric hints from `patchIndex.delta.rollbackTriggers`; show the most repeated one or two
- Section 4:; delayed successful patch summaries; only surface summaries from other slots at least one sprint later
- only include committed patches; recommended first-pass success heuristic:; patch review status `clear`
- or no trigger fired and next sprint win rate did not decline; Keep the briefing under roughly 12 to 18 lines.
#### Arena Loop Integration
- In `runArena()`:; add `let priorArenaBriefing: string | undefined;`; when constructing `promptEnv` for each slot, include `arenaBriefing: priorArenaBriefing`
- after all slots finish proposal/review/persistence for sprint N:; compute `priorArenaBriefing = await buildArenaBriefing(slots, sprintNumber)`; that briefing becomes input to sprint N+1
- This preserves the requested one-sprint delay for arena-wide learning.
#### Prompt Rendering
- Update `formatEnvironment()` in `server/coachPrompts.ts`:; if `env.arenaBriefing` exists:; print `Arena Briefing:`
- include the text; Proposal prompt is the main consumer.; Review prompt can receive it too via shared environment formatting, which is acceptable.
#### DB Changes
- No DB change is required in the first pass.; The briefing is derived from already-persisted arena state.
### Validation Criteria
- Sprint 1 proposal prompts should not include a briefing.; Sprint 2 proposal prompts should include a briefing based on sprint 1.; The briefing should mention actual edited modules from the prior sprint.
- The briefing should mention actual improving/declining slots based on persisted evaluation data.; Delayed patch highlights should never include the receiving slot’s own patch as an “other slot” highlight.
### Scope Estimate
- Scope: S-M; Reason:; no new storage
- purely derived text; mostly arena orchestration and prompt formatting
## P3. Operative SearchPolicy / Coach Meta-Evolution
### What and Why
- `SearchPolicy` is currently persisted but inert.; That means the system has a stored knob surface with zero behavioral effect.; Phase 3 is not complete until those knobs influence proposal/review framing and can themselves evolve.
### Current Code References
- `shared/schema.ts:936-952`; `SearchPolicy` currently has:; `policyId`
- `commitThreshold`; `rollbackWindowSprints`; `noveltyWeight`
- `conservationWeight`; `evidenceHorizonSprints`; `server/coachLoop.ts:1129`
- run records expose `searchPolicy` through `toCoachRunRecord()`; `server/coachLoop.ts:1559`; new runs are seeded with `DEFAULT_SEARCH_POLICY`
- `server/coachPrompts.ts`; no reference to `SearchPolicy`; `server/arena.ts`
- no reference to `SearchPolicy`
### Design Constraints For P3
- `SearchPolicy` must bias coach behavior, not hard-gate it.; The coach remains the decider.; Meta-evolution should use small, interpretable fields.
- Policy edits should be additive and reviewable.; Policy change should be allowed without forcing a genome patch in the same sprint.
### Target Behavior
- Proposal prompts should show the current search policy.; Review prompts should show it too.; The coach should be allowed to propose a `SearchPolicy` patch alongside a genome patch.
- The runtime should track simple coach meta-metrics so policy edits can be grounded in observed coach performance.; If a policy patch is committed, it should update `coach_runs.searchPolicy` and affect the next sprint.
### How
#### Extend `SearchPolicy`
- Update `shared/schema.ts`:
```ts
export interface SearchPolicy {
  policyId: string;
  commitThreshold: number;
  rollbackWindowSprints: number;
  noveltyWeight: number;
  conservationWeight: number;
  evidenceHorizonSprints: number;
  moduleFocusWeights: Partial<Record<GenomeModuleKey, number>>;
  explorationBias: number;
  proposalComplexityPreference: "decrease" | "neutral" | "increase";
  reviewStrictness: number;
  anchorEvidenceWeight: number;
}
```
- Keep old fields.; Add only the minimum new fields needed to support the requested behavior surface.; Update `DEFAULT_SEARCH_POLICY` accordingly.
- Recommended defaults:; balanced module weights; `explorationBias: 0.35`
- `proposalComplexityPreference: "neutral"`; `reviewStrictness: 0.6`; `anchorEvidenceWeight: 0.5`
- Because `search_policy` is JSONB on `coach_runs`, no SQL migration is required.
#### New Proposal Types
- Extend `CoachProposal` in `shared/schema.ts`:
```ts
export interface CoachForecast {
  winRateDirection: "up" | "flat" | "down";
  ownDecodeDirection: "up" | "flat" | "down";
  ourInterceptDirection: "up" | "flat" | "down";
}
export interface SearchPolicyPatch {
  summary: string;
  rationale: string;
  expectedEffect: string;
  newPolicy: SearchPolicy;
}
export interface CoachProposal {
  proposalId: string;
  beliefUpdates: CoachBeliefUpdate[];
  summary: string;
  hypothesis: string;
  patch: CoachPatchBundle | null;
  forecast?: CoachForecast;
  searchPolicyPatch?: SearchPolicyPatch | null;
  review?: CoachReviewResult;
}
```
- Rationale:; `forecast` gives the system something concrete to score for coach prediction accuracy.; `searchPolicyPatch` lets the coach evolve its own strategy.
- These are coach-side structured fields.; They do not violate the “keep players freeform” rule.
#### Meta-Metric Type
- Add a new type in `shared/schema.ts`:
```ts
export interface CoachMetaMetrics {
  proposalCount: number;
  commitCount: number;
  commitRate: number;
  forecastChecks: number;
  forecastAccuracy: number;
  anchorAgreementChecks: number;
  anchorAgreementRate: number;
  realizedPatchChecks: number;
  realizedPatchSuccessRate: number;
}
```
- Extend `CoachPromptEnvironment`:
```ts
export interface CoachPromptEnvironment {
  // existing fields...
  searchPolicy?: SearchPolicy;
  coachMetaMetrics?: CoachMetaMetrics;
}
```
#### Prompt Formatting
- Add formatter helpers to `server/coachPrompts.ts`:
```ts
function formatSearchPolicy(policy?: SearchPolicy): string
function formatCoachMetaMetrics(metrics?: CoachMetaMetrics): string
```
- Proposal prompt should include:; current search policy; current meta-metrics
- explicit instruction that search policy is advisory and may be patched; Review prompt should include:; current search policy
- proposed search policy patch if present; meta-metrics; Prompt framing examples:
- high `explorationBias`:; “favor bolder hypothesis testing when evidence is mixed”; high `conservationWeight`:
- “prefer smaller edits unless a clear repeated failure mode is visible”; `proposalComplexityPreference: "decrease"`:; “treat simplification as the default unless complexity is clearly buying performance”
- high `reviewStrictness`:; “require stronger evidence before committing, but this is still an advisory bias, not a hard rule”; `commitThreshold` should remain advisory language only.
- Example:; “A commit threshold of 0.75 means default to revert unless evidence and anchor results are convincingly directional.”; Do not write any code that mechanically compares `review.confidence` to `commitThreshold`.
#### Arena Runtime State
- Extend `ArenaRuntimeSlot` in `server/arena.ts`:
```ts
interface ArenaRuntimeSlot {
  slotIndex: number;
  runId: string;
  seedGenome: GenomeModules;
  state: CoachState;
  scratchNotes: ScratchNotesSnapshot | null;
  searchPolicy: SearchPolicy;
  wins: number;
  losses: number;
  draws: number;
}
```
- Initialize from the created or loaded coach run.
#### Proposal and Review Calls
- When building `promptEnv` in `server/arena.ts`, include:; `searchPolicy: slot.searchPolicy`; `coachMetaMetrics: await buildCoachMetaMetrics(slot.runId)`
- Add helper in `server/arena.ts`:
```ts
async function buildCoachMetaMetrics(runId: string): Promise<CoachMetaMetrics>
```
- First-pass metric rules:; `proposalCount`: count `coach_sprints` rows with a non-null proposal; `commitCount`: count proposals whose review decision was commit and actually committed
- `commitRate`: commits / proposals; `forecastChecks`: count committed proposals with both forecast and realized next-sprint metrics available; `forecastAccuracy`: percentage of forecast directions that matched realized sign within a small deadband
- `anchorAgreementChecks`: proposals with anchor report and forecast available; `anchorAgreementRate`: percentage where forecasted win direction matched anchor delta sign; `realizedPatchChecks`: committed proposals old enough to have a patch review or next sprint
- `realizedPatchSuccessRate`: percentage of those that were clear or non-declining; Deadband recommendation for direction scoring:; treat delta between `-0.02` and `0.02` as `flat`
- this is for meta-metric computation only; it is not a coach gate
#### Commit Semantics
- Update final decision logic in `server/arena.ts`:; current code:; `review.decision === "commit" && proposal.patch ? "commit" : "revert"`
- new logic:
```ts
const hasAnyChange = Boolean(proposal.patch || proposal.searchPolicyPatch);
const finalDecision: CoachDecision =
  review.decision === "commit" && hasAnyChange ? "commit" : "revert";
```
- If committed:; apply `proposal.patch` if present; apply `proposal.searchPolicyPatch` if present
- Persist updated `searchPolicy` via `storage.updateCoachRun(runId, { searchPolicy: slot.searchPolicy })`
#### Proposal Normalization
- Extend `normalizeProposal()` in `server/coachPrompts.ts`:; parse optional `forecast`; parse optional `searchPolicyPatch`
- validate `newPolicy` shape conservatively; if invalid, drop just the policy patch rather than failing the whole proposal; Keep the existing tolerant parsing strategy.
#### Review Normalization
- `CoachReviewResult` does not need a separate policy decision field in the first pass.; Commit/revert applies to the whole proposal.; This keeps the state machine simple.
### Validation Criteria
- Proposal prompts should include the current search policy and coach meta-metrics.; The coach should be able to return a policy patch without a genome patch.; A committed policy patch should update `coach_runs.searchPolicy`.
- The updated policy should appear in the next sprint’s prompt.; No code path should treat `commitThreshold`, `reviewStrictness`, or any other policy field as a deterministic rule.; Forecast accuracy should be derived from realized metrics and stored or recomputable.
### Scope Estimate
- Scope: L; Reason:; touches shared types, prompt builders, proposal parsing, arena state, and meta-metric derivation
- still avoids DB migration because policy is JSONB-backed already
## 4. MIGRATION PATH
### Ship Order
1. P0-A compiled prompt routing
2. P0-B real anchor evaluation
3. P1-B per-match summaries
4. P1-A arena scratch notes
5. P2-A tiered disclosure
6. P2-B cross-slot briefing
7. P3 operative `SearchPolicy`
### Why This Order
- P0-A first:; anchor matches should use the same role-specific runtime path as training matches; otherwise anchor results measure an outdated prompt architecture
- P0-B second:; review prompts need real anchor evidence early; it unlocks better commit decisions before the rest of the evidence work lands
- P1-B before P1-A:; per-match summaries improve coach visibility without changing runtime state; easier to ship and verify than scratch-note persistence
- P1-A after summaries:; now that coach evidence is richer, adding player memory makes the coach/player loop more interpretable; P2 disclosure and arena briefing after P1:
- those features are higher-leverage once the core evidence pipeline is real; P3 last:; meta-evolving search policy before the coach has richer anchors, notes, and match evidence would optimize on poor evidence
### Dependency Notes
- P0-B depends on P0-A if anchor matches are expected to test compiled prompts.; P1-B depends on `matchmakingBucket` persistence from P0-A if bucket should appear in summaries.; P1-A depends on no earlier phase technically, but it is safer after P0 because headless prompt routing changes are already stabilized.
- P2-A depends on persisted proposals and match rounds, which already exist.; P2-B depends on persisted proposals, evaluations, and patch reviews, which already exist after P0/P1.; P3 depends on proposal/review payload stability from all earlier phases.
### Rollout Strategy
- Step 1:; land schema/type additions and backward-compatible headless prompt shim; leave legacy prompt arguments supported
- Step 2:; switch arena path to `promptOverrides`; verify classic series/tournament paths still run through legacy compatibility
- Step 3:; land anchor evaluator and evaluation update method; verify `/api/coach/:id/anchors`
- Step 4:; land per-match summaries and prompt formatting; Step 5:
- land scratch-note state and persistence; Step 6:; replace disclosure rendering
- Step 7:; land arena briefing; Step 8:
- land `SearchPolicy` prompt wiring and policy patch support
### Explicit Out-of-Scope During Migration
- Do not migrate `server/coachArena.ts` in this phase set unless a real call path still uses it.; The active route for `/api/arena` imports `runArena()` from `server/arena.ts`.; Do not rewrite the evaluation math.
- Do not change player prompt strategies beyond the compiled prompt override routing.
## 5. VALIDATION PLAN
### A. Role-Specific Prompt Wiring
- Run one arena sprint with one pairing and 3v3 teams.; Inspect AI call logs for:; clue generation
- own guess deliberation; intercept deliberation; Check:
- cluegiver prompt contains `Clue Philosophy` section but not `Memory Policy`; own guesser/deliberator prompt contains `Memory Policy` or `Deliberation Scaffold` as appropriate; interceptor prompt contains `Opponent Modeling`
- Negative check:; compiled role prompts should no longer include irrelevant module blocks for the action role.
### B. Fallback Behavior
- Run a headless match without `promptOverrides`.; Check:; match completes
- default strategy prompt still works; Run a headless match with only `monolithicSystemPrompt`.; Check:
- match completes; prompt override still applies
### C. Anchor Reproducibility
- Create a fixed proposal id and anchor config.; Run `runAnchorBatch()` twice on the same incumbent/candidate pair.; Check:
- seed list identical; anchor labels identical; incumbent/candidate match counts identical
- If model nondeterminism creates different outcomes, that is acceptable.; The seed set and opponent set must still match.
### D. Anchor Evidence Visibility
- Trigger a sprint with a non-null patch proposal.; Check:; `coach_sprints.anchorSummary` is non-null
- `sprint_evaluations.evaluation.anchor` is non-null after update; `/api/coach/:id/anchors` returns records for the sprint; review prompt text includes win, decode, and intercept deltas
### E. Scratch Note Propagation
- Run one side-swapped pairing with reflections enabled.; Check:; first match starts with empty notes
- second match starts with notes from the first match; both slots get updated notes after the pair; Run two arena sprints.
- Check:; notes persist from sprint 1 into sprint 2; `coach_runs.currentScratchNotes` reflects the latest note state
### F. Coach Visibility of Scratch Notes
- Trigger a proposal prompt after at least one reflected match.; Check:; environment section includes `Scratch Notes:`
- text matches persisted slot note text
### G. Per-Match Summary Correctness
- Run a sprint with at least two pairings and both sides represented.; Check each `MatchSummary`:; outcome matches the match row
- rounds played matches `matches.totalRounds`; own decode trace matches focal-team `match_rounds.ownCorrect`; opponent intercept trace matches focal-team `match_rounds.intercepted`
- bucket matches `matches.matchmakingBucket`; max leakage matches transcript analyzer output
### H. Prompt Length Sanity
- Measure proposal prompt token size before and after per-match summaries.; Check:; prompt remains within model budget
- per-match section remains concise; If prompt size is too large:; trim `qualitativeTags`
- trim `deceptionHighlights`; keep round traces and leakage
### I. Tiered Disclosure
- Sprint below delay threshold:; ensure no delayed dossier artifact appears; ensure patch card and exemplar clues appear if data exists
- Sprint at or above delay threshold:; ensure delayed dossier artifact appears; ensure raw full genome text only appears in that artifact
### J. Arena Briefing
- Run two sprints.; Check:; sprint 2 prompt includes arena briefing
- briefing mentions actual mutated modules from sprint 1; briefing excludes same-slot highlights as “other slot” examples
### K. SearchPolicy Operability
- Seed a run with a non-default `SearchPolicy`.; Check:; proposal prompt prints the seeded values
- review prompt prints the same values; Have the coach return a `searchPolicyPatch`.; Check:
- proposal parses; commit applies the updated policy; next sprint prompt reflects the updated policy
### L. Meta-Metric Sanity
- After several sprints, compute coach meta-metrics.; Check:; `proposalCount >= commitCount`
- `commitRate` in `[0,1]`; `forecastAccuracy` only counts proposals with both forecast and realized data; no division-by-zero issues on empty history
### M. Regression Checks
- Classic UI game creation and gameplay should remain unchanged.; Series mode should still produce reflections and scratch notes.; Tournament and validation routes should still function with omitted new optional config blocks.
## 6. COST ESTIMATES
### Baseline Training Cost
- In `server/matchmaking.ts`, `selectPairings(slots, matchesPerCoach, ...)` assigns `matchesPerCoach` pairings per slot.; Total pairings per arena sprint:; `(slotCount * matchesPerSprint) / 2`
- Each pairing in `server/arena.ts` runs two actual games:; one with slot A on amber; one with slot A on blue
- Therefore total training games per arena sprint:
```text
training_games_per_sprint = slotCount * matchesPerSprint
```
- Example:; 8 slots; `matchesPerSprint = 2`
- training games per sprint = `8 * 2 = 16`
### Anchor Cost
- Default anchor config proposed here:; 4 anchor opponents; 1 game per anchor
- role-swapped = true; Actual headless games per patch proposal:
```text
anchor_games_per_proposal =
  anchorOpponents
  * gamesPerAnchor
  * (roleSwap ? 2 : 1)
  * 2 variants
```
- Default:
```text
4 * 1 * 2 * 2 = 16 games
```
- If a sprint has `P` slots proposing a patch:
```text
anchor_games_per_sprint = P * 16
```
- Example:; 8-slot arena; all 8 slots propose a patch
- anchor games per sprint = `128`; Compared to the earlier training example:; training = `16`
- anchors = `128`; anchor load = `8x` training game count
### Scratch Note Cost
- Scratch notes add up to two reflection calls per completed headless match:; one reflection for amber; one reflection for blue
- Reflection prompts are much cheaper than full games.; They are still non-zero cost and should be accounted for.; Approximate call multiplier:
- every training or anchor game with reflections enabled adds `+2` LLM calls; anchor games should not enable reflections; only training matches should write slot memory
### Per-Match Evidence Cost
- Per-match summaries add:; transcript analysis reads; research analysis reads
- extra evaluation JSON size; They do not add player-model cost.; They do not materially change arena dollar cost compared to anchors.
### Disclosure / Briefing Cost
- Tiered disclosure and arena briefing are derived from stored data.; They add prompt tokens to coach calls.; They do not add new player-game cost.
### SearchPolicy Cost
- SearchPolicy adds a small number of extra tokens to proposal/review prompts.; Meta-metric computation is storage- and CPU-bound, not model-bound.
### Operational Recommendation
- Anchor evaluation is the dominant new cost.; Default it on, but only when `proposal.patch` is non-null.; Keep `gamesPerAnchor = 1` initially.
- Keep `roleSwap = true` despite the cost because it meaningfully reduces side variance.; Do not run anchors for policy-only patches in the first pass unless the coach also changed the genome.
## 7. RISKS AND TRADEOFFS
### Prompt Routing Risks
- Risk:; role-specialized prompts may omit context that some behaviors implicitly relied on under the monolithic prompt; Mitigation:
- keep monolithic fallback in the override bundle; keep legacy `buildGenomeSystemPrompt()` available; validate each action role against the new prompt mapping before removing shims
### Anchor Cost Explosion
- Risk:; anchor evaluation can dominate arena cost if every slot proposes every sprint; Mitigation:
- anchor only when `proposal.patch` exists; default `gamesPerAnchor = 1`; make opponent set researcher-configurable
- keep results purely advisory to avoid further reruns caused by gating logic
### Evaluation Persistence Drift
- Risk:; if anchor data and updated pending patch review data are only kept in memory, stored evaluations will not match the evidence the coach saw; Mitigation:
- add `updateSprintEvaluation()`; call it after each enrichment step that changes the evaluation payload
### Scratch Note Semantic Drift
- Risk:; if notes are keyed by current side instead of slot identity, side swaps will corrupt memory semantics; Mitigation:
- store one note state per slot/run; map that note state onto amber or blue depending on the slot’s current side in a match
### Scratch Note Failure Modes
- Risk:; reflection failures could erase notes or write empty strings; Mitigation:
- on reflection error, keep previous note text; log the reflection failure; only overwrite when new note text is non-empty
### Prompt Bloat
- Risk:; per-match summaries, disclosure, briefing, notes, anchors, and search policy could together overgrow coach prompts; Mitigation:
- cap per-match summaries at two to three lines; cap exemplar clues at three; keep arena briefing under about 18 lines
- keep policy formatting compact and numeric
### Disclosure Overexposure
- Risk:; even structured disclosure can homogenize the arena if too much is revealed too quickly; Mitigation:
- keep delayed dossier behind `foiaDelaySprints`; delay cross-slot successful patch highlights by one sprint; surface style evidence before raw full-text genome dumps
### Cross-Slot Convergence
- Risk:; cross-slot briefing may cause coaches to collapse toward the same patch ideas; Mitigation:
- keep briefing descriptive rather than prescriptive; include both improvements and failures; keep `SearchPolicy.explorationBias` available so coaches can explicitly lean away from crowd behavior
### SearchPolicy Over-Mechanization
- Risk:; once policy fields exist, it is tempting to convert them into hard gates; Mitigation:
- document every policy field as advisory; keep all actual commit/revert choices in `coachCommitReview()`; reject PRs that add deterministic threshold enforcement under the name of policy
### Forecast Scoring Ambiguity
- Risk:; prediction accuracy can become noisy if realized deltas are small or mixed; Mitigation:
- score directions with a deadband; report accuracy descriptively; do not use accuracy as a mechanical policy gate
### Backward Compatibility Risk
- Risk:; series/tournament callers may break if `runHeadlessMatch()` is changed too aggressively; Mitigation:
- preserve legacy positional overrides in P0/P1; normalize them into the new config fields internally; remove the shim only after all internal callers migrate
### Legacy Path Confusion
- Risk:; `server/coachArena.ts` may drift from `server/arena.ts`; Mitigation:
- treat `server/arena.ts` as the authoritative path for this phase set; if `server/coachArena.ts` is still live anywhere, either deprecate it explicitly or bring it forward in a follow-up
## Appendix A. Concrete File-Level Change List
### `shared/schema.ts`
- Move `MatchmakingBucket` here from `server/matchmaking.ts`; extend `HeadlessMatchConfig` with:; `promptOverrides?`
- `scratchNotesByTeam?`; `enablePostMatchReflection?`; `reflectionTokenBudget?`
- `matchmakingBucket?`; extend `CoachPromptEnvironment` with:; `scratchNotes?`
- `arenaBriefing?`; `searchPolicy?`; `coachMetaMetrics?`
- add `ScratchNotesSnapshot`; extend `AnchorABReport`; add `AnchorOpponentSpec`
- add `AnchorEvaluationConfig`; extend `ArenaConfig` with `anchorConfig?`; add `MatchSummary`
- extend `SprintEvaluation` with `perMatchSummaries`; add `DisclosureArtifact`; extend `SearchPolicy`
- add `CoachForecast`; add `SearchPolicyPatch`; extend `CoachProposal`
- add `CoachMetaMetrics`; add `matchmakingBucket` to `matches`; add `currentScratchNotes` to `coach_runs`
- add `scratchNotesSnapshot` to `coach_sprints`
### `server/genomeCompiler.ts`
- no behavior change required; optional:; export `ROLE_MODULES` if tests need direct access
### `server/coachLoop.ts`
- keep `buildGenomeSystemPrompt()` as fallback; update `CoachSprintEnvironment`; compile prompts once per sprint call
- pass `promptOverrides` into `HeadlessMatchConfig`; pass `teamScratchNotes`, reflection flags, and bucket metadata; return `finalScratchNotesByTeam`
### `server/headlessRunner.ts`
- add prompt resolution helpers; route prompt by role; accept/normalize `promptOverrides`
- accept `scratchNotesByTeam`; add post-match reflection helper; return updated note snapshots
- persist `matchmakingBucket`
### `server/arena.ts`
- remove active use of incomplete anchor stub; add anchor batch execution; add disclosure artifact assembly
- add arena briefing builder; add scratch note state to `ArenaRuntimeSlot`; add search policy state to `ArenaRuntimeSlot`
- update pair execution to thread scratch notes across the side swap; include scratch notes, search policy, meta metrics, and briefing in prompt env; update final decision logic for policy-only patches
- update persisted evaluation after enrichment
### `server/anchorEvaluator.ts`
- new file; run anchor games; persist anchor evaluation records
- return `AnchorABReport`
### `server/coachPrompts.ts`
- render search policy; render coach meta metrics; render real anchor decode/intercept data
- render per-match summaries; parse `forecast`; parse `searchPolicyPatch`
- include scratch notes and arena briefing in environment rendering
### `server/sprintEvaluator.ts`
- add `buildPerMatchSummaries()`; include `perMatchSummaries` in `SprintEvaluation`; continue aggregate evidence lines
### `server/disclosure.ts`
- replace flat dump builder with artifact builder + renderer
### `server/storage.ts`
- add `updateSprintEvaluation()`; expose new coach run / sprint note fields in create/update helpers; existing anchor evaluation methods are already sufficient
### `server/matchmaking.ts`
- import `MatchmakingBucket` from `@shared/schema`; no algorithm change required
### `server/seriesRunner.ts`
- optionally keep as-is via compatibility path; optional cleanup:; adopt `scratchNotesByTeam` and shared reflection logging helper later
### `server/routes.ts`
- extend `arenaConfigInputSchema` with optional `anchorConfig`; extend `validationConfigInputSchema` likewise if desired; no immediate public API change needed for scratch notes, briefing, or search policy
## Appendix B. Recommended First PR Slices
### PR 1
- P0-A compiled prompt routing; `matches.matchmakingBucket`; no anchor work yet
### PR 2
- P0-B anchor evaluator; `updateSprintEvaluation()`; route schema for `anchorConfig`
### PR 3
- P1-B per-match summaries; prompt formatting updates
### PR 4
- P1-A scratch notes; `coach_runs.currentScratchNotes`; `coach_sprints.scratchNotesSnapshot`
### PR 5
- P2-A tiered disclosure; P2-B arena briefing
### PR 6
- P3 `SearchPolicy`; forecast; policy patch support
- coach meta metrics

## Appendix C. Blocker Resolutions (Post-Review)

### B1. HeadlessResult Export
`HeadlessResult` is file-local in `server/headlessRunner.ts`. Resolution: add `updatedScratchNotes` to `HeadlessResult` locally in headlessRunner.ts and thread the data through `SprintResult` in `server/coachLoop.ts`. Do not move `HeadlessResult` into `shared/schema.ts`.

### B2. Anchor Cost Defaults
Default to **2 anchor opponents** (not 4): `SEED_GENOME_TEMPLATES.slice(0, 2)`. Add `maxAnchorGamesPerSprint` to `AnchorEvaluationConfig` with default 32. If total anchor games across all proposing slots would exceed this cap, skip anchors for lower-priority slots (by slot index). This brings worst-case cost to 2x training (32 anchor vs 16 training), not 8x.

### B3. Coach Prompt Token Budget
Define `MAX_EVIDENCE_TOKENS = 12000` in `server/coachPrompts.ts`. Truncation priority (last truncated first):
1. Arena briefing (drop entirely if over budget)
2. Per-match summaries (keep first 2, drop rest)
3. Scratch notes (truncate to last 800 tokens)
4. Disclosure artifacts (keep patch cards, drop exemplar clues, then drop dossier)
5. Anchor report (always kept — most decision-relevant)
6. Aggregate evidence lines (always kept)
Implementer should add a `measurePromptTokens()` helper using rough 4-chars-per-token estimate and apply truncation before final prompt assembly.

### B4. MatchSummary Simplification
Remove `deliberationPatterns: DeliberationPatternVector` from `MatchSummary`. Keep only `summaryLines: string[]` and the structured per-round traces (`ownDecodeByRound`, `opponentInterceptByRound`). Deliberation pattern numbers are rendered into `summaryLines` at build time and do not need separate storage.

### B5. Scratch Note Size Cap
Default `reflectionTokenBudget` to 1500 tokens. Enforce in `buildUpdatedScratchNotes()`: if existing notes exceed 1200 tokens (80% of budget), the reflection prompt includes the instruction "Consolidate your existing notes into the most essential strategic insights before adding new observations. Stay under 1500 tokens total." If the reflection output exceeds the budget, truncate to budget. On reflection failure, keep previous notes unchanged.
