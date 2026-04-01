import type { AiCallLog, ChatterMessage, Match, MatchRound, TeamChatter } from "@shared/schema";
import { storage } from "./storage";

type TeamId = "amber" | "blue";
type DeliberationActionType = "deliberation_own" | "deliberation_intercept";

export interface TranscriptAnalysis {
  transcriptId: number;
  matchId: number;
  roundNumber: number;
  team: TeamId;
  phase: string;
  targetTeam: TeamId;
  totalMessages: number;
  totalExchanges: number;
  consensusReached: boolean;
  finalAnswer: [number, number, number] | null;
  targetCode: [number, number, number] | null;
  targetClues: string[];
  leakageScore: number;
  qualitativeTags: string[];
  matchedOwnKeywords: string[];
  matchedOpponentKeywords: string[];
  matchedTargetKeywords: string[];
  codeReferences: string[];
  slotReferences: string[];
  signalCounts: {
    hedgeTerms: number;
    disagreementMarkers: number;
    answerRevisions: number;
    opponentAwarenessMarkers: number;
    timeouts: number;
    fallbacks: number;
    errors: number;
    parseIssues: number;
  };
}

export interface MatchTranscriptAnalysis {
  matchId: number;
  qualityStatus: Match["qualityStatus"];
  transcriptCount: number;
  summary: TranscriptAnalysisSummary;
  transcripts: TranscriptAnalysis[];
}

export interface TournamentTranscriptAnalysis {
  tournamentId: number;
  matchCount: number;
  transcriptCount: number;
  summary: TranscriptAnalysisSummary & {
    cleanMatchCount: number;
    taintedMatchCount: number;
  };
  matches: MatchTranscriptAnalysis[];
}

export interface TranscriptAnalysisSummary {
  averageLeakageScore: number;
  maxLeakageScore: number;
  transcriptsWithLeakage: number;
  transcriptsWithDirectCodeReveal: number;
  transcriptsWithKeywordMentions: number;
  tagCounts: Record<string, number>;
}

const HEDGE_PATTERNS = [
  /\bmaybe\b/gi,
  /\bpossibly\b/gi,
  /\bperhaps\b/gi,
  /\bnot sure\b/gi,
  /\bunsure\b/gi,
  /\buncertain\b/gi,
  /\bmight be\b/gi,
  /\bcould be\b/gi,
];

const DISAGREEMENT_PATTERNS = [
  /\bdisagree\b/gi,
  /\bdon't think\b/gi,
  /\bdo not think\b/gi,
  /\bnot convinced\b/gi,
  /\bhowever\b/gi,
  /\binstead\b/gi,
  /\brather than\b/gi,
  /\bon the other hand\b/gi,
];

const OPPONENT_AWARENESS_PATTERNS = [
  /\bthey said\b/gi,
  /\btheir clue\b/gi,
  /\btheir clues\b/gi,
  /\bopponent\b/gi,
  /\bopponents\b/gi,
  /\bthey were\b/gi,
  /\bthey think\b/gi,
  /\btheir discussion\b/gi,
];

const SLOT_REFERENCE_PATTERN = /\b(?:slot|position|keyword)\s*([1-4])\b/gi;
const DIRECT_CODE_PATTERNS = [
  /(?:ready\s*:?\s*)?([1-4])\s*[,/-]\s*([1-4])\s*[,/-]\s*([1-4])/gi,
  /(?:ready|code|guess|answer)\s*:?\s*([1-4])\s+([1-4])\s+([1-4])/gi,
  /(?:ready|code|guess|answer)\s*:?\s*([1-4])([1-4])([1-4])\b/gi,
];

function getOpposingTeam(team: TeamId): TeamId {
  return team === "amber" ? "blue" : "amber";
}

function getTargetTeam(team: TeamId, phase: string): TeamId {
  return phase === "own_guess_deliberation" ? team : getOpposingTeam(team);
}

function getActionType(phase: string): DeliberationActionType {
  return phase === "own_guess_deliberation" ? "deliberation_own" : "deliberation_intercept";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function asTeamId(value: unknown): TeamId | null {
  return value === "amber" || value === "blue" ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asCodeTuple(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  if (!value.every((item) => typeof item === "number")) return null;
  return [value[0], value[1], value[2]];
}

function formatCode(code: [number, number, number]): string {
  return code.join(",");
}

function countPatternMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matches = text.match(new RegExp(pattern.source, flags));
    total += matches?.length || 0;
  }
  return total;
}

function getKeywordMatches(text: string, keywords: string[]): string[] {
  const matches = new Set<string>();
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(normalizedKeyword).replace(/\\ /g, "\\s+")}\\b`, "i");
    if (pattern.test(text)) {
      matches.add(normalizedKeyword);
    }
  }
  return Array.from(matches).sort((left, right) => left.localeCompare(right));
}

function extractCodeReferences(text: string, readySignals: Array<[number, number, number]> = []): string[] {
  const references = new Set<string>();

  for (const signal of readySignals) {
    references.add(formatCode(signal));
  }

  for (const pattern of DIRECT_CODE_PATTERNS) {
    const matcher = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text)) !== null) {
      references.add(`${match[1]},${match[2]},${match[3]}`);
    }
  }

  return Array.from(references).sort((left, right) => left.localeCompare(right));
}

function extractSlotReferences(text: string): string[] {
  const references = new Set<string>();
  let match: RegExpExecArray | null;
  const matcher = new RegExp(SLOT_REFERENCE_PATTERN.source, SLOT_REFERENCE_PATTERN.flags);
  while ((match = matcher.exec(text)) !== null) {
    references.add(`slot ${match[1]}`);
  }
  return Array.from(references).sort((left, right) => left.localeCompare(right));
}

function countAnswerRevisions(messages: ChatterMessage[]): number {
  const lastCodeByPlayer = new Map<string, string>();
  let revisions = 0;

  for (const message of messages) {
    const currentCode = message.readySignal
      ? formatCode(message.readySignal)
      : extractCodeReferences(message.content).at(0) || null;

    if (!currentCode) continue;

    const previousCode = lastCodeByPlayer.get(message.playerId);
    if (previousCode && previousCode !== currentCode) {
      revisions += 1;
    }

    lastCodeByPlayer.set(message.playerId, currentCode);
  }

  return revisions;
}

function countPromptMatches(prompt: string | null, values: string[]): number {
  const normalizedPrompt = normalizeText(prompt);
  if (!normalizedPrompt) return 0;

  return values.reduce((count, value) => {
    if (!value.trim()) return count;
    return normalizedPrompt.includes(normalizeText(value)) ? count + 1 : count;
  }, 0);
}

function scoreTranscriptWideLog(
  log: AiCallLog,
  transcriptMessages: ChatterMessage[],
  clues: string[],
  targetKeywords: string[],
): number {
  const transcriptModels = new Set(transcriptMessages.map((message) => message.model));
  const transcriptContents = new Set(transcriptMessages.map((message) => normalizeText(message.content)).filter(Boolean));

  let score = 0;
  if (transcriptModels.has(log.model)) score += 2;
  if (transcriptContents.has(normalizeText(log.rawResponse))) score += 8;
  score += countPromptMatches(log.prompt, clues) * 2;
  score += countPromptMatches(log.prompt, targetKeywords);
  return score;
}

function matchTranscriptLogs(
  transcript: TeamChatter,
  messages: ChatterMessage[],
  aiLogs: AiCallLog[],
  clues: string[],
  targetKeywords: string[],
): AiCallLog[] {
  const actionType = getActionType(transcript.phase);
  const candidates = aiLogs
    .filter((log) => log.roundNumber === transcript.roundNumber && log.actionType === actionType)
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return leftTime - rightTime;
    });

  if (candidates.length === 0) {
    return [];
  }

  const selected = new Set<number>();
  const matchedLogs: AiCallLog[] = [];

  for (const message of messages) {
    let bestIndex = -1;
    let bestScore = -1;

    for (let index = 0; index < candidates.length; index++) {
      if (selected.has(index)) continue;

      const candidate = candidates[index];
      let score = 0;

      if (candidate.model === message.model) score += 3;
      if (normalizeText(candidate.rawResponse) === normalizeText(message.content)) {
        score += normalizeText(message.content) ? 10 : 3;
      }
      if (candidate.timedOut === Boolean(message.timedOut)) score += 1;
      if (candidate.usedFallback === Boolean(message.usedFallback)) score += 1;
      if (Boolean(candidate.error) === Boolean(message.error)) score += 1;
      score += countPromptMatches(candidate.prompt, clues) * 2;
      score += countPromptMatches(candidate.prompt, targetKeywords);

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0 && bestScore >= 4) {
      selected.add(bestIndex);
      matchedLogs.push(candidates[bestIndex]);
    }
  }

  if (matchedLogs.length > 0) {
    return matchedLogs;
  }

  return candidates
    .map((log) => ({
      log,
      score: scoreTranscriptWideLog(log, messages, clues, targetKeywords),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(candidates.length, messages.length || 1)))
    .map((entry) => entry.log);
}

function computeLeakageScore(params: {
  keywordMentions: number;
  codeReferences: number;
  slotReferences: number;
  directTargetCodeReveal: boolean;
  directFinalAnswerReveal: boolean;
}): number {
  const { keywordMentions, codeReferences, slotReferences, directTargetCodeReveal, directFinalAnswerReveal } = params;

  let score = 0;

  if (keywordMentions > 0) {
    score = Math.max(score, Math.min(7, 3 + keywordMentions * 2));
  }

  if (slotReferences > 0) {
    score = Math.max(score, Math.min(4, 2 + slotReferences));
  }

  if (codeReferences > 0) {
    score = Math.max(score, 8);
  }

  if (directFinalAnswerReveal) {
    score = Math.max(score, 9);
  }

  if (directTargetCodeReveal) {
    score = 10;
  }

  if (keywordMentions > 0 && codeReferences > 0) {
    score = Math.max(score, 9);
  }

  return Math.min(10, score);
}

function buildQualitativeTags(params: {
  matchedKeywords: string[];
  matchedTargetKeywords: string[];
  codeReferences: string[];
  slotReferences: string[];
  hedgeTerms: number;
  disagreementMarkers: number;
  answerRevisions: number;
  opponentAwarenessMarkers: number;
  readySignalCount: number;
  consensusReached: boolean;
  timeouts: number;
  fallbacks: number;
  errors: number;
  parseIssues: number;
  directTargetCodeReveal: boolean;
}): string[] {
  const tags: string[] = [];

  if (params.directTargetCodeReveal) tags.push("direct_code_reveal");
  if (params.matchedKeywords.length > 0) tags.push("direct_keyword_mention");
  if (params.matchedTargetKeywords.length > 0) tags.push("target_keyword_mention");
  if (params.codeReferences.length > 0) tags.push("code_pattern_reference");
  if (params.slotReferences.length > 0) tags.push("slot_reference");
  if (params.hedgeTerms > 0) tags.push("hedging");
  if (params.disagreementMarkers > 0) tags.push("disagreement");
  if (params.answerRevisions > 0) tags.push("answer_revision");
  if (params.opponentAwarenessMarkers > 0) tags.push("opponent_awareness");
  if (params.readySignalCount > 0) tags.push("ready_signal");
  if (params.consensusReached) tags.push("consensus_reached");
  if (params.timeouts > 0) tags.push("deliberation_timeout");
  if (params.fallbacks > 0) tags.push("deliberation_fallback");
  if (params.errors > 0) tags.push("deliberation_error");
  if (params.parseIssues > 0) tags.push("parse_recovery");

  return tags;
}

function summarizeAnalyses(analyses: TranscriptAnalysis[]): TranscriptAnalysisSummary {
  const tagCounts: Record<string, number> = {};

  for (const analysis of analyses) {
    for (const tag of analysis.qualitativeTags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const totalLeakage = analyses.reduce((sum, analysis) => sum + analysis.leakageScore, 0);
  const transcriptsWithLeakage = analyses.filter((analysis) => analysis.leakageScore > 0).length;
  const transcriptsWithDirectCodeReveal = analyses.filter((analysis) =>
    analysis.qualitativeTags.includes("direct_code_reveal"),
  ).length;
  const transcriptsWithKeywordMentions = analyses.filter((analysis) =>
    analysis.qualitativeTags.includes("direct_keyword_mention"),
  ).length;

  return {
    averageLeakageScore: analyses.length > 0 ? +(totalLeakage / analyses.length).toFixed(2) : 0,
    maxLeakageScore: analyses.reduce((max, analysis) => Math.max(max, analysis.leakageScore), 0),
    transcriptsWithLeakage,
    transcriptsWithDirectCodeReveal,
    transcriptsWithKeywordMentions,
    tagCounts,
  };
}

function analyzeTranscript(
  match: Match,
  transcript: TeamChatter,
  roundLookup: Map<string, MatchRound>,
  aiLogs: AiCallLog[],
): TranscriptAnalysis {
  const transcriptTeam = asTeamId(transcript.team) || "amber";
  const targetTeam = getTargetTeam(transcriptTeam, transcript.phase);
  const sourceRound = roundLookup.get(`${transcript.roundNumber}:${targetTeam}`);
  const messages = Array.isArray(transcript.messages)
    ? (transcript.messages as ChatterMessage[])
    : [];
  const combinedText = messages.map((message) => message.content || "").join("\n");

  const ownKeywords = asStringArray(
    transcriptTeam === "amber" ? match.amberKeywords : match.blueKeywords,
  );
  const opponentKeywords = asStringArray(
    transcriptTeam === "amber" ? match.blueKeywords : match.amberKeywords,
  );
  const targetKeywords = targetTeam === "amber" ? asStringArray(match.amberKeywords) : asStringArray(match.blueKeywords);
  const targetClues = asStringArray(sourceRound?.clues);
  const targetCode = asCodeTuple(sourceRound?.code);
  const finalAnswer = asCodeTuple(transcript.finalAnswer);

  const readySignals = messages
    .map((message) => message.readySignal)
    .filter((signal): signal is [number, number, number] => Array.isArray(signal));
  const codeReferences = extractCodeReferences(combinedText, readySignals);
  const slotReferences = extractSlotReferences(combinedText);
  const matchedOwnKeywords = getKeywordMatches(combinedText, ownKeywords);
  const matchedOpponentKeywords = getKeywordMatches(combinedText, opponentKeywords);
  const matchedTargetKeywords = getKeywordMatches(combinedText, targetKeywords);

  const matchedLogs = matchTranscriptLogs(transcript, messages, aiLogs, targetClues, targetKeywords);
  const timeouts = matchedLogs.length > 0
    ? matchedLogs.filter((log) => log.timedOut).length
    : messages.filter((message) => message.timedOut).length;
  const fallbacks = matchedLogs.length > 0
    ? matchedLogs.filter((log) => log.usedFallback).length
    : messages.filter((message) => message.usedFallback).length;
  const errors = matchedLogs.length > 0
    ? matchedLogs.filter((log) => Boolean(log.error)).length
    : messages.filter((message) => Boolean(message.error)).length;
  const parseIssues = matchedLogs.filter((log) => log.parseQuality && log.parseQuality !== "clean").length;

  const hedgeTerms = countPatternMatches(combinedText, HEDGE_PATTERNS);
  const disagreementMarkers = countPatternMatches(combinedText, DISAGREEMENT_PATTERNS);
  const answerRevisions = countAnswerRevisions(messages);
  const opponentAwarenessMarkers = countPatternMatches(combinedText, OPPONENT_AWARENESS_PATTERNS);

  const directTargetCodeReveal = targetCode ? codeReferences.includes(formatCode(targetCode)) : false;
  const directFinalAnswerReveal = finalAnswer ? codeReferences.includes(formatCode(finalAnswer)) : false;

  const leakageScore = computeLeakageScore({
    keywordMentions: new Set([...matchedOwnKeywords, ...matchedOpponentKeywords]).size,
    codeReferences: codeReferences.length,
    slotReferences: slotReferences.length,
    directTargetCodeReveal,
    directFinalAnswerReveal,
  });

  const qualitativeTags = buildQualitativeTags({
    matchedKeywords: Array.from(new Set([...matchedOwnKeywords, ...matchedOpponentKeywords])),
    matchedTargetKeywords,
    codeReferences,
    slotReferences,
    hedgeTerms,
    disagreementMarkers,
    answerRevisions,
    opponentAwarenessMarkers,
    readySignalCount: readySignals.length,
    consensusReached: Boolean(transcript.consensusReached),
    timeouts,
    fallbacks,
    errors,
    parseIssues,
    directTargetCodeReveal,
  });

  return {
    transcriptId: transcript.id,
    matchId: transcript.matchId,
    roundNumber: transcript.roundNumber,
    team: transcriptTeam,
    phase: transcript.phase,
    targetTeam,
    totalMessages: messages.length,
    totalExchanges: transcript.totalExchanges,
    consensusReached: transcript.consensusReached,
    finalAnswer,
    targetCode,
    targetClues,
    leakageScore,
    qualitativeTags,
    matchedOwnKeywords,
    matchedOpponentKeywords,
    matchedTargetKeywords,
    codeReferences,
    slotReferences,
    signalCounts: {
      hedgeTerms,
      disagreementMarkers,
      answerRevisions,
      opponentAwarenessMarkers,
      timeouts,
      fallbacks,
      errors,
      parseIssues,
    },
  };
}

export function analyzeMatchTranscriptData(
  match: Match,
  transcripts: TeamChatter[],
  rounds: MatchRound[],
  aiLogs: AiCallLog[],
): MatchTranscriptAnalysis {
  const roundLookup = new Map<string, MatchRound>();

  for (const round of rounds) {
    const roundTeam = asTeamId(round.team);
    if (!roundTeam) continue;
    roundLookup.set(`${round.roundNumber}:${roundTeam}`, round);
  }

  const analyses = transcripts.map((transcript) => analyzeTranscript(match, transcript, roundLookup, aiLogs));

  return {
    matchId: match.id,
    qualityStatus: match.qualityStatus,
    transcriptCount: analyses.length,
    summary: summarizeAnalyses(analyses),
    transcripts: analyses,
  };
}

export async function analyzeMatchTranscripts(matchId: number): Promise<MatchTranscriptAnalysis | null> {
  const match = await storage.getMatch(matchId);
  if (!match) return null;

  const [transcripts, rounds, aiLogs] = await Promise.all([
    storage.getTeamChatter(matchId),
    storage.getMatchRounds(matchId),
    storage.getAiCallLogs(matchId),
  ]);

  return analyzeMatchTranscriptData(match, transcripts, rounds, aiLogs);
}

export async function analyzeTournamentTranscripts(tournamentId: number): Promise<TournamentTranscriptAnalysis> {
  const tournamentMatches = await storage.getTournamentMatches(tournamentId);
  const matchIds = Array.from(new Set(
    tournamentMatches
      .map((tournamentMatch) => tournamentMatch.matchId)
      .filter((matchId): matchId is number => typeof matchId === "number"),
  ));

  if (matchIds.length === 0) {
    return {
      tournamentId,
      matchCount: 0,
      transcriptCount: 0,
      summary: {
        ...summarizeAnalyses([]),
        cleanMatchCount: 0,
        taintedMatchCount: 0,
      },
      matches: [],
    };
  }

  const [matches, rounds, transcripts, aiLogs] = await Promise.all([
    storage.getMatchesByIds(matchIds),
    storage.getMatchRoundsForMatches(matchIds),
    storage.getTeamChatterForMatches(matchIds),
    storage.getAllAiCallLogs(matchIds),
  ]);

  const roundsByMatch = new Map<number, MatchRound[]>();
  for (const round of rounds) {
    const entries = roundsByMatch.get(round.matchId) || [];
    entries.push(round);
    roundsByMatch.set(round.matchId, entries);
  }

  const transcriptsByMatch = new Map<number, TeamChatter[]>();
  for (const transcript of transcripts) {
    const entries = transcriptsByMatch.get(transcript.matchId) || [];
    entries.push(transcript);
    transcriptsByMatch.set(transcript.matchId, entries);
  }

  const logsByMatch = new Map<number, AiCallLog[]>();
  for (const log of aiLogs) {
    if (typeof log.matchId !== "number") continue;
    const entries = logsByMatch.get(log.matchId) || [];
    entries.push(log);
    logsByMatch.set(log.matchId, entries);
  }

  const matchById = new Map(matches.map((match) => [match.id, match]));
  const analyses: MatchTranscriptAnalysis[] = [];

  for (const matchId of matchIds) {
    const match = matchById.get(matchId);
    if (!match) continue;

    analyses.push(analyzeMatchTranscriptData(
      match,
      transcriptsByMatch.get(matchId) || [],
      roundsByMatch.get(matchId) || [],
      logsByMatch.get(matchId) || [],
    ));
  }

  const allTranscriptAnalyses = analyses.flatMap((analysis) => analysis.transcripts);
  const cleanMatchCount = analyses.filter((analysis) => analysis.qualityStatus !== "tainted").length;
  const taintedMatchCount = analyses.filter((analysis) => analysis.qualityStatus === "tainted").length;

  return {
    tournamentId,
    matchCount: analyses.length,
    transcriptCount: allTranscriptAnalyses.length,
    summary: {
      ...summarizeAnalyses(allTranscriptAnalyses),
      cleanMatchCount,
      taintedMatchCount,
    },
    matches: analyses,
  };
}
