# Week 2 -- Infrastructure

**Scope:** pg-boss job queue for match execution, Bradley-Terry rating system, visx charting for eval dashboard.

**Estimated total new code:** ~400 lines across 4 new files, ~100 lines of modifications.

---

## 6. pg-boss job queue for tournament & evolution runners

**New file:** `server/jobQueue.ts`
**Modified files:** `server/tournament.ts`, `server/evolution.ts`, `server/index.ts`, `server/routes.ts`
**New dependency:** `pg-boss`
**New code:** ~150 lines

### 6.1 Why pg-boss

The current tournament runner (`server/tournament.ts`) and evolution runner (`server/evolution.ts`) execute matches in-memory using `Promise`-based concurrency with `p-limit`. Problems:
- Server restart loses all in-flight matches with no recovery.
- No visibility into queued work beyond the `activeRuns` Map.
- Concurrency control is per-process, not per-database.

pg-boss uses the existing PostgreSQL database (no new infrastructure) and provides:
- Durable job persistence (survives restarts).
- Automatic retry with exponential backoff.
- Concurrency control via `teamSize`.
- Job state visibility via SQL queries.

### 6.2 Install

```bash
npm install pg-boss
```

### 6.3 server/jobQueue.ts

```ts
import PgBoss from "pg-boss";

let boss: PgBoss | null = null;

export async function initJobQueue(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    retryLimit: 2,
    retryDelay: 5,          // seconds
    retryBackoff: true,
    expireInHours: 2,       // matches shouldn't take > 2h
    archiveCompletedAfterSeconds: 86400, // keep completed jobs 24h
    deleteAfterDays: 7,
  });

  boss.on("error", (err) => {
    console.error("[job-queue] pg-boss error:", err);
  });

  await boss.start();
  console.log("[job-queue] pg-boss started");
  return boss;
}

export function getJobQueue(): PgBoss {
  if (!boss) throw new Error("Job queue not initialized. Call initJobQueue() first.");
  return boss;
}

export async function stopJobQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 30000 });
    boss = null;
  }
}

// --- Queue names ---
export const QUEUE_TOURNAMENT_MATCH = "tournament-match";
export const QUEUE_EVOLUTION_MATCH = "evolution-match";

// --- Job payload types ---
export interface TournamentMatchJob {
  tournamentId: number;
  tournamentMatchId: number;
  matchConfig: any; // HeadlessMatchConfig
  matchIndex: number;
}

export interface EvolutionMatchJob {
  evolutionRunId: number;
  generationNumber: number;
  genomeIdxA: number;
  genomeIdxB: number;
  matchConfig: any; // HeadlessMatchConfig
  teamSystemPrompts?: Record<string, string>;
}

/**
 * Register job handlers. Call once at server startup after initJobQueue().
 */
export async function registerJobHandlers(
  onTournamentMatch: (job: TournamentMatchJob) => Promise<void>,
  onEvolutionMatch: (job: EvolutionMatchJob) => Promise<void>,
): Promise<void> {
  const queue = getJobQueue();

  await queue.work<TournamentMatchJob>(
    QUEUE_TOURNAMENT_MATCH,
    { teamSize: 2, teamConcurrency: 2 },
    async (job) => {
      await onTournamentMatch(job.data);
    }
  );

  await queue.work<EvolutionMatchJob>(
    QUEUE_EVOLUTION_MATCH,
    { teamSize: 1, teamConcurrency: 1 },
    async (job) => {
      await onEvolutionMatch(job.data);
    }
  );
}

/**
 * Enqueue a tournament match.
 */
export async function enqueueTournamentMatch(job: TournamentMatchJob): Promise<string | null> {
  return getJobQueue().send(QUEUE_TOURNAMENT_MATCH, job, {
    retryLimit: 2,
    expireInMinutes: 30,
  });
}

/**
 * Enqueue an evolution match.
 */
export async function enqueueEvolutionMatch(job: EvolutionMatchJob): Promise<string | null> {
  return getJobQueue().send(QUEUE_EVOLUTION_MATCH, job, {
    retryLimit: 1,
    expireInMinutes: 30,
  });
}
```

### 6.4 Wiring into server/index.ts

**File:** `server/index.ts`

At server startup, after database connection is confirmed:

```ts
import { initJobQueue, registerJobHandlers } from "./jobQueue";
import { handleTournamentMatchJob } from "./tournament";
import { handleEvolutionMatchJob } from "./evolution";

// In the startup sequence:
await initJobQueue();
await registerJobHandlers(handleTournamentMatchJob, handleEvolutionMatchJob);
```

### 6.5 Wiring into tournament.ts

**File:** `server/tournament.ts`

Currently, `runTournament` iterates over match configs and calls `runHeadlessMatch` directly with `p-limit` concurrency. Replace the inner loop with job enqueueing.

**Export a new handler function:**

```ts
export async function handleTournamentMatchJob(job: TournamentMatchJob): Promise<void> {
  // This is the body of what currently happens inside the p-limit callback:
  // 1. Run the headless match
  // 2. Update the tournament match record
  // 3. Update tournament progress counters
  const result = await runHeadlessMatch(job.matchConfig);
  await storage.updateTournamentMatch(job.tournamentMatchId, {
    matchId: result.matchId,
    status: "completed",
    result: { winner: result.winner, totalRounds: result.totalRounds },
    completedAt: new Date(),
  });
  // Atomically increment completedMatches
  await storage.incrementTournamentCompletedMatches(job.tournamentId);
}
```

**Modify `runTournament`:**

Instead of the current loop with `p-limit`, enqueue all matches:

```ts
for (const [index, matchConfig] of allMatchConfigs.entries()) {
  const tm = await storage.createTournamentMatch({
    tournamentId: tournament.id,
    matchIndex: index,
    status: "queued",
    config: matchConfig,
  });
  await enqueueTournamentMatch({
    tournamentId: tournament.id,
    tournamentMatchId: tm.id,
    matchConfig,
    matchIndex: index,
  });
}
```

**New storage method needed:**

```ts
async incrementTournamentCompletedMatches(tournamentId: number): Promise<void> {
  await db.update(tournaments)
    .set({ completedMatches: sql`${tournaments.completedMatches} + 1` })
    .where(eq(tournaments.id, tournamentId));
}
```

### 6.6 Wiring into evolution.ts

**File:** `server/evolution.ts`

The evolution runner is more complex because matches within a generation must all complete before selection/crossover. Two approaches:

**Approach A (recommended): Enqueue per-generation batch, wait for completion.**

Replace the match loop in `runEvolution` (line 377) with:

```ts
const jobIds: string[] = [];
for (const [idxA, idxB] of matchPairs) {
  const jobId = await enqueueEvolutionMatch({
    evolutionRunId: runId,
    generationNumber: gen,
    genomeIdxA: idxA,
    genomeIdxB: idxB,
    matchConfig: buildMatchConfig(config, gen, idxA, idxB, population, matchIds.length),
    teamSystemPrompts: { amber: buildGenomeSystemPrompt(modulesA), blue: buildGenomeSystemPrompt(modulesB) },
  });
  if (jobId) jobIds.push(jobId);
}

// Poll for completion (all jobs in this batch)
await waitForJobs(jobIds, { pollIntervalMs: 5000, timeoutMs: 3600000 });
```

**`waitForJobs` helper** (in jobQueue.ts):

```ts
export async function waitForJobs(jobIds: string[], opts: { pollIntervalMs: number; timeoutMs: number }): Promise<void> {
  const queue = getJobQueue();
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const states = await Promise.all(jobIds.map(id => queue.getJobById(id)));
    const allDone = states.every(s => s?.state === "completed" || s?.state === "failed" || s?.state === "expired");
    if (allDone) return;
    await new Promise(r => setTimeout(r, opts.pollIntervalMs));
  }
  throw new Error("Evolution generation timed out waiting for match jobs");
}
```

**Approach B (simpler, deferred): Keep evolution in-memory, only queue tournaments.**

Evolution runs are already guarded by `activeRuns` Map and have budget caps. The biggest pain point is tournament crash recovery, not evolution. We could defer evolution queueing to a later iteration.

**Recommendation:** Start with Approach B. Queue tournament matches via pg-boss now. Keep evolution in-memory. Revisit once tournament queueing is proven.

### 6.7 Error handling & retry

pg-boss handles retries automatically based on `retryLimit`. Failed jobs surface in the `pgboss.job` table with `state = 'failed'` and the error in `output`.

For the tournament handler, a failed match should:
1. Update the `tournamentMatch` record with `status: "failed"`.
2. Not block the rest of the tournament.

Wrap the handler in try/catch:

```ts
export async function handleTournamentMatchJob(job: TournamentMatchJob): Promise<void> {
  try {
    const result = await runHeadlessMatch(job.matchConfig);
    await storage.updateTournamentMatch(job.tournamentMatchId, {
      matchId: result.matchId,
      status: "completed",
      result: { winner: result.winner, totalRounds: result.totalRounds },
      completedAt: new Date(),
    });
    await storage.incrementTournamentCompletedMatches(job.tournamentId);
  } catch (err) {
    await storage.updateTournamentMatch(job.tournamentMatchId, {
      status: "failed",
      result: { error: String(err) },
      completedAt: new Date(),
    });
    await storage.incrementTournamentCompletedMatches(job.tournamentId);
    throw err; // re-throw so pg-boss can retry
  }
}
```

### 6.8 Monitoring

pg-boss creates its own schema (`pgboss`) with tables for job state. Add a simple admin endpoint:

```ts
// server/routes.ts
app.get("/api/admin/jobs", async (req, res) => {
  const queue = getJobQueue();
  const queueNames = [QUEUE_TOURNAMENT_MATCH, QUEUE_EVOLUTION_MATCH];
  const stats: Record<string, any> = {};
  for (const name of queueNames) {
    stats[name] = await queue.getQueueSize(name);
  }
  res.json(stats);
});
```

### 6.9 Risks

- **pg-boss schema creation:** On first run, pg-boss creates its schema via `CREATE SCHEMA IF NOT EXISTS pgboss`. This is a one-time DDL operation. Make sure the database user has CREATE SCHEMA privilege.
- **Connection pooling:** pg-boss creates its own connection pool. With the existing `pg` Pool in `db.ts`, this means two pools. pg-boss defaults to `max: 4` connections. Combined with the existing pool, total connections should stay under typical limits (100).
- **Graceful shutdown:** Need to call `stopJobQueue()` on SIGTERM/SIGINT. Add to the existing shutdown handler in `server/index.ts`.

---

## 7. Bradley-Terry rating in TS

**New file:** `server/bradleyTerry.ts`
**Modified files:** `server/metrics.ts`, `server/routes.ts`
**New code:** ~60 lines
**Dependencies:** None (pure math)

### 7.1 Why Bradley-Terry over Elo

- Elo is designed for sequential 1v1 games and is order-dependent (results processed sequentially). Bradley-Terry optimizes over the full result set simultaneously.
- Bradley-Terry produces maximum-likelihood estimates of player strength, with principled uncertainty quantification.
- For tournament results where we have a batch of match outcomes, BT is more appropriate.
- The existing Elo in `evolution.ts` (line 109) can remain for the real-time evolution use case. BT is for post-hoc tournament analysis.

### 7.2 Implementation

**File:** `server/bradleyTerry.ts`

```ts
/**
 * Bradley-Terry model for pairwise comparison.
 *
 * Given a set of match results (winner/loser pairs), estimates
 * the strength parameter for each player using iterative MM algorithm.
 *
 * Reference: Hunter (2004), "MM algorithms for generalized Bradley-Terry models"
 */

export interface BradleyTerryResult {
  ratings: Map<string, number>;
  iterations: number;
  converged: boolean;
}

interface MatchResult {
  winner: string;
  loser: string;
}

/**
 * Estimate Bradley-Terry strength parameters from pairwise match outcomes.
 *
 * @param matchResults - Array of {winner, loser} pairs
 * @param options.maxIter - Maximum iterations (default 100)
 * @param options.tol - Convergence tolerance (default 1e-6)
 * @param options.initialRating - Starting rating for all players (default 1.0)
 * @returns Map of player ID -> strength parameter (higher = stronger)
 */
export function bradleyTerryRatings(
  matchResults: MatchResult[],
  options?: { maxIter?: number; tol?: number; initialRating?: number }
): BradleyTerryResult {
  const maxIter = options?.maxIter ?? 100;
  const tol = options?.tol ?? 1e-6;
  const initialRating = options?.initialRating ?? 1.0;

  // Collect all players
  const players = new Set<string>();
  for (const r of matchResults) {
    players.add(r.winner);
    players.add(r.loser);
  }

  if (players.size < 2) {
    const ratings = new Map<string, number>();
    for (const p of players) ratings.set(p, initialRating);
    return { ratings, iterations: 0, converged: true };
  }

  // Initialize ratings
  const ratings = new Map<string, number>();
  for (const p of players) ratings.set(p, initialRating);

  // Count wins for each player
  const wins = new Map<string, number>();
  for (const p of players) wins.set(p, 0);
  for (const r of matchResults) {
    wins.set(r.winner, (wins.get(r.winner) || 0) + 1);
  }

  // Build pairwise encounter counts
  const encounters = new Map<string, Map<string, number>>();
  for (const r of matchResults) {
    const key = [r.winner, r.loser].sort().join("|");
    const [a, b] = key.split("|");
    if (!encounters.has(a)) encounters.set(a, new Map());
    if (!encounters.has(b)) encounters.set(b, new Map());
    encounters.get(a)!.set(b, (encounters.get(a)!.get(b) || 0) + 1);
    encounters.get(b)!.set(a, (encounters.get(b)!.get(a) || 0) + 1);
  }

  // Iterative MM algorithm
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;

    for (const i of players) {
      const wi = wins.get(i) || 0;
      if (wi === 0) continue; // Player with 0 wins stays at minimum

      let denomSum = 0;
      const iEncounters = encounters.get(i);
      if (!iEncounters) continue;

      for (const [j, nij] of iEncounters) {
        const rj = ratings.get(j) || initialRating;
        const ri = ratings.get(i) || initialRating;
        denomSum += nij / (ri + rj);
      }

      if (denomSum === 0) continue;

      const newRating = wi / denomSum;
      const oldRating = ratings.get(i) || initialRating;
      maxChange = Math.max(maxChange, Math.abs(newRating - oldRating));
      ratings.set(i, newRating);
    }

    if (maxChange < tol) {
      converged = true;
      break;
    }
  }

  // Normalize so ratings sum to number of players (cosmetic)
  const sum = Array.from(ratings.values()).reduce((s, v) => s + v, 0);
  const scale = players.size / sum;
  for (const [p, r] of ratings) {
    ratings.set(p, r * scale);
  }

  return { ratings, iterations: iter, converged };
}

/**
 * Convert Bradley-Terry strength parameters to win probabilities.
 */
export function btWinProbability(ratingA: number, ratingB: number): number {
  return ratingA / (ratingA + ratingB);
}
```

### 7.3 Wiring into tournament results

**File:** `server/routes.ts`

In the `GET /api/tournaments/:id` handler (line 228), after computing `stats`:

```ts
import { bradleyTerryRatings, btWinProbability } from "./bradleyTerry";

// Build match results for BT
const btResults: Array<{ winner: string; loser: string }> = [];
for (const match of matchDetails) {
  if (!match.winner) continue;
  const configs = match.playerConfigs as any[];
  const winnerTeam = match.winner;
  const winnerModel = configs.find((c: any) => c.team === winnerTeam && c.isAI)?.aiConfig?.model || "unknown";
  const loserTeam = winnerTeam === "amber" ? "blue" : "amber";
  const loserModel = configs.find((c: any) => c.team === loserTeam && c.isAI)?.aiConfig?.model || "unknown";
  if (winnerModel !== "unknown" && loserModel !== "unknown") {
    btResults.push({ winner: winnerModel, loser: loserModel });
  }
}

const btRatings = bradleyTerryRatings(btResults);
```

Add `btRatings` to the response JSON alongside `stats`.

### 7.4 Also wire into eval metrics

**File:** `server/routes.ts`, in the `/api/eval/metrics` handler (line 282):

After computing model metrics, also compute BT ratings from all matches and include in the response. This gives a global strength ranking that accounts for opponent quality.

### 7.5 Risks

- **Players with zero wins:** The MM algorithm naturally handles this -- they get the minimum rating. No division by zero.
- **Convergence:** For typical tournament sizes (10-100 matches), convergence is fast (<20 iterations). The 100-iteration cap is generous.
- **Self-play:** If model A plays itself, both "winner" and "loser" are the same string. Filter these out before feeding to BT, or treat team-level as the entity (e.g., "gpt-4o-amber" vs "gpt-4o-blue").

---

## 8. visx charting for eval dashboard

**New dependency:** `@visx/group @visx/scale @visx/axis @visx/shape @visx/tooltip`
**New files:** `client/src/components/charts/WinRateChart.tsx`, `client/src/components/charts/RatingProgressionChart.tsx`, `client/src/components/charts/StrategyComparisonChart.tsx`
**Modified file:** `client/src/pages/EvalDashboard.tsx`
**New code:** ~200 lines

### 8.1 Why visx over recharts

The project already uses recharts (`package.json` line 76). The eval dashboard currently works. The question is whether to add visx alongside recharts or replace.

**Recommendation:** Use visx for **new** charts that need features recharts doesn't handle well:
- Error bars / confidence intervals (from Week 1 bootstrap CIs)
- Grouped/stacked bar charts with annotations
- Custom interactive tooltips

Keep existing recharts charts as-is. Don't rewrite working code.

### 8.2 Install

```bash
npm install @visx/group @visx/scale @visx/axis @visx/shape @visx/tooltip @visx/text
```

(6 packages. visx is modular -- only install what's needed.)

### 8.3 WinRateChart with confidence intervals

**New file:** `client/src/components/charts/WinRateChart.tsx`

Purpose: Bar chart showing win rates per model/strategy with error bars from bootstrap CIs.

```tsx
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Bar } from "@visx/shape";
import { useTooltip, TooltipWithBounds } from "@visx/tooltip";

interface WinRateDataPoint {
  label: string;       // Model or strategy name
  winRate: number;      // 0-1
  ciLower?: number;     // Bootstrap CI lower bound
  ciUpper?: number;     // Bootstrap CI upper bound
  totalGames: number;
}

interface WinRateChartProps {
  data: WinRateDataPoint[];
  width: number;
  height: number;
}

export function WinRateChart({ data, width, height }: WinRateChartProps) {
  const margin = { top: 20, right: 20, bottom: 60, left: 50 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = scaleBand<string>({
    domain: data.map(d => d.label),
    range: [0, innerWidth],
    padding: 0.3,
  });

  const yScale = scaleLinear<number>({
    domain: [0, 1],
    range: [innerHeight, 0],
  });

  // Render: SVG with bars, error bars (lines from ciLower to ciUpper),
  // axes, and tooltips on hover.
  // ~60 lines of JSX
}
```

Key implementation details:
- Error bars are simple SVG `<line>` elements from `yScale(ciLower)` to `yScale(ciUpper)` centered on each bar.
- Tooltip shows exact values on hover.
- Colors from the existing Tailwind palette (amber/blue theme).

### 8.4 RatingProgressionChart

**New file:** `client/src/components/charts/RatingProgressionChart.tsx`

Purpose: Line chart showing Bradley-Terry ratings (or Elo) over time/generations for the evolution dashboard.

```tsx
interface RatingPoint {
  generation: number;
  ratings: Record<string, number>; // lineageTag -> rating
}

interface RatingProgressionChartProps {
  data: RatingPoint[];
  width: number;
  height: number;
}
```

Uses `@visx/shape` LinePath for each lineage, with different colors per lineage tag.

### 8.5 StrategyComparisonChart

**New file:** `client/src/components/charts/StrategyComparisonChart.tsx`

Purpose: Grouped bar chart comparing multiple metrics across strategies. Shows win rate, interception rate, miscommunication rate side by side for each strategy.

```tsx
interface StrategyMetricPoint {
  strategy: string;
  winRate: number;
  interceptionRate: number;
  miscommunicationRate: number;
  winRateCI?: { lower: number; upper: number };
}

interface StrategyComparisonChartProps {
  data: StrategyMetricPoint[];
  width: number;
  height: number;
}
```

Uses grouped bars (3 bars per strategy) with a legend.

### 8.6 Integration into EvalDashboard.tsx

**File:** `client/src/pages/EvalDashboard.tsx`

The dashboard already fetches data from `/api/eval/metrics`. Add the new chart components alongside existing ones. The data transformation is straightforward since `modelMetrics` and `strategyMetrics` already contain the needed fields, and after Week 1 they'll include CIs too.

```tsx
import { WinRateChart } from "@/components/charts/WinRateChart";
import { StrategyComparisonChart } from "@/components/charts/StrategyComparisonChart";

// In the render:
<WinRateChart
  data={modelMetrics.map(m => ({
    label: m.model,
    winRate: m.winRate,
    ciLower: m.winRateCI?.lower,
    ciUpper: m.winRateCI?.upper,
    totalGames: m.totalGames,
  }))}
  width={800}
  height={400}
/>
```

### 8.7 Risks

- **Bundle size:** visx modules are tree-shakeable. The 6 packages add roughly ~40KB gzipped. Acceptable.
- **Dual charting libraries:** Having both recharts and visx is slightly messy but pragmatic. Don't rewrite working charts just for consistency.
- **Responsive sizing:** visx charts need explicit width/height. Use a `ResizeObserver` wrapper or the existing `react-resizable-panels` to handle responsive sizing. A simple `useParentSize` hook from `@visx/responsive` could help but is another package -- consider writing a 10-line custom hook instead.

### 8.8 Open questions

- Should we use `@visx/responsive` for auto-sizing? It's one more package. Alternative: a simple `useResizeObserver` hook (~15 lines).
- Should the RatingProgressionChart be added to the evolution run detail page? Currently the evolution UI shows generation stats in a table. A chart would be more useful but requires the evolution detail page to fetch per-generation genome data. May need a new API endpoint: `GET /api/evolution/:id/progression`.

---

## Summary checklist

| # | Item | Files | Lines | New deps |
|---|------|-------|-------|----------|
| 6 | pg-boss job queue | `server/jobQueue.ts` (new), `server/tournament.ts`, `server/evolution.ts`, `server/index.ts`, `server/routes.ts`, `server/storage.ts` | ~150 | `pg-boss` |
| 7 | Bradley-Terry ratings | `server/bradleyTerry.ts` (new), `server/routes.ts` | ~60 | None |
| 8 | visx charting | 3 new chart components, `EvalDashboard.tsx` | ~200 | `@visx/group`, `@visx/scale`, `@visx/axis`, `@visx/shape`, `@visx/tooltip`, `@visx/text` |

**Total new dependencies: 7** (1 server, 6 client-side)
**Total new files: 5** (1 server infra, 1 server math, 3 client components)
**Total migration steps: 0** (pg-boss manages its own schema)
