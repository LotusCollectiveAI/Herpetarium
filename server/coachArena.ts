import { randomUUID } from "crypto";
import type { CoachRunStatus, GenomeModules } from "@shared/schema";
import {
  applyCoachAutopsyResult,
  applySprintResultToCoachState,
  cloneCoachBeliefs,
  cloneGenome,
  coachAutopsy,
  createCoachRunWithInitialState,
  createCoachState,
  defaultCoachConfig,
  persistCoachRunProgress,
  persistCoachSprintRecord,
  runCoachSprint,
  type CoachConfig,
  type CoachSprintEnvironment,
  type CoachState,
  type SprintResult,
} from "./coachLoop";
import { buildDisclosureText } from "./disclosure";
import { log } from "./index";
import { storage } from "./storage";

const COACH_ARENA_SOURCE = "coach_arena";

export interface EcologyConfig {
  coachConfig: CoachConfig;
  totalSprints: number;
  matchesPerSprint: number;
  foiaEnabled: boolean;
  foiaDelaySprints?: number;
  leftSeedGenome: GenomeModules;
  rightSeedGenome: GenomeModules;
}

export interface EcologyResult {
  leftRunId: string;
  rightRunId: string;
  sprintsCompleted: number;
}

interface EcologyRunContext {
  runId: string;
  state: CoachState;
}

function summarizeMirroredRecord(matchResults: SprintResult["matchResults"]): Pick<SprintResult, "record" | "winRate"> {
  const wins = matchResults.filter((match) => match.winner === match.ourTeam).length;
  const losses = matchResults.filter((match) => match.winner !== null && match.winner !== match.ourTeam).length;
  const draws = matchResults.filter((match) => match.winner === null).length;
  const completedMatches = matchResults.length;

  return {
    record: draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`,
    winRate: completedMatches > 0 ? wins / completedMatches : 0,
  };
}

function mirrorSprintResult(result: SprintResult): SprintResult {
  const matchResults = result.matchResults.map((match) => {
    const mirroredTeam: SprintResult["matchResults"][number]["ourTeam"] = match.ourTeam === "amber" ? "blue" : "amber";

    return {
      ...match,
      ourTeam: mirroredTeam,
      ourWhiteTokens: match.oppWhiteTokens,
      ourBlackTokens: match.oppBlackTokens,
      oppWhiteTokens: match.ourWhiteTokens,
      oppBlackTokens: match.ourBlackTokens,
      roundSummaries: [...match.roundSummaries],
    };
  });
  const mirroredSummary = summarizeMirroredRecord(matchResults);

  return {
    sprintNumber: result.sprintNumber,
    matchResults,
    record: mirroredSummary.record,
    winRate: mirroredSummary.winRate,
  };
}

function shouldInjectFoia(sprintsCompleted: number, foiaDelaySprints: number): boolean {
  return sprintsCompleted >= foiaDelaySprints;
}

function buildSprintEnvironment(
  opponent: EcologyRunContext,
  disclosureText?: string,
): CoachSprintEnvironment {
  return {
    opponentRunId: opponent.runId,
    opponentGenome: cloneGenome(opponent.state.genome),
    disclosureText,
  };
}

async function finalizeEcologyRun(
  runId: string,
  state: CoachState,
  status: CoachRunStatus,
  completedAt: Date,
): Promise<void> {
  const actualCostUsd = await persistCoachRunProgress(runId, state);

  await storage.updateCoachRun(runId, {
    status,
    currentGenome: cloneGenome(state.genome),
    currentBeliefs: cloneCoachBeliefs(state.beliefs),
    currentSprint: state.currentSprint,
    actualCostUsd,
    completedAt,
  });
}

async function createEcologyRun(
  side: "left" | "right",
  arenaId: string,
  coachConfig: CoachConfig,
  seedGenome: GenomeModules,
  opponentSeedGenome: GenomeModules,
): Promise<EcologyRunContext> {
  const state = createCoachState(seedGenome, `arena-${arenaId}-${side}-${randomUUID().slice(0, 8)}`);
  const run = await createCoachRunWithInitialState(
    {
      ...coachConfig,
      opponentGenome: cloneGenome(opponentSeedGenome),
    },
    state,
  );

  return {
    runId: run.id,
    state,
  };
}

export async function runEcology(config: EcologyConfig): Promise<EcologyResult> {
  const normalizedCoachConfig = defaultCoachConfig({
    ...config.coachConfig,
    totalSprints: config.totalSprints,
    matchesPerSprint: config.matchesPerSprint,
  });
  const foiaDelaySprints = Math.max(0, Math.floor(config.foiaDelaySprints ?? 0));
  const arenaId = randomUUID().slice(0, 8);
  const createdRuns: EcologyRunContext[] = [];
  let sprintsCompleted = 0;
  let budgetExceeded = false;

  try {
    const left = await createEcologyRun(
      "left",
      arenaId,
      normalizedCoachConfig,
      config.leftSeedGenome,
      config.rightSeedGenome,
    );
    createdRuns.push(left);

    const right = await createEcologyRun(
      "right",
      arenaId,
      normalizedCoachConfig,
      config.rightSeedGenome,
      config.leftSeedGenome,
    );
    createdRuns.push(right);

    const startedAt = new Date();
    await Promise.all(createdRuns.map((run) => storage.updateCoachRun(run.runId, {
      status: "running",
      startedAt,
    })));

    log(
      `[coach-arena] Starting ecology ${arenaId} with runs ${left.runId} vs ${right.runId}. ${normalizedCoachConfig.totalSprints} sprints, ${normalizedCoachConfig.matchesPerSprint} matches per sprint.`,
      COACH_ARENA_SOURCE,
    );

    for (let sprintIndex = 0; sprintIndex < normalizedCoachConfig.totalSprints; sprintIndex++) {
      if (normalizedCoachConfig.budgetCapUsd !== undefined) {
        const sharedMatchIds = Array.from(new Set(left.state.sprintHistory.flatMap((sprint) =>
          sprint.matchResults.map((match) => match.matchId),
        )));
        const recordedCost = sharedMatchIds.length > 0
          ? await storage.getCumulativeCost(sharedMatchIds)
          : 0;

        await Promise.all(createdRuns.map((run) => storage.updateCoachRun(run.runId, {
          actualCostUsd: recordedCost > 0 ? recordedCost.toFixed(6) : null,
        })));

        if (recordedCost >= normalizedCoachConfig.budgetCapUsd) {
          budgetExceeded = true;
          log(
            `[coach-arena] Budget cap of $${normalizedCoachConfig.budgetCapUsd.toFixed(2)} reached before sprint ${sprintIndex + 1}.`,
            COACH_ARENA_SOURCE,
          );
          break;
        }
      }

      const foiaActive = config.foiaEnabled && shouldInjectFoia(left.state.currentSprint, foiaDelaySprints);
      const leftEnv = buildSprintEnvironment(
        right,
        foiaActive ? buildDisclosureText(right.state.genome) : undefined,
      );
      const rightEnv = buildSprintEnvironment(
        left,
        foiaActive ? buildDisclosureText(left.state.genome) : undefined,
      );
      const leftGenomeBefore = cloneGenome(left.state.genome);
      const rightGenomeBefore = cloneGenome(right.state.genome);

      log(
        `[coach-arena] Sprint ${sprintIndex + 1} shared match set starting.${foiaActive ? " FOIA disclosure active." : ""}`,
        COACH_ARENA_SOURCE,
      );

      const leftSprintResult = await runCoachSprint(left.state, normalizedCoachConfig, leftEnv);
      const rightSprintResult = mirrorSprintResult(leftSprintResult);
      const leftSprintState = applySprintResultToCoachState(left.state, leftSprintResult);
      const rightSprintState = applySprintResultToCoachState(right.state, rightSprintResult);

      const [leftAutopsy, rightAutopsy] = await Promise.all([
        coachAutopsy(leftSprintState, leftSprintResult, normalizedCoachConfig, leftEnv),
        coachAutopsy(rightSprintState, rightSprintResult, normalizedCoachConfig, rightEnv),
      ]);

      left.state = applyCoachAutopsyResult(leftSprintState, leftSprintResult, leftAutopsy);
      right.state = applyCoachAutopsyResult(rightSprintState, rightSprintResult, rightAutopsy);

      await Promise.all([
        persistCoachSprintRecord(left.runId, leftEnv, leftSprintResult, leftGenomeBefore, left.state, leftAutopsy),
        persistCoachSprintRecord(right.runId, rightEnv, rightSprintResult, rightGenomeBefore, right.state, rightAutopsy),
      ]);
      await Promise.all([
        persistCoachRunProgress(left.runId, left.state),
        persistCoachRunProgress(right.runId, right.state),
      ]);

      sprintsCompleted = left.state.currentSprint;

      log(
        `[coach-arena] Sprint ${sprintsCompleted} complete. Left ${leftSprintResult.record}, right ${rightSprintResult.record}.`,
        COACH_ARENA_SOURCE,
      );
    }

    const completedAt = new Date();
    const finalStatus: CoachRunStatus = budgetExceeded ? "budget_exceeded" : "completed";

    await Promise.all(createdRuns.map((run) => finalizeEcologyRun(run.runId, run.state, finalStatus, completedAt)));

    log(
      `[coach-arena] Ecology ${arenaId} finished after ${sprintsCompleted} sprints.`,
      COACH_ARENA_SOURCE,
    );

    return {
      leftRunId: left.runId,
      rightRunId: right.runId,
      sprintsCompleted,
    };
  } catch (error) {
    const completedAt = new Date();

    await Promise.allSettled(createdRuns.map((run) => finalizeEcologyRun(run.runId, run.state, "failed", completedAt)));

    throw error;
  }
}
