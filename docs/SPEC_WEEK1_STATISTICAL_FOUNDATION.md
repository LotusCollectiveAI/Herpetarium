# Week 1 -- Statistical Foundation & Bug Fixes

**Scope:** Bootstrap CIs, Cohen's d, experimentId scoping, evolution matches-per-eval bump, two-pass reasoning for advanced strategies, scratch notes prompt fix.

**Estimated total new code:** ~250 lines across 6 files, 1 migration snippet.

---

## 1. Bootstrap CIs + Cohen's d in metrics.ts

**File:** `server/metrics.ts`
**New code:** ~80 lines
**Dependencies:** None (pure math)

### 1.1 Function signatures

```ts
export interface ConfidenceInterval {
  lower: number;
  upper: number;
  point: number;
}

/**
 * Non-parametric bootstrap confidence interval.
 * Resamples `data` with replacement `nBoot` times, computes `statFn`
 * on each resample, returns percentile-based CI at `1 - alpha` level.
 */
export function bootstrapConfidenceInterval(
  data: number[],
  statFn: (d: number[]) => number,
  options?: { nBoot?: number; alpha?: number }
): ConfidenceInterval;

/**
 * Cohen's d for independent samples.
 * Uses pooled standard deviation. Returns 0 if either group is empty
 * or has zero variance.
 */
export function cohensD(groupA: number[], groupB: number[]): number;
```

### 1.2 Implementation detail

**bootstrapConfidenceInterval:**

```ts
export function bootstrapConfidenceInterval(
  data: number[],
  statFn: (d: number[]) => number,
  options?: { nBoot?: number; alpha?: number }
): ConfidenceInterval {
  const nBoot = options?.nBoot ?? 1000;
  const alpha = options?.alpha ?? 0.05;
  const point = statFn(data);

  if (data.length < 2) {
    return { lower: point, upper: point, point };
  }

  const bootstrapStats: number[] = [];
  for (let b = 0; b < nBoot; b++) {
    const resample: number[] = [];
    for (let i = 0; i < data.length; i++) {
      resample.push(data[Math.floor(Math.random() * data.length)]);
    }
    bootstrapStats.push(statFn(resample));
  }

  bootstrapStats.sort((a, b) => a - b);
  const lowerIdx = Math.floor((alpha / 2) * nBoot);
  const upperIdx = Math.floor((1 - alpha / 2) * nBoot);

  return {
    lower: bootstrapStats[lowerIdx],
    upper: bootstrapStats[Math.min(upperIdx, nBoot - 1)],
    point,
  };
}
```

**cohensD:**

```ts
export function cohensD(groupA: number[], groupB: number[]): number {
  if (groupA.length < 2 || groupB.length < 2) return 0;

  const meanA = groupA.reduce((s, v) => s + v, 0) / groupA.length;
  const meanB = groupB.reduce((s, v) => s + v, 0) / groupB.length;

  const varA = groupA.reduce((s, v) => s + (v - meanA) ** 2, 0) / (groupA.length - 1);
  const varB = groupB.reduce((s, v) => s + (v - meanB) ** 2, 0) / (groupB.length - 1);

  const pooledSD = Math.sqrt(
    ((groupA.length - 1) * varA + (groupB.length - 1) * varB) /
    (groupA.length + groupB.length - 2)
  );

  if (pooledSD === 0) return 0;
  return (meanA - meanB) / pooledSD;
}
```

### 1.3 Wiring into existing metrics

**Extend `ExperimentResult` interface** (already in `metrics.ts` lines 65-90):

Add these fields to the `ExperimentResult` interface:

```ts
export interface ExperimentResult {
  // ... existing fields ...
  winRateCI_A?: ConfidenceInterval;
  winRateCI_B?: ConfidenceInterval;
  effectSize?: number;           // Cohen's d on per-match win indicator arrays
  effectSizeMagnitude?: string;  // "negligible" | "small" | "medium" | "large"
}
```

**Update `computeExperimentResults`** (line 718):

After the existing `significanceIndicator` logic, add:

```ts
// Build per-match win indicator arrays (1 = win, 0 = loss)
const winsArrayA = matchesA.map(m => m.winner === /* team for strategy A */ ? 1 : 0);
const winsArrayB = matchesB.map(m => m.winner === /* team for strategy B */ ? 1 : 0);

const winRateCI_A = bootstrapConfidenceInterval(winsArrayA, arr => arr.reduce((s, v) => s + v, 0) / arr.length);
const winRateCI_B = bootstrapConfidenceInterval(winsArrayB, arr => arr.reduce((s, v) => s + v, 0) / arr.length);
const effectSize = cohensD(winsArrayA, winsArrayB);

const abs = Math.abs(effectSize);
const effectSizeMagnitude = abs < 0.2 ? "negligible" : abs < 0.5 ? "small" : abs < 0.8 ? "medium" : "large";
```

Add these to the returned object.

**Update `computeModelMetrics`** return type:

Add optional `winRateCI?: ConfidenceInterval` to `ModelMetrics`. Compute it inside the existing loop using the per-match win indicator array for each model.

### 1.4 Route changes

**File:** `server/routes.ts`

The `/api/eval/metrics` endpoint already returns `modelMetrics` and `strategyMetrics`. No route changes needed -- the CI data flows through the existing return structures once `ModelMetrics` and `ExperimentResult` gain the new fields.

The `/api/experiments/:id` endpoint returns `metricsA` / `metricsB`. These will automatically include CIs once `ModelMetrics` is extended.

### 1.5 Open questions

- **nBoot default of 1000:** For interactive dashboard requests with many models, 1000 resamples per metric per model could add ~50ms. If this matters, drop to 500 or make it configurable via query param.
- **Win indicator for team games:** A match has a winning *team*, not a winning *model*. The win indicator for model X is 1 if X's team won. This is already how `computeModelMetrics` works. Same logic applies.

---

## 2. experimentId on matches table + scoped queries

**Files:** `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `server/headlessRunner.ts`
**New code:** ~30 lines
**Migration:** 1 ALTER TABLE

### 2.1 Schema change

**File:** `shared/schema.ts`, line 211 (inside `matches` pgTable definition)

Add after `ablations`:

```ts
experimentId: varchar("experiment_id", { length: 100 }),
```

This is nullable by default in Drizzle (no `.notNull()` chain).

### 2.2 Migration SQL

```sql
ALTER TABLE matches ADD COLUMN experiment_id VARCHAR(100);
CREATE INDEX idx_matches_experiment_id ON matches (experiment_id) WHERE experiment_id IS NOT NULL;
```

Run via `drizzle-kit push` (the project's existing migration approach, see `package.json` script `db:push`).

### 2.3 HeadlessMatchConfig update

**File:** `shared/schema.ts`, `HeadlessMatchConfig` interface (line 338):

```ts
export interface HeadlessMatchConfig {
  // ... existing fields ...
  experimentId?: string;
}
```

### 2.4 headlessRunner.ts

**File:** `server/headlessRunner.ts`, line 280 (inside `storage.createMatch()`):

Add `experimentId: config.experimentId || null` to the `createMatch` call's argument object.

### 2.5 storage.ts scoped queries

**File:** `server/storage.ts`

**Update `getAllMatches` signature** (line 219):

Add `experimentId?: string` to the params type:

```ts
async getAllMatches(params?: { model?: string; strategy?: string; dateFrom?: string; dateTo?: string; experimentId?: string }): Promise<Match[]> {
```

Add this condition inside the method:

```ts
if (params?.experimentId) {
  conditions.push(eq(matches.experimentId, params.experimentId));
}
```

**Update `IStorage` interface** accordingly (line 16).

**Update `getMatches`** (paginated version, line 107): Add same optional `experimentId` filter.

### 2.6 routes.ts

**File:** `server/routes.ts`

**Update `/api/eval/metrics`** (line 282): Read `experimentId` from query params and pass through:

```ts
const experimentId = req.query.experimentId as string | undefined;
const allMatches = await storage.getAllMatches({ model, strategy, dateFrom, dateTo, experimentId });
```

**Update `/api/matches`**: Same pattern.

### 2.7 Risks

- Existing matches will have `experiment_id = NULL`. All existing queries that don't pass `experimentId` continue to work unchanged.
- The `drizzle-kit push` approach is idempotent for additive column changes.

---

## 3. Evolution: bump default matches-per-eval from 1 to 5

**File:** `server/evolution.ts`, `shared/schema.ts`
**Change:** 2 lines

### 3.1 Current state

In `shared/schema.ts` line 511, `EvolutionConfig` interface:

```ts
export interface EvolutionConfig {
  // ...
  matchesPerEvaluation: number;
  // ...
}
```

The default is set at the call site. Looking at `server/routes.ts` (the evolution run creation endpoint), the config is passed directly from the client. The `matchesPerEvaluation` field has no default in the interface.

In `server/evolution.ts` line 375, `matchesPerEvaluation` is consumed by `buildFrequencyWeightedPairings`:

```ts
const matchPairs = buildFrequencyWeightedPairings(population, config.matchesPerEvaluation);
```

### 3.2 Changes

**File:** `shared/schema.ts`, line 511 (`EvolutionConfig` interface):

No interface change needed -- the field already exists.

**File:** `server/routes.ts` -- find the evolution run creation endpoint. The client sends `matchesPerEvaluation`. Add a default:

```ts
const matchesPerEval = config.matchesPerEvaluation ?? 5;
// Use matchesPerEval when creating the run config
```

Specifically, in the route handler for `POST /api/evolution/runs`, after parsing the config, normalize:

```ts
const normalizedConfig: EvolutionConfig = {
  ...config,
  matchesPerEvaluation: config.matchesPerEvaluation ?? 5,
};
```

### 3.3 Risks

- Changing from 1 to 5 increases cost by ~5x per evolution generation. The budget cap mechanism (already in `evolution.ts` line 349) will catch overspend.
- This is a behavioral change for existing users who don't specify the field. Document in the evolution run creation UI.

---

## 4. Two-pass reasoning for advanced / k-level / enriched strategies

**File:** `server/ai.ts`
**New code:** ~60 lines
**Dependencies:** None

### 4.1 Current state

Currently, `callAnthropic` (line 240) already has extended thinking support for Claude models when the strategy is in `["advanced", "k-level", "enriched"]`. It uses Anthropic's `thinking` API parameter.

For non-Anthropic providers (OpenAI non-reasoning models, Gemini non-thinking models, OpenRouter non-reasoning models), the advanced strategies produce long chain-of-thought prompts but the model responds in a single pass. The response must be parsed for the final answer, and the reasoning is lost.

### 4.2 Design: two-pass approach

For strategies in `["advanced", "k-level", "enriched"]` and providers/models that do NOT have native reasoning/thinking support, split into two API calls:

**Pass 1 -- Reasoning:**
- System prompt: the strategy's system prompt (unchanged)
- User prompt: the strategy's template output (unchanged -- these already include "THINK STEP BY STEP" instructions)
- Parse: capture the full response as `reasoningTrace`
- Token limit: 1024 (generous for reasoning, but bounded)

**Pass 2 -- Structured output:**
- System prompt: same
- User prompt: `"Based on your analysis:\n\n{reasoningTrace}\n\nProvide your final answer. Respond with ONLY {format instruction}."`
- Token limit: 50 (just the final answer)
- Parse: use existing parsers

### 4.3 Implementation

**File:** `server/ai.ts`

Add a helper function:

```ts
const TWO_PASS_STRATEGIES = ["advanced", "k-level", "enriched"];

function shouldUseTwoPass(config: AIPlayerConfig): boolean {
  if (!TWO_PASS_STRATEGIES.includes(config.promptStrategy)) return false;

  // Providers/models with native reasoning don't need two-pass
  if (config.provider === "claude") return false; // Uses extended thinking API
  if (config.provider === "chatgpt" && isOpenAIReasoningModel(config.model)) return false;
  if (config.provider === "gemini" && isGeminiThinkingModel(config.model)) return false;
  if (config.provider === "openrouter" && (
    config.model.includes("deepseek-r1") ||
    config.model.includes("o1") ||
    config.model.includes("o3")
  )) return false;

  return true;
}
```

**Modify `generateClues`, `generateGuess`, `generateInterception`:**

These three functions follow the same pattern. The change is identical in each. Taking `generateClues` as the example (line 531):

After building the prompt and systemPrompt, before calling `callAI`:

```ts
if (shouldUseTwoPass(config)) {
  // Pass 1: reasoning
  const reasoningConfig = { ...config, temperature: config.temperature ?? 0.7 };
  const pass1 = await callAI(reasoningConfig, systemPrompt, prompt);
  const reasoningTrace = pass1.text;

  // Pass 2: structured answer
  const answerPrompt = `Based on your analysis:\n\n${reasoningTrace}\n\nProvide your final answer. Respond with ONLY 3 words separated by commas, nothing else. Example: ocean,bright,ancient`;
  const pass2 = await callAI(config, systemPrompt, answerPrompt);

  const latencyMs = Date.now() - startTime;
  const parsed = parseCluesResponse(pass2.text);

  return {
    result: parsed.value,
    prompt: fullPrompt,
    rawResponse: pass2.text,
    model: config.model,
    latencyMs,
    reasoningTrace,  // Store pass 1 output
    parseQuality: parsed.quality,
    promptTokens: (pass1.promptTokens || 0) + (pass2.promptTokens || 0),
    completionTokens: (pass1.completionTokens || 0) + (pass2.completionTokens || 0),
    totalTokens: (pass1.totalTokens || 0) + (pass2.totalTokens || 0),
    estimatedCostUsd: estimateCost(
      config.model,
      (pass1.promptTokens || 0) + (pass2.promptTokens || 0),
      (pass1.completionTokens || 0) + (pass2.completionTokens || 0)
    ),
  };
}
// ... existing single-pass code ...
```

The same pattern applies to `generateGuess` (with answer format `"3 numbers (1-4) separated by commas"`) and `generateInterception` (same answer format as guess).

### 4.4 Reasoning trace storage

Already handled. The `reasoningTrace` field exists on `AICallResult` (line 146) and is written to `ai_call_logs.reasoning_trace` via `logAiCall` in `headlessRunner.ts` (line 84).

### 4.5 Cost implications

Two-pass doubles the API calls for non-reasoning models using advanced strategies. The reasoning pass uses more output tokens (~300-500) but the answer pass is very cheap (~10-20 tokens). Rough estimate: +40-60% cost increase for affected calls.

### 4.6 Risks

- **Prompt injection in pass 1 output:** The reasoning trace from pass 1 is fed back as context in pass 2. Since both calls go to the same model with the same system prompt, and the content is the model's own output, this is low risk.
- **Latency:** Two sequential API calls. For fast models (GPT-4o, Gemini Flash), this adds ~1-2s per action. Acceptable for headless matches.
- **Token accounting:** The combined tokens from both passes are summed. Cost estimates will be accurate.

### 4.7 Open questions

- Should we cap the pass 1 output length? Currently no cap beyond the provider's default `max_tokens`. Could add `max_tokens: 1024` for pass 1 to limit cost.
- Should two-pass be opt-in via a config flag rather than automatic? Leaning no -- if you chose an advanced strategy, you want the reasoning quality.

---

## 5. Scratch notes prompt fix

**File:** `server/promptStrategies.ts`
**Change:** 1 line edit

### 5.1 Current state

The `formatScratchNotes` function (line 74) produces:

```
--- STRATEGIC NOTES FROM PREVIOUS GAMES ---
The following are your accumulated strategic observations from prior games in this series. Use these insights to inform your decisions:

{notes}
--- END STRATEGIC NOTES ---
```

This tells the model to "use these insights" but does not explicitly instruct it to **build upon** them or **reference** them in its reasoning.

### 5.2 Change

**File:** `server/promptStrategies.ts`, line 74-77

Replace the `formatScratchNotes` function body:

```ts
function formatScratchNotes(notes?: string): string {
  if (!notes) return "";
  return `\n\n--- STRATEGIC NOTES FROM PREVIOUS GAMES ---
The following are your accumulated strategic observations from prior games in this series. Reference and build upon your previous notes when making decisions. Explicitly consider what worked and what failed in prior games before choosing your approach:

${notes}
--- END STRATEGIC NOTES ---`;
}
```

### 5.3 Scope of impact

This function is used in 4 places:
- `server/promptStrategies.ts` line 74 -- the `defaultStrategy` and `advancedStrategy` templates (both call `formatScratchNotes`)
- `server/enrichedStrategy.ts` line 22 -- the enriched strategy has its own copy of `formatScratchNotes`
- `server/kLevelStrategy.ts` line 19 -- the k-level strategy has its own copy of `formatScratchNotes`

**All three files** have independent copies of this function. The fix must be applied to all three:

1. `server/promptStrategies.ts` line 74
2. `server/enrichedStrategy.ts` line 22
3. `server/kLevelStrategy.ts` line 19

### 5.4 Risks

- Minor prompt change. Could theoretically affect model behavior in unexpected ways, but the intent is clear and the change is small.
- Consider whether to deduplicate the three copies into a shared utility. Out of scope for this item but worth noting as tech debt.

---

## Summary checklist

| # | Item | Files | Lines | Migration | New deps |
|---|------|-------|-------|-----------|----------|
| 1 | Bootstrap CIs + Cohen's d | `server/metrics.ts` | ~80 | No | None |
| 2 | experimentId on matches | `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `server/headlessRunner.ts` | ~30 | Yes (1 ALTER) | None |
| 3 | Evolution matches-per-eval default | `server/routes.ts` | ~2 | No | None |
| 4 | Two-pass reasoning | `server/ai.ts` | ~60 | No | None |
| 5 | Scratch notes prompt fix | `server/promptStrategies.ts`, `server/enrichedStrategy.ts`, `server/kLevelStrategy.ts` | ~3 | No | None |

**Total new dependencies: 0**
**Total new files: 0**
**Total migration steps: 1 (additive column)**
