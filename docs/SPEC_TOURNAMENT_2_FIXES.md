# Tournament 2 Revised Spec

## Purpose

Tournament 2 should not be a larger version of Tournament 1. It should be a cleaner research run built on four concrete improvements:

1. Model metadata must have one canonical source of truth.
2. Runtime reliability must be managed per model endpoint, not only per provider.
3. Match quality must be explicit, queryable, and reviewable.
4. Player identity must be persisted well enough to support mixed-model teams and transcript analysis.

This spec is grounded in the current implementation, not an idealized rewrite.

## Design Principles

1. LLM intelligence stays at the center. We do not replace model reasoning with deterministic heuristics.
2. Timeouts are infrastructure guards, not cognitive limits. Tournament configs can still set very long per-call timeouts.
3. Rich prompts and full transcripts are first-class research artifacts.
4. Observability is part of the product, not a debug add-on.
5. Favor additive, composable changes over schema churn and one-off special cases.

## Current Code Reality

These are the constraints the revised design must respect.

- `server/ai.ts:38-99` has provider-level backoff, but no per-model health state. A dead model can still be called forever if the provider itself is healthy.
- `server/ai.ts:171-212`, `server/ai.ts:614-648`, and `shared/schema.ts:18-66` duplicate model metadata across cost tables, default mappings, reasoning detection, and UI options.
- `server/headlessRunner.ts:50-68` wraps clue, guess, and interception generation in `withTimeout`, but `server/headlessRunner.ts:268-420` calls `generateDeliberationMessage` directly with no timeout guard.
- `server/headlessRunner.ts:76-98` writes AI logs without `playerId`, `playerName`, or `team`, so taint detection and mixed-team analytics are underpowered.
- `server/headlessRunner.ts:497-503` stores only `{ id, name, isAI, aiProvider, team }` in `matches.playerConfigs`, which means the exact per-player model configuration is lost after the match is created.
- `server/tournament.ts:21-75` generates homogeneous teams only and always assigns the lower-index model to amber and the higher-index model to blue.
- `server/tournament.ts:212-255` uses an in-memory `completed++` counter inside concurrent execution, which is race-prone.
- `server/routes.ts:20-53` and `server/routes.ts:896-976` estimate cost from rough constants and count model instances per player, which overstates cost for 3v3 teams.
- `server/routes.ts:1124-1178` infers model identity from player names, which breaks as soon as teams are heterogeneous.
- `shared/schema.ts:265-323` already has raw transcript and AI call tables, so transcript analysis should build on them, not replace them.
- `shared/schema.ts:386-409` already allows per-player `aiConfig` in `HeadlessMatchConfig`. Mixed-model support is mostly a persistence and authoring problem, not a runner problem.
- `server/game.ts:169-186` rotates clue giver by player order. Any mixed-team design must preserve stable seat ordering.

## Scope Decisions

### In Scope

- A shared `MODEL_REGISTRY`
- Preflight model validation
- Per-model circuit breaker
- Deliberation timeout protection
- Match taint detection and replay policy
- Persistent player identity for analytics
- Mixed-model team authoring and storage
- Deterministic transcript analysis pipeline
- Health and quality observability endpoints

### Explicitly Deferred

- Major game rule changes such as raising the loss threshold
- LLM-first transcript analysis
- Persisting circuit breaker state across process restarts
- A full UI redesign

Tournament 2 first needs clean data. Rule changes can follow once the platform stops contaminating runs.

## Architecture

### 1. Canonical Model Registry

Create `shared/modelRegistry.ts` as the single source of truth for blessed models.

This file belongs under `shared/`, not `server/`, because both the server and any client-facing schemas/options consume model metadata today.

#### Responsibilities

- Canonical model id and provider pairing
- Display label
- Cost per 1K tokens
- Capability flags used by `server/ai.ts`
- Provider-specific reasoning mode
- Default config for `getDefaultConfig`
- UI options currently emitted by `MODEL_OPTIONS`
- Optional status flags such as `deprecated` or `experimental`

#### Proposed Shape

```ts
export type ReasoningMode =
  | "none"
  | "openai_reasoning_effort"
  | "anthropic_thinking"
  | "gemini_thinking"
  | "openrouter_reasoning";

export interface ModelSpec {
  key: string; // provider:model
  provider: AIProvider;
  model: string;
  displayName: string;
  costPer1K?: { input: number; output: number };
  reasoningMode: ReasoningMode;
  supportsTemperature: boolean;
  defaults: Pick<AIPlayerConfig, "timeoutMs" | "promptStrategy" | "reasoningEffort"> & {
    temperature?: number;
  };
  thinkingBudgetByEffort?: Partial<Record<AIPlayerConfig["reasoningEffort"], number>>;
  tags?: string[];
  deprecated?: boolean;
}
```

#### Helper API

- `MODEL_REGISTRY`
- `getModelSpec(provider, model)`
- `listModelOptions(provider)`
- `getDefaultModelSpec(provider)`
- `getCostSpec(provider, model)`
- `isRegisteredModel(provider, model)`
- `getDefaultConfig(provider)`

#### Policy for Unknown Models

Do not make the registry a hard wall around experimentation.

- Registered models are the default path for UI and tournaments.
- Unknown models are allowed only through explicit bypass on direct API calls.
- Unknown models opt out of cost estimation and capability-based prompt tweaks unless manually supplied.

This keeps the registry authoritative without making the platform hostile to one-off research runs.

#### Files Impacted

- New: `shared/modelRegistry.ts`
- Modify: `shared/schema.ts`
- Modify: `server/ai.ts`
- Modify: `server/routes.ts`

### 2. Reliability Stack

The current provider throttle and the new model breaker solve different problems. Keep both.

The circuit breaker is for endpoint health only. It should react to transport failures, hard API errors, and local timeouts. It should not trip on plain output-format violations such as a model returning unparsable clues. Those belong in the match-quality layer.

#### 2.1 Provider Backoff Stays

`server/ai.ts:12-36` and `server/ai.ts:62-99` already maintain provider-level rate-limit state. That is still useful because rate limits are often provider-wide.

Keep this mechanism, but make it one layer in a broader reliability stack.

#### 2.2 Add Error Classification

Introduce a small classification layer in `server/ai.ts` or a new `server/aiErrors.ts`.

```ts
type FailureClass =
  | "rate_limit"
  | "transient"
  | "timeout"
  | "hard_config"
  | "auth"
  | "unknown";

interface ClassifiedFailure {
  failureClass: FailureClass;
  statusCode?: number;
  signature: string;
  retryAfterMs?: number;
  message: string;
}
```

Key point: the circuit breaker should trip on normalized failure signatures, not raw provider error strings.

Examples:

- OpenRouter 404 model missing -> `hard_config`, signature `openrouter:404:model_not_found`
- Gemini `RESOURCE_EXHAUSTED` -> `rate_limit`
- Anthropic 529 -> `transient`
- local `withTimeout` expiry -> `timeout`

#### 2.3 Per-Model Circuit Breaker

Create `server/circuitBreaker.ts`.

Keyed by `provider:model`, not by provider alone.

```ts
type BreakerStatus = "closed" | "open" | "half_open" | "disabled";

interface ModelCircuitState {
  key: string;
  status: BreakerStatus;
  consecutiveFailures: number;
  consecutiveTimeouts: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureClass?: FailureClass;
  lastFailureSignature?: string;
  lastFailureAt?: number;
  openUntil?: number;
  openCount: number;
  probeInFlight: boolean;
}
```

#### State Rules

- `closed -> open`
  - after 3 consecutive transient failures
  - or 2 consecutive timeouts
  - or 2 identical hard-config failures when preflight was bypassed
- `open -> half_open`
  - when `openUntil` passes
- `half_open -> closed`
  - after 2 successful probe calls
- `half_open -> open`
  - on any new transient or timeout failure
- `any -> disabled`
  - after fatal preflight failure
  - or after repeated identical hard-config failure in runtime

#### Backoff Schedule

- first open: 30 seconds
- second open: 2 minutes
- third and later: 10 minutes cap

This is aggressive enough to stop hammering dead endpoints without disabling models for transient provider incidents.

#### Integration Points

- `server/ai.ts`
  - `callAI` checks `breaker.beforeCall(modelKey)`
  - `callAI` records `onSuccess` or `onFailure`
- `server/headlessRunner.ts`
  - when `withTimeout` returns `timedOut: true`, record a local timeout against the breaker
- `server/tournament.ts`
  - scheduler consults breaker before launching a queued match
  - if a model is `open`, leave the match in queue
  - if a model is `disabled`, do not launch; mark the tournament match tainted immediately

#### Practical Note About Timeouts

Current `withTimeout` is synthetic. It returns a fallback result but does not cancel the underlying provider request.

That means timeout handling is currently a scheduler safeguard, not true request cancellation. The breaker should still record the local timeout because the match already consumed fallback behavior, but the spec should not pretend we have provider-agnostic abort support today.

### 3. Preflight Model Validation

Tournament creation should validate unique model endpoints before any matches are created or started.

#### Flow

1. Resolve each unique `provider:model` through `MODEL_REGISTRY` unless bypassed.
2. Run a lightweight live smoke call per unique model.
3. Produce a validation report.
4. Block tournament creation unless `skipValidation` is explicitly set.

#### API Surface

- `POST /api/tournaments/validate`
- `POST /api/tournaments`
  - new optional fields:
    - `skipValidation?: boolean`
    - `allowUnregisteredModels?: boolean`

#### Persistence

Store the validation report on the tournament record, either as a new `preflightReport` column or inside tournament config under a dedicated key. Prefer a dedicated column for cleaner querying.

#### Why This Matters

This is the fastest way to prevent the exact failure mode described in Tournament 1 synthesis: thousands of wasted calls on model ids that were invalid from the first request.

### 4. Identity and Persistence Normalization

The current schema is good enough for homogeneous teams and raw logs. It is not good enough for mixed-model teams, taint analysis, or transcript analytics.

#### 4.1 Canonical Player Snapshot

Expand the player snapshot stored in `matches.playerConfigs`.

Today it stores only:

- `id`
- `name`
- `isAI`
- `aiProvider`
- `team`

It should also store:

- `seat`
- full `aiConfig`
- canonical `modelKey`
- optional `teamLabel`
- optional `compositionId`

This removes the need to recover identity from player names later.

#### 4.2 AI Call Log Identity

Add the following to `ai_call_logs`:

- `playerId`
- `playerName`
- `team`
- `seat`

This is required for:

- match taint assessment
- mixed-team analytics
- transcript analysis that joins behavior back to a concrete player

#### 4.3 Match Quality Fields

Add to `matches`:

- `dataQuality` (`clean` | `tainted`)
- `qualityFlags` (`jsonb` array of reason codes)

Add to `tournament_matches`:

- `dataQuality`
- `taintReasons`
- `attemptMatchIds` (`jsonb` array)
- `selectedMatchId` or keep `matchId` as canonical final selection and use `attemptMatchIds` for history

This gives clean separation between the physical match runs and the tournament scheduler's chosen canonical result.

### 5. Tainted Match Detection

Taint detection should be reason-based, not score-based.

#### Match Quality Rule

Any match is `tainted` if one or more of the following occur:

- any `generate_clues` call used fallback
- any `generate_clues` call timed out
- a participating model was `disabled` by the breaker before or during the match
- the match completed after a preflight override for an invalid model

Optional secondary reasons to record without mandatory exclusion:

- deliberation timeout
- guess/interception fallback
- missing transcript row for a 3v3 phase

This is intentionally stricter than a `>25% fallback rate` rule. A single clue-generation fallback already contaminates the round in a way that meaningfully affects the game.

#### Reason Codes

```ts
type QualityFlag =
  | "clue_fallback"
  | "clue_timeout"
  | "guess_fallback"
  | "intercept_fallback"
  | "deliberation_timeout"
  | "model_disabled"
  | "preflight_override"
  | "missing_transcript";
```

#### Replay Policy

- Tournament 2 should not auto-replay tainted matches.
- Tainted matches stay queryable and visible, but are excluded from default analytics unless explicitly requested.
- Manual replay can be added later as an operator action once health and quality reporting are stable.
- If manual replay is added later, preserve attempt history instead of overwriting the first run.

### 6. Deliberation Timeout Protection

`server/headlessRunner.ts:268-420` must stop being the one major path without timeout protection.

#### Required Changes

- Wrap `generateDeliberationMessage` in `withTimeout`, using the current player's `config.timeoutMs`
- Record timeout status in `ai_call_logs`
- Record timeout in the circuit breaker
- Do not add a small fixed phase-level wall-clock cap in Tournament 2

#### Scope

This is not a short-thinking policy.

- Per-player timeout remains researcher-controlled.
- Tournament configs can still use multi-hour timeouts.
- Once each deliberation call is bounded by the configured per-player timeout, the existing exchange cap is enough for Tournament 2.

### 7. Mixed-Model Teams

The runner already supports mixed-model teams. The schema and analytics do not.

#### Important Architectural Choice

Do not create a new nested runtime schema for mixed teams.

`HeadlessMatchConfig.players[]` should remain the canonical wire format because:

- it already works with `runHeadlessMatch`
- player order already defines clue-giver rotation via `server/game.ts:169-186`
- every other system in the backend already consumes `players[]`

#### What To Add

Add an authoring helper for tournament creation:

```ts
interface TeamBlueprint {
  compositionId: string;
  teamLabel: string;
  members: Array<{
    seat: 1 | 2 | 3;
    name: string;
    aiProvider: AIProvider;
    aiConfig: AIPlayerConfig;
  }>;
}
```

Compile this into ordered `players[]`.

#### Why This Matters

- Mixed teams become a first-class research condition.
- Seat order is explicit and reproducible.
- Clue-giver rotation becomes analyzable by model and seat.
- Cross-model deliberation and compatibility can be measured without inventing a second execution format.

#### Analytics Consequence

Any code that currently deduplicates by team or extracts model names from player names must be replaced.

That includes:

- `server/routes.ts:1124-1178`
- any metrics helper that assumes one model per team

### 8. Tournament Scheduling and Progress

#### 8.1 Balanced Round-Robin Generation

`server/tournament.ts:21-75` should generate both positional assignments for each pairing.

Required behavior:

- `gamesPerMatchup` must be even for round-robin tournaments
- half the games with A on amber and B on blue
- half with B on amber and A on blue

Generate positional balance at config-generation time, not later through duplication logic.

#### 8.2 Health-Aware Scheduling

The queue picker should consider both provider overlap and model health.

Priority order:

1. runnable matches with no open or disabled model
2. among those, prefer low provider overlap
3. if every queued match is blocked by open circuits, sleep until the nearest `openUntil`

This avoids a hot loop and makes breaker state operationally meaningful.

#### 8.3 Progress Counter

Stop relying on a shared local counter in concurrent code.

Tournament progress should be derived from database state:

- completed
- failed
- tainted
- skipped

### 9. Transcript Analysis Pipeline

Tournament 1 already produced the raw data. Tournament 2 should ship with an analysis layer over it.

#### Input Tables

- `team_chatter`
- `matches`
- `match_rounds`
- `ai_call_logs`

#### Persistence Strategy

Do not require a new table for the first implementation.

- Compute deterministic transcript analysis from existing rows in `team_chatter`, `matches`, `match_rounds`, and `ai_call_logs`.
- Return the computed result from read APIs.
- Add a persisted cache table only if query volume or analysis cost justifies it later.

#### Analysis Pass 1: Deterministic Heuristics

Start with cheap, explainable signals:

- exact own-keyword mentions
- obvious code mapping leaks (`slot 3`, `#2`, `keyword 4`, `READY: 1,2,3`)
- disagreement markers (`I disagree`, `alternative`, `maybe instead`)
- hedging markers (`maybe`, `probably`, `uncertain`, `not sure`)
- direct references to opponent transcript content in intercept phases

#### Analysis Pass 2: Optional Semantic Layer

Only after deterministic analysis is stable:

- optional LLM-assisted semantic leakage pass
- cached by `analysisVersion`
- off by default for routine backfills

#### API Surface

- `GET /api/analysis/transcripts`
- `GET /api/analysis/transcripts/:matchId`
- extend `GET /api/matches/:id` to optionally include chatter and transcript analysis

### 10. Observability and Export

Add first-class observability for the new health and quality states.

#### New Endpoints

- `GET /api/models`
- `GET /api/tournaments/:id/health`
- `GET /api/tournaments/:id/quality-summary`

#### Export Changes

Extend export routes to include:

- `dataQuality`
- `qualityFlags`
- `playerId`
- `playerName`
- `team`
- `seat`
- transcript analysis summaries when available

Observability is the difference between "the tournament finished" and "the tournament produced defendable data."

## Recommended File Layout

### New Files

- `shared/modelRegistry.ts`
- `server/circuitBreaker.ts`
- `server/aiErrors.ts` (optional if classification is separated)
- `server/transcriptAnalyzer.ts`

### Existing Files To Modify

- `shared/schema.ts`
- `server/ai.ts`
- `server/headlessRunner.ts`
- `server/tournament.ts`
- `server/routes.ts`
- `server/storage.ts`
- `server/exportRouter.ts`
- `server/metrics.ts`

## Acceptance Criteria

Tournament 2 is ready when all of the following are true:

1. A bad model id is caught before tournament start, or disabled within the first few runtime calls if validation was bypassed.
2. No model can silently absorb thousands of repeated hard failures.
3. Every AI log can be tied back to a concrete player, team, seat, provider, and model.
4. A match with clue fallback is marked tainted automatically and excluded from default tournament analytics.
5. Round-robin tournaments are position-balanced by construction.
6. Mixed-model teams can be represented without relying on player-name parsing.
7. Deliberation calls are timeout-protected and those timeouts are visible in logs and health state.
8. Transcript analyses can be backfilled over existing `team_chatter` rows and queried without running new matches.
9. Tournament status exposes both model health and data quality summaries.

## Summary

The practical path to Tournament 2 is not a giant rewrite. It is a normalization pass around model metadata, health state, and persistent identity.

The most important architectural decisions in this revision are:

- put the model registry in `shared/`
- keep `players[]` as the canonical runtime schema
- treat any clue fallback as taint
- keep provider backoff and add model breaker on top
- make transcript analysis deterministic-first

Those choices keep the platform flexible for research while fixing the exact failure modes that invalidated large parts of Tournament 1.
