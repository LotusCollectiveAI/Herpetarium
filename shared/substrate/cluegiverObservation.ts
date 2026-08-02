/**
 * Role-legal live observation for a pending Decrypto cluegiver decision.
 *
 * This is a sibling of Observation v0.2 rather than a new role inside it.
 * The exact cluegiver BotBuild is named by content identity, while trusted
 * registry resolution remains an integration boundary.
 */
import { contentHash } from "./hash";
import {
  validateBotBuildReferenceForDecisionRole,
  type BotBuildManifestForDecision,
} from "./cluegiverBotBuild";
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
import type { CodeTriple, TeamChatVisibility, TeamTokens } from "./observation";

export const CLUEGIVER_OBSERVATION_VERSION = "cluegiver-0.1";

export type CluegiverSeatRole = "agent_a" | "agent_b" | "agent_c";

export interface CluegiverObservationActor {
  readonly actorId: string;
  readonly seatId: string;
  readonly seatRole: CluegiverSeatRole;
  readonly team: string;
  readonly role: "cluegiver";
}

/**
 * Public facts from one resolved side. `intercept` is the opposing team's
 * guess of this side's code; `ownDecode` is this side's guess of its own code.
 * Correctness and outcome booleans are intentionally omitted because they are
 * deterministically derived from code and guesses, as are token totals.
 */
export interface ResolvedCluegiverSideView {
  readonly clues: [string, string, string];
  readonly code: CodeTriple;
  readonly ownDecode: CodeTriple;
  readonly intercept: CodeTriple | null;
}

export interface ResolvedCluegiverRoundView {
  readonly roundNumber: number;
  readonly own: ResolvedCluegiverSideView;
  readonly opponent: ResolvedCluegiverSideView;
}

export interface CluegiverObservationLine {
  readonly eventId: string;
  readonly speakerActorId: string;
  /** Null is allowed only for unteamed speakers on the public Table lane. */
  readonly speakerTeam: string | null;
  readonly lane: "table" | "team:own" | "team:opponent:open";
  readonly text: string;
}

export interface DecryptoCluegiverObservationSource {
  readonly observationVersion: typeof CLUEGIVER_OBSERVATION_VERSION;
  readonly decisionId: string;
  /** Stable across retries for one authoritative clue-submission slot. */
  readonly logicalActionKey: string;
  readonly gameId: string;
  readonly roundNumber: number;
  readonly actor: CluegiverObservationActor;
  /** Must equal actor.seatId. */
  readonly activeCluegiverSeatId: string;
  readonly identities: CompetitiveIdentitySet & {
    readonly botBuild: ContentIdentityRef;
  };
  readonly role: "cluegiver";
  readonly team: string;
  readonly ownKeywords: [string, string, string, string];
  /** The only live code legal for this role. */
  readonly code: CodeTriple;
  /** Complete prior public history: exactly rounds 1..roundNumber-1. */
  readonly resolvedRounds: readonly ResolvedCluegiverRoundView[];
  readonly tokens: { readonly own: TeamTokens; readonly opponent: TeamTokens };
  readonly teamChatVisibility: TeamChatVisibility;
  readonly decisionFocus: string;
  readonly transcript: readonly CluegiverObservationLine[];
}

export interface DecryptoCluegiverObservation extends DecryptoCluegiverObservationSource {
  readonly contentHash: string;
}

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
  if (new Set(value).size !== 3) {
    problems.push(`${label} digits must be distinct`);
  }
  return problems;
}

function clueProblems(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(nonEmpty)) {
    return [`${label} must contain exactly three non-empty clues`];
  }
  return [];
}

function sameCode(left: CodeTriple, right: CodeTriple): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function sideProblems(
  side: ResolvedCluegiverSideView,
  roundNumber: number,
  label: string,
): string[] {
  const problems = exactKeys(
    side,
    ["clues", "code", "ownDecode", "intercept"],
    label,
  );
  problems.push(
    ...clueProblems(side?.clues, `${label}.clues`),
    ...codeProblems(side?.code, `${label}.code`),
    ...codeProblems(side?.ownDecode, `${label}.ownDecode`),
  );
  if (roundNumber === 1) {
    if (side?.intercept !== null) {
      problems.push(`${label}.intercept must be null in round 1`);
    }
  } else {
    problems.push(...codeProblems(side?.intercept, `${label}.intercept`));
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

function historyTokenTotals(rounds: readonly ResolvedCluegiverRoundView[]): {
  own: TeamTokens;
  opponent: TeamTokens;
} {
  return rounds.reduce(
    (totals, round) => ({
      own: {
        intercepts:
          totals.own.intercepts +
          (round.roundNumber > 1 &&
          round.opponent.intercept !== null &&
          sameCode(round.opponent.code, round.opponent.intercept)
            ? 1
            : 0),
        miscommunications:
          totals.own.miscommunications +
          (sameCode(round.own.code, round.own.ownDecode) ? 0 : 1),
      },
      opponent: {
        intercepts:
          totals.opponent.intercepts +
          (round.roundNumber > 1 &&
          round.own.intercept !== null &&
          sameCode(round.own.code, round.own.intercept)
            ? 1
            : 0),
        miscommunications:
          totals.opponent.miscommunications +
          (sameCode(round.opponent.code, round.opponent.ownDecode) ? 0 : 1),
      },
    }),
    {
      own: { intercepts: 0, miscommunications: 0 },
      opponent: { intercepts: 0, miscommunications: 0 },
    },
  );
}

export function validateCluegiverObservation(
  observation:
    | DecryptoCluegiverObservationSource
    | DecryptoCluegiverObservation,
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
      "code",
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
        "cluegiver observation",
      ),
    );
    if (observation?.observationVersion !== CLUEGIVER_OBSERVATION_VERSION) {
      problems.push(
        `observationVersion must be "${CLUEGIVER_OBSERVATION_VERSION}"`,
      );
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
    if (observation?.role !== "cluegiver") {
      problems.push('role must be "cluegiver"');
    }
    problems.push(
      ...exactKeys(
        observation?.actor,
        ["actorId", "seatId", "seatRole", "team", "role"],
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
    if (observation?.actor?.seatId !== observation?.activeCluegiverSeatId) {
      problems.push("active cluegiver must be the actor seat");
    }
    const rotation = TABLE_COMPETITIVE_V1.rules.cluegiverRotation.seatRoleOrder;
    if (
      Number.isInteger(observation?.roundNumber) &&
      observation.roundNumber >= 1 &&
      observation.actor?.seatRole !==
        rotation[(observation.roundNumber - 1) % rotation.length]
    ) {
      problems.push(
        "actor.seatRole must match the protocol cluegiver rotation",
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
    );
    if (
      !Array.isArray(observation?.ownKeywords) ||
      observation.ownKeywords.length !== 4 ||
      !observation.ownKeywords.every(nonEmpty)
    ) {
      problems.push("ownKeywords must contain four non-empty words");
    } else if (
      new Set(
        observation.ownKeywords.map((keyword) =>
          keyword.trim().toLocaleLowerCase("en-US"),
        ),
      ).size !== 4
    ) {
      problems.push("ownKeywords must contain four distinct words");
    }
    problems.push(...codeProblems(observation?.code, "code"));

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
    if (
      Array.isArray(observation?.resolvedRounds) &&
      observation.resolvedRounds.every(
        (round, index) =>
          round?.roundNumber === index + 1 &&
          sideProblems(round?.own, index + 1, "own").length === 0 &&
          sideProblems(round?.opponent, index + 1, "opponent").length === 0,
      )
    ) {
      const expected = historyTokenTotals(observation.resolvedRounds);
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
            ["eventId", "speakerActorId", "speakerTeam", "lane", "text"],
            label,
          ),
        );
        if (!nonEmpty(line?.eventId)) {
          problems.push(`${label}.eventId is required`);
        }
        if (!nonEmpty(line?.speakerActorId)) {
          problems.push(`${label}.speakerActorId is required`);
        }
        if (line?.speakerTeam !== null && !nonEmpty(line?.speakerTeam)) {
          problems.push(`${label}.speakerTeam must be non-empty string|null`);
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
        if (
          line?.lane === "team:own" &&
          line?.speakerTeam !== observation.team
        ) {
          problems.push("own Team transcript requires an own-team speaker");
        }
        if (
          line?.lane === "team:opponent:open" &&
          (line?.speakerTeam === null || line?.speakerTeam === observation.team)
        ) {
          problems.push(
            "opponent Team transcript requires an opposing-team speaker",
          );
        }
        if (eventIds.has(line?.eventId)) {
          problems.push(`duplicate transcript eventId "${line.eventId}"`);
        }
        eventIds.add(line?.eventId);
      });
    }
    assertNoSecretBearingFields(observation, "cluegiver observation");
  } catch (error) {
    problems.push(
      `cluegiver observation validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

export function cluegiverObservationContentHash(
  source: DecryptoCluegiverObservationSource,
): string {
  return contentHash(source);
}

export function mintCluegiverObservation(
  source: DecryptoCluegiverObservationSource,
): DecryptoCluegiverObservation {
  const problems = validateCluegiverObservation(source);
  if (problems.length > 0) {
    throw new Error(`invalid cluegiver observation: ${problems.join("; ")}`);
  }
  const cloned = structuredClone(source);
  return cloneAndDeepFreeze({
    ...cloned,
    contentHash: cluegiverObservationContentHash(cloned),
  });
}

export function verifyCluegiverObservation(
  observation: DecryptoCluegiverObservation,
): boolean {
  try {
    const { contentHash: recorded, ...source } = observation;
    return (
      validateCluegiverObservation(observation).length === 0 &&
      cluegiverObservationContentHash(source) === recorded
    );
  } catch {
    return false;
  }
}

/**
 * Required composition gate before a cluegiver observation may reach a
 * provider or enter research. The observation's opaque build reference is
 * not trusted until it resolves to a verified cluegiver-scoped manifest.
 */
export function validateCluegiverDecisionContext(
  observation:
    | DecryptoCluegiverObservationSource
    | DecryptoCluegiverObservation,
  manifest: BotBuildManifestForDecision,
): string[] {
  const problems = validateCluegiverObservation(observation);
  try {
    problems.push(
      ...validateBotBuildReferenceForDecisionRole({
        role: "cluegiver",
        reference: observation?.identities?.botBuild,
        manifest,
      }),
    );
  } catch (error) {
    problems.push(
      `cluegiver decision context failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}
