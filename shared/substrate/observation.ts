/**
 * Role-legal observation contracts. v0.1 remains available for legacy
 * readers. v0.2 is intentionally limited to bot decoder/interceptor live
 * views and pins the exact Table protocol identities.
 */
import { contentHash } from "./hash";
import {
  assertNoSecretBearingFields,
  cloneAndDeepFreeze,
  exactKeys,
  validateExactContentIdentityRef,
  type ContentIdentityRef,
} from "./identity";
import {
  TABLE_COMPETITIVE_V1,
  validateTableCompetitiveIdentities,
  type CompetitiveIdentitySet,
} from "./protocol";

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

export const OBSERVATION_V2_VERSION = "0.2";

export type ObservationV2Role = "decoder" | "interceptor";
export type ObservationLane = "table" | "team:own" | "team:opponent:open";

export interface ObservationActorV2 {
  readonly actorId: string;
  readonly seatId: string;
  readonly team: string;
  readonly role: ObservationV2Role;
}

export interface ObservationLineV2 {
  readonly eventId: string;
  readonly speakerActorId: string;
  readonly lane: ObservationLane;
  readonly text: string;
}

export interface ResolvedSideViewV2 {
  readonly clues: [string, string, string];
  readonly code: CodeTriple;
  readonly ownDecode: CodeTriple;
  readonly intercept: CodeTriple | null;
  readonly decodedCorrectly: boolean;
  readonly wasIntercepted: boolean | null;
}

export interface ResolvedRoundViewV2 {
  readonly roundNumber: number;
  readonly own: ResolvedSideViewV2;
  readonly opponent: ResolvedSideViewV2;
}

export interface DecryptoObservationV2Source {
  readonly observationVersion: typeof OBSERVATION_V2_VERSION;
  readonly decisionId: string;
  /** Stable across retries for one authoritative action slot. */
  readonly logicalActionKey: string;
  readonly gameId: string;
  readonly roundNumber: number;
  readonly actor: ObservationActorV2;
  /** Seat ID of the actor's own team's active cluegiver for this round. */
  readonly activeCluegiverSeatId: string;
  readonly identities: CompetitiveIdentitySet & {
    readonly botBuild: ContentIdentityRef;
  };
  readonly role: ObservationV2Role;
  readonly team: string;
  /** Decoder receives own keywords; interceptor receives explicit null. */
  readonly ownKeywords: [string, string, string, string] | null;
  readonly ownClues: [string, string, string];
  readonly opponentClues: [string, string, string];
  /** Complete public history: exactly rounds 1..roundNumber-1. */
  readonly resolvedRounds: readonly ResolvedRoundViewV2[];
  readonly tokens: { readonly own: TeamTokens; readonly opponent: TeamTokens };
  readonly teamChatVisibility: TeamChatVisibility;
  readonly decisionFocus: string;
  readonly transcript: readonly ObservationLineV2[];
}

export interface DecryptoObservationV2 extends DecryptoObservationV2Source {
  readonly contentHash: string;
}

export type AnyDecryptoObservation =
  | DecryptoObservation
  | DecryptoObservationV2;

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function codeProblems(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length !== 3) {
    return [`${label} must be exactly three digits`];
  }
  const problems: string[] = [];
  for (const digit of value) {
    if (!Number.isInteger(digit) || digit < 1 || digit > 4) {
      problems.push(`${label} digits must be integers in 1..4`);
    }
  }
  if (new Set(value).size !== 3)
    problems.push(`${label} digits must be distinct`);
  return problems;
}

function clueProblems(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(nonEmpty)) {
    return [`${label} must contain exactly three non-empty clues`];
  }
  return [];
}

function sideProblems(
  side: ResolvedSideViewV2,
  roundNumber: number,
  label: string,
): string[] {
  const problems = exactKeys(
    side,
    [
      "clues",
      "code",
      "ownDecode",
      "intercept",
      "decodedCorrectly",
      "wasIntercepted",
    ],
    label,
  );
  problems.push(
    ...clueProblems(side?.clues, `${label}.clues`),
    ...codeProblems(side?.code, `${label}.code`),
    ...codeProblems(side?.ownDecode, `${label}.ownDecode`),
  );
  if (roundNumber === 1) {
    if (side?.intercept !== null || side?.wasIntercepted !== null) {
      problems.push(`${label} round-1 intercept facts must be null`);
    }
  } else {
    problems.push(...codeProblems(side?.intercept, `${label}.intercept`));
    if (typeof side?.wasIntercepted !== "boolean") {
      problems.push(`${label}.wasIntercepted must be boolean after round 1`);
    }
  }
  if (typeof side?.decodedCorrectly !== "boolean") {
    problems.push(`${label}.decodedCorrectly must be boolean`);
  } else if (
    codeProblems(side?.code, "code").length === 0 &&
    codeProblems(side?.ownDecode, "decode").length === 0
  ) {
    const actual =
      side.code[0] === side.ownDecode[0] &&
      side.code[1] === side.ownDecode[1] &&
      side.code[2] === side.ownDecode[2];
    if (side.decodedCorrectly !== actual) {
      problems.push(`${label}.decodedCorrectly contradicts code and ownDecode`);
    }
  }
  if (
    roundNumber > 1 &&
    typeof side?.wasIntercepted === "boolean" &&
    codeProblems(side?.code, "code").length === 0 &&
    codeProblems(side?.intercept, "intercept").length === 0
  ) {
    const actual =
      side.code[0] === side.intercept![0] &&
      side.code[1] === side.intercept![1] &&
      side.code[2] === side.intercept![2];
    if (side.wasIntercepted !== actual) {
      problems.push(`${label}.wasIntercepted contradicts code and intercept`);
    }
  }
  return problems;
}

function tokenProblems(value: TeamTokens, label: string): string[] {
  const problems = exactKeys(value, ["intercepts", "miscommunications"], label);
  for (const key of ["intercepts", "miscommunications"] as const) {
    const token = value?.[key];
    if (!Number.isInteger(token) || token < 0) {
      problems.push(`${label}.${key} must be a non-negative integer`);
    } else if (
      token >=
      (key === "intercepts"
        ? TABLE_COMPETITIVE_V1.rules.win.interceptTokens
        : TABLE_COMPETITIVE_V1.rules.win.miscommunicationTokens)
    ) {
      problems.push(`${label}.${key} must remain below its terminal threshold`);
    }
  }
  return problems;
}

export function validateObservationV2(
  observation: DecryptoObservationV2Source | DecryptoObservationV2,
): string[] {
  const problems: string[] = [];
  try {
    const sourceKeys = [
      "observationVersion",
      "decisionId",
      "logicalActionKey",
      "gameId",
      "roundNumber",
      "actor",
      "activeCluegiverSeatId",
      "identities",
      "role",
      "team",
      "ownKeywords",
      "ownClues",
      "opponentClues",
      "resolvedRounds",
      "tokens",
      "teamChatVisibility",
      "decisionFocus",
      "transcript",
    ];
    problems.push(
      ...exactKeys(
        observation,
        "contentHash" in observation
          ? [...sourceKeys, "contentHash"]
          : sourceKeys,
        "observation",
      ),
    );
    if (observation?.observationVersion !== OBSERVATION_V2_VERSION) {
      problems.push(`observationVersion must be "${OBSERVATION_V2_VERSION}"`);
    }
    for (const [label, value] of [
      ["decisionId", observation?.decisionId],
      ["logicalActionKey", observation?.logicalActionKey],
      ["gameId", observation?.gameId],
      ["activeCluegiverSeatId", observation?.activeCluegiverSeatId],
      ["team", observation?.team],
      ["decisionFocus", observation?.decisionFocus],
    ] as const) {
      if (!nonEmpty(value)) problems.push(`${label} is required`);
    }
    if (
      !Number.isInteger(observation?.roundNumber) ||
      observation.roundNumber < 1 ||
      observation.roundNumber > TABLE_COMPETITIVE_V1.rules.win.maximumRounds
    ) {
      problems.push("roundNumber must be an integer in 1..8");
    }
    if (
      observation?.role !== "decoder" &&
      observation?.role !== "interceptor"
    ) {
      problems.push("role must be decoder|interceptor");
    }
    problems.push(
      ...exactKeys(
        observation?.actor,
        ["actorId", "seatId", "team", "role"],
        "actor",
      ),
    );
    for (const [label, value] of [
      ["actor.actorId", observation?.actor?.actorId],
      ["actor.seatId", observation?.actor?.seatId],
      ["actor.team", observation?.actor?.team],
    ] as const) {
      if (!nonEmpty(value)) problems.push(`${label} is required`);
    }
    if (
      observation?.actor?.role !== observation?.role ||
      observation?.actor?.team !== observation?.team
    ) {
      problems.push("actor role/team must equal the observation role/team");
    }
    if (observation?.actor?.seatId === observation?.activeCluegiverSeatId) {
      problems.push(
        "own-team active cluegiver cannot receive a decoder/interceptor view",
      );
    }
    problems.push(
      ...exactKeys(
        observation?.identities,
        ["botBuild", "protocol", "visibility", "rules"],
        "identities",
      ),
      ...validateExactContentIdentityRef(
        observation?.identities?.botBuild,
        "identities.botBuild",
      ),
      ...validateTableCompetitiveIdentities(
        {
          protocol: observation?.identities?.protocol,
          visibility: observation?.identities?.visibility,
          rules: observation?.identities?.rules,
        },
        "identities",
      ),
      ...clueProblems(observation?.ownClues, "ownClues"),
      ...clueProblems(observation?.opponentClues, "opponentClues"),
    );
    if (observation?.role === "decoder") {
      if (
        !Array.isArray(observation?.ownKeywords) ||
        observation.ownKeywords.length !== 4 ||
        !observation.ownKeywords.every(nonEmpty)
      ) {
        problems.push("decoder ownKeywords must contain four non-empty words");
      }
    } else {
      if (observation?.ownKeywords !== null) {
        problems.push("interceptor ownKeywords must be null");
      }
      if (observation?.roundNumber === 1) {
        problems.push("round 1 does not permit interception");
      }
    }

    if (!Array.isArray(observation?.resolvedRounds)) {
      problems.push("resolvedRounds must be an array");
    } else {
      if (observation.resolvedRounds.length !== observation.roundNumber - 1) {
        problems.push(
          "resolvedRounds must completely cover rounds 1..roundNumber-1",
        );
      }
      for (
        let index = 0;
        index < observation.resolvedRounds.length;
        index += 1
      ) {
        const round = observation.resolvedRounds[index]!;
        const expectedRound = index + 1;
        problems.push(
          ...exactKeys(
            round,
            ["roundNumber", "own", "opponent"],
            `round ${expectedRound}`,
          ),
        );
        if (round?.roundNumber !== expectedRound) {
          problems.push(
            `resolvedRounds[${index}] must be round ${expectedRound}`,
          );
        }
        problems.push(
          ...sideProblems(
            round?.own,
            expectedRound,
            `round ${expectedRound}.own`,
          ),
          ...sideProblems(
            round?.opponent,
            expectedRound,
            `round ${expectedRound}.opponent`,
          ),
        );
      }
    }

    problems.push(
      ...exactKeys(observation?.tokens, ["own", "opponent"], "tokens"),
      ...tokenProblems(observation?.tokens?.own, "tokens.own"),
      ...tokenProblems(observation?.tokens?.opponent, "tokens.opponent"),
    );
    if (Array.isArray(observation?.resolvedRounds)) {
      const expected = observation.resolvedRounds.reduce(
        (totals, round) => ({
          own: {
            intercepts:
              totals.own.intercepts +
              (round?.opponent?.wasIntercepted === true ? 1 : 0),
            miscommunications:
              totals.own.miscommunications +
              (round?.own?.decodedCorrectly === false ? 1 : 0),
          },
          opponent: {
            intercepts:
              totals.opponent.intercepts +
              (round?.own?.wasIntercepted === true ? 1 : 0),
            miscommunications:
              totals.opponent.miscommunications +
              (round?.opponent?.decodedCorrectly === false ? 1 : 0),
          },
        }),
        {
          own: { intercepts: 0, miscommunications: 0 },
          opponent: { intercepts: 0, miscommunications: 0 },
        },
      );
      if (
        observation?.tokens?.own?.intercepts !== expected.own.intercepts ||
        observation?.tokens?.own?.miscommunications !==
          expected.own.miscommunications ||
        observation?.tokens?.opponent?.intercepts !==
          expected.opponent.intercepts ||
        observation?.tokens?.opponent?.miscommunications !==
          expected.opponent.miscommunications
      ) {
        problems.push("tokens must equal the complete resolved-round history");
      }
    }

    if (
      observation?.teamChatVisibility !== "open" &&
      observation?.teamChatVisibility !== "private"
    ) {
      problems.push("teamChatVisibility must be open|private");
    }
    if (!Array.isArray(observation?.transcript)) {
      problems.push("transcript must be an array");
    } else {
      const eventIds = new Set<string>();
      observation.transcript.forEach((line, index) => {
        const label = `transcript[${index}]`;
        problems.push(
          ...exactKeys(
            line,
            ["eventId", "speakerActorId", "lane", "text"],
            label,
          ),
        );
        if (!nonEmpty(line?.eventId))
          problems.push(`${label}.eventId is required`);
        if (!nonEmpty(line?.speakerActorId)) {
          problems.push(`${label}.speakerActorId is required`);
        }
        if (!nonEmpty(line?.text)) problems.push(`${label}.text is required`);
        if (
          line?.lane !== "table" &&
          line?.lane !== "team:own" &&
          line?.lane !== "team:opponent:open"
        ) {
          problems.push(`${label}.lane is unknown`);
        }
        if (
          line?.lane === "team:opponent:open" &&
          observation.teamChatVisibility !== "open"
        ) {
          problems.push("opponent Team transcript requires open chat");
        }
        if (eventIds.has(line?.eventId)) {
          problems.push(`duplicate transcript eventId "${line.eventId}"`);
        }
        eventIds.add(line?.eventId);
      });
    }
    assertNoSecretBearingFields(observation, "observation");
  } catch (error) {
    problems.push(
      `observation validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

export function observationV2ContentHash(
  source: DecryptoObservationV2Source,
): string {
  return contentHash(source);
}

export function mintObservationV2(
  source: DecryptoObservationV2Source,
): DecryptoObservationV2 {
  const problems = validateObservationV2(source);
  if (problems.length > 0) {
    throw new Error(`invalid observation v0.2: ${problems.join("; ")}`);
  }
  const cloned = structuredClone(source);
  return cloneAndDeepFreeze({
    ...cloned,
    contentHash: observationV2ContentHash(cloned),
  });
}

export function verifyObservationV2(
  observation: DecryptoObservationV2,
): boolean {
  try {
    const { contentHash: recorded, ...source } = observation;
    return (
      validateObservationV2(observation).length === 0 &&
      observationV2ContentHash(source) === recorded
    );
  } catch {
    return false;
  }
}

function assertRoleLegalV1(observation: DecryptoObservation): void {
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

export function assertRoleLegal(observation: AnyDecryptoObservation): void {
  if (observation?.observationVersion === OBSERVATION_V2_VERSION) {
    const problems = validateObservationV2(
      observation as DecryptoObservationV2,
    );
    if (problems.length > 0) {
      throw new Error(`role-illegal observation: ${problems.join("; ")}`);
    }
    return;
  }
  if (observation?.observationVersion === "0.1") {
    assertRoleLegalV1(observation as DecryptoObservation);
    return;
  }
  throw new Error(
    `role-illegal observation: unknown observationVersion "${String(
      (observation as { observationVersion?: unknown })?.observationVersion,
    )}"`,
  );
}
