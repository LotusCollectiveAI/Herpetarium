/**
 * Strict, local-file ingestion boundary for completed-game Decrypto evidence
 * exported by The Table.
 *
 * Imported rows are immutable quarantine evidence. This module does not mint
 * evaluations, infer training labels, assign a train/eval split, or claim that
 * Table-local attempt evidence is a native Herpetarium TraceEnvelopeV2.
 */
import type { Pool, PoolClient } from "pg";
import {
  canonicalJson,
  contentHash,
  findSecretBearingPaths,
  sha256Hex,
  validateCodeGuess,
  verifyObservationV2,
  type DecryptoObservationV2,
  type ResolvedRoundViewV2,
  type TeamTokens,
} from "../shared/substrate";

export const TABLE_DECRYPTO_DECISION_EXPORT_VERSION =
  "the-table-decrypto-decision-export@0.2";
export const TABLE_DECRYPTO_DECISION_ATTEMPT_VERSION =
  "the-table-decrypto-decision-attempt@0.2";
export const TABLE_DECRYPTO_RESOLVED_GAME_VERSION =
  "the-table-decrypto-resolved-game@0.1";
export const TABLE_CIPHER_DECISION_POLICY_VERSION =
  "the-table-cipher-decision-shadow-policy@0.2";
export const TABLE_CIPHER_DECIDE_PARSER_ARTIFACT_VERSION =
  "the-table-cipher-decide-parser-artifact@0.1";
export const TABLE_CIPHER_DECIDE_PARSE_EVIDENCE_VERSION =
  "the-table-cipher-decide-parse-evidence@0.1";
export const TABLE_DECRYPTO_QUARANTINE_PARTITION = "legacy_unassigned";

const TABLE_CIPHER_CONVERSATION_SELECTION_DESCRIPTOR_ID =
  "the-table-cipher-decision-conversation-selection-descriptor@0.2.0";
const TABLE_CIPHER_OBSERVATION_PROJECTION_DESCRIPTOR_ID =
  "the-table-cipher-decision-observation-projection-descriptor@0.2.0";
const TABLE_CIPHER_DECISION_EVENT_TYPES = [
  "chat_message",
  "cipher_table_talk",
  "cipher_strategy_message",
] as const;
const TABLE_CIPHER_DECISION_MAX_CONVERSATION_LINES = 40;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_CIPHER_ROUNDS = 8;
const TOKEN_THRESHOLD = 2;

type JsonRecord = Record<string, unknown>;
type CipherTeam = "red" | "blue";
type DecisionRole = "decoder" | "interceptor";
type TaskKind = "decode" | "intercept";
type CodeTriple = [number, number, number];

interface ResolvedGameSide {
  readonly cluegiverSeatId: string;
  readonly clues: [string, string, string];
  readonly code: CodeTriple;
  readonly decode: CodeTriple;
  readonly opponentIntercept: CodeTriple | null;
}

interface ResolvedGameRound {
  readonly roundNumber: number;
  readonly teams: Record<CipherTeam, ResolvedGameSide>;
}

interface ResolvedGameEvidence {
  readonly resolvedGameVersion: typeof TABLE_DECRYPTO_RESOLVED_GAME_VERSION;
  readonly gameId: string;
  readonly protocol: "cipher_relay";
  readonly teamChatVisibility: "open" | "private";
  readonly teams: Record<
    CipherTeam,
    {
      readonly keywords: [string, string, string, string];
      readonly finalTokens: TeamTokens;
    }
  >;
  readonly rounds: readonly ResolvedGameRound[];
  readonly winner: CipherTeam | null;
  readonly winReason:
    | "two_intercepts"
    | "two_miscommunications"
    | "tiebreaker"
    | "draw";
}

interface VerifiedPolicy {
  readonly id: string;
  readonly contentHash: string;
  readonly role: DecisionRole;
  readonly promptVersion: string;
}

interface ParsedAction {
  readonly kind: "guess";
  readonly role: TaskKind;
  readonly guess: CodeTriple;
}

interface ParseEvidence {
  readonly status: "accepted" | "rejected" | "not_run";
  readonly notRunReason: "pending_runtime_parse" | "provider_failure" | null;
  readonly parser: JsonRecord;
  readonly action: ParsedAction | null;
  readonly validation: JsonRecord;
  readonly contentHash: string;
}

interface EventEvidence {
  readonly id: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly actorSeatId: string | null;
  readonly visibility: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

export class TableDecryptoImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableDecryptoImportValidationError";
  }
}

export class TableDecryptoImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableDecryptoImportConflictError";
  }
}

function invalid(message: string): never {
  throw new TableDecryptoImportValidationError(message);
}

/**
 * Deterministic UTF-16 code-unit ordering, matching JavaScript's relational
 * string comparison without depending on the host ICU locale.
 */
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function conflict(message: string): never {
  throw new TableDecryptoImportConflictError(message);
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): JsonRecord {
  const record = asRecord(value, label);
  const allowed = new Set(keys);
  const missing = keys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(record, key),
  );
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (missing.length > 0 || unknown.length > 0) {
    invalid(
      `${label} has invalid fields${
        missing.length > 0 ? `; missing ${missing.join(", ")}` : ""
      }${unknown.length > 0 ? `; unknown ${unknown.join(", ")}` : ""}`,
    );
  }
  return record;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function boundedString(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  const stringValue = nonEmptyString(value, label);
  if (stringValue.length > maximumLength) {
    invalid(`${label} must be at most ${maximumLength} characters`);
  }
  return stringValue;
}

function exactLiteral<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) invalid(`${label} must be "${expected}"`);
  return expected;
}

function oneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T)) {
    invalid(`${label} must be ${choices.join("|")}`);
  }
  return value as T;
}

function safeInteger(
  value: unknown,
  label: string,
  minimum = 0,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    invalid(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function nullableSafeInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  return safeInteger(value, label);
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    invalid(`${label} must be a lowercase sha-256 digest`);
  }
  return value;
}

function isoUtc(value: unknown, label: string): string {
  const parsed = typeof value === "string" ? new Date(value) : null;
  if (
    typeof value !== "string" ||
    !ISO_UTC_PATTERN.test(value) ||
    parsed === null ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== value
  ) {
    invalid(`${label} must be a canonical millisecond ISO UTC timestamp`);
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function assertSelfHash(
  value: JsonRecord,
  label: string,
): { readonly source: JsonRecord; readonly recorded: string } {
  const recorded = sha256(value["contentHash"], `${label}.contentHash`);
  const source = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  if (contentHash(source) !== recorded) {
    invalid(`${label}.contentHash does not bind its exact source`);
  }
  return { source, recorded };
}

function identity(value: unknown, label: string): {
  readonly id: string;
  readonly contentHash: string;
} {
  const record = exactRecord(value, ["id", "contentHash"], label);
  return {
    id: nonEmptyString(record["id"], `${label}.id`),
    contentHash: sha256(record["contentHash"], `${label}.contentHash`),
  };
}

function codeTriple(value: unknown, label: string): CodeTriple {
  if (validateCodeGuess(value).length > 0) {
    invalid(`${label} must be three distinct integers in 1..4`);
  }
  return value as CodeTriple;
}

function clueTriple(value: unknown, label: string): [string, string, string] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((entry) => typeof entry === "string" && entry.trim() !== "")
  ) {
    invalid(`${label} must contain exactly three non-empty clues`);
  }
  return value as [string, string, string];
}

function keywordSet(
  value: unknown,
  label: string,
): [string, string, string, string] {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((entry) => typeof entry === "string" && entry.trim() !== "")
  ) {
    invalid(`${label} must contain exactly four non-empty keywords`);
  }
  return value as [string, string, string, string];
}

function codeEquals(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length &&
    left.every((digit, index) => digit === right[index])
  );
}

function teamTokens(value: unknown, label: string): TeamTokens {
  const record = exactRecord(
    value,
    ["intercepts", "miscommunications"],
    label,
  );
  return {
    intercepts: safeInteger(record["intercepts"], `${label}.intercepts`),
    miscommunications: safeInteger(
      record["miscommunications"],
      `${label}.miscommunications`,
    ),
  };
}

function cumulativeTokens(
  rounds: readonly ResolvedGameRound[],
): Record<CipherTeam, TeamTokens> {
  const totals: Record<CipherTeam, TeamTokens> = {
    red: { intercepts: 0, miscommunications: 0 },
    blue: { intercepts: 0, miscommunications: 0 },
  };
  for (const round of rounds) {
    if (!codeEquals(round.teams.red.code, round.teams.red.decode)) {
      totals.red.miscommunications += 1;
    }
    if (!codeEquals(round.teams.blue.code, round.teams.blue.decode)) {
      totals.blue.miscommunications += 1;
    }
    if (
      round.teams.blue.opponentIntercept !== null &&
      codeEquals(
        round.teams.blue.code,
        round.teams.blue.opponentIntercept,
      )
    ) {
      totals.red.intercepts += 1;
    }
    if (
      round.teams.red.opponentIntercept !== null &&
      codeEquals(round.teams.red.code, round.teams.red.opponentIntercept)
    ) {
      totals.blue.intercepts += 1;
    }
  }
  return totals;
}

function terminalOutcome(
  rounds: readonly ResolvedGameRound[],
  tokens: Record<CipherTeam, TeamTokens>,
): {
  readonly winner: CipherTeam | null;
  readonly winReason:
    | "two_intercepts"
    | "two_miscommunications"
    | "tiebreaker"
    | "draw";
} | null {
  const redWinsByIntercept = tokens.red.intercepts >= TOKEN_THRESHOLD;
  const blueWinsByIntercept = tokens.blue.intercepts >= TOKEN_THRESHOLD;
  const redLosesByMiscommunication =
    tokens.red.miscommunications >= TOKEN_THRESHOLD;
  const blueLosesByMiscommunication =
    tokens.blue.miscommunications >= TOKEN_THRESHOLD;
  if (redWinsByIntercept && blueWinsByIntercept) {
    return { winner: null, winReason: "two_intercepts" };
  }
  if (redLosesByMiscommunication && blueLosesByMiscommunication) {
    return { winner: null, winReason: "two_miscommunications" };
  }
  if (redWinsByIntercept) {
    return { winner: "red", winReason: "two_intercepts" };
  }
  if (blueWinsByIntercept) {
    return { winner: "blue", winReason: "two_intercepts" };
  }
  if (redLosesByMiscommunication) {
    return { winner: "blue", winReason: "two_miscommunications" };
  }
  if (blueLosesByMiscommunication) {
    return { winner: "red", winReason: "two_miscommunications" };
  }
  if (rounds.length < MAX_CIPHER_ROUNDS) return null;
  if (tokens.red.intercepts !== tokens.blue.intercepts) {
    return {
      winner:
        tokens.red.intercepts > tokens.blue.intercepts ? "red" : "blue",
      winReason: "tiebreaker",
    };
  }
  if (tokens.red.miscommunications !== tokens.blue.miscommunications) {
    return {
      winner:
        tokens.red.miscommunications < tokens.blue.miscommunications
          ? "red"
          : "blue",
      winReason: "tiebreaker",
    };
  }
  return { winner: null, winReason: "draw" };
}

function verifyResolvedGame(
  value: unknown,
  expectedGameId: string,
): ResolvedGameEvidence {
  const record = exactRecord(
    value,
    [
      "resolvedGameVersion",
      "gameId",
      "protocol",
      "teamChatVisibility",
      "teams",
      "rounds",
      "winner",
      "winReason",
    ],
    "resolvedGame blob",
  );
  exactLiteral(
    record["resolvedGameVersion"],
    TABLE_DECRYPTO_RESOLVED_GAME_VERSION,
    "resolvedGame.resolvedGameVersion",
  );
  if (record["gameId"] !== expectedGameId) {
    invalid("resolvedGame.gameId does not match the export gameId");
  }
  exactLiteral(record["protocol"], "cipher_relay", "resolvedGame.protocol");
  const teamChatVisibility = oneOf(
    record["teamChatVisibility"],
    ["open", "private"] as const,
    "resolvedGame.teamChatVisibility",
  );
  const teamsRecord = exactRecord(record["teams"], ["red", "blue"], "teams");
  const teams = {} as ResolvedGameEvidence["teams"];
  for (const team of ["red", "blue"] as const) {
    const teamRecord = exactRecord(
      teamsRecord[team],
      ["keywords", "finalTokens"],
      `teams.${team}`,
    );
    teams[team] = {
      keywords: keywordSet(teamRecord["keywords"], `teams.${team}.keywords`),
      finalTokens: teamTokens(
        teamRecord["finalTokens"],
        `teams.${team}.finalTokens`,
      ),
    };
  }
  if (
    !Array.isArray(record["rounds"]) ||
    record["rounds"].length < 1 ||
    record["rounds"].length > MAX_CIPHER_ROUNDS
  ) {
    invalid(`resolvedGame.rounds must contain 1..${MAX_CIPHER_ROUNDS} rounds`);
  }
  const rounds = record["rounds"].map((entry, index) => {
    const roundRecord = exactRecord(
      entry,
      ["roundNumber", "teams"],
      `rounds[${index}]`,
    );
    const roundNumber = safeInteger(
      roundRecord["roundNumber"],
      `rounds[${index}].roundNumber`,
      1,
    );
    if (roundNumber !== index + 1) {
      invalid("resolvedGame rounds must be exactly sequential from round 1");
    }
    const roundTeamsRecord = exactRecord(
      roundRecord["teams"],
      ["red", "blue"],
      `rounds[${index}].teams`,
    );
    const roundTeams = {} as Record<CipherTeam, ResolvedGameSide>;
    for (const team of ["red", "blue"] as const) {
      const side = exactRecord(
        roundTeamsRecord[team],
        [
          "cluegiverSeatId",
          "clues",
          "code",
          "decode",
          "opponentIntercept",
        ],
        `rounds[${index}].teams.${team}`,
      );
      const opponentIntercept =
        side["opponentIntercept"] === null
          ? null
          : codeTriple(
              side["opponentIntercept"],
              `rounds[${index}].teams.${team}.opponentIntercept`,
            );
      if (
        (roundNumber === 1 && opponentIntercept !== null) ||
        (roundNumber > 1 && opponentIntercept === null)
      ) {
        invalid(
          `rounds[${index}].teams.${team}.opponentIntercept has wrong round-one nullability`,
        );
      }
      roundTeams[team] = {
        cluegiverSeatId: nonEmptyString(
          side["cluegiverSeatId"],
          `rounds[${index}].teams.${team}.cluegiverSeatId`,
        ),
        clues: clueTriple(
          side["clues"],
          `rounds[${index}].teams.${team}.clues`,
        ),
        code: codeTriple(
          side["code"],
          `rounds[${index}].teams.${team}.code`,
        ),
        decode: codeTriple(
          side["decode"],
          `rounds[${index}].teams.${team}.decode`,
        ),
        opponentIntercept,
      };
    }
    return { roundNumber, teams: roundTeams };
  });
  for (const team of ["red", "blue"] as const) {
    const firstCycle = rounds
      .slice(0, 3)
      .map((round) => round.teams[team].cluegiverSeatId);
    if (new Set(firstCycle).size !== firstCycle.length) {
      invalid(`resolvedGame ${team} cluegiver rotation repeats early`);
    }
    for (let index = 3; index < rounds.length; index += 1) {
      if (
        rounds[index]!.teams[team].cluegiverSeatId !==
        firstCycle[index % 3]
      ) {
        invalid(`resolvedGame ${team} cluegiver rotation is inconsistent`);
      }
    }
  }
  for (let index = 0; index < rounds.length - 1; index += 1) {
    if (terminalOutcome(rounds.slice(0, index + 1), cumulativeTokens(rounds.slice(0, index + 1))) !== null) {
      invalid("resolvedGame contains rounds after an earlier terminal outcome");
    }
  }
  const totals = cumulativeTokens(rounds);
  if (
    !sameJson(teams.red.finalTokens, totals.red) ||
    !sameJson(teams.blue.finalTokens, totals.blue)
  ) {
    invalid("resolvedGame final token totals contradict its rounds");
  }
  const outcome = terminalOutcome(rounds, totals);
  if (outcome === null) {
    invalid("resolvedGame does not contain a terminal outcome");
  }
  const nullableWinner =
    record["winner"] === null
      ? null
      : oneOf(
          record["winner"],
          ["red", "blue"] as const,
          "resolvedGame.winner",
        );
  const winReason = oneOf(
    record["winReason"],
    [
      "two_intercepts",
      "two_miscommunications",
      "tiebreaker",
      "draw",
    ] as const,
    "resolvedGame.winReason",
  );
  if (
    nullableWinner !== outcome.winner ||
    winReason !== outcome.winReason
  ) {
    invalid("resolvedGame winner or winReason contradicts its rounds");
  }
  return {
    resolvedGameVersion: TABLE_DECRYPTO_RESOLVED_GAME_VERSION,
    gameId: expectedGameId,
    protocol: "cipher_relay",
    teamChatVisibility,
    teams,
    rounds,
    winner: nullableWinner,
    winReason,
  };
}

class BlobResolver {
  readonly referenced = new Set<string>();
  readonly blobs: JsonRecord;

  constructor(value: unknown) {
    this.blobs = asRecord(value, "blobs");
    for (const [blobRef, blob] of Object.entries(this.blobs)) {
      const match = /^blobs\/([a-f0-9]{64})$/.exec(blobRef);
      if (!match) invalid(`invalid blob key "${blobRef}"`);
      if (contentHash(blob) !== match[1]) {
        invalid(`blob ${blobRef} does not match its content address`);
      }
    }
  }

  resolve(value: unknown, label: string): unknown {
    const ref = exactRecord(
      value,
      ["contentHash", "blobRef", "classification", "encoding"],
      label,
    );
    return this.resolveRecord(ref, label);
  }

  resolveEvent(
    value: unknown,
    label: string,
  ): { readonly ref: JsonRecord; readonly event: EventEvidence } {
    const ref = exactRecord(
      value,
      [
        "id",
        "sequence",
        "contentHash",
        "blobRef",
        "classification",
        "encoding",
      ],
      label,
    );
    const blob = this.resolveRecord(ref, label);
    const eventRecord = exactRecord(
      blob,
      [
        "id",
        "sequence",
        "eventType",
        "actorSeatId",
        "visibility",
        "payload",
        "createdAt",
      ],
      `${label} blob`,
    );
    const event: EventEvidence = {
      id: nonEmptyString(eventRecord["id"], `${label} blob.id`),
      sequence: safeInteger(
        eventRecord["sequence"],
        `${label} blob.sequence`,
      ),
      eventType: nonEmptyString(
        eventRecord["eventType"],
        `${label} blob.eventType`,
      ),
      actorSeatId:
        eventRecord["actorSeatId"] === null
          ? null
          : nonEmptyString(
              eventRecord["actorSeatId"],
              `${label} blob.actorSeatId`,
            ),
      visibility: nonEmptyString(
        eventRecord["visibility"],
        `${label} blob.visibility`,
      ),
      payload: eventRecord["payload"],
      createdAt: isoUtc(
        eventRecord["createdAt"],
        `${label} blob.createdAt`,
      ),
    };
    if (
      ref["id"] !== event.id ||
      ref["sequence"] !== event.sequence
    ) {
      invalid(`${label} identity or sequence does not match its event blob`);
    }
    return { ref, event };
  }

  private resolveRecord(ref: JsonRecord, label: string): unknown {
    const hash = sha256(ref["contentHash"], `${label}.contentHash`);
    const blobRef = nonEmptyString(ref["blobRef"], `${label}.blobRef`);
    exactLiteral(
      ref["classification"],
      "operator",
      `${label}.classification`,
    );
    exactLiteral(
      ref["encoding"],
      "canonical-json-utf8",
      `${label}.encoding`,
    );
    if (blobRef !== `blobs/${hash}`) {
      invalid(`${label}.blobRef does not bind its contentHash`);
    }
    if (!Object.prototype.hasOwnProperty.call(this.blobs, blobRef)) {
      invalid(`${label} references missing blob ${blobRef}`);
    }
    const blob = this.blobs[blobRef];
    if (contentHash(blob) !== hash) {
      invalid(`${label} blob content hash mismatch`);
    }
    this.referenced.add(blobRef);
    return blob;
  }

  assertFullyReferenced(): void {
    const unreferenced = Object.keys(this.blobs).filter(
      (key) => !this.referenced.has(key),
    );
    if (unreferenced.length > 0) {
      invalid(`export contains unreferenced blobs: ${unreferenced.join(", ")}`);
    }
  }
}

function verifyObservationProjectionDescriptor(value: unknown): void {
  const descriptor = exactRecord(
    value,
    ["id", "semanticDescriptor", "contentHash"],
    "shadow policy observationProjectionDescriptor",
  );
  const { source } = assertSelfHash(
    descriptor,
    "shadow policy observationProjectionDescriptor",
  );
  if (source["id"] !== TABLE_CIPHER_OBSERVATION_PROJECTION_DESCRIPTOR_ID) {
    invalid("shadow policy observationProjectionDescriptor.id is unknown");
  }
  const semantic = exactRecord(
    source["semanticDescriptor"],
    [
      "descriptorKind",
      "input",
      "output",
      "transcriptCarriesEventIdsAndLanes",
      "providerContextCompiler",
      "providerInputClaim",
    ],
    "shadow policy observationProjectionDescriptor.semanticDescriptor",
  );
  if (
    semantic["descriptorKind"] !== "frozen-semantic-description" ||
    semantic["input"] !==
      "authoritative-cipher-state+secret+role-visible-events" ||
    semantic["output"] !== "shadow-DecryptoObservationV2" ||
    semantic["transcriptCarriesEventIdsAndLanes"] !== true ||
    semantic["providerContextCompiler"] !== false ||
    semantic["providerInputClaim"] !== false
  ) {
    invalid("shadow policy observation projection descriptor is not v0.2");
  }
}

function verifyConversationSelectionDescriptor(value: unknown): void {
  const descriptor = exactRecord(
    value,
    ["id", "semanticDescriptor", "contentHash"],
    "shadow policy conversationSelectionDescriptor",
  );
  const { source } = assertSelfHash(
    descriptor,
    "shadow policy conversationSelectionDescriptor",
  );
  if (source["id"] !== TABLE_CIPHER_CONVERSATION_SELECTION_DESCRIPTOR_ID) {
    invalid("shadow policy conversationSelectionDescriptor.id is unknown");
  }
  const semantic = exactRecord(
    source["semanticDescriptor"],
    [
      "descriptorKind",
      "eventTypes",
      "visibilityChokepoint",
      "lanes",
      "maximumLines",
      "selection",
      "upperBound",
      "teamSettingBound",
      "providerInputClaim",
    ],
    "shadow policy conversationSelectionDescriptor.semanticDescriptor",
  );
  if (
    semantic["descriptorKind"] !== "frozen-semantic-description" ||
    !sameJson(semantic["eventTypes"], TABLE_CIPHER_DECISION_EVENT_TYPES) ||
    semantic["visibilityChokepoint"] !== "isEventVisibleToSeat" ||
    !sameJson(semantic["lanes"], [
      "table",
      "team:own",
      "team:opponent:open",
    ]) ||
    semantic["maximumLines"] !== TABLE_CIPHER_DECISION_MAX_CONVERSATION_LINES ||
    semantic["selection"] !==
      "latest-role-visible-after-lane-policy-then-chronological" ||
    semantic["upperBound"] !== "captured-game-row-sequence" ||
    semantic["teamSettingBound"] !== true ||
    semantic["providerInputClaim"] !== false
  ) {
    invalid("shadow policy conversation selection descriptor is not v0.2");
  }
}

function verifyShadowPolicy(value: unknown): VerifiedPolicy {
  const policy = exactRecord(
    value,
    [
      "policyVersion",
      "id",
      "role",
      "promptVersion",
      "observationProjectionDescriptor",
      "conversationSelectionDescriptor",
      "strategyTreatment",
      "jointAssignmentPolicy",
      "prompt",
      "contentHash",
    ],
    "shadow capture policy",
  );
  const { source, recorded } = assertSelfHash(
    policy,
    "shadow capture policy",
  );
  exactLiteral(
    source["policyVersion"],
    TABLE_CIPHER_DECISION_POLICY_VERSION,
    "shadow policy.policyVersion",
  );
  const role = oneOf(
    source["role"],
    ["decoder", "interceptor"] as const,
    "shadow policy.role",
  );
  const promptVersion = nonEmptyString(
    source["promptVersion"],
    "shadow policy.promptVersion",
  );
  verifyObservationProjectionDescriptor(
    source["observationProjectionDescriptor"],
  );
  verifyConversationSelectionDescriptor(
    source["conversationSelectionDescriptor"],
  );
  if (source["strategyTreatment"] !== null) {
    identity(source["strategyTreatment"], "shadow policy.strategyTreatment");
  }
  if (source["jointAssignmentPolicy"] !== null) {
    invalid(
      "shadow policy jointAssignmentPolicy must remain null in export v0.2",
    );
  }
  const prompt = exactRecord(
    source["prompt"],
    ["baselinePrompt", "systemPrompt", "personaStyle", "taskInstruction"],
    "shadow policy.prompt",
  );
  for (const key of [
    "baselinePrompt",
    "systemPrompt",
    "personaStyle",
    "taskInstruction",
  ]) {
    if (typeof prompt[key] !== "string") {
      invalid(`shadow policy.prompt.${key} must be a string`);
    }
  }
  const id = nonEmptyString(source["id"], "shadow policy.id");
  const withoutId = Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== "id"),
  );
  const expectedId = `the-table-cipher-${role}-shadow-policy@0.2.0:${contentHash(
    withoutId,
  )}`;
  if (id !== expectedId) invalid("shadow policy.id is not content-derived");
  return { id, contentHash: recorded, role, promptVersion };
}

function verifyParserArtifact(value: unknown): JsonRecord {
  const parser = exactRecord(
    value,
    ["parserArtifactVersion", "id", "semanticDescriptor", "contentHash"],
    "parser artifact",
  );
  const { source } = assertSelfHash(parser, "parser artifact");
  exactLiteral(
    source["parserArtifactVersion"],
    TABLE_CIPHER_DECIDE_PARSER_ARTIFACT_VERSION,
    "parserArtifact.parserArtifactVersion",
  );
  const descriptor = exactRecord(
    source["semanticDescriptor"],
    [
      "entryPoint",
      "acceptedGuessFields",
      "acceptedGuessShapes",
      "digitDomain",
      "rationaleTreatment",
    ],
    "parserArtifact.semanticDescriptor",
  );
  if (
    descriptor["entryPoint"] !== "parseCipherDecideReply" ||
    !sameJson(descriptor["acceptedGuessFields"], ["guess", "digits", "code"]) ||
    !sameJson(descriptor["acceptedGuessShapes"], [
      "three-element-array",
      "three-digits-in-string",
    ]) ||
    descriptor["digitDomain"] !== "three-distinct-integers-1-through-4" ||
    descriptor["rationaleTreatment"] !==
      "parsed-at-runtime-but-never-projected"
  ) {
    invalid("parser artifact semantic descriptor is unknown");
  }
  const expectedId = `${TABLE_CIPHER_DECIDE_PARSER_ARTIFACT_VERSION}:${contentHash(
    descriptor,
  )}`;
  if (source["id"] !== expectedId) {
    invalid("parser artifact id is not content-derived");
  }
  return parser;
}

function verifyParseEvidence(value: unknown): ParseEvidence {
  const evidence = exactRecord(
    value,
    [
      "parseEvidenceVersion",
      "status",
      "notRunReason",
      "parser",
      "action",
      "validation",
      "contentHash",
    ],
    "runtime parse evidence",
  );
  const { recorded } = assertSelfHash(evidence, "runtime parse evidence");
  exactLiteral(
    evidence["parseEvidenceVersion"],
    TABLE_CIPHER_DECIDE_PARSE_EVIDENCE_VERSION,
    "runtimeParseEvidence.parseEvidenceVersion",
  );
  const parser = verifyParserArtifact(evidence["parser"]);
  const validation = exactRecord(
    evidence["validation"],
    ["status", "validator", "problems"],
    "runtimeParseEvidence.validation",
  );
  const validator = identity(
    validation["validator"],
    "runtimeParseEvidence.validation.validator",
  );
  if (
    validator.id !== parser["id"] ||
    validator.contentHash !== parser["contentHash"]
  ) {
    invalid("runtime parse validator does not bind the parser artifact");
  }
  if (
    !Array.isArray(validation["problems"]) ||
    !validation["problems"].every(
      (problem) => typeof problem === "string" && problem.length > 0,
    )
  ) {
    invalid("runtime parse validation problems must be non-empty strings");
  }
  const status = oneOf(
    evidence["status"],
    ["accepted", "rejected", "not_run"] as const,
    "runtimeParseEvidence.status",
  );
  let action: ParsedAction | null = null;
  let notRunReason: ParseEvidence["notRunReason"] = null;
  if (status === "not_run") {
    notRunReason = oneOf(
      evidence["notRunReason"],
      ["pending_runtime_parse", "provider_failure"] as const,
      "runtimeParseEvidence.notRunReason",
    );
    if (
      evidence["action"] !== null ||
      validation["status"] !== "not_run" ||
      validation["problems"].length !== 0
    ) {
      invalid("not-run runtime parse evidence is incoherent");
    }
  } else if (status === "rejected") {
    if (
      evidence["notRunReason"] !== null ||
      evidence["action"] !== null ||
      validation["status"] !== "rejected" ||
      validation["problems"].length === 0
    ) {
      invalid("rejected runtime parse evidence is incoherent");
    }
  } else {
    if (
      evidence["notRunReason"] !== null ||
      validation["status"] !== "accepted" ||
      validation["problems"].length !== 0
    ) {
      invalid("accepted runtime parse evidence is incoherent");
    }
    const actionRecord = exactRecord(
      evidence["action"],
      ["kind", "role", "guess"],
      "runtimeParseEvidence.action",
    );
    exactLiteral(
      actionRecord["kind"],
      "guess",
      "runtimeParseEvidence.action.kind",
    );
    action = {
      kind: "guess",
      role: oneOf(
        actionRecord["role"],
        ["decode", "intercept"] as const,
        "runtimeParseEvidence.action.role",
      ),
      guess: codeTriple(
        actionRecord["guess"],
        "runtimeParseEvidence.action.guess",
      ),
    };
  }
  return {
    status,
    notRunReason,
    parser,
    action,
    validation,
    contentHash: recorded,
  };
}

function expectedResolvedSide(
  side: ResolvedGameSide,
  roundNumber: number,
): ResolvedRoundViewV2["own"] {
  return {
    clues: side.clues,
    code: side.code,
    ownDecode: side.decode,
    intercept: side.opponentIntercept,
    decodedCorrectly: codeEquals(side.code, side.decode),
    wasIntercepted:
      roundNumber === 1
        ? null
        : codeEquals(side.code, side.opponentIntercept!),
  };
}

function verifyObservationAgainstGame(input: {
  readonly observation: DecryptoObservationV2;
  readonly game: ResolvedGameEvidence;
  readonly group: JsonRecord;
  readonly policy: VerifiedPolicy;
}): void {
  const { observation, game, group, policy } = input;
  const team = oneOf(
    observation.actor.team,
    ["red", "blue"] as const,
    "observation.actor.team",
  );
  const opponent: CipherTeam = team === "red" ? "blue" : "red";
  const roundNumber = group["roundNumber"] as number;
  const activeRound = game.rounds[roundNumber - 1];
  if (!activeRound) invalid("observation round is absent from resolvedGame");
  if (
    observation.gameId !== game.gameId ||
    observation.decisionId !== group["decisionId"] ||
    observation.logicalActionKey !== group["logicalActionKey"] ||
    observation.roundNumber !== roundNumber ||
    observation.role !== group["role"] ||
    observation.team !== team ||
    observation.actor.role !== group["role"] ||
    observation.actor.team !== group["actorTeam"]
  ) {
    invalid("observation identity does not match its decision group");
  }
  if (
    policy.role !== observation.role ||
    observation.identities.botBuild.id !== policy.id ||
    observation.identities.botBuild.contentHash !== policy.contentHash
  ) {
    invalid("observation botBuild does not bind its shadow capture policy");
  }
  const expectedDecisionId = `decision:${contentHash([
    "the-table",
    game.gameId,
    observation.logicalActionKey,
  ])}`;
  if (observation.decisionId !== expectedDecisionId) {
    invalid("observation decisionId is not stable for its logical action");
  }
  if (
    observation.activeCluegiverSeatId !==
      activeRound.teams[team].cluegiverSeatId ||
    !sameJson(observation.ownClues, activeRound.teams[team].clues) ||
    !sameJson(
      observation.opponentClues,
      activeRound.teams[opponent].clues,
    ) ||
    observation.teamChatVisibility !== game.teamChatVisibility
  ) {
    invalid("observation active-round view contradicts resolvedGame");
  }
  const expectedKeywords =
    observation.role === "decoder" ? game.teams[team].keywords : null;
  if (!sameJson(observation.ownKeywords, expectedKeywords)) {
    invalid("observation keyword visibility contradicts its role or team");
  }
  const expectedRounds = game.rounds
    .slice(0, roundNumber - 1)
    .map((round) => ({
      roundNumber: round.roundNumber,
      own: expectedResolvedSide(round.teams[team], round.roundNumber),
      opponent: expectedResolvedSide(
        round.teams[opponent],
        round.roundNumber,
      ),
    }));
  if (!sameJson(observation.resolvedRounds, expectedRounds)) {
    invalid("observation resolved-round history contradicts resolvedGame");
  }
  const beforeTokens = cumulativeTokens(
    game.rounds.slice(0, roundNumber - 1),
  );
  if (
    !sameJson(observation.tokens, {
      own: beforeTokens[team],
      opponent: beforeTokens[opponent],
    })
  ) {
    invalid("observation token view contradicts prior resolved rounds");
  }
}

function eventAtOrBeforeCompletion(
  event: EventEvidence,
  sourceCompletedAt: string,
  label: string,
): void {
  if (Date.parse(event.createdAt) > Date.parse(sourceCompletedAt)) {
    invalid(`${label} occurs after sourceCompletedAt`);
  }
}

interface AttemptVerificationContext {
  readonly game: ResolvedGameEvidence;
  readonly group: JsonRecord;
  readonly resolver: BlobResolver;
  readonly sourceCompletedAt: string;
  readonly attemptIds: Set<string>;
  readonly taskIds: Set<string>;
  readonly actionEventIds: Set<string>;
}

function verifyAttempt(
  value: unknown,
  index: number,
  context: AttemptVerificationContext,
): {
  readonly attemptId: string;
  readonly applied: boolean;
  readonly recordedAt: string;
} {
  const label = `decision ${String(context.group["decisionId"])} attempt[${index}]`;
  const attempt = exactRecord(
    value,
    [
      "attemptVersion",
      "app",
      "gameId",
      "roundNumber",
      "decisionId",
      "attemptId",
      "logicalActionKey",
      "actor",
      "role",
      "taskKind",
      "identities",
      "inputs",
      "outputs",
      "runtime",
      "provider",
      "parsedAction",
      "validation",
      "application",
      "outcome",
      "telemetry",
      "contentHash",
    ],
    label,
  );
  assertSelfHash(attempt, label);
  exactLiteral(
    attempt["attemptVersion"],
    TABLE_DECRYPTO_DECISION_ATTEMPT_VERSION,
    `${label}.attemptVersion`,
  );
  exactLiteral(attempt["app"], "the-table", `${label}.app`);
  if (
    attempt["gameId"] !== context.game.gameId ||
    attempt["roundNumber"] !== context.group["roundNumber"] ||
    attempt["decisionId"] !== context.group["decisionId"] ||
    attempt["logicalActionKey"] !== context.group["logicalActionKey"]
  ) {
    invalid(`${label} does not bind its game and decision group`);
  }
  const attemptId = nonEmptyString(attempt["attemptId"], `${label}.attemptId`);
  if (context.attemptIds.has(attemptId)) {
    invalid(`duplicate attemptId ${attemptId}`);
  }
  context.attemptIds.add(attemptId);
  const role = oneOf(
    attempt["role"],
    ["decoder", "interceptor"] as const,
    `${label}.role`,
  );
  const taskKind = oneOf(
    attempt["taskKind"],
    ["decode", "intercept"] as const,
    `${label}.taskKind`,
  );
  if (
    role !== context.group["role"] ||
    taskKind !== (role === "decoder" ? "decode" : "intercept")
  ) {
    invalid(`${label} role and taskKind are incoherent`);
  }
  const actor = exactRecord(
    attempt["actor"],
    ["actorId", "seatId", "team", "role"],
    `${label}.actor`,
  );
  nonEmptyString(actor["actorId"], `${label}.actor.actorId`);
  nonEmptyString(actor["seatId"], `${label}.actor.seatId`);
  const actorTeam = oneOf(
    actor["team"],
    ["red", "blue"] as const,
    `${label}.actor.team`,
  );
  if (
    actorTeam !== context.group["actorTeam"] ||
    actor["role"] !== role
  ) {
    invalid(`${label}.actor does not bind the decision group`);
  }
  const identities = exactRecord(
    attempt["identities"],
    ["botBuild", "protocol", "visibility", "rules"],
    `${label}.identities`,
  );
  for (const key of ["botBuild", "protocol", "visibility", "rules"]) {
    identity(identities[key], `${label}.identities.${key}`);
  }
  const inputs = exactRecord(
    attempt["inputs"],
    ["shadowObservation", "shadowCapturePolicy", "requestJson"],
    `${label}.inputs`,
  );
  const observationValue = context.resolver.resolve(
    inputs["shadowObservation"],
    `${label}.inputs.shadowObservation`,
  );
  if (!verifyObservationV2(observationValue as DecryptoObservationV2)) {
    invalid(`${label} observation blob does not verify as ObservationV2`);
  }
  const observation = observationValue as DecryptoObservationV2;
  const policy = verifyShadowPolicy(
    context.resolver.resolve(
      inputs["shadowCapturePolicy"],
      `${label}.inputs.shadowCapturePolicy`,
    ),
  );
  if (
    !sameJson(actor, observation.actor) ||
    !sameJson(identities, observation.identities)
  ) {
    invalid(
      `${label}.actor and identities must equal the shadow observation`,
    );
  }
  verifyObservationAgainstGame({
    observation,
    game: context.game,
    group: context.group,
    policy,
  });
  const requestJson =
    inputs["requestJson"] === null
      ? null
      : context.resolver.resolve(
          inputs["requestJson"],
          `${label}.inputs.requestJson`,
        );
  const outputs = exactRecord(
    attempt["outputs"],
    ["responseText", "responseMeta", "runtimeParseEvidence"],
    `${label}.outputs`,
  );
  const responseText =
    outputs["responseText"] === null
      ? null
      : context.resolver.resolve(
          outputs["responseText"],
          `${label}.outputs.responseText`,
        );
  if (responseText !== null && typeof responseText !== "string") {
    invalid(`${label}.outputs.responseText blob must be a string`);
  }
  if (outputs["responseMeta"] !== null) {
    context.resolver.resolve(
      outputs["responseMeta"],
      `${label}.outputs.responseMeta`,
    );
  }
  const parseEvidence = verifyParseEvidence(
    context.resolver.resolve(
      outputs["runtimeParseEvidence"],
      `${label}.outputs.runtimeParseEvidence`,
    ),
  );
  if (parseEvidence.notRunReason === "pending_runtime_parse") {
    invalid(`${label} contains pending runtime parse evidence`);
  }
  const runtime = exactRecord(
    attempt["runtime"],
    [
      "appSha",
      "promptVersion",
      "rulesetVersion",
      "attemptOrdinal",
      "parserArtifact",
    ],
    `${label}.runtime`,
  );
  nonEmptyString(runtime["appSha"], `${label}.runtime.appSha`);
  const runtimePromptVersion = nonEmptyString(
    runtime["promptVersion"],
    `${label}.runtime.promptVersion`,
  );
  nonEmptyString(runtime["rulesetVersion"], `${label}.runtime.rulesetVersion`);
  safeInteger(runtime["attemptOrdinal"], `${label}.runtime.attemptOrdinal`, 1);
  const parserArtifact = verifyParserArtifact(
    context.resolver.resolve(
      runtime["parserArtifact"],
      `${label}.runtime.parserArtifact`,
    ),
  );
  if (
    !sameJson(parserArtifact, parseEvidence.parser) ||
    runtimePromptVersion !== policy.promptVersion
  ) {
    invalid(`${label} runtime provenance does not bind parser or policy`);
  }
  const provider = exactRecord(
    attempt["provider"],
    [
      "requestedProvider",
      "requestedModel",
      "reasoningEffort",
      "reasoningMode",
      "timeMode",
      "targetSeconds",
      "invocationStatus",
      "recordStatus",
      "failureStage",
    ],
    `${label}.provider`,
  );
  for (const key of [
    "requestedProvider",
    "requestedModel",
    "reasoningEffort",
    "reasoningMode",
    "timeMode",
  ]) {
    nonEmptyString(provider[key], `${label}.provider.${key}`);
  }
  safeInteger(provider["targetSeconds"], `${label}.provider.targetSeconds`);
  const invocationStatus = oneOf(
    provider["invocationStatus"],
    ["succeeded", "failed"] as const,
    `${label}.provider.invocationStatus`,
  );
  const recordStatus = oneOf(
    provider["recordStatus"],
    ["ok", "error"] as const,
    `${label}.provider.recordStatus`,
  );
  const failureStage =
    provider["failureStage"] === null
      ? null
      : oneOf(
          provider["failureStage"],
          ["provider", "parse", "application"] as const,
          `${label}.provider.failureStage`,
        );
  if (
    invocationStatus !== (failureStage === "provider" ? "failed" : "succeeded") ||
    (recordStatus === "ok" ? failureStage !== null : failureStage === null)
  ) {
    invalid(`${label} provider statuses are incoherent`);
  }
  if (
    (recordStatus === "ok" ||
      failureStage === "parse" ||
      failureStage === "application") &&
    (requestJson === null || responseText === null)
  ) {
    invalid(`${label} lacks exact request/response provenance`);
  }
  if (
    (failureStage === "provider" &&
      (parseEvidence.status !== "not_run" ||
        parseEvidence.notRunReason !== "provider_failure")) ||
    (failureStage === "parse" && parseEvidence.status !== "rejected") ||
    ((failureStage === "application" || recordStatus === "ok") &&
      parseEvidence.status !== "accepted")
  ) {
    invalid(`${label} provider stage contradicts runtime parse evidence`);
  }
  let parsedAction: {
    readonly action: ParsedAction;
    readonly contentHash: string;
  } | null = null;
  if (attempt["parsedAction"] !== null) {
    const parsed = exactRecord(
      attempt["parsedAction"],
      ["action", "contentHash"],
      `${label}.parsedAction`,
    );
    const action = exactRecord(
      parsed["action"],
      ["kind", "role", "guess"],
      `${label}.parsedAction.action`,
    );
    const normalizedAction: ParsedAction = {
      kind: exactLiteral(
        action["kind"],
        "guess",
        `${label}.parsedAction.action.kind`,
      ),
      role: oneOf(
        action["role"],
        ["decode", "intercept"] as const,
        `${label}.parsedAction.action.role`,
      ),
      guess: codeTriple(
        action["guess"],
        `${label}.parsedAction.action.guess`,
      ),
    };
    const actionHash = sha256(
      parsed["contentHash"],
      `${label}.parsedAction.contentHash`,
    );
    if (contentHash(normalizedAction) !== actionHash) {
      invalid(`${label}.parsedAction hash mismatch`);
    }
    parsedAction = { action: normalizedAction, contentHash: actionHash };
  }
  if (
    (parseEvidence.action === null) !== (parsedAction === null) ||
    (parseEvidence.action !== null &&
      !sameJson(parseEvidence.action, parsedAction?.action)) ||
    (parsedAction !== null && parsedAction.action.role !== taskKind)
  ) {
    invalid(`${label}.parsedAction does not equal runtime parse evidence`);
  }
  const validation = exactRecord(
    attempt["validation"],
    ["status", "validator", "problems"],
    `${label}.validation`,
  );
  if (!sameJson(validation, parseEvidence.validation)) {
    invalid(`${label}.validation does not equal runtime parse evidence`);
  }
  const application = exactRecord(
    attempt["application"],
    [
      "taskId",
      "taskStatus",
      "applied",
      "logicalActionKey",
      "parsedActionHash",
      "actionEvent",
    ],
    `${label}.application`,
  );
  const taskId = nonEmptyString(
    application["taskId"],
    `${label}.application.taskId`,
  );
  if (context.taskIds.has(taskId)) invalid(`duplicate taskId ${taskId}`);
  context.taskIds.add(taskId);
  const taskStatus = oneOf(
    application["taskStatus"],
    ["done", "failed", "skipped"] as const,
    `${label}.application.taskStatus`,
  );
  if (
    application["logicalActionKey"] !== context.group["logicalActionKey"] ||
    typeof application["applied"] !== "boolean"
  ) {
    invalid(`${label}.application does not bind its logical action`);
  }
  const applied = application["applied"];
  const expectedApplied =
    recordStatus === "ok" && failureStage === null && taskStatus === "done";
  if (
    applied !== expectedApplied ||
    (taskStatus === "done" && recordStatus !== "ok") ||
    (recordStatus === "error" &&
      taskStatus !== "failed" &&
      taskStatus !== "skipped")
  ) {
    invalid(`${label} call/task/application statuses are incoherent`);
  }
  const outcome = exactRecord(
    attempt["outcome"],
    ["status", "outcomeEvent"],
    `${label}.outcome`,
  );
  if (!applied) {
    if (
      application["parsedActionHash"] !== null ||
      application["actionEvent"] !== null ||
      outcome["status"] !== "not_applied" ||
      outcome["outcomeEvent"] !== null
    ) {
      invalid(`${label} unapplied attempt claims action or outcome evidence`);
    }
  } else {
    if (
      parsedAction === null ||
      validation["status"] !== "accepted" ||
      application["parsedActionHash"] !== parsedAction.contentHash ||
      outcome["status"] !== "resolved" ||
      application["actionEvent"] === null ||
      outcome["outcomeEvent"] === null
    ) {
      invalid(`${label} applied attempt lacks accepted action evidence`);
    }
    const actionEvidence = context.resolver.resolveEvent(
      application["actionEvent"],
      `${label}.application.actionEvent`,
    ).event;
    if (context.actionEventIds.has(actionEvidence.id)) {
      invalid(`duplicate applied action event ${actionEvidence.id}`);
    }
    context.actionEventIds.add(actionEvidence.id);
    const expectedEventType =
      taskKind === "decode"
        ? "cipher_decode_submitted"
        : "cipher_intercept_submitted";
    if (
      actionEvidence.eventType !== expectedEventType ||
      actionEvidence.actorSeatId !== actor["seatId"] ||
      actionEvidence.visibility !== `team:${actorTeam}`
    ) {
      invalid(`${label} action event type, actor, or visibility is wrong`);
    }
    const payloadKeys =
      taskKind === "decode"
        ? ["actorSeatId", "byTeam", "guess", "roundIndex"]
        : [
            "actorSeatId",
            "byTeam",
            "guess",
            "roundIndex",
            "targetTeam",
          ];
    const actionPayload = exactRecord(
      actionEvidence.payload,
      payloadKeys,
      `${label} action event payload`,
    );
    const expectedTarget: CipherTeam = actorTeam === "red" ? "blue" : "red";
    const resolvedSide =
      taskKind === "decode"
        ? context.game.rounds[
            (context.group["roundNumber"] as number) - 1
          ]!.teams[actorTeam]
        : context.game.rounds[
            (context.group["roundNumber"] as number) - 1
          ]!.teams[expectedTarget];
    const resolvedGuess =
      taskKind === "decode"
        ? resolvedSide.decode
        : resolvedSide.opponentIntercept;
    if (
      actionPayload["roundIndex"] !==
        (context.group["roundNumber"] as number) - 1 ||
      actionPayload["byTeam"] !== actorTeam ||
      actionPayload["actorSeatId"] !== actor["seatId"] ||
      !sameJson(actionPayload["guess"], parsedAction.action.guess) ||
      !sameJson(parsedAction.action.guess, resolvedGuess) ||
      (taskKind === "intercept" &&
        actionPayload["targetTeam"] !== expectedTarget)
    ) {
      invalid(`${label} action event payload contradicts the attempt`);
    }
    const outcomeEvidence = context.resolver.resolveEvent(
      outcome["outcomeEvent"],
      `${label}.outcome.outcomeEvent`,
    ).event;
    if (
      outcomeEvidence.eventType !== "cipher_round_resolved" ||
      outcomeEvidence.visibility !== "public" ||
      outcomeEvidence.sequence <= actionEvidence.sequence ||
      Date.parse(outcomeEvidence.createdAt) <
        Date.parse(actionEvidence.createdAt)
    ) {
      invalid(`${label} outcome event is not a later round resolution`);
    }
    const outcomePayload = exactRecord(
      outcomeEvidence.payload,
      ["blueTokens", "redTokens", "roundIndex"],
      `${label} outcome event payload`,
    );
    const roundNumber = context.group["roundNumber"] as number;
    const expectedTokens = cumulativeTokens(
      context.game.rounds.slice(0, roundNumber),
    );
    if (
      outcomePayload["roundIndex"] !== roundNumber - 1 ||
      !sameJson(outcomePayload["redTokens"], expectedTokens.red) ||
      !sameJson(outcomePayload["blueTokens"], expectedTokens.blue)
    ) {
      invalid(`${label} outcome event tokens contradict resolvedGame`);
    }
    eventAtOrBeforeCompletion(
      actionEvidence,
      context.sourceCompletedAt,
      `${label} action event`,
    );
    eventAtOrBeforeCompletion(
      outcomeEvidence,
      context.sourceCompletedAt,
      `${label} outcome event`,
    );
  }
  const telemetry = exactRecord(
    attempt["telemetry"],
    ["recordedAt", "latencyMs", "tokensIn", "tokensOut"],
    `${label}.telemetry`,
  );
  const recordedAt = isoUtc(
    telemetry["recordedAt"],
    `${label}.telemetry.recordedAt`,
  );
  if (Date.parse(recordedAt) > Date.parse(context.sourceCompletedAt)) {
    invalid(`${label} telemetry occurs after sourceCompletedAt`);
  }
  safeInteger(telemetry["latencyMs"], `${label}.telemetry.latencyMs`);
  nullableSafeInteger(telemetry["tokensIn"], `${label}.telemetry.tokensIn`);
  nullableSafeInteger(telemetry["tokensOut"], `${label}.telemetry.tokensOut`);
  return { attemptId, applied, recordedAt };
}

export interface PreparedTableDecryptoDecision {
  readonly sourceDecisionId: string;
  readonly idempotencyKey: string;
  readonly canonicalDecision: string;
  readonly canonicalDecisionSha256: string;
}

export interface PreparedTableDecryptoGame {
  readonly sourceApp: "the-table";
  readonly sourceGameId: string;
  readonly sourceCompletedAt: string;
  readonly exportVersion: typeof TABLE_DECRYPTO_DECISION_EXPORT_VERSION;
  readonly partition: typeof TABLE_DECRYPTO_QUARANTINE_PARTITION;
  readonly canonicalExport: string;
  readonly canonicalExportSha256: string;
  readonly decisions: readonly PreparedTableDecryptoDecision[];
}

export function prepareTableDecryptoImport(
  parsed: unknown,
): PreparedTableDecryptoGame {
  const exportRecord = exactRecord(
    parsed,
    [
      "exportVersion",
      "app",
      "gameId",
      "sourceCompletedAt",
      "partitionLabel",
      "classification",
      "resolvedGame",
      "decisions",
      "blobs",
      "contentHash",
    ],
    "Table Decrypto export",
  );
  exactLiteral(
    exportRecord["exportVersion"],
    TABLE_DECRYPTO_DECISION_EXPORT_VERSION,
    "exportVersion",
  );
  exactLiteral(exportRecord["app"], "the-table", "app");
  const gameId = nonEmptyString(exportRecord["gameId"], "gameId");
  if (!UUID_PATTERN.test(gameId)) invalid("gameId must be a UUID");
  const sourceCompletedAt = isoUtc(
    exportRecord["sourceCompletedAt"],
    "sourceCompletedAt",
  );
  exactLiteral(
    exportRecord["partitionLabel"],
    TABLE_DECRYPTO_QUARANTINE_PARTITION,
    "partitionLabel",
  );
  exactLiteral(exportRecord["classification"], "operator", "classification");
  assertSelfHash(exportRecord, "Table Decrypto export");
  const forbiddenPaths = findSecretBearingPaths(exportRecord);
  if (forbiddenPaths.length > 0) {
    invalid(
      `export contains forbidden credential-bearing fields: ${forbiddenPaths.join(
        ", ",
      )}`,
    );
  }
  const resolver = new BlobResolver(exportRecord["blobs"]);
  const resolvedGame = verifyResolvedGame(
    resolver.resolve(exportRecord["resolvedGame"], "resolvedGame"),
    gameId,
  );
  if (!Array.isArray(exportRecord["decisions"])) {
    invalid("decisions must be an array");
  }
  const decisionIds = new Set<string>();
  const logicalActionKeys = new Set<string>();
  const decisionSlots = new Set<string>();
  const attemptIds = new Set<string>();
  const taskIds = new Set<string>();
  const actionEventIds = new Set<string>();
  let priorLogicalActionKey: string | null = null;
  const preparedDecisions = exportRecord["decisions"].map(
    (entry, decisionIndex) => {
      const label = `decisions[${decisionIndex}]`;
      const group = exactRecord(
        entry,
        [
          "decisionId",
          "logicalActionKey",
          "roundNumber",
          "role",
          "actorTeam",
          "targetTeam",
          "resolution",
          "appliedAttemptId",
          "attempts",
        ],
        label,
      );
      const decisionId = boundedString(
        group["decisionId"],
        `${label}.decisionId`,
        200,
      );
      const logicalActionKey = nonEmptyString(
        group["logicalActionKey"],
        `${label}.logicalActionKey`,
      );
      if (
        decisionIds.has(decisionId) ||
        logicalActionKeys.has(logicalActionKey)
      ) {
        invalid("decisionId and logicalActionKey must be unique");
      }
      decisionIds.add(decisionId);
      logicalActionKeys.add(logicalActionKey);
      if (
        priorLogicalActionKey !== null &&
        compareCodeUnits(priorLogicalActionKey, logicalActionKey) >= 0
      ) {
        invalid("decisions must be strictly ordered by logicalActionKey");
      }
      priorLogicalActionKey = logicalActionKey;
      const roundNumber = safeInteger(
        group["roundNumber"],
        `${label}.roundNumber`,
        1,
      );
      if (roundNumber > resolvedGame.rounds.length) {
        invalid(`${label}.roundNumber exceeds resolvedGame`);
      }
      const role = oneOf(
        group["role"],
        ["decoder", "interceptor"] as const,
        `${label}.role`,
      );
      if (role === "interceptor" && roundNumber === 1) {
        invalid("round one cannot contain an interceptor decision");
      }
      const actorTeam = oneOf(
        group["actorTeam"],
        ["red", "blue"] as const,
        `${label}.actorTeam`,
      );
      const decisionSlot = canonicalJson([roundNumber, role, actorTeam]);
      if (decisionSlots.has(decisionSlot)) {
        invalid(
          `${label} duplicates the (roundNumber, role, actorTeam) decision slot`,
        );
      }
      decisionSlots.add(decisionSlot);
      const expectedTargetTeam: CipherTeam | null =
        role === "interceptor"
          ? actorTeam === "red"
            ? "blue"
            : "red"
          : null;
      if (group["targetTeam"] !== expectedTargetTeam) {
        invalid(
          `${label}.targetTeam must be ${
            expectedTargetTeam === null
              ? "null for a decoder"
              : expectedTargetTeam
          }`,
        );
      }
      const resolution = oneOf(
        group["resolution"],
        [
          "ai_attempt_applied",
          "completed_without_ai_application",
        ] as const,
        `${label}.resolution`,
      );
      if (!Array.isArray(group["attempts"]) || group["attempts"].length < 1) {
        invalid(`${label}.attempts must contain at least one attempt`);
      }
      const verifiedAttempts = group["attempts"].map((attempt, index) =>
        verifyAttempt(attempt, index, {
          game: resolvedGame,
          group,
          resolver,
          sourceCompletedAt,
          attemptIds,
          taskIds,
          actionEventIds,
        }),
      );
      for (let index = 1; index < verifiedAttempts.length; index += 1) {
        const prior = verifiedAttempts[index - 1]!;
        const current = verifiedAttempts[index]!;
        if (
          compareCodeUnits(prior.recordedAt, current.recordedAt) > 0 ||
          (prior.recordedAt === current.recordedAt &&
            compareCodeUnits(prior.attemptId, current.attemptId) >= 0)
        ) {
          invalid(`${label}.attempts are not in deterministic order`);
        }
      }
      const applied = verifiedAttempts.filter((attempt) => attempt.applied);
      if (
        applied.length > 1 ||
        (resolution === "ai_attempt_applied" &&
          (applied.length !== 1 ||
            group["appliedAttemptId"] !== applied[0]!.attemptId)) ||
        (resolution === "completed_without_ai_application" &&
          (applied.length !== 0 || group["appliedAttemptId"] !== null))
      ) {
        invalid(`${label} resolution contradicts its attempts`);
      }
      const canonicalDecision = canonicalJson(group);
      return {
        sourceDecisionId: decisionId,
        idempotencyKey: sha256Hex(
          canonicalJson(["the-table", gameId, decisionId]),
        ),
        canonicalDecision,
        canonicalDecisionSha256: sha256Hex(canonicalDecision),
      };
    },
  );
  resolver.assertFullyReferenced();
  const canonicalExport = canonicalJson(exportRecord);
  return Object.freeze({
    sourceApp: "the-table" as const,
    sourceGameId: gameId,
    sourceCompletedAt,
    exportVersion: TABLE_DECRYPTO_DECISION_EXPORT_VERSION,
    partition: TABLE_DECRYPTO_QUARANTINE_PARTITION,
    canonicalExport,
    canonicalExportSha256: sha256Hex(canonicalExport),
    decisions: Object.freeze(
      preparedDecisions
        .slice()
        .sort((left, right) =>
          compareCodeUnits(left.sourceDecisionId, right.sourceDecisionId),
        )
        .map((decision) => Object.freeze(decision)),
    ),
  });
}

export function parseAndPrepareTableDecryptoImport(
  jsonText: string,
): PreparedTableDecryptoGame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    invalid(
      `Table Decrypto export is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return prepareTableDecryptoImport(parsed);
}

export interface StoredDecryptoQuarantineGame {
  readonly id: number;
  readonly sourceApp: string;
  readonly sourceGameId: string;
  readonly sourceCompletedAt: string;
  readonly exportVersion: string;
  readonly partition: string;
  readonly canonicalExport: string;
  readonly canonicalExportSha256: string;
  readonly decisionCount: number;
}

export interface StoredDecryptoQuarantineDecision {
  readonly sourceDecisionId: string;
  readonly idempotencyKey: string;
  readonly canonicalDecision: string;
  readonly canonicalDecisionSha256: string;
}

export interface TableDecryptoImportTransaction {
  insertGameIfAbsent(game: PreparedTableDecryptoGame): Promise<number | null>;
  lockGame(
    sourceApp: "the-table",
    sourceGameId: string,
  ): Promise<StoredDecryptoQuarantineGame | null>;
  insertDecisionIfAbsent(
    quarantineGameId: number,
    decision: PreparedTableDecryptoDecision,
  ): Promise<boolean>;
  lockDecisions(
    quarantineGameId: number,
  ): Promise<readonly StoredDecryptoQuarantineDecision[]>;
}

export interface TableDecryptoImportStore {
  transaction<T>(
    operation: (tx: TableDecryptoImportTransaction) => Promise<T>,
  ): Promise<T>;
}

function assertStoredGameMatches(
  stored: StoredDecryptoQuarantineGame,
  prepared: PreparedTableDecryptoGame,
): void {
  const completedAt = new Date(stored.sourceCompletedAt).toISOString();
  if (
    stored.sourceApp !== prepared.sourceApp ||
    stored.sourceGameId !== prepared.sourceGameId ||
    completedAt !== prepared.sourceCompletedAt ||
    stored.exportVersion !== prepared.exportVersion ||
    stored.partition !== prepared.partition ||
    stored.canonicalExportSha256 !== prepared.canonicalExportSha256 ||
    stored.canonicalExport !== prepared.canonicalExport ||
    stored.decisionCount !== prepared.decisions.length
  ) {
    conflict(
      `quarantine game ${prepared.sourceGameId} already exists with different canonical evidence`,
    );
  }
}

function assertStoredDecisionsMatch(
  stored: readonly StoredDecryptoQuarantineDecision[],
  prepared: readonly PreparedTableDecryptoDecision[],
  gameId: string,
): void {
  const orderedStored = stored
    .slice()
    .sort((left, right) =>
      compareCodeUnits(left.sourceDecisionId, right.sourceDecisionId),
    );
  if (orderedStored.length !== prepared.length) {
    conflict(
      `quarantine game ${gameId} has a different durable decision set`,
    );
  }
  orderedStored.forEach((row, index) => {
    const expected = prepared[index]!;
    if (
      row.sourceDecisionId !== expected.sourceDecisionId ||
      row.idempotencyKey !== expected.idempotencyKey ||
      row.canonicalDecisionSha256 !== expected.canonicalDecisionSha256 ||
      row.canonicalDecision !== expected.canonicalDecision
    ) {
      conflict(
        `quarantine decision ${expected.sourceDecisionId} conflicts with durable canonical evidence`,
      );
    }
  });
}

export interface TableDecryptoImportResult {
  readonly status: "imported" | "already_imported";
  readonly sourceGameId: string;
  readonly canonicalExportSha256: string;
  readonly decisionCount: number;
}

export async function importPreparedTableDecryptoGame(
  store: TableDecryptoImportStore,
  prepared: PreparedTableDecryptoGame,
): Promise<TableDecryptoImportResult> {
  if (
    prepared.sourceApp !== "the-table" ||
    prepared.partition !== TABLE_DECRYPTO_QUARANTINE_PARTITION
  ) {
    invalid("prepared import is outside the fixed quarantine boundary");
  }
  return store.transaction(async (tx) => {
    const insertedGameId = await tx.insertGameIfAbsent(prepared);
    if (insertedGameId === null) {
      const storedGame = await tx.lockGame(
        prepared.sourceApp,
        prepared.sourceGameId,
      );
      if (storedGame === null) {
        conflict(
          `quarantine game ${prepared.sourceGameId} disappeared during import`,
        );
      }
      assertStoredGameMatches(storedGame, prepared);
      const storedDecisions = await tx.lockDecisions(storedGame.id);
      assertStoredDecisionsMatch(
        storedDecisions,
        prepared.decisions,
        prepared.sourceGameId,
      );
      return {
        status: "already_imported" as const,
        sourceGameId: prepared.sourceGameId,
        canonicalExportSha256: prepared.canonicalExportSha256,
        decisionCount: prepared.decisions.length,
      };
    }
    for (const decision of prepared.decisions) {
      const inserted = await tx.insertDecisionIfAbsent(
        insertedGameId,
        decision,
      );
      if (!inserted) {
        conflict(
          `idempotency collision while importing decision ${decision.sourceDecisionId}`,
        );
      }
    }
    const storedDecisions = await tx.lockDecisions(insertedGameId);
    assertStoredDecisionsMatch(
      storedDecisions,
      prepared.decisions,
      prepared.sourceGameId,
    );
    return {
      status: "imported" as const,
      sourceGameId: prepared.sourceGameId,
      canonicalExportSha256: prepared.canonicalExportSha256,
      decisionCount: prepared.decisions.length,
    };
  });
}

function pgTimestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("database returned an invalid source_completed_at");
  }
  return parsed.toISOString();
}

class PgImportTransaction implements TableDecryptoImportTransaction {
  constructor(private readonly client: PoolClient) {}

  async insertGameIfAbsent(
    game: PreparedTableDecryptoGame,
  ): Promise<number | null> {
    const result = await this.client.query<{ id: number }>(
      `INSERT INTO decrypto_quarantine_games (
         source_app,
         source_game_id,
         source_completed_at,
         export_version,
         partition,
         canonical_export,
         canonical_export_sha256,
         decision_count
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source_app, source_game_id) DO NOTHING
       RETURNING id`,
      [
        game.sourceApp,
        game.sourceGameId,
        game.sourceCompletedAt,
        game.exportVersion,
        game.partition,
        game.canonicalExport,
        game.canonicalExportSha256,
        game.decisions.length,
      ],
    );
    return result.rows[0]?.id ?? null;
  }

  async lockGame(
    sourceApp: "the-table",
    sourceGameId: string,
  ): Promise<StoredDecryptoQuarantineGame | null> {
    const result = await this.client.query<{
      id: number;
      source_app: string;
      source_game_id: string;
      source_completed_at: Date | string;
      export_version: string;
      partition: string;
      canonical_export: string;
      canonical_export_sha256: string;
      decision_count: number;
    }>(
      `SELECT
         id,
         source_app,
         source_game_id,
         source_completed_at,
         export_version,
         partition,
         canonical_export,
         canonical_export_sha256,
         decision_count
       FROM decrypto_quarantine_games
       WHERE source_app = $1 AND source_game_id = $2
       FOR UPDATE`,
      [sourceApp, sourceGameId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          sourceApp: row.source_app,
          sourceGameId: row.source_game_id,
          sourceCompletedAt: pgTimestamp(row.source_completed_at),
          exportVersion: row.export_version,
          partition: row.partition,
          canonicalExport: row.canonical_export,
          canonicalExportSha256: row.canonical_export_sha256,
          decisionCount: row.decision_count,
        }
      : null;
  }

  async insertDecisionIfAbsent(
    quarantineGameId: number,
    decision: PreparedTableDecryptoDecision,
  ): Promise<boolean> {
    const result = await this.client.query<{ id: number }>(
      `INSERT INTO decrypto_quarantine_decisions (
         quarantine_game_id,
         source_decision_id,
         idempotency_key,
         canonical_decision,
         canonical_decision_sha256
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        quarantineGameId,
        decision.sourceDecisionId,
        decision.idempotencyKey,
        decision.canonicalDecision,
        decision.canonicalDecisionSha256,
      ],
    );
    return result.rows.length === 1;
  }

  async lockDecisions(
    quarantineGameId: number,
  ): Promise<readonly StoredDecryptoQuarantineDecision[]> {
    const result = await this.client.query<{
      source_decision_id: string;
      idempotency_key: string;
      canonical_decision: string;
      canonical_decision_sha256: string;
    }>(
      `SELECT
         source_decision_id,
         idempotency_key,
         canonical_decision,
         canonical_decision_sha256
       FROM decrypto_quarantine_decisions
       WHERE quarantine_game_id = $1
       ORDER BY source_decision_id
       FOR UPDATE`,
      [quarantineGameId],
    );
    return result.rows.map((row) => ({
      sourceDecisionId: row.source_decision_id,
      idempotencyKey: row.idempotency_key,
      canonicalDecision: row.canonical_decision,
      canonicalDecisionSha256: row.canonical_decision_sha256,
    }));
  }
}

export class PgTableDecryptoImportStore implements TableDecryptoImportStore {
  constructor(private readonly pool: Pool) {}

  async transaction<T>(
    operation: (tx: TableDecryptoImportTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(new PgImportTransaction(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
