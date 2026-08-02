/**
 * Role-legal observation contract. The schema itself cannot express opponent
 * keywords. As of 2026-08-01 the contract and conformance fixtures exist, but
 * neither runtime constructs this shape or calls `assertRoleLegal` before
 * provider dispatch yet; their existing app-specific visibility boundaries
 * remain authoritative. Runtime construction, assertion, and observation
 * hashing are the next integration slice.
 */

export type ObservationRole =
  | "encryptor"
  | "decoder"
  | "interceptor"
  | "deliberator";

/**
 * The two team-chat worlds the product exposes: opponents can read your team
 * channel ("open") or they cannot ("private"). Research may later define
 * additional experimental conditions, but the substrate carries only what
 * the product's game setting can mean.
 */
export type TeamChatVisibility = "open" | "private";

export interface TeamTokens {
  intercepts: number;
  miscommunications: number;
}

export type CodeTriple = [number, number, number];

export interface ResolvedSideView {
  clues: string[] | null;
  code: CodeTriple | null;
  ownDecode: CodeTriple | null;
  intercept: CodeTriple | null;
  decodedCorrectly: boolean | null;
  wasIntercepted: boolean | null;
}

export interface ResolvedRoundView {
  roundNumber: number;
  own: ResolvedSideView;
  opponent: ResolvedSideView;
}

export type ChatChannel = "table" | "team:own" | "team:opponent";

export interface ChatLine {
  speaker: string;
  channel: ChatChannel;
  text: string;
}

export interface DecryptoObservation {
  observationVersion: "0.1";
  role: ObservationRole;
  team: string;
  roundNumber: number;
  /** Own team's numbered keywords (index 0 = keyword 1). Never the opponent's. */
  ownKeywords?: [string, string, string, string];
  /** The live secret code. Encryptor only. */
  code?: CodeTriple;
  ownClues: string[] | null;
  opponentClues: string[] | null;
  resolvedRounds: ResolvedRoundView[];
  tokens: { own: TeamTokens; opponent: TeamTokens };
  /** Game setting: what the opposing team can see of this team's team chat. */
  teamChatVisibility: TeamChatVisibility;
  /** One sentence naming the single decision this observation serves. */
  decisionFocus: string;
  transcript?: ChatLine[];
}

/**
 * Assert an observation is legal for its declared role. Throws with all
 * violations listed. The intended adoption boundary is symmetric: apps
 * assert before prompting and research asserts before accepting a trace.
 */
export function assertRoleLegal(observation: DecryptoObservation): void {
  const violations: string[] = [];

  if (observation.code !== undefined && observation.role !== "encryptor") {
    violations.push(
      `role "${observation.role}" must not receive the live code`,
    );
  }
  if (observation.role === "encryptor" && observation.code === undefined) {
    violations.push("encryptor observation is missing the live code");
  }
  for (const round of observation.resolvedRounds) {
    if (round.own.code === null && round.own.clues !== null) {
      // Resolved rounds are public history; codes must be present once resolved.
      violations.push(
        `resolved round ${round.roundNumber} is missing its own code`,
      );
    }
  }
  const transcript = observation.transcript ?? [];
  for (const line of transcript) {
    if (
      line.channel === "team:opponent" &&
      observation.teamChatVisibility === "private"
    ) {
      violations.push(
        "opponent team-chat line present while teamChatVisibility is private",
      );
    }
  }
  if (observation.decisionFocus.trim() === "") {
    violations.push("decisionFocus must name the pending decision");
  }

  if (violations.length > 0) {
    throw new Error(`role-illegal observation: ${violations.join("; ")}`);
  }
}
