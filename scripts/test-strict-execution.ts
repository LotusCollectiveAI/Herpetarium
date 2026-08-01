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
  attempts?: unknown[];
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
    openrouter_metadata: {
      attempt: overrides.attempt ?? 1,
      attempts:
        overrides.attempts ??
        [{ provider: "DeepInfra", status: "success" }],
      endpoints: {
        available:
          overrides.availableEndpoints ??
          [{ provider: "DeepInfra", selected: true }],
      },
    },
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
    900_000,
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
          { provider: "Other", status: "failed" },
          { provider: "DeepInfra", status: "success" },
        ],
      },
      pattern:
        /route proof did not show exactly one successful DeepInfra attempt/,
      label: "multi-attempt route",
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

  for (const functionName of [
    "processClues",
    "processGuesses",
    "processInterceptions",
  ]) {
    const phaseBody = await loadFunctionBody(
      "server/headlessRunner.ts",
      functionName,
    );
    ok(
      /strictExecution[\s\S]*?callResult\.parseQuality\s*!==\s*"clean"/m.test(
        phaseBody,
      ),
      `${functionName} blocks non-clean strict results before game submission`,
    );
    occursBefore(
      phaseBody,
      "await logAiCall(",
      "throw new Error(",
      `${functionName} persists failed-call telemetry before invalidation`,
    );
    occursBefore(
      phaseBody,
      "throw new Error(",
      functionName === "processClues"
        ? "game = submitClues"
        : functionName === "processGuesses"
          ? "game = submitOwnTeamGuess"
          : "game = submitInterception",
      `${functionName} invalidates before any synthetic result reaches game state`,
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
    /context\.strictExecution\s*&&\s*terminationReason\s*!==\s*null/m.test(
      deliberationBody,
    ),
    "strict deliberation rejects incomplete termination",
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
    await testGameplayRequestContract();
    await testValidationDisablesReasoning();
    await testRouteProofIsMandatory();
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
