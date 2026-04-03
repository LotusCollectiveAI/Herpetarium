import type {
  AiCallLog,
  CompiledGenomePrompts,
  ComplexityMetrics,
  DeliberationExecutionMetrics,
  ExecutionMetrics,
  GenomeModules,
  LeakageMetrics,
  Match,
  MatchRound,
  PatchReviewSummary,
  PromptRole,
  SideBalanceMetrics,
  SprintEvaluation,
  SprintEvaluationInput,
  TeamChatter,
  TrainingSprintMetrics,
} from "@shared/schema";
import { analyzeMatchTranscripts } from "./transcriptAnalyzer";
import { storage } from "./storage";

type Team = "amber" | "blue";

const PROMPT_ROLES: PromptRole[] = [
  "cluegiver",
  "own_guesser",
  "interceptor",
  "own_deliberator",
  "intercept_deliberator",
  "coach",
];

function roundRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(4));
}

function roundMean(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function uniqueSortedMatchIds(matchIds: number[]): number[] {
  return Array.from(new Set(matchIds)).sort((left, right) => left - right);
}

function oppositeTeam(team: Team): Team {
  return team === "amber" ? "blue" : "amber";
}

function resolveFocalTeam(match: Match, input: SprintEvaluationInput): Team {
  if (match.focalTeam && match.runId === input.runId) {
    return match.focalTeam;
  }

  if (match.focalTeam && match.opponentRunId === input.runId) {
    return oppositeTeam(match.focalTeam);
  }

  if (match.focalTeam) {
    return match.focalTeam;
  }

  return input.focalTeam;
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .length;
}

function computeGenomeCharCount(genome: GenomeModules): number {
  return Object.values(genome).reduce((total, value) => total + value.length, 0);
}

function computeGenomeSentenceCount(genome: GenomeModules): number {
  return Object.values(genome).reduce((total, value) => total + countSentences(value), 0);
}

function computeCompiledPromptChars(compiledPrompts?: CompiledGenomePrompts): Record<PromptRole, number> {
  return PROMPT_ROLES.reduce<Record<PromptRole, number>>((acc, role) => {
    const prompt = compiledPrompts?.prompts[role];
    acc[role] = prompt?.charCount ?? prompt?.systemPrompt.length ?? 0;
    return acc;
  }, {
    cluegiver: 0,
    own_guesser: 0,
    interceptor: 0,
    own_deliberator: 0,
    intercept_deliberator: 0,
    coach: 0,
  });
}

function buildTrainingMetrics(
  matches: Match[],
  input: SprintEvaluationInput,
): TrainingSprintMetrics {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalRounds = 0;

  for (const match of matches) {
    const focalTeam = resolveFocalTeam(match, input);
    totalRounds += match.totalRounds ?? 0;

    if (match.winner === focalTeam) {
      wins += 1;
    } else if (match.winner === null) {
      draws += 1;
    } else {
      losses += 1;
    }
  }

  const totalMatches = matches.length;

  return {
    matchIds: matches.map((match) => match.id),
    wins,
    losses,
    draws,
    winRate: roundRate(totalMatches > 0 ? wins / totalMatches : 0),
    meanRoundsPerMatch: roundMean(totalMatches > 0 ? totalRounds / totalMatches : 0),
  };
}

function buildExecutionMetrics(
  matches: Match[],
  rounds: MatchRound[],
  input: SprintEvaluationInput,
): ExecutionMetrics {
  const matchById = new Map(matches.map((match) => [match.id, match]));
  let ownRounds = 0;
  let opponentRounds = 0;
  let ownCorrect = 0;
  let opponentInterceptsAgainstUs = 0;
  let ourIntercepts = 0;
  let miscommunications = 0;
  let catastrophicAsymmetryMatches = 0;

  for (const match of matches) {
    const focalTeam = resolveFocalTeam(match, input);
    const opponentTeam = oppositeTeam(focalTeam);
    const ourPenaltyTotal = focalTeam === "amber"
      ? match.amberWhiteTokens + match.amberBlackTokens
      : match.blueWhiteTokens + match.blueBlackTokens;
    const opponentPenaltyTotal = opponentTeam === "amber"
      ? match.amberWhiteTokens + match.amberBlackTokens
      : match.blueWhiteTokens + match.blueBlackTokens;

    if (Math.abs(ourPenaltyTotal - opponentPenaltyTotal) > 2) {
      catastrophicAsymmetryMatches += 1;
    }
  }

  for (const round of rounds) {
    const match = matchById.get(round.matchId);
    if (!match) continue;

    const focalTeam = resolveFocalTeam(match, input);
    if (round.team === focalTeam) {
      ownRounds += 1;
      if (round.ownCorrect) ownCorrect += 1;
      if (round.intercepted) opponentInterceptsAgainstUs += 1;
      if (!round.ownCorrect) miscommunications += 1;
    } else {
      opponentRounds += 1;
      if (round.intercepted) ourIntercepts += 1;
    }
  }

  return {
    ownDecodeRate: roundRate(ownRounds > 0 ? ownCorrect / ownRounds : 0),
    opponentInterceptRateAgainstUs: roundRate(ownRounds > 0 ? opponentInterceptsAgainstUs / ownRounds : 0),
    ourInterceptRate: roundRate(opponentRounds > 0 ? ourIntercepts / opponentRounds : 0),
    miscommunicationRate: roundRate(ownRounds > 0 ? miscommunications / ownRounds : 0),
    catastrophicAsymmetryRate: roundRate(matches.length > 0 ? catastrophicAsymmetryMatches / matches.length : 0),
  };
}

function buildDeliberationMetrics(
  matches: Match[],
  chatter: TeamChatter[],
  aiLogs: AiCallLog[],
  input: SprintEvaluationInput,
): DeliberationExecutionMetrics {
  const matchById = new Map(matches.map((match) => [match.id, match]));
  let ownConsensusCount = 0;
  let ownConsensusTotal = 0;
  let interceptConsensusCount = 0;
  let interceptConsensusTotal = 0;
  let deliberationEntries = 0;
  let totalExchanges = 0;

  for (const entry of chatter) {
    const match = matchById.get(entry.matchId);
    if (!match) continue;

    const focalTeam = resolveFocalTeam(match, input);
    if (entry.team !== focalTeam) continue;

    deliberationEntries += 1;
    totalExchanges += entry.totalExchanges;

    if (entry.phase === "own_guess_deliberation") {
      ownConsensusTotal += 1;
      if (entry.consensusReached) ownConsensusCount += 1;
    } else if (entry.phase === "opponent_intercept_deliberation") {
      interceptConsensusTotal += 1;
      if (entry.consensusReached) interceptConsensusCount += 1;
    }
  }

  const deliberationLogs = aiLogs.filter((log) =>
    log.actionType === "deliberation_own" || log.actionType === "deliberation_intercept",
  );
  const reliabilityLogs = deliberationLogs.length > 0 ? deliberationLogs : aiLogs;

  return {
    ownConsensusRate: roundRate(ownConsensusTotal > 0 ? ownConsensusCount / ownConsensusTotal : 0),
    interceptConsensusRate: roundRate(interceptConsensusTotal > 0 ? interceptConsensusCount / interceptConsensusTotal : 0),
    timeoutRate: roundRate(reliabilityLogs.length > 0 ? reliabilityLogs.filter((log) => log.timedOut).length / reliabilityLogs.length : 0),
    fallbackRate: roundRate(reliabilityLogs.length > 0 ? reliabilityLogs.filter((log) => log.usedFallback).length / reliabilityLogs.length : 0),
    meanDeliberationExchanges: roundMean(deliberationEntries > 0 ? totalExchanges / deliberationEntries : 0),
  };
}

async function buildLeakageMetrics(
  matches: Match[],
  input: SprintEvaluationInput,
): Promise<LeakageMetrics> {
  let transcriptCount = 0;
  let totalLeakageScore = 0;
  let maxLeakageScore = 0;
  let keywordMentionCount = 0;
  let codePatternCount = 0;

  for (const match of matches) {
    const analysis = await analyzeMatchTranscripts(match.id);
    if (!analysis) continue;

    const focalTeam = resolveFocalTeam(match, input);
    const focalTranscripts = analysis.transcripts.filter((transcript) => transcript.team === focalTeam);

    for (const transcript of focalTranscripts) {
      transcriptCount += 1;
      totalLeakageScore += transcript.leakageScore;
      maxLeakageScore = Math.max(maxLeakageScore, transcript.leakageScore);

      if (
        transcript.matchedOwnKeywords.length > 0
        || transcript.matchedOpponentKeywords.length > 0
        || transcript.matchedTargetKeywords.length > 0
      ) {
        keywordMentionCount += 1;
      }

      if (transcript.codeReferences.length > 0 || transcript.slotReferences.length > 0) {
        codePatternCount += 1;
      }
    }
  }

  return {
    meanLeakageScore: roundMean(transcriptCount > 0 ? totalLeakageScore / transcriptCount : 0),
    maxLeakageScore: roundMean(maxLeakageScore),
    keywordMentionRate: roundRate(transcriptCount > 0 ? keywordMentionCount / transcriptCount : 0),
    codePatternRate: roundRate(transcriptCount > 0 ? codePatternCount / transcriptCount : 0),
  };
}

function buildSideBalanceMetrics(
  matches: Match[],
  input: SprintEvaluationInput,
): SideBalanceMetrics {
  let amberWins = 0;
  let amberMatchCount = 0;
  let blueWins = 0;
  let blueMatchCount = 0;

  for (const match of matches) {
    const focalTeam = resolveFocalTeam(match, input);

    if (focalTeam === "amber") {
      amberMatchCount += 1;
      if (match.winner === "amber") amberWins += 1;
    } else {
      blueMatchCount += 1;
      if (match.winner === "blue") blueWins += 1;
    }
  }

  const amberWinRate = amberMatchCount > 0 ? amberWins / amberMatchCount : 0;
  const blueWinRate = blueMatchCount > 0 ? blueWins / blueMatchCount : 0;

  return {
    amberWinRate: roundRate(amberWinRate),
    blueWinRate: roundRate(blueWinRate),
    sideGap: roundRate(Math.abs(amberWinRate - blueWinRate)),
    amberMatchCount,
    blueMatchCount,
  };
}

function buildComplexityMetrics(
  currentGenome: GenomeModules,
  previousGenome?: GenomeModules,
  compiledPrompts?: CompiledGenomePrompts,
): ComplexityMetrics {
  const genomeCharCount = computeGenomeCharCount(currentGenome);
  const compiledPromptChars = computeCompiledPromptChars(compiledPrompts);
  const compiledPromptTotalChars = Object.values(compiledPromptChars).reduce((total, value) => total + value, 0);

  return {
    genomeCharCount,
    genomeSentenceCount: computeGenomeSentenceCount(currentGenome),
    compiledPromptChars,
    compiledPromptTotalChars,
    deltaGenomeChars: previousGenome ? genomeCharCount - computeGenomeCharCount(previousGenome) : null,
    deltaCompiledPromptChars: null,
  };
}

function buildPendingPatchReviews(
  pendingPatchEntries: Array<{
    proposalId: string | null;
    sprintNumber: number;
  }>,
): PatchReviewSummary[] {
  return pendingPatchEntries
    .filter((entry): entry is { proposalId: string; sprintNumber: number } => Boolean(entry.proposalId))
    .sort((left, right) =>
      left.sprintNumber - right.sprintNumber || left.proposalId.localeCompare(right.proposalId),
    )
    .map((entry) => ({
      proposalId: entry.proposalId,
      committedSprint: entry.sprintNumber,
      status: "insufficient_data",
      firedTriggers: [],
    }));
}

function buildEvidenceLines(
  training: TrainingSprintMetrics,
  execution: ExecutionMetrics,
  deliberation: DeliberationExecutionMetrics,
  leakage: LeakageMetrics,
  sideBalance: SideBalanceMetrics,
  complexity: ComplexityMetrics,
  aiLogs: AiCallLog[],
): string[] {
  const reliabilityLogs = aiLogs.filter((log) =>
    log.actionType === "deliberation_own" || log.actionType === "deliberation_intercept",
  );
  const trackedLogs = reliabilityLogs.length > 0 ? reliabilityLogs.length : aiLogs.length;

  return [
    `Training record ${training.wins}-${training.losses}-${training.draws} across ${training.matchIds.length} matches; win rate ${percent(training.winRate)} and mean ${training.meanRoundsPerMatch.toFixed(2)} rounds per match.`,
    `Own decode rate was ${percent(execution.ownDecodeRate)} with miscommunication on ${percent(execution.miscommunicationRate)} of focal-team decode rounds.`,
    `Opponents intercepted ${percent(execution.opponentInterceptRateAgainstUs)} of our clue rounds, while we intercepted ${percent(execution.ourInterceptRate)} of theirs.`,
    `Catastrophic asymmetry (>2 total-token gap) appeared in ${percent(execution.catastrophicAsymmetryRate)} of matches.`,
    `Consensus landed on ${percent(deliberation.ownConsensusRate)} of own deliberations and ${percent(deliberation.interceptConsensusRate)} of intercept deliberations, averaging ${deliberation.meanDeliberationExchanges.toFixed(2)} exchanges.`,
    `Tracked AI calls showed ${percent(deliberation.timeoutRate)} timeouts and ${percent(deliberation.fallbackRate)} fallback usage across ${trackedLogs} calls.`,
    `Leakage averaged ${leakage.meanLeakageScore.toFixed(2)} with a max of ${leakage.maxLeakageScore.toFixed(2)}; keyword mentions appeared in ${percent(leakage.keywordMentionRate)} and code-pattern references in ${percent(leakage.codePatternRate)} of focal deliberations.`,
    `Side balance came out amber ${percent(sideBalance.amberWinRate)} over ${sideBalance.amberMatchCount} matches versus blue ${percent(sideBalance.blueWinRate)} over ${sideBalance.blueMatchCount}, a ${percent(sideBalance.sideGap)} gap.`,
    `Genome complexity measured ${complexity.genomeCharCount} characters across ${complexity.genomeSentenceCount} sentences; compiled prompts total ${complexity.compiledPromptTotalChars} characters.`,
  ];
}

export async function evaluateSprint(input: SprintEvaluationInput): Promise<SprintEvaluation> {
  const matchIds = uniqueSortedMatchIds(input.matchIds);
  const [matches, rounds, chatter, aiLogs, pendingPatchEntries] = await Promise.all([
    storage.getMatchesByIds(matchIds),
    storage.getMatchRoundsForMatches(matchIds),
    storage.getTeamChatterForMatches(matchIds),
    storage.getAllAiCallLogs(matchIds),
    storage.getPendingPatchReviews(input.runId),
  ]);

  const matchById = new Map(matches.map((match) => [match.id, match]));
  const orderedMatches = matchIds
    .map((matchId) => matchById.get(matchId))
    .filter((match): match is Match => Boolean(match));

  const training = buildTrainingMetrics(orderedMatches, input);
  const execution = buildExecutionMetrics(orderedMatches, rounds, input);
  const deliberation = buildDeliberationMetrics(orderedMatches, chatter, aiLogs, input);
  const leakage = await buildLeakageMetrics(orderedMatches, input);
  const sideBalance = buildSideBalanceMetrics(orderedMatches, input);
  const complexity = buildComplexityMetrics(input.currentGenome, input.previousGenome, input.compiledPrompts);
  const pendingPatchReviews = buildPendingPatchReviews(pendingPatchEntries);

  const evaluation: SprintEvaluation = {
    runId: input.runId,
    sprintNumber: input.sprintNumber,
    training,
    execution,
    deliberation,
    leakage,
    sideBalance,
    complexity,
    pendingPatchReviews,
    policyNotices: [],
    evidenceLines: buildEvidenceLines(
      training,
      execution,
      deliberation,
      leakage,
      sideBalance,
      complexity,
      aiLogs,
    ),
  };

  await storage.createSprintEvaluation({
    runId: input.runId,
    sprintNumber: input.sprintNumber,
    evaluation,
  });

  return evaluation;
}
