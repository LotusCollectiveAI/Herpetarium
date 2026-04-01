# Tournament 2 Implementation Plan

This plan follows the revised spec and the current codebase shape. It is ordered to reduce rework: first create a canonical model layer, then add runtime reliability, then make analytics roster-aware, then add transcript analysis and observability.

## Working Assumptions

- The repo currently has `npm run check` but no dedicated test runner.
- For pure logic in the early phases, the cheapest practical verification path is:
  - `npm run check`
  - small table-driven scripts under `scripts/` or targeted `tsx` entrypoints
  - mocked/injected provider calls for validation and health logic
- If the team wants a real unit-test harness, add it once during Phase 1 and reuse it for the remaining phases. Do not add a heavyweight test migration in the middle of runtime work.

## Phase 1: Canonical Model Layer

### Step 1: Introduce `MODEL_REGISTRY` and normalization helpers

- Files to modify:
  - `shared/modelRegistry.ts` (new)
  - `shared/schema.ts`
  - `server/ai.ts`
  - `server/routes.ts`
- Specific changes:
  - Create a shared `MODEL_REGISTRY` keyed by `provider:model`.
  - Move canonical model metadata into the registry: display names, pricing, default config, reasoning support, temperature support, reasoning budgets, smoke-test prompt metadata.
  - Add helpers such as `getModelKey()`, `getModelEntry()`, `getProviderModels()`, `getDefaultConfigForProvider()`.
  - Replace `MODEL_OPTIONS`, `getDefaultConfig`, `MODEL_MAP`, and `MODEL_COST_PER_1K` usage with registry lookups.
  - Replace hardcoded capability checks in `server/ai.ts` with registry-driven checks where possible.
- Dependencies:
  - None.
- Complexity:
  - `M`
- Testing approach:
  - Run `npm run check`.
  - Add a small `tsx` verification script that asserts:
    - every default provider model resolves through the registry
    - pricing lookups work
    - unknown model handling is explicit
    - `shared/schema.ts` exports the same UI options expected by current forms

### Step 2: Add preflight model validation to tournament creation

- Files to modify:
  - `server/modelValidation.ts` (new)
  - `server/routes.ts`
  - `server/tournament.ts`
  - `shared/schema.ts`
- Specific changes:
  - Add a unique-model extraction helper based on canonical model keys.
  - Add a live smoke-test validator for each unique model config.
  - Extend tournament request schema with `skipModelValidation?: boolean`.
  - Run validation in both `/api/tournaments` and `/api/tournaments/round-robin`.
  - Return structured failures when validation blocks launch.
  - Make `runTournament` resume path capable of re-running validation when appropriate.
- Dependencies:
  - Step 1.
- Complexity:
  - `M`
- Testing approach:
  - Run `npm run check`.
  - Add mocked validation tests for:
    - all-valid models
    - one invalid model id
    - `skipModelValidation=true`
    - duplicate players sharing the same model config

## Phase 2: Runtime Reliability And Match Quality

### Step 3: Add tournament-scoped model health and circuit breaker

- Files to modify:
  - `server/modelHealth.ts` (new)
  - `server/ai.ts`
  - `server/tournament.ts`
  - `server/routes.ts`
- Specific changes:
  - Create a model-keyed health tracker separate from provider throttle state.
  - Classify terminal outcomes into `config`, `rate_limit`, `transient`, `timeout`, and `unknown`.
  - Update `callAIWithBackoff` to:
    - consult model health before the provider call
    - keep existing provider-level backoff behavior
    - report one terminal outcome per top-level action call
  - Update the tournament scheduler so paused models are deferred and disabled models cause matches to be skipped/marked tainted instead of launched.
  - Add a route for active tournament model health.
- Dependencies:
  - Step 1
  - Step 2 for strong `config` failure classification
- Complexity:
  - `L`
- Testing approach:
  - Run `npm run check`.
  - Add table-driven health state tests for:
    - repeated transient failures causing pause
    - repeated config failures causing disable
    - successful recovery after pause
    - provider throttle and model breaker interacting without collapsing into one state
  - Add a scheduler-level test or script showing paused matches remain queued while healthy matches continue.

### Step 4: Bring deliberation onto the same timeout and fallback instrumentation path

- Files to modify:
  - `server/headlessRunner.ts`
  - `shared/schema.ts`
- Specific changes:
  - Wrap `generateDeliberationMessage` in `withTimeout(config.timeoutMs, ...)`.
  - Record real `timedOut`, `usedFallback`, and `error` values for deliberation logs.
  - Extend `ChatterMessage` with explicit status metadata so transcript analysis does not have to infer timeouts from blank content.
  - Make deliberation failures emit structured hard-taint events when synthetic output is injected.
- Dependencies:
  - None strictly required, but Step 3 makes downstream health reporting more coherent.
- Complexity:
  - `M`
- Testing approach:
  - Run `npm run check`.
  - Add a local mock-driven run of `processDeliberation` covering:
    - normal reply
    - timeout
    - provider error
    - no consensus without fallback

### Step 5: Persist match quality and taint summaries

- Files to modify:
  - `shared/schema.ts`
  - `migrations/*` (new migration)
  - `server/storage.ts`
  - `server/headlessRunner.ts`
  - `server/tournament.ts`
  - `server/routes.ts`
- Specific changes:
  - Add persisted match-level quality fields such as `qualityStatus` and `qualitySummary` to `matches`.
  - Add corresponding quality fields to `tournament_matches`.
  - Make `runHeadlessMatch` return a structured `MatchQualitySummary`.
  - Persist hard taint reasons and soft warnings when the match completes.
  - Update tournament detail routes so clean/tainted counts are explicit.
  - Default tournament summaries and ratings to clean-only data, with opt-in `includeTainted=true`.
- Dependencies:
  - Step 3
  - Step 4
- Complexity:
  - `L`
- Testing approach:
  - Run `npm run check`.
  - Validate migration locally against an existing dev database.
  - Add integration-style scripts for:
    - clean match persistence
    - tainted match persistence
    - tournament summaries with and without tainted matches included

### Step 6: Fix supporting tournament runtime issues while touching the same code

- Files to modify:
  - `server/tournament.ts`
  - `server/routes.ts`
  - `server/storage.ts` if helper queries are needed
- Specific changes:
  - Stop treating the in-memory `completed` counter as authoritative; derive counts from `tournament_matches` status when reporting.
  - Use registry pricing in cost estimation instead of a duplicate map.
  - Make round-robin generation support mirrored fixtures or another explicit side-balancing strategy.
- Dependencies:
  - Step 1
  - Step 5 for clean/tainted summary reporting
- Complexity:
  - `M`
- Testing approach:
  - Run `npm run check`.
  - Create a concurrency stress script for tournament progress counting.
  - Verify side-balanced round-robin output shape for an odd and even number of games per matchup.

## Phase 3: Explicit Mixed-Team Metadata

### Step 7: Add roster metadata without replacing the working player schema

- Files to modify:
  - `shared/schema.ts`
  - `server/headlessRunner.ts`
  - `server/tournament.ts`
  - `server/routes.ts`
- Specific changes:
  - Extend `HeadlessMatchConfig` with optional `teamRosters`.
  - Add roster helpers to derive `rosterId`, `label`, and `compositionKey` from `players` when omitted.
  - Persist roster metadata with matches so later analytics do not need to infer team composition from names.
  - Keep `players` as the execution contract to avoid breaking the runner.
- Dependencies:
  - Step 1
- Complexity:
  - `M`
- Testing approach:
  - Run `npm run check`.
  - Add fixture coverage for:
    - homogeneous 2v2
    - homogeneous 3v3
    - mixed 3v3
    - legacy payload with no `teamRosters`

### Step 8: Remove one-model-per-team assumptions from stats, routes, and exports

- Files to modify:
  - `server/routes.ts`
  - `server/metrics.ts`
  - `server/exportRouter.ts`
  - any analysis helpers that still parse `player.name`
- Specific changes:
  - Replace `getModelLabel()` name parsing with roster-aware or player-config-aware helpers.
  - Audit metric functions that deduplicate to one model per team and make them explicit about whether they are:
    - per-player metrics
    - per-model metrics
    - per-roster metrics
  - Ensure tournament stats and Bradley-Terry inputs only use comparisons that are still well-defined for mixed teams.
  - Update exports so team composition is emitted explicitly.
- Dependencies:
  - Step 7
  - Step 5 for clean-only filtering
- Complexity:
  - `L`
- Testing approach:
  - Run `npm run check`.
  - Compare homogeneous-team metrics before and after the change to confirm no regression.
  - Add mixed-team fixtures to confirm routes no longer depend on player-name parsing.

## Phase 4: Transcript Analysis And Observability

### Step 9: Build deterministic transcript analysis

- Files to modify:
  - `server/transcriptAnalyzer.ts` (new)
  - `server/routes.ts`
  - `server/storage.ts` only if additional fetch helpers are useful
- Specific changes:
  - Build a deterministic analyzer over `team_chatter`, `matches`, `match_rounds`, and `ai_call_logs`.
  - Detect direct keyword mentions, code patterns, slot references, hedge terms, disagreement, answer revisions, and opponent-awareness markers.
  - Produce a leakage score and qualitative tags per transcript.
  - Expose match-level and tournament-level transcript analysis routes.
- Dependencies:
  - Step 4
  - Step 7
- Complexity:
  - `M`
- Testing approach:
  - Run `npm run check`.
  - Add transcript fixtures covering:
    - explicit keyword leak
    - code reveal via `READY`
    - healthy debate without leakage
    - terse but consensus-driven discussion

### Step 10: Add operator-facing health and quality endpoints

- Files to modify:
  - `server/routes.ts`
  - `server/tournament.ts`
- Specific changes:
  - Add `GET /api/models`.
  - Add `GET /api/tournaments/:id/health` for model health plus clean/tainted/paused/skipped summaries.
  - Ensure `GET /api/tournaments/:id` and related summary routes expose clean-vs-tainted counts clearly.
  - Make active health endpoints read from in-memory run state and historical quality endpoints read from persisted match/tournament records.
- Dependencies:
  - Step 3
  - Step 5
  - Step 9 for transcript analysis endpoints
- Complexity:
  - `S`
- Testing approach:
  - Run `npm run check`.
  - Manual route verification against:
    - an active run with paused or disabled models
    - a completed tournament with both clean and tainted matches

## Recommended Delivery Slices

If this work needs to be split across PRs, use these boundaries:

1. PR 1: Steps 1-2
2. PR 2: Steps 3-5
3. PR 3: Step 6
4. PR 4: Steps 7-8
5. PR 5: Steps 9-10

This split keeps each PR coherent:

- PR 1 establishes canonical model data.
- PR 2 fixes runtime reliability and data quality.
- PR 3 cleans up tournament operations while those files are already hot.
- PR 4 makes mixed-model research explicit.
- PR 5 turns stored transcript data into usable analysis and operator visibility.

## Risks To Watch

- Registry migration drift: if even one path keeps its own hardcoded model metadata, the registry loses value quickly.
- Overcoupling breaker logic to provider backoff: keep those layers separate.
- Over-tainting: event-based hard taint should be narrow and defensible.
- Under-tainting deliberation: if synthetic deliberation output is not tracked, the transcript dataset stays misleading.
- Mixed-team analytics ambiguity: be explicit about whether a metric is per-player, per-model, or per-roster.

## Definition Of Done

Implementation is done when:

- tournament creation blocks bad model IDs by default
- a broken model stops consuming calls after a small number of terminal failures
- a completed match can still be marked tainted and excluded from rankings
- mixed-model rosters are explicit in stored metadata and route output
- deliberation timeouts/errors are visible in logs and transcript data
- transcript analysis is available without running new games
