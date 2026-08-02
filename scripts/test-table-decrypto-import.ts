/**
 * Offline adversarial checks for the immutable The Table -> Herpetarium
 * Decrypto quarantine boundary. No database, server, provider, or network is
 * used: the store is transactional in memory and every export is synthesized
 * from the public wire contract.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  canonicalJson,
  contentHash,
  mintObservationV2,
  sha256Hex,
  tableCompetitiveIdentitySet,
} from "../shared/substrate";
import {
  TABLE_CIPHER_DECIDE_PARSE_EVIDENCE_VERSION,
  TABLE_CIPHER_DECIDE_PARSER_ARTIFACT_VERSION,
  TABLE_CIPHER_DECISION_POLICY_VERSION,
  TABLE_DECRYPTO_DECISION_ATTEMPT_VERSION,
  TABLE_DECRYPTO_DECISION_EXPORT_VERSION,
  TABLE_DECRYPTO_QUARANTINE_PARTITION,
  TABLE_DECRYPTO_RESOLVED_GAME_VERSION,
  TableDecryptoImportConflictError,
  TableDecryptoImportValidationError,
  importPreparedTableDecryptoGame,
  parseAndPrepareTableDecryptoImport,
  type PreparedTableDecryptoDecision,
  type PreparedTableDecryptoGame,
  type StoredDecryptoQuarantineDecision,
  type StoredDecryptoQuarantineGame,
  type TableDecryptoImportStore,
  type TableDecryptoImportTransaction,
} from "../server/tableDecryptoImport";
import {
  parseTableDecryptoImportArgs,
  readLocalTableDecryptoExport,
} from "./import-table-decrypto-export";

type JsonRecord = Record<string, unknown>;

const GAME_ID = "00000000-0000-4000-8000-000000001001";
const ACTOR_SEAT_ID = "00000000-0000-4000-8000-000000001101";
const CLUEGIVER_SEAT_ID = "00000000-0000-4000-8000-000000001102";
const BLUE_CLUEGIVER_SEAT_ID = "00000000-0000-4000-8000-000000001202";
const LOGICAL_ACTION_KEY = `${GAME_ID}/cipher/1/red/decode`;
const DECISION_ID = `decision:${contentHash([
  "the-table",
  GAME_ID,
  LOGICAL_ACTION_KEY,
])}`;
const RECORDED_AT = "2026-08-02T18:01:00.000Z";
const COMPLETED_AT = "2026-08-02T18:02:00.000Z";

let assertions = 0;

function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function throws(operation: () => unknown, pattern: RegExp, message: string): void {
  assert.throws(operation, pattern, message);
  assertions += 1;
}

async function rejects(
  operation: () => Promise<unknown>,
  expected: RegExp | (new (...args: never[]) => Error),
  message: string,
): Promise<void> {
  await assert.rejects(operation, expected, message);
  assertions += 1;
}

function withContentHash<T extends JsonRecord>(
  source: T,
): T & { readonly contentHash: string } {
  return {
    ...structuredClone(source),
    contentHash: contentHash(source),
  };
}

function addBlob(
  blobs: JsonRecord,
  value: unknown,
): {
  readonly contentHash: string;
  readonly blobRef: string;
  readonly classification: "operator";
  readonly encoding: "canonical-json-utf8";
} {
  const hash = contentHash(value);
  const blobRef = `blobs/${hash}`;
  const prior = blobs[blobRef];
  if (prior !== undefined) {
    assert.equal(canonicalJson(prior), canonicalJson(value));
  }
  blobs[blobRef] = structuredClone(value);
  return {
    contentHash: hash,
    blobRef,
    classification: "operator",
    encoding: "canonical-json-utf8",
  };
}

function eventRef(
  blobs: JsonRecord,
  event: {
    readonly id: string;
    readonly sequence: number;
    readonly eventType: string;
    readonly actorSeatId: string | null;
    readonly visibility: string;
    readonly payload: unknown;
    readonly createdAt: string;
  },
) {
  return {
    id: event.id,
    sequence: event.sequence,
    ...addBlob(blobs, event),
  };
}

function projectionDescriptor() {
  return withContentHash({
    id: "the-table-cipher-decision-observation-projection-descriptor@0.2.0",
    semanticDescriptor: {
      descriptorKind: "frozen-semantic-description",
      input: "authoritative-cipher-state+secret+role-visible-events",
      output: "shadow-DecryptoObservationV2",
      transcriptCarriesEventIdsAndLanes: true,
      providerContextCompiler: false,
      providerInputClaim: false,
    },
  });
}

function conversationDescriptor() {
  return withContentHash({
    id: "the-table-cipher-decision-conversation-selection-descriptor@0.2.0",
    semanticDescriptor: {
      descriptorKind: "frozen-semantic-description",
      eventTypes: [
        "chat_message",
        "cipher_table_talk",
        "cipher_strategy_message",
      ],
      visibilityChokepoint: "isEventVisibleToSeat",
      lanes: ["table", "team:own", "team:opponent:open"],
      maximumLines: 40,
      selection:
        "latest-role-visible-after-lane-policy-then-chronological",
      upperBound: "captured-game-row-sequence",
      teamSettingBound: true,
      providerInputClaim: false,
    },
  });
}

function shadowPolicy(role: "decoder" | "interceptor" = "decoder") {
  const withoutId = {
    policyVersion: TABLE_CIPHER_DECISION_POLICY_VERSION,
    role,
    promptVersion: "cipher-relay-fixture@1",
    observationProjectionDescriptor: projectionDescriptor(),
    conversationSelectionDescriptor: conversationDescriptor(),
    strategyTreatment: null,
    jointAssignmentPolicy: null,
    prompt: {
      baselinePrompt: "Play Decrypto strategically.",
      systemPrompt: "Protect the keyword mapping.",
      personaStyle: "Careful, terse, and competitive.",
      taskInstruction: `Return one legal ${
        role === "decoder" ? "decode" : "intercept"
      } guess.`,
    },
  };
  const source = {
    ...withoutId,
    id: `the-table-cipher-${role}-shadow-policy@0.2.0:${contentHash(
      withoutId,
    )}`,
  };
  return withContentHash(source);
}

function parserArtifact() {
  const semanticDescriptor = {
    entryPoint: "parseCipherDecideReply",
    acceptedGuessFields: ["guess", "digits", "code"],
    acceptedGuessShapes: [
      "three-element-array",
      "three-digits-in-string",
    ],
    digitDomain: "three-distinct-integers-1-through-4",
    rationaleTreatment: "parsed-at-runtime-but-never-projected",
  };
  return withContentHash({
    parserArtifactVersion: TABLE_CIPHER_DECIDE_PARSER_ARTIFACT_VERSION,
    id: `${TABLE_CIPHER_DECIDE_PARSER_ARTIFACT_VERSION}:${contentHash(
      semanticDescriptor,
    )}`,
    semanticDescriptor,
  });
}

function resolvedGame() {
  return {
    resolvedGameVersion: TABLE_DECRYPTO_RESOLVED_GAME_VERSION,
    gameId: GAME_ID,
    protocol: "cipher_relay",
    teamChatVisibility: "private",
    teams: {
      red: {
        keywords: ["alder", "beacon", "copper", "delta"],
        finalTokens: { intercepts: 0, miscommunications: 2 },
      },
      blue: {
        keywords: ["ember", "fjord", "grove", "harbor"],
        finalTokens: { intercepts: 0, miscommunications: 0 },
      },
    },
    rounds: [
      {
        roundNumber: 1,
        teams: {
          red: {
            cluegiverSeatId: "00000000-0000-4000-8000-000000001103",
            clues: ["ash", "signal", "coin"],
            code: [1, 2, 3],
            decode: [1, 2, 4],
            opponentIntercept: null,
          },
          blue: {
            cluegiverSeatId: "00000000-0000-4000-8000-000000001203",
            clues: ["spark", "ridge", "dock"],
            code: [2, 3, 4],
            decode: [2, 3, 4],
            opponentIntercept: null,
          },
        },
      },
      {
        roundNumber: 2,
        teams: {
          red: {
            cluegiverSeatId: CLUEGIVER_SEAT_ID,
            clues: ["branch", "radio", "ore"],
            code: [1, 3, 4],
            decode: [1, 2, 4],
            opponentIntercept: [1, 4, 3],
          },
          blue: {
            cluegiverSeatId: BLUE_CLUEGIVER_SEAT_ID,
            clues: ["flame", "peak", "port"],
            code: [2, 4, 1],
            decode: [2, 4, 1],
            opponentIntercept: [1, 2, 3],
          },
        },
      },
    ],
    winner: "blue",
    winReason: "two_miscommunications",
  };
}

function validObservation(
  policy: ReturnType<typeof shadowPolicy>,
  role: "decoder" | "interceptor" = "decoder",
) {
  const taskKind = role === "decoder" ? "decode" : "intercept";
  const logicalActionKey = `${GAME_ID}/cipher/1/red/${taskKind}`;
  const decisionId = `decision:${contentHash([
    "the-table",
    GAME_ID,
    logicalActionKey,
  ])}`;
  return mintObservationV2({
    observationVersion: "0.2",
    decisionId,
    logicalActionKey,
    gameId: GAME_ID,
    roundNumber: 2,
    actor: {
      actorId: "ai-profile:fixture-decoder",
      seatId: ACTOR_SEAT_ID,
      team: "red",
      role,
    },
    activeCluegiverSeatId: CLUEGIVER_SEAT_ID,
    identities: {
      botBuild: { id: policy.id, contentHash: policy.contentHash },
      ...tableCompetitiveIdentitySet(),
    },
    role,
    team: "red",
    ownKeywords:
      role === "decoder" ? ["alder", "beacon", "copper", "delta"] : null,
    ownClues: ["branch", "radio", "ore"],
    opponentClues: ["flame", "peak", "port"],
    resolvedRounds: [
      {
        roundNumber: 1,
        own: {
          clues: ["ash", "signal", "coin"],
          code: [1, 2, 3],
          ownDecode: [1, 2, 4],
          intercept: null,
          decodedCorrectly: false,
          wasIntercepted: null,
        },
        opponent: {
          clues: ["spark", "ridge", "dock"],
          code: [2, 3, 4],
          ownDecode: [2, 3, 4],
          intercept: null,
          decodedCorrectly: true,
          wasIntercepted: null,
        },
      },
    ],
    tokens: {
      own: { intercepts: 0, miscommunications: 1 },
      opponent: { intercepts: 0, miscommunications: 0 },
    },
    teamChatVisibility: "private",
    decisionFocus:
      role === "decoder"
        ? "Lock the own-team decode without exposing keywords."
        : "Intercept the opposing code without seeing their keywords.",
    transcript: [
      {
        eventId: "00000000-0000-4000-8000-000000001301",
        speakerActorId: "seat:00000000-0000-4000-8000-000000001104",
        lane: "team:own",
        text: "The first and third associations feel strongest.",
      },
    ],
  });
}

function parseEvidence(
  parser: ReturnType<typeof parserArtifact>,
  pending: boolean,
  taskKind: "decode" | "intercept",
  guess: [number, number, number],
) {
  const validator = { id: parser.id, contentHash: parser.contentHash };
  return pending
    ? withContentHash({
        parseEvidenceVersion: TABLE_CIPHER_DECIDE_PARSE_EVIDENCE_VERSION,
        status: "not_run",
        notRunReason: "pending_runtime_parse",
        parser,
        action: null,
        validation: {
          status: "not_run",
          validator,
          problems: [],
        },
      })
    : withContentHash({
        parseEvidenceVersion: TABLE_CIPHER_DECIDE_PARSE_EVIDENCE_VERSION,
        status: "accepted",
        notRunReason: null,
        parser,
        action: {
          kind: "guess",
          role: taskKind,
          guess,
        },
        validation: {
          status: "accepted",
          validator,
          problems: [],
        },
      });
}

function tableExport(
  options: {
    readonly pendingParse?: boolean;
    readonly role?: "decoder" | "interceptor";
    readonly immediateCorrect?: boolean;
    readonly resolvedMismatch?: boolean;
  } = {},
) {
  const blobs: JsonRecord = {};
  const role = options.role ?? "decoder";
  const taskKind = role === "decoder" ? "decode" : "intercept";
  const logicalActionKey = `${GAME_ID}/cipher/1/red/${taskKind}`;
  const decisionId = `decision:${contentHash([
    "the-table",
    GAME_ID,
    logicalActionKey,
  ])}`;
  const guess: [number, number, number] =
    options.resolvedMismatch === true
      ? [1, 3, 4]
      : role === "decoder"
        ? [1, 2, 4]
        : [1, 2, 3];
  const policy = shadowPolicy(role);
  const observation = validObservation(policy, role);
  const parser = parserArtifact();
  const evidence = parseEvidence(
    parser,
    options.pendingParse === true,
    taskKind,
    guess,
  );
  const pending = options.pendingParse === true;
  const parsedAction = pending
    ? null
    : {
        action: {
          kind: "guess",
          role: taskKind,
          guess,
        },
        contentHash: contentHash({
          kind: "guess",
          role: taskKind,
          guess,
        }),
      };
  const actionEvent = {
    id: "00000000-0000-4000-8000-000000001401",
    sequence: 41,
    eventType:
      role === "decoder"
        ? "cipher_decode_submitted"
        : "cipher_intercept_submitted",
    actorSeatId: ACTOR_SEAT_ID,
    visibility: "team:red",
    payload: {
      roundIndex: 1,
      byTeam: "red",
      actorSeatId: ACTOR_SEAT_ID,
      guess,
      ...(role === "interceptor" ? { targetTeam: "blue" } : {}),
      ...(options.immediateCorrect === true ? { correct: false } : {}),
    },
    createdAt: RECORDED_AT,
  };
  const outcomeEvent = {
    id: "00000000-0000-4000-8000-000000001402",
    sequence: 42,
    eventType: "cipher_round_resolved",
    actorSeatId: ACTOR_SEAT_ID,
    visibility: "public",
    payload: {
      roundIndex: 1,
      redTokens: { intercepts: 0, miscommunications: 2 },
      blueTokens: { intercepts: 0, miscommunications: 0 },
    },
    createdAt: COMPLETED_AT,
  };
  const requestRef = pending
    ? null
    : addBlob(blobs, {
        model: "fixture-model",
        messages: [{ role: "user", content: "exact fixture request" }],
      });
  const responseRef = pending
    ? null
    : addBlob(blobs, '{"rationale":"private","guess":[1,2,4]}');
  const source = {
    attemptVersion: TABLE_DECRYPTO_DECISION_ATTEMPT_VERSION,
    app: "the-table",
    gameId: GAME_ID,
    roundNumber: 2,
    decisionId,
    attemptId: "ai-call:00000000-0000-4000-8000-000000001501",
    logicalActionKey,
    actor: observation.actor,
    role,
    taskKind,
    identities: observation.identities,
    inputs: {
      shadowObservation: addBlob(blobs, observation),
      shadowCapturePolicy: addBlob(blobs, policy),
      requestJson: requestRef,
    },
    outputs: {
      responseText: responseRef,
      responseMeta: null,
      runtimeParseEvidence: addBlob(blobs, evidence),
    },
    runtime: {
      appSha: "fixture-app-sha",
      promptVersion: policy.promptVersion,
      rulesetVersion: "cipher_relay@1",
      attemptOrdinal: 1,
      parserArtifact: addBlob(blobs, parser),
    },
    provider: {
      requestedProvider: "openai",
      requestedModel: "fixture-model",
      reasoningEffort: "high",
      reasoningMode: "standard",
      timeMode: "async",
      targetSeconds: 180,
      invocationStatus: pending ? "failed" : "succeeded",
      recordStatus: pending ? "error" : "ok",
      failureStage: pending ? "provider" : null,
    },
    parsedAction,
    validation: evidence.validation,
    application: {
      taskId: "00000000-0000-4000-8000-000000001601",
      taskStatus: pending ? "failed" : "done",
      applied: !pending,
      logicalActionKey,
      parsedActionHash: parsedAction?.contentHash ?? null,
      actionEvent: pending ? null : eventRef(blobs, actionEvent),
    },
    outcome: {
      status: pending ? "not_applied" : "resolved",
      outcomeEvent: pending ? null : eventRef(blobs, outcomeEvent),
    },
    telemetry: {
      recordedAt: RECORDED_AT,
      latencyMs: 4_000,
      tokensIn: 100,
      tokensOut: 20,
    },
  };
  const attempt = withContentHash(source);
  const decision = {
    decisionId,
    logicalActionKey,
    roundNumber: 2,
    role,
    actorTeam: "red",
    targetTeam: role === "interceptor" ? "blue" : null,
    resolution: pending
      ? "completed_without_ai_application"
      : "ai_attempt_applied",
    appliedAttemptId: pending ? null : attempt.attemptId,
    attempts: [attempt],
  };
  const exportSource = {
    exportVersion: TABLE_DECRYPTO_DECISION_EXPORT_VERSION,
    app: "the-table",
    gameId: GAME_ID,
    sourceCompletedAt: COMPLETED_AT,
    partitionLabel: TABLE_DECRYPTO_QUARANTINE_PARTITION,
    classification: "operator",
    resolvedGame: addBlob(blobs, resolvedGame()),
    decisions: [decision],
    blobs,
  };
  return withContentHash(exportSource);
}

function canonicalFixture(options: { readonly pendingParse?: boolean } = {}) {
  return canonicalJson(tableExport(options));
}

function cloneMapValues<T>(source: Map<string | number, T>): Map<string | number, T> {
  return new Map(
    [...source.entries()].map(([key, value]) => [key, structuredClone(value)]),
  );
}

class MemoryImportStore
  implements TableDecryptoImportStore, TableDecryptoImportTransaction
{
  games = new Map<string, StoredDecryptoQuarantineGame>();
  decisions = new Map<number, StoredDecryptoQuarantineDecision[]>();
  nextGameId = 1;
  failAfterDecisionInsert = false;

  async transaction<T>(
    operation: (tx: TableDecryptoImportTransaction) => Promise<T>,
  ): Promise<T> {
    const gamesBefore = cloneMapValues(this.games) as Map<
      string,
      StoredDecryptoQuarantineGame
    >;
    const decisionsBefore = cloneMapValues(this.decisions) as Map<
      number,
      StoredDecryptoQuarantineDecision[]
    >;
    const nextBefore = this.nextGameId;
    try {
      return await operation(this);
    } catch (error) {
      this.games = gamesBefore;
      this.decisions = decisionsBefore;
      this.nextGameId = nextBefore;
      throw error;
    }
  }

  async insertGameIfAbsent(
    game: PreparedTableDecryptoGame,
  ): Promise<number | null> {
    const key = `${game.sourceApp}/${game.sourceGameId}`;
    if (this.games.has(key)) return null;
    const id = this.nextGameId++;
    this.games.set(key, {
      id,
      sourceApp: game.sourceApp,
      sourceGameId: game.sourceGameId,
      sourceCompletedAt: game.sourceCompletedAt,
      exportVersion: game.exportVersion,
      partition: game.partition,
      canonicalExport: game.canonicalExport,
      canonicalExportSha256: game.canonicalExportSha256,
      decisionCount: game.decisions.length,
    });
    this.decisions.set(id, []);
    return id;
  }

  async lockGame(
    sourceApp: "the-table",
    sourceGameId: string,
  ): Promise<StoredDecryptoQuarantineGame | null> {
    return this.games.get(`${sourceApp}/${sourceGameId}`) ?? null;
  }

  async insertDecisionIfAbsent(
    quarantineGameId: number,
    decision: PreparedTableDecryptoDecision,
  ): Promise<boolean> {
    if (
      [...this.decisions.values()]
        .flat()
        .some((row) => row.idempotencyKey === decision.idempotencyKey)
    ) {
      return false;
    }
    const rows = this.decisions.get(quarantineGameId);
    if (!rows) throw new Error("missing quarantine parent");
    rows.push(structuredClone(decision));
    if (this.failAfterDecisionInsert) {
      throw new Error("simulated process failure after child insert");
    }
    return true;
  }

  async lockDecisions(
    quarantineGameId: number,
  ): Promise<readonly StoredDecryptoQuarantineDecision[]> {
    return structuredClone(this.decisions.get(quarantineGameId) ?? []);
  }
}

async function testStrictWireValidation(): Promise<PreparedTableDecryptoGame> {
  const prepared = parseAndPrepareTableDecryptoImport(canonicalFixture());
  equal(prepared.sourceGameId, GAME_ID, "valid export binds its game");
  equal(
    prepared.partition,
    "legacy_unassigned",
    "valid export remains in the fixed quarantine partition",
  );
  equal(prepared.decisions.length, 1, "valid export retains its decision");
  equal(
    prepared.decisions[0]!.idempotencyKey,
    sha256Hex(canonicalJson(["the-table", GAME_ID, DECISION_ID])),
    "decision idempotency key follows the exact cross-app formula",
  );

  const interceptor = parseAndPrepareTableDecryptoImport(
    canonicalJson(tableExport({ role: "interceptor" })),
  );
  const interceptorDecision = JSON.parse(
    interceptor.decisions[0]!.canonicalDecision,
  ) as JsonRecord;
  equal(
    interceptorDecision.targetTeam,
    "blue",
    "interceptor group binds the opponent target explicitly",
  );
  equal(
    (
      (
        (interceptorDecision.attempts as JsonRecord[])[0]!.parsedAction as
          JsonRecord
      ).action as JsonRecord
    ).role,
    "intercept",
    "interceptor runtime action contract verifies end to end",
  );

  throws(
    () =>
      parseAndPrepareTableDecryptoImport(
        canonicalJson(tableExport({ immediateCorrect: true })),
      ),
    /invalid fields.*unknown correct/,
    "sanitized action evidence rejects immediate correctness",
  );

  throws(
    () =>
      parseAndPrepareTableDecryptoImport(
        canonicalJson(tableExport({ resolvedMismatch: true })),
      ),
    /action event payload contradicts the attempt/,
    "applied action must equal the completed game's resolved guess",
  );

  const duplicateSlot = tableExport() as JsonRecord;
  const duplicateSlotDecisions = duplicateSlot.decisions as JsonRecord[];
  const forgedDecision = structuredClone(duplicateSlotDecisions[0]!);
  const forgedLogicalActionKey = `${GAME_ID}/cipher/1/red/decode-z`;
  forgedDecision.logicalActionKey = forgedLogicalActionKey;
  forgedDecision.decisionId = `decision:${contentHash([
    "the-table",
    GAME_ID,
    forgedLogicalActionKey,
  ])}`;
  duplicateSlot.decisions = [duplicateSlotDecisions[0]!, forgedDecision];
  const { contentHash: _duplicateSlotHash, ...duplicateSlotSource } =
    duplicateSlot;
  duplicateSlot.contentHash = contentHash(duplicateSlotSource);
  throws(
    () =>
      parseAndPrepareTableDecryptoImport(canonicalJson(duplicateSlot)),
    /duplicates the \(roundNumber, role, actorTeam\) decision slot/,
    "different logical keys cannot duplicate one real gameplay decision slot",
  );

  const tampered = tableExport();
  const requestRef = (
    (tampered.decisions[0] as JsonRecord).attempts as JsonRecord[]
  )[0]!.inputs as JsonRecord;
  const requestBlobRef = (requestRef.requestJson as JsonRecord).blobRef as string;
  (tampered.blobs[requestBlobRef] as JsonRecord).model = "tampered-model";
  const { contentHash: _tamperedTopHash, ...tamperedSource } = tampered;
  (tampered as unknown as JsonRecord).contentHash =
    contentHash(tamperedSource);
  throws(
    () => parseAndPrepareTableDecryptoImport(JSON.stringify(tampered)),
    /contentHash|content address|content hash/,
    "deep blob tampering fails before persistence",
  );

  const missing = tableExport();
  const missingInputs = (
    ((missing.decisions[0] as JsonRecord).attempts as JsonRecord[])[0]!
      .inputs as JsonRecord
  );
  delete missing.blobs[
    (missingInputs.shadowObservation as JsonRecord).blobRef as string
  ];
  const { contentHash: _missingTopHash, ...missingSource } = missing;
  (missing as unknown as JsonRecord).contentHash = contentHash(missingSource);
  throws(
    () => parseAndPrepareTableDecryptoImport(JSON.stringify(missing)),
    /references missing blob/,
    "missing referenced blobs fail closed",
  );

  throws(
    () =>
      parseAndPrepareTableDecryptoImport(
        canonicalFixture({ pendingParse: true }),
      ),
    /pending runtime parse evidence/,
    "pending runtime parse evidence is never quarantined as complete",
  );

  const privateClassification = tableExport() as JsonRecord;
  privateClassification.classification = "private";
  const { contentHash: _ignored, ...privateSource } = privateClassification;
  privateClassification.contentHash = contentHash(privateSource);
  throws(
    () =>
      parseAndPrepareTableDecryptoImport(
        canonicalJson(privateClassification),
      ),
    /classification must be "operator"/,
    "participant-private classification cannot cross the operator boundary",
  );

  const wrongPartition = tableExport() as JsonRecord;
  wrongPartition.partitionLabel = "private";
  const { contentHash: _oldHash, ...wrongPartitionSource } = wrongPartition;
  wrongPartition.contentHash = contentHash(wrongPartitionSource);
  throws(
    () => parseAndPrepareTableDecryptoImport(canonicalJson(wrongPartition)),
    /partitionLabel must be "legacy_unassigned"/,
    "source cannot assign a private or training partition",
  );
  return prepared;
}

async function testImmutableTransactionSemantics(
  prepared: PreparedTableDecryptoGame,
): Promise<void> {
  const store = new MemoryImportStore();
  const first = await importPreparedTableDecryptoGame(store, prepared);
  equal(first.status, "imported", "first import inserts immutable evidence");
  equal(store.games.size, 1, "first import inserts one parent");
  equal(
    [...store.decisions.values()][0]?.length,
    1,
    "first import inserts its child decision",
  );

  const repeated = await importPreparedTableDecryptoGame(store, prepared);
  equal(
    repeated.status,
    "already_imported",
    "byte-exact reimport is a no-op",
  );
  equal(store.games.size, 1, "no-op reimport creates no parent");
  equal(
    [...store.decisions.values()][0]?.length,
    1,
    "no-op reimport creates no child",
  );

  const mismatch = structuredClone(prepared) as {
    -readonly [K in keyof PreparedTableDecryptoGame]:
      PreparedTableDecryptoGame[K];
  };
  mismatch.canonicalExport = `${mismatch.canonicalExport}\n`;
  mismatch.canonicalExportSha256 = sha256Hex(mismatch.canonicalExport);
  await rejects(
    () => importPreparedTableDecryptoGame(store, mismatch),
    TableDecryptoImportConflictError,
    "same source game with different canonical evidence conflicts",
  );
  equal(store.games.size, 1, "mismatch rollback preserves one parent");
  equal(
    [...store.decisions.values()][0]?.length,
    1,
    "mismatch rollback never repairs or replaces children",
  );

  const incomplete = new MemoryImportStore();
  await importPreparedTableDecryptoGame(incomplete, prepared);
  const incompleteGameId = [...incomplete.games.values()][0]!.id;
  incomplete.decisions.set(incompleteGameId, []);
  await rejects(
    () => importPreparedTableDecryptoGame(incomplete, prepared),
    TableDecryptoImportConflictError,
    "existing parent with missing children is a conflict",
  );
  equal(
    incomplete.decisions.get(incompleteGameId)?.length,
    0,
    "reimport never repairs an incomplete durable decision set",
  );

  const failing = new MemoryImportStore();
  failing.failAfterDecisionInsert = true;
  await rejects(
    () => importPreparedTableDecryptoGame(failing, prepared),
    /simulated process failure/,
    "child failure aborts the enclosing transaction",
  );
  equal(failing.games.size, 0, "partial failure rolls back the parent");
  equal(failing.decisions.size, 0, "partial failure rolls back all children");
}

async function testLocalFileBoundary(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "table-decrypto-import-"));
  try {
    const file = join(directory, "export.json");
    const link = join(directory, "export-link.json");
    const fixture = canonicalFixture();
    await writeFile(file, fixture, { encoding: "utf8", mode: 0o600 });
    await symlink(file, link);
    equal(
      await readLocalTableDecryptoExport(file),
      fixture,
      "CLI reads one bounded local regular file",
    );
    await rejects(
      () => readLocalTableDecryptoExport(link),
      /regular file, not a link or directory/,
      "CLI rejects symbolic links",
    );
    throws(
      () =>
        parseTableDecryptoImportArgs([
          "--file",
          file,
          "--partition",
          "private",
        ]),
      /explicitly legacy_unassigned/,
      "CLI requires the quarantine partition explicitly",
    );
    throws(
      () =>
        parseTableDecryptoImportArgs([
          "--file",
          "https://example.test/export.json",
          "--partition",
          "legacy_unassigned",
        ]),
      /local filesystem path/,
      "CLI rejects URL input",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function testMigrationMetadata(): Promise<void> {
  const root = resolve(import.meta.dirname, "..");
  const [migration, snapshotText, journalText] = await Promise.all([
    readFile(
      join(root, "migrations/0013_decrypto_quarantine_import.sql"),
      "utf8",
    ),
    readFile(join(root, "migrations/meta/0013_snapshot.json"), "utf8"),
    readFile(join(root, "migrations/meta/_journal.json"), "utf8"),
  ]);
  const snapshot = JSON.parse(snapshotText) as JsonRecord;
  const journal = JSON.parse(journalText) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const tables = snapshot.tables as JsonRecord;
  ok(
    tables["public.decrypto_quarantine_games"],
    "Drizzle snapshot includes the quarantine parent",
  );
  ok(
    tables["public.decrypto_quarantine_decisions"],
    "Drizzle snapshot includes the quarantine child",
  );
  ok(
    journal.entries.some(
      (entry) =>
        entry.idx === 13 &&
        entry.tag === "0013_decrypto_quarantine_import",
    ),
    "Drizzle journal includes migration 0013",
  );
  ok(
    migration.includes("ON DELETE restrict") &&
      migration.includes("reject_decrypto_quarantine_mutation") &&
      (
        migration.match(
          /BEFORE UPDATE OR DELETE OR TRUNCATE ON "decrypto_quarantine_/g,
        ) ?? []
      ).length === 2 &&
      !/\b(label|promotion|training|evaluation)\b/i.test(migration),
    "migration is append-only quarantine storage with no inferred labels",
  );
}

async function main(): Promise<void> {
  const prepared = await testStrictWireValidation();
  await testImmutableTransactionSemantics(prepared);
  await testLocalFileBoundary();
  await testMigrationMetadata();
  console.log(
    `Table Decrypto quarantine import checks passed (${assertions} assertions)`,
  );
}

void main().catch((error) => {
  if (
    error instanceof TableDecryptoImportValidationError ||
    error instanceof TableDecryptoImportConflictError
  ) {
    process.stderr.write(`${error.name}: ${error.message}\n`);
  } else {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
  }
  process.exitCode = 1;
});
