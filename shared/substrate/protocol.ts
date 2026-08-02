/**
 * Exact identity for the current Table competitive engine and participant
 * visibility projection. This contract intentionally stops at the
 * decoder/interceptor boundary used by the first shared-runtime slice.
 * Clue-generation legality and bot speech are separate future contracts.
 */
import { contentHash } from "./hash";
import {
  cloneAndDeepFreeze,
  exactKeys,
  sameContentIdentity,
  validateExactContentIdentityRef,
  type ContentIdentityRef,
} from "./identity";

export const COMPETITIVE_PROTOCOL_SCHEMA_VERSION = "0.1";
export const TABLE_COMPETITIVE_PROTOCOL_ID = "table-competitive-v1";

const TERMINAL_COLLISION_PRECEDENCE = [
  "both_intercept_thresholds_draw",
  "both_miscommunication_thresholds_draw",
  "red_intercept_threshold",
  "blue_intercept_threshold",
  "red_miscommunication_threshold_awards_blue",
  "blue_miscommunication_threshold_awards_red",
  "maximum_rounds_tiebreak",
] as const;

export interface TableCompetitiveRules {
  readonly teamCount: 2;
  readonly seatsPerTeam: 3;
  readonly numberedKeywordsPerTeam: 4;
  readonly code: {
    readonly length: 3;
    readonly digitMinimum: 1;
    readonly digitMaximum: 4;
    readonly digitsDistinct: true;
  };
  readonly cluegiverRotation: {
    readonly seatRoleOrder: readonly ["agent_a", "agent_b", "agent_c"];
    readonly selection: "zero_based_round_index_modulo_three";
    readonly symmetricAcrossTeams: true;
  };
  readonly guessGates: {
    readonly roundOneIntercepts: false;
    readonly bothClueSetsBeforeAnyGuess: true;
    readonly bothInterceptsBeforeAnyOwnDecode: true;
    readonly activeCluegiverMayDecode: false;
    readonly activeCluegiverMayIntercept: false;
    readonly laterRoundOrder: readonly [
      "both_clue_sets",
      "both_intercepts",
      "both_own_decodes",
      "resolve",
    ];
  };
  readonly win: {
    readonly interceptTokens: 2;
    readonly miscommunicationTokens: 2;
    readonly maximumRounds: 8;
    readonly terminalCollisionPrecedence: typeof TERMINAL_COLLISION_PRECEDENCE;
    readonly tiebreakOrder: readonly [
      "more_intercepts",
      "fewer_miscommunications",
      "draw",
    ];
  };
}

export interface TableCompetitiveVisibility {
  readonly teamChatSetting: {
    readonly values: readonly ["open", "private"];
    readonly frozenAtGameStart: true;
  };
  readonly lanes: {
    readonly table: {
      readonly semanticName: "Table";
      readonly readableBy: "everyone_including_observers";
    };
    readonly teamOpen: {
      readonly semanticName: "Team";
      readonly readableBy: "everyone_including_observers";
    };
    readonly teamPrivate: {
      readonly semanticName: "Team";
      readonly readableBy: "own_team_seats_only";
    };
  };
}

export interface CompetitiveProtocolSource {
  readonly protocolSchemaVersion: typeof COMPETITIVE_PROTOCOL_SCHEMA_VERSION;
  readonly id: typeof TABLE_COMPETITIVE_PROTOCOL_ID;
  readonly game: "decrypto";
  readonly rules: TableCompetitiveRules;
  readonly visibility: TableCompetitiveVisibility;
}

export interface CompetitiveProtocol extends CompetitiveProtocolSource {
  readonly contentHash: string;
  readonly identities: {
    readonly rules: ContentIdentityRef;
    readonly visibility: ContentIdentityRef;
  };
}

export interface CompetitiveIdentitySet {
  readonly protocol: ContentIdentityRef;
  readonly visibility: ContentIdentityRef;
  readonly rules: ContentIdentityRef;
}

export const TABLE_COMPETITIVE_V1_SOURCE: CompetitiveProtocolSource = {
  protocolSchemaVersion: COMPETITIVE_PROTOCOL_SCHEMA_VERSION,
  id: TABLE_COMPETITIVE_PROTOCOL_ID,
  game: "decrypto",
  rules: {
    teamCount: 2,
    seatsPerTeam: 3,
    numberedKeywordsPerTeam: 4,
    code: {
      length: 3,
      digitMinimum: 1,
      digitMaximum: 4,
      digitsDistinct: true,
    },
    cluegiverRotation: {
      seatRoleOrder: ["agent_a", "agent_b", "agent_c"],
      selection: "zero_based_round_index_modulo_three",
      symmetricAcrossTeams: true,
    },
    guessGates: {
      roundOneIntercepts: false,
      bothClueSetsBeforeAnyGuess: true,
      bothInterceptsBeforeAnyOwnDecode: true,
      activeCluegiverMayDecode: false,
      activeCluegiverMayIntercept: false,
      laterRoundOrder: [
        "both_clue_sets",
        "both_intercepts",
        "both_own_decodes",
        "resolve",
      ],
    },
    win: {
      interceptTokens: 2,
      miscommunicationTokens: 2,
      maximumRounds: 8,
      terminalCollisionPrecedence: TERMINAL_COLLISION_PRECEDENCE,
      tiebreakOrder: [
        "more_intercepts",
        "fewer_miscommunications",
        "draw",
      ],
    },
  },
  visibility: {
    teamChatSetting: {
      values: ["open", "private"],
      frozenAtGameStart: true,
    },
    lanes: {
      table: {
        semanticName: "Table",
        readableBy: "everyone_including_observers",
      },
      teamOpen: {
        semanticName: "Team",
        readableBy: "everyone_including_observers",
      },
      teamPrivate: {
        semanticName: "Team",
        readableBy: "own_team_seats_only",
      },
    },
  },
};

const SOURCE_KEYS = [
  "protocolSchemaVersion",
  "id",
  "game",
  "rules",
  "visibility",
] as const;

function fixedShapeProblems(source: CompetitiveProtocolSource): string[] {
  return [
    ...exactKeys(source, SOURCE_KEYS, "protocol source"),
    ...exactKeys(
      source?.rules,
      [
        "teamCount",
        "seatsPerTeam",
        "numberedKeywordsPerTeam",
        "code",
        "cluegiverRotation",
        "guessGates",
        "win",
      ],
      "rules",
    ),
    ...exactKeys(
      source?.rules?.code,
      ["length", "digitMinimum", "digitMaximum", "digitsDistinct"],
      "rules.code",
    ),
    ...exactKeys(
      source?.rules?.cluegiverRotation,
      ["seatRoleOrder", "selection", "symmetricAcrossTeams"],
      "rules.cluegiverRotation",
    ),
    ...exactKeys(
      source?.rules?.guessGates,
      [
        "roundOneIntercepts",
        "bothClueSetsBeforeAnyGuess",
        "bothInterceptsBeforeAnyOwnDecode",
        "activeCluegiverMayDecode",
        "activeCluegiverMayIntercept",
        "laterRoundOrder",
      ],
      "rules.guessGates",
    ),
    ...exactKeys(
      source?.rules?.win,
      [
        "interceptTokens",
        "miscommunicationTokens",
        "maximumRounds",
        "terminalCollisionPrecedence",
        "tiebreakOrder",
      ],
      "rules.win",
    ),
    ...exactKeys(
      source?.visibility,
      ["teamChatSetting", "lanes"],
      "visibility",
    ),
    ...exactKeys(
      source?.visibility?.teamChatSetting,
      ["values", "frozenAtGameStart"],
      "visibility.teamChatSetting",
    ),
    ...exactKeys(
      source?.visibility?.lanes,
      ["table", "teamOpen", "teamPrivate"],
      "visibility.lanes",
    ),
    ...exactKeys(
      source?.visibility?.lanes?.table,
      ["semanticName", "readableBy"],
      "visibility.lanes.table",
    ),
    ...exactKeys(
      source?.visibility?.lanes?.teamOpen,
      ["semanticName", "readableBy"],
      "visibility.lanes.teamOpen",
    ),
    ...exactKeys(
      source?.visibility?.lanes?.teamPrivate,
      ["semanticName", "readableBy"],
      "visibility.lanes.teamPrivate",
    ),
  ];
}

export function competitiveProtocolContentHash(
  source: CompetitiveProtocolSource,
): string {
  return contentHash(source);
}

export function validateCompetitiveProtocolSource(
  source: CompetitiveProtocolSource,
): string[] {
  const problems: string[] = [];
  try {
    problems.push(...fixedShapeProblems(source));
    if (
      competitiveProtocolContentHash(source) !==
      competitiveProtocolContentHash(TABLE_COMPETITIVE_V1_SOURCE)
    ) {
      problems.push(
        `${TABLE_COMPETITIVE_PROTOCOL_ID} must exactly match the current Table rules and visibility`,
      );
    }
  } catch (error) {
    problems.push(
      `protocol validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

export function mintCompetitiveProtocol(
  source: CompetitiveProtocolSource,
): CompetitiveProtocol {
  const problems = validateCompetitiveProtocolSource(source);
  if (problems.length > 0) {
    throw new Error(`invalid competitive protocol: ${problems.join("; ")}`);
  }
  const cloned = structuredClone(source);
  return cloneAndDeepFreeze({
    ...cloned,
    contentHash: competitiveProtocolContentHash(cloned),
    identities: {
      rules: {
        id: `${cloned.id}/rules`,
        contentHash: contentHash(cloned.rules),
      },
      visibility: {
        id: `${cloned.id}/visibility`,
        contentHash: contentHash(cloned.visibility),
      },
    },
  });
}

export function verifyCompetitiveProtocol(
  protocol: CompetitiveProtocol,
): boolean {
  try {
    const { contentHash: recorded, identities, ...source } = protocol;
    return (
      exactKeys(
        protocol,
        [...SOURCE_KEYS, "contentHash", "identities"],
        "protocol",
      ).length === 0 &&
      exactKeys(identities, ["rules", "visibility"], "protocol.identities")
        .length === 0 &&
      validateExactContentIdentityRef(identities?.rules, "identities.rules")
        .length === 0 &&
      validateExactContentIdentityRef(
        identities?.visibility,
        "identities.visibility",
      ).length === 0 &&
      validateCompetitiveProtocolSource(source).length === 0 &&
      recorded === competitiveProtocolContentHash(source) &&
      identities.rules.id === `${source.id}/rules` &&
      identities.rules.contentHash === contentHash(source.rules) &&
      identities.visibility.id === `${source.id}/visibility` &&
      identities.visibility.contentHash === contentHash(source.visibility)
    );
  } catch {
    return false;
  }
}

export const TABLE_COMPETITIVE_V1 = mintCompetitiveProtocol(
  TABLE_COMPETITIVE_V1_SOURCE,
);

export function tableCompetitiveIdentitySet(): CompetitiveIdentitySet {
  return cloneAndDeepFreeze({
    protocol: {
      id: TABLE_COMPETITIVE_V1.id,
      contentHash: TABLE_COMPETITIVE_V1.contentHash,
    },
    visibility: TABLE_COMPETITIVE_V1.identities.visibility,
    rules: TABLE_COMPETITIVE_V1.identities.rules,
  });
}

/** Fail closed: well-formed but foreign identities are not Table v1. */
export function validateTableCompetitiveIdentities(
  identities: CompetitiveIdentitySet,
  label = "identities",
): string[] {
  const expected = tableCompetitiveIdentitySet();
  const problems = exactKeys(
    identities,
    ["protocol", "visibility", "rules"],
    label,
  );
  for (const key of ["protocol", "visibility", "rules"] as const) {
    problems.push(
      ...validateExactContentIdentityRef(identities?.[key], `${label}.${key}`),
    );
    if (!sameContentIdentity(identities?.[key], expected[key])) {
      problems.push(`${label}.${key} must equal TABLE_COMPETITIVE_V1`);
    }
  }
  return problems;
}
