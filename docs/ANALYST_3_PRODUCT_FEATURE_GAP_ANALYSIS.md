# ANALYST 3: PRODUCT & FEATURE GAP ANALYSIS

**Date:** 2026-03-30
**Scope:** Full codebase review of Herpetarium / Decrypto Arena
**Focus:** Feature completeness, research readiness, extensibility, and product gaps

---

## 1. Feature Inventory -- What Actually Works

### 1.1 Core Game Engine
**Rating: WORKING**

The game engine in `server/game.ts` is solid and complete. It handles the full Decrypto lifecycle: lobby, team setup, clue giving, own-team guessing, opponent interception, round evaluation, and game-over detection. The `evaluateRound()` function correctly tracks white tokens (miscommunication) and black tokens (interception), and the win condition (2 of either token) is properly enforced. Seeded RNG support is present via `createSeededRng()` for reproducible keyword selection and code generation. Game state validation (`validateGameState()`) checks for internal consistency including duplicate keywords, valid code positions, and history counts.

### 1.2 AI Provider Integration
**Rating: WORKING**

`server/ai.ts` supports four providers: OpenAI, Anthropic, Google Gemini, and OpenRouter (for DeepSeek, Grok, Llama, Mistral, Qwen). Each provider has dedicated handling for reasoning/thinking models (OpenAI o-series, Anthropic extended thinking, Gemini 2.5 thinking). Rate-limit detection and exponential backoff with jitter is implemented via `callAIWithBackoff()`. Token counting and cost estimation are present with a hardcoded `MODEL_COST_PER_1K` table covering 15 models. Reasoning traces are captured from all providers that support them.

### 1.3 Headless Match Runner
**Rating: WORKING**

`server/headlessRunner.ts` runs complete AI-vs-AI games without any UI. It creates the game, assigns players, generates seeded keywords, and loops through rounds calling `processClues()`, `processGuesses()`, and `processInterceptions()`. Each AI call is logged to the database via `logAiCall()`. A 60-second timeout wrapper prevents stuck calls. Round results are persisted after each round, and final match state is written on completion. The runner handles the full pipeline and integrates with the storage layer cleanly.

### 1.4 Tournaments
**Rating: WORKING**

`server/tournament.ts` supports multi-match tournaments with configurable concurrency (1-5 parallel matches), delay between matches, budget caps, and ablation flags. The `runTournament()` function tracks completed vs. failed matches, computes cumulative cost, and sets appropriate final status (completed, completed_with_errors, budget_exceeded, failed). Match configs are expanded with `gamesPerMatchup` multiplier. Ablation flags propagate from tournament level to individual matches.

### 1.5 Series (Iterated Games with Memory)
**Rating: WORKING**

`server/seriesRunner.ts` implements iterated games where AI agents accumulate strategic notes across matches. After each game, a reflection call (`generateReflection()` in `ai.ts`) asks the agent to update its notes based on game outcomes. Notes are keyed by a player config hash and carried forward to subsequent games. The reflection prompt is well-designed -- it provides the agent with team history, opponent history, token counts, win/loss outcome, and current notes, then asks for updated observations. Token budgets are enforced (configurable 100-5000 tokens). Budget caps and cost tracking work the same as tournaments.

### 1.6 Evolution System
**Rating: WORKING (with caveats)**

`server/evolution.ts` implements a genuine evolutionary algorithm. See Section 5 for deep dive.

### 1.7 Prompt Strategies
**Rating: WORKING**

Four prompt strategies are implemented in `server/promptStrategies.ts`, `server/kLevelStrategy.ts`, and `server/enrichedStrategy.ts`:

- **default**: Standard prompts with history awareness
- **advanced**: Chain-of-thought reasoning with theory-of-mind instructions and extended thinking support
- **k-level**: Explicit Level 0-3 strategic reasoning framework adapted from AI-social-games research
- **enriched**: Enhanced with semantic word context (vibe/tags from word packs), persona injection from `botPersonas.ts`, and structured task framing

The ablation system (`applyAblations()`) supports five flags: `no_history`, `no_scratch_notes`, `no_opponent_history`, `no_chain_of_thought`, `random_clues`. These cleanly strip context from prompts for controlled experiments.

### 1.8 Theory of Mind Analyzer
**Rating: WORKING (heuristic-based)**

`server/tomAnalyzer.ts` uses regex pattern matching to classify AI reasoning text into four ToM levels: Level 0 (Reactive), Level 1 (Self-Aware), Level 2 (Theory of Mind), Level 3 (Meta-Strategic). Patterns are well-chosen -- for example, Level 3 looks for recursive reasoning like "they think that I think that they think." The analyzer can process raw responses, reasoning traces, and scratch notes. It builds timelines showing ToM progression across a series and computes whether an agent is improving, stable, or declining.

The limitation is that this is pure regex heuristics, not semantic analysis. An LLM that uses the word "opponent" will score higher even if its reasoning is shallow. This is acknowledged as a starting point but should eventually be supplemented with LLM-based evaluation.

### 1.9 Metrics Engine
**Rating: WORKING**

`server/metrics.ts` computes a comprehensive set of metrics:

- **Per-model**: win rate, interception success rate, interception vulnerability, miscommunication rate, average rounds, clue diversity
- **Per-matchup**: head-to-head win rates between specific model pairs
- **Per-strategy**: same metrics broken down by prompt strategy
- **Team composition**: mixed vs. homogeneous team win rates, synergy scores between provider pairs
- **Self-play**: amber/blue win rate variance, game length distributions, per-round token accumulation curves
- **Parse quality**: clean/partial/fallback/error rates per model, total tokens, total cost
- **Cross-model clue analysis**: clue-keyword mappings with clue giver and guesser providers identified

The `significanceIndicator` in `computeExperimentResults()` uses a naive heuristic (win rate difference thresholds at 20/10/5 games), not proper statistical testing.

### 1.10 Data Export
**Rating: WORKING**

Three export endpoints exist (`/api/export/matches`, `/api/export/rounds`, `/api/export/ai-logs`) supporting both JSON and CSV formats. CSV exports produce flat tabular data suitable for analysis in Python/R. Filters for model, date range are supported. This is a genuine strength -- researchers can actually extract data.

### 1.11 Word Packs & Bot Personas
**Rating: WORKING**

`server/wordPacks.ts` provides ~120 unique words across themed packs (Fire & Navigation, Harbor & Ceremony, etc.) with semantic metadata (vibe strings, tag arrays). Legacy words and curated words are merged into a unified pool. `server/botPersonas.ts` defines 7 named personas (Iris, Beck, Sol, Hex, Juno, Vale, Moth) with personality styles that can be injected into the enriched strategy. These are nicely designed but only used by the enriched strategy -- the other three strategies ignore them.

### 1.12 WebSocket Game (Human Play)
**Rating: WORKING**

The `GameProvider` in `client/src/lib/gameContext.tsx` manages WebSocket connections with reconnection logic (3 attempts, exponential backoff). The game supports human + AI teams, with AI thinking indicators and fallback notifications. The Home page provides create/join game flows. This is functional but clearly the lower-priority feature given the research focus.

### 1.13 Client Dashboard Pages
**Rating: PARTIAL**

- **History** (`History.tsx`): Lists matches with pagination, model/winner/date filters. Expandable match details showing round-by-round clues, codes, guesses, interception results, and AI call logs with reasoning traces. CSV/JSON export. **WORKING.**
- **Tournaments** (`Tournaments.tsx`): Create tournaments with multi-matchup configuration, provider/model selection, cost estimation, budget caps, concurrency, ablations. View tournament results with model stats. **WORKING.**
- **Series** (`Series.tsx`): Create series with player config, token budget, cost estimation. View series results with scratch note timelines, match details, and ToM analysis. **WORKING.**
- **Evolution** (`Evolution.tsx`): Create evolution runs with provider/model, population size, generations, mutation/crossover rates, elitism, matches per evaluation. View fitness curves, Elo trends, diversity metrics, phase transitions, and individual genome details. Uses Recharts for line charts. **WORKING.**
- **EvalDashboard** (`EvalDashboard.tsx`): Aggregated metrics across all matches -- model win rates, matchup matrices, strategy comparisons, team composition analysis, self-play analysis, parse quality, ToM summary, ablation comparison. Uses Recharts bar charts and radar charts. Filterable by model, strategy, date range. **WORKING.**

---

## 2. The Dashboard / Monitoring Story

### What Exists

A researcher can currently:
- View aggregate model performance (win rate, interception rates, miscommunication rates) in the EvalDashboard
- See head-to-head matchup results between any two models
- Compare prompt strategy effectiveness
- Examine team composition effects (mixed vs. homogeneous)
- Review self-play dynamics per model
- Track parse quality and cost per model
- Filter all analysis by model, strategy, and date range
- Export all underlying data as CSV or JSON

The Evolution page shows fitness curves, Elo trajectories, and diversity metrics across generations with proper line charts. Phase transitions (convergence, exploration, exploitation, collapse) are detected and displayed with evidence strings.

The Series page shows scratch note evolution with expandable note text per player per game, match results, and ToM analysis timelines.

### What's Missing

**No real-time monitoring.** There is no way to watch an experiment as it runs. Tournaments, series, and evolution runs fire-and-forget from the API. The only way to check progress is to reload the page and see if `completedMatches` has incremented. For a 50-game series that takes an hour, there is no progress indicator, no live match feed, no streaming updates.

**No experiment comparison view.** You cannot place two tournaments or two series side-by-side and compare their metrics. Every analysis is of a single entity. The EvalDashboard aggregates across ALL matches, which mixes different experimental conditions.

**No time-series performance visualization.** The EvalDashboard shows aggregate metrics but not how they change over time. You cannot see "Claude's interception rate improved from 10% to 35% between games 1-10 and games 41-50 of this series." The data exists but the visualization does not.

**No cost monitoring during runs.** Budget caps exist and actual cost is computed, but there is no real-time cost display showing burn rate, projected total, or cost-per-match trends.

**No alerting.** If an evolution run encounters repeated failures, if cost is approaching budget, if a model starts returning only fallback responses -- no notification mechanism exists.

---

## 3. Game Replay & Post-Mortem

### Current State

The match detail endpoint (`GET /api/matches/:id`) returns the match record, all round records, and all AI call logs. The History page renders this as expandable round cards showing:
- Team keywords (both teams)
- Secret code for each team
- Clues given
- Own-team guess vs. actual code (correct/incorrect)
- Opponent interception attempt vs. actual code (intercepted/not)
- Token counts
- AI call logs with prompt, raw response, reasoning trace, latency, token usage, cost, parse quality

The match analysis endpoint (`GET /api/matches/:id/analysis`) provides clue analysis with keyword-clue mappings and quality status (good / too_obvious / too_obscure).

### What a "Perfect Game Replay" Would Look Like

A research-grade game replay should provide:

1. **Step-by-step timeline**: A visual walkthrough where you advance through each phase (clue giving, guessing, interception, evaluation) and see exactly what each agent knew, decided, and why.

2. **Side-by-side reasoning**: For each decision point, show the prompt that was sent, the raw response, the reasoning trace (if available), the parsed result, and the game outcome. Currently these exist as flat lists in the AI call logs, but they are not aligned to the game flow.

3. **Counterfactual analysis**: "What if the code had been [2,3,1] instead of [1,4,2]?" With seeded keywords and stored match data, you could re-run specific rounds with different codes to test whether clue quality was code-dependent.

4. **Clue semantic analysis**: For each clue, show the target keyword, the semantic distance between clue and keyword, and whether the clue was closer to the target keyword or to other keywords on the team. This would require embedding-based similarity computation.

5. **Interception probability heatmaps**: For each round, show how much information the opponent has accumulated and estimate the probability of interception based on clue history overlap.

None of items 3-5 currently exist. Items 1-2 partially exist as raw data but lack proper visualization.

---

## 4. Multi-Game Experiment Workflows

### Scenario: "Claude Sonnet 4 vs GPT-4o, 50 games, with k-level prompts, measuring interception rate and TOM development"

**Step 1: Set up the experiment.**

You would use the Series page. Create a new series with:
- Player 1: Claude (claude-sonnet-4-20250514), team amber
- Player 2: GPT-4o, team blue
- Total games: 50

**Problem:** The Series UI does not expose prompt strategy selection. Looking at the `seriesConfigSchema` in routes.ts, the match config schema (`headlessMatchConfigSchema`) only validates `name`, `aiProvider`, `team`, `fastMode`, and `seed`. There is no `aiConfig` or `promptStrategy` field in the schema. The `HeadlessMatchConfig` type in schema.ts does support `aiConfig` with `promptStrategy`, but the route validation schema drops it.

This means: **you cannot select k-level prompts through the UI or API for series/tournaments.** The `aiConfig` field would need to be added to the validation schema.

**Workaround:** You would need to modify the code or call the API with a manually constructed JSON body that includes aiConfig fields, bypassing the Zod validation schema. This is fragile.

**Step 2: Run the experiment.**

Assuming you fix the schema issue, you create the series and it starts running. There is no progress monitoring -- you check back periodically.

**Step 3: Analyze results.**

After completion, the Series detail page shows:
- Win/loss record
- Scratch note evolution per player
- Match details with round-by-round data
- ToM analysis timeline via `/api/series/:id/tom`

**Problem:** Interception rate is not surfaced as a first-class metric in the Series detail view. You would need to manually compute it from the match round data, or use the EvalDashboard (which aggregates across ALL matches, not just this series).

**Problem:** There is no way to isolate this series' metrics from other data in the EvalDashboard. The eval endpoint (`/api/eval/metrics`) filters by model and date range, but not by series ID or tournament ID. If you ran other matches during the same period, they contaminate the results.

**Step 4: ToM development analysis.**

The `/api/series/:id/tom` endpoint provides ToM timelines scoped to this series, which is correct. You can see whether ToM depth increases across games.

**Step 5: Statistical significance.**

The `significanceIndicator` in `computeExperimentResults()` is a crude heuristic. There is no proper statistical testing (chi-squared, Fisher's exact, bootstrap confidence intervals). For 50 games, you would need to export the data and run significance tests in Python/R.

### Summary of Manual Intervention Required

1. The prompt strategy cannot be set through the standard API/UI -- **requires code change or schema bypass**
2. No real-time progress monitoring -- **requires manual page refreshing**
3. Interception rate requires manual computation from series data -- **not surfaced in UI**
4. Series-scoped metrics are not available in the eval dashboard -- **no experiment isolation**
5. Statistical significance testing -- **requires external tools**

---

## 5. The Evolution System -- Deep Dive

### Architecture

The evolution system in `server/evolution.ts` is a genuine evolutionary algorithm with the following components:

**Genome representation.** Each genome is a `GenomeModules` object with four string-valued modules: `cluePhilosophy`, `opponentModeling`, `riskTolerance`, `memoryPolicy`. These are natural-language strategy descriptions that get injected as system prompts via `buildGenomeSystemPrompt()`. This is a meaningful representation -- each module controls a distinct aspect of gameplay behavior.

**Seed population.** Eight hand-crafted template genomes cover a good range: abstract/metaphorical, concrete/sensory, functional/relational, cultural/contextual, oppositional/negative-space, phonetic/linguistic, hierarchical/categorical, and emotional/psychological approaches. Additional population members are generated via crossover of templates.

**Fitness function.** `computeFitness()` is a weighted combination:
- Win rate * 0.4
- Normalized Elo * 0.3
- Interception rate * 0.15
- Negative miscommunication rate * 0.15

This is reasonable but could be more sophisticated. Elo and win rate are partially redundant (Elo is derived from wins/losses).

**Selection.** Tournament selection with configurable tournament size (default 3). Standard approach, works fine.

**Crossover.** Module-level uniform crossover -- each module is randomly selected from parent A or parent B. This is the right granularity given the genome structure.

**Mutation.** Two paths: AI-assisted mutation (the LLM rewrites one module based on fitness context) and fallback mutation (random selection from a predefined variant library with 4 options per module). The AI mutation prompt adjusts aggressiveness based on fitness score -- underperforming genomes get "bold, creative" changes while strong genomes get "subtle refinement." This is well-designed.

**Evaluation.** Frequency-weighted pairings via `buildFrequencyWeightedPairings()` that give more matches to rare/diverse genome pairs. Each pair plays a configurable number of matches. Elo ratings are updated after each match using standard K-factor = 32.

**Phase detection.** `detectPhaseTransitions()` monitors diversity, fitness standard deviation, interception rate variance, and fitness skewness to detect four phases: exploration, exploitation, convergence, and collapse. Population snapshots are stored at transition points.

**Elitism.** Top N genomes carry forward to the next generation unchanged (with reset stats).

### Assessment

This is a genuinely functional evolutionary system that could produce interesting results. The key strengths:

1. Natural-language genomes are a creative choice that leverages LLMs' ability to follow varied strategic instructions
2. AI-assisted mutation is a novel approach (letting the LLM itself generate mutations rather than random perturbation)
3. Phase detection provides useful meta-analysis of evolutionary dynamics
4. Module-level crossover preserves meaningful strategy components rather than destroying them

The key weaknesses:

1. **Single-model evaluation.** Each evolution run uses one base model. You cannot evolve strategies that generalize across models, or pit evolved populations from different models against each other.
2. **No niche preservation.** Diversity is measured but not enforced. Without speciation or fitness sharing, convergence is likely once one strategy dominates.
3. **No co-evolution.** Both sides of each match are from the same population. There is no adversarial co-evolution where population A evolves against population B.
4. **Lineage tracking is minimal.** The `lineageTag` and `parentIds` exist but there is no visualization of evolutionary trees or lineage analysis in the UI.
5. **Statistical noise.** With only `matchesPerEvaluation` (default 1) matches per pairing, fitness estimates are extremely noisy. Decrypto has significant randomness from keyword assignment and code generation. A single match is insufficient to reliably distinguish genome quality.

### Could This Produce Genuinely Interesting Results?

Yes, conditionally. The system has the right structure. However:

- With default settings (population 8, 1 match per evaluation), the signal-to-noise ratio is too low. Recommend minimum 3-5 matches per evaluation and population 12-16.
- The evolved strategies will only be as interesting as the base model's ability to follow nuanced natural-language strategic instructions. Smaller/cheaper models may not meaningfully differentiate between genomes.
- The most interesting results would come from long runs (50+ generations) with adequate evaluation matches, which will be expensive.

---

## 6. What's Conspicuously Missing

### Critical Infrastructure Gaps

**6.1 No Authentication or Multi-User Support.**
There is no login, no user accounts, no access control. Anyone who can reach the server can launch tournaments, evolution runs, and consume API credits. The `users` table exists in the schema but is unused except as a legacy artifact.

**6.2 No Experiment Isolation.**
The EvalDashboard aggregates across ALL completed matches in the database. There is no concept of "this set of matches belongs to this experiment." You cannot compare Experiment A vs Experiment B. The `experiments` table exists and has `matchIdsA` / `matchIdsB` fields, but the experiment endpoints do not run matches -- they only track metadata. You have to manually associate match IDs with experiments.

**6.3 No Real-Time Monitoring / WebSocket for Background Tasks.**
Tournaments, series, and evolution runs execute in background `Promise` chains. The only state feedback is polling the API. There are no Server-Sent Events, WebSocket channels, or push notifications for progress updates.

**6.4 No Proper Statistical Testing.**
The `significanceIndicator` field is a naive heuristic. For a research platform, this should include at minimum: binomial test for win rates, bootstrap confidence intervals for metric differences, and effect size calculations. Without these, no research finding from this platform would survive peer review.

**6.5 No Prompt Strategy Selection in Headless Config Validation.**
The Zod schema for `headlessMatchConfigSchema` in routes.ts does not validate `aiConfig` or `promptStrategy`. The `HeadlessMatchConfig` TypeScript type supports these fields, but the API validation strips them. This means the UI and validated API cannot specify prompt strategies for headless matches, tournaments, or series.

### Research Feature Gaps

**6.6 No Embedding-Based Clue Analysis.**
The platform tracks which clues map to which keywords, but does not compute semantic similarity. Embedding-based analysis would enable measuring clue quality objectively (how close is the clue to the target keyword vs. other keywords?), detecting semantic drift across rounds, and identifying clue "originality."

**6.7 No Hypothesis Testing Framework.**
Researchers should be able to define a hypothesis ("k-level prompts produce higher interception rates than default prompts"), configure a matched experiment (same models, same seeds, different prompt strategies), run it, and get a p-value. This would require: experiment definition, matched pair generation, automated execution, and statistical comparison.

**6.8 No Longitudinal Analysis Tools.**
The Series system captures learning over games, but there are no statistical tools to measure learning curves: slope of performance improvement, learning rate differences between models, plateau detection, or regression analysis of note complexity vs. performance.

**6.9 No Replay with Different Configuration.**
The design spec mentions a "replay with different model" button. With seed-based reproducibility, you could re-run a match with the same keywords and codes but different models/strategies. This is not implemented despite all the infrastructure being in place.

### Operational Gaps

**6.10 No Job Queue or Scheduling.**
All long-running tasks (tournaments, series, evolution) run in-process as Promise chains. If the server restarts, all running experiments are lost with no way to resume. There is no job queue, no persistence of running state, no cron scheduling for overnight experiments.

**6.11 No Rate Limit Coordination Across Concurrent Experiments.**
The rate-limit backoff in `ai.ts` operates per-provider within a single call chain. But if you run a tournament with concurrency=5 plus a separate series simultaneously, they will compete for API quota without coordination. The `providerThrottleState` is global but the backoff logic does not coordinate between different experiment runners.

**6.12 No Data Retention or Cleanup Policy.**
Every AI call log stores the full prompt text. For matches using the advanced strategy, prompts can be 2000+ tokens of text. At scale (thousands of matches), the `ai_call_logs` table will grow very large with no archival or cleanup mechanism.

---

## 7. Extensibility for New Games

### How Decrypto-Specific Is the Architecture?

**Very.** Decrypto is baked into nearly every layer.

**Game logic (`game.ts`):** Entirely Decrypto-specific. `GameState`, `GamePhase`, `TeamState`, `RoundHistory` -- every type and function assumes the Decrypto structure (4 keywords, 3-element codes, amber/blue teams, clue/guess/interception phases, white/black tokens).

**AI layer (`ai.ts`):** The core `callAI()` function is game-agnostic -- it just sends system/user prompts and parses responses. But all the wrapper functions (`generateClues`, `generateGuess`, `generateInterception`, `generateReflection`) are Decrypto-specific, including the response parsers (`parseCluesResponse`, `parseCodeResponse`).

**Prompt strategies:** Entirely Decrypto-specific. Every template references keywords, codes, clue history, and Decrypto game mechanics.

**Headless runner:** Hardcoded Decrypto game loop: `processClues` -> `processGuesses` -> `processInterceptions` -> `evaluateRound`.

**Tournament/series/evolution:** These are game-agnostic in their scheduling and lifecycle management. The evolution genome modules reference Decrypto concepts but the evolutionary machinery (selection, crossover, mutation, Elo, fitness) is generic.

**Metrics:** Decrypto-specific (interception rates, clue diversity, miscommunication rates).

**ToM analyzer:** Partially game-agnostic. The regex patterns look for general strategic reasoning patterns, not Decrypto-specific terms. However, the analyzer is tuned for the kind of reasoning Decrypto prompts elicit.

**Database schema:** Tables are game-agnostic in structure (matches, rounds, AI call logs) but column names and semantics assume Decrypto (amberKeywords, blueKeywords, etc.).

### Effort to Add a Second Game (e.g., Werewolf)

**Estimated effort: Major refactor, 3-6 weeks.**

You would need to:

1. Abstract `GameState` into a generic interface with game-specific implementations
2. Create a game registry/factory pattern for game engines
3. Build game-specific AI wrapper functions and response parsers
4. Create game-specific prompt strategies
5. Generalize the headless runner into a game-agnostic loop with game-specific phase handlers
6. Generalize or duplicate metrics computation
7. Add game-type columns to database tables or create separate tables per game
8. Build game-specific UI components for replay and analysis

The tournament, series, and evolution infrastructure could be reused with moderate effort if properly abstracted. The AI call pipeline (`callAI`, backoff, logging) is already game-agnostic.

The recommended approach would be to introduce a `GameEngine` interface:

```typescript
interface GameEngine {
  createGame(config: GameConfig): GameState;
  getPhases(): string[];
  processPhase(state: GameState, phase: string, aiCaller: AICaller): Promise<GameState>;
  evaluateRound(state: GameState): GameState;
  isGameOver(state: GameState): boolean;
  getWinner(state: GameState): string | null;
  getMetrics(matches: Match[], rounds: Round[]): GameMetrics;
}
```

This would require touching most server files but would cleanly separate game logic from infrastructure.

---

## 8. Prioritized Feature Roadmap

### CRITICAL -- Cannot Do Real Research Without These

**1. Fix prompt strategy propagation in API validation.**
The `headlessMatchConfigSchema` in `routes.ts` must include `aiConfig` validation so that prompt strategies, model overrides, and temperature can be specified through the API and UI for tournaments, series, and evolution runs. Without this, all experiments use default prompts on default models regardless of what the UI suggests.
*Files: `server/routes.ts` (schema definitions), `client/src/pages/Tournaments.tsx`, `Series.tsx`*
*Effort: 1 day*

**2. Experiment isolation and comparison.**
Add the ability to tag matches with experiment IDs and filter all metrics/analysis by experiment. The eval dashboard should support "compare experiment A vs experiment B" views. The existing `experiments` table can be extended to actually orchestrate experiment execution rather than just storing metadata.
*Files: `server/routes.ts`, `server/metrics.ts`, `shared/schema.ts`, `client/src/pages/EvalDashboard.tsx`*
*Effort: 1 week*

**3. Proper statistical significance testing.**
Replace the naive `significanceIndicator` heuristic with real statistical tests: binomial test for win rates, Mann-Whitney U for metric comparisons, bootstrap confidence intervals. Surface p-values and confidence intervals in the eval dashboard and experiment comparison views.
*Files: `server/metrics.ts`, new `server/statistics.ts`*
*Effort: 3-4 days*

**4. Real-time experiment monitoring.**
Add Server-Sent Events or WebSocket channels for tournament/series/evolution progress. Display live match counts, current cost, estimated time remaining, and error rates during execution.
*Files: `server/tournament.ts`, `server/seriesRunner.ts`, `server/evolution.ts`, new SSE endpoint in `routes.ts`, client pages*
*Effort: 1 week*

### HIGH -- Significantly Improves Research Quality

**5. Step-by-step game replay viewer.**
A dedicated replay component that walks through a game phase by phase, showing each agent's prompt, reasoning trace, decision, and outcome in context. This is the key to understanding WHY agents make specific decisions.
*Files: new `client/src/pages/Replay.tsx`, extends `server/routes.ts`*
*Effort: 1 week*

**6. Experiment-scoped metrics API.**
New endpoints that compute metrics scoped to specific tournament IDs, series IDs, or sets of match IDs. Currently all metric computation spans the entire database.
*Files: `server/routes.ts`, `server/metrics.ts`*
*Effort: 3-4 days*

**7. Job queue and experiment persistence.**
Replace in-process Promise chains with a proper job queue (e.g., BullMQ with Redis, or a simple PostgreSQL-based queue). Support pause/resume for long-running experiments. Survive server restarts.
*Files: new `server/jobQueue.ts`, modifications to tournament/series/evolution runners*
*Effort: 1-2 weeks*

**8. Learning curve analysis for series.**
Statistical tools to measure: performance trend slopes, learning rate comparisons between agents, plateau detection, note complexity vs. performance correlation. Visualize as annotated time-series charts.
*Files: `server/metrics.ts`, `client/src/pages/Series.tsx`*
*Effort: 1 week*

**9. Replay with different configuration.**
A "re-run this match" button that copies the seed, keywords, and codes but allows swapping models or prompt strategies. Enables controlled A/B comparison of a single game scenario.
*Files: `server/routes.ts`, `client/src/pages/History.tsx`*
*Effort: 2-3 days*

**10. Cross-population evolution.**
Allow two separately evolved populations (e.g., one from Claude, one from GPT) to compete against each other. This enables genuine co-evolutionary dynamics and cross-model strategy comparison.
*Files: `server/evolution.ts`, `server/routes.ts`, `client/src/pages/Evolution.tsx`*
*Effort: 1 week*

### MEDIUM -- Nice to Have

**11. Embedding-based clue analysis.**
Use text embeddings to compute semantic similarity between clues and keywords. Measure clue quality, detect semantic drift, and identify which keyword associations are most/least vulnerable to interception.
*Files: new `server/semanticAnalysis.ts`, `server/metrics.ts`*
*Effort: 1 week*

**12. Authentication and multi-user support.**
Basic auth (API keys or JWT) to prevent unauthorized experiment launches and API credit consumption. User-scoped experiment history.
*Files: `server/routes.ts`, new `server/auth.ts`, client login page*
*Effort: 1 week*

**13. Programmatic experiment API.**
A clean REST API (or better, a Python SDK) that allows researchers to define, launch, monitor, and analyze experiments without using the web UI. Enable scripting of complex experiment protocols.
*Files: new API documentation, potentially a Python package*
*Effort: 1-2 weeks*

**14. Diversity preservation in evolution.**
Implement fitness sharing or speciation to prevent premature convergence. Track and visualize species/niche formation across generations.
*Files: `server/evolution.ts`, `client/src/pages/Evolution.tsx`*
*Effort: 3-4 days*

**15. Data archival and cleanup.**
Policy for archiving old AI call logs (compress prompt/response text, retain metadata). Table partitioning or migration to cold storage for matches older than configurable threshold.
*Files: `server/storage.ts`, new migration scripts*
*Effort: 3-4 days*

### ASPIRATIONAL -- Dream Features

- **LLM-based ToM analyzer** that uses an AI judge to assess reasoning depth rather than regex patterns
- **Multi-game support** with abstracted game engine interface enabling Werewolf, Codenames, Diplomacy
- **Automated research report generation** that produces draft methodology sections, result tables, and figures from experiment data
- **Public leaderboard and community evolution runs** where multiple researchers contribute to shared evolutionary tournaments
- **Self-modifying prompts (Phase 4 from roadmap)** where agents rewrite their own strategy sections based on game review
- **Natural-language experiment specification** ("Run 100 games of Claude vs GPT using k-level reasoning and measure if interception rates differ at p<0.05")

---

## Summary

Decrypto Arena is surprisingly feature-complete for what appears to be an early-stage research platform. The core pipeline -- game engine, multi-provider AI integration, headless runner, tournaments, series with memory, and evolutionary strategy search -- all function. The metrics computation is thorough. Data export exists. The design documents show genuine research vision.

The critical gaps are at the seams: experiments cannot be properly isolated or compared, prompt strategies do not propagate through the validated API, statistical testing is absent, and there is no real-time monitoring. These are the differences between a demo and a research tool. Fixing items 1-4 from the roadmap would transform this from "interesting prototype" to "platform you could publish research from." Items 5-10 would make it genuinely competitive as an AI behavioral research tool.

The evolution system is the most original feature and has real potential, but needs higher evaluation match counts and cross-population competition to produce publishable results.

The architecture is deeply Decrypto-specific. Adding new games is a major effort that should wait until the Decrypto research pipeline is fully proven. The infrastructure (AI calling, tournament scheduling, evolution, metrics) is separable from game logic and could be abstracted when the time comes.
