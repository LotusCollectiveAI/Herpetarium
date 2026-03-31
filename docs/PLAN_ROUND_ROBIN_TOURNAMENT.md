# Plan: 7-Model 3v3 Round-Robin Tournament

## Overview

Run a full round-robin across 7 frontier models in 3v3 Decrypto format.
C(7,2) = 21 matchups x 4 games each = 84 total matches.

## Infrastructure Assessment

### What Already Works

**Tournament runner (`server/tournament.ts`)** is fully functional:
- `createTournament()` accepts a `TournamentConfig` with an array of `matchConfigs`
- `runTournament()` processes pending matches, tracks completions, handles failures gracefully
- Concurrency supported via batched `Promise.all` (capped at 5 in route validation)
- Budget cap enforcement with per-batch cost checks
- Resume on failure: `resumeIncompleteRuns()` resets "running" matches to "pending" on server restart
- Failed matches get status "failed" and the tournament continues

**Headless runner (`server/headlessRunner.ts`)** supports 3v3:
- `HeadlessMatchConfig` has `teamSize?: 2 | 3`
- Runner accepts 6 players (3 per team) and records `teamSize` in the match row
- Team chatter / deliberation transcripts logged to `team_chatter` table

**Data logging** is comprehensive:
- Every AI call logged to `ai_call_logs` with provider, model, tokens, cost, latency, reasoning trace
- Match rounds logged to `match_rounds`
- Deliberation transcripts logged to `team_chatter`
- `getCumulativeCost()` aggregates cost across match IDs

**Bradley-Terry ratings** already computed in the tournament detail route (`GET /api/tournaments/:id`).

### What's Missing

1. **No round-robin matchup generator.** `TournamentConfig.matchConfigs` is a flat array -- the caller must enumerate all pairings manually. The tournament runner just iterates the array.

2. **No Kimi K2.5 in model registry.** `moonshotai/kimi-k2.5` is absent from both `MODEL_OPTIONS` and `MODEL_COST_PER_1K`.

3. **No per-provider rate limiting.** Concurrent matches hitting the same provider will stack API calls. With concurrency=3 and two matches both using Claude, that's 6+ simultaneous Anthropic API calls per phase. The existing `getProviderThrottleState` is imported but not used for scheduling.

4. **No retry for failed matches.** Failed matches are marked "failed" and skipped. There's no built-in retry mechanism (though resume-on-restart effectively retries "running" matches).

## What to Build

### 1. Add Kimi K2.5 to model registry (shared/schema.ts + server/ai.ts)

In `MODEL_OPTIONS.openrouter`, add:
```
{ value: "moonshotai/kimi-k2.5", label: "Kimi K2.5" }
```

In `MODEL_COST_PER_1K`, add:
```
"moonshotai/kimi-k2.5": { input: 0.0006, output: 0.002 }
```
(Verify pricing on OpenRouter before launch.)

### 2. Round-robin matchup generator (new helper, ~40 lines)

Add a function `generateRoundRobinConfigs()` to `server/tournament.ts`:

```ts
function generateRoundRobinConfigs(
  models: Array<{ name: string; provider: AIProvider; model: string; config: Partial<AIPlayerConfig> }>,
  teamSize: 2 | 3
): HeadlessMatchConfig[]
```

Logic:
- For each pair (i, j) where i < j: model_i gets team amber (all 3 slots), model_j gets team blue (all 3 slots)
- Each player on a team uses the same AI config (same model, same provider, same settings)
- Player names: `"GPT-5.4 (A1)"`, `"GPT-5.4 (A2)"`, `"GPT-5.4 (A3)"` for amber; `"Opus 4.6 (B1)"` etc. for blue
- Returns 21 `HeadlessMatchConfig` objects, each with `teamSize: 3`

This keeps the caller simple: define 7 model specs, get back 21 configs, pass to `createTournament`.

### 3. Add retry support to tournament runner (~15 lines)

After the main loop completes, add a single retry pass for failed matches:
- Query failed matches, reset to "pending", re-run
- Limit to 1 retry pass (no infinite loops)
- Log retry attempts

### 4. Provider-aware concurrency staggering (~20 lines)

Rather than complex per-provider semaphores, add a `delayBetweenMatchesMs` of 5000-10000ms to the tournament config. This is already supported by the runner and provides natural staggering.

For tighter control, sort the matchConfigs so consecutive matches use different providers where possible (simple interleaving). This is a one-time sort before creating the tournament.

## What NOT to Build

- No new UI -- launch via `curl -X POST /api/tournaments`
- No new rating system -- Bradley-Terry is already computed
- No per-provider semaphore system -- delay + interleaving is sufficient
- No match quality scoring
- No new database tables

## Model Configurations

| Model | Provider | Model ID | Reasoning | Timeout | Strategy |
|-------|----------|----------|-----------|---------|----------|
| GPT-5.4 | chatgpt | gpt-5.4 | high | 4h | default |
| Opus 4.6 | claude | claude-opus-4-6 | xhigh | 4h | default |
| Gemini 3.1 Pro | gemini | gemini-3.1-pro-preview | high | 4h | default |
| Grok 4.20 | openrouter | x-ai/grok-4.20-beta | high | 4h | default |
| DeepSeek V3.2 | openrouter | deepseek-ai/deepseek-v3.2 | high | 4h | default |
| Qwen 3.6 Plus | openrouter | qwen/qwen3.6-plus-preview | high | 4h | default |
| Kimi K2.5 | openrouter | moonshotai/kimi-k2.5 | high | 4h | default |

All models: `temperature: 0.7`, `promptStrategy: "default"`, `timeoutMs: 14400000` (4 hours).

## Tournament Config

```json
{
  "name": "Frontier 7-Model 3v3 Round Robin — April 2026",
  "matchConfigs": "<generated by generateRoundRobinConfigs>",
  "gamesPerMatchup": 4,
  "concurrency": 3,
  "delayBetweenMatchesMs": 8000,
  "budgetCapUsd": "150.00"
}
```

**Why 4 games per matchup:** 3 is the minimum for a majority signal; 4 gives a cleaner win-rate distribution and catches ties (2-2 splits are informative). Total: 84 matches.

**Why concurrency 3:** Balances throughput against API rate limits. With 7 models across 4 providers, concurrency 3 means at most 3 simultaneous matches. Each 3v3 match makes ~6 AI calls per phase (3 clue-givers don't overlap with guessers), so peak concurrent calls per provider stays manageable.

**Budget estimate:** At ~$1-2 per 3v3 match (dominated by Opus at $0.025/1K output), 84 matches should cost $80-150. Budget cap at $150 provides a safety net.

## Launch Sequence

1. Add Kimi K2.5 to `MODEL_OPTIONS` and `MODEL_COST_PER_1K`
2. Add `generateRoundRobinConfigs()` helper
3. Add retry pass to tournament runner
4. Sort matchConfigs for provider interleaving
5. Verify all 7 API keys are set in environment
6. Launch:
   ```bash
   curl -X POST http://localhost:5000/api/tournaments \
     -H "Content-Type: application/json" \
     -d @tournament-config.json
   ```
7. Monitor via `GET /api/tournaments/:id`

## Estimated Timeline

- Steps 1-4: ~1 hour of code changes
- Step 5: Environment check
- Step 6-7: 84 matches at ~15-30 min each with concurrency 3 = ~7-14 hours wall clock
