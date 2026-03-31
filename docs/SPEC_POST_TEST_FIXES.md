# Post-Test Fixes Implementation Spec

**Status:** Ready for implementation
**Estimated time:** ~1.5 hours
**Principle:** LLM intelligence at the center. Never constrain model outputs. Handle them gracefully.

---

## Fix 1: Parser -- Handle thinking text leaking into responses

**Problem:** When Opus uses extended thinking, reasoning text ("LEVEL 0 -- ASSOCIATIONS:", "lookingatthisthroughallfourlevels") leaks into the text block and gets parsed as clue words.

**Approach:** Try to extract a clean answer pattern first. If not found, fall back to current parsing but filter out noise. Add an "ANSWER:" prefix instruction to all templates so models have a clear signal.

### 1a. Parser changes in `server/ai.ts`

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/ai.ts`

#### `parseCluesResponse` (line 528)

```
OLD:
function parseCluesResponse(response: string): ParseResult<string[]> {
  const lines = response.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  let words: string[] = [];

  for (const line of lines) {
    const lineWords = line.split(",").map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length > 0);
    words.push(...lineWords);
  }

  if (words.length === 0) {
    words = response.split(/[\s,]+/).map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length > 0);
  }

  if (words.length >= 3) {
    return { value: words.slice(0, 3), quality: "clean" };
  }

  if (words.length > 0 && words.length < 3) {
    while (words.length < 3) words.push("hint");
    console.warn(`[PARSE_PARTIAL] parseCluesResponse padded incomplete response: "${response.slice(0, 200)}"`);
    return { value: words, quality: "partial_recovery" };
  }

  console.warn(`[PARSE_FALLBACK] parseCluesResponse got unusable response: "${response.slice(0, 200)}"`);
  return { value: ["hint", "clue", "guess"], quality: "fallback_used" };
}
```

```
NEW:
function parseCluesResponse(response: string): ParseResult<string[]> {
  // Strategy 1: Look for "ANSWER:" prefix line, then extract word,word,word from it
  const answerMatch = response.match(/ANSWER:\s*(.+)/i);
  const searchText = answerMatch ? answerMatch[1] : response;

  // Strategy 2: Find a clean word,word,word pattern (last match wins — answer is usually at the end)
  const cleanPattern = /\b([a-z]{2,25})\s*,\s*([a-z]{2,25})\s*,\s*([a-z]{2,25})\b/gi;
  let lastCleanMatch: RegExpMatchArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = cleanPattern.exec(searchText)) !== null) {
    lastCleanMatch = match;
  }

  if (lastCleanMatch) {
    const words = [lastCleanMatch[1].toLowerCase(), lastCleanMatch[2].toLowerCase(), lastCleanMatch[3].toLowerCase()];
    // Filter out any "word" longer than 25 chars (thinking noise)
    if (words.every(w => w.length >= 2 && w.length <= 25)) {
      return { value: words, quality: "clean" };
    }
  }

  // Strategy 3: Fall back to line-by-line parsing but filter out words > 25 chars
  const lines = response.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  let words: string[] = [];

  for (const line of lines) {
    const lineWords = line.split(",").map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length >= 2 && w.length <= 25);
    words.push(...lineWords);
  }

  if (words.length === 0) {
    words = response.split(/[\s,]+/).map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length >= 2 && w.length <= 25);
  }

  if (words.length >= 3) {
    return { value: words.slice(0, 3), quality: "partial_recovery" };
  }

  if (words.length > 0 && words.length < 3) {
    while (words.length < 3) words.push("hint");
    console.warn(`[PARSE_PARTIAL] parseCluesResponse padded incomplete response: "${response.slice(0, 200)}"`);
    return { value: words, quality: "partial_recovery" };
  }

  console.warn(`[PARSE_FALLBACK] parseCluesResponse got unusable response: "${response.slice(0, 200)}"`);
  return { value: ["hint", "clue", "guess"], quality: "fallback_used" };
}
```

#### `parseCodeResponse` (line 513) -- used by both guess and interception

```
OLD:
function parseCodeResponse(response: string): ParseResult<[number, number, number]> {
  const cleaned = response.replace(/[^1-4,\s]/g, "");
  const numbers = cleaned.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 4);

  if (numbers.length >= 3) {
    const code = [numbers[0], numbers[1], numbers[2]] as [number, number, number];
    const unique = new Set(code);
    const quality: ParseQuality = unique.size === 3 ? "clean" : "partial_recovery";
    return { value: code, quality };
  }

  console.warn(`[PARSE_FALLBACK] parseCodeResponse got unusable response: "${response.slice(0, 200)}"`);
  return { value: [1, 2, 3] as [number, number, number], quality: "fallback_used" };
}
```

```
NEW:
function parseCodeResponse(response: string): ParseResult<[number, number, number]> {
  // Strategy 1: Look for "ANSWER:" prefix line
  const answerMatch = response.match(/ANSWER:\s*(.+)/i);
  const searchText = answerMatch ? answerMatch[1] : response;

  // Strategy 2: Find a clean digit,digit,digit pattern (last match wins)
  const cleanPattern = /\b([1-4])\s*,\s*([1-4])\s*,\s*([1-4])\b/g;
  let lastCleanMatch: RegExpMatchArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = cleanPattern.exec(searchText)) !== null) {
    lastCleanMatch = match;
  }

  if (lastCleanMatch) {
    const code = [parseInt(lastCleanMatch[1]), parseInt(lastCleanMatch[2]), parseInt(lastCleanMatch[3])] as [number, number, number];
    const unique = new Set(code);
    const quality: ParseQuality = unique.size === 3 ? "clean" : "partial_recovery";
    return { value: code, quality };
  }

  // Strategy 3: Fall back to current approach (strip non-digit-non-comma, split)
  const cleaned = response.replace(/[^1-4,\s]/g, "");
  const numbers = cleaned.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 4);

  if (numbers.length >= 3) {
    const code = [numbers[0], numbers[1], numbers[2]] as [number, number, number];
    const unique = new Set(code);
    const quality: ParseQuality = unique.size === 3 ? "partial_recovery" : "partial_recovery";
    return { value: code, quality };
  }

  console.warn(`[PARSE_FALLBACK] parseCodeResponse got unusable response: "${response.slice(0, 200)}"`);
  return { value: [1, 2, 3] as [number, number, number], quality: "fallback_used" };
}
```

### 1b. Add "ANSWER:" instruction to all prompt strategy templates

Add this line before the final "Respond with..." instruction in every template (clue, guess, interception) across all 4 strategy files.

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/promptStrategies.ts`

#### Default strategy -- clueTemplate (line 106)

```
OLD:
    prompt += `\n\nRespond with exactly 3 words separated by commas, nothing else. Example: ocean,bright,ancient`;
```
```
NEW:
    prompt += `\n\nANSWER: Respond with exactly 3 words separated by commas on a line starting with "ANSWER:". Example:\nANSWER: ocean,bright,ancient`;
```

#### Default strategy -- guessTemplate (line 127)

```
OLD:
    prompt += `\n\nRespond with exactly 3 numbers (1-4) separated by commas. Example: 3,1,4`;
```
```
NEW:
    prompt += `\n\nANSWER: Respond with exactly 3 numbers (1-4) separated by commas on a line starting with "ANSWER:". Example:\nANSWER: 3,1,4`;
```

#### Default strategy -- interceptionTemplate (line 146)

```
OLD:
    prompt += `\n\nRespond with exactly 3 numbers (1-4) separated by commas. Example: 2,4,1`;
```
```
NEW:
    prompt += `\n\nANSWER: Respond with exactly 3 numbers (1-4) separated by commas on a line starting with "ANSWER:". Example:\nANSWER: 2,4,1`;
```

#### Advanced strategy -- clueTemplate (line 191)

```
OLD:
    prompt += `\n\nRespond with ONLY 3 words separated by commas, nothing else. Example: ocean,bright,ancient`;
```
```
NEW:
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Respond with ONLY 3 words separated by commas. Example:\nANSWER: ocean,bright,ancient`;
```

#### Advanced strategy -- guessTemplate (line 220)

```
OLD:
    prompt += `\nStep 5 — Final Answer: Commit to the mapping with highest confidence.

Respond with exactly 3 numbers (1-4) separated by commas. Example: 3,1,4`;
```
```
NEW:
    prompt += `\nStep 5 — Final Answer: Commit to the mapping with highest confidence.

Put your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 3,1,4`;
```

#### Advanced strategy -- interceptionTemplate (line 245)

```
OLD:
    prompt += `\nStep 6 — Final Interception: Commit to your best guess of their code.

Respond with exactly 3 numbers (1-4) separated by commas. Example: 2,4,1`;
```
```
NEW:
    prompt += `\nStep 6 — Final Interception: Commit to your best guess of their code.

Put your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 2,4,1`;
```

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/kLevelStrategy.ts`

#### clueTemplate (line 67)

```
OLD:
    prompt += `\n\nRespond with ONLY 3 words separated by commas, nothing else. Example: ocean,bright,ancient`;
```
```
NEW:
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Respond with ONLY 3 words separated by commas. Example:\nANSWER: ocean,bright,ancient`;
```

#### guessTemplate (line 97)

```
OLD:
    prompt += `\n\nRespond with exactly 3 numbers (1-4) separated by commas. Example: 3,1,4`;
```
```
NEW:
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 3,1,4`;
```

#### interceptionTemplate (line 123)

```
OLD:
    prompt += `\n\nRespond with exactly 3 numbers (1-4) separated by commas. Example: 2,4,1`;
```
```
NEW:
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 2,4,1`;
```

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/enrichedStrategy.ts`

#### clueTemplate (line 100)

```
OLD:
    prompt += `\n\nRespond with ONLY 3 single words separated by commas. No explanations. Example: ocean,bright,ancient`;
```
```
NEW:
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Respond with ONLY 3 single words separated by commas. No explanations. Example:\nANSWER: ocean,bright,ancient`;
```

#### guessTemplate (line 134)

```
OLD:
    prompt += `\n\nRespond with exactly 3 numbers (1-4) separated by commas. Example: 3,1,4`;
```
```
NEW:
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 3,1,4`;
```

#### interceptionTemplate (line 164)

```
OLD:
    prompt += `\n\nRespond with exactly 3 numbers (1-4) separated by commas. Example: 2,4,1`;
```
```
NEW:
    prompt += `\n\nPut your final answer on its own line starting with "ANSWER:". Example:\nANSWER: 2,4,1`;
```

---

## Fix 2: Timeout wiring -- Use config.timeoutMs, remove hardcoded floor

**Problem:** `headlessRunner.ts` has `const AI_TIMEOUT_MS = 60000` which is overridden by `Math.max(timeoutMs, 600000)`. The player's `config.timeoutMs` is never actually used.

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/headlessRunner.ts`

### 2a. Remove `AI_TIMEOUT_MS` constant (line 28)

```
OLD:
const AI_TIMEOUT_MS = 60000;
```
```
NEW:
// Timeout is now controlled per-player via config.timeoutMs (validated by schema: min 10s, max 1hr)
```

### 2b. Remove the floor override in `withTimeout` (lines 46-47)

```
OLD:
  // Only apply timeout as a safety net — use generous default to let models think freely
  const effectiveTimeout = Math.max(timeoutMs, 600000); // Minimum 10 minutes
  const timeoutPromise = new Promise<{ result: AICallResult<T>; timedOut: boolean }>(resolve =>
    setTimeout(() => resolve({
      result: { result: fallback, prompt: "", rawResponse: "", model, latencyMs: effectiveTimeout, error: "timeout", parseQuality: "error" as const },
      timedOut: true,
    }), effectiveTimeout)
```
```
NEW:
  // Timeout controlled by config.timeoutMs — no floor override. Researchers set their own limits.
  const timeoutPromise = new Promise<{ result: AICallResult<T>; timedOut: boolean }>(resolve =>
    setTimeout(() => resolve({
      result: { result: fallback, prompt: "", rawResponse: "", model, latencyMs: timeoutMs, error: "timeout", parseQuality: "error" as const },
      timedOut: true,
    }), timeoutMs)
```

### 2c. Pass `config.timeoutMs` through to all `withTimeout` calls

In `processClues` (line 113):

```
OLD:
    const { result: callResult, timedOut } = await withTimeout(
      generateClues(config, clueParams),
      AI_TIMEOUT_MS,
      fallbackClues,
      config.model
    );
```
```
NEW:
    const { result: callResult, timedOut } = await withTimeout(
      generateClues(config, clueParams),
      config.timeoutMs,
      fallbackClues,
      config.model
    );
```

In `processGuesses` (line 152):

```
OLD:
    const { result: callResult, timedOut } = await withTimeout(
      generateGuess(config, guessParams),
      AI_TIMEOUT_MS,
      fallbackGuess,
      config.model
    );
```
```
NEW:
    const { result: callResult, timedOut } = await withTimeout(
      generateGuess(config, guessParams),
      config.timeoutMs,
      fallbackGuess,
      config.model
    );
```

In `processInterceptions` (line 186):

```
OLD:
    const { result: callResult, timedOut } = await withTimeout(
      generateInterception(config, interceptParams),
      AI_TIMEOUT_MS,
      fallbackGuess,
      config.model
    );
```
```
NEW:
    const { result: callResult, timedOut } = await withTimeout(
      generateInterception(config, interceptParams),
      config.timeoutMs,
      fallbackGuess,
      config.model
    );
```

---

## Fix 3: Error handling -- Don't use garbage data from timeouts/failures

**Problem:** When a timeout or parse failure happens, the game silently uses fallback values. The clue fallback uses `keywords[n-1].slice(0, 3)` which leaks secret keywords to the opponent team.

### 3a. Fix the keyword-leaking fallback clues in `processClues`

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/headlessRunner.ts`

In `processClues` (line 110):

```
OLD:
    const fallbackClues = code.map(n => keywords[n - 1].slice(0, 3));
```
```
NEW:
    const GENERIC_FALLBACK_POOL = ["signal", "trace", "mark", "pulse", "drift", "bloom", "frost", "ridge", "shore", "vault"];
    const fallbackClues = Array.from({ length: 3 }, () => GENERIC_FALLBACK_POOL[Math.floor(Math.random() * GENERIC_FALLBACK_POOL.length)]);
```

### 3b. Log warnings for timeouts and parse errors

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/headlessRunner.ts`

After each `withTimeout` call, add warning logging. Update `processClues` (after line 120):

```
OLD:
    await logAiCall(matchId, game.id, game.round, clueGiver.aiProvider, "generate_clues", callResult, timedOut);
    game = submitClues(game, team, callResult.result);
```
```
NEW:
    if (timedOut) {
      log(`[headless] WARNING: Clue generation timed out for ${clueGiver.name} (${config.model}) in match ${matchId} round ${game.round}`, "headless");
    }
    if (callResult.parseQuality === "error") {
      log(`[headless] WARNING: Clue parse error for ${clueGiver.name} (${config.model}) in match ${matchId} round ${game.round}. Raw: "${(callResult.rawResponse || "").slice(0, 200)}"`, "headless");
    }
    const usedFallback = timedOut || callResult.parseQuality === "error" || callResult.parseQuality === "fallback_used";
    await logAiCall(matchId, game.id, game.round, clueGiver.aiProvider, "generate_clues", callResult, timedOut, usedFallback);
    game = submitClues(game, team, callResult.result);
```

Same pattern for `processGuesses` (after line 159):

```
OLD:
    await logAiCall(matchId, game.id, game.round, aiGuesser.aiProvider, "generate_guess", callResult, timedOut);
    game = submitOwnTeamGuess(game, team, callResult.result);
```
```
NEW:
    if (timedOut) {
      log(`[headless] WARNING: Guess generation timed out for ${aiGuesser.name} (${config.model}) in match ${matchId} round ${game.round}`, "headless");
    }
    if (callResult.parseQuality === "error") {
      log(`[headless] WARNING: Guess parse error for ${aiGuesser.name} (${config.model}) in match ${matchId} round ${game.round}. Raw: "${(callResult.rawResponse || "").slice(0, 200)}"`, "headless");
    }
    const usedFallback = timedOut || callResult.parseQuality === "error" || callResult.parseQuality === "fallback_used";
    await logAiCall(matchId, game.id, game.round, aiGuesser.aiProvider, "generate_guess", callResult, timedOut, usedFallback);
    game = submitOwnTeamGuess(game, team, callResult.result);
```

Same pattern for `processInterceptions` (after line 190):

```
OLD:
    await logAiCall(matchId, game.id, game.round, aiInterceptor.aiProvider, "generate_interception", callResult, timedOut);
    game = submitInterception(game, team, callResult.result);
```
```
NEW:
    if (timedOut) {
      log(`[headless] WARNING: Interception generation timed out for ${aiInterceptor.name} (${config.model}) in match ${matchId} round ${game.round}`, "headless");
    }
    if (callResult.parseQuality === "error") {
      log(`[headless] WARNING: Interception parse error for ${aiInterceptor.name} (${config.model}) in match ${matchId} round ${game.round}. Raw: "${(callResult.rawResponse || "").slice(0, 200)}"`, "headless");
    }
    const usedFallback = timedOut || callResult.parseQuality === "error" || callResult.parseQuality === "fallback_used";
    await logAiCall(matchId, game.id, game.round, aiInterceptor.aiProvider, "generate_interception", callResult, timedOut, usedFallback);
    game = submitInterception(game, team, callResult.result);
```

### 3c. Add `usedFallback` parameter to `logAiCall`

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/headlessRunner.ts`

```
OLD:
async function logAiCall(matchId: number, gameId: string, roundNumber: number, provider: string, actionType: string, callResult: AICallResult<any>, timedOut: boolean) {
```
```
NEW:
async function logAiCall(matchId: number, gameId: string, roundNumber: number, provider: string, actionType: string, callResult: AICallResult<any>, timedOut: boolean, usedFallback: boolean = false) {
```

And in the `storage.createAiCallLog` call inside `logAiCall`, add the field:

```
OLD:
      parseQuality: callResult.parseQuality || null,
```
```
NEW:
      parseQuality: callResult.parseQuality || null,
      usedFallback,
```

### 3d. Add `usedFallback` column to `aiCallLogs` schema

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts`

In the `aiCallLogs` table definition, after the `parseQuality` column (line 276):

```
OLD:
  parseQuality: varchar("parse_quality", { length: 20 }),
  promptTokens: integer("prompt_tokens"),
```
```
NEW:
  parseQuality: varchar("parse_quality", { length: 20 }),
  usedFallback: boolean("used_fallback").notNull().default(false),
  promptTokens: integer("prompt_tokens"),
```

**Migration SQL:**
```sql
ALTER TABLE ai_call_logs ADD COLUMN used_fallback BOOLEAN NOT NULL DEFAULT false;
```

---

## Fix 4: Add reasoning_effort to AIPlayerConfig

**Problem:** `reasoning_effort` is hardcoded to "xhigh" for all GPT-5+ models with advanced strategies. Calls take 5-10 minutes and cost 3-5x more. Researchers need control.

### 4a. Add to AIPlayerConfig schema

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/shared/schema.ts`

```
OLD:
export const aiPlayerConfigSchema = z.object({
  provider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
  model: z.string(),
  timeoutMs: z.number().min(10000).max(3600000).default(300000), // Up to 1 hour, default 5 min
  temperature: z.number().min(0).max(2).optional(),
  promptStrategy: z.enum(["default", "advanced", "k-level", "enriched"]).default("default"),
});
```
```
NEW:
export const aiPlayerConfigSchema = z.object({
  provider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
  model: z.string(),
  timeoutMs: z.number().min(10000).max(3600000).default(300000), // Up to 1 hour, default 5 min
  temperature: z.number().min(0).max(2).optional(),
  promptStrategy: z.enum(["default", "advanced", "k-level", "enriched"]).default("default"),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).default("high"),
});
```

### 4b. Wire through to OpenAI calls

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/ai.ts`

In `callOpenAI`, for reasoning models (line 225):

```
OLD:
      reasoning_effort: "high",
```
```
NEW:
      reasoning_effort: config.reasoningEffort || "high",
```

For modern models with advanced strategies (lines 266-268):

```
OLD:
    if (advancedStrategies.includes(config.promptStrategy)) {
      completionParams.reasoning_effort = "xhigh";
      completionParams.max_completion_tokens = 100000;
    }
```
```
NEW:
    if (advancedStrategies.includes(config.promptStrategy)) {
      completionParams.reasoning_effort = config.reasoningEffort || "high";
      completionParams.max_completion_tokens = 100000;
    }
```

### 4c. Wire through to Anthropic calls (map to budget_tokens)

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/ai.ts`

Add a mapping helper near the top of the file (after the `isGeminiThinkingModel` function, around line 137):

```
NEW (insert after line 137):
const ANTHROPIC_THINKING_BUDGET: Record<string, number> = {
  low: 5000,
  medium: 15000,
  high: 30000,
  xhigh: 50000,
};
```

In `callAnthropic`, in the extended thinking block (line 300):

```
OLD:
        thinking: {
          type: "enabled",
          budget_tokens: 50000,
        },
```
```
NEW:
        thinking: {
          type: "enabled",
          budget_tokens: ANTHROPIC_THINKING_BUDGET[config.reasoningEffort || "high"] || 30000,
        },
```

### 4d. Wire through to OpenRouter calls

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/ai.ts`

In `callOpenRouter` (line 456):

```
OLD:
  if (isReasoning) {
    body.reasoning = { effort: "high" };
  }
```
```
NEW:
  if (isReasoning) {
    body.reasoning = { effort: config.reasoningEffort || "high" };
  }
```

---

## Fix 5: Abbreviation rule clarification in prompts

**Problem:** GPT-5.4 used "umb" for umbrella, "ecl" for eclipse -- gaming the rules with abbreviations/fragments.

### 5a. Add to all clue templates

Add this sentence to the clue rules in all 4 strategy files, right after the existing single-word rule.

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/promptStrategies.ts`

Default clueTemplate (line 93, after the single-word rule):

```
OLD:
Give 3 clues (one per code number) that help your teammates identify the correct keywords. Each clue must be a SINGLE WORD — no phrases, numbers, or symbols. Clues cannot be any keyword or share the same root.
```
```
NEW:
Give 3 clues (one per code number) that help your teammates identify the correct keywords. Each clue must be a complete, real English word (minimum 3 letters). No abbreviations, acronyms, fragments, or prefixes. No phrases, numbers, or symbols. Clues cannot be any keyword or share the same root.
```

Advanced clueTemplate (line 189):

```
OLD:
RULES: Each clue must be a SINGLE WORD. No phrases, numbers, or symbols. Cannot be any keyword or share the same root.`;
```
```
NEW:
RULES: Each clue must be a complete, real English word (minimum 3 letters). No abbreviations, acronyms, fragments, or prefixes. No phrases, numbers, or symbols. Cannot be any keyword or share the same root.`;
```

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/kLevelStrategy.ts`

clueTemplate (line 58):

```
OLD:
RULES: Each clue must be a SINGLE WORD. No phrases, numbers, or symbols. Cannot be any keyword or share the same root.`;
```
```
NEW:
RULES: Each clue must be a complete, real English word (minimum 3 letters). No abbreviations, acronyms, fragments, or prefixes. No phrases, numbers, or symbols. Cannot be any keyword or share the same root.`;
```

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/enrichedStrategy.ts`

clueTemplate (line 89-90):

```
OLD:
6. Each clue must be a SINGLE WORD — no phrases, numbers, or symbols.
7. Clues cannot be any keyword or share the same root as a keyword.`;
```
```
NEW:
6. Each clue must be a complete, real English word (minimum 3 letters). No abbreviations, acronyms, fragments, or prefixes.
7. No phrases, numbers, or symbols. Clues cannot be any keyword or share the same root as a keyword.`;
```

### 5b. Add minimum length filter to `parseCluesResponse`

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/ai.ts`

This is already handled in the Fix 1 rewrite of `parseCluesResponse` -- the regex requires `{2,25}` character words, and the fallback filters use `w.length >= 2`. Change the minimum to 3 for the clean pattern:

In the new `parseCluesResponse` from Fix 1, change the clean regex:

```
OLD (from Fix 1):
  const cleanPattern = /\b([a-z]{2,25})\s*,\s*([a-z]{2,25})\s*,\s*([a-z]{2,25})\b/gi;
```
```
NEW:
  const cleanPattern = /\b([a-z]{3,25})\s*,\s*([a-z]{3,25})\s*,\s*([a-z]{3,25})\b/gi;
```

And in the fallback line-by-line parsing:

```
OLD (from Fix 1):
    const lineWords = line.split(",").map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length >= 2 && w.length <= 25);
```
```
NEW:
    const lineWords = line.split(",").map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length >= 3 && w.length <= 25);
```

And:

```
OLD (from Fix 1):
    words = response.split(/[\s,]+/).map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length >= 2 && w.length <= 25);
```
```
NEW:
    words = response.split(/[\s,]+/).map(w => w.trim().toLowerCase().replace(/[^a-z]/g, "")).filter(w => w.length >= 3 && w.length <= 25);
```

Also add a warning when short words are detected. After the clean pattern check:

```
NEW (insert after the cleanPattern match check, before Strategy 3 fallback):
  // Log if we see very short words that look like abbreviations
  const allCandidates = response.match(/\b[a-z]{1,2}\b/gi);
  if (allCandidates && allCandidates.length > 0) {
    console.warn(`[PARSE_WARN] Short word candidates rejected (possible abbreviations): ${allCandidates.join(", ")}`);
  }
```

---

## Fix 6: Fix fallback clues that leak keywords

**Problem:** In `headlessRunner.ts`, the timeout fallback for clues uses `code.map(n => keywords[n-1].slice(0, 3))` which directly leaks the secret keywords to the opponent team.

**NOTE:** This is already fixed as part of Fix 3a above. The change is:

**File:** `/Users/mstraw/Documents/GitHub/Herpetarium/server/headlessRunner.ts`

```
OLD:
    const fallbackClues = code.map(n => keywords[n - 1].slice(0, 3));
```
```
NEW:
    const GENERIC_FALLBACK_POOL = ["signal", "trace", "mark", "pulse", "drift", "bloom", "frost", "ridge", "shore", "vault"];
    const fallbackClues = Array.from({ length: 3 }, () => GENERIC_FALLBACK_POOL[Math.floor(Math.random() * GENERIC_FALLBACK_POOL.length)]);
```

The pool contains 10 generic words that have no semantic connection to any specific keyword. Three are picked randomly each time a fallback is needed.

---

## Summary of files changed

| File | Fixes |
|------|-------|
| `server/ai.ts` | 1a (parsers), 4b/4c/4d (reasoning_effort wiring), 5b (min length filter) |
| `server/headlessRunner.ts` | 2a/2b/2c (timeout wiring), 3a/3b/3c (fallback + logging), 6 (keyword leak) |
| `server/promptStrategies.ts` | 1b (ANSWER prefix), 5a (abbreviation rule) |
| `server/kLevelStrategy.ts` | 1b (ANSWER prefix), 5a (abbreviation rule) |
| `server/enrichedStrategy.ts` | 1b (ANSWER prefix), 5a (abbreviation rule) |
| `shared/schema.ts` | 3d (usedFallback column), 4a (reasoningEffort field) |

**Migration SQL required:**
```sql
ALTER TABLE ai_call_logs ADD COLUMN used_fallback BOOLEAN NOT NULL DEFAULT false;
```

No new dependencies. No new files. No complex retry logic.
