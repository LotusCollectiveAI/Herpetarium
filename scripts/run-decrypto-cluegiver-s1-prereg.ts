/**
 * Provider-free preregistration and deterministic dry-run manifest for the S1
 * paired cluegiver canary.
 *
 * One cluegiver parent is scheduled in each of 4 positions x 2 arms. Its one
 * clue triple is then shared with three blinded teammate-decoder children and
 * three blinded opponent-interceptor children. This file contains no
 * dispatcher, provider SDK, credential access, database access, retry, or
 * fallback implementation.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOT_BUILD_MANIFEST_VERSION,
  CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  CLUEGIVER_BOT_BUILD_MANIFEST_VERSION,
  CLUEGIVER_OBSERVATION_VERSION,
  CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01,
  CROSS_ROUND_COLUMN_LEAK_2026_08_01,
  CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01,
  DEEPSEEK_V4_FLASH_CANONICAL,
  JOINT_ASSIGNMENT_DECODER_COMPILER_HASH,
  JOINT_ASSIGNMENT_DECODER_COMPILER_ID,
  JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT,
  TABLE_BOT_CLUE_RULES,
  canonicalJson,
  cloneAndDeepFreeze,
  compileJointAssignmentDecoderPrompt,
  contentHash,
  exactKeys,
  mintBotBuildManifest,
  mintCluegiverBotBuildManifest,
  mintCluegiverObservation,
  mintObservationV2,
  mintWireConfig,
  sha256Hex,
  tableCompetitiveIdentitySet,
  validateClueSubmission,
  validateCluegiverDecisionContext,
  validateCodeGuess,
  validateGuessDecisionContext,
  validateJointAssignmentAction,
  verifyBotBuildManifest,
  verifyCluegiverBotBuildManifest,
  verifyCluegiverObservation,
  verifyCompiledJointAssignmentDecoderPrompt,
  verifyObservationV2,
  type BotBuildManifest,
  type BotBuildManifestForDecision,
  type CluegiverBotBuildManifest,
  type CluegiverBotBuildManifestSource,
  type CodeTriple,
  type ContentIdentityRef,
  type DecryptoCluegiverObservation,
  type DecryptoCluegiverObservationSource,
  type DecryptoObservationV2,
  type DecryptoObservationV2Source,
  type RequestedModelRoute,
  type ResolvedSideViewV2,
  type TeamChatVisibility,
  type TeamTokens,
} from "@shared/substrate";
import {
  CLUEGIVER_S1_ACTION_CONTRACT_HASH,
  CLUEGIVER_S1_ACTION_CONTRACT_ID,
  CLUEGIVER_S1_C0_ARM,
  CLUEGIVER_S1_C0_POLICY,
  CLUEGIVER_S1_C0_SOURCE_INSTRUCTION_SHA256,
  CLUEGIVER_S1_C1_ARM,
  CLUEGIVER_S1_COMPILER_ID,
  CLUEGIVER_S1_COMPILER_SPEC_HASH,
  CLUEGIVER_S1_LEDGER_SOURCE,
  CLUEGIVER_S1_NO_EXPLICIT_CANDIDATE_POLICY,
  CLUEGIVER_S1_RESERVED_C2_ARM,
  CLUEGIVER_S1_SOURCE_RANGE_FIXTURE,
  candidateBlockRemovedPromptSha256,
  compileCluegiverS1Prompt,
  composeCluegiverS1Carrier,
  cluegiverS1ProviderPayload,
  type CluegiverS1Arm,
  type CluegiverS1CompilerIdentity,
} from "./lib/decrypto-cluegiver-s1-policies";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIRECTORY, "..");
const FIXTURE_PATH = resolve(
  MODULE_DIRECTORY,
  "fixtures/decrypto-cluegiver-s1-positions-v0.2.json",
);
const SOURCE_RANGE_FIXTURE_PATH = resolve(
  REPOSITORY_ROOT,
  CLUEGIVER_S1_SOURCE_RANGE_FIXTURE.path,
);
const POLICY_IMPLEMENTATION_PATH = resolve(
  MODULE_DIRECTORY,
  "lib/decrypto-cluegiver-s1-policies.ts",
);
const JOINT_ASSIGNMENT_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "shared/substrate/jointAssignmentDecoder.ts",
);
const ACTIONS_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "shared/substrate/actions.ts",
);
const CANDIDATE_POLICY_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "shared/substrate/candidatePolicy.ts",
);
const CLUEGIVER_OBSERVATION_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "shared/substrate/cluegiverObservation.ts",
);
const CLUEGIVER_BUILD_SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "shared/substrate/cluegiverBotBuild.ts",
);

export const CLUEGIVER_S1_FIXTURE_VERSION =
  "decrypto-cluegiver-s1-positions@0.2.0";
export const CLUEGIVER_S1_PREREGISTRATION_VERSION =
  "decrypto-cluegiver-s1-preregistration@0.2.0";
export const CLUEGIVER_S1_BASE_COMMIT =
  "6fe13f87fb97fa0fc27e0c3ef4ea588a92471110";
export const CLUEGIVER_S1_REVIEWED_CONTRACT_COMMIT =
  "86207c58d10eb6ed0deb8830335249f936e11525";
export const CLUEGIVER_S1_REVIEWED_CLUEGIVER_OBSERVATION_SHA256 =
  "d4ff0ba4f6205c6740236b66643ce3e9a58dbd2720094cbd36d07bd1f589a106";
export const CLUEGIVER_S1_REVIEWED_CLUEGIVER_BUILD_SHA256 =
  "fabc173bb5d2533ccbbe90af63dc94b163dff1085691f31f191ca0f597dc5c7f";
export const CLUEGIVER_S1_EXPECTED_JOINT_ASSIGNMENT_SOURCE_SHA256 =
  "d12e079c4dd9fd8e770ec51c74508b7f477d3f32cd4b8aa46ff4ec045517e63e";
export const CLUEGIVER_S1_EXPECTED_ACTIONS_SOURCE_SHA256 =
  "4ddba7a357ebccaf590cdddcf595049ba9f2ed6a4472b00853d6cb43d5c871e1";
export const CLUEGIVER_S1_POSITION_COUNT = 4;
export const CLUEGIVER_S1_ARM_COUNT = 2;
export const CLUEGIVER_S1_CELL_COUNT = 8;
export const CLUEGIVER_S1_ASSESSOR_REPLICATIONS = 3;
export const CLUEGIVER_S1_JOBS_PER_CELL = 7;
export const CLUEGIVER_S1_PLANNED_PROVIDER_CALLS_LATER = 56;
export const CLUEGIVER_S1_PROVIDER_CALLS_THIS_RUN = 0;
export const CLUEGIVER_S1_WARNING_MS = 300_000;
export const CLUEGIVER_S1_HARD_STOP_MS = 600_000;
export const CLUEGIVER_S1_ORDERING_SEED =
  "decrypto-cluegiver-s1-dag-order@2026-08-02.2";

export const CLUEGIVER_S1_ARMS = cloneAndDeepFreeze([
  CLUEGIVER_S1_C0_ARM,
  CLUEGIVER_S1_C1_ARM,
] as const);

export const CLUEGIVER_S1_CLUE_PLACEHOLDERS = cloneAndDeepFreeze([
  "PARENTCLUEONE",
  "PARENTCLUETWO",
  "PARENTCLUETHREE",
] as [string, string, string]);

const EXPECTED_FIXTURE_GENERATION = cloneAndDeepFreeze({
  method:
    "one_shared_production_anchor_plus_three_fixed_experimenter_authored_positions_without_test_model_sampling" as const,
  frozenOn: "2026-08-02" as const,
  independence:
    "all_round_two_focal_codes_and_complete_round_one_histories_fixed_before_any_s1_target_model_dispatch" as const,
  sourceGameDependency:
    "production_anchor_fields_bound_to_shared_cross_round_incident_fixtures" as const,
  productionAnchorCount: 1 as const,
  experimenterAuthoredCount: 3 as const,
  testModelCallsUsedToCreate: 0 as const,
  humanReasoningPathsIncluded: false as const,
  transcriptLinesIncluded: 0 as const,
});

const PRODUCTION_ANCHOR_FIELD_AUTHORITIES = cloneAndDeepFreeze({
  exactSharedFixtureFields: [
    "gameId",
    "focal.team",
    "focal.ownKeywords",
    "focal.code",
    "opponent.team",
    "resolvedRoundOne.own.clues",
    "resolvedRoundOne.own.code",
    "resolvedRoundOne.opponent.clues",
    "resolvedRoundOne.opponent.code",
    "currentOpponent.clues",
    "currentOpponent.code",
    "provenance.humanReasoningPathKnown",
  ],
  outcomeReconstructedFields: [
    "resolvedRoundOne.own.ownDecode",
    "resolvedRoundOne.opponent.ownDecode",
    "resolvedRoundOne.own.intercept",
    "resolvedRoundOne.opponent.intercept",
    "tokens",
  ],
  syntheticScaffoldFields: [
    "positionId",
    "roundNumber",
    "focal.actor",
    "focal.teammateDecoder",
    "opponent.currentCluegiverSeatId",
    "opponent.interceptor",
    "teamChatVisibility",
    "transcript",
  ],
});

const EXPERIMENTER_FIELD_AUTHORITIES = cloneAndDeepFreeze({
  exactSharedFixtureFields: [] as readonly string[],
  outcomeReconstructedFields: [] as readonly string[],
  syntheticScaffoldFields: ["entire_position_except_provenance"],
});

export interface CluegiverS1ResolvedSide {
  readonly clues: [string, string, string];
  readonly code: CodeTriple;
  readonly ownDecode: CodeTriple;
  readonly intercept: null;
}

export interface CluegiverS1Position {
  readonly positionId: string;
  readonly provenance: {
    readonly kind: "shared_production_anchor" | "fixed_experimenter_authored";
    readonly sourceGameId: string | null;
    readonly sourceRefs: readonly ContentIdentityRef[];
    readonly humanReasoningPathKnown: false;
    readonly fieldAuthorities: {
      readonly exactSharedFixtureFields: readonly string[];
      readonly outcomeReconstructedFields: readonly string[];
      readonly syntheticScaffoldFields: readonly string[];
    };
  };
  readonly gameId: string;
  readonly roundNumber: 2;
  readonly focal: {
    readonly team: string;
    readonly actor: {
      readonly actorId: string;
      readonly seatId: string;
      readonly seatRole: "agent_b";
      readonly team: string;
      readonly role: "cluegiver";
    };
    readonly teammateDecoder: {
      readonly actorId: string;
      readonly seatId: string;
      readonly team: string;
      readonly role: "decoder";
    };
    readonly ownKeywords: [string, string, string, string];
    readonly code: CodeTriple;
  };
  readonly opponent: {
    readonly team: string;
    readonly currentCluegiverSeatId: string;
    readonly interceptor: {
      readonly actorId: string;
      readonly seatId: string;
      readonly team: string;
      readonly role: "interceptor";
    };
  };
  readonly resolvedRoundOne: {
    readonly own: CluegiverS1ResolvedSide;
    readonly opponent: CluegiverS1ResolvedSide;
  };
  readonly tokens: {
    readonly own: TeamTokens;
    readonly opponent: TeamTokens;
  };
  readonly currentOpponent: {
    readonly clues: [string, string, string];
    readonly code: CodeTriple;
  };
  readonly teamChatVisibility: TeamChatVisibility;
  readonly transcript: readonly [];
}

export interface CluegiverS1FixtureSource {
  readonly fixtureVersion: typeof CLUEGIVER_S1_FIXTURE_VERSION;
  readonly generation: typeof EXPECTED_FIXTURE_GENERATION;
  readonly positions: readonly CluegiverS1Position[];
}

export interface CluegiverS1Fixture extends CluegiverS1FixtureSource {
  readonly contentHash: string;
}

export interface SourceByteIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface CluegiverS1SourceIdentities {
  readonly exactTable7ddeRange: SourceByteIdentity & {
    readonly extractedInstructionSha256: string;
  };
  readonly experimentCompilerImplementation: SourceByteIdentity;
  readonly jointAssignmentCompilerImplementation: SourceByteIdentity;
  readonly sharedActionsImplementation: SourceByteIdentity;
  readonly sharedCandidatePolicyImplementation: SourceByteIdentity;
  readonly sharedCluegiverObservationImplementation: SourceByteIdentity;
  readonly sharedCluegiverBuildImplementation: SourceByteIdentity;
}

export interface CluegiverS1CompilerBinding extends CluegiverS1CompilerIdentity {
  readonly specHash: string;
  readonly implementationSource: SourceByteIdentity;
  readonly exactSourceRange: SourceByteIdentity & {
    readonly extractedInstructionSha256: string;
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function codeProblems(value: unknown, label: string): string[] {
  return validateCodeGuess(value).map((problem) => `${label}: ${problem}`);
}

function wordsProblems(
  value: unknown,
  expectedLength: 3 | 4,
  label: string,
): string[] {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    return [`${label} must contain exactly ${expectedLength} words`];
  }
  if (
    !value.every(
      (word) =>
        typeof word === "string" && /^[A-Za-z][A-Za-z'-]{0,39}$/.test(word),
    )
  ) {
    return [`${label} must contain bounded single-token game words`];
  }
  return [];
}

function sameCode(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length &&
    left.every((digit, index) => digit === right[index])
  );
}

function resolvedSideProblems(
  value: unknown,
  label: string,
  ownKeywords?: [string, string, string, string],
): string[] {
  const side = recordValue(value);
  const problems = [
    ...exactKeys(side, ["clues", "code", "ownDecode", "intercept"], label),
    ...wordsProblems(side?.clues, 3, `${label}.clues`),
    ...codeProblems(side?.code, `${label}.code`),
    ...codeProblems(side?.ownDecode, `${label}.ownDecode`),
  ];
  if (side?.intercept !== null) {
    problems.push(`${label}.intercept must be null in round 1`);
  }
  if (
    Array.isArray(side?.code) &&
    Array.isArray(side?.ownDecode) &&
    !sameCode(side.code, side.ownDecode)
  ) {
    problems.push(`${label}.ownDecode must equal code in this fixed corpus`);
  }
  if (ownKeywords && wordsProblems(side?.clues, 3, "clues").length === 0) {
    const clueProblems = validateClueSubmission(
      {
        kind: "clues",
        clues: [...(side!.clues as [string, string, string])],
      },
      { ownKeywords, previousOwnClues: [] },
      TABLE_BOT_CLUE_RULES,
    );
    problems.push(...clueProblems.map((problem) => `${label}: ${problem}`));
  }
  return problems;
}

function positionProblems(value: unknown, index: number): string[] {
  const label = `fixture.positions[${index}]`;
  const position = recordValue(value);
  const provenance = recordValue(position?.provenance);
  const focal = recordValue(position?.focal);
  const focalActor = recordValue(focal?.actor);
  const teammate = recordValue(focal?.teammateDecoder);
  const opponent = recordValue(position?.opponent);
  const interceptor = recordValue(opponent?.interceptor);
  const roundOne = recordValue(position?.resolvedRoundOne);
  const tokens = recordValue(position?.tokens);
  const currentOpponent = recordValue(position?.currentOpponent);
  const problems = [
    ...exactKeys(
      position,
      [
        "positionId",
        "provenance",
        "gameId",
        "roundNumber",
        "focal",
        "opponent",
        "resolvedRoundOne",
        "tokens",
        "currentOpponent",
        "teamChatVisibility",
        "transcript",
      ],
      label,
    ),
    ...exactKeys(
      provenance,
      [
        "kind",
        "sourceGameId",
        "sourceRefs",
        "humanReasoningPathKnown",
        "fieldAuthorities",
      ],
      `${label}.provenance`,
    ),
    ...exactKeys(
      recordValue(provenance?.fieldAuthorities),
      [
        "exactSharedFixtureFields",
        "outcomeReconstructedFields",
        "syntheticScaffoldFields",
      ],
      `${label}.provenance.fieldAuthorities`,
    ),
    ...exactKeys(
      focal,
      ["team", "actor", "teammateDecoder", "ownKeywords", "code"],
      `${label}.focal`,
    ),
    ...exactKeys(
      focalActor,
      ["actorId", "seatId", "seatRole", "team", "role"],
      `${label}.focal.actor`,
    ),
    ...exactKeys(
      teammate,
      ["actorId", "seatId", "team", "role"],
      `${label}.focal.teammateDecoder`,
    ),
    ...exactKeys(
      opponent,
      ["team", "currentCluegiverSeatId", "interceptor"],
      `${label}.opponent`,
    ),
    ...exactKeys(
      interceptor,
      ["actorId", "seatId", "team", "role"],
      `${label}.opponent.interceptor`,
    ),
    ...exactKeys(roundOne, ["own", "opponent"], `${label}.resolvedRoundOne`),
    ...exactKeys(tokens, ["own", "opponent"], `${label}.tokens`),
    ...exactKeys(
      recordValue(tokens?.own),
      ["intercepts", "miscommunications"],
      `${label}.tokens.own`,
    ),
    ...exactKeys(
      recordValue(tokens?.opponent),
      ["intercepts", "miscommunications"],
      `${label}.tokens.opponent`,
    ),
    ...exactKeys(
      currentOpponent,
      ["clues", "code"],
      `${label}.currentOpponent`,
    ),
    ...wordsProblems(focal?.ownKeywords, 4, `${label}.focal.ownKeywords`),
    ...codeProblems(focal?.code, `${label}.focal.code`),
    ...resolvedSideProblems(
      roundOne?.own,
      `${label}.resolvedRoundOne.own`,
      focal?.ownKeywords as [string, string, string, string] | undefined,
    ),
    ...resolvedSideProblems(
      roundOne?.opponent,
      `${label}.resolvedRoundOne.opponent`,
    ),
    ...wordsProblems(
      currentOpponent?.clues,
      3,
      `${label}.currentOpponent.clues`,
    ),
    ...codeProblems(currentOpponent?.code, `${label}.currentOpponent.code`),
  ];
  for (const [field, entry] of [
    ["positionId", position?.positionId],
    ["gameId", position?.gameId],
    ["focal.team", focal?.team],
    ["focal.actor.actorId", focalActor?.actorId],
    ["focal.actor.seatId", focalActor?.seatId],
    ["focal.teammateDecoder.actorId", teammate?.actorId],
    ["focal.teammateDecoder.seatId", teammate?.seatId],
    ["opponent.team", opponent?.team],
    ["opponent.currentCluegiverSeatId", opponent?.currentCluegiverSeatId],
    ["opponent.interceptor.actorId", interceptor?.actorId],
    ["opponent.interceptor.seatId", interceptor?.seatId],
  ] as const) {
    if (typeof entry !== "string" || entry.trim() === "") {
      problems.push(`${label}.${field} must be a non-empty string`);
    }
  }
  if (position?.roundNumber !== 2) {
    problems.push(`${label}.roundNumber must be 2`);
  }
  if (focalActor?.seatRole !== "agent_b" || focalActor?.role !== "cluegiver") {
    problems.push(`${label}.focal.actor must be the round-2 agent_b cluegiver`);
  }
  if (
    focalActor?.team !== focal?.team ||
    teammate?.team !== focal?.team ||
    teammate?.role !== "decoder"
  ) {
    problems.push(`${label}.focal actors must share the focal team`);
  }
  if (
    interceptor?.team !== opponent?.team ||
    interceptor?.role !== "interceptor" ||
    focal?.team === opponent?.team
  ) {
    problems.push(`${label}.opponent role/team orientation is invalid`);
  }
  if (
    provenance?.kind !== "shared_production_anchor" &&
    provenance?.kind !== "fixed_experimenter_authored"
  ) {
    problems.push(`${label}.provenance.kind is invalid`);
  }
  if (provenance?.humanReasoningPathKnown !== false) {
    problems.push(`${label} must not invent a human reasoning path`);
  }
  if (
    !Array.isArray(provenance?.sourceRefs) ||
    !provenance.sourceRefs.every(
      (entry) =>
        exactKeys(
          entry,
          ["id", "contentHash"],
          `${label}.provenance.sourceRefs[]`,
        ).length === 0 &&
        typeof recordValue(entry)?.id === "string" &&
        /^[0-9a-f]{64}$/.test(String(recordValue(entry)?.contentHash)),
    )
  ) {
    problems.push(
      `${label}.provenance.sourceRefs must be exact content identities`,
    );
  }
  const expectedAuthorities =
    provenance?.kind === "shared_production_anchor"
      ? PRODUCTION_ANCHOR_FIELD_AUTHORITIES
      : EXPERIMENTER_FIELD_AUTHORITIES;
  if (
    canonicalJson(provenance?.fieldAuthorities) !==
    canonicalJson(expectedAuthorities)
  ) {
    problems.push(
      `${label}.provenance.fieldAuthorities must label exact, reconstructed, and synthetic fields`,
    );
  }
  if (provenance?.kind === "shared_production_anchor") {
    if (
      provenance.sourceGameId !==
        CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.gameId ||
      canonicalJson(provenance.sourceRefs) !==
        canonicalJson([
          {
            id: "CROSS_ROUND_COLUMN_LEAK_2026_08_01",
            contentHash: contentHash(CROSS_ROUND_COLUMN_LEAK_2026_08_01),
          },
          {
            id: "CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01",
            contentHash: contentHash(CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01),
          },
          {
            id: "CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01",
            contentHash: contentHash(
              CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01,
            ),
          },
        ])
    ) {
      problems.push(
        `${label}.provenance must bind the exact named shared fixtures`,
      );
    }
  } else if (
    provenance?.sourceGameId !== null ||
    canonicalJson(provenance?.sourceRefs) !== "[]"
  ) {
    problems.push(
      `${label}.provenance must not imply a production source game`,
    );
  }
  if (
    !Array.isArray(position?.transcript) ||
    position.transcript.length !== 0
  ) {
    problems.push(`${label}.transcript must remain empty`);
  }
  if (
    position?.teamChatVisibility !== "private" &&
    position?.teamChatVisibility !== "open"
  ) {
    problems.push(`${label}.teamChatVisibility must be private|open`);
  }
  if (
    canonicalJson(tokens) !==
    canonicalJson({
      own: { intercepts: 0, miscommunications: 0 },
      opponent: { intercepts: 0, miscommunications: 0 },
    })
  ) {
    problems.push(`${label}.tokens must be derived zero totals after round 1`);
  }
  return problems;
}

function productionAnchorProblems(position: CluegiverS1Position): string[] {
  const red = CROSS_ROUND_COLUMN_LEAK_2026_08_01;
  const blue = CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01;
  const expected = {
    gameId: CROSS_ROUND_PRODUCTION_SMOKE_EVENT_PROVENANCE_2026_08_01.gameId,
    focalTeam: red.team,
    ownKeywords: red.ownKeywords,
    ownClues: red.resolvedRounds[0].clues,
    ownCode: red.resolvedRounds[0].code,
    focalCode: red.leakingRound.code,
    opponentTeam: blue.team,
    opponentClues: blue.resolvedRounds[0].clues,
    opponentCode: blue.resolvedRounds[0].code,
    currentOpponentClues: blue.leakingRound.clues,
    currentOpponentCode: blue.leakingRound.code,
    humanReasoningPathKnown: false,
  };
  const actual = {
    gameId: position.gameId,
    focalTeam: position.focal.team,
    ownKeywords: position.focal.ownKeywords,
    ownClues: position.resolvedRoundOne.own.clues,
    ownCode: position.resolvedRoundOne.own.code,
    focalCode: position.focal.code,
    opponentTeam: position.opponent.team,
    opponentClues: position.resolvedRoundOne.opponent.clues,
    opponentCode: position.resolvedRoundOne.opponent.code,
    currentOpponentClues: position.currentOpponent.clues,
    currentOpponentCode: position.currentOpponent.code,
    humanReasoningPathKnown: position.provenance.humanReasoningPathKnown,
  };
  return canonicalJson(actual) === canonicalJson(expected)
    ? []
    : ["production anchor must exactly match the shared Red and Blue fixtures"];
}

export function validateCluegiverS1Fixture(value: unknown): string[] {
  const fixture = recordValue(value);
  const problems = [
    ...exactKeys(
      fixture,
      ["fixtureVersion", "generation", "positions", "contentHash"],
      "fixture",
    ),
  ];
  if (fixture?.fixtureVersion !== CLUEGIVER_S1_FIXTURE_VERSION) {
    problems.push(
      `fixture.fixtureVersion must be ${CLUEGIVER_S1_FIXTURE_VERSION}`,
    );
  }
  if (
    canonicalJson(fixture?.generation) !==
    canonicalJson(EXPECTED_FIXTURE_GENERATION)
  ) {
    problems.push("fixture generation declaration drifted");
  }
  if (
    !Array.isArray(fixture?.positions) ||
    fixture.positions.length !== CLUEGIVER_S1_POSITION_COUNT
  ) {
    problems.push(
      `fixture must contain exactly ${CLUEGIVER_S1_POSITION_COUNT} positions`,
    );
  } else {
    fixture.positions.forEach((position, index) => {
      problems.push(...positionProblems(position, index));
    });
    const typed = fixture.positions as unknown as CluegiverS1Position[];
    const identifiers = typed.map((position) => position.positionId);
    if (new Set(identifiers).size !== CLUEGIVER_S1_POSITION_COUNT) {
      problems.push("fixture positionId values must be unique");
    }
    if (
      typed.filter(
        (position) => position.provenance.kind === "shared_production_anchor",
      ).length !== 1
    ) {
      problems.push("fixture must contain exactly one production anchor");
    } else {
      problems.push(
        ...productionAnchorProblems(
          typed.find(
            (position) =>
              position.provenance.kind === "shared_production_anchor",
          )!,
        ),
      );
    }
    const teams = typed.map((position) => position.focal.team);
    if (
      teams.filter((team) => team === "red").length !== 2 ||
      teams.filter((team) => team === "blue").length !== 2
    ) {
      problems.push("fixture focal sides must be balanced 2 red / 2 blue");
    }
  }
  if (typeof fixture?.contentHash !== "string") {
    problems.push("fixture.contentHash must be a SHA-256 string");
  } else {
    const withoutHash = Object.fromEntries(
      Object.entries(fixture).filter(([key]) => key !== "contentHash"),
    );
    if (contentHash(withoutHash) !== fixture.contentHash) {
      problems.push("fixture.contentHash does not match its source fields");
    }
  }
  return problems;
}

export async function loadCluegiverS1Fixture(
  path = FIXTURE_PATH,
): Promise<CluegiverS1Fixture> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const problems = validateCluegiverS1Fixture(parsed);
  if (problems.length > 0) {
    throw new Error(`invalid S1 fixture: ${problems.join("; ")}`);
  }
  return cloneAndDeepFreeze(parsed as CluegiverS1Fixture);
}

/**
 * Mechanically extract the array's JavaScript string-literal bytes from the
 * checked-in exact Git source-range fixture. This deliberately rejects escape
 * syntax because the frozen range contains none; an upstream byte change must
 * be reviewed rather than silently interpreted differently.
 */
export function extractTable7ddeInstructionFromSourceRange(
  sourceRangeBytes: string,
): string {
  const literals: string[] = [];
  for (const line of sourceRangeBytes.split("\n")) {
    const trimmed = line.trim();
    const match = /^(["'])(.*)\1,$/.exec(trimmed);
    if (!match) continue;
    const quote = match[1]!;
    const body = match[2]!;
    if (body.includes("\\")) {
      throw new Error("source-range extractor rejects escaped string syntax");
    }
    literals.push(quote === '"' ? (JSON.parse(`"${body}"`) as string) : body);
  }
  if (literals.length !== 44) {
    throw new Error(
      `exact Table source range must contain 44 string literals, received ${literals.length}`,
    );
  }
  return literals.join(" ");
}

function sourceByteIdentity(path: string, bytes: string): SourceByteIdentity {
  return {
    path,
    sha256: sha256Hex(bytes),
    bytes: Buffer.byteLength(bytes, "utf8"),
  };
}

export async function loadCluegiverS1SourceIdentities(): Promise<CluegiverS1SourceIdentities> {
  const [
    sourceRangeBytes,
    experimentCompilerBytes,
    jointAssignmentBytes,
    actionsBytes,
    candidatePolicyBytes,
    cluegiverObservationBytes,
    cluegiverBuildBytes,
  ] = await Promise.all([
    readFile(SOURCE_RANGE_FIXTURE_PATH, "utf8"),
    readFile(POLICY_IMPLEMENTATION_PATH, "utf8"),
    readFile(JOINT_ASSIGNMENT_SOURCE_PATH, "utf8"),
    readFile(ACTIONS_SOURCE_PATH, "utf8"),
    readFile(CANDIDATE_POLICY_SOURCE_PATH, "utf8"),
    readFile(CLUEGIVER_OBSERVATION_SOURCE_PATH, "utf8"),
    readFile(CLUEGIVER_BUILD_SOURCE_PATH, "utf8"),
  ]);
  const extractedInstruction =
    extractTable7ddeInstructionFromSourceRange(sourceRangeBytes);
  const identities = {
    exactTable7ddeRange: {
      ...sourceByteIdentity(
        CLUEGIVER_S1_SOURCE_RANGE_FIXTURE.path,
        sourceRangeBytes,
      ),
      extractedInstructionSha256: sha256Hex(extractedInstruction),
    },
    experimentCompilerImplementation: sourceByteIdentity(
      "scripts/lib/decrypto-cluegiver-s1-policies.ts",
      experimentCompilerBytes,
    ),
    jointAssignmentCompilerImplementation: sourceByteIdentity(
      "shared/substrate/jointAssignmentDecoder.ts",
      jointAssignmentBytes,
    ),
    sharedActionsImplementation: sourceByteIdentity(
      "shared/substrate/actions.ts",
      actionsBytes,
    ),
    sharedCandidatePolicyImplementation: sourceByteIdentity(
      "shared/substrate/candidatePolicy.ts",
      candidatePolicyBytes,
    ),
    sharedCluegiverObservationImplementation: sourceByteIdentity(
      "shared/substrate/cluegiverObservation.ts",
      cluegiverObservationBytes,
    ),
    sharedCluegiverBuildImplementation: sourceByteIdentity(
      "shared/substrate/cluegiverBotBuild.ts",
      cluegiverBuildBytes,
    ),
  };
  if (
    identities.exactTable7ddeRange.sha256 !==
      CLUEGIVER_S1_SOURCE_RANGE_FIXTURE.exactRangeBytesSha256 ||
    identities.exactTable7ddeRange.extractedInstructionSha256 !==
      CLUEGIVER_S1_C0_SOURCE_INSTRUCTION_SHA256 ||
    extractedInstruction !== CLUEGIVER_S1_C0_POLICY.instruction
  ) {
    throw new Error(
      "exact Table 7dde source-range fixture or extracted instruction drifted",
    );
  }
  if (
    identities.jointAssignmentCompilerImplementation.sha256 !==
      CLUEGIVER_S1_EXPECTED_JOINT_ASSIGNMENT_SOURCE_SHA256 ||
    identities.sharedActionsImplementation.sha256 !==
      CLUEGIVER_S1_EXPECTED_ACTIONS_SOURCE_SHA256 ||
    identities.sharedCluegiverObservationImplementation.sha256 !==
      CLUEGIVER_S1_REVIEWED_CLUEGIVER_OBSERVATION_SHA256 ||
    identities.sharedCluegiverBuildImplementation.sha256 !==
      CLUEGIVER_S1_REVIEWED_CLUEGIVER_BUILD_SHA256
  ) {
    throw new Error(
      "reviewed shared assessor/cluegiver contract source bytes drifted",
    );
  }
  return cloneAndDeepFreeze(identities);
}

export function mintCluegiverS1CompilerBinding(
  sources: CluegiverS1SourceIdentities,
): CluegiverS1CompilerBinding {
  const bindingSource = {
    id: CLUEGIVER_S1_COMPILER_ID as typeof CLUEGIVER_S1_COMPILER_ID,
    specHash: CLUEGIVER_S1_COMPILER_SPEC_HASH,
    implementationSource: sources.experimentCompilerImplementation,
    exactSourceRange: sources.exactTable7ddeRange,
  };
  return cloneAndDeepFreeze({
    ...bindingSource,
    contentHash: contentHash(bindingSource),
  });
}

export const CLUEGIVER_S1_ROUTE_PLAN = cloneAndDeepFreeze({
  requestedModel: {
    provider: DEEPSEEK_V4_FLASH_CANONICAL.provider,
    model: DEEPSEEK_V4_FLASH_CANONICAL.model,
    upstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream,
  },
  route: {
    upstreamOrder: ["deepinfra"] as const,
    allowFallbacks: false as const,
    requireParameters: true as const,
    maximumAttempts: 1 as const,
  },
  reasoning: {
    applicationEffort: "xhigh" as const,
    wireEffort: "max" as const,
    mode: "full_strength_async" as const,
  },
  timeout: {
    warningMs: CLUEGIVER_S1_WARNING_MS,
    hardStopMs: CLUEGIVER_S1_HARD_STOP_MS,
    behaviorAtWarning: "record_warning_and_continue" as const,
    behaviorAtHardStop: "record_timeout_no_retry_no_fallback" as const,
  },
});

export const CLUEGIVER_S1_ROUTE_PLAN_HASH = contentHash(
  CLUEGIVER_S1_ROUTE_PLAN,
);

const REQUESTED_WIRE_CONFIG = mintWireConfig({
  id: "openrouter-deepinfra-deepseek-v4-flash-0731-s1@0.1.0",
  parameters: {
    providerOrder: ["deepinfra"],
    allowFallbacks: false,
    requireParameters: true,
    reasoningEffort: "max",
    warningMs: CLUEGIVER_S1_WARNING_MS,
    hardStopMs: CLUEGIVER_S1_HARD_STOP_MS,
    maximumAttempts: 1,
  },
});

const REQUESTED_MODEL_ROUTE: RequestedModelRoute = cloneAndDeepFreeze({
  provider: DEEPSEEK_V4_FLASH_CANONICAL.provider,
  model: DEEPSEEK_V4_FLASH_CANONICAL.model,
  upstream: DEEPSEEK_V4_FLASH_CANONICAL.upstream ?? null,
  aliasEpoch: null,
  reasoning: {
    requestedEffort: "xhigh",
    wireEffort: "max",
  },
  wireConfig: REQUESTED_WIRE_CONFIG,
});

function identity(id: string, payload: unknown): ContentIdentityRef {
  return cloneAndDeepFreeze({ id, contentHash: contentHash(payload) });
}

function implementationIdentity(
  id: string,
  exports: readonly string[],
  sources: readonly SourceByteIdentity[],
): ContentIdentityRef {
  return identity(id, { id, exports, sources });
}

export interface CluegiverS1ImplementationBindings {
  readonly cluegiverPromptCompiler: CluegiverS1CompilerBinding;
  readonly cluegiverActionValidator: ContentIdentityRef;
  readonly jointAssignmentPromptCompilerContract: ContentIdentityRef;
  readonly jointAssignmentPromptCompilerImplementation: ContentIdentityRef;
  readonly jointAssignmentActionValidator: ContentIdentityRef;
  readonly sourceBytes: CluegiverS1SourceIdentities;
}

function implementationBindings(
  sources: CluegiverS1SourceIdentities,
): CluegiverS1ImplementationBindings {
  return cloneAndDeepFreeze({
    cluegiverPromptCompiler: mintCluegiverS1CompilerBinding(sources),
    cluegiverActionValidator: implementationIdentity(
      "cluegiver-s1-action-validator@0.2.0",
      ["validateCluegiverS1Action", "validateClueSubmission"],
      [
        sources.experimentCompilerImplementation,
        sources.sharedActionsImplementation,
      ],
    ),
    jointAssignmentPromptCompilerContract: {
      id: JOINT_ASSIGNMENT_DECODER_COMPILER_ID,
      contentHash: JOINT_ASSIGNMENT_DECODER_COMPILER_HASH,
    },
    jointAssignmentPromptCompilerImplementation: implementationIdentity(
      "joint-assignment-decoder-compiler-implementation@0.1.0",
      [
        "JOINT_ASSIGNMENT_DECODER_SYSTEM_PROMPT",
        "renderTaskPrompt",
        "buildColumnLedger",
        "renderComparisonTargets",
        "compileJointAssignmentDecoderPrompt",
        "verifyCompiledJointAssignmentDecoderPrompt",
      ],
      [sources.jointAssignmentCompilerImplementation],
    ),
    jointAssignmentActionValidator: implementationIdentity(
      "joint-assignment-action-validator@0.1.0",
      ["validateJointAssignmentAction", "validateCodeGuess"],
      [
        sources.jointAssignmentCompilerImplementation,
        sources.sharedActionsImplementation,
      ],
    ),
    sourceBytes: sources,
  });
}

function sharedExecutionIdentities(
  bindings: CluegiverS1ImplementationBindings,
  role: "cluegiver" | "assessor",
) {
  return {
    responseParser: identity(
      role === "cluegiver"
        ? "strict-clue-action-parser@0.1.0"
        : "strict-code-guess-parser@0.1.0",
      {
        role,
        acceptedEnvelope:
          role === "cluegiver"
            ? "exact-rationale-and-three-clues"
            : "exact-code-guess-with-optional-bounded-rationale",
      },
    ),
    actionValidator:
      role === "cluegiver"
        ? bindings.cluegiverActionValidator
        : bindings.jointAssignmentActionValidator,
    providerAdapter: identity("future-openrouter-json-adapter@0.1.0", {
      status: "descriptor_only_no_dispatcher_in_this_scaffold",
      routeHash: CLUEGIVER_S1_ROUTE_PLAN_HASH,
    }),
    orchestrationPolicy: identity("s1-one-attempt-dag-orchestration@0.2.0", {
      maximumAttempts: 1,
      warningMs: CLUEGIVER_S1_WARNING_MS,
      hardStopMs: CLUEGIVER_S1_HARD_STOP_MS,
      dependenciesRequired: true,
    }),
    retryPolicy: identity("s1-no-retry@0.1.0", {
      maximumAttempts: 1,
      retryCount: 0,
    }),
    fallbackPolicy: identity("s1-no-fallback@0.1.0", {
      allowed: false,
      fallbackCount: 0,
    }),
  };
}

function mintAssessorBotBuild(
  bindings: CluegiverS1ImplementationBindings,
): BotBuildManifest {
  const compiledCarrier = identity("joint-assignment-decoder-carrier@0.1.0", {
    compilerContract: bindings.jointAssignmentPromptCompilerContract,
    compilerImplementation:
      bindings.jointAssignmentPromptCompilerImplementation,
    policy: {
      id: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.id,
      contentHash: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.contentHash,
    },
  });
  const manifest = mintBotBuildManifest({
    manifestVersion: BOT_BUILD_MANIFEST_VERSION,
    name: "decrypto-s1-joint-assignment-assessor",
    version: "0.1.0",
    game: "decrypto",
    scope: "decoder",
    strategyArtifact: {
      id: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.id,
      contentHash: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.contentHash,
    },
    compilation: {
      strategyCompiler: bindings.jointAssignmentPromptCompilerContract,
      contextCompiler: bindings.jointAssignmentPromptCompilerImplementation,
      compiledCarrier,
    },
    execution: sharedExecutionIdentities(bindings, "assessor"),
    requestedRoute: REQUESTED_MODEL_ROUTE,
    gameplay: tableCompetitiveIdentitySet(),
    provenance: {
      origin: "provider-free S1 preregistration scaffold",
      mintedAt: "2026-08-02T00:00:00.000Z",
    },
  });
  if (!verifyBotBuildManifest(manifest)) {
    throw new Error("shared decoder/interceptor assessor BotBuild failed");
  }
  return manifest;
}

function mintCluegiverS1BotBuild(
  arm: CluegiverS1Arm,
  bindings: CluegiverS1ImplementationBindings,
): CluegiverBotBuildManifest {
  const name =
    arm === CLUEGIVER_S1_C0_ARM
      ? "decrypto-s1-cluegiver-c0"
      : "decrypto-s1-cluegiver-c1";
  const candidatePolicy =
    arm === CLUEGIVER_S1_C0_ARM
      ? CLUEGIVER_S1_NO_EXPLICIT_CANDIDATE_POLICY
      : CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT;
  const source: CluegiverBotBuildManifestSource = {
    manifestVersion: CLUEGIVER_BOT_BUILD_MANIFEST_VERSION,
    name,
    version: "0.1.0" as const,
    game: "decrypto" as const,
    scope: "cluegiver" as const,
    strategyArtifact: {
      id: CLUEGIVER_S1_C0_POLICY.id,
      contentHash: CLUEGIVER_S1_C0_POLICY.contentHash,
    },
    compilation: {
      strategyCompiler: {
        id: CLUEGIVER_S1_C0_POLICY.id,
        contentHash: CLUEGIVER_S1_C0_POLICY.contentHash,
      },
      contextCompiler: {
        id: bindings.cluegiverPromptCompiler.id,
        contentHash: bindings.cluegiverPromptCompiler.contentHash,
      },
      candidatePolicy: {
        id: candidatePolicy.id,
        contentHash: candidatePolicy.contentHash,
      },
      actionContract: {
        id: CLUEGIVER_S1_ACTION_CONTRACT_ID,
        contentHash: CLUEGIVER_S1_ACTION_CONTRACT_HASH,
      },
      promptAssembler: implementationIdentity(
        "shared-candidate-policy-task-composer@0.1.0",
        ["composeCandidatePolicyTaskInstruction"],
        [bindings.sourceBytes.sharedCandidatePolicyImplementation],
      ),
      compiledCarrier: identity(
        arm === CLUEGIVER_S1_C0_ARM
          ? "cluegiver-s1-c0-carrier@0.2.0"
          : "cluegiver-s1-c1-carrier@0.2.0",
        { arm, carrier: composeCluegiverS1Carrier(arm) },
      ),
    },
    execution: sharedExecutionIdentities(bindings, "cluegiver"),
    requestedRoute: REQUESTED_MODEL_ROUTE,
    gameplay: tableCompetitiveIdentitySet(),
    provenance: {
      origin:
        "provider-free S1 preregistration with shared cluegiver contracts",
      mintedAt: "2026-08-02T00:00:00.000Z",
    },
  };
  const manifest = mintCluegiverBotBuildManifest(source);
  if (!verifyCluegiverBotBuildManifest(manifest)) {
    throw new Error(`${arm} shared cluegiver BotBuild failed verification`);
  }
  return manifest;
}

function resolvedCluegiverSide(
  side: CluegiverS1ResolvedSide,
): CluegiverS1ResolvedSide {
  return {
    clues: [...side.clues] as [string, string, string],
    code: [...side.code] as CodeTriple,
    ownDecode: [...side.ownDecode] as CodeTriple,
    intercept: null,
  };
}

function mintCluegiverS1Observation(
  position: CluegiverS1Position,
  build: CluegiverBotBuildManifest,
): DecryptoCluegiverObservation {
  const source: DecryptoCluegiverObservationSource = {
    observationVersion: CLUEGIVER_OBSERVATION_VERSION,
    decisionId: `s1-cluegiver:${position.positionId}`,
    logicalActionKey: `s1-clue-action:${position.positionId}:round-2`,
    gameId: position.gameId,
    roundNumber: 2 as const,
    actor: { ...position.focal.actor },
    activeCluegiverSeatId: position.focal.actor.seatId,
    identities: {
      botBuild: { id: build.id, contentHash: build.contentHash },
      ...tableCompetitiveIdentitySet(),
    },
    role: "cluegiver" as const,
    team: position.focal.team,
    ownKeywords: [...position.focal.ownKeywords] as [
      string,
      string,
      string,
      string,
    ],
    code: [...position.focal.code] as CodeTriple,
    resolvedRounds: [
      {
        roundNumber: 1 as const,
        own: resolvedCluegiverSide(position.resolvedRoundOne.own),
        opponent: resolvedCluegiverSide(position.resolvedRoundOne.opponent),
      },
    ] as const,
    tokens: structuredClone(position.tokens),
    teamChatVisibility: position.teamChatVisibility,
    decisionFocus:
      "Choose three legal strategic clues for the live round-two code.",
    transcript: [] as const,
  };
  const observation = mintCluegiverObservation(source);
  if (!verifyCluegiverObservation(observation)) {
    throw new Error(
      `${observation.decisionId} shared cluegiver observation failed verification`,
    );
  }
  const contextProblems = validateCluegiverDecisionContext(observation, build);
  if (contextProblems.length > 0) {
    throw new Error(
      `${observation.decisionId} cluegiver decision context failed: ${contextProblems.join("; ")}`,
    );
  }
  return observation;
}

function resolvedAssessorSide(
  side: CluegiverS1ResolvedSide,
): ResolvedSideViewV2 {
  return {
    clues: [...side.clues] as [string, string, string],
    code: [...side.code] as CodeTriple,
    ownDecode: [...side.ownDecode] as CodeTriple,
    intercept: null,
    decodedCorrectly: sameCode(side.code, side.ownDecode),
    wasIntercepted: null,
  };
}

function assessorMatchedPositionKey(position: CluegiverS1Position): string {
  return sha256Hex(
    `${CLUEGIVER_S1_ORDERING_SEED}\u0000matched-assessor\u0000${position.positionId}`,
  ).slice(0, 20);
}

function mintAssessorObservationTemplate(input: {
  readonly position: CluegiverS1Position;
  readonly arm: CluegiverS1Arm;
  readonly role: "decoder" | "interceptor";
  readonly replication: 1 | 2 | 3;
  readonly assessorBuild: BotBuildManifest;
}): DecryptoObservationV2 {
  const { position, role, replication, assessorBuild } = input;
  const matchedPosition = assessorMatchedPositionKey(position);
  const decisionId = `s1-assess:${matchedPosition}:${role}:${replication}`;
  const ownOrientation = role === "decoder";
  const source: DecryptoObservationV2Source = {
    observationVersion: "0.2",
    decisionId,
    logicalActionKey: `${decisionId}:one-attempt`,
    gameId: position.gameId,
    roundNumber: 2,
    actor: ownOrientation
      ? { ...position.focal.teammateDecoder }
      : { ...position.opponent.interceptor },
    activeCluegiverSeatId: ownOrientation
      ? position.focal.actor.seatId
      : position.opponent.currentCluegiverSeatId,
    identities: {
      botBuild: {
        id: assessorBuild.id,
        contentHash: assessorBuild.contentHash,
      },
      ...tableCompetitiveIdentitySet(),
    },
    role,
    team: ownOrientation ? position.focal.team : position.opponent.team,
    ownKeywords: ownOrientation
      ? ([...position.focal.ownKeywords] as [string, string, string, string])
      : null,
    ownClues: ownOrientation
      ? [...CLUEGIVER_S1_CLUE_PLACEHOLDERS]
      : [...position.currentOpponent.clues],
    opponentClues: ownOrientation
      ? [...position.currentOpponent.clues]
      : [...CLUEGIVER_S1_CLUE_PLACEHOLDERS],
    resolvedRounds: [
      {
        roundNumber: 1,
        own: resolvedAssessorSide(
          ownOrientation
            ? position.resolvedRoundOne.own
            : position.resolvedRoundOne.opponent,
        ),
        opponent: resolvedAssessorSide(
          ownOrientation
            ? position.resolvedRoundOne.opponent
            : position.resolvedRoundOne.own,
        ),
      },
    ],
    tokens: ownOrientation
      ? structuredClone(position.tokens)
      : {
          own: structuredClone(position.tokens.opponent),
          opponent: structuredClone(position.tokens.own),
        },
    teamChatVisibility: position.teamChatVisibility,
    decisionFocus:
      role === "decoder"
        ? "Map the three current own clues to one legal distinct three-digit code."
        : "Map the three current opponent clues to one legal distinct three-digit interception.",
    transcript: [],
  };
  const observation = mintObservationV2(source);
  if (!verifyObservationV2(observation)) {
    throw new Error(`${decisionId} observation template failed verification`);
  }
  const contextProblems = validateGuessDecisionContext(
    observation,
    assessorBuild,
  );
  if (contextProblems.length > 0) {
    throw new Error(
      `${decisionId} guess decision context failed: ${contextProblems.join("; ")}`,
    );
  }
  return observation;
}

export function compileCluegiverS1AssessorPrompt(
  observation: DecryptoObservationV2,
  assessorBuild: BotBuildManifestForDecision,
) {
  const contextProblems = validateGuessDecisionContext(
    observation,
    assessorBuild,
  );
  if (contextProblems.length > 0) {
    throw new Error(
      `invalid S1 guess decision context: ${contextProblems.join("; ")}`,
    );
  }
  const compiled = compileJointAssignmentDecoderPrompt(observation);
  if (!verifyCompiledJointAssignmentDecoderPrompt(compiled, observation)) {
    throw new Error(
      `${observation.decisionId} joint-assignment prompt failed verification`,
    );
  }
  return compiled;
}

export function materializeAssessorObservationFromParentAction(
  template: DecryptoObservationV2,
  parentAction: unknown,
  assessorBuild: BotBuildManifestForDecision,
): DecryptoObservationV2 {
  const templateContextProblems = validateGuessDecisionContext(
    template,
    assessorBuild,
  );
  if (templateContextProblems.length > 0) {
    throw new Error(
      `cannot materialize invalid S1 guess decision context: ${templateContextProblems.join("; ")}`,
    );
  }
  const record = recordValue(parentAction);
  if (
    !Array.isArray(record?.clues) ||
    record.clues.length !== 3 ||
    !record.clues.every((clue) => typeof clue === "string")
  ) {
    throw new Error("parent action must expose exactly one three-clue array");
  }
  const clues = [...record.clues] as [string, string, string];
  const { contentHash: _discardedHash, ...source } = template;
  const materialized: DecryptoObservationV2Source = {
    ...source,
    ownClues: template.role === "decoder" ? clues : [...template.ownClues],
    opponentClues:
      template.role === "interceptor" ? clues : [...template.opponentClues],
  };
  const observation = mintObservationV2(materialized);
  const materializedContextProblems = validateGuessDecisionContext(
    observation,
    assessorBuild,
  );
  if (materializedContextProblems.length > 0) {
    throw new Error(
      `materialized S1 guess decision context failed: ${materializedContextProblems.join("; ")}`,
    );
  }
  return observation;
}

export function historyStrataForPosition(
  position: CluegiverS1Position,
): readonly ("history_bearing" | "history_free")[] {
  const prior = new Set(position.resolvedRoundOne.own.code);
  return position.focal.code.map((digit) =>
    prior.has(digit) ? "history_bearing" : "history_free",
  );
}

/** ECMAScript relational string comparison: UTF-16 code-unit order. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const CLUEGIVER_S1_OUTCOME_SPEC = cloneAndDeepFreeze({
  statusInThisScaffold: "schema_only_no_outcomes_collected" as const,
  independentUnit: "position" as const,
  matchedCellMetrics: {
    decodeRate: "mean_of_three_teammate_decoder_exact_code_indicators",
    interceptRate: "mean_of_three_opponent_interceptor_exact_code_indicators",
    net: "decodeRate_minus_interceptRate",
  },
  descriptivePairedContrast: {
    contrast: "C1_minus_C0",
    unit: "position",
    inferentialTest: null,
    promotionDecision: null,
  },
  interceptorSlotDescription: {
    outcome: "per_slot_correct",
    strata: ["history_bearing", "history_free"] as const,
    stratumAuthority:
      "focal_round_two_code_digit_membership_in_focal_resolved_round_one_code",
  },
  teammateDecodeGuardrail: {
    minimumAbsoluteC1DecodeRate: 0.75 as const,
    maximumC1DecodeRateDeficitVersusC0: 0.1 as const,
    bothConditionsRequired: true as const,
  },
  assessorReplication: {
    replicationsPerRolePerCell: 3 as const,
    clustering:
      "three assessor calls share one clue set and are not independent units",
  },
  mechanismCanaryLimitations: {
    positionCount: 4 as const,
    notBalancedForEfficacy: true as const,
    focalCodeDigitCounts: {
      digit1: 2 as const,
      digit2: 3 as const,
      digit3: 3 as const,
      digit4: 4 as const,
    },
    historyStratumSlotCounts: {
      slot1: { historyBearing: 2 as const, historyFree: 2 as const },
      slot2: { historyBearing: 3 as const, historyFree: 1 as const },
      slot3: { historyBearing: 4 as const, historyFree: 0 as const },
      overall: { historyBearing: 9 as const, historyFree: 3 as const },
    },
    interpretation:
      "digit, slot, and history-stratum imbalance precludes efficacy inference",
  },
  interpretation: {
    descriptiveOnly: true as const,
    inference: "forbidden" as const,
    promotion: "forbidden" as const,
    strengthClaim: "forbidden" as const,
  },
});

export const CLUEGIVER_S1_CLAIMS = cloneAndDeepFreeze({
  efficacy: "none" as const,
  strategicStrength: "none" as const,
  providerResult: "none" as const,
  productionPromptParity: "not_claimed" as const,
  historicalProductionBaseline: "not_claimed" as const,
  c0ComparisonStatus: "not_claimed_synthetic_recombination" as const,
  purpose: "provider_free_preregistration_and_dag_smoke_only" as const,
});

interface JobExecutionPlan {
  readonly status: "planned_unlicensed";
  readonly providerDispatches: 0;
  readonly outcome: null;
  readonly maximumAttempts: 1;
  readonly retries: 0;
  readonly fallbacks: 0;
  readonly warningMs: 300000;
  readonly hardStopMs: 600000;
}

interface BaseDryRunJob {
  readonly ordinal: number;
  readonly cellOrdinal: number;
  readonly jobId: string;
  readonly cellId: string;
  readonly positionId: string;
  readonly arm: CluegiverS1Arm;
  readonly dependencies: readonly string[];
  readonly route: typeof CLUEGIVER_S1_ROUTE_PLAN;
  readonly execution: JobExecutionPlan;
}

export interface CluegiverS1ParentJob extends BaseDryRunJob {
  readonly role: "cluegiver";
  readonly assessorReplication: null;
  readonly promptCompiler: ContentIdentityRef;
  readonly actionContract: ContentIdentityRef;
  readonly actionValidator: ContentIdentityRef;
  readonly observation: DecryptoCluegiverObservation;
  readonly compiledPrompt: {
    readonly id: string;
    readonly contentHash: string;
    readonly systemPromptSha256: string;
    readonly userPromptSha256: string;
    readonly candidateBlockRemovedUserPromptSha256: string;
  };
  readonly outputContract: {
    readonly publishToChildren: "clues_only";
    readonly rationaleVisibility: "parent_private_never_downstream";
  };
}

export interface CluegiverS1AssessorJob extends BaseDryRunJob {
  readonly role: "teammate_decoder" | "opponent_interceptor";
  readonly assessorReplication: 1 | 2 | 3;
  readonly parentJobId: string;
  readonly promptCompiler: {
    readonly contract: ContentIdentityRef;
    readonly implementation: ContentIdentityRef;
  };
  readonly actionContract: ContentIdentityRef;
  readonly actionValidator: ContentIdentityRef;
  readonly policy: ContentIdentityRef;
  readonly blindedInput: {
    readonly observationTemplate: DecryptoObservationV2;
    readonly cluePlaceholders: readonly [string, string, string];
    readonly parentOutputProjection: {
      readonly sourceJobId: string;
      readonly include: readonly ["clues"];
      readonly exclude: readonly ["rationale"];
      readonly materializer: "materializeAssessorObservationFromParentAction";
      readonly requiredBotBuildManifest: ContentIdentityRef;
    };
  };
  readonly compiledPromptTemplate: {
    readonly id: string;
    readonly contentHash: string;
    readonly systemPromptSha256: string;
    readonly taskPromptSha256: string;
    readonly actionContractSha256: string;
  };
}

export type CluegiverS1DryRunJob =
  | CluegiverS1ParentJob
  | CluegiverS1AssessorJob;

export interface CluegiverS1DryRunCell {
  readonly ordinal: number;
  readonly cellId: string;
  readonly orderingKey: string;
  readonly positionId: string;
  readonly positionHash: string;
  readonly arm: CluegiverS1Arm;
  readonly historyStrata: readonly ("history_bearing" | "history_free")[];
  readonly parentJobId: string;
  readonly teammateDecoderJobIds: readonly [string, string, string];
  readonly opponentInterceptorJobIds: readonly [string, string, string];
  readonly jobCount: 7;
}

export interface CluegiverS1Preregistration {
  readonly preregistrationVersion: typeof CLUEGIVER_S1_PREREGISTRATION_VERSION;
  readonly status: "provider_free_shared_contracts_satisfied";
  readonly baseCommit: typeof CLUEGIVER_S1_BASE_COMMIT;
  readonly integrationGate: {
    readonly status: "satisfied_at_reviewed_integration_head";
    readonly reviewedIntegrationHead: typeof CLUEGIVER_S1_BASE_COMMIT;
    readonly reviewedContractCommit: typeof CLUEGIVER_S1_REVIEWED_CONTRACT_COMMIT;
    readonly reviewedObservationContract: {
      readonly version: "cluegiver-0.1";
      readonly sourceSha256: typeof CLUEGIVER_S1_REVIEWED_CLUEGIVER_OBSERVATION_SHA256;
      readonly adoption: "actual_shared_mint_verify";
    };
    readonly reviewedBuildContract: {
      readonly version: "cluegiver-0.1";
      readonly sourceSha256: typeof CLUEGIVER_S1_REVIEWED_CLUEGIVER_BUILD_SHA256;
      readonly adoption: "actual_shared_mint_verify";
    };
    readonly registryAwareCompilationGates: {
      readonly cluegiver: "load_bearing_before_every_cluegiver_compilation";
      readonly guess: "load_bearing_before_every_guess_compilation_and_materialization";
    };
  };
  readonly fixture: {
    readonly version: typeof CLUEGIVER_S1_FIXTURE_VERSION;
    readonly contentHash: string;
    readonly positionCount: 4;
    readonly productionAnchorCount: 1;
    readonly sideBalance: "2_red_2_blue";
  };
  readonly treatment: {
    readonly c0: {
      readonly arm: typeof CLUEGIVER_S1_C0_ARM;
      readonly policy: ContentIdentityRef;
      readonly comparisonStatus: "not_claimed_synthetic_recombination";
    };
    readonly c1: {
      readonly arm: typeof CLUEGIVER_S1_C1_ARM;
      readonly candidatePolicy: ContentIdentityRef;
      readonly comparison: "full_explicit_four_check_package_over_implicit_old_instruction";
    };
    readonly reservedC2: {
      readonly arm: typeof CLUEGIVER_S1_RESERVED_C2_ARM;
      readonly scheduledJobs: 0;
      readonly futureContrast: "only_future_C1_minus_C2_may_isolate_item_4";
    };
  };
  readonly implementationBindings: CluegiverS1ImplementationBindings;
  readonly botBuilds: {
    readonly assessor: BotBuildManifest;
    readonly cluegiverByArm: Readonly<
      Record<CluegiverS1Arm, CluegiverBotBuildManifest>
    >;
  };
  readonly route: typeof CLUEGIVER_S1_ROUTE_PLAN;
  readonly execution: {
    readonly mode: "dry_run";
    readonly providerDispatch: "forbidden";
    readonly databaseAccess: "forbidden";
    readonly networkAccess: "forbidden";
    readonly providerCallsThisRun: 0;
    readonly plannedProviderCallsAfterReview: 56;
    readonly maximumAttemptsPerJob: 1;
    readonly retries: 0;
    readonly fallbacks: 0;
    readonly providerCallLicense: "unlicensed";
  };
  readonly dag: {
    readonly independentUnit: "position";
    readonly cellCount: 8;
    readonly jobsPerCell: 7;
    readonly cluegiverParentsPerCell: 1;
    readonly teammateDecoderChildrenPerCell: 3;
    readonly opponentInterceptorChildrenPerCell: 3;
    readonly ordering: "sha256_rank_then_utf16_code_unit_order";
    readonly cells: readonly CluegiverS1DryRunCell[];
    readonly jobs: readonly CluegiverS1DryRunJob[];
  };
  readonly outcomeSpec: typeof CLUEGIVER_S1_OUTCOME_SPEC;
  readonly claims: typeof CLUEGIVER_S1_CLAIMS;
  readonly invariants: {
    readonly oneCluegiverParentPerCell: true;
    readonly allSixAssessorsShareParentClueTriple: true;
    readonly parentRationaleVisibleDownstream: false;
    readonly childObservationTemplatesVerify: true;
    readonly sharedAssessorPolicyCompilerAndValidator: true;
    readonly sharedRegistryAwareDecisionContexts: true;
    readonly providerInvocations: 0;
    readonly c2Jobs: 0;
  };
  readonly preregistrationContentHash: string;
}

const JOB_EXECUTION_PLAN = cloneAndDeepFreeze({
  status: "planned_unlicensed" as const,
  providerDispatches: 0 as const,
  outcome: null,
  maximumAttempts: 1 as const,
  retries: 0 as const,
  fallbacks: 0 as const,
  warningMs: 300_000 as const,
  hardStopMs: 600_000 as const,
});

function makeCellOrderingKey(positionId: string, arm: CluegiverS1Arm): string {
  return sha256Hex(
    `${CLUEGIVER_S1_ORDERING_SEED}\u0000${positionId}\u0000${arm}`,
  );
}

function assessorJobId(
  parentJobId: string,
  role: "decoder" | "interceptor",
  replication: 1 | 2 | 3,
): string {
  return `${parentJobId}:${role}:${replication}`;
}

function buildCell(input: {
  readonly cellOrdinal: number;
  readonly position: CluegiverS1Position;
  readonly arm: CluegiverS1Arm;
  readonly bindings: CluegiverS1ImplementationBindings;
  readonly cluegiverBuild: CluegiverBotBuildManifest;
  readonly assessorBuild: BotBuildManifest;
}): {
  readonly cell: CluegiverS1DryRunCell;
  readonly jobs: readonly CluegiverS1DryRunJob[];
} {
  const {
    cellOrdinal,
    position,
    arm,
    bindings,
    cluegiverBuild,
    assessorBuild,
  } = input;
  const orderingKey = makeCellOrderingKey(position.positionId, arm);
  const cellId = `s1-cell:${orderingKey.slice(0, 20)}`;
  const parentJobId = `${cellId}:cluegiver`;
  const cluegiverObservation = mintCluegiverS1Observation(
    position,
    cluegiverBuild,
  );
  const compiledParent = compileCluegiverS1Prompt({
    observation: cluegiverObservation,
    botBuild: cluegiverBuild,
    arm,
    compiler: bindings.cluegiverPromptCompiler,
  });
  const parentPayload = cluegiverS1ProviderPayload(compiledParent);
  const parent: CluegiverS1ParentJob = {
    ordinal: 0,
    cellOrdinal,
    jobId: parentJobId,
    cellId,
    positionId: position.positionId,
    arm,
    dependencies: [],
    route: CLUEGIVER_S1_ROUTE_PLAN,
    execution: JOB_EXECUTION_PLAN,
    role: "cluegiver",
    assessorReplication: null,
    promptCompiler: {
      id: bindings.cluegiverPromptCompiler.id,
      contentHash: bindings.cluegiverPromptCompiler.contentHash,
    },
    actionContract: {
      id: CLUEGIVER_S1_ACTION_CONTRACT_ID,
      contentHash: CLUEGIVER_S1_ACTION_CONTRACT_HASH,
    },
    actionValidator: bindings.cluegiverActionValidator,
    observation: cluegiverObservation,
    compiledPrompt: {
      id: compiledParent.carrier.id,
      contentHash: compiledParent.contentHash,
      systemPromptSha256: sha256Hex(parentPayload.systemPrompt),
      userPromptSha256: sha256Hex(parentPayload.userPrompt),
      candidateBlockRemovedUserPromptSha256:
        candidateBlockRemovedPromptSha256(compiledParent),
    },
    outputContract: {
      publishToChildren: "clues_only",
      rationaleVisibility: "parent_private_never_downstream",
    },
  };
  const children: CluegiverS1AssessorJob[] = [];
  for (const role of ["decoder", "interceptor"] as const) {
    for (
      let replication = 1;
      replication <= CLUEGIVER_S1_ASSESSOR_REPLICATIONS;
      replication += 1
    ) {
      const typedReplication = replication as 1 | 2 | 3;
      const observation = mintAssessorObservationTemplate({
        position,
        arm,
        role,
        replication: typedReplication,
        assessorBuild,
      });
      const compiled = compileCluegiverS1AssessorPrompt(
        observation,
        assessorBuild,
      );
      const jobId = assessorJobId(parentJobId, role, typedReplication);
      children.push({
        ordinal: 0,
        cellOrdinal,
        jobId,
        cellId,
        positionId: position.positionId,
        arm,
        dependencies: [parentJobId],
        route: CLUEGIVER_S1_ROUTE_PLAN,
        execution: JOB_EXECUTION_PLAN,
        role: role === "decoder" ? "teammate_decoder" : "opponent_interceptor",
        assessorReplication: typedReplication,
        parentJobId,
        promptCompiler: {
          contract: bindings.jointAssignmentPromptCompilerContract,
          implementation: bindings.jointAssignmentPromptCompilerImplementation,
        },
        actionContract: identity(
          `joint-assignment-${role}-action-contract@0.1.0`,
          compiled.actionContract,
        ),
        actionValidator: bindings.jointAssignmentActionValidator,
        policy: {
          id: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.id,
          contentHash: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT.contentHash,
        },
        blindedInput: {
          observationTemplate: observation,
          cluePlaceholders: CLUEGIVER_S1_CLUE_PLACEHOLDERS,
          parentOutputProjection: {
            sourceJobId: parentJobId,
            include: ["clues"],
            exclude: ["rationale"],
            materializer: "materializeAssessorObservationFromParentAction",
            requiredBotBuildManifest: {
              id: assessorBuild.id,
              contentHash: assessorBuild.contentHash,
            },
          },
        },
        compiledPromptTemplate: {
          id: `compiled:${observation.decisionId}`,
          contentHash: compiled.contentHash,
          systemPromptSha256: sha256Hex(compiled.systemPrompt),
          taskPromptSha256: sha256Hex(compiled.taskPrompt),
          actionContractSha256: sha256Hex(compiled.actionContract),
        },
      });
    }
  }
  const jobs = [parent, ...children].map((job, index) => ({
    ...job,
    ordinal: (cellOrdinal - 1) * CLUEGIVER_S1_JOBS_PER_CELL + index + 1,
  })) as CluegiverS1DryRunJob[];
  const decoderIds = children
    .filter((job) => job.role === "teammate_decoder")
    .map((job) => job.jobId) as [string, string, string];
  const interceptorIds = children
    .filter((job) => job.role === "opponent_interceptor")
    .map((job) => job.jobId) as [string, string, string];
  return {
    cell: {
      ordinal: cellOrdinal,
      cellId,
      orderingKey,
      positionId: position.positionId,
      positionHash: contentHash(position),
      arm,
      historyStrata: historyStrataForPosition(position),
      parentJobId,
      teammateDecoderJobIds: decoderIds,
      opponentInterceptorJobIds: interceptorIds,
      jobCount: 7,
    },
    jobs,
  };
}

export async function buildCluegiverS1Preregistration(
  fixture: CluegiverS1Fixture,
  suppliedSources?: CluegiverS1SourceIdentities,
): Promise<CluegiverS1Preregistration> {
  const fixtureProblems = validateCluegiverS1Fixture(fixture);
  if (fixtureProblems.length > 0) {
    throw new Error(
      `cannot preregister invalid S1 fixture: ${fixtureProblems.join("; ")}`,
    );
  }
  const sources = suppliedSources ?? (await loadCluegiverS1SourceIdentities());
  const bindings = implementationBindings(sources);
  const assessorBuild = mintAssessorBotBuild(bindings);
  const cluegiverByArm = {
    [CLUEGIVER_S1_C0_ARM]: mintCluegiverS1BotBuild(
      CLUEGIVER_S1_C0_ARM,
      bindings,
    ),
    [CLUEGIVER_S1_C1_ARM]: mintCluegiverS1BotBuild(
      CLUEGIVER_S1_C1_ARM,
      bindings,
    ),
  } as const;
  const unordered = fixture.positions.flatMap((position) =>
    CLUEGIVER_S1_ARMS.map((arm) => ({
      position,
      arm,
      orderingKey: makeCellOrderingKey(position.positionId, arm),
    })),
  );
  unordered.sort((left, right) =>
    compareCodeUnits(left.orderingKey, right.orderingKey),
  );
  const built = unordered.map((entry, index) =>
    buildCell({
      cellOrdinal: index + 1,
      position: entry.position,
      arm: entry.arm,
      bindings,
      cluegiverBuild: cluegiverByArm[entry.arm],
      assessorBuild,
    }),
  );
  const cells = built.map((entry) => entry.cell);
  const jobs = built.flatMap((entry) => entry.jobs);
  if (
    cells.length !== CLUEGIVER_S1_CELL_COUNT ||
    jobs.length !== CLUEGIVER_S1_PLANNED_PROVIDER_CALLS_LATER
  ) {
    throw new Error("S1 fixed DAG cardinality drifted");
  }
  const source: Omit<CluegiverS1Preregistration, "preregistrationContentHash"> =
    {
      preregistrationVersion:
        CLUEGIVER_S1_PREREGISTRATION_VERSION as typeof CLUEGIVER_S1_PREREGISTRATION_VERSION,
      status: "provider_free_shared_contracts_satisfied" as const,
      baseCommit: CLUEGIVER_S1_BASE_COMMIT as typeof CLUEGIVER_S1_BASE_COMMIT,
      integrationGate: {
        status: "satisfied_at_reviewed_integration_head" as const,
        reviewedIntegrationHead:
          CLUEGIVER_S1_BASE_COMMIT as typeof CLUEGIVER_S1_BASE_COMMIT,
        reviewedContractCommit:
          CLUEGIVER_S1_REVIEWED_CONTRACT_COMMIT as typeof CLUEGIVER_S1_REVIEWED_CONTRACT_COMMIT,
        reviewedObservationContract: {
          version: "cluegiver-0.1" as const,
          sourceSha256:
            CLUEGIVER_S1_REVIEWED_CLUEGIVER_OBSERVATION_SHA256 as typeof CLUEGIVER_S1_REVIEWED_CLUEGIVER_OBSERVATION_SHA256,
          adoption: "actual_shared_mint_verify" as const,
        },
        reviewedBuildContract: {
          version: "cluegiver-0.1" as const,
          sourceSha256:
            CLUEGIVER_S1_REVIEWED_CLUEGIVER_BUILD_SHA256 as typeof CLUEGIVER_S1_REVIEWED_CLUEGIVER_BUILD_SHA256,
          adoption: "actual_shared_mint_verify" as const,
        },
        registryAwareCompilationGates: {
          cluegiver: "load_bearing_before_every_cluegiver_compilation" as const,
          guess:
            "load_bearing_before_every_guess_compilation_and_materialization" as const,
        },
      },
      fixture: {
        version: CLUEGIVER_S1_FIXTURE_VERSION,
        contentHash: fixture.contentHash,
        positionCount: 4 as const,
        productionAnchorCount: 1 as const,
        sideBalance: "2_red_2_blue" as const,
      },
      treatment: {
        c0: {
          arm: CLUEGIVER_S1_C0_ARM,
          policy: {
            id: CLUEGIVER_S1_C0_POLICY.id,
            contentHash: CLUEGIVER_S1_C0_POLICY.contentHash,
          },
          comparisonStatus: "not_claimed_synthetic_recombination" as const,
        },
        c1: {
          arm: CLUEGIVER_S1_C1_ARM,
          candidatePolicy: {
            id: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.id,
            contentHash: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
          },
          comparison:
            "full_explicit_four_check_package_over_implicit_old_instruction" as const,
        },
        reservedC2: {
          arm: CLUEGIVER_S1_RESERVED_C2_ARM,
          scheduledJobs: 0 as const,
          futureContrast: "only_future_C1_minus_C2_may_isolate_item_4" as const,
        },
      },
      implementationBindings: bindings,
      botBuilds: {
        assessor: assessorBuild,
        cluegiverByArm,
      },
      route: CLUEGIVER_S1_ROUTE_PLAN,
      execution: {
        mode: "dry_run" as const,
        providerDispatch: "forbidden" as const,
        databaseAccess: "forbidden" as const,
        networkAccess: "forbidden" as const,
        providerCallsThisRun: 0 as const,
        plannedProviderCallsAfterReview: 56 as const,
        maximumAttemptsPerJob: 1 as const,
        retries: 0 as const,
        fallbacks: 0 as const,
        providerCallLicense: "unlicensed" as const,
      },
      dag: {
        independentUnit: "position" as const,
        cellCount: 8 as const,
        jobsPerCell: 7 as const,
        cluegiverParentsPerCell: 1 as const,
        teammateDecoderChildrenPerCell: 3 as const,
        opponentInterceptorChildrenPerCell: 3 as const,
        ordering: "sha256_rank_then_utf16_code_unit_order" as const,
        cells,
        jobs,
      },
      outcomeSpec: CLUEGIVER_S1_OUTCOME_SPEC,
      claims: CLUEGIVER_S1_CLAIMS,
      invariants: {
        oneCluegiverParentPerCell: true as const,
        allSixAssessorsShareParentClueTriple: true as const,
        parentRationaleVisibleDownstream: false as const,
        childObservationTemplatesVerify: true as const,
        sharedAssessorPolicyCompilerAndValidator: true as const,
        sharedRegistryAwareDecisionContexts: true as const,
        providerInvocations: 0 as const,
        c2Jobs: 0 as const,
      },
    };
  return cloneAndDeepFreeze({
    ...source,
    preregistrationContentHash: contentHash(source),
  });
}

export function validatePlannedJobGroundTruthActions(
  fixture: CluegiverS1Fixture,
): string[] {
  const problems: string[] = [];
  for (const position of fixture.positions) {
    problems.push(
      ...validateJointAssignmentAction(
        {
          kind: "guess",
          role: "decode",
          guess: position.focal.code,
        },
        "decoder",
      ),
      ...validateJointAssignmentAction(
        {
          kind: "guess",
          role: "intercept",
          guess: position.focal.code,
        },
        "interceptor",
      ),
    );
  }
  return problems;
}

async function main(): Promise<void> {
  const fixture = await loadCluegiverS1Fixture();
  const preregistration = await buildCluegiverS1Preregistration(fixture);
  console.log(
    canonicalJson({
      preregistrationVersion: preregistration.preregistrationVersion,
      status: preregistration.status,
      integrationGate: preregistration.integrationGate.status,
      positions: preregistration.fixture.positionCount,
      cells: preregistration.dag.cellCount,
      jobs: preregistration.dag.jobs.length,
      providerCallsThisRun: preregistration.execution.providerCallsThisRun,
      preregistrationContentHash: preregistration.preregistrationContentHash,
      jobsContentHash: contentHash(preregistration.dag.jobs),
    }),
  );
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
