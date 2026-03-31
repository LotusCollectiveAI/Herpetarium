# Week 3+ -- Research-Driven

**Scope:** First reproducible experiment (k-level vs default across 3 models), ablation framework, publication-ready CSV export.

**Estimated total new code:** ~300 lines across 3 new files, ~80 lines of modifications.

---

## 9. First reproducible experiment: k-level vs default across 3 models

**Modified files:** `server/routes.ts`, `server/storage.ts`
**New file:** `server/experimentRunner.ts`
**New code:** ~120 lines
**Dependencies:** None

### 9.1 Experiment config schema

Define a structured experiment configuration that captures everything needed to reproduce results.

**File:** `shared/schema.ts`

Add a new Zod schema and TypeScript type:

```ts
export const experimentConfigSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  hypothesis: z.string().optional(),

  // Independent variable: strategy comparison
  strategies: z.array(z.enum(["default", "advanced", "k-level", "enriched"])).min(2),

  // Models to test across
  models: z.array(z.object({
    provider: z.enum(["chatgpt", "claude", "gemini", "openrouter"]),
    model: z.string(),
  })).min(1),

  // Experiment parameters
  gamesPerCell: z.number().int().min(1).max(100).default(10),
  seed: z.string().optional(),  // Base seed; per-match seeds derived as `${seed}-${cellIndex}-${gameIndex}`

  // Optional ablations applied to all matches
  ablations: z.object({ flags: z.array(z.enum(["no_history", "no_scratch_notes", "no_opponent_history", "no_chain_of_thought", "random_clues"])) }).optional(),

  // Budget
  budgetCapUsd: z.string().optional(),
});

export type ExperimentConfig = z.infer<typeof experimentConfigSchema>;
```

### 9.2 Experiment design matrix

For the first experiment (k-level vs default across 3 models), the config would be:

```json
{
  "name": "K-level vs Default: GPT-4o, Claude Sonnet 4, Gemini 2.0 Flash",
  "description": "Tests whether k-level strategic reasoning improves win rate compared to default prompting across 3 frontier models.",
  "hypothesis": "K-level reasoning produces lower interception vulnerability and higher win rates, with effect size varying by model.",
  "strategies": ["default", "k-level"],
  "models": [
    { "provider": "chatgpt", "model": "gpt-4o" },
    { "provider": "claude", "model": "claude-sonnet-4-20250514" },
    { "provider": "gemini", "model": "gemini-2.0-flash" }
  ],
  "gamesPerCell": 10,
  "seed": "exp-klevel-v1",
  "budgetCapUsd": "5.00"
}
```

This produces a 2x3 matrix (2 strategies x 3 models) = 6 cells, each with 10 games = 60 total matches.

### 9.3 Seeded RNG verification

The headless runner already supports seeded RNG via `config.seed` (see `headlessRunner.ts` line 258: `const seed = config.seed || generateSeed()`). The seed controls:
- Keyword selection (`getRandomKeywords(4, rng)` at line 267)
- Secret code generation (via `createSeededRng` and `generateSecretCode`)

**Per-match seed derivation:**

```ts
function deriveMatchSeed(baseSeed: string, cellIndex: number, gameIndex: number): string {
  return `${baseSeed}-cell${cellIndex}-game${gameIndex}`;
}
```

**Verification approach:** For each cell in the matrix, the keyword sets and secret codes should be identical when the same seed is used. To verify:

1. Run a match with seed `exp-klevel-v1-cell0-game0`.
2. Run the same match again with the same seed.
3. Assert identical keywords and secret codes (logged in the `matches` table as `amberKeywords`, `blueKeywords`, `gameSeed`).

This verification can be done as a sanity check before the full experiment run, by running 2 matches with the same seed and comparing the stored keywords.

### 9.4 How experimentId isolates results

Using the `experimentId` column from Week 1 (item 2):

```ts
// When creating matches for an experiment, tag them:
const matchConfig: HeadlessMatchConfig = {
  players: [...],
  seed: deriveMatchSeed(config.seed, cellIdx, gameIdx),
  experimentId: `exp-${experimentId}`,  // Links back to the experiment record
};
```

Querying results for a specific experiment:

```ts
const matches = await storage.getAllMatches({ experimentId: `exp-${experimentId}` });
```

This keeps experiment data separate from ad-hoc matches and tournaments.

### 9.5 server/experimentRunner.ts

```ts
import type { ExperimentConfig, HeadlessMatchConfig, AIPlayerConfig } from "@shared/schema";
import { runHeadlessMatch } from "./headlessRunner";
import { storage } from "./storage";
import { log } from "./index";

interface ExperimentCell {
  strategy: string;
  provider: string;
  model: string;
  cellIndex: number;
}

function buildExperimentMatrix(config: ExperimentConfig): ExperimentCell[] {
  const cells: ExperimentCell[] = [];
  let cellIndex = 0;
  for (const strategy of config.strategies) {
    for (const { provider, model } of config.models) {
      cells.push({ strategy, provider, model, cellIndex });
      cellIndex++;
    }
  }
  return cells;
}

function buildMatchConfig(
  cell: ExperimentCell,
  gameIndex: number,
  baseSeed: string,
  experimentId: string,
  ablations?: { flags: string[] }
): HeadlessMatchConfig {
  const aiConfig: AIPlayerConfig = {
    provider: cell.provider as any,
    model: cell.model,
    timeoutMs: 120000,
    temperature: 0.7,
    promptStrategy: cell.strategy as any,
  };

  return {
    players: [
      { name: `${cell.strategy}-${cell.model}-A1`, aiProvider: cell.provider as any, team: "amber", aiConfig },
      { name: `${cell.strategy}-${cell.model}-A2`, aiProvider: cell.provider as any, team: "amber", aiConfig },
      { name: `${cell.strategy}-${cell.model}-B1`, aiProvider: cell.provider as any, team: "blue", aiConfig },
      { name: `${cell.strategy}-${cell.model}-B2`, aiProvider: cell.provider as any, team: "blue", aiConfig },
    ],
    seed: `${baseSeed}-cell${cell.cellIndex}-game${gameIndex}`,
    experimentId,
    ablations: ablations as any,
  };
}

export async function runExperiment(experimentId: number, config: ExperimentConfig): Promise<void> {
  const cells = buildExperimentMatrix(config);
  const baseSeed = config.seed || `exp-${experimentId}`;
  const experimentTag = `exp-${experimentId}`;
  let totalCost = 0;

  log(`[experiment] Starting experiment ${experimentId}: ${cells.length} cells x ${config.gamesPerCell} games = ${cells.length * config.gamesPerCell} matches`, "experiment");

  await storage.updateExperiment(experimentId, { status: "running" });

  for (const cell of cells) {
    for (let gameIdx = 0; gameIdx < config.gamesPerCell; gameIdx++) {
      // Budget check
      if (config.budgetCapUsd && totalCost >= parseFloat(config.budgetCapUsd)) {
        log(`[experiment] Budget cap reached at $${totalCost.toFixed(4)}`, "experiment");
        await storage.updateExperiment(experimentId, { status: "budget_exceeded" });
        return;
      }

      const matchConfig = buildMatchConfig(cell, gameIdx, baseSeed, experimentTag, config.ablations);

      try {
        const result = await runHeadlessMatch(matchConfig);

        // Track match IDs per strategy for results computation
        // (Update experiment.matchIdsA / matchIdsB based on which strategy this cell uses)
        // ...

        log(`[experiment] ${cell.strategy}/${cell.model} game ${gameIdx + 1}/${config.gamesPerCell}: winner=${result.winner}`, "experiment");
      } catch (err) {
        log(`[experiment] Match failed: ${err}`, "experiment");
      }
    }
  }

  // Compute results using existing metrics functions
  // Store results in experiment record
  await storage.updateExperiment(experimentId, {
    status: "completed",
    completedAt: new Date(),
  });
}
```

### 9.6 Expected output format

After experiment completion, the `experiments` table `results` JSONB column stores:

```json
{
  "matrix": [
    {
      "strategy": "default",
      "model": "gpt-4o",
      "provider": "chatgpt",
      "wins": 6,
      "losses": 4,
      "winRate": 0.6,
      "winRateCI": { "lower": 0.31, "upper": 0.86, "point": 0.6 },
      "interceptionVulnerability": 0.15,
      "miscommunicationRate": 0.08,
      "avgRounds": 5.3,
      "matchIds": [101, 102, 103, 104, 105, 106, 107, 108, 109, 110]
    },
    {
      "strategy": "k-level",
      "model": "gpt-4o",
      "provider": "chatgpt",
      "wins": 8,
      "losses": 2,
      "winRate": 0.8,
      "winRateCI": { "lower": 0.49, "upper": 0.96, "point": 0.8 },
      "interceptionVulnerability": 0.09,
      "miscommunicationRate": 0.12,
      "avgRounds": 6.1,
      "matchIds": [111, 112, 113, 114, 115, 116, 117, 118, 119, 120]
    }
    // ... 4 more cells
  ],
  "pairwiseComparisons": [
    {
      "model": "gpt-4o",
      "strategyA": "default",
      "strategyB": "k-level",
      "effectSize": 0.52,
      "effectSizeMagnitude": "medium",
      "winRateDiff": 0.2,
      "significanceIndicator": "Possibly significant"
    }
    // ... more comparisons
  ],
  "totalMatches": 60,
  "totalCostUsd": "3.42",
  "baseSeed": "exp-klevel-v1"
}
```

### 9.7 API endpoint

**File:** `server/routes.ts`

```ts
app.post("/api/experiments/v2", async (req, res) => {
  const parsed = experimentConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid experiment config", details: parsed.error.issues });
  }

  const config = parsed.data;
  const experiment = await storage.createExperiment({
    name: config.name,
    model: config.models.map(m => m.model).join(", "),
    provider: config.models.map(m => m.provider).join(", "),
    strategyA: config.strategies[0],
    strategyB: config.strategies[1],
    numGames: config.gamesPerCell * config.strategies.length * config.models.length,
    status: "pending",
    matchIdsA: [],
    matchIdsB: [],
    results: null,
  });

  runExperiment(experiment.id, config).catch(err => {
    console.error("Experiment failed:", err);
  });

  res.json({ id: experiment.id, status: "started" });
});
```

### 9.8 Risks

- **Cost:** 60 matches x ~$0.05/match (GPT-4o estimate) = ~$3. Well within a $5 budget cap.
- **Time:** At ~30s per match, 60 matches takes ~30 minutes sequential. Consider using the pg-boss queue from Week 2 for parallel execution.
- **Self-play limitation:** All 4 players in each match use the same model and strategy. This is intentional for the first experiment (controls for model ability), but means we're measuring strategy-vs-strategy only in a self-play context. Cross-model experiments come later.

---

## 10. Ablation framework

**Modified files:** `shared/schema.ts`, `server/enrichedStrategy.ts`, `server/experimentRunner.ts`
**New code:** ~50 lines
**Dependencies:** None

### 10.1 Current state

Ablation flags already exist (`shared/schema.ts` line 360):

```ts
export type AblationFlag = "no_history" | "no_scratch_notes" | "no_opponent_history" | "no_chain_of_thought" | "random_clues";
```

These are applied in `promptStrategies.ts` via `applyAblations()` (line 43) and consumed in `ai.ts` in `generateClues`, `generateGuess`, `generateInterception`.

The system already supports ablations at the match level. What's missing is:

1. **Module-level ablation for enriched strategy** -- toggling individual enriched strategy features (persona injection, semantic word context, structured task framing).
2. **Ablation integration into experiment configs** -- so experiments can systematically test with/without features.

### 10.2 Enriched strategy module flags

**File:** `shared/schema.ts`

Extend the ablation type:

```ts
export type AblationFlag =
  | "no_history"
  | "no_scratch_notes"
  | "no_opponent_history"
  | "no_chain_of_thought"
  | "random_clues"
  // Enriched strategy module ablations:
  | "no_persona"          // Disable persona injection
  | "no_semantic_context" // Disable word card vibe/tags in keyword listing
  | "no_structured_steps" // Use default-style prompts instead of numbered steps
  ;
```

### 10.3 Enriched strategy changes

**File:** `server/enrichedStrategy.ts`

The enriched strategy's `clueTemplate` (line 67) currently always calls `formatKeywordWithContext()` and `buildPersonaPrefix()`. Make these conditional on ablation flags.

Since ablation flags flow through the `params` object (all template params include `ablations?: AblationFlag[]`), the templates can check:

```ts
clueTemplate: (params: ClueTemplateParams): string => {
  const { keywords, targetCode, history } = params;
  const ablations = params.ablations || [];

  // Persona: skip if ablated
  const persona = ablations.includes("no_persona") ? undefined : getEnrichedPersona();
  const personaPrefix = buildPersonaPrefix(persona);

  // Keyword formatting: skip semantic context if ablated
  const formatKw = ablations.includes("no_semantic_context")
    ? (kw: string, i: number) => `${i}. ${kw}`
    : (kw: string, i: number) => formatKeywordWithContext(kw, i);

  // If no_structured_steps, fall through to default strategy
  if (ablations.includes("no_structured_steps")) {
    // Delegate to default strategy's clueTemplate
    const { getPromptStrategy } = require("./promptStrategies");
    return getPromptStrategy("default").clueTemplate(params);
  }

  // ... rest of enriched template using formatKw and personaPrefix ...
};
```

Apply the same pattern to `guessTemplate` and `interceptionTemplate`.

### 10.4 Experiment config integration

The `experimentConfigSchema` from item 9 already includes an optional `ablations` field. To support per-strategy ablations (e.g., test enriched with and without persona), extend the schema:

```ts
// In experimentConfigSchema:
ablationMatrix: z.array(z.object({
  flags: z.array(z.enum([
    "no_history", "no_scratch_notes", "no_opponent_history",
    "no_chain_of_thought", "random_clues",
    "no_persona", "no_semantic_context", "no_structured_steps"
  ])),
  label: z.string(),  // Human-readable name for this ablation condition
})).optional(),
```

When `ablationMatrix` is provided, each ablation condition becomes an additional axis in the experiment matrix. For example:

```json
{
  "strategies": ["enriched"],
  "models": [{ "provider": "chatgpt", "model": "gpt-4o" }],
  "gamesPerCell": 10,
  "ablationMatrix": [
    { "flags": [], "label": "full" },
    { "flags": ["no_persona"], "label": "no-persona" },
    { "flags": ["no_semantic_context"], "label": "no-semantic" },
    { "flags": ["no_persona", "no_semantic_context"], "label": "minimal" }
  ]
}
```

This produces 1 strategy x 1 model x 4 ablation conditions = 4 cells x 10 games = 40 matches. The experiment runner iterates over cells including the ablation dimension.

### 10.5 Risks

- **Circular dependency:** The enriched strategy importing from `promptStrategies.ts` (for the `no_structured_steps` fallback) is technically a circular dependency since `promptStrategies.ts` imports from `enrichedStrategy.ts`. Use a lazy `require()` or restructure by extracting the default templates to a shared file. The lazy require approach is simplest.
- **Combinatorial explosion:** With 4 ablation conditions x multiple strategies x multiple models, experiment size grows fast. The budget cap is the safety valve.

---

## 11. Publication-ready export

**New file:** `server/exportRouter.ts`
**Modified files:** `server/routes.ts`
**New code:** ~130 lines
**Dependencies:** None (uses built-in Node.js streams)

### 11.1 CSV export endpoint

```
GET /api/export/matches?experimentId=exp-42&format=csv
```

Returns a CSV file with all match data for the given experiment (or all matches if no experimentId).

### 11.2 Export schema

The CSV has one row per match, with columns:

```
match_id, experiment_id, game_id, game_seed, created_at, completed_at,
winner, total_rounds,
amber_keywords, blue_keywords,
amber_white_tokens, amber_black_tokens, blue_white_tokens, blue_black_tokens,
amber_model, amber_provider, amber_strategy, amber_temperature,
blue_model, blue_provider, blue_strategy, blue_temperature,
ablation_flags
```

### 11.3 Rounds export

```
GET /api/export/rounds?experimentId=exp-42&format=csv
```

One row per round:

```
match_id, round_number, team,
clue_giver_id, code_1, code_2, code_3,
clue_1, clue_2, clue_3,
own_guess_1, own_guess_2, own_guess_3,
opponent_guess_1, opponent_guess_2, opponent_guess_3,
own_correct, intercepted
```

### 11.4 AI call logs export

```
GET /api/export/ai-logs?experimentId=exp-42&format=csv
```

One row per AI API call:

```
match_id, round_number, provider, model, action_type,
prompt_length, response_length, latency_ms,
timed_out, parse_quality,
prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
has_reasoning_trace, reasoning_trace_length,
created_at
```

Note: The full prompt and response text are excluded from the default export to keep file sizes manageable. Include them with `?include_text=true`.

### 11.5 Implementation

**File:** `server/exportRouter.ts`

```ts
import type { Express, Request, Response } from "express";
import { storage } from "./storage";

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",") + "\n";
}

export function registerExportRoutes(app: Express): void {

  app.get("/api/export/matches", async (req: Request, res: Response) => {
    try {
      const experimentId = req.query.experimentId as string | undefined;
      const matches = await storage.getAllMatches({ experimentId });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition",
        `attachment; filename="matches${experimentId ? `-${experimentId}` : ""}-${new Date().toISOString().slice(0, 10)}.csv"`
      );

      // Header row
      res.write(csvRow([
        "match_id", "experiment_id", "game_id", "game_seed",
        "created_at", "completed_at", "winner", "total_rounds",
        "amber_keywords", "blue_keywords",
        "amber_white_tokens", "amber_black_tokens",
        "blue_white_tokens", "blue_black_tokens",
        "amber_model", "amber_provider", "amber_strategy", "amber_temperature",
        "blue_model", "blue_provider", "blue_strategy", "blue_temperature",
        "ablation_flags",
      ]));

      for (const match of matches) {
        const configs = (match.playerConfigs as any[]) || [];
        const amberAI = configs.find((c: any) => c.team === "amber" && c.isAI);
        const blueAI = configs.find((c: any) => c.team === "blue" && c.isAI);
        const ablations = match.ablations as any;

        res.write(csvRow([
          match.id,
          (match as any).experimentId || "",
          match.gameId,
          match.gameSeed,
          match.createdAt?.toISOString(),
          match.completedAt?.toISOString() || "",
          match.winner || "",
          match.totalRounds,
          JSON.stringify(match.amberKeywords),
          JSON.stringify(match.blueKeywords),
          match.amberWhiteTokens,
          match.amberBlackTokens,
          match.blueWhiteTokens,
          match.blueBlackTokens,
          amberAI?.aiConfig?.model || amberAI?.aiProvider || "",
          amberAI?.aiConfig?.provider || amberAI?.aiProvider || "",
          amberAI?.aiConfig?.promptStrategy || "default",
          amberAI?.aiConfig?.temperature ?? "",
          blueAI?.aiConfig?.model || blueAI?.aiProvider || "",
          blueAI?.aiConfig?.provider || blueAI?.aiProvider || "",
          blueAI?.aiConfig?.promptStrategy || "default",
          blueAI?.aiConfig?.temperature ?? "",
          ablations?.flags?.join(";") || "",
        ]));
      }

      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Export failed" });
    }
  });

  app.get("/api/export/rounds", async (req: Request, res: Response) => {
    try {
      const experimentId = req.query.experimentId as string | undefined;
      const matches = await storage.getAllMatches({ experimentId });
      const matchIds = matches.map(m => m.id);
      const rounds = await storage.getMatchRoundsForMatches(matchIds);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition",
        `attachment; filename="rounds${experimentId ? `-${experimentId}` : ""}-${new Date().toISOString().slice(0, 10)}.csv"`
      );

      res.write(csvRow([
        "match_id", "round_number", "team", "clue_giver_id",
        "code_1", "code_2", "code_3",
        "clue_1", "clue_2", "clue_3",
        "own_guess_1", "own_guess_2", "own_guess_3",
        "opponent_guess_1", "opponent_guess_2", "opponent_guess_3",
        "own_correct", "intercepted",
      ]));

      for (const r of rounds) {
        const code = r.code as number[];
        const clues = r.clues as string[];
        const ownGuess = r.ownGuess as number[] | null;
        const oppGuess = r.opponentGuess as number[] | null;

        res.write(csvRow([
          r.matchId, r.roundNumber, r.team, r.clueGiverId,
          code[0], code[1], code[2],
          clues[0] || "", clues[1] || "", clues[2] || "",
          ownGuess?.[0] ?? "", ownGuess?.[1] ?? "", ownGuess?.[2] ?? "",
          oppGuess?.[0] ?? "", oppGuess?.[1] ?? "", oppGuess?.[2] ?? "",
          r.ownCorrect, r.intercepted,
        ]));
      }

      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Export failed" });
    }
  });

  app.get("/api/export/ai-logs", async (req: Request, res: Response) => {
    try {
      const experimentId = req.query.experimentId as string | undefined;
      const includeText = req.query.include_text === "true";
      const matches = await storage.getAllMatches({ experimentId });
      const matchIds = matches.map(m => m.id);
      const logs = await storage.getAllAiCallLogs(matchIds);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition",
        `attachment; filename="ai-logs${experimentId ? `-${experimentId}` : ""}-${new Date().toISOString().slice(0, 10)}.csv"`
      );

      const headers = [
        "match_id", "round_number", "provider", "model", "action_type",
        "latency_ms", "timed_out", "parse_quality",
        "prompt_tokens", "completion_tokens", "total_tokens", "estimated_cost_usd",
        "has_reasoning_trace", "reasoning_trace_length",
        "created_at",
      ];
      if (includeText) {
        headers.push("prompt", "raw_response", "reasoning_trace");
      }
      res.write(csvRow(headers));

      for (const log of logs) {
        const row: unknown[] = [
          log.matchId, log.roundNumber, log.provider, log.model, log.actionType,
          log.latencyMs, log.timedOut, log.parseQuality,
          log.promptTokens, log.completionTokens, log.totalTokens, log.estimatedCostUsd,
          log.reasoningTrace ? true : false,
          log.reasoningTrace?.length || 0,
          log.createdAt?.toISOString(),
        ];
        if (includeText) {
          row.push(log.prompt, log.rawResponse, log.reasoningTrace || "");
        }
        res.write(csvRow(row));
      }

      res.end();
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Export failed" });
    }
  });
}
```

### 11.6 Route registration

**File:** `server/routes.ts`

At the end of `registerRoutes`:

```ts
import { registerExportRoutes } from "./exportRouter";

// Inside registerRoutes, after all other route registrations:
registerExportRoutes(app);
```

### 11.7 Metadata header (optional enhancement)

For publication reproducibility, include experiment metadata as CSV comment lines at the top of each file:

```csv
# Experiment: K-level vs Default: GPT-4o, Claude Sonnet 4, Gemini 2.0 Flash
# Experiment ID: exp-42
# Exported: 2026-04-15T14:30:00Z
# Total matches: 60
# Seed: exp-klevel-v1
# Platform: Decrypto Arena (Herpetarium)
match_id,experiment_id,game_id,...
```

This is a nice-to-have. Standard CSV parsers handle `#` comment lines, but some tools (Excel) do not. Consider making it opt-in via `?include_metadata=true`.

### 11.8 Risks

- **Memory:** For large exports (1000+ matches), loading all data into memory before streaming could be problematic. The current approach uses `res.write()` to stream row-by-row, but the initial `getAllMatches` call loads all match objects. For now this is fine -- 1000 matches is ~1MB of JSON. If needed later, switch to a cursor-based approach.
- **CSV escaping:** The `escapeCsv` helper handles commas, quotes, and newlines in field values. Clue text and reasoning traces can contain any characters, so this is important.
- **File size with reasoning traces:** If `include_text=true` is used, AI call logs with reasoning traces can be large (10KB+ per row). The CSV could be 100MB+ for a large experiment. Consider offering gzipped output or pagination.

### 11.9 Open questions

- **JSON export alternative?** CSV is standard for statistical tools (R, pandas). But a JSON export preserving full structure might be useful for programmatic analysis. Could offer both via `?format=csv` vs `?format=json`. Defer to user demand.
- **Should we include the experiment config in the export?** Yes -- add an `experiment-config.json` endpoint or include it as a separate export file. This ensures the experiment can be fully reproduced from the export alone.

---

## Summary checklist

| # | Item | Files | Lines | New deps |
|---|------|-------|-------|----------|
| 9 | Reproducible experiment runner | `server/experimentRunner.ts` (new), `shared/schema.ts`, `server/routes.ts` | ~120 | None |
| 10 | Ablation framework | `shared/schema.ts`, `server/enrichedStrategy.ts` | ~50 | None |
| 11 | Publication-ready export | `server/exportRouter.ts` (new), `server/routes.ts` | ~130 | None |

**Total new dependencies: 0**
**Total new files: 2**
**Total migration steps: 0**
