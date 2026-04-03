import type {
  AIProvider,
  AnchorABPerAnchor,
  AnchorABReport,
  AnchorEvaluationConfig,
  AnchorOpponentSpec,
  ArenaConfig,
  GameRules,
  GenomeModules,
  HeadlessMatchConfig,
  MatchRound,
} from "@shared/schema";
import { DEFAULT_GAME_RULES, getDefaultConfig } from "@shared/schema";
import { runBoundedSettledPool } from "./boundedPool";
import { buildGenomeSystemPrompt, SEED_GENOME_TEMPLATES } from "./coachLoop";
import { runHeadlessMatch } from "./headlessRunner";
import { storage } from "./storage";

const ANCHOR_CONCURRENCY = 4;
const DEFAULT_GAMES_PER_ANCHOR = 1;
const DEFAULT_MAX_ANCHOR_GAMES_PER_SPRINT = 32;

const DEFAULT_ANCHOR_OPPONENTS: AnchorOpponentSpec[] = SEED_GENOME_TEMPLATES.slice(0, 2).map((genome, index) => ({
  label: `seed_${index + 1}`,
  genome,
}));

export interface AnchorBatchInput {
  runId: string;
  sprintNumber: number;
  proposalId: string;
  incumbentGenome: GenomeModules;
  candidateGenome: GenomeModules;
  playerProvider: AIProvider;
  playerModel: string;
  teamSize: 2 | 3;
  config: AnchorEvaluationConfig;
  gameRules: GameRules;
}

export function resolveAnchorConfig(arenaConfig: ArenaConfig): AnchorEvaluationConfig {
  const partial = arenaConfig.anchorConfig;
  return {
    enabled: partial?.enabled ?? true,
    opponents: partial?.opponents ?? DEFAULT_ANCHOR_OPPONENTS,
    gamesPerAnchor: partial?.gamesPerAnchor ?? DEFAULT_GAMES_PER_ANCHOR,
    roleSwap: partial?.roleSwap ?? true,
    maxAnchorGamesPerSprint: partial?.maxAnchorGamesPerSprint ?? DEFAULT_MAX_ANCHOR_GAMES_PER_SPRINT,
    gameRules: partial?.gameRules ?? arenaConfig.gameRules,
  };
}

interface AnchorMatchSeed {
  seed: string;
  focalTeam: "amber" | "blue";
}

function buildAnchorMatchSeeds(
  runId: string,
  sprintNumber: number,
  proposalId: string,
  anchorLabel: string,
  gamesPerAnchor: number,
  roleSwap: boolean,
): AnchorMatchSeed[] {
  const seeds: AnchorMatchSeed[] = [];
  for (let gameIndex = 0; gameIndex < gamesPerAnchor; gameIndex++) {
    if (roleSwap) {
      seeds.push({
        seed: `${runId}-s${sprintNumber}-${proposalId}-anchor-${anchorLabel}-g${gameIndex + 1}-amber`,
        focalTeam: "amber",
      });
      seeds.push({
        seed: `${runId}-s${sprintNumber}-${proposalId}-anchor-${anchorLabel}-g${gameIndex + 1}-blue`,
        focalTeam: "blue",
      });
    } else {
      seeds.push({
        seed: `${runId}-s${sprintNumber}-${proposalId}-anchor-${anchorLabel}-g${gameIndex + 1}-amber`,
        focalTeam: "amber",
      });
    }
  }
  return seeds;
}

function buildAnchorMatchConfig(
  input: AnchorBatchInput,
  focalGenome: GenomeModules,
  anchorOpponent: AnchorOpponentSpec,
  seed: string,
  focalTeam: "amber" | "blue",
  variant: "incumbent" | "candidate",
): HeadlessMatchConfig {
  const baseAIConfig = {
    ...getDefaultConfig(input.playerProvider),
    provider: input.playerProvider,
    model: input.playerModel,
  };

  const players: HeadlessMatchConfig["players"] = [];
  for (const team of ["amber", "blue"] as const) {
    for (let seat = 1; seat <= input.teamSize; seat++) {
      players.push({
        name: `anchor-${variant}-${team}-p${seat}`,
        aiProvider: input.playerProvider,
        team,
        aiConfig: { ...baseAIConfig },
      });
    }
  }

  return {
    players,
    fastMode: true,
    seed,
    teamSize: input.teamSize,
    arenaId: undefined,
    runId: input.runId,
    sprintNumber: input.sprintNumber,
    matchKind: "anchor",
    anchorLabel: anchorOpponent.label,
    focalTeam,
    gameRules: input.config.gameRules || input.gameRules || DEFAULT_GAME_RULES,
  };
}

interface VariantMatchResult {
  matchId: number;
  winner: "amber" | "blue" | null;
  focalTeam: "amber" | "blue";
  seed: string;
  anchorLabel: string;
  variant: "incumbent" | "candidate";
  totalRounds: number;
}

function computeRatesFromRounds(
  rounds: MatchRound[],
  focalTeam: "amber" | "blue",
): { ownDecodeRate: number; ourInterceptRate: number } {
  const ownRounds = rounds.filter((r) => r.team === focalTeam);
  const opponentRounds = rounds.filter((r) => r.team !== focalTeam);

  const ownCorrect = ownRounds.filter((r) => r.ownCorrect).length;
  const ourIntercepts = opponentRounds.filter((r) => r.intercepted).length;

  return {
    ownDecodeRate: ownRounds.length > 0 ? ownCorrect / ownRounds.length : 0,
    ourInterceptRate: opponentRounds.length > 0 ? ourIntercepts / opponentRounds.length : 0,
  };
}

async function summarizeAnchorVariantMatches(
  matchIds: number[],
  focalTeams: Map<number, "amber" | "blue">,
): Promise<{ winRate: number; ownDecodeRate: number; ourInterceptRate: number }> {
  if (matchIds.length === 0) {
    return { winRate: 0, ownDecodeRate: 0, ourInterceptRate: 0 };
  }

  const matches = await storage.getMatchesByIds(matchIds);
  const allRounds = await storage.getMatchRoundsForMatches(matchIds);
  const roundsByMatch = new Map<number, MatchRound[]>();
  for (const round of allRounds) {
    const existing = roundsByMatch.get(round.matchId) || [];
    existing.push(round);
    roundsByMatch.set(round.matchId, existing);
  }

  let wins = 0;
  let totalOwnDecodeRate = 0;
  let totalOurInterceptRate = 0;

  for (const match of matches) {
    const focalTeam = focalTeams.get(match.id) || "amber";
    if (match.winner === focalTeam) wins++;

    const matchRounds = roundsByMatch.get(match.id) || [];
    const rates = computeRatesFromRounds(matchRounds, focalTeam);
    totalOwnDecodeRate += rates.ownDecodeRate;
    totalOurInterceptRate += rates.ourInterceptRate;
  }

  const count = matches.length;
  return {
    winRate: count > 0 ? wins / count : 0,
    ownDecodeRate: count > 0 ? totalOwnDecodeRate / count : 0,
    ourInterceptRate: count > 0 ? totalOurInterceptRate / count : 0,
  };
}

export async function runAnchorBatch(input: AnchorBatchInput): Promise<AnchorABReport> {
  const { config } = input;
  const maxGames = config.maxAnchorGamesPerSprint ?? DEFAULT_MAX_ANCHOR_GAMES_PER_SPRINT;

  // Build all tasks
  interface AnchorTask {
    anchorLabel: string;
    seed: string;
    focalTeam: "amber" | "blue";
    variant: "incumbent" | "candidate";
    genome: GenomeModules;
    opponentGenome: GenomeModules;
  }

  const tasks: AnchorTask[] = [];
  for (const opponent of config.opponents) {
    const seeds = buildAnchorMatchSeeds(
      input.runId,
      input.sprintNumber,
      input.proposalId,
      opponent.label,
      config.gamesPerAnchor,
      config.roleSwap,
    );

    for (const { seed, focalTeam } of seeds) {
      for (const variant of ["incumbent", "candidate"] as const) {
        if (tasks.length >= maxGames) break;
        tasks.push({
          anchorLabel: opponent.label,
          seed,
          focalTeam,
          variant,
          genome: variant === "incumbent" ? input.incumbentGenome : input.candidateGenome,
          opponentGenome: opponent.genome,
        });
      }
      if (tasks.length >= maxGames) break;
    }
    if (tasks.length >= maxGames) break;
  }

  // Execute all anchor matches with bounded concurrency
  const matchTasks = tasks.map((task) => async (): Promise<VariantMatchResult> => {
    const opponent = config.opponents.find((o) => o.label === task.anchorLabel)!;
    const matchConfig = buildAnchorMatchConfig(
      input,
      task.genome,
      opponent,
      task.seed,
      task.focalTeam,
      task.variant,
    );

    const focalPrompt = buildGenomeSystemPrompt(task.genome);
    const opponentPrompt = buildGenomeSystemPrompt(task.opponentGenome);
    const teamSystemPrompts = task.focalTeam === "amber"
      ? { amber: focalPrompt, blue: opponentPrompt }
      : { amber: opponentPrompt, blue: focalPrompt };

    const result = await runHeadlessMatch(matchConfig, undefined, teamSystemPrompts);

    return {
      matchId: result.matchId,
      winner: result.winner,
      focalTeam: task.focalTeam,
      seed: task.seed,
      anchorLabel: task.anchorLabel,
      variant: task.variant,
      totalRounds: result.totalRounds,
    };
  });

  const settlements = await runBoundedSettledPool(matchTasks, ANCHOR_CONCURRENCY);
  const results: VariantMatchResult[] = [];
  for (const settlement of settlements) {
    if (settlement.status === "fulfilled") {
      results.push(settlement.value);
    }
  }

  // Group results by anchor label and variant
  const anchorLabels = Array.from(new Set(config.opponents.map((o) => o.label)));
  const perAnchor: AnchorABPerAnchor[] = [];
  const allIncumbentMatchIds: number[] = [];
  const allCandidateMatchIds: number[] = [];
  const incumbentFocalTeams = new Map<number, "amber" | "blue">();
  const candidateFocalTeams = new Map<number, "amber" | "blue">();

  for (const label of anchorLabels) {
    const anchorResults = results.filter((r) => r.anchorLabel === label);
    const incumbentResults = anchorResults.filter((r) => r.variant === "incumbent");
    const candidateResults = anchorResults.filter((r) => r.variant === "candidate");

    const incumbentIds = incumbentResults.map((r) => r.matchId);
    const candidateIds = candidateResults.map((r) => r.matchId);
    const seeds = Array.from(new Set(anchorResults.map((r) => r.seed)));

    for (const r of incumbentResults) incumbentFocalTeams.set(r.matchId, r.focalTeam);
    for (const r of candidateResults) candidateFocalTeams.set(r.matchId, r.focalTeam);

    allIncumbentMatchIds.push(...incumbentIds);
    allCandidateMatchIds.push(...candidateIds);

    const incumbentWins = incumbentResults.filter((r) => r.winner === r.focalTeam).length;
    const candidateWins = candidateResults.filter((r) => r.winner === r.focalTeam).length;

    // Get per-anchor rates
    const incumbentSummary = await summarizeAnchorVariantMatches(incumbentIds, incumbentFocalTeams);
    const candidateSummary = await summarizeAnchorVariantMatches(candidateIds, candidateFocalTeams);

    perAnchor.push({
      label,
      seeds,
      incumbentWins,
      candidateWins,
      incumbentOwnDecodeRate: incumbentSummary.ownDecodeRate,
      candidateOwnDecodeRate: candidateSummary.ownDecodeRate,
      incumbentOurInterceptRate: incumbentSummary.ourInterceptRate,
      candidateOurInterceptRate: candidateSummary.ourInterceptRate,
      incumbentMatchIds: incumbentIds,
      candidateMatchIds: candidateIds,
      total: incumbentResults.length + candidateResults.length,
    });

    // Persist per-variant records
    await storage.createAnchorEvaluation({
      runId: input.runId,
      sprintNumber: input.sprintNumber,
      proposalId: input.proposalId,
      variant: "incumbent",
      anchorLabel: label,
      matchIds: incumbentIds,
      summary: {
        winRate: incumbentSummary.winRate,
        ownDecodeRate: incumbentSummary.ownDecodeRate,
        ourInterceptRate: incumbentSummary.ourInterceptRate,
        seedCount: seeds.length,
        seeds,
      },
    });

    await storage.createAnchorEvaluation({
      runId: input.runId,
      sprintNumber: input.sprintNumber,
      proposalId: input.proposalId,
      variant: "candidate",
      anchorLabel: label,
      matchIds: candidateIds,
      summary: {
        winRate: candidateSummary.winRate,
        ownDecodeRate: candidateSummary.ownDecodeRate,
        ourInterceptRate: candidateSummary.ourInterceptRate,
        seedCount: seeds.length,
        seeds,
      },
    });
  }

  // Compute aggregate summary
  const incumbentAgg = await summarizeAnchorVariantMatches(allIncumbentMatchIds, incumbentFocalTeams);
  const candidateAgg = await summarizeAnchorVariantMatches(allCandidateMatchIds, candidateFocalTeams);

  return {
    incomplete: false,
    anchorsUsed: anchorLabels,
    incumbentWinRate: incumbentAgg.winRate,
    candidateWinRate: candidateAgg.winRate,
    delta: candidateAgg.winRate - incumbentAgg.winRate,
    incumbentOwnDecodeRate: incumbentAgg.ownDecodeRate,
    candidateOwnDecodeRate: candidateAgg.ownDecodeRate,
    ownDecodeDelta: candidateAgg.ownDecodeRate - incumbentAgg.ownDecodeRate,
    incumbentOurInterceptRate: incumbentAgg.ourInterceptRate,
    candidateOurInterceptRate: candidateAgg.ourInterceptRate,
    ourInterceptDelta: candidateAgg.ourInterceptRate - incumbentAgg.ourInterceptRate,
    incumbentMatchIds: allIncumbentMatchIds,
    candidateMatchIds: allCandidateMatchIds,
    perAnchor,
  };
}
