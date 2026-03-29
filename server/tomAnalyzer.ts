import type { AiCallLog } from "@shared/schema";

export type TomLevel = 0 | 1 | 2 | 3;

export interface TomAnalysis {
  level: TomLevel;
  label: string;
  evidence: string[];
  score: number;
}

export interface GameTomProfile {
  gameIndex: number;
  matchId: number | null;
  clues: TomAnalysis;
  interceptions: TomAnalysis;
  overall: TomAnalysis;
}

export interface PlayerTomTimeline {
  provider: string;
  team: string;
  playerName: string;
  games: GameTomProfile[];
  avgLevel: number;
  maxLevel: TomLevel;
  progression: "improving" | "stable" | "declining";
}

const TOM_LEVEL_LABELS: Record<TomLevel, string> = {
  0: "Reactive",
  1: "Self-Aware",
  2: "Theory of Mind",
  3: "Meta-Strategic",
};

const LEVEL_0_PATTERNS = [
  /\brandom\b/i,
  /\bguess\b/i,
  /\bno idea\b/i,
  /\bnot sure\b/i,
];

const LEVEL_1_PATTERNS = [
  /\bmy (team|keyword|clue|strategy)\b/i,
  /\bI (should|will|chose|think|need|used)\b/i,
  /\bour (approach|method|pattern)\b/i,
  /\bvary (my|our)\b/i,
  /\bavoid repeat/i,
  /\bchange (my|our) approach\b/i,
  /\bswitch\b.*\bstrategy\b/i,
];

const LEVEL_2_PATTERNS = [
  /\bopponent (might|could|would|will|may|expects?|thinks?|knows?|notices?|sees?)\b/i,
  /\bthey (might|could|would|will|may|expect|think|know|notice|see|are)\b/i,
  /\btheir (perspective|view|strategy|approach|pattern|thinking)\b/i,
  /\bfrom (their|the opponent'?s?) (point of view|perspective)\b/i,
  /\bwhat .* opponent .* (see|notice|deduce|infer)\b/i,
  /\banticipat(e|ing)\b/i,
  /\bpredict(ing|s)?\b.*\bopponent\b/i,
  /\bopponent .* (track|analyz|cluster|group|deduc|infer)\b/i,
  /\bmislead(ing)?\b/i,
  /\bdeceiv(e|ing)\b/i,
  /\bdeception\b/i,
  /\bdisguise\b/i,
];

const LEVEL_3_PATTERNS = [
  /\bthey (think|know|believe|expect) (that )?(I|we) (think|know|believe|expect)\b/i,
  /\bopponent (think|know|believe|expect)s? (that )?(I|we|my team)\b/i,
  /\b(I|we) (think|know|believe|expect) (that )?they (think|know|believe|expect)\b/i,
  /\bexpect(s|ing)? (me|us) to expect\b/i,
  /\bdouble[- ]?bluff\b/i,
  /\breverse psychology\b/i,
  /\bmeta[- ]?(game|level|strategy|strategic)\b/i,
  /\bthey('ll| will) anticipat/i,
  /\bcounter[- ]?(strateg|anticipat)\b/i,
  /\bN[- ]?th (order|level)\b/i,
  /\brecursive\b.*\b(reason|think)\b/i,
  /\bthey expect us to\b/i,
  /\bwe expect them to expect\b/i,
];

function analyzeText(text: string): TomAnalysis {
  const evidence: string[] = [];
  let maxLevel: TomLevel = 0;

  const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);

  for (const sentence of sentences) {
    for (const pattern of LEVEL_3_PATTERNS) {
      if (pattern.test(sentence)) {
        evidence.push(sentence.trim().slice(0, 120));
        maxLevel = Math.max(maxLevel, 3) as TomLevel;
        break;
      }
    }
    for (const pattern of LEVEL_2_PATTERNS) {
      if (pattern.test(sentence)) {
        if (!evidence.some(e => e === sentence.trim().slice(0, 120))) {
          evidence.push(sentence.trim().slice(0, 120));
        }
        maxLevel = Math.max(maxLevel, 2) as TomLevel;
        break;
      }
    }
    for (const pattern of LEVEL_1_PATTERNS) {
      if (pattern.test(sentence)) {
        maxLevel = Math.max(maxLevel, 1) as TomLevel;
        break;
      }
    }
  }

  let score = 0;
  for (const sentence of sentences) {
    let sentenceMax = 0;
    for (const p of LEVEL_3_PATTERNS) if (p.test(sentence)) sentenceMax = 3;
    if (sentenceMax === 0) for (const p of LEVEL_2_PATTERNS) if (p.test(sentence)) sentenceMax = 2;
    if (sentenceMax === 0) for (const p of LEVEL_1_PATTERNS) if (p.test(sentence)) sentenceMax = 1;
    score += sentenceMax;
  }
  const normalizedScore = sentences.length > 0 ? score / sentences.length : 0;

  return {
    level: maxLevel,
    label: TOM_LEVEL_LABELS[maxLevel],
    evidence: evidence.slice(0, 5),
    score: +normalizedScore.toFixed(2),
  };
}

export function analyzeAiCallTom(log: AiCallLog): TomAnalysis {
  const textsToAnalyze: string[] = [];

  if (log.rawResponse) textsToAnalyze.push(log.rawResponse);
  if (log.reasoningTrace) textsToAnalyze.push(log.reasoningTrace);
  if (log.prompt) {
    const responseSection = log.prompt.split("THINK STEP BY STEP");
    if (responseSection.length > 1) textsToAnalyze.push(responseSection.slice(1).join(" "));
  }

  const combined = textsToAnalyze.join("\n\n");
  return analyzeText(combined);
}

export function analyzeScratchNoteTom(notesText: string): TomAnalysis {
  return analyzeText(notesText);
}

export function buildTomTimeline(
  logs: AiCallLog[],
  scratchNotes: Array<{ gameIndex: number; notesText: string; matchId: number | null }>,
  playerName: string,
  provider: string,
  team: string
): PlayerTomTimeline {
  const gameIndices = new Set<number>();
  for (const note of scratchNotes) gameIndices.add(note.gameIndex);

  const logsByMatch = new Map<number, AiCallLog[]>();
  for (const l of logs) {
    if (l.matchId) {
      if (!logsByMatch.has(l.matchId)) logsByMatch.set(l.matchId, []);
      logsByMatch.get(l.matchId)!.push(l);
    }
  }

  const games: GameTomProfile[] = [];

  for (const note of scratchNotes) {
    const noteTom = analyzeScratchNoteTom(note.notesText);

    let clueTom: TomAnalysis = { level: 0, label: TOM_LEVEL_LABELS[0], evidence: [], score: 0 };
    let interceptTom: TomAnalysis = { level: 0, label: TOM_LEVEL_LABELS[0], evidence: [], score: 0 };

    if (note.matchId && logsByMatch.has(note.matchId)) {
      const matchLogs = logsByMatch.get(note.matchId)!;
      const providerLogs = matchLogs.filter(l =>
        l.provider === provider && (l.actionType === "generate_clues" || l.actionType === "generate_interception")
      );

      const clueLogs = providerLogs.filter(l => l.actionType === "generate_clues");
      const interceptLogs = providerLogs.filter(l => l.actionType === "generate_interception");

      if (clueLogs.length > 0) {
        const analyses = clueLogs.map(l => analyzeAiCallTom(l));
        clueTom = {
          level: Math.max(...analyses.map(a => a.level)) as TomLevel,
          label: TOM_LEVEL_LABELS[Math.max(...analyses.map(a => a.level)) as TomLevel],
          evidence: analyses.flatMap(a => a.evidence).slice(0, 3),
          score: +(analyses.reduce((s, a) => s + a.score, 0) / analyses.length).toFixed(2),
        };
      }

      if (interceptLogs.length > 0) {
        const analyses = interceptLogs.map(l => analyzeAiCallTom(l));
        interceptTom = {
          level: Math.max(...analyses.map(a => a.level)) as TomLevel,
          label: TOM_LEVEL_LABELS[Math.max(...analyses.map(a => a.level)) as TomLevel],
          evidence: analyses.flatMap(a => a.evidence).slice(0, 3),
          score: +(analyses.reduce((s, a) => s + a.score, 0) / analyses.length).toFixed(2),
        };
      }
    }

    const overallLevel = Math.max(noteTom.level, clueTom.level, interceptTom.level) as TomLevel;
    const overallScore = +((noteTom.score + clueTom.score + interceptTom.score) / 3).toFixed(2);

    games.push({
      gameIndex: note.gameIndex,
      matchId: note.matchId,
      clues: clueTom,
      interceptions: interceptTom,
      overall: {
        level: overallLevel,
        label: TOM_LEVEL_LABELS[overallLevel],
        evidence: [...noteTom.evidence, ...clueTom.evidence, ...interceptTom.evidence].slice(0, 5),
        score: overallScore,
      },
    });
  }

  games.sort((a, b) => a.gameIndex - b.gameIndex);

  const avgLevel = games.length > 0 ? games.reduce((s, g) => s + g.overall.level, 0) / games.length : 0;
  const maxLevel = games.length > 0 ? (Math.max(...games.map(g => g.overall.level)) as TomLevel) : 0;

  let progression: "improving" | "stable" | "declining" = "stable";
  if (games.length >= 3) {
    const firstHalf = games.slice(0, Math.floor(games.length / 2));
    const secondHalf = games.slice(Math.floor(games.length / 2));
    const firstAvg = firstHalf.reduce((s, g) => s + g.overall.level, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, g) => s + g.overall.level, 0) / secondHalf.length;
    if (secondAvg > firstAvg + 0.3) progression = "improving";
    else if (secondAvg < firstAvg - 0.3) progression = "declining";
  }

  return {
    provider,
    team,
    playerName,
    games,
    avgLevel: +avgLevel.toFixed(2),
    maxLevel,
    progression,
  };
}

export function computeMatchTomMetrics(logs: AiCallLog[]): Record<string, TomAnalysis> {
  const byProvider: Record<string, AiCallLog[]> = {};
  for (const l of logs) {
    const key = `${l.provider}:${l.model}`;
    if (!byProvider[key]) byProvider[key] = [];
    byProvider[key].push(l);
  }

  const result: Record<string, TomAnalysis> = {};
  for (const [key, providerLogs] of Object.entries(byProvider)) {
    const analyses = providerLogs.map(l => analyzeAiCallTom(l));
    const maxLevel = Math.max(...analyses.map(a => a.level)) as TomLevel;
    const avgScore = analyses.reduce((s, a) => s + a.score, 0) / analyses.length;
    result[key] = {
      level: maxLevel,
      label: TOM_LEVEL_LABELS[maxLevel],
      evidence: analyses.flatMap(a => a.evidence).slice(0, 5),
      score: +avgScore.toFixed(2),
    };
  }

  return result;
}
