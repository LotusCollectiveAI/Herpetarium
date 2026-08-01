/**
 * Shared action schemas and rule-legality validation. These encode the
 * rules BOTH apps must agree on for an artifact to behave identically in
 * training and at the table. Where the apps historically diverged (single
 * words vs ≤120-char phrases) the divergence is an explicit option, not an
 * accident.
 *
 * Legality is not safety: the six baseline clues from production game
 * 20610f90 (fixtures.ts) pass every check here and still forfeited the
 * game, because they are definition-shaped. Transparency scoring requires
 * a semantic evaluator and is deliberately out of scope for validators.
 */
import type { CodeTriple } from "./observation";

export interface ClueSubmission {
  kind: "clues";
  clues: [string, string, string];
  rationale?: string;
}

export interface CodeGuess {
  kind: "guess";
  role: "decode" | "intercept";
  guess: CodeTriple;
  rationale?: string;
}

export interface DeliberationMessage {
  kind: "deliberation";
  text: string;
  proposal?: CodeTriple;
}

export type DecryptoAction = ClueSubmission | CodeGuess | DeliberationMessage;

export function validateCodeGuess(guess: unknown): string[] {
  const problems: string[] = [];
  if (!Array.isArray(guess) || guess.length !== 3) {
    return ["guess must be an array of exactly 3 digits"];
  }
  for (const digit of guess) {
    if (!Number.isInteger(digit) || digit < 1 || digit > 4) {
      problems.push(`digit ${String(digit)} is not an integer in 1..4`);
    }
  }
  if (new Set(guess).size !== 3) {
    problems.push("digits must be distinct");
  }
  return problems;
}

export interface ClueRuleOptions {
  /** The Table allows phrases up to 120 chars; Herpetarium trains single words. */
  maxLength: number;
  singleWordOnly: boolean;
}

export const TABLE_CLUE_RULES: ClueRuleOptions = { maxLength: 120, singleWordOnly: false };
export const HERPETARIUM_CLUE_RULES: ClueRuleOptions = { maxLength: 40, singleWordOnly: true };

export interface ClueContext {
  ownKeywords: [string, string, string, string];
  previousOwnClues: string[];
}

function normalizeWord(text: string): string {
  return text.toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

function words(text: string): string[] {
  return text
    .toLocaleLowerCase("en")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

/**
 * Rule-legality for a single clue: not a keyword, not a derivative (shared
 * 4+ letter stem, keyword embedded in a longer word, keyword hidden across
 * separators), not a repeat, within length, optionally single-word. Ported
 * from The Table's published semantics (replit.md Task #13; speech-security).
 */
export function validateClue(
  clue: string,
  context: ClueContext,
  options: ClueRuleOptions,
): string[] {
  const problems: string[] = [];
  const trimmed = clue.trim();
  if (trimmed.length === 0) {
    return ["clue is empty"];
  }
  if (trimmed.length > options.maxLength) {
    problems.push(`clue exceeds ${options.maxLength} characters`);
  }
  const clueWords = words(trimmed);
  if (options.singleWordOnly && clueWords.length !== 1) {
    problems.push("clue must be a single word");
  }
  const collapsed = normalizeWord(trimmed);
  for (const keyword of context.ownKeywords) {
    const kw = normalizeWord(keyword);
    if (kw.length === 0) continue;
    if (clueWords.length === 1 && clueWords[0] === kw) {
      problems.push(`clue equals keyword "${keyword}"`);
      continue;
    }
    if (kw.length >= 4 && collapsed.includes(kw)) {
      problems.push(`clue contains keyword "${keyword}" (including across separators)`);
      continue;
    }
    const stem = kw.slice(0, 4);
    if (stem.length === 4 && clueWords.some((w) => w.startsWith(stem))) {
      problems.push(`clue shares the 4-letter stem of keyword "${keyword}"`);
    }
  }
  const previous = new Set(context.previousOwnClues.map((c) => c.trim().toLocaleLowerCase("en")));
  if (previous.has(trimmed.toLocaleLowerCase("en"))) {
    problems.push("clue repeats an earlier clue from this team");
  }
  return problems;
}

export function validateClueSubmission(
  submission: ClueSubmission,
  context: ClueContext,
  options: ClueRuleOptions,
): string[] {
  const problems: string[] = [];
  submission.clues.forEach((clue, index) => {
    for (const problem of validateClue(clue, context, options)) {
      problems.push(`clue ${index + 1}: ${problem}`);
    }
  });
  const normalized = submission.clues.map((c) => c.trim().toLocaleLowerCase("en"));
  if (new Set(normalized).size !== normalized.length) {
    problems.push("clues within a round must be distinct");
  }
  return problems;
}
