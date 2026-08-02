/**
 * Offline release-blocking checks for strict Herpetarium research execution.
 *
 * This script deliberately uses no credentials, network, or database. Provider
 * behavior is exercised through a mocked global fetch. Modules whose imports
 * currently start the HTTP server or require DATABASE_URL are checked through
 * TypeScript-AST function bodies until those modules gain explicit dependency
 * injection.
 *
 * Usage:
 *   npm run test:strict-execution
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import type { AIPlayerConfig, HeadlessMatchConfig } from "@shared/schema";
import { getConfigForModel } from "@shared/modelRegistry";
import {
  callAI,
  generateClues,
  generateGuess,
  generateInterception,
  generateReflection,
  resetProviderThrottleState,
} from "../server/ai";
import {
  auditBlindClues,
  evaluateBlindInversion,
} from "../server/blindInversion";
import {
  auditCrossRoundColumns,
  ledgerFromTeamHistory,
  parseCrossRoundAuditorReply,
} from "../server/crossRoundInversion";
import {
  CROSS_ROUND_AUDITOR_BATCH_SIZE,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_AUDITOR_SYSTEM_PROMPT,
  CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01,
  CROSS_ROUND_COLUMN_LEAK_2026_08_01,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  PROVISIONAL_INVERSION_VETO_POLICY_ID,
  buildPublicClueLedger,
  combineInversionOutcomes,
  evaluateCrossRoundInversion,
} from "@shared/substrate";
import { validateModels } from "../server/modelValidation";

const EXACT_MODEL = "deepseek/deepseek-v4-flash-0731";
const TEST_API_KEY = "offline-strict-execution-test-key";

const deepSeekConfig: AIPlayerConfig = {
  provider: "openrouter",
  model: EXACT_MODEL,
  timeoutMs: 10_000,
  promptStrategy: "advanced",
  reasoningEffort: "xhigh",
};

interface MockResponseOverrides {
  content?: string;
  model?: string;
  provider?: string;
  finishReason?: string;
  attempt?: number;
  attempts?: unknown;
  omitAttempts?: boolean;
  availableEndpoints?: unknown[];
  status?: number;
  errorBody?: string;
}

interface CapturedRequest {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

let assertions = 0;
const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENROUTER_API_KEY;

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

function mockOpenRouterResponse(
  overrides: MockResponseOverrides = {},
): Response {
  const status = overrides.status ?? 200;
  if (status >= 400) {
    return new Response(overrides.errorBody ?? "offline provider failure", {
      status,
      headers: {
        "content-type": "text/plain",
        "x-request-id": "request-offline-failure",
      },
    });
  }

  const openRouterMetadata: Record<string, unknown> = {
    attempt: overrides.attempt ?? 1,
    endpoints: {
      available:
        overrides.availableEndpoints ??
        [{ provider: "DeepInfra", selected: true }],
    },
  };
  if (!overrides.omitAttempts) {
    openRouterMetadata.attempts =
      overrides.attempts === undefined
        ? [{ provider: "DeepInfra", status: 200 }]
        : overrides.attempts;
  }

  const body = {
    id: "generation-offline-test",
    model: overrides.model ?? EXACT_MODEL,
    provider: overrides.provider ?? "DeepInfra",
    choices: [
      {
        message: {
          content: overrides.content ?? "ANSWER: 1,2,3",
        },
        finish_reason: overrides.finishReason ?? "stop",
        native_finish_reason: "stop",
      },
    ],
    openrouter_metadata: openRouterMetadata,
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
      cost: 0.00000225,
      completion_tokens_details: { reasoning_tokens: 3 },
      prompt_tokens_details: { cached_tokens: 0 },
    },
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": "request-offline-success",
    },
  });
}

function installFetchMock(
  responses: MockResponseOverrides[],
): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  let responseIndex = 0;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const normalizedInit = init ?? {};
    const body =
      typeof normalizedInit.body === "string"
        ? (JSON.parse(normalizedInit.body) as Record<string, unknown>)
        : {};
    captured.push({ url, init: normalizedInit, body });

    const response = responses[responseIndex];
    responseIndex += 1;
    if (!response) {
      throw new Error(
        `Offline fetch mock received unexpected request ${responseIndex}`,
      );
    }
    return mockOpenRouterResponse(response);
  }) as typeof fetch;

  return captured;
}

async function expectReject(
  operation: () => Promise<unknown>,
  messagePattern: RegExp,
): Promise<Error> {
  try {
    await operation();
  } catch (error) {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    ok(
      messagePattern.test(normalized.message),
      `Expected "${normalized.message}" to match ${messagePattern}`,
    );
    return normalized;
  }
  assert.fail(`Expected operation to reject with ${messagePattern}`);
}

function assertPinnedRoute(body: Record<string, unknown>): void {
  equal(body.model, EXACT_MODEL, "request uses the exact dated model slug");
  deepEqual(
    body.provider,
    {
      only: ["deepinfra"],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
    },
    "request pins DeepInfra and disables router fallbacks",
  );
  ok(
    typeof body.max_tokens === "number" && body.max_tokens <= 65_536,
    "request respects the DeepInfra completion-token ceiling",
  );
}

/**
 * The cross-round column instrument: the history-aware audit that the 0.1
 * roadmap named as the only reachable route to the accumulated-history leak
 * class, driven by the exact 2026-08-01 production incident.
 */
async function testCrossRoundColumnInversionProtocol(): Promise<void> {
  const leak = CROSS_ROUND_COLUMN_LEAK_2026_08_01;
  const ledger = ledgerFromTeamHistory(
    leak.resolvedRounds.map((round) => ({
      clues: [...round.clues],
      targetCode: [...round.code] as [number, number, number],
    })),
  );
  const code = leak.leakingRound.code as unknown as [number, number, number];
  const clues = leak.leakingRound.clues as unknown as [string, string, string];

  // 1. The instrument is shared with The Table, not merely similar to it.
  equal(
    CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
    "cross-round-referent-evidence@0.3-probe",
    "cross-round protocol version is pinned",
  );
  ok(
    CROSS_ROUND_COLUMN_VETO_POLICY_ID !== PROVISIONAL_INVERSION_VETO_POLICY_ID,
    "cross-round veto policy does not reuse the frozen blind-inversion id",
  );
  equal(
    CROSS_ROUND_AUDITOR_BATCH_SIZE,
    3,
    "cross-round auditor batch size is fixed at one submission",
  );
  ok(
    /^[a-f0-9]{64}$/.test(CROSS_ROUND_AUDITOR_PROMPT_HASH) &&
      /^[a-f0-9]{64}$/.test(CROSS_ROUND_COLUMN_VETO_POLICY_HASH),
    "cross-round prompt and policy hashes are sha-256 digests",
  );

  // 2. The provider call carries public state only, at full strength.
  const captured = installFetchMock([
    {
      content: JSON.stringify({
        historyMatches: code.map((slot, index) => ({
          clueIndex: index + 1,
          matches: [1, 2, 3, 4].map((candidate) => ({
            slot: candidate,
            sharedReferent: candidate === slot ? "shared parent" : null,
            publicClue:
              candidate === slot
                ? (leak.resolvedRounds[0]!.clues[
                    leak.resolvedRounds[0]!.code.indexOf(slot)
                  ] ?? null)
                : null,
            strength: candidate === slot ? "strong" : "none",
          })),
        })),
        codeHypotheses: [
          { code: [...code], support: "strong", rationale: null },
        ],
      }),
    },
  ]);
  const run = await auditCrossRoundColumns(ledger, clues, {
    config: deepSeekConfig,
    now: () => new Date("2026-08-01T12:00:00.000Z"),
  });
  equal(captured.length, 1, "cross-round inversion makes one strict call");
  deepEqual(
    captured[0].body.reasoning,
    // The registry maps this route's xhigh onto the wire's max tier, so this
    // asserts the auditor really is dispatched at full strength.
    { effort: "max", exclude: true },
    "cross-round inversion does not weaken full-strength reasoning",
  );
  const requestText = JSON.stringify(captured[0].body);
  for (const keyword of leak.ownKeywords) {
    ok(
      !requestText.includes(keyword) &&
        !requestText.toLowerCase().includes(keyword.toLowerCase()),
      `cross-round request withholds the secret keyword ${keyword}`,
    );
  }
  ok(
    !requestText.includes(JSON.stringify(code)),
    "cross-round request withholds the intended code",
  );
  for (const publicClue of leak.resolvedRounds[0].clues) {
    ok(
      requestText.includes(publicClue),
      `cross-round request carries the public ledger clue ${publicClue}`,
    );
  }
  ok(
    requestText.includes(CROSS_ROUND_AUDITOR_SYSTEM_PROMPT.slice(0, 60)),
    "cross-round request uses the shared substrate auditor prompt",
  );
  equal(
    run.auditorPromptHash,
    CROSS_ROUND_AUDITOR_PROMPT_HASH,
    "cross-round run records the shared instrument prompt hash",
  );
  equal(run.ledgerClueCount, 3, "cross-round run records ledger depth");

  // 3. The regression itself: the single-clue gate passes, this one vetoes.
  const conceptEvaluations = evaluateBlindInversion(
    leak.blindConceptAudit.map((audit) => ({
      clue: audit.clue,
      concepts: audit.concepts.map((concept) => ({ ...concept })),
      definitionShaped: audit.definitionShaped,
      directness: audit.directness,
    })),
    code.map((slot) => leak.ownKeywords[slot - 1]!),
  );
  ok(
    conceptEvaluations.every((evaluation) => evaluation.outcome === "pass"),
    "the honest single-clue audit still passes the 2026-08-01 clues",
  );
  const leakEvaluation = evaluateCrossRoundInversion(run.reply, code, ledger);
  equal(
    leakEvaluation.outcome,
    "hard_veto",
    "cross-round audit hard-vetoes the 2026-08-01 production leak",
  );
  equal(
    leakEvaluation.actionableIntendedEdges,
    3,
    "all three history-bearing columns carry an actionable shared referent",
  );
  equal(
    combineInversionOutcomes([
      conceptEvaluations[0].outcome,
      leakEvaluation.outcome,
    ]),
    "hard_veto",
    "the strictest of the two independent gates wins",
  );

  // Every scripted reply below satisfies the 0.2 contract: a complete 3x4
  // association matrix plus a committed legal triple. A partial row is a hard
  // parse reject now, because the omitted cell is exactly the one the global
  // assignment needs.
  // v0.3 replies: a per-clue-per-slot evidence grid plus a support-tiered,
  // array-order-independent credible set. `historyBearing` guards the
  // empty-column invariant — a slot with no
  // public clues can never host a referent, and the evaluator rejects any
  // reply that claims one.
  const clueFor = (
    target: typeof ledger,
    slot: number,
  ): string | null => target.find((c) => c.number === slot)?.clues[0] ?? null;
  const scriptedReplyFor = (
    target: typeof ledger,
    rows: readonly (readonly [number, string, "plausible" | "strong"][])[],
    codes: readonly (readonly [number, number, number])[],
    support: "weak" | "plausible" | "strong" = "strong",
  ) =>
    JSON.stringify({
      historyMatches: rows.map((row, index) => ({
        clueIndex: index + 1,
        matches: [1, 2, 3, 4].map((slot) => {
          const edge = row.find((candidate) => candidate[0] === slot);
          const quote = edge ? clueFor(target, slot) : null;
          return {
            slot,
            sharedReferent: edge && quote ? edge[1] : null,
            publicClue: edge && quote ? quote : null,
            strength: edge && quote ? edge[2] : "none",
          };
        }),
      })),
      codeHypotheses: codes.map((code) => ({
        code,
        support,
        rationale: null,
      })),
    });
  const scriptedReply = (
    rows: readonly (readonly [number, string, "plausible" | "strong"][])[],
    codes: readonly (readonly [number, number, number])[],
    support: "weak" | "plausible" | "strong" = "strong",
  ) => scriptedReplyFor(ledger, rows, codes, support);
  const recoveringReplyFor = (
    target: typeof ledger,
    slots: readonly [number, number, number],
    historyBearing: readonly number[],
  ) =>
    scriptedReplyFor(
      target,
      slots.map((slot) =>
        historyBearing.includes(slot)
          ? ([[slot, "shared parent", "strong"]] as [
              number,
              string,
              "strong",
            ][])
          : [],
      ),
      [slots],
    );
  const recoveringReply = (
    slots: readonly [number, number, number],
    historyBearing: readonly number[],
  ) => recoveringReplyFor(ledger, slots, historyBearing);

  // The Blue half of the production smoke proves that a live code position
  // with no resolved clue history remains a negative control.
  const blue = CROSS_ROUND_COLUMN_LEAK_BLUE_2026_08_01;
  const blueLedger = ledgerFromTeamHistory(
    blue.resolvedRounds.map((round) => ({
      clues: [...round.clues],
      targetCode: [...round.code] as [number, number, number],
    })),
  );
  const blueCode = [...blue.leakingRound.code] as [number, number, number];
  const blueClues = [...blue.leakingRound.clues] as [
    string,
    string,
    string,
  ];
  // Blue's slot 4 carries no public history, so only slots 1 and 3 can host
  // evidence; the veto must rest on those two alone.
  const blueAudits = parseCrossRoundAuditorReply(
    recoveringReplyFor(blueLedger, blueCode, [1, 2, 3]),
    blueClues,
  );
  const blueEvaluation = evaluateCrossRoundInversion(
    blueAudits,
    blueCode,
    blueLedger,
  );
  equal(
    blueEvaluation.outcome,
    "hard_veto",
    "the exact Blue production leak hard-vetoes",
  );
  equal(
    blueEvaluation.actionableIntendedEdges,
    2,
    "Blue locks only the two columns with resolved history",
  );
  equal(
    blueEvaluation.positions[0]!.columnHadHistory,
    false,
    "Blue slot 4 is the history-free negative control",
  );
  equal(
    blueEvaluation.positions[0]!.intendedHistoryEdge,
    false,
    "a correct slot-4 guess is not misattributed to cross-round history",
  );

  // 4. Non-leaking counterexamples must not regenerate ordinary play.
  const missed = parseCrossRoundAuditorReply(
    scriptedReply([[], [], []], [[2, 1, 3]], "weak"),
    clues,
  );
  equal(
    evaluateCrossRoundInversion(missed, code, ledger).outcome,
    "pass",
    "a cross-round audit that misses every slot does not regenerate",
  );
  // Two actionable history bridges with the intended code ranked first is the
  // hard tier. No numeric confidence appears anywhere in v0.3.
  const recovering = parseCrossRoundAuditorReply(
    recoveringReply(code, [1, 3, 4]),
    clues,
  );
  equal(
    evaluateCrossRoundInversion(recovering, code, ledger).outcome,
    "hard_veto",
    "two ranked, evidenced history bridges hard-veto with no confidence term",
  );
  // One evidenced bridge with the code ranked high is the soft tier.
  const oneEdge = parseCrossRoundAuditorReply(
    scriptedReply([[[code[0], "shared parent", "strong"]], [], []], [
      [...code] as [number, number, number],
    ]),
    clues,
  );
  const oneEdgeEvaluation = evaluateCrossRoundInversion(oneEdge, code, ledger);
  equal(
    oneEdgeEvaluation.outcome,
    "soft_regenerate_once",
    "one ranked, evidenced history bridge still costs one regeneration",
  );
  equal(
    oneEdgeEvaluation.actionableIntendedEdges,
    1,
    "the soft tier counts evidence, not a confidence floor",
  );
  // Evidence with the code UNRANKED is not actionable at any strength: the
  // evidence-only clause carried a model-independent 16.7% false-positive
  // floor and was removed before shipping.
  const unranked = parseCrossRoundAuditorReply(
    scriptedReply(
      [
        [[code[0], "shared parent", "strong"]],
        [[code[1], "shared parent", "strong"]],
        [],
      ],
      [[2, 1, 3]],
    ),
    clues,
  );
  equal(
    evaluateCrossRoundInversion(unranked, code, ledger).outcome,
    "pass",
    "two strong bridges with the code unranked do not veto",
  );
  // A slot with no public history can never host evidence, and the evaluator
  // rejects a reply that claims one rather than silently zeroing it.
  let emptySlotRejected = false;
  try {
    parseCrossRoundAuditorReply(
      JSON.stringify({
        historyMatches: [1, 2, 3].map((clueIndex) => ({
          clueIndex,
          matches: [1, 2, 3, 4].map((slot) => ({
            slot,
            sharedReferent: slot === 2 ? "invented" : null,
            publicClue: slot === 2 ? "Aggregate" : null,
            strength: slot === 2 ? "strong" : "none",
          })),
        })),
        codeHypotheses: [
          { code: [...code], support: "strong", rationale: null },
        ],
      }),
      clues,
    );
    evaluateCrossRoundInversion(
      parseCrossRoundAuditorReply(
        JSON.stringify({
          historyMatches: [1, 2, 3].map((clueIndex) => ({
            clueIndex,
            matches: [1, 2, 3, 4].map((slot) => ({
              slot,
              sharedReferent: slot === 2 ? "invented" : null,
              publicClue: slot === 2 ? "Aggregate" : null,
              strength: slot === 2 ? "strong" : "none",
            })),
          })),
          codeHypotheses: [
            { code: [...code], support: "strong", rationale: null },
          ],
        }),
        clues,
      ),
      code,
      ledger,
    );
  } catch {
    emptySlotRejected = true;
  }
  ok(
    emptySlotRejected,
    "a referent claimed on a history-free column fails closed",
  );
  const emptyLedgerEvaluation = evaluateCrossRoundInversion(
    parseCrossRoundAuditorReply(
      scriptedReply([[], [], []], [[...code] as [number, number, number]], "weak"),
      clues,
    ),
    code,
    buildPublicClueLedger([]),
  );
  equal(
    emptyLedgerEvaluation.outcome,
    "pass",
    "an empty public ledger makes the cross-round veto structurally inert",
  );

  // 5. Malformed and inapplicable inputs fail closed rather than passing.
  const malformed: Array<[string, string]> = [
    ['{"assignments":[]}', "wrong assignment count"],
    [
      JSON.stringify({
        assignments: [0, 1, 2].map(() => ({
          ranking: [{ slot: 9, confidence: 0.4 }],
        })),
      }),
      "slot outside 1-4",
    ],
    [
      JSON.stringify({
        assignments: [0, 1, 2].map(() => ({
          ranking: [
            { slot: 1, confidence: 0.4 },
            { slot: 1, confidence: 0.3 },
          ],
        })),
      }),
      "repeated slot",
    ],
    [
      JSON.stringify({
        assignments: [0, 1, 2].map(() => ({
          ranking: [{ slot: 1, confidence: 1.5 }],
        })),
      }),
      "confidence outside 0-1",
    ],
    ["not json", "non-JSON body"],
  ];
  for (const [text, label] of malformed) {
    let threw = false;
    try {
      parseCrossRoundAuditorReply(text, clues);
    } catch {
      threw = true;
    }
    ok(threw, `cross-round parser rejects ${label}`);
  }
  const canonicalReply = JSON.stringify({
    historyMatches: code.map((slot, index) => ({
      clueIndex: index + 1,
      matches: [1, 2, 3, 4].map((candidate) => ({
        slot: candidate,
        sharedReferent: candidate === slot ? "shared parent" : null,
        publicClue:
          candidate === slot
            ? (leak.resolvedRounds[0]!.clues[
                leak.resolvedRounds[0]!.code.indexOf(slot)
              ] ?? null)
            : null,
        strength: candidate === slot ? "plausible" : "none",
      })),
      ignoredEntryField: true,
    })),
    codeHypotheses: [
      { code: [...code], support: "strong", rationale: null },
    ],
    ignoredEnvelopeField: true,
  });
  const parsedCanonical = parseCrossRoundAuditorReply(canonicalReply, clues);
  deepEqual(
    parseCrossRoundAuditorReply(
      `${canonicalReply}\n{"ignoredTrailingObject":true}`,
      clues,
    ),
    parsedCanonical,
    "shared parser accepts a valid first object followed by trailing JSON",
  );
  deepEqual(
    parseCrossRoundAuditorReply(
      `\`\`\`json\nbroken example\n\`\`\`\n${canonicalReply}`,
      clues,
    ),
    parsedCanonical,
    "shared parser skips a malformed fence and accepts the later valid object",
  );
  let emptyLedgerThrew = false;
  try {
    await auditCrossRoundColumns(buildPublicClueLedger([]), clues, {
      config: deepSeekConfig,
    });
  } catch {
    emptyLedgerThrew = true;
  }
  ok(
    emptyLedgerThrew,
    "cross-round auditor refuses to spend a call with no public history",
  );
  const lowEffortConfig: AIPlayerConfig = {
    ...deepSeekConfig,
    reasoningEffort: "high",
  };
  let lowEffortThrew = false;
  try {
    await auditCrossRoundColumns(ledger, clues, {
      config: lowEffortConfig,
    });
  } catch (error) {
    lowEffortThrew =
      error instanceof Error && /xhigh.*wire max/i.test(error.message);
  }
  ok(
    lowEffortThrew,
    "cross-round protocol refuses lower reasoning under the same identity",
  );
}

async function testGameplayRequestContract(): Promise<void> {
  const captured = installFetchMock([{ content: "ANSWER: 1,2,3" }]);
  resetProviderThrottleState();

  const response = await callAI(
    deepSeekConfig,
    "offline system",
    "offline user",
    { strictExecution: true },
  );

  equal(captured.length, 1, "strict gameplay makes one physical HTTP request");
  equal(
    captured[0].url,
    "https://openrouter.ai/api/v1/chat/completions",
    "request targets OpenRouter chat completions",
  );
  assertPinnedRoute(captured[0].body);
  equal(
    captured[0].body.max_tokens,
    65_536,
    "default deliberate gameplay is capped at the DeepInfra endpoint limit",
  );
  deepEqual(
    captured[0].body.reasoning,
    { effort: "max", exclude: true },
    "xhigh gameplay is translated to maximum deliberate reasoning",
  );
  equal(
    new Headers(captured[0].init.headers).get("x-openrouter-metadata"),
    "enabled",
    "request asks OpenRouter for route-attempt proof",
  );
  equal(
    response.providerMetadata?.physicalAttempt,
    1,
    "successful telemetry records physical attempt one",
  );
  equal(
    response.providerMetadata?.servedModel,
    EXACT_MODEL,
    "successful telemetry records the served dated model",
  );
  equal(
    response.providerMetadata?.upstreamProvider,
    "DeepInfra",
    "successful telemetry records the served upstream",
  );
  equal(
    (
      response.providerMetadata?.usage as
        | Record<string, unknown>
        | undefined
    )?.costUsd,
    0.00000225,
    "successful telemetry preserves provider-reported cost",
  );
}

function testExactModelDefaults(): void {
  const config = getConfigForModel("openrouter", EXACT_MODEL);
  equal(config.model, EXACT_MODEL, "exact 0731 model defaults retain model ID");
  equal(
    config.timeoutMs,
    45 * 60 * 1000,
    "exact 0731 model defaults retain the deliberate timeout",
  );
  equal(
    config.promptStrategy,
    "advanced",
    "exact 0731 model defaults retain the advanced prompt strategy",
  );
  equal(
    config.reasoningEffort,
    "xhigh",
    "exact 0731 model defaults retain xhigh reasoning for wire-max mapping",
  );
}

async function testBlindInversionRegistryTelemetryAndVetoPolicy(): Promise<void> {
  const captured = installFetchMock([
    {
      content: JSON.stringify({
        audits: [
          {
            index: 1,
            concepts: [{ concept: "factory", confidence: 0.7 }],
            definitionShaped: true,
            directness: 0.8,
          },
        ],
      }),
    },
  ]);
  const highReasoningConfig: AIPlayerConfig = {
    ...deepSeekConfig,
    reasoningEffort: "high",
  };
  const run = await auditBlindClues(["assembly line"], {
    config: highReasoningConfig,
    now: () => new Date("2026-08-01T12:00:00.000Z"),
  });

  equal(captured.length, 1, "blind inversion makes one strict provider call");
  deepEqual(
    captured[0].body.reasoning,
    { effort: "high", exclude: true },
    "blind inversion sends the configured reasoning effort",
  );
  equal(
    run.modelRequested.reasoningEffort,
    "high",
    "blind-inversion records the effective registry/config reasoning effort",
  );
  equal(
    run.modelRequested.wireReasoningEffort,
    "high",
    "blind-inversion records the provider wire reasoning effort",
  );
  equal(
    run.usage.estimatedCostUsd,
    "0.000002250",
    "blind-inversion estimate uses model-registry per-1K pricing",
  );
  equal(
    run.usage.providerReportedCostUsd,
    0.00000225,
    "blind-inversion preserves provider-reported cost",
  );
  equal(
    run.usage.effectiveCostUsd,
    0.00000225,
    "provider-reported cost wins over the registry estimate",
  );
  equal(
    run.usage.costSource,
    "provider_reported",
    "blind-inversion labels the preferred provider cost source",
  );

  const evaluated = evaluateBlindInversion(
    [
      {
        clue: "rank-two high confidence",
        concepts: [
          { concept: "warehouse", confidence: 0.2 },
          { concept: "factory", confidence: 0.7 },
        ],
        definitionShaped: false,
        directness: 0.1,
      },
      {
        clue: "definition-shaped direct clue",
        concepts: [{ concept: "building", confidence: 0.2 }],
        definitionShaped: true,
        directness: 0.7,
      },
      {
        clue: "rank-one low confidence",
        concepts: [{ concept: "windmill", confidence: 0.2 }],
        definitionShaped: false,
        directness: 0.1,
      },
      {
        clue: "definition-shaped rank-two recovery",
        concepts: [
          { concept: "turbine", confidence: 0.2 },
          { concept: "windmill", confidence: 0.3 },
        ],
        definitionShaped: true,
        directness: 0.1,
      },
      {
        clue: "rank-two low confidence",
        concepts: [
          { concept: "turbine", confidence: 0.2 },
          { concept: "windmill", confidence: 0.3 },
        ],
        definitionShaped: false,
        directness: 0.1,
      },
      {
        clue: "no target recovery",
        concepts: [{ concept: "turbine", confidence: 0.2 }],
        definitionShaped: false,
        directness: 0.1,
      },
    ],
    ["factory", "factory", "windmill", "windmill", "windmill", "windmill"],
  );

  deepEqual(
    evaluated.map((item) => item.outcome),
    [
      "hard_veto",
      "hard_veto",
      "soft_regenerate_once",
      "soft_regenerate_once",
      "pass",
      "pass",
    ],
    "runtime implements the shared hard/soft/pass veto tiers",
  );
  deepEqual(
    evaluated.map((item) => item.matchingConceptRank),
    [2, null, 1, 2, 2, null],
    "runtime records target-recovery rank for policy auditability",
  );
  deepEqual(
    evaluated.map((item) => item.flag),
    [true, true, false, false, false, false],
    "legacy flag remains a hard-veto alias rather than collapsing soft policy",
  );
}

async function testValidationDisablesReasoning(): Promise<void> {
  const captured = installFetchMock([{ content: "OK" }]);

  const config: HeadlessMatchConfig = {
    players: [
      {
        name: "Offline validator",
        aiProvider: "openrouter",
        aiConfig: deepSeekConfig,
        team: "amber",
      },
    ],
    teamSize: 2,
  };
  const report = await validateModels([config]);

  equal(report.ok, true, "model validation accepts the offline OK fixture");
  equal(captured.length, 1, "validation makes one physical HTTP request");
  assertPinnedRoute(captured[0].body);
  equal(captured[0].body.max_tokens, 50, "validation keeps its small token cap");
  deepEqual(
    captured[0].body.reasoning,
    { enabled: false, exclude: true },
    "validation explicitly disables reasoning on the wire",
  );
  equal(
    report.passed[0]?.providerMetadata?.physicalAttempt,
    1,
    "validation returns provider attempt telemetry",
  );
}

async function testRouteProofIsMandatory(): Promise<void> {
  const failures: Array<{
    fixture: MockResponseOverrides;
    pattern: RegExp;
    label: string;
  }> = [
    {
      fixture: {
        attempt: 2,
        attempts: [
          { provider: "Other", status: 502 },
          { provider: "DeepInfra", status: 200 },
        ],
      },
      pattern:
        /route proof did not show router attempt=1, one selected DeepInfra endpoint, and zero or one successful DeepInfra detailed attempt/,
      label: "multi-attempt route",
    },
    {
      fixture: {
        attempts: [{ provider: "AnotherProvider", status: 200 }],
      },
      pattern:
        /route proof did not show router attempt=1, one selected DeepInfra endpoint, and zero or one successful DeepInfra detailed attempt/,
      label: "contradictory detailed provider",
    },
    {
      fixture: {
        attempts: [{ provider: "DeepInfra", status: 502 }],
      },
      pattern:
        /route proof did not show router attempt=1, one selected DeepInfra endpoint, and zero or one successful DeepInfra detailed attempt/,
      label: "failed detailed attempt",
    },
    {
      fixture: {
        attempts: [{ provider: "DeepInfra", status: "502" }],
      },
      pattern:
        /route proof did not show router attempt=1, one selected DeepInfra endpoint, and zero or one successful DeepInfra detailed attempt/,
      label: "failed decimal-string detailed attempt",
    },
    {
      fixture: {
        attempts: [{ provider: "DeepInfra", status: "success" }],
      },
      pattern:
        /route proof did not show router attempt=1, one selected DeepInfra endpoint, and zero or one successful DeepInfra detailed attempt/,
      label: "ambiguous semantic detailed status",
    },
    {
      fixture: {
        attempts: { provider: "DeepInfra", status: 200 },
      },
      pattern:
        /route proof did not show router attempt=1, one selected DeepInfra endpoint, and zero or one successful DeepInfra detailed attempt/,
      label: "malformed detailed-attempt shape",
    },
    {
      fixture: { model: "deepseek/deepseek-v4-flash" },
      pattern: /served model .* instead of deepseek\/deepseek-v4-flash-0731/,
      label: "moving model alias",
    },
    {
      fixture: { provider: "AnotherProvider" },
      pattern: /served provider AnotherProvider instead of DeepInfra/,
      label: "wrong upstream",
    },
    {
      fixture: { finishReason: "length" },
      pattern: /ended with length instead of stop/,
      label: "incomplete finish",
    },
  ];

  for (const failure of failures) {
    const captured = installFetchMock([failure.fixture]);
    const error = await expectReject(
      () =>
        callAI(deepSeekConfig, "offline system", "offline user", {
          strictExecution: true,
        }),
      failure.pattern,
    );

    equal(
      captured.length,
      1,
      `${failure.label} rejection is not retried`,
    );
    equal(
      (
        error as Error & {
          providerMetadata?: Record<string, unknown>;
        }
      ).providerMetadata?.physicalAttempt,
      1,
      `${failure.label} rejection retains physical-attempt telemetry`,
    );
  }
}

async function testDetailedRouteAttemptMayBeAbsent(): Promise<void> {
  const captured = installFetchMock([
    {
      content: "ANSWER: 1,2,3",
      omitAttempts: true,
    },
    {
      content: "ANSWER: 1,2,3",
      attempts: [],
    },
  ]);

  const responses = await Promise.all([
    callAI(
      deepSeekConfig,
      "offline system",
      "offline user",
      { strictExecution: true },
    ),
    callAI(
      deepSeekConfig,
      "offline system",
      "offline user",
      { strictExecution: true },
    ),
  ]);

  for (const response of responses) {
    equal(
      response.text,
      "ANSWER: 1,2,3",
      "strict execution accepts route proof when detailed attempts are absent or empty",
    );
  }
  equal(
    captured.length,
    2,
    "absent and empty detailed arrays each still make exactly one physical request",
  );
}

async function testDetailedRouteAttemptAcceptsDecimalHttpStatus(): Promise<void> {
  const captured = installFetchMock([
    {
      content: "ANSWER: 1,2,3",
      attempts: [{ provider: "DeepInfra", status: "200" }],
    },
  ]);
  const response = await callAI(
    deepSeekConfig,
    "offline system",
    "offline user",
    { strictExecution: true },
  );
  equal(
    response.text,
    "ANSWER: 1,2,3",
    "lossless decimal-string HTTP 200 route status is accepted",
  );
  equal(
    captured.length,
    1,
    "decimal-string status still represents one physical request",
  );
}

async function testStrictRateLimitIsNotRetried(): Promise<void> {
  const captured = installFetchMock([
    {
      status: 429,
      errorBody: "offline rate limit",
    },
  ]);
  resetProviderThrottleState();

  const error = await expectReject(
    () =>
      callAI(deepSeekConfig, "offline system", "offline user", {
        strictExecution: true,
      }),
    /OpenRouter API error: 429/,
  );

  equal(captured.length, 1, "strict provider failure is never retried");
  equal(
    (
      error as Error & {
        providerMetadata?: Record<string, unknown>;
      }
    ).providerMetadata?.physicalAttempt,
    1,
    "failed strict request retains physical-attempt telemetry",
  );
}

async function testStrictAnswerProtocol(): Promise<void> {
  const negativeFixtures = [
    {
      label: "clue",
      response: "alpha,beta,gamma",
      run: () =>
        generateClues(
          deepSeekConfig,
          {
            keywords: ["factory", "windmill", "falcon", "harbor"],
            targetCode: [1, 2, 3],
            history: [],
          },
          { strictExecution: true },
        ),
    },
    {
      label: "guess",
      response: "1,2,3",
      run: () =>
        generateGuess(
          deepSeekConfig,
          {
            keywords: ["factory", "windmill", "falcon", "harbor"],
            clues: ["shift", "blade", "talon"],
            history: [],
          },
          { strictExecution: true },
        ),
    },
    {
      label: "interception",
      response: "1,2,3",
      run: () =>
        generateInterception(
          deepSeekConfig,
          {
            clues: ["shift", "blade", "talon"],
            history: [],
          },
          { strictExecution: true },
        ),
    },
  ] as const;

  for (const fixture of negativeFixtures) {
    installFetchMock([{ content: fixture.response }]);
    const result = await fixture.run();
    equal(
      result.parseQuality,
      "error",
      `strict ${fixture.label} rejects a recoverable response without ANSWER`,
    );
    ok(
      result.error?.includes("Strict execution rejected"),
      `strict ${fixture.label} reports protocol rejection`,
    );
    equal(
      result.providerMetadata?.physicalAttempt,
      1,
      `strict ${fixture.label} protocol error preserves attempt telemetry`,
    );
  }

  installFetchMock([{ content: "ANSWER: 1,2,3" }]);
  const accepted = await generateGuess(
    deepSeekConfig,
    {
      keywords: ["factory", "windmill", "falcon", "harbor"],
      clues: ["shift", "blade", "talon"],
      history: [],
    },
    { strictExecution: true },
  );
  equal(
    accepted.parseQuality,
    "clean",
    "strict parser accepts an explicit ANSWER line",
  );
  deepEqual(
    accepted.result,
    [1, 2, 3],
    "strict parser preserves the explicit answer",
  );
}

async function testStrictReflectionProtocol(): Promise<void> {
  const reflectionParams = {
    teamKeywords: ["factory", "windmill", "falcon", "harbor"],
    teamHistory: [],
    opponentHistory: [],
    winner: "amber" as const,
    myTeam: "amber" as const,
    whiteTokens: 0,
    blackTokens: 0,
    opponentWhiteTokens: 1,
    opponentBlackTokens: 0,
    currentNotes: "Prior note",
    tokenBudget: 200,
  };

  const captured = installFetchMock([{ content: "" }]);
  const rejected = await generateReflection(
    deepSeekConfig,
    reflectionParams,
    { strictExecution: true },
  );
  equal(
    captured.length,
    1,
    "strict reflection makes one physical provider attempt",
  );
  equal(
    rejected.parseQuality,
    "error",
    "strict reflection rejects an empty learning update",
  );
  ok(
    rejected.error?.includes("empty reflection response"),
    "strict reflection explains the empty-response failure",
  );
  equal(
    rejected.providerMetadata?.physicalAttempt,
    1,
    "strict reflection failure preserves attempt telemetry",
  );

  installFetchMock([{ content: "Prefer indirect, history-aware clues." }]);
  const accepted = await generateReflection(
    deepSeekConfig,
    reflectionParams,
    { strictExecution: true },
  );
  equal(
    accepted.parseQuality,
    "clean",
    "strict reflection accepts a non-empty learning update",
  );
  equal(
    accepted.result,
    "Prefer indirect, history-aware clues.",
    "strict reflection preserves the learning update",
  );
}

async function loadFunctionBody(
  relativePath: string,
  functionName: string,
): Promise<string> {
  const absolutePath = resolve(process.cwd(), relativePath);
  const sourceText = await readFile(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  ok(found, `found ${functionName} in ${relativePath}`);
  return found!.getText(sourceFile);
}

function occursBefore(
  source: string,
  earlier: string,
  later: string,
  message: string,
): void {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  ok(earlierIndex >= 0, `found "${earlier}" for ordering check`);
  ok(laterIndex >= 0, `found "${later}" for ordering check`);
  ok(earlierIndex < laterIndex, message);
}

async function testStrictMatchFailureContract(): Promise<void> {
  const body = await loadFunctionBody(
    "server/headlessRunner.ts",
    "runHeadlessMatch",
  );

  ok(
    /await storage\.updateMatch\(matchId,\s*\{[\s\S]*?qualityStatus:\s*"tainted"/m.test(
      body,
    ),
    "failed match is durably marked tainted",
  );
  ok(
    /taintReasons\.push\(failureReason\)/m.test(body),
    "failed match records an explicit failure taint reason",
  );
  ok(
    /Object\.assign\(annotatedError,\s*\{[\s\S]*?matchId,[\s\S]*?strictExecution:/m.test(
      body,
    ),
    "failed match error carries matchId and strict-execution identity",
  );
  occursBefore(
    body,
    'qualityStatus: "tainted"',
    "throw annotatedError",
    "taint is persisted before the annotated match error escapes",
  );

  const clueBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "processClues",
  );
  ok(
    /strictExecution[\s\S]*?callResult\.parseQuality\s*!==\s*"clean"/m.test(
      clueBody,
    ),
    "processClues blocks non-clean strict results before game submission",
  );
  occursBefore(
    clueBody,
    "await logAiCall(",
    "throw new Error(",
    "processClues persists failed-call telemetry before invalidation",
  );
  occursBefore(
    clueBody,
    "throw new Error(",
    "game = submitClues",
    "processClues invalidates before a strict synthetic result reaches game state",
  );

  for (const functionName of [
    "processGuesses",
    "processInterceptions",
  ]) {
    const phaseBody = await loadFunctionBody(
      "server/headlessRunner.ts",
      functionName,
    );
    ok(
      phaseBody.includes("resolveCodeActionValidationDisposition("),
      `${functionName} uses the all-mode code-action gate`,
    );
    occursBefore(
      phaseBody,
      "await logAiCall(",
      "resolveCodeActionValidationDisposition(",
      `${functionName} persists failed-call telemetry before validation`,
    );
    occursBefore(
      phaseBody,
      "resolveCodeActionValidationDisposition(",
      "applyValidatedCodeAction(",
      `${functionName} validates before any result reaches game state`,
    );
    ok(
      !phaseBody.includes("submitOwnTeamGuess(") &&
        !phaseBody.includes("submitInterception("),
      `${functionName} cannot bypass the validated application helper`,
    );
  }

  const logBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "logAiCall",
  );
  ok(
    /providerMetadata:\s*callResult\.providerMetadata\s*\|\|\s*null/m.test(
      logBody,
    ),
    "AI-call persistence includes provider route and cost metadata",
  );
  ok(
    /if\s*\(strictExecution\)[\s\S]*?throw new Error/m.test(logBody),
    "strict match invalidates if failed-call telemetry cannot be persisted",
  );

  const deliberationBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "processDeliberation",
  );
  ok(
    deliberationBody.includes("rejectDeliberation") &&
      deliberationBody.includes(
        'rejectDeliberation("max_exchanges", null, false)',
      ) &&
      !deliberationBody.includes("fallbackAnswer"),
    "deliberation rejects incomplete termination in every mode without a synthetic answer",
  );

  const reflectionLogBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "logReflectionCall",
  );
  ok(
    /if\s*\(strictExecution\)[\s\S]*?throw new Error/m.test(
      reflectionLogBody,
    ),
    "strict reflection invalidates if its telemetry cannot be persisted",
  );

  const scratchNotesBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "buildUpdatedScratchNotes",
  );
  ok(
    /generateReflection\([\s\S]*?strictExecution:\s*config\.strictExecution[\s\S]*?providerAttemptTelemetry:\s*providerAttempt\?\.telemetry/m.test(
      scratchNotesBody,
    ),
    "post-match reflection inherits match strict execution and attempt telemetry",
  );
  ok(
    /if\s*\(config\.strictExecution\)[\s\S]*?Strict execution invalidated reflection/m.test(
      scratchNotesBody,
    ),
    "strict reflection errors invalidate instead of silently retaining stale notes",
  );
  ok(
    /catch\s*\(err\)[\s\S]*?if\s*\(config\.strictExecution\)\s*\{\s*throw err;/m.test(
      scratchNotesBody,
    ),
    "strict reflection exceptions escape the scratch-note fallback path",
  );
}

async function testStrictTournamentCostAndRetryContract(): Promise<void> {
  const body = await loadFunctionBody("server/tournament.ts", "runTournament");

  ok(
    /failedAfterFirstPass[\s\S]*?strictExecution\s*!==\s*true/m.test(body),
    "strict tournament failures are excluded from the retry queue",
  );
  ok(
    /failedMatchId[\s\S]*?matchId:\s*failedMatchId[\s\S]*?attemptMatchIds/m.test(
      body,
    ),
    "failed strict matchId is linked into tournament attempt history",
  );
  ok(
    /costMatchIds[\s\S]*?attemptMatchIds/m.test(body),
    "tournament cost IDs include failed attempt match IDs",
  );
  ok(
    /getCumulativeCost\(snapshot\.costMatchIds\)/m.test(body),
    "intermediate tournament cost includes failed attempts",
  );
  ok(
    /getCumulativeCost\(finalSnapshot\.costMatchIds\)/m.test(body),
    "final tournament cost includes failed attempts",
  );
}

async function testIncompleteFixtureGates(): Promise<void> {
  const defaultCoachBody = await loadFunctionBody(
    "server/coachLoop.ts",
    "defaultCoachConfig",
  );
  ok(
    /strictExecution:\s*overrides\.strictExecution\s*!==\s*false/m.test(
      defaultCoachBody,
    ),
    "coach strict execution defaults on",
  );

  const coachBody = await loadFunctionBody(
    "server/coachLoop.ts",
    "runCoachSprint",
  );
  ok(
    /failedSettlements\.length\s*>\s*0\s*&&\s*config\.strictExecution\s*!==\s*false/m.test(
      coachBody,
    ),
    "strict coach detects rejected match fixtures",
  );
  occursBefore(
    coachBody,
    "Strict coach sprint",
    "const matchResults",
    "strict coach blocks aggregation/evaluation before partial results exist",
  );

  const pairedBody = await loadFunctionBody(
    "server/arena.ts",
    "runPairedCoachMatches",
  );
  ok(
    (pairedBody.match(/strictExecution:\s*coachConfig\.strictExecution/g) ?? [])
      .length >= 2,
    "both sides of an arena role-swap pair inherit strict execution",
  );

  const arenaBody = await loadFunctionBody("server/arena.ts", "runArena");
  ok(
    /failedPairings\.length\s*>\s*0[\s\S]*?config\.coachConfig\.strictExecution\s*!==\s*false/m.test(
      arenaBody,
    ),
    "strict arena detects rejected paired fixtures",
  );
  occursBefore(
    arenaBody,
    "Strict arena sprint",
    "const resultsBySlot",
    "strict arena blocks scoring/evaluation before partial pairings are used",
  );

  const anchorConfigBody = await loadFunctionBody(
    "server/anchorEvaluator.ts",
    "buildAnchorMatchConfig",
  );
  ok(
    /strictExecution:\s*true/m.test(anchorConfigBody),
    "anchor fixtures always use strict execution",
  );

  const anchorBody = await loadFunctionBody(
    "server/anchorEvaluator.ts",
    "runAnchorBatch",
  );
  ok(
    /failedSettlements\.length\s*>\s*0/m.test(anchorBody),
    "anchor batch detects rejected fixtures",
  );
  occursBefore(
    anchorBody,
    "Strict anchor batch",
    "const results",
    "anchor evaluation blocks before partial fixture results are aggregated",
  );

  const autopsyBody = await loadFunctionBody(
    "server/coachLoop.ts",
    "coachAutopsy",
  );
  ok(
    (autopsyBody.match(/decision:\s*"revert"/g) ?? []).length >= 2,
    "failed or unparseable coach meta-calls remain fail-closed to REVERT",
  );
}

async function main(): Promise<void> {
  process.env.OPENROUTER_API_KEY = TEST_API_KEY;

  try {
    testExactModelDefaults();
    await testBlindInversionRegistryTelemetryAndVetoPolicy();
    await testCrossRoundColumnInversionProtocol();
    await testGameplayRequestContract();
    await testValidationDisablesReasoning();
    await testRouteProofIsMandatory();
    await testDetailedRouteAttemptMayBeAbsent();
    await testDetailedRouteAttemptAcceptsDecimalHttpStatus();
    await testStrictRateLimitIsNotRetried();
    await testStrictAnswerProtocol();
    await testStrictReflectionProtocol();
    await testStrictMatchFailureContract();
    await testStrictTournamentCostAndRetryContract();
    await testIncompleteFixtureGates();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }

  console.log(
    `Strict execution offline release checks passed (${assertions} assertions).`,
  );
}

main().catch((error) => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  }
  console.error("Strict execution offline release checks failed:");
  console.error(error);
  process.exitCode = 1;
});
