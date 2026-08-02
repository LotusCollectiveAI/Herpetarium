/**
 * Provider-free static-position mechanism bench.
 *
 * This module deliberately has no provider, database, headless-runner, or
 * application-runtime imports. It validates a four-position all-bot fixture,
 * mints one neutral Observation v0.2 per position, compiles the exact Table
 * greedy excerpt and the canonical joint-assignment policy through one common
 * envelope, validates the same historical ground-truth action for both arms,
 * and emits a deterministic preregistration. It never dispatches a model
 * call.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT,
  cloneAndDeepFreeze,
  contentHash,
  exactKeys,
  mintObservationV2,
  sha256Hex,
  tableCompetitiveIdentitySet,
  validateJointAssignmentAction,
  verifyObservationV2,
  type CodeTriple,
  type DecryptoObservationV2,
} from "@shared/substrate";
import {
  PAIRED_DECODER_POLICY_COMPILER_HASH,
  PAIRED_DECODER_POLICY_COMPILER_ID,
  TABLE_GREEDY_DECODER_POLICY_ARTIFACT,
  compilePairedDecoderPolicyPrompt,
  pairedDecoderProviderPayload,
  verifyCompiledPairedDecoderPolicyPrompt,
  type PairedDecoderPolicyCarrier,
} from "./lib/decrypto-static-decoder-policies";

export const STATIC_POSITION_FIXTURE_VERSION =
  "decrypto-static-decoder-positions@0.2.0";
export const STATIC_POSITION_PREREGISTRATION_VERSION =
  "decrypto-static-decoder-preregistration@0.2.0";
export const STATIC_POSITION_BENCH_BASE_COMMIT =
  "72b622e79baf0e23a5633f2b243b0c9b82d90ca6";
export const STATIC_POSITION_COUNT = 4;
export const STATIC_POSITION_ARM_COUNT = 2;
export const STATIC_POSITION_MAXIMUM_PROVIDER_CALLS = 8;
export const STATIC_POSITION_PLANNED_PROVIDER_CALLS = 0;
export const STATIC_POSITION_SOURCE_CLUEGIVER_ARMS = [
  "treatment",
  "control",
  "treatment",
  "control",
] as const;

export const STATIC_POSITION_EVIDENCE_LIMITATIONS = cloneAndDeepFreeze({
  independentGames: 1 as const,
  sourceMatchCount: 1 as const,
  historicalDecodeCeiling: {
    correct: 4 as const,
    total: 4 as const,
    notation: "4/4" as const,
  },
  mirroredSides: 2 as const,
  sourceRounds: 2 as const,
  positionsWithPriorHistory: 2 as const,
  effectiveIndependentUnit: "one_game" as const,
  conclusionPermissions: {
    parity: "forbidden" as const,
    strategy: "forbidden" as const,
  },
});

export const STATIC_POSITION_CLAIMS = cloneAndDeepFreeze({
  efficacy: "none" as const,
  providerResult: "none" as const,
  purpose: "plumbing-parity-smoke-only" as const,
});

const DEFAULT_FIXTURE_PATH = fileURLToPath(
  new URL(
    "./fixtures/decrypto-static-decoder-positions-v0.2.json",
    import.meta.url,
  ),
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_GAME_WORD_PATTERN = /^[A-Za-z][A-Za-z'-]{0,39}$/;
const CREDENTIAL_PATTERNS = [
  /\bsk-(?:ant|or|proj|live|test)-[A-Za-z0-9_-]{12,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Authorization.{0,24}Bearer\s+[A-Za-z0-9._-]{12,}/i,
];

export interface SanitizedResolvedSide {
  readonly clues: [string, string, string];
  readonly code: CodeTriple;
  readonly ownDecode: CodeTriple;
  readonly decodedCorrectly: boolean;
}

export interface SanitizedResolvedRound {
  readonly own: SanitizedResolvedSide;
  readonly opponent: SanitizedResolvedSide;
}

/**
 * Neutral nonhuman provenance labels. The source artifact's baseline
 * cluegiver arm is normalized to "control"; neither label enters an
 * Observation or provider-visible prompt.
 */
export type SourceCluegiverArm = "treatment" | "control";

export interface SanitizedDecoderPosition {
  readonly sourceCluegiverArm: SourceCluegiverArm;
  readonly ownKeywords: [string, string, string, string];
  readonly ownClues: [string, string, string];
  readonly opponentClues: [string, string, string];
  readonly resolvedHistory: readonly SanitizedResolvedRound[];
  readonly outcome: {
    readonly code: CodeTriple;
    readonly ownDecode: CodeTriple;
    readonly decodedCorrectly: boolean;
  };
}

export interface SanitizedStaticPositionFixtureSource {
  readonly fixtureVersion: typeof STATIC_POSITION_FIXTURE_VERSION;
  /**
   * The source match artifact was an uncommitted operator artifact and is not
   * a repository dependency. Its SHA is retained as provenance only. This
   * content-hashed repository fixture is the complete reconstruction authority
   * consumed by the benchmark.
   */
  readonly source: {
    readonly uncommittedSourceArtifactSha256: string;
    readonly sourceArtifactAvailability: "uncommitted_provenance_only";
    readonly sourceArtifactDependency: "none";
    readonly reconstructionAuthority: "content_hashed_sanitized_fixture";
    readonly allBot: true;
    readonly noHumanSource: true;
  };
  readonly evidenceLimitations: typeof STATIC_POSITION_EVIDENCE_LIMITATIONS;
  readonly positions: readonly SanitizedDecoderPosition[];
}

export interface SanitizedStaticPositionFixture extends SanitizedStaticPositionFixtureSource {
  readonly contentHash: string;
}

interface StaticBenchArm {
  readonly key: "table_greedy" | "joint_assignment";
  readonly policy: Readonly<PairedDecoderPolicyCarrier>;
}

const STATIC_BENCH_ARMS: readonly StaticBenchArm[] = Object.freeze([
  {
    key: "table_greedy",
    policy: TABLE_GREEDY_DECODER_POLICY_ARTIFACT,
  },
  {
    key: "joint_assignment",
    policy: JOINT_ASSIGNMENT_DECODER_POLICY_ARTIFACT,
  },
]);

const NEUTRAL_BOT_BUILD_SOURCE = {
  id: "static-decoder-policy-bench@0.2.0",
  scope: "provider-free-decoder-mechanism",
  compiler: {
    id: PAIRED_DECODER_POLICY_COMPILER_ID,
    contentHash: PAIRED_DECODER_POLICY_COMPILER_HASH,
  },
  providerDispatch: "forbidden",
} as const;

export const STATIC_POSITION_NEUTRAL_BOT_BUILD = cloneAndDeepFreeze({
  id: NEUTRAL_BOT_BUILD_SOURCE.id,
  contentHash: contentHash(NEUTRAL_BOT_BUILD_SOURCE),
});

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tripleProblems(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length !== 3) {
    return [`${label} must contain exactly three digits`];
  }
  const problems: string[] = [];
  if (
    value.some((digit) => !Number.isInteger(digit) || digit < 1 || digit > 4)
  ) {
    problems.push(`${label} digits must be integers in 1..4`);
  }
  if (new Set(value).size !== 3) {
    problems.push(`${label} digits must be distinct`);
  }
  return problems;
}

function wordsProblems(value: unknown, length: 3 | 4, label: string): string[] {
  if (!Array.isArray(value) || value.length !== length) {
    return [`${label} must contain exactly ${length} game words`];
  }
  if (
    !value.every(
      (word) => typeof word === "string" && SAFE_GAME_WORD_PATTERN.test(word),
    )
  ) {
    return [
      `${label} must contain only bounded single-token game words, never prose or private response bytes`,
    ];
  }
  return [];
}

function decodeConsistencyProblems(
  value: Record<string, unknown> | null,
  label: string,
): string[] {
  const problems = [
    ...tripleProblems(value?.code, `${label}.code`),
    ...tripleProblems(value?.ownDecode, `${label}.ownDecode`),
  ];
  if (typeof value?.decodedCorrectly !== "boolean") {
    problems.push(`${label}.decodedCorrectly must be boolean`);
  }
  if (
    tripleProblems(value?.code, "code").length === 0 &&
    tripleProblems(value?.ownDecode, "ownDecode").length === 0
  ) {
    const code = value!.code as CodeTriple;
    const ownDecode = value!.ownDecode as CodeTriple;
    const actual = code.every((digit, index) => digit === ownDecode[index]);
    if (value?.decodedCorrectly !== actual) {
      problems.push(`${label}.decodedCorrectly contradicts code and ownDecode`);
    }
  }
  return problems;
}

function decodedOutcomeProblems(
  value: Record<string, unknown> | null,
  label: string,
): string[] {
  return [
    ...exactKeys(value, ["code", "ownDecode", "decodedCorrectly"], label),
    ...decodeConsistencyProblems(value, label),
  ];
}

function resolvedSideProblems(value: unknown, label: string): string[] {
  const side = recordValue(value);
  return [
    ...exactKeys(
      side,
      ["clues", "code", "ownDecode", "decodedCorrectly"],
      label,
    ),
    ...wordsProblems(side?.clues, 3, `${label}.clues`),
    ...decodeConsistencyProblems(side, label),
  ];
}

function resolvedRoundProblems(value: unknown, label: string): string[] {
  const round = recordValue(value);
  return [
    ...exactKeys(round, ["own", "opponent"], label),
    ...resolvedSideProblems(round?.own, `${label}.own`),
    ...resolvedSideProblems(round?.opponent, `${label}.opponent`),
  ];
}

function evidenceLimitationsProblems(value: unknown): string[] {
  const limitations = recordValue(value);
  const decodeCeiling = recordValue(limitations?.historicalDecodeCeiling);
  const conclusionPermissions = recordValue(limitations?.conclusionPermissions);
  const problems = [
    ...exactKeys(
      limitations,
      [
        "independentGames",
        "sourceMatchCount",
        "historicalDecodeCeiling",
        "mirroredSides",
        "sourceRounds",
        "positionsWithPriorHistory",
        "effectiveIndependentUnit",
        "conclusionPermissions",
      ],
      "fixture.evidenceLimitations",
    ),
    ...exactKeys(
      decodeCeiling,
      ["correct", "total", "notation"],
      "fixture.evidenceLimitations.historicalDecodeCeiling",
    ),
    ...exactKeys(
      conclusionPermissions,
      ["parity", "strategy"],
      "fixture.evidenceLimitations.conclusionPermissions",
    ),
  ];
  if (limitations?.independentGames !== 1) {
    problems.push("fixture evidence is exactly one independent game");
  }
  if (limitations?.sourceMatchCount !== 1) {
    problems.push("fixture evidence is exactly one source match");
  }
  if (
    decodeCeiling?.correct !== 4 ||
    decodeCeiling.total !== 4 ||
    decodeCeiling.notation !== "4/4"
  ) {
    problems.push("fixture historical decode ceiling must remain 4/4");
  }
  if (limitations?.mirroredSides !== 2) {
    problems.push("fixture must record exactly two mirrored sides");
  }
  if (limitations?.sourceRounds !== 2) {
    problems.push("fixture must record exactly two source rounds");
  }
  if (limitations?.positionsWithPriorHistory !== 2) {
    problems.push(
      "fixture must record exactly two positions with prior history",
    );
  }
  if (limitations?.effectiveIndependentUnit !== "one_game") {
    problems.push("fixture effective independent unit must be one game");
  }
  if (
    conclusionPermissions?.parity !== "forbidden" ||
    conclusionPermissions.strategy !== "forbidden"
  ) {
    problems.push("fixture must forbid parity and strategy conclusions");
  }
  return problems;
}

function positionProblems(value: unknown, label: string): string[] {
  const position = recordValue(value);
  const problems = [
    ...exactKeys(
      position,
      [
        "sourceCluegiverArm",
        "ownKeywords",
        "ownClues",
        "opponentClues",
        "resolvedHistory",
        "outcome",
      ],
      label,
    ),
    ...wordsProblems(position?.ownKeywords, 4, `${label}.ownKeywords`),
    ...wordsProblems(position?.ownClues, 3, `${label}.ownClues`),
    ...wordsProblems(position?.opponentClues, 3, `${label}.opponentClues`),
    ...decodedOutcomeProblems(
      recordValue(position?.outcome),
      `${label}.outcome`,
    ),
  ];
  if (
    position?.sourceCluegiverArm !== "treatment" &&
    position?.sourceCluegiverArm !== "control"
  ) {
    problems.push(`${label}.sourceCluegiverArm must be treatment or control`);
  }
  if (!Array.isArray(position?.resolvedHistory)) {
    problems.push(`${label}.resolvedHistory must be an array`);
  } else {
    if (position.resolvedHistory.length > 1) {
      problems.push(
        `${label}.resolvedHistory exceeds the two-round fixture scope`,
      );
    }
    position.resolvedHistory.forEach((round, index) => {
      problems.push(
        ...resolvedRoundProblems(round, `${label}.resolvedHistory[${index}]`),
      );
    });
  }
  return problems;
}

function normalizePrivacyKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function sanitizedFixturePrivacyProblems(
  value: unknown,
  path = "fixture",
): string[] {
  if (typeof value === "string") {
    return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value))
      ? [`${path} contains credential-shaped private bytes`]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      sanitizedFixturePrivacyProblems(entry, `${path}[${index}]`),
    );
  }
  const record = recordValue(value);
  if (!record) return [];
  const explicitlyAllowedHumanAssertion =
    path === "fixture.source" && record.noHumanSource === true;
  return Object.entries(record).flatMap(([key, entry]) => {
    const keyPath = `${path}.${key}`;
    const normalizedKey = normalizePrivacyKey(key);
    const forbiddenKey =
      /(?:^|_)(?:name|player|actor|seat|id|game_id|decision_id|attempt_id|chat|transcript|raw|response|reasoning|receipt|prompt|provider|model|human|private)(?:$|_)/.test(
        normalizedKey,
      ) && !(explicitlyAllowedHumanAssertion && key === "noHumanSource");
    return [
      ...(forbiddenKey
        ? [`${keyPath} is forbidden in the sanitized fixture`]
        : []),
      ...sanitizedFixturePrivacyProblems(entry, keyPath),
    ];
  });
}

function mirroredPositionProblems(
  positions: readonly SanitizedDecoderPosition[],
): string[] {
  const problems: string[] = [];
  for (const [leftIndex, rightIndex] of [
    [0, 1],
    [2, 3],
  ] as const) {
    const left = positions[leftIndex];
    const right = positions[rightIndex];
    if (!left || !right) continue;
    if (
      contentHash(left.ownClues) !== contentHash(right.opponentClues) ||
      contentHash(left.opponentClues) !== contentHash(right.ownClues)
    ) {
      problems.push(
        `positions ${leftIndex + 1}/${rightIndex + 1} do not preserve mirrored current clue sets`,
      );
    }
    if (left.resolvedHistory.length !== right.resolvedHistory.length) {
      problems.push(
        `positions ${leftIndex + 1}/${rightIndex + 1} do not preserve mirrored history depth`,
      );
    }
    left.resolvedHistory.forEach((round, historyIndex) => {
      const mirroredRound = right.resolvedHistory[historyIndex];
      if (
        !mirroredRound ||
        contentHash(round.own) !== contentHash(mirroredRound.opponent) ||
        contentHash(round.opponent) !== contentHash(mirroredRound.own)
      ) {
        problems.push(
          `positions ${leftIndex + 1}/${rightIndex + 1} do not preserve mirrored resolved history ${historyIndex + 1}`,
        );
      }
    });
  }
  if (
    !positions[0] ||
    !positions[1] ||
    !positions[2] ||
    !positions[3] ||
    contentHash(positions[0].ownKeywords) !==
      contentHash(positions[2].ownKeywords) ||
    contentHash(positions[1].ownKeywords) !==
      contentHash(positions[3].ownKeywords) ||
    contentHash(positions[0].ownKeywords) ===
      contentHash(positions[1].ownKeywords)
  ) {
    problems.push(
      "fixture must contain exactly two distinct mirrored keyword sides across two rounds",
    );
  }
  return problems;
}

export function validateSanitizedStaticPositionFixture(
  value: unknown,
): string[] {
  const fixture = recordValue(value);
  const source = recordValue(fixture?.source);
  const problems = [
    ...exactKeys(
      fixture,
      [
        "fixtureVersion",
        "source",
        "evidenceLimitations",
        "positions",
        "contentHash",
      ],
      "fixture",
    ),
    ...exactKeys(
      source,
      [
        "uncommittedSourceArtifactSha256",
        "sourceArtifactAvailability",
        "sourceArtifactDependency",
        "reconstructionAuthority",
        "allBot",
        "noHumanSource",
      ],
      "fixture.source",
    ),
    ...evidenceLimitationsProblems(fixture?.evidenceLimitations),
    ...sanitizedFixturePrivacyProblems(value),
  ];
  if (fixture?.fixtureVersion !== STATIC_POSITION_FIXTURE_VERSION) {
    problems.push(
      `fixtureVersion must be "${STATIC_POSITION_FIXTURE_VERSION}"`,
    );
  }
  if (
    typeof source?.uncommittedSourceArtifactSha256 !== "string" ||
    !SHA256_PATTERN.test(source.uncommittedSourceArtifactSha256)
  ) {
    problems.push(
      "fixture.source.uncommittedSourceArtifactSha256 must be lowercase sha-256",
    );
  }
  if (
    source?.sourceArtifactAvailability !== "uncommitted_provenance_only" ||
    source?.sourceArtifactDependency !== "none" ||
    source?.reconstructionAuthority !== "content_hashed_sanitized_fixture"
  ) {
    problems.push(
      "fixture must truthfully record the uncommitted source as provenance-only with no runtime dependency",
    );
  }
  if (source?.allBot !== true || source?.noHumanSource !== true) {
    problems.push(
      "fixture source must explicitly assert allBot:true and noHumanSource:true",
    );
  }
  if (
    typeof fixture?.contentHash !== "string" ||
    !SHA256_PATTERN.test(fixture.contentHash)
  ) {
    problems.push("fixture.contentHash must be lowercase sha-256");
  } else {
    const { contentHash: recorded, ...fixtureSource } = fixture;
    if (contentHash(fixtureSource) !== recorded) {
      problems.push(
        "fixture.contentHash does not bind the exact fixture source",
      );
    }
  }
  if (
    !Array.isArray(fixture?.positions) ||
    fixture.positions.length !== STATIC_POSITION_COUNT
  ) {
    problems.push(
      `fixture.positions must contain exactly ${STATIC_POSITION_COUNT} positions`,
    );
  } else {
    const perPositionProblems = fixture.positions.flatMap((position, index) =>
      positionProblems(position, `fixture.positions[${index}]`),
    );
    problems.push(...perPositionProblems);
    if (perPositionProblems.length === 0) {
      const typedPositions =
        fixture.positions as unknown as readonly SanitizedDecoderPosition[];
      const historyDepths = typedPositions.map(
        (position) => position.resolvedHistory.length,
      );
      if (historyDepths.join(",") !== "0,0,1,1") {
        problems.push(
          "fixture positions must remain in deterministic round/side order 0,0,1,1",
        );
      }
      const sourceCluegiverArms = typedPositions.map(
        (position) => position.sourceCluegiverArm,
      );
      if (
        sourceCluegiverArms.join(",") !==
        STATIC_POSITION_SOURCE_CLUEGIVER_ARMS.join(",")
      ) {
        problems.push(
          "fixture source cluegiver arms must remain treatment,control,treatment,control",
        );
      }
      const historicalDecodeCorrect = typedPositions.filter(
        (position) => position.outcome.decodedCorrectly,
      ).length;
      if (
        historicalDecodeCorrect !==
          STATIC_POSITION_EVIDENCE_LIMITATIONS.historicalDecodeCeiling
            .correct ||
        typedPositions.length !==
          STATIC_POSITION_EVIDENCE_LIMITATIONS.historicalDecodeCeiling.total
      ) {
        problems.push(
          "fixture outcomes must preserve the historical 4/4 decode ceiling",
        );
      }
      if (
        historyDepths.filter((depth) => depth > 0).length !==
        STATIC_POSITION_EVIDENCE_LIMITATIONS.positionsWithPriorHistory
      ) {
        problems.push(
          "fixture must contain exactly two positions with prior history",
        );
      }
      problems.push(...mirroredPositionProblems(typedPositions));
    }
  }
  return problems;
}

export function parseSanitizedStaticPositionFixture(
  value: unknown,
): SanitizedStaticPositionFixture {
  const problems = validateSanitizedStaticPositionFixture(value);
  if (problems.length > 0) {
    throw new Error(
      `invalid sanitized static-position fixture: ${problems.join("; ")}`,
    );
  }
  return cloneAndDeepFreeze(
    structuredClone(value) as SanitizedStaticPositionFixture,
  );
}

export async function loadSanitizedStaticPositionFixture(
  path = DEFAULT_FIXTURE_PATH,
): Promise<SanitizedStaticPositionFixture> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  return parseSanitizedStaticPositionFixture(parsed);
}

function resolvedObservationSide(side: SanitizedResolvedSide) {
  return {
    clues: [...side.clues] as [string, string, string],
    code: [...side.code] as CodeTriple,
    ownDecode: [...side.ownDecode] as CodeTriple,
    // The source canary used a legacy Herpetarium round-one interception
    // protocol. Observation v0.2 is Table-competitive and therefore represents
    // round-one interception facts as structurally inapplicable, never false.
    intercept: null,
    decodedCorrectly: side.decodedCorrectly,
    wasIntercepted: null,
  };
}

export function observationVisiblePositionProjection(
  position: SanitizedDecoderPosition,
) {
  return {
    ownKeywords: [...position.ownKeywords] as [string, string, string, string],
    ownClues: [...position.ownClues] as [string, string, string],
    opponentClues: [...position.opponentClues] as [string, string, string],
    resolvedHistory: position.resolvedHistory.map((round) => ({
      own: {
        clues: [...round.own.clues] as [string, string, string],
        code: [...round.own.code] as CodeTriple,
        ownDecode: [...round.own.ownDecode] as CodeTriple,
        decodedCorrectly: round.own.decodedCorrectly,
      },
      opponent: {
        clues: [...round.opponent.clues] as [string, string, string],
        code: [...round.opponent.code] as CodeTriple,
        ownDecode: [...round.opponent.ownDecode] as CodeTriple,
        decodedCorrectly: round.opponent.decodedCorrectly,
      },
    })),
  };
}

export function mintNeutralDecoderObservation(
  position: SanitizedDecoderPosition,
  positionIndex: number,
): DecryptoObservationV2 {
  const observationVisiblePositionHash = contentHash(
    observationVisiblePositionProjection(position),
  );
  const neutralPositionKey = observationVisiblePositionHash.slice(0, 24);
  const team = positionIndex % 2 === 0 ? "bench-alpha" : "bench-beta";
  const resolvedRounds = position.resolvedHistory.map((round, index) => ({
    roundNumber: index + 1,
    own: resolvedObservationSide(round.own),
    opponent: resolvedObservationSide(round.opponent),
  }));
  const miscommunications = resolvedRounds.reduce(
    (count, round) => count + (round.own.decodedCorrectly ? 0 : 1),
    0,
  );
  const opponentMiscommunications = resolvedRounds.reduce(
    (count, round) => count + (round.opponent.decodedCorrectly ? 0 : 1),
    0,
  );
  return mintObservationV2({
    observationVersion: "0.2",
    decisionId: `bench-decision:${neutralPositionKey}`,
    logicalActionKey: `bench-action:${neutralPositionKey}`,
    gameId: `bench-game:${neutralPositionKey}`,
    roundNumber: resolvedRounds.length + 1,
    actor: {
      actorId: `bench-decoder:${team}`,
      seatId: `bench-decoder-seat:${team}`,
      team,
      role: "decoder",
    },
    activeCluegiverSeatId: `bench-cluegiver-seat:${team}`,
    identities: {
      botBuild: STATIC_POSITION_NEUTRAL_BOT_BUILD,
      ...tableCompetitiveIdentitySet(),
    },
    role: "decoder",
    team,
    ownKeywords: [...position.ownKeywords] as [string, string, string, string],
    ownClues: [...position.ownClues] as [string, string, string],
    opponentClues: [...position.opponentClues] as [string, string, string],
    resolvedRounds,
    tokens: {
      own: { intercepts: 0, miscommunications },
      opponent: { intercepts: 0, miscommunications: opponentMiscommunications },
    },
    teamChatVisibility: "private",
    decisionFocus:
      "Map the three current own clues to one legal distinct three-digit code.",
    transcript: [],
  });
}

function policyTextNeutralizedTaskPrompt(
  taskPrompt: string,
  policy: Readonly<PairedDecoderPolicyCarrier>,
): string {
  const pieces = taskPrompt.split(policy.instruction);
  if (pieces.length !== 2) {
    throw new Error(
      `compiled prompt must contain exactly one policy instruction for ${policy.id}`,
    );
  }
  return pieces.join("[POLICY INSTRUCTION]");
}

export interface StaticPositionPreregistration {
  readonly preregistrationVersion: typeof STATIC_POSITION_PREREGISTRATION_VERSION;
  readonly status: "provider_free_mechanism_only";
  readonly baseCommit: typeof STATIC_POSITION_BENCH_BASE_COMMIT;
  readonly fixture: {
    readonly version: typeof STATIC_POSITION_FIXTURE_VERSION;
    readonly contentHash: string;
    readonly uncommittedSourceArtifactSha256: string;
    readonly sourceArtifactAvailability: "uncommitted_provenance_only";
    readonly sourceArtifactDependency: "none";
    readonly reconstructionAuthority: "content_hashed_sanitized_fixture";
    readonly allBot: true;
    readonly noHumanSource: true;
    readonly positionCount: typeof STATIC_POSITION_COUNT;
    readonly positionHashes: readonly string[];
    readonly sourceCluegiverArmsByPosition: readonly SourceCluegiverArm[];
  };
  readonly evidenceLimitations: typeof STATIC_POSITION_EVIDENCE_LIMITATIONS;
  readonly execution: {
    readonly mode: "dry_run";
    readonly providerDispatch: "forbidden";
    readonly databaseAccess: "forbidden";
    readonly networkAccess: "forbidden";
    readonly retries: 0;
    readonly fallbacks: 0;
    readonly plannedProviderCalls: typeof STATIC_POSITION_PLANNED_PROVIDER_CALLS;
    readonly maximumProviderCalls: typeof STATIC_POSITION_MAXIMUM_PROVIDER_CALLS;
    readonly armCount: typeof STATIC_POSITION_ARM_COUNT;
    readonly providerCallLicense: "unlicensed";
  };
  readonly compiler: {
    readonly id: typeof PAIRED_DECODER_POLICY_COMPILER_ID;
    readonly contentHash: string;
    readonly kind: "neutral_experiment_only";
    readonly productionCompilerParity: "not_claimed";
  };
  readonly policies: readonly {
    readonly key: StaticBenchArm["key"];
    readonly id: string;
    readonly contentHash: string;
  }[];
  readonly jobs: readonly {
    readonly ordinal: number;
    readonly positionOrdinal: number;
    readonly arm: StaticBenchArm["key"];
    readonly positionHash: string;
    readonly observationHash: string;
    readonly policyId: string;
    readonly policyHash: string;
    readonly systemPromptSha256: string;
    readonly taskPromptSha256: string;
    readonly actionContractSha256: string;
    readonly compiledPromptHash: string;
    readonly policyTextNeutralizedPromptSha256: string;
    readonly historicalGroundTruthActionHash: string;
    readonly actionValidation: "historical_ground_truth_accepted";
  }[];
  readonly claims: typeof STATIC_POSITION_CLAIMS;
  readonly invariants: {
    readonly sameObservationWithinEachPair: true;
    readonly sameSystemPromptWithinEachPair: true;
    readonly sameActionContractWithinEachPair: true;
    readonly allBytesOutsidePolicyTextIdenticalWithinEachPair: true;
    readonly providerInvocations: 0;
  };
  readonly preregistrationContentHash: string;
}

export function buildStaticPositionPreregistration(
  fixture: SanitizedStaticPositionFixture,
): StaticPositionPreregistration {
  const fixtureProblems = validateSanitizedStaticPositionFixture(fixture);
  if (fixtureProblems.length > 0) {
    throw new Error(
      `cannot preregister invalid fixture: ${fixtureProblems.join("; ")}`,
    );
  }
  const positionHashes = fixture.positions.map((position) =>
    contentHash(position),
  );
  const jobs = fixture.positions.flatMap((position, positionIndex) => {
    const observation = mintNeutralDecoderObservation(position, positionIndex);
    if (!verifyObservationV2(observation)) {
      throw new Error(
        `neutral observation ${positionIndex + 1} failed verification`,
      );
    }
    const historicalGroundTruthAction = {
      kind: "guess" as const,
      role: "decode" as const,
      guess: [...position.outcome.ownDecode] as CodeTriple,
    };
    return STATIC_BENCH_ARMS.map((arm, armIndex) => {
      const actionProblems = validateJointAssignmentAction(
        historicalGroundTruthAction,
        "decoder",
      );
      if (actionProblems.length > 0) {
        throw new Error(
          `position ${positionIndex + 1} arm ${arm.key} action failed validation: ${actionProblems.join("; ")}`,
        );
      }
      const compiled = compilePairedDecoderPolicyPrompt(
        observation,
        arm.policy,
      );
      if (
        !verifyCompiledPairedDecoderPolicyPrompt(
          compiled,
          observation,
          arm.policy,
        )
      ) {
        throw new Error(
          `position ${positionIndex + 1} arm ${arm.key} prompt failed verification`,
        );
      }
      const providerPayload = pairedDecoderProviderPayload(compiled);
      return {
        ordinal: positionIndex * STATIC_POSITION_ARM_COUNT + armIndex + 1,
        positionOrdinal: positionIndex + 1,
        arm: arm.key,
        positionHash: positionHashes[positionIndex]!,
        observationHash: observation.contentHash,
        policyId: arm.policy.id,
        policyHash: arm.policy.contentHash,
        systemPromptSha256: sha256Hex(providerPayload.systemPrompt),
        taskPromptSha256: sha256Hex(providerPayload.taskPrompt),
        actionContractSha256: sha256Hex(providerPayload.actionContract),
        compiledPromptHash: compiled.contentHash,
        policyTextNeutralizedPromptSha256: sha256Hex(
          policyTextNeutralizedTaskPrompt(
            providerPayload.taskPrompt,
            arm.policy,
          ),
        ),
        historicalGroundTruthActionHash: contentHash(
          historicalGroundTruthAction,
        ),
        actionValidation: "historical_ground_truth_accepted" as const,
      };
    });
  });
  if (jobs.length !== STATIC_POSITION_MAXIMUM_PROVIDER_CALLS) {
    throw new Error(
      `fixed schedule drifted: expected ${STATIC_POSITION_MAXIMUM_PROVIDER_CALLS} jobs, received ${jobs.length}`,
    );
  }
  for (
    let positionIndex = 0;
    positionIndex < fixture.positions.length;
    positionIndex += 1
  ) {
    const [left, right] = jobs.slice(
      positionIndex * STATIC_POSITION_ARM_COUNT,
      positionIndex * STATIC_POSITION_ARM_COUNT + STATIC_POSITION_ARM_COUNT,
    );
    if (
      !left ||
      !right ||
      left.observationHash !== right.observationHash ||
      left.systemPromptSha256 !== right.systemPromptSha256 ||
      left.actionContractSha256 !== right.actionContractSha256 ||
      left.policyTextNeutralizedPromptSha256 !==
        right.policyTextNeutralizedPromptSha256
    ) {
      throw new Error(
        `position ${positionIndex + 1} policy contrast changed bytes outside the carrier block`,
      );
    }
  }
  const withoutHash = {
    preregistrationVersion: STATIC_POSITION_PREREGISTRATION_VERSION,
    status: "provider_free_mechanism_only" as const,
    baseCommit: STATIC_POSITION_BENCH_BASE_COMMIT,
    fixture: {
      version: fixture.fixtureVersion,
      contentHash: fixture.contentHash,
      uncommittedSourceArtifactSha256:
        fixture.source.uncommittedSourceArtifactSha256,
      sourceArtifactAvailability: fixture.source.sourceArtifactAvailability,
      sourceArtifactDependency: fixture.source.sourceArtifactDependency,
      reconstructionAuthority: fixture.source.reconstructionAuthority,
      allBot: fixture.source.allBot,
      noHumanSource: fixture.source.noHumanSource,
      positionCount: STATIC_POSITION_COUNT,
      positionHashes,
      sourceCluegiverArmsByPosition: fixture.positions.map(
        (position) => position.sourceCluegiverArm,
      ),
    },
    evidenceLimitations: fixture.evidenceLimitations,
    execution: {
      mode: "dry_run" as const,
      providerDispatch: "forbidden" as const,
      databaseAccess: "forbidden" as const,
      networkAccess: "forbidden" as const,
      retries: 0 as const,
      fallbacks: 0 as const,
      plannedProviderCalls: STATIC_POSITION_PLANNED_PROVIDER_CALLS,
      maximumProviderCalls: STATIC_POSITION_MAXIMUM_PROVIDER_CALLS,
      armCount: STATIC_POSITION_ARM_COUNT,
      providerCallLicense: "unlicensed" as const,
    },
    compiler: {
      id: PAIRED_DECODER_POLICY_COMPILER_ID,
      contentHash: PAIRED_DECODER_POLICY_COMPILER_HASH,
      kind: "neutral_experiment_only" as const,
      productionCompilerParity: "not_claimed" as const,
    },
    policies: STATIC_BENCH_ARMS.map((arm) => ({
      key: arm.key,
      id: arm.policy.id,
      contentHash: arm.policy.contentHash,
    })),
    jobs,
    claims: STATIC_POSITION_CLAIMS,
    invariants: {
      sameObservationWithinEachPair: true as const,
      sameSystemPromptWithinEachPair: true as const,
      sameActionContractWithinEachPair: true as const,
      allBytesOutsidePolicyTextIdenticalWithinEachPair: true as const,
      providerInvocations: 0 as const,
    },
  };
  return cloneAndDeepFreeze({
    ...withoutHash,
    preregistrationContentHash: contentHash(withoutHash),
  });
}

export async function runProviderFreeStaticPositionBench(): Promise<StaticPositionPreregistration> {
  const fixture = await loadSanitizedStaticPositionFixture();
  return buildStaticPositionPreregistration(fixture);
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      "provider-free static-position bench accepts no arguments and performs no dispatch",
    );
  }
  const preregistration = await runProviderFreeStaticPositionBench();
  process.stdout.write(`${JSON.stringify(preregistration, null, 2)}\n`);
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  void main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
