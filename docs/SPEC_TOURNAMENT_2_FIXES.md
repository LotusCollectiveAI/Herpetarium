# Tournament 2 Preparation Spec: Fixes, Improvements, and Research Enhancements

**Herpetarium Decrypto Arena -- Comprehensive Development Plan**
**Drafted: 2026-04-01 | Target: Complete before Tournament 2 launch**

---

## Design Principles (Non-Negotiable)

Every change in this spec must respect these axioms:

1. **LLM Intelligence at the absolute center.** Never insert deterministic software mechanisms that constrain or replace organic model behavior. If a model wants to reason for 26 minutes about an interception, that is data, not a bug.
2. **"If it needs to think for four hours, let it."** No artificial time limits on reasoning. Timeouts exist only as safety nets for infrastructure failures, not cognitive constraints.
3. **"A real fishbowl experience of watching AIs reason together."** Observability and richness matter. Every deliberation exchange, every reasoning trace, every strategic note is sacred research data.
4. **Prompts should be rich, strategic, and evocative** -- not terse or template-like.
5. **This is a research tool for studying AI cognition**, not a game for entertainment. Statistical rigor, reproducibility, and data quality override speed and convenience.

---

## PHASE 1: Infrastructure Reliability (Must-Fix Before Tournament 2)

These are the items that caused 71% of all API calls in Tournament 1 to fail, produced 5,661 wasted calls to nonexistent endpoints, and contaminated 62% of all game rounds with fallback data. None of these represent optional improvements. They are all prerequisites for trustworthy data.

---

### 1.1 Circuit Breaker

**What**: A per-model health tracking system that detects cascading failures and stops wasting API calls on models that are clearly broken. After N consecutive identical errors from a model, pause calls for a backoff period. After M total failures within a tournament, disable the model entirely and flag all its matches as tainted.

**Why**: Tournament 1 called the nonexistent Qwen 3.6 Plus endpoint 3,362 times without stopping. DeepSeek's mistyped model ID produced 2,299 failed calls. The system had zero awareness that these models were fundamentally broken -- it just kept hammering dead endpoints, wasting time, polluting logs, and producing matches where lobotomized teams played with `["hint", "clue", "guess"]` fallback clues. A circuit breaker would have detected the pattern within the first 5-10 calls and stopped the bleeding.

**Where**: New file `server/circuitBreaker.ts`, with integration points in `server/ai.ts` (wrap `callAIWithBackoff`), `server/headlessRunner.ts` (check model health before match actions), and `server/tournament.ts` (check health before launching matches, flag tainted results).

**How**:

```
interface ModelHealthState {
  modelId: string;
  consecutiveErrors: number;
  totalErrors: number;
  totalCalls: number;
  lastErrorMessage: string | null;
  lastErrorAt: number;
  status: "healthy" | "degraded" | "paused" | "disabled";
  pauseUntil: number;            // timestamp when pause expires
  backoffMs: number;             // current backoff duration
  identicalErrorStreak: number;  // consecutive errors with same message
}

// State machine:
//   healthy -> degraded   (after 3 consecutive errors)
//   degraded -> paused    (after N=5 consecutive identical errors)
//   paused -> degraded    (after backoff period expires, on next call attempt)
//   paused -> disabled    (after M=25 total errors within tournament)
//   degraded -> healthy   (after 3 consecutive successes)
//   disabled -> (terminal for this tournament run)

// Backoff: exponential with jitter
//   First pause:  30 seconds
//   Second pause: 2 minutes
//   Third pause:  8 minutes
//   Fourth pause: 30 minutes
//   Formula: min(30_000 * 2^pauseCount + random(0, 5000), 1_800_000)

// N=5 for consecutive identical errors -> pause
// M=25 for total errors -> disable
// These are deliberately conservative. Better to pause too early than to
// waste 3,362 calls on a 404.
```

Integration with the rolling pool in `tournament.ts`:
- Before `launchNext()` picks a match, check whether both models in the match are healthy.
- If either model is `paused`, skip that match and pick the next one from the queue (it will be retried when the pause expires).
- If either model is `disabled`, mark the tournament match as `tainted` and move it to a tainted queue for potential replay with a corrected model ID.
- Log all state transitions prominently: `[circuit-breaker] Kimi K2.5 (moonshotai/kimi-k2.5): healthy -> paused after 5 consecutive "truncated JSON" errors. Pausing for 30s.`

The circuit breaker state should be:
- Stored in memory (not DB) -- it is ephemeral per tournament run
- Exposed via a new API endpoint `GET /api/tournament/:id/model-health` for dashboard consumption
- Reset when a tournament starts or resumes

**Risk**: A model that has transient errors early (like Opus 4.6's burst of 529 errors in T1) could get paused prematurely. Mitigation: the pause is temporary (30s minimum), and recovery requires only 3 consecutive successes. The "identical error" requirement also helps -- transient 5xx errors with varying messages won't trigger the streak counter as aggressively as a consistent 404.

**Priority**: MUST-HAVE. This is the single highest-impact fix. Without it, any model ID typo or quota exhaustion will silently contaminate an entire tournament.

---

### 1.2 Model ID Pre-Flight Validation

**What**: Before a tournament starts, make one lightweight test call to each unique model ID in the tournament configuration. If any model fails validation, block the tournament from launching and report which models failed. Include a `--force-start` override for when you know an endpoint is flaky but want to try anyway.

**Why**: The DeepSeek V3.2 fiasco in Tournament 1 was caused by a prefix typo: `deepseek-ai/deepseek-v3.2` instead of `deepseek/deepseek-v3.2`. This produced 2,299 calls that all returned 400 Bad Request. A single test call before the tournament would have caught this instantly. Similarly, the Qwen 3.6 Plus model ID (`qwen/qwen3.6-plus-preview`) returned 404 on every call -- it simply does not exist on OpenRouter. One pre-flight check would have saved all 3,362 wasted calls and the 24 meaningless matches those models "played."

**Where**: New function `validateModels()` in `server/ai.ts` or `server/modelRegistry.ts` (see 1.8). Called from `server/tournament.ts` in `createTournament()` and from `server/routes.ts` in the tournament creation endpoint.

**How**:

```typescript
async function validateModelId(config: AIPlayerConfig): Promise<{
  valid: boolean;
  model: string;
  provider: string;
  error?: string;
  latencyMs: number;
}> {
  // Minimal test call: short system prompt, trivial user prompt, low max_tokens
  // "Respond with exactly the word 'ok'."
  // This costs fractions of a cent per model and takes <5 seconds.
  const testSystemPrompt = "You are a test. Respond with exactly one word.";
  const testUserPrompt = "Say ok.";

  const testConfig: AIPlayerConfig = {
    ...config,
    timeoutMs: 30000,  // 30s timeout for validation -- generous but bounded
    // Keep the model's actual provider/model so we test the real endpoint
  };

  try {
    const start = Date.now();
    await callAIRaw(testConfig, testSystemPrompt, testUserPrompt);
    return { valid: true, model: config.model, provider: config.provider, latencyMs: Date.now() - start };
  } catch (err) {
    return { valid: false, model: config.model, provider: config.provider, error: String(err), latencyMs: Date.now() - start };
  }
}

async function validateTournamentModels(configs: HeadlessMatchConfig[]): Promise<{
  allValid: boolean;
  results: Array<{ model: string; provider: string; valid: boolean; error?: string; latencyMs: number }>;
}> {
  // Extract unique model+provider combinations
  const seen = new Set<string>();
  const uniqueConfigs: AIPlayerConfig[] = [];
  for (const mc of configs) {
    for (const p of mc.players) {
      const key = `${p.aiProvider}:${p.aiConfig?.model || 'default'}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueConfigs.push(p.aiConfig || getDefaultConfig(p.aiProvider));
      }
    }
  }

  // Run all validations in parallel
  const results = await Promise.all(uniqueConfigs.map(c => validateModelId(c)));
  return { allValid: results.every(r => r.valid), results };
}
```

In the tournament creation route (`routes.ts`), add a `skipValidation?: boolean` field to the request body. If `skipValidation` is not set or is false, run validation and return 400 if any model fails:

```json
{
  "error": "Model validation failed",
  "failures": [
    { "model": "qwen/qwen3.6-plus-preview", "provider": "openrouter", "error": "404 Not Found" },
    { "model": "deepseek-ai/deepseek-v3.2", "provider": "openrouter", "error": "400 Bad Request: model not found" }
  ]
}
```

If `skipValidation: true`, log a warning and proceed (the circuit breaker will catch failures at runtime).

**Risk**: A model could pass validation but fail during the tournament (e.g., quota exhaustion after 100 calls). This is expected -- validation catches configuration errors, not runtime reliability. The circuit breaker (1.1) handles runtime failures.

**Priority**: MUST-HAVE. Prevents the entire class of "wrong model ID" errors that contaminated 66% of Tournament 1's matches.

---

### 1.3 Fix Gemini Rate Limit Detection

**What**: Update `isRateLimitError()` in `ai.ts` to detect Google's API-specific error format. Currently the function checks for HTTP status 429 and string patterns like "rate limit" / "too many requests" / "429". But Google's Gemini SDK throws errors with a `RESOURCE_EXHAUSTED` status code, and the error message contains "quota" or "resource exhausted" -- neither of which is caught by the current implementation.

**Why**: Gemini 3.1 Pro had an 87.3% error rate in Tournament 1 -- 1,126 API calls, of which 983 failed. The root cause was Google API quota exhaustion (rate limiting). But because `isRateLimitError()` never recognized these errors as rate limits, the retry-with-backoff logic was never triggered. Every Gemini quota error was treated as a permanent failure, and the system immediately fell back to garbage clues. If the rate limit had been correctly detected, the backoff system would have waited and retried, potentially recovering many of those 983 failed calls.

**Where**: `server/ai.ts`, function `isRateLimitError()` (lines 38-56).

**How**:

```typescript
function isRateLimitError(err: unknown): { isRateLimit: boolean; retryAfterMs?: number } {
  if (!err || typeof err !== "object") return { isRateLimit: false };
  const e = err as any;

  // Check HTTP status codes
  const status = e.status || e.statusCode || e.code;
  if (status === 429 || status === "429") {
    let retryAfterMs: number | undefined;
    const retryAfter = e.headers?.["retry-after"] || e.headers?.get?.("retry-after");
    if (retryAfter) {
      const seconds = parseFloat(retryAfter);
      if (!isNaN(seconds)) retryAfterMs = seconds * 1000;
    }
    return { isRateLimit: true, retryAfterMs };
  }

  // Check Google/gRPC status codes
  // Google's SDK uses gRPC status codes: RESOURCE_EXHAUSTED = 8
  if (status === 8 || status === "RESOURCE_EXHAUSTED") {
    // Google often includes retryDelay in error details
    let retryAfterMs: number | undefined;
    const retryDelay = e.retryDelay || e.errorDetails?.find?.((d: any) => d.retryDelay)?.retryDelay;
    if (retryDelay?.seconds) {
      retryAfterMs = parseInt(retryDelay.seconds) * 1000 + (retryDelay.nanos ? retryDelay.nanos / 1_000_000 : 0);
    }
    return { isRateLimit: true, retryAfterMs };
  }

  // String-based detection as fallback for any provider
  const message = String(e.message || e.error || e.statusMessage || "").toLowerCase();
  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429") ||
    message.includes("resource_exhausted") ||  // NEW: Google gRPC status
    message.includes("resource exhausted") ||  // NEW: Google error message variant
    message.includes("quota") ||               // NEW: Google quota exceeded
    message.includes("tokens per min") ||      // NEW: OpenAI TPM limit messages
    message.includes("requests per min")       // NEW: OpenAI RPM limit messages
  ) {
    return { isRateLimit: true };
  }

  return { isRateLimit: false };
}
```

Additionally, when a Gemini rate limit is detected with a `retryDelay`, respect that delay instead of using the generic exponential backoff. Modify `callAIWithBackoff` to prefer `retryAfterMs` from `isRateLimitError` over the calculated backoff.

**Risk**: Over-broad string matching could misclassify non-rate-limit errors as rate limits, causing unnecessary retries. Mitigation: the strings chosen are specific to rate limiting across all four providers. Monitor logs for false positives after deployment.

**Priority**: MUST-HAVE. Gemini was effectively disabled in Tournament 1 because its rate limits were invisible to the retry system. This fix directly recovers Gemini as a functional tournament participant.

---

### 1.4 Deliberation Timeout

**What**: Wrap every `generateDeliberationMessage` call in `withTimeout`, matching the player's configured timeout. Additionally, add an overall deliberation timeout (per-phase, not per-call) as a safety net against runaway deliberation sequences.

**Why**: The 3v3 deliberation path in `headlessRunner.ts` (the `processDeliberation` function, lines 268-420) calls `generateDeliberationMessage` directly without any timeout wrapper. In Tournament 1, Kimi K2.5 averaged 157 seconds (2.6 minutes) per AI call and up to 7,185 completion tokens. With 10 exchanges and 2 players per exchange, a worst-case deliberation could produce 20 calls x 157 seconds = 52 minutes for a single deliberation phase. If the API hangs instead of responding slowly, a single stuck call blocks that match's concurrency slot indefinitely.

Note: this is NOT about constraining reasoning time. Models that want to think for 4 hours can still do so -- the timeout configured on the player is up to 4 hours (`timeoutMs` max is 14,400,000ms). This is about detecting infrastructure hangs where the API never responds at all.

**Where**: `server/headlessRunner.ts`, inside the `processDeliberation` function (around line 363, the `generateDeliberationMessage` call).

**How**:

```typescript
// Inside processDeliberation, replace the bare call:
//   const callResult = await generateDeliberationMessage(config, { ... });
// With:

const { result: callResult, timedOut } = await withTimeout(
  generateDeliberationMessage(config, {
    systemPrompt,
    userPrompt: prompt,
    ablations: context.ablations,
  }),
  config.timeoutMs,  // Per-player timeout -- respects "let it think" philosophy
  "",                 // Fallback: empty string for deliberation message
  config.model
);

if (timedOut) {
  log(`[headless] WARNING: Deliberation call timed out for ${currentPlayer.name} (${config.model}) in match ${matchId} round ${roundNumber} exchange ${exchange}`, "headless");
}

// Log the call (currently not logging timedOut status for deliberation)
await logAiCall(matchId, gameId, roundNumber, currentPlayer.aiProvider!, actionType, callResult, timedOut, false);
```

For the overall phase timeout, add a check at the top of the deliberation exchange loop:

```typescript
const DELIBERATION_PHASE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour per deliberation phase
// This is generous -- it allows models to think deeply while catching true infrastructure hangs
const phaseStartTime = Date.now();

for (let exchange = 0; exchange < MAX_EXCHANGES; exchange++) {
  if (Date.now() - phaseStartTime > DELIBERATION_PHASE_TIMEOUT_MS) {
    log(`[headless] WARNING: Deliberation phase timeout reached (${DELIBERATION_PHASE_TIMEOUT_MS}ms) for match ${matchId} round ${roundNumber}`, "headless");
    break;  // Fall through to safety-cap answer extraction
  }
  // ... existing exchange logic
}
```

The 1-hour phase timeout is deliberately generous. It exists to catch infrastructure failures (stuck connections, zombie processes), not to constrain model cognition. A model that genuinely reasons for 45 minutes per call in a 10-exchange deliberation is producing extraordinary research data.

**Risk**: If a model is legitimately thinking for a very long time (e.g., Kimi's extended reasoning), the per-call timeout could interrupt it. Mitigation: the per-call timeout uses `config.timeoutMs`, which defaults to 15 minutes and can be set up to 4 hours. Tournament configs already set this to 4 hours for all models. The real protection is the phase-level timeout, which is 1 hour -- long enough for any realistic deliberation.

**Priority**: MUST-HAVE. Without this, a single hung API connection can block a concurrency slot for the entire tournament duration.

---

### 1.5 Fix completedMatches Counter Race

**What**: Replace the in-memory `completed++` counter in `tournament.ts` with a database-derived count to eliminate the lost-update race condition under concurrent match execution.

**Why**: Tournament 1 ran with concurrency 10. The `completed` variable in `runTournament` (line 212) is incremented with `completed++` inside `runSingleMatch` (line 250), which runs concurrently across 10 async workers. JavaScript's event loop means `completed++` is not atomic across `await` boundaries -- if two matches complete "simultaneously" (their completion callbacks interleave), one increment can be lost. Tournament 1 showed 57 completed when reality was 81 completed + 3 stuck as "running." The counter was off by 27.

**Where**: `server/tournament.ts`, the `runSingleMatch` function and the `completed` variable.

**How**:

Replace the in-memory counter entirely. After each match completes, query the database for the authoritative count:

```typescript
// Remove: let completed = tournamentMatches.filter(m => m.status === "completed").length;
// Remove: completed++;

// In runSingleMatch, after updating tournament match status:
async function runSingleMatch(tm: typeof pendingMatches[0]): Promise<void> {
  await storage.updateTournamentMatch(tm.id, { status: "running" });

  try {
    const matchConfig = tm.config as HeadlessMatchConfig;
    const result = await runHeadlessMatch(matchConfig);

    await storage.updateTournamentMatch(tm.id, {
      status: "completed",
      matchId: result.matchId,
      result: { winner: result.winner, totalRounds: result.totalRounds, matchId: result.matchId } as any,
      completedAt: new Date(),
    });

    completedMatchIds.push(result.matchId);

    // DB-derived count -- always accurate regardless of concurrency
    const currentCount = await storage.getCompletedMatchCount(tournamentId);
    await storage.updateTournament(tournamentId, {
      completedMatches: currentCount,
    });

    log(`[tournament] Tournament ${tournamentId} - Match ${currentCount}/${tournamentMatches.length} complete`, "tournament");
  } catch (err) {
    // ... error handling uses same pattern
    const currentCount = await storage.getCompletedMatchCount(tournamentId);
    await storage.updateTournament(tournamentId, { completedMatches: currentCount });
  }
}
```

Add to storage interface:

```typescript
async getCompletedMatchCount(tournamentId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(tournamentMatches)
    .where(and(
      eq(tournamentMatches.tournamentId, tournamentId),
      inArray(tournamentMatches.status, ['completed', 'failed'])
    ));
  return result[0]?.count ?? 0;
}
```

**Risk**: Adds one DB query per completed match. At concurrency 10 with ~168 matches, this is 168 additional simple COUNT queries -- negligible overhead. The query hits an indexed column (`tournament_id`) with a small result set.

**Priority**: MUST-HAVE. An inaccurate progress counter makes it impossible to monitor tournament health in real time.

---

### 1.6 Fix Cost Estimation

**What**: Recalibrate the cost estimation formula in `routes.ts` (`computeEstimatedCost` function) using actual data from Tournament 1, correcting three specific errors: double-counting of 3v3 team players, overestimating rounds per game, and miscounting deliberation exchanges.

**Why**: Tournament 1's estimated cost was $446.85 vs actual cost of $33.27 -- a 13.4x overestimate. This nearly prevented the tournament from being approved. The errors are:

1. **Double-counting team players**: The function iterates over all players in the config, counting each model occurrence. For a 3v3 team of 3 identical models, it counts the model 3 times. But clue generation happens once per team per round (1 clue giver), not once per player. Guessing and interception in 3v3 mode happen via deliberation (already accounted separately), not per-player calls.

2. **Overestimating rounds per game**: `AVG_ROUNDS_PER_GAME = 6`, but Tournament 1's actual average was 2.13 rounds (91% of games ended in exactly 2 rounds, the minimum).

3. **Miscounting deliberation exchanges**: Assumes 8 deliberation calls per round (4 exchanges x 2 players) for both own-guess and intercept phases. Tournament 1 data shows most models reach consensus in 1-2 exchanges (avg 1.1-1.5), not 4.

**Where**: `server/routes.ts`, the `computeEstimatedCost` function (lines 20-53).

**How**:

```typescript
function computeEstimatedCost(
  players: Array<{ aiProvider?: string; aiConfig?: any }>,
  totalGames: number,
  includeReflection = false,
  teamSize: number = 2
): number {
  // Calibrated from Tournament 1 actual data:
  //   Actual avg rounds/game: 2.13 (use 2.5 as conservative estimate)
  //   Actual avg deliberation exchanges: 1.5 own + 1.5 intercept
  //   Clue generation: 1 call per team per round (not per player)
  const AVG_ROUNDS_PER_GAME = 2.5;

  const CALL_TYPE_TOKENS: Record<string, { input: number; output: number; callsPerTeamPerRound: number }> = {
    // Per-team calls (1 per team per round)
    clue:        { input: 1200, output: 300, callsPerTeamPerRound: 1 },
    // 2v2 mode: 1 guess + ~0.5 interceptions per team per round
    guess:       { input: 800, output: 100, callsPerTeamPerRound: teamSize === 3 ? 0 : 1 },
    intercept:   { input: 900, output: 100, callsPerTeamPerRound: teamSize === 3 ? 0 : 1 },
    // 3v3 deliberation: avg 1.5 exchanges * 2 players = 3 calls per team per phase
    deliberation_own:       { input: 2500, output: 600, callsPerTeamPerRound: teamSize === 3 ? 3 : 0 },
    deliberation_intercept: { input: 3500, output: 600, callsPerTeamPerRound: teamSize === 3 ? 3 : 0 },
    reflection:  { input: 1500, output: 400, callsPerTeamPerRound: 0 },
  };

  // Count unique model+provider combinations (NOT per-player)
  // Each matchup has exactly 2 teams, each with one model
  const uniqueModels = new Map<string, { provider: string; model: string }>();
  for (const p of players) {
    if (!p.aiProvider) continue;
    const config = p.aiConfig || getDefaultConfig(p.aiProvider as AIProvider);
    const model = config.model || getDefaultConfig(p.aiProvider as AIProvider).model;
    const key = `${p.aiProvider}:${model}:${p.team || 'unknown'}`;
    // Only count each team's model once, not per-player
    if (!uniqueModels.has(key)) {
      uniqueModels.set(key, { provider: p.aiProvider, model });
    }
  }

  let total = 0;
  for (const [_key, info] of uniqueModels) {
    const costs = MODEL_COST_PER_1K[info.model];
    if (!costs) continue;

    for (const [callType, spec] of Object.entries(CALL_TYPE_TOKENS)) {
      if (callType === "reflection" && !includeReflection) continue;
      const callsPerGame = callType === "reflection" ? 1 : spec.callsPerTeamPerRound * AVG_ROUNDS_PER_GAME;
      const costPerCall = (spec.input / 1000) * costs.input + (spec.output / 1000) * costs.output;
      // 1 team per model per game (not multiplied by team size)
      total += costPerCall * callsPerGame * totalGames;
    }
  }

  return +total.toFixed(4);
}
```

Cross-check against Tournament 1: 84 games at $33.27 actual = ~$0.40/game. With 7 models over 21 matchups and 4 games each, the per-matchup cost was ~$1.58. The new formula should estimate within 2x of actual.

**Risk**: The estimate will still be approximate -- different models have wildly different token usage (Kimi: 7,185 completion tokens avg, Grok: 35 tokens avg). The estimate is useful for budget planning, not precise prediction. Consider adding a range (low/high estimate) based on known model token profiles from Tournament 1 data.

**Priority**: MUST-HAVE. An accurate cost estimate is necessary for budget approval of Tournament 2, especially at higher games-per-matchup counts.

---

### 1.7 Add Retry for Transient Errors

**What**: Extend the retry logic in `callAIWithBackoff` to handle transient non-rate-limit errors: 5xx server errors, network/connection errors, and JSON parse errors from truncated responses. Currently, only 429 rate limit errors trigger retries; all other errors are treated as permanent failures and immediately produce fallback responses.

**Why**: Claude Opus 4.6 had a 34.7% error rate in Tournament 1, primarily from transient Anthropic 529/500 errors in burst patterns. These are classic server-side transient failures that would likely succeed on retry. Kimi K2.5's 2.4% error rate came from truncated JSON responses -- also likely recoverable with a retry. In both cases, the system immediately fell back to garbage clues instead of trying again.

**Where**: `server/ai.ts`, the `callAIWithBackoff` function (lines 62-99) and a new helper `isTransientError`.

**How**:

```typescript
function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  const status = e.status || e.statusCode;

  // 5xx server errors are transient by definition
  if (typeof status === "number" && status >= 500 && status <= 599) return true;
  if (typeof status === "string" && parseInt(status) >= 500) return true;

  const message = String(e.message || e.error || "").toLowerCase();

  // Network/connection errors
  if (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("aborted")
  ) return true;

  // Truncated/malformed responses (common with streaming)
  if (
    message.includes("unexpected end of json") ||
    message.includes("unterminated string") ||
    message.includes("json parse")
  ) return true;

  return false;
}

function isPermanentError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  const status = e.status || e.statusCode;
  // 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found
  // These will never succeed on retry
  if (typeof status === "number" && (status === 400 || status === 401 || status === 403 || status === 404)) return true;
  return false;
}

async function callAIWithBackoff(config: AIPlayerConfig, systemPrompt: string, userPrompt: string): Promise<RawAIResponse> {
  const state = getThrottleState(config.provider);

  // ... existing backoff wait logic ...

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callAIRaw(config, systemPrompt, userPrompt);
      if (state.backoffMs > 0) {
        state.backoffMs = Math.max(0, state.backoffMs * 0.5);
      }
      return result;
    } catch (err) {
      // Check rate limit first (existing logic)
      const { isRateLimit, retryAfterMs } = isRateLimitError(err);
      if (isRateLimit && attempt < MAX_RETRIES) {
        // ... existing rate limit retry logic ...
        continue;
      }

      // NEW: Check for transient errors
      if (!isPermanentError(err) && isTransientError(err) && attempt < MAX_RETRIES) {
        state.totalRetries++;
        const jitter = Math.random() * 500;
        const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt) + jitter, MAX_BACKOFF_MS);
        console.warn(`[ai-retry] ${config.provider}/${config.model} transient error (attempt ${attempt + 1}/${MAX_RETRIES}): ${String(err).slice(0, 100)}. Retrying in ${Math.round(backoff)}ms`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      // Permanent error or retries exhausted -- propagate
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}
```

Do NOT retry:
- 400 Bad Request -- model ID is wrong, prompt is malformed, or parameter is rejected. Will never succeed.
- 401 Unauthorized -- API key is invalid. Will never succeed.
- 403 Forbidden -- access denied. Will never succeed.
- 404 Not Found -- model does not exist. Will never succeed.

These permanent errors should flow through to the circuit breaker for pattern detection.

**Risk**: Retrying a non-idempotent operation could cause double-processing. Mitigation: all AI calls in this system are idempotent (they generate new content each time, and results are only used after successful return). The retry is safe.

**Priority**: MUST-HAVE. Would have recovered a significant fraction of Opus 4.6's 34.7% error rate and Kimi's truncated responses.

---

### 1.8 MODEL_REGISTRY as Single Source of Truth

**What**: Create a centralized `modelRegistry.ts` with a single `MODEL_REGISTRY` object containing all model metadata: model ID, display name, provider, cost per 1K tokens, known constraints, default configuration recommendations, and capability flags. Replace all scattered model references across the codebase with imports from this registry.

**Why**: Model information is currently scattered across four files:
- `shared/schema.ts`: `MODEL_OPTIONS` (display names, model IDs, isReasoning flags)
- `server/ai.ts`: `MODEL_COST_PER_1K` (cost data), `MODEL_MAP` (provider defaults), `isOpenAIReasoningModel()`, `isGeminiThinkingModel()`, `ANTHROPIC_THINKING_BUDGET`, `GEMINI_THINKING_BUDGET`
- `server/routes.ts`: `computeEstimatedCost` (token estimates per call type)
- `server/ai.ts`: provider-specific logic scattered through `callOpenAI`, `callAnthropic`, etc.

When a new model is added or a model's ID changes (as happened with DeepSeek's prefix), you must update all four files -- and if you miss one, you get silent failures (wrong costs, wrong routing, wrong capability detection). A single registry eliminates this class of errors.

**Where**: New file `server/modelRegistry.ts`. Import consumers: `shared/schema.ts`, `server/ai.ts`, `server/routes.ts`, `server/tournament.ts`.

**How**:

```typescript
// server/modelRegistry.ts

export interface ModelSpec {
  id: string;                    // The actual model identifier sent to the API
  displayName: string;           // Human-readable name
  provider: AIProvider;          // "chatgpt" | "claude" | "gemini" | "openrouter"
  costPer1K: { input: number; output: number };
  isReasoning: boolean;          // Uses reasoning/thinking tokens
  isThinking: boolean;           // Has extended thinking / thinking budget support
  maxOutputTokens: number;       // Model's max output token limit
  supportedReasoningEfforts: string[];  // Which reasoning_effort values work
  constraints: string[];         // Known issues, e.g. "no_custom_temperature_with_reasoning"
  defaultTimeoutMs: number;      // Recommended timeout for this model
  thinkingBudgets?: Record<string, number>;  // reasoning_effort -> token budget
  notes?: string;                // Free-form notes for researchers
}

export const MODEL_REGISTRY: Record<string, ModelSpec> = {
  "gpt-5.4": {
    id: "gpt-5.4",
    displayName: "GPT-5.4",
    provider: "chatgpt",
    costPer1K: { input: 0.0025, output: 0.015 },
    isReasoning: false,
    isThinking: false,
    maxOutputTokens: 100000,
    supportedReasoningEfforts: ["low", "medium", "high"],
    constraints: ["no_custom_temperature_with_reasoning_effort"],
    defaultTimeoutMs: 300000,
    notes: "Tournament 1: 0.4% error rate, 4916 avg completion tokens, very efficient",
  },
  "claude-opus-4-6": {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    provider: "claude",
    costPer1K: { input: 0.005, output: 0.025 },
    isReasoning: false,
    isThinking: true,
    maxOutputTokens: 64000,
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    constraints: [],
    defaultTimeoutMs: 300000,
    thinkingBudgets: { low: 5000, medium: 15000, high: 30000, xhigh: 50000 },
    notes: "Tournament 1: 34.7% error rate (transient 529/500), excellent clue sophistication",
  },
  "moonshotai/kimi-k2.5": {
    id: "moonshotai/kimi-k2.5",
    displayName: "Kimi K2.5",
    provider: "openrouter",
    costPer1K: { input: 0.0006, output: 0.002 },
    isReasoning: true,
    isThinking: false,
    maxOutputTokens: 100000,
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    constraints: [],
    defaultTimeoutMs: 600000,  // Kimi averages 3.6 min per call -- needs long timeout
    notes: "Tournament 1: 2.4% error rate, 7185 avg completion tokens, 100% interception rate vs GPT/Opus",
  },
  // ... all other models ...
};

export function validateModelId(id: string): boolean {
  return id in MODEL_REGISTRY;
}

export function getModelSpec(id: string): ModelSpec | undefined {
  return MODEL_REGISTRY[id];
}

export function getModelsByProvider(provider: AIProvider): ModelSpec[] {
  return Object.values(MODEL_REGISTRY).filter(m => m.provider === provider);
}

export function getModelCost(id: string): { input: number; output: number } | undefined {
  return MODEL_REGISTRY[id]?.costPer1K;
}
```

Migration plan:
1. Create `modelRegistry.ts` with all model data consolidated from the four current sources.
2. Update `shared/schema.ts`: derive `MODEL_OPTIONS` from the registry instead of hardcoding.
3. Update `server/ai.ts`: import `MODEL_COST_PER_1K` equivalent from registry, replace `isOpenAIReasoningModel()` and `isGeminiThinkingModel()` with registry lookups, import thinking budgets from registry.
4. Update `server/routes.ts`: use registry for cost estimation.
5. Add the `validateModelId` check to the pre-flight validation (1.2).

**Risk**: The registry introduces a single point of failure -- if a model is missing from the registry, it cannot be used. Mitigation: add a fallback path that allows unknown model IDs with a warning log, so new models can be tested before being formally registered. The registry validates but does not block.

**Priority**: MUST-HAVE. Prevents the class of errors caused by model ID inconsistency across files, and provides the foundation for pre-flight validation (1.2) and accurate cost estimation (1.6).

---

## PHASE 2: Experimental Design Fixes

These changes address the statistical and methodological flaws that made most of Tournament 1's data scientifically uninterpretable. Even with perfect infrastructure, bad experimental design produces bad data.

---

### 2.1 Balanced Team Positions

**What**: Ensure that each matchup has equal games on each side (amber/blue). For N games per matchup, N must be even, with N/2 games as [ModelA=amber, ModelB=blue] and N/2 as [ModelA=blue, ModelB=amber].

**Why**: In Tournament 1, team position was completely confounded with model identity. Kimi K2.5 played blue in 100% of its 24 matches. Blue won 62.5% of all games overall (p=0.014). It is impossible to determine whether Kimi's 24-0 record reflects superior model ability, blue team positional advantage, or both. The 62.5% blue advantage is a massive confound -- if blue has a structural advantage from move order (seeing amber's clues before acting), then any model placed exclusively on blue gets an artificial boost.

The current `generateRoundRobinConfigs()` in `tournament.ts` always assigns `models[i]` to amber and `models[j]` to blue (where i < j). This means the alphabetically/positionally first model in each pair always plays the same side, with no counterbalancing.

**Where**: `server/tournament.ts`, `generateRoundRobinConfigs()` function (lines 21-75), and `createTournament()` function (lines 155-188).

**How**:

```typescript
export function generateRoundRobinConfigs(
  models: RoundRobinModelSpec[],
  teamSize: 2 | 3 = 3,
  gamesPerMatchup: number = 8,  // NEW: must be even
): HeadlessMatchConfig[] {
  if (gamesPerMatchup % 2 !== 0) {
    throw new Error(`gamesPerMatchup must be even for balanced positions, got ${gamesPerMatchup}`);
  }

  const configs: HeadlessMatchConfig[] = [];

  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const modelA = models[i];
      const modelB = models[j];

      // Half the games: A=amber, B=blue
      for (let g = 0; g < gamesPerMatchup / 2; g++) {
        configs.push(buildMatchConfig(modelA, modelB, teamSize, "amber", "blue"));
      }

      // Half the games: A=blue, B=amber (swapped)
      for (let g = 0; g < gamesPerMatchup / 2; g++) {
        configs.push(buildMatchConfig(modelA, modelB, teamSize, "blue", "amber"));
      }
    }
  }

  return configs;
}

function buildMatchConfig(
  modelA: RoundRobinModelSpec,
  modelB: RoundRobinModelSpec,
  teamSize: 2 | 3,
  modelATeam: "amber" | "blue",
  modelBTeam: "amber" | "blue",
): HeadlessMatchConfig {
  const configA: AIPlayerConfig = {
    provider: modelA.provider,
    model: modelA.model,
    timeoutMs: 14400000,
    temperature: 0.7,
    promptStrategy: "advanced",
    reasoningEffort: "high",
    ...modelA.config,
  };
  const configB: AIPlayerConfig = {
    provider: modelB.provider,
    model: modelB.model,
    timeoutMs: 14400000,
    temperature: 0.7,
    promptStrategy: "advanced",
    reasoningEffort: "high",
    ...modelB.config,
  };

  const players: HeadlessMatchConfig["players"] = [];
  const amberModel = modelATeam === "amber" ? modelA : modelB;
  const amberConfig = modelATeam === "amber" ? configA : configB;
  const blueModel = modelATeam === "blue" ? modelA : modelB;
  const blueConfig = modelATeam === "blue" ? configA : configB;

  for (let k = 1; k <= teamSize; k++) {
    players.push({
      name: `${amberModel.name} (A${k})`,
      aiProvider: amberModel.provider,
      team: "amber",
      aiConfig: { ...amberConfig },
    });
  }
  for (let k = 1; k <= teamSize; k++) {
    players.push({
      name: `${blueModel.name} (B${k})`,
      aiProvider: blueModel.provider,
      team: "blue",
      aiConfig: { ...blueConfig },
    });
  }

  return { players, teamSize };
}
```

Also update `createTournament()` to no longer multiply by `gamesPerMatchup` separately -- the round-robin generator now handles that internally. Track position in tournament match metadata so analysis can separate positional effects from model ability.

**Risk**: This doubles the number of unique match configurations compared to T1 (which had 1 config per matchup x 4 copies). The interleaving logic in `interleaveByProvider` still works -- it spreads provider usage across the execution timeline.

**Priority**: MUST-HAVE. Without balanced positions, the blue advantage confound makes head-to-head results scientifically meaningless.

---

### 2.2 Increase Games Per Matchup

**What**: Set the default to 8 games per matchup (4 per side), with configurable override to 12 or 16 for deeper analysis.

**Why**: Tournament 1 used 4 games per matchup. At 4 games, even a 4-0 sweep only gives p=0.125 (two-sided binomial test). A 3-1 result has p=0.625 -- completely uninformative. The 95% confidence interval for a 75% win rate at n=4 is [19.4%, 99.4%]. No pairwise comparison in Tournament 1 reached statistical significance except Kimi's aggregate 24-0 (which benefits from pooling across opponents, a questionable practice).

At 8 games per matchup:
- 8-0 sweep: p=0.008 (significant)
- 7-1: p=0.070 (marginal)
- 6-2: p=0.289 (not significant)

At 12 games per matchup:
- 11-1: p=0.006 (significant)
- 10-2: p=0.039 (significant)
- 9-3: p=0.146 (not significant)

8 games provides a reasonable balance: sweeps and near-sweeps are statistically significant, while the tournament remains manageable in size and cost.

**Where**: `server/routes.ts` (default value in tournament config), `server/tournament.ts` (validation).

**How**: At 7 models, C(7,2) = 21 matchups. At 8 games per matchup = 168 total matches. At Tournament 1's average cost of ~$0.40/game, estimated cost is ~$67. With concurrency 10, runtime is approximately 5-6 hours (Tournament 1 ran 84 matches in 2h50m).

If budget allows, 12 games per matchup = 252 matches at ~$100, providing much stronger statistical power.

Update the default in the tournament creation route:

```typescript
// In routes.ts, tournament creation
const gamesPerMatchup = config.gamesPerMatchup || 8;  // Changed from 1
```

Add validation that `gamesPerMatchup` is even (required by 2.1 balanced positions).

**Risk**: Longer tournament runtime. Mitigation: with concurrency 10 and the circuit breaker preventing wasted calls, runtime should be roughly proportional to match count. The provider-interleaving scheduler already minimizes contention.

**Priority**: MUST-HAVE. Without sufficient sample size, tournament results are noise, not signal.

---

### 2.3 Tainted Match Detection and Replay

**What**: After each match completes, automatically assess data quality by checking whether either team had an excessive fallback rate on clue generation. If so, mark the match as "tainted" and queue it for automatic replay at the end of the tournament.

**Why**: In Tournament 1, 62.9% of all rounds had at least one fallback clue. Matches where a model's API failed and it played with `["hint", "clue", "guess"]` (or the new generic fallback pool) produce meaningless data -- the team cannot decode its own clues, guaranteeing rapid miscommunication loss. These matches look like "Model X lost to Model Y" when really "Model X's API was broken." Including them in rankings is scientifically dishonest.

**Where**: `server/headlessRunner.ts` (post-match quality check), `server/tournament.ts` (tainted match handling and replay), `shared/schema.ts` (schema updates).

**How**:

Add a `dataQuality` field to tournament matches:

```typescript
// In shared/schema.ts, add to tournamentMatches table:
dataQuality: varchar("data_quality", { length: 20 }).notNull().default("unknown"),
// Values: "clean", "tainted", "replayed", "unknown"
```

After each match completes in `runSingleMatch`, assess quality:

```typescript
async function assessMatchQuality(matchId: number): Promise<"clean" | "tainted"> {
  // Query ai_call_logs for this match's clue generation calls
  const logs = await storage.getAiCallLogsByMatch(matchId);
  const clueLogs = logs.filter(l => l.actionType === "generate_clues");

  if (clueLogs.length === 0) return "clean";

  // Check fallback rate per team
  const teams = new Map<string, { total: number; fallback: number }>();
  for (const log of clueLogs) {
    // Determine team from player config
    const team = log.provider; // Need to extract team -- may need to store team in log
    const key = log.model;
    if (!teams.has(key)) teams.set(key, { total: 0, fallback: 0 });
    const t = teams.get(key)!;
    t.total++;
    if (log.usedFallback) t.fallback++;
  }

  // If any model had >25% fallback rate on clue generation, match is tainted
  for (const [model, stats] of teams) {
    if (stats.total > 0 && stats.fallback / stats.total > 0.25) {
      return "tainted";
    }
  }

  return "clean";
}
```

In `runTournament`, after all matches complete, replay tainted matches:

```typescript
// After main execution and retry pass
const allMatches = await storage.getTournamentMatches(tournamentId);
const taintedMatches = allMatches.filter(m => m.dataQuality === "tainted");

if (taintedMatches.length > 0) {
  log(`[tournament] ${taintedMatches.length} tainted matches detected. Queueing replay.`, "tournament");

  for (const tm of taintedMatches) {
    // Only replay if the model's circuit breaker status is healthy
    // (no point replaying if the model is still broken)
    const config = tm.config as HeadlessMatchConfig;
    const modelHealthy = checkAllModelsHealthy(config); // circuit breaker check

    if (modelHealthy) {
      await storage.updateTournamentMatch(tm.id, {
        status: "pending",
        dataQuality: "replayed"
      });
      // Re-run through the normal match execution pipeline
    } else {
      log(`[tournament] Skipping replay of match ${tm.matchIndex} -- model still unhealthy`, "tournament");
    }
  }
}
```

Report tainted match percentage prominently in tournament status:

```json
{
  "tournamentId": 5,
  "totalMatches": 168,
  "completedMatches": 168,
  "cleanMatches": 152,
  "taintedMatches": 12,
  "replayedMatches": 4,
  "dataQualityRate": "90.5%"
}
```

**Risk**: Replaying tainted matches extends tournament runtime. Mitigation: replays only happen for matches where the model is now healthy (circuit breaker check). If a model was consistently broken, its matches stay tainted and are excluded from analysis -- better than including garbage data.

**Priority**: MUST-HAVE. This is the mechanism that prevents contaminated data from polluting tournament results.

---

### 2.4 Minimum Game Length

**What**: Raise the loss condition threshold from 2 to 3 (either 3 miscommunications or 3 interceptions trigger a loss), ensuring games last at least 3 rounds and allowing strategic dynamics to develop.

**Why**: In Tournament 1, 91% of games ended in exactly 2 rounds -- the minimum possible. At 2 rounds, there is almost no accumulated history for pattern detection, no opportunity for adversarial modeling, and no strategic adaptation. The game is effectively measuring "can the model decode word associations in round 1" rather than "can the model reason strategically about deception and Theory of Mind over time." The entire strategic depth of Decrypto -- the tension between giving clues your team understands but opponents cannot crack -- requires multiple rounds of accumulated data.

The current threshold of 2 means a team that miscommunicates in rounds 1 and 2 (very common when facing strong interception) loses immediately. There is no recovery, no adaptation, no strategic pivoting.

**Where**: `server/game.ts` (the game logic that checks loss conditions). The exact location depends on where `whiteTokens >= 2` and `blackTokens >= 2` are checked.

**How**:

This is a game design decision with tradeoffs:

**Option A (Recommended): Raise threshold from 2 to 3.**
- Games will last 3-5 rounds on average instead of 2.
- API cost increases ~1.5-2x per game (but games per matchup can be reduced if budget is a concern).
- The strategic depth improves dramatically: models get multiple rounds to observe opponent patterns, refine clue strategies, and adapt.
- Implementation: change the win/loss condition check from `>= 2` to `>= 3`.

**Option B: Require minimum N rounds before losses count.**
- Guarantee at least 3 or 4 rounds regardless of tokens.
- Simpler to implement (just skip the loss check before round N).
- Downside: early rounds become consequence-free, which changes the game's incentive structure.

**Option C: First to 3 of either type, but also introduce a "first to 2 interceptions wins" victory condition.**
- This emphasizes interception skill (the most interesting cognitive capability observed in T1).
- More complex rule change.

**Recommendation**: Option A. Raising the threshold from 2 to 3 is the simplest change with the highest research value. It preserves the game's incentive structure (every round matters) while ensuring enough data accumulates for meaningful strategic analysis.

```typescript
// In server/game.ts, wherever the loss condition is checked:
// Change:
//   if (team.whiteTokens >= 2) { /* miscommunication loss */ }
//   if (team.blackTokens >= 2) { /* interception loss */ }
// To:
const LOSS_THRESHOLD = 3;
if (team.whiteTokens >= LOSS_THRESHOLD) { /* miscommunication loss */ }
if (team.blackTokens >= LOSS_THRESHOLD) { /* interception loss */ }
```

Make this configurable via match config so ablation experiments can compare thresholds:

```typescript
// In HeadlessMatchConfig:
lossThreshold?: number;  // Default 3, minimum 2, maximum 5
```

**Risk**: Longer games mean higher API costs per game. At 2.5 average rounds -> ~4 average rounds, cost per game increases by ~60%. Mitigation: the cost per game is still modest (~$0.64/game at the new round count), and the research value per game increases substantially. Also, the cost estimation fix (1.6) will accurately reflect the new round count.

**Priority**: MUST-HAVE. Two-round games produce almost no strategic data. This is the single biggest improvement to research value per dollar spent.

---

## PHASE 3: Research Enhancements (Exciting New Capabilities)

These features transform the platform from a model ranking tool into a genuine research instrument for studying AI cognition, Theory of Mind, information security, and strategic adaptation. Each one opens a new experimental dimension.

---

### 3.1 Mixed-Model Teams

**What**: Allow team composition with different models on the same team. Currently, all 3 players on a team must be the same model. Mixed teams enable configurations like Claude as clue-giver (Player 1), GPT-5.4 as guesser (Player 2), Grok as guesser (Player 3).

**Why**: This is perhaps the most scientifically interesting enhancement in this spec. Same-model teams test intra-model Theory of Mind (can a model understand how copies of itself think?). Mixed-model teams test **cross-model Theory of Mind** -- can Claude give clues that GPT-5.4 will understand? Can Grok and Kimi deliberate productively when they reason in fundamentally different ways? The miscommunication rate across model boundaries would be a direct, quantitative measure of inter-model cognitive compatibility.

Tournament 1 showed that same-model teams reach deliberation consensus almost instantly (1.1-1.5 exchanges for most models). Mixed-model deliberation would likely produce longer, richer transcripts as models negotiate across cognitive boundaries. This is the "fishbowl experience" at its most compelling.

**Where**: `shared/schema.ts` (update `HeadlessMatchConfig` to support per-player model configs), `server/headlessRunner.ts` (player config resolution), `server/tournament.ts` (mixed-team match generation).

**How**:

The current `HeadlessMatchConfig` already supports per-player `aiConfig`:

```typescript
export interface HeadlessMatchConfig {
  players: Array<{
    name: string;
    aiProvider: AIProvider;
    team: "amber" | "blue";
    aiConfig?: AIPlayerConfig;  // Already supports per-player config!
  }>;
  // ...
}
```

The infrastructure already handles per-player model configuration -- `getConfigForPlayer()` in `headlessRunner.ts` already reads each player's individual `aiConfig`. The only change needed is in the tournament match generation code, which currently assumes all players on a team use the same model.

Add a new match generation function for mixed-team experiments:

```typescript
export interface MixedTeamSpec {
  teamName: string;
  clueGiver: RoundRobinModelSpec;   // Player 1 (gives clues)
  guesserA: RoundRobinModelSpec;    // Player 2 (deliberates + guesses)
  guesserB: RoundRobinModelSpec;    // Player 3 (deliberates + guesses)
}

export function generateMixedTeamConfigs(
  teams: MixedTeamSpec[],
  gamesPerMatchup: number = 8,
  teamSize: 3 = 3,
): HeadlessMatchConfig[] {
  const configs: HeadlessMatchConfig[] = [];

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      // Balanced positions: half as amber, half as blue
      for (let g = 0; g < gamesPerMatchup / 2; g++) {
        configs.push(buildMixedMatchConfig(teams[i], teams[j], "amber", "blue"));
      }
      for (let g = 0; g < gamesPerMatchup / 2; g++) {
        configs.push(buildMixedMatchConfig(teams[i], teams[j], "blue", "amber"));
      }
    }
  }

  return configs;
}
```

The deliberation between different models on the same team would produce fascinating data: How does GPT-5.4's terse communication style interact with Grok's lengthy deliberative approach? Does Kimi's tendency to read opponent transcripts help or confuse teammates who reason differently?

**Risk**: Increased combinatorial space. With 7 models, there are 7^3 = 343 possible 3-model team compositions (or 7 x C(7,2) = 147 if clue-giver role is distinguished). Running all-vs-all would be prohibitively expensive. Mitigation: start with carefully selected team compositions based on T1 findings. E.g., pair the best clue-giver (Opus) with the best interceptor (Kimi) and see if they can collaborate.

**Priority**: Nice-to-have for Tournament 2, but this is the single most exciting research capability on the roadmap. Consider running a small mixed-team tournament as a separate experiment alongside the main homogeneous tournament.

---

### 3.2 Private vs Public Deliberation Mode

**What**: Add a `deliberationVisibility` configuration option with two modes: `"public"` (current behavior -- opponents can read the other team's deliberation transcript) and `"private"` (opponents cannot see deliberation, only the final clues/guesses). Run the same matchups under both conditions and compare interception rates to directly measure information leakage impact.

**Why**: This is the cleanest experiment on the entire roadmap. Kimi K2.5 achieved 100% interception rate against GPT-5.4 and Opus 4.6 by reading their deliberation transcripts, where models routinely stated things like "hammer -> #3" and "zest -> #2" in plain text. The synthesis document identifies this as "perhaps the most publishable finding" -- current frontier AI models cannot maintain operational security under communication pressure.

By running the same matchup with and without transcript visibility, we get a direct causal measurement of:
1. How much useful information models leak in deliberation (the difference in interception rates between modes).
2. Whether opponents actually exploit leaked information or just ignore it (if interception rates are the same in both modes, models are not reading transcripts).
3. Whether the information security failure is inherent to the models' reasoning process or an artifact of knowing they are being observed.

**Where**: `server/headlessRunner.ts` (the `processDeliberation` opponent phase, around line 604), `shared/schema.ts` (config extension).

**How**:

Add to `HeadlessMatchConfig`:

```typescript
export interface HeadlessMatchConfig {
  // ... existing fields ...
  deliberationVisibility?: "public" | "private";  // Default: "public" (current behavior)
}
```

In `headlessRunner.ts`, when building the opponent intercept deliberation context (line 615):

```typescript
// Current code passes the opponent's own-guess deliberation transcript:
const opponentTranscript = ownDelibResults[opponentTeam]?.messages || [];

// New code:
const deliberationVisibility = config.deliberationVisibility || "public";
const opponentTranscript = deliberationVisibility === "public"
  ? (ownDelibResults[opponentTeam]?.messages || [])
  : [];  // Private mode: opponents cannot see deliberation
```

That is the entire implementation. The opponent intercept deliberation prompt already handles the case where `opponentDeliberationTranscript` is empty (it just does not include that section in the prompt).

Experimental design: Run 8 games per matchup in public mode and 8 games per matchup in private mode for each pairing. Compare interception rates between conditions. This is a clean 2x2 factorial design: (Model Pair) x (Visibility Mode).

For the Kimi vs Opus matchup specifically, we predict:
- Public mode: ~100% interception rate (replicating T1)
- Private mode: significantly lower interception rate (Kimi loses its transcript-reading advantage)
- The difference directly measures information leakage impact.

**Risk**: None significant. The implementation is trivial (one conditional), and the experimental design is clean. The only risk is that private mode might make interception too hard (random baseline is 4.7%), making the experiment uninformative. Mitigation: if private-mode interception rates are near random, that itself is a finding -- it means all interception ability in public mode comes from information leakage, not from clue analysis.

**Priority**: Nice-to-have for Tournament 2, but extremely high research value and trivial to implement. Could be added as a separate experimental condition alongside the main tournament.

---

### 3.3 Deliberation Transcript Analysis Pipeline

**What**: Build an automated analysis pipeline for the 1,132+ existing deliberation transcripts from Tournament 1. Detect information leakage (explicit keyword mentions), hedging language, misdirection attempts, and disagreement patterns. Score each deliberation on an "information security" scale.

**Why**: These transcripts already exist and represent a rich dataset that can be analyzed without running new games or spending API budget. The synthesis document identifies several qualitative patterns (Kimi reads opponent transcripts, Grok has genuine multi-turn debate, most models leak keywords openly) but no quantitative analysis has been done.

Key analysis dimensions:
1. **Information leakage frequency**: How often do models mention their own team's keywords in deliberation? In what form (exact word, synonym, indirect reference)?
2. **Keyword-to-code mapping exposure**: When models discuss "hammer -> #3", how often does the opponent team subsequently use this to intercept correctly?
3. **Hedging and uncertainty language**: Which models express genuine uncertainty? Does hedging correlate with incorrect guesses?
4. **Misdirection attempts**: Do any models deliberately inject false information into deliberation? (Expected answer: no, based on T1 observations.)
5. **Disagreement patterns**: How do models handle disagreement? Does disagreement correlate with better or worse outcomes?

**Where**: New file `server/transcriptAnalyzer.ts`, new API endpoint for triggering analysis and viewing results, new database table for analysis results.

**How**:

```typescript
// server/transcriptAnalyzer.ts

interface TranscriptAnalysis {
  chatterId: number;
  matchId: number;
  roundNumber: number;
  team: "amber" | "blue";
  phase: string;

  // Information security metrics
  keywordMentions: Array<{
    keyword: string;
    keywordIndex: number;  // Which keyword position (1-4)
    messageIndex: number;
    context: string;       // Surrounding text
    mentionType: "exact" | "synonym" | "indirect";
  }>;
  codeExposures: Array<{
    exposedMapping: string;  // e.g., "keyword3 -> position 2"
    messageIndex: number;
  }>;
  informationSecurityScore: number;  // 0 (everything leaked) to 10 (nothing leaked)

  // Deliberation dynamics
  totalMessages: number;
  totalExchanges: number;
  avgMessageLength: number;
  consensusReached: boolean;
  disagreementCount: number;
  hedgingInstances: number;

  // Outcome correlation
  outcomeCorrect: boolean;  // Did the team guess/intercept correctly?
}

async function analyzeTranscript(
  chatter: TeamChatter,
  keywords: string[],  // The relevant team's keywords
  matchRound: MatchRound,
): Promise<TranscriptAnalysis> {
  const messages = chatter.messages as ChatterMessage[];

  // Pattern matching for keyword leakage
  const keywordMentions = [];
  for (let mi = 0; mi < messages.length; mi++) {
    const content = messages[mi].content.toLowerCase();
    for (let ki = 0; ki < keywords.length; ki++) {
      const keyword = keywords[ki].toLowerCase();
      if (content.includes(keyword)) {
        keywordMentions.push({
          keyword: keywords[ki],
          keywordIndex: ki + 1,
          messageIndex: mi,
          context: extractContext(content, keyword, 50),
          mentionType: "exact" as const,
        });
      }
    }
  }

  // Code exposure detection: look for patterns like "N -> word" or "word = position N"
  const codeExposures = detectCodeExposures(messages, keywords);

  // Information security score
  const leakageRate = keywordMentions.length / (messages.length || 1);
  const exposureRate = codeExposures.length / (messages.length || 1);
  const securityScore = Math.max(0, 10 - (leakageRate * 5) - (exposureRate * 8));

  // ... compute other metrics ...

  return { /* ... */ };
}
```

This can run as a batch job: `POST /api/analysis/transcripts/run` processes all existing transcripts. Results are stored in a new `transcript_analyses` table and exposed via `GET /api/analysis/transcripts/:matchId`.

For deeper semantic analysis (synonym detection, indirect reference identification), use an LLM to analyze each transcript with a prompt like: "Given these 4 keywords [W1, W2, W3, W4], identify any direct or indirect references to these words in the following deliberation transcript. Rate the overall information security on a 0-10 scale."

**Risk**: LLM-based analysis adds cost and introduces the analyzer's own biases. Mitigation: start with pattern-matching (exact keyword detection, regex for code mappings) which is free and deterministic. Use LLM analysis only for the semantic layer (synonym detection, indirect references). Cache results so analysis does not need to be re-run.

**Priority**: Nice-to-have but high value -- this is "free" research that requires no new game data. Should be done before Tournament 2 to inform experimental design (e.g., if analysis shows all models leak keywords at equal rates, the private deliberation experiment becomes more interesting).

---

### 3.4 Temperature Sweep Experiment

**What**: Run the same matchup at multiple temperature settings (0.0, 0.3, 0.7, 1.0) to measure the creativity-reliability tradeoff in adversarial settings. Higher temperature should produce more diverse clues (harder to intercept?) but potentially more miscommunication.

**Why**: Temperature is one of the most important hyperparameters for language model behavior, yet its effect in strategic adversarial settings is unexplored. In Decrypto, the optimal temperature depends on competing objectives:
- **Low temperature** (0.0-0.3): Deterministic, predictable clues. Easy for teammates to decode, but also easy for opponents to intercept after seeing a few rounds.
- **High temperature** (0.7-1.0): Creative, diverse clues. Harder for opponents to predict, but also harder for teammates to decode.

The optimal temperature may differ between clue-giving (where creativity helps avoid interception) and guessing/interception (where reliability helps decode patterns).

**Where**: The existing `AIPlayerConfig` already supports per-player temperature settings. This is purely an experimental design feature -- configure matches with different temperatures and compare outcomes.

**How**:

Create a temperature sweep as a set of tournament configs:

```typescript
const temperatures = [0.0, 0.3, 0.7, 1.0];
const targetMatchup = { modelA: "claude-opus-4-6", modelB: "x-ai/grok-4.20-beta" };

for (const temp of temperatures) {
  // Generate 8 matches per temperature level, balanced positions
  // Config override: temperature = temp for all players
  generateConfigs({ ...targetMatchup, temperature: temp, gamesPerMatchup: 8 });
}
// Total: 32 matches for one matchup across 4 temperature levels
```

Note: Some models (GPT-5.4 with reasoning_effort) do not support custom temperature. The model registry (1.8) should flag these constraints, and the temperature sweep should skip models with `no_custom_temperature` constraints.

Integrate with the existing ablation framework by treating temperature as a continuous independent variable alongside the discrete ablation flags.

**Risk**: The number of experimental conditions grows multiplicatively. A full temperature sweep across all 21 matchups would be 21 x 4 x 8 = 672 matches. Mitigation: run temperature sweeps on a small number of carefully selected matchups (e.g., 2-3 pairs), not the full round-robin.

**Priority**: Nice-to-have. Lower priority than position balancing and sample size, but scientifically interesting and easy to configure.

---

### 3.5 Ablation Experiments

**What**: Design and execute a systematic ablation study using the existing ablation flags: `no_history`, `no_scratch_notes`, `no_opponent_history`, `no_chain_of_thought`, and `random_clues`. Each matchup is run with and without each flag to measure which cognitive capabilities actually matter for game performance.

**Why**: The ablation framework is already built and unused. These ablations directly measure:
- `no_chain_of_thought`: Does explicit structured reasoning help? If removing CoT from the "advanced" prompt strategy does not reduce performance, the elaborate prompts are wasted.
- `no_history`: Can models play from clues alone, without knowledge of previous rounds? Measures whether multi-round pattern tracking matters.
- `no_opponent_history`: Does knowing opponent history help with interception? Directly measures adversarial modeling ability.
- `random_clues`: Establishes a true random baseline. What decode and interception rates look like when clues carry no semantic information.

**Where**: Experimental design only -- the infrastructure already supports all of these. Configuration happens in tournament/experiment creation.

**How**:

Priority ablation schedule for Tournament 2:

1. **Baseline calibration** (8 matches per matchup, no ablations): The main tournament.
2. **`random_clues`** (4 matches per selected matchup): Establishes random baseline for decode/interception rates. Run for 3-4 matchups only.
3. **`no_chain_of_thought`** (8 matches per selected matchup): Compare advanced strategy with and without CoT for 3-4 matchups. This is the highest-priority ablation -- it tests whether the elaborate prompt engineering actually helps.
4. **`no_opponent_history`** (8 matches per selected matchup): Run for matchups involving strong interceptors (Kimi, Grok) to measure whether their interception relies on historical pattern tracking.

Design each ablation as a separate experiment/tournament to keep the data clean. Tag matches with `experimentId` for scoped analysis.

**Risk**: Ablation experiments increase total match count significantly. Mitigation: run ablations on a subset of matchups (the most interesting ones from the main tournament), not all 21.

**Priority**: Nice-to-have but high research value. The `no_chain_of_thought` and `random_clues` ablations should be run alongside Tournament 2 if budget allows.

---

### 3.6 Longitudinal Series with Learning

**What**: Run 20-game series between two models with persistent scratch notes, tracking whether clue patterns evolve, interception rates change, and strategic notes become more sophisticated over time.

**Why**: The platform already supports persistent scratch notes via the `series` infrastructure (tables exist in schema.ts, `seriesRunner.ts` is implemented). This tests meta-learning and strategic adaptation -- the most advanced form of AI cognition the platform can measure. Do models learn to avoid intercepted clue patterns? Do they develop counter-strategies? Do their notes become more sophisticated over time, or do they plateau?

Tournament 1 was too short (2 rounds per game, 4 games per matchup) for learning to emerge. A 20-game series with persistent notes between games gives models the opportunity to develop and refine strategies across a much larger sample.

**Where**: Already implemented in `server/seriesRunner.ts`. This is a configuration and experimental design task.

**How**:

Select 2-3 model pairs for longitudinal study, prioritizing pairs with interesting T1 dynamics:
- **Kimi vs Opus**: Kimi's interception dominance vs Opus's clue sophistication. Will Opus learn to be more opaque?
- **Grok vs GPT-5.4**: Grok's deliberative style vs GPT's efficiency. Will Grok's genuine multi-turn deliberation produce better adaptation?
- **Opus vs Grok**: Strong clue-giver vs strong interceptor.

Configuration per series:
```json
{
  "matchConfig": { /* standard 3v3 config for this matchup */ },
  "totalGames": 20,
  "noteTokenBudget": 1000,
  "budgetCapUsd": "30.00"
}
```

Track across the series:
- Per-game interception rate (does it change over time?)
- Scratch note length and complexity (do notes grow and refine?)
- Clue diversity (do models avoid previously-intercepted clue patterns?)
- Win rate trajectory (does one model adapt faster than the other?)

**Risk**: 20 games per series is moderately expensive (~$8-12 per series at T1 costs). The main risk is that models do not actually learn -- their notes may be generic and not influence behavior. Mitigation: the reflection prompt is already well-designed for learning. If no learning emerges, that itself is a finding about the limits of current models' meta-cognitive capabilities.

**Priority**: Nice-to-have. Run after the main tournament as a follow-up experiment.

---

## PHASE 4: Observability and Analysis

These features make the platform's rich data accessible and actionable, transforming raw game logs into research insights.

---

### 4.1 Real-Time Tournament Dashboard

**What**: A live-updating view of tournament progress showing per-model health indicators, running win rates, match timeline, and data quality metrics.

**Why**: During Tournament 1, the only monitoring was tail-watching server logs. The counter bug (1.5) made even that unreliable. A dashboard would have revealed the Qwen/DeepSeek 100% failure rates within minutes of tournament start, enabling a manual abort and fix before 5,661 calls were wasted.

**Where**: New client-side component and new API endpoints. The backend data already exists in the database -- this is primarily a frontend task.

**How**:

New API endpoints:
```
GET /api/tournament/:id/dashboard
  Returns: {
    status, progress (completed/total), elapsed time, estimated remaining,
    perModelStats: [{ model, wins, losses, errorRate, avgLatency, health }],
    recentMatches: [{ matchId, amber, blue, winner, rounds, quality }],
    dataQuality: { clean%, tainted%, replayed% },
    costSoFar, budgetRemaining,
    circuitBreakerState: [{ model, status, consecutiveErrors, lastError }]
  }

GET /api/tournament/:id/model-health
  Returns: per-model circuit breaker state (from 1.1)
```

Frontend dashboard components:
- **Progress bar** with match count, elapsed time, and ETA
- **Model health cards**: green/yellow/red indicator per model, with error rate and last error message
- **Live win rate table**: sortable by model, updating as matches complete
- **Match timeline**: scrolling list of completed matches with winner, rounds, and quality badge (green=clean, yellow=tainted)
- **Cost tracker**: actual vs estimated vs budget cap, with burn rate

Polling: fetch dashboard data every 10 seconds during active tournaments. Use server-sent events (SSE) if lower latency is needed.

**Risk**: Adds frontend complexity. Mitigation: start with a simple read-only dashboard (no interactive controls). The API endpoints are straightforward aggregations of existing data.

**Priority**: Nice-to-have but extremely useful operationally. Even a minimal version (API endpoint + simple HTML page) would be transformative for tournament monitoring.

---

### 4.2 Post-Tournament Analysis Export

**What**: Automatic generation of the tournament results summary (like `TOURNAMENT_1_RESULTS.md`) when a tournament completes. Include head-to-head matrix, per-model stats, API reliability metrics, cost breakdown, and data quality report.

**Why**: Tournament 1's results document was manually constructed from database queries. This took hours and was error-prone. If the platform automatically generates this summary, researchers get immediate results and the analysis is reproducible.

**Where**: New file `server/tournamentReport.ts`, called at the end of `runTournament()` in `server/tournament.ts`.

**How**:

```typescript
async function generateTournamentReport(tournamentId: number): Promise<string> {
  const tournament = await storage.getTournament(tournamentId);
  const matches = await storage.getTournamentMatches(tournamentId);
  const allMatchIds = matches.filter(m => m.matchId).map(m => m.matchId as number);

  // Compute all metrics
  const modelMetrics = await computeModelMetrics(allMatchIds);
  const matchupMetrics = await computeMatchupMetrics(allMatchIds);
  const btRatings = bradleyTerryRatings(/* ... */);

  // API reliability from ai_call_logs
  const apiMetrics = await computeApiReliabilityMetrics(allMatchIds);

  // Generate markdown
  let report = `# ${tournament.name} -- Results\n\n`;
  report += `> Generated: ${new Date().toISOString().split('T')[0]}\n\n`;
  report += generateOverviewTable(tournament, matches);
  report += generateStandingsTable(modelMetrics, btRatings);
  report += generateHeadToHeadMatrix(matchupMetrics);
  report += generateApiReliabilitySection(apiMetrics);
  report += generateDataQualitySection(matches);
  report += generateCostBreakdown(tournament, allMatchIds);

  return report;
}
```

Call at tournament completion:
```typescript
// At the end of runTournament(), before setting final status:
try {
  const report = await generateTournamentReport(tournamentId);
  // Store in DB and/or write to filesystem
  await storage.updateTournament(tournamentId, { report });
} catch (err) {
  log(`[tournament] Failed to generate report: ${err}`, "tournament");
}
```

Additionally, expose the deliberation transcripts as structured JSON export for external analysis tools:

```
GET /api/tournament/:id/export/transcripts
  Returns: JSONL file with one transcript per line, including match metadata
```

**Risk**: Report generation adds time at tournament completion. Mitigation: it runs after all matches are done, so it does not affect tournament execution. If report generation fails, the tournament still completes normally.

**Priority**: Nice-to-have. High quality-of-life improvement for researchers.

---

### 4.3 Match Replay Viewer

**What**: A round-by-round viewer for completed matches showing clues given, guesses made, interceptions attempted, and deliberation transcripts. Highlights when fallback clues were used.

**Why**: Understanding HOW models play -- not just who wins -- is the core research value of this platform. The synthesis document notes that Kimi's interception strategy involves reading opponent transcripts, that Opus uses multi-round semantic angle switching, and that Grok has genuine multi-turn debate. These insights came from manually reading raw logs. A proper replay viewer makes this qualitative analysis accessible and systematic.

**Where**: New client-side component, new API endpoints.

**How**:

New API endpoint:
```
GET /api/match/:id/replay
  Returns: {
    matchId,
    amberKeywords, blueKeywords,
    rounds: [{
      roundNumber,
      amber: {
        code, clues, clueFallback: boolean,
        deliberationOwn: { messages, consensus, finalAnswer },
        ownGuess, ownCorrect,
        deliberationIntercept: { messages, consensus, finalAnswer },
        opponentGuess, intercepted,
      },
      blue: { /* same structure */ },
    }],
    finalScore: { amber: { white, black }, blue: { white, black } },
    winner,
  }
```

Frontend:
- Round selector (tabs or timeline)
- Per-round view showing: secret code, clues (highlighted red if fallback), own-team deliberation transcript (expandable), own-team guess with correct/incorrect indicator, opponent deliberation transcript (expandable), opponent interception attempt with success/failure indicator
- Keyword reference panel (always visible) showing all 4 keywords per team
- Reasoning trace viewer (expandable) for models that produce reasoning tokens

**Risk**: Frontend development time. Mitigation: start with a simple HTML table-based view using the API endpoint. Rich interactive UI can come later.

**Priority**: Nice-to-have. Essential for qualitative research but not required for Tournament 2 execution. A minimal version (API endpoint returning structured match data) enables programmatic analysis even without a UI.

---

## Implementation Sequence

The phases are ordered by dependency and priority:

### Sprint 1: Infrastructure Foundation (Blocks Tournament 2)
1. **1.8 MODEL_REGISTRY** -- Foundation for everything else
2. **1.3 Gemini rate limit fix** -- Simple, isolated change
3. **1.7 Transient error retry** -- Simple, isolated change
4. **1.1 Circuit breaker** -- Depends on 1.8 for model identification
5. **1.2 Pre-flight validation** -- Depends on 1.8 for model list

### Sprint 2: Experimental Design (Blocks Tournament 2)
6. **2.1 Balanced positions** -- Changes match generation
7. **2.2 Games per matchup** -- Config change
8. **2.4 Minimum game length** -- Game logic change
9. **1.6 Cost estimation fix** -- Depends on new round count assumptions

### Sprint 3: Data Quality (Blocks Tournament 2)
10. **1.4 Deliberation timeout** -- Isolated change
11. **1.5 completedMatches counter** -- Isolated change
12. **2.3 Tainted match detection** -- Depends on circuit breaker

### Sprint 4: Research Enhancements (Post-Tournament 2 launch, or in parallel)
13. **3.2 Private deliberation** -- Trivial implementation, high value
14. **3.3 Transcript analysis** -- No new games needed
15. **3.5 Ablation experiments** -- Config only
16. **3.1 Mixed-model teams** -- Moderate implementation

### Sprint 5: Observability (Ongoing)
17. **4.1 Dashboard** -- Frontend work
18. **4.2 Report export** -- Backend aggregation
19. **4.3 Replay viewer** -- Frontend work

### Sprint 6: Extended Research (Post-Tournament 2)
20. **3.4 Temperature sweep** -- Config only
21. **3.6 Longitudinal series** -- Already implemented, needs design

---

## Tournament 2 Configuration (Recommended)

Based on this spec, here is the recommended configuration for Tournament 2:

```
Name: "Frontier 7-Model 3v3 Round Robin — April 2026"
Team Size: 3
Games Per Matchup: 8 (4 per side, balanced)
Total Matches: 168 (21 matchups x 8 games)
Concurrency: 10
Loss Threshold: 3 (raised from 2)
Prompt Strategy: advanced
Temperature: 0.7 (default, some models override)
Budget Cap: $150.00
Estimated Cost: $65-80 (based on corrected formula)
Estimated Runtime: 5-7 hours

Models:
  - GPT-5.4 (chatgpt)
  - Claude Opus 4.6 (claude)
  - Gemini 3.1 Pro (gemini) -- with fixed rate limit detection
  - Grok 4.20 (openrouter)
  - Kimi K2.5 (openrouter)
  - DeepSeek V3.2 (openrouter) -- with CORRECT model ID: deepseek/deepseek-v3.2
  - Qwen 3.6 Plus (openrouter) -- with VALIDATED model ID before launch

Pre-flight: All 7 models validated before start
Circuit Breaker: N=5 consecutive errors -> pause, M=25 total -> disable
Tainted Match Replay: Enabled, auto-replay at tournament end
```

Side experiments to run alongside (separate tournaments):
- **Private deliberation**: Same 7 models, 4 games per matchup, deliberation visibility = "private"
- **Random baseline**: 3 matchups with `random_clues` ablation, 4 games each
- **CoT ablation**: 3 matchups with `no_chain_of_thought`, 8 games each

---

## What This Means for the Research

Tournament 1 was a proof-of-concept that revealed as much about infrastructure challenges as about AI capabilities. Tournament 2, with these fixes, will be the first scientifically rigorous run:

- **Balanced positions** eliminate the blue advantage confound
- **8 games per matchup** provide statistical power for pairwise comparisons
- **3-token loss threshold** allows strategic depth to develop
- **Circuit breaker + pre-flight validation** prevent the 71% error rate catastrophe
- **Tainted match detection** ensures only clean data enters the rankings
- **Gemini rate limit fix + transient retry** recover two models that were effectively disabled in T1

The research questions for Tournament 2:

1. **Does Kimi's interception dominance replicate** when controlling for blue team advantage? If Kimi intercepts at 100% on both sides, the finding is rock-solid.
2. **How do models perform in longer games?** With 3-4 rounds instead of 2, do we see strategic adaptation, pattern detection, or clue evolution within a single game?
3. **Can any model maintain operational security?** With the information security failure being the headline finding from T1, do models improve when games last longer and the consequences of leaking are clearer?
4. **What is the true model ranking** with balanced positions, adequate sample sizes, and clean data? The T1 ranking (Kimi >> Opus > DeepSeek ~ GPT ~ Grok > Qwen > Gemini) may look very different.

This is going to be an extraordinary Tournament 2.
