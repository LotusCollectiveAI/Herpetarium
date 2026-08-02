/**
 * Provider-, database-, and network-free regression checks for fail-closed
 * headless guess/interception application.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import {
  generateGuess,
  generateInterception,
  resetProviderThrottleState,
} from "../server/ai";
import {
  parseReadyCodeSignal,
  resolveCodeActionValidationDisposition,
  type HeadlessCodeActionType,
} from "../server/headlessValidationPolicy";
import { getConfigForModel } from "@shared/modelRegistry";

let assertions = 0;

function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert.equal(actual, expected, message);
  assertions += 1;
}

function deepEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function disposition(input: {
  actionType?: HeadlessCodeActionType;
  candidate: unknown;
  parseQuality: "clean" | "partial_recovery" | "fallback_used" | "error";
  timedOut?: boolean;
  error?: string | null;
  strictExecution?: boolean;
}) {
  return resolveCodeActionValidationDisposition({
    actionType: input.actionType ?? "generate_guess",
    candidate: input.candidate,
    parseQuality: input.parseQuality,
    timedOut: input.timedOut ?? false,
    error: input.error,
    strictExecution: input.strictExecution,
  });
}

function testInvalidRepliesRejectIdenticallyAcrossModes(): void {
  for (const actionType of [
    "generate_guess",
    "generate_interception",
  ] as const) {
    const exploratory = disposition({
      actionType,
      candidate: [1, 1, 2],
      parseQuality: "partial_recovery",
      strictExecution: false,
    });
    const strict = disposition({
      actionType,
      candidate: [1, 1, 2],
      parseQuality: "partial_recovery",
      strictExecution: true,
    });

    equal(
      exploratory.actionApplied,
      false,
      `${actionType} repeated digits are not applied in exploratory mode`,
    );
    equal(
      strict.actionApplied,
      false,
      `${actionType} repeated digits are not applied in strict mode`,
    );
    equal(
      exploratory.rejectMatch,
      true,
      `${actionType} invalid exploratory action rejects the match`,
    );
    equal(
      strict.rejectMatch,
      true,
      `${actionType} invalid strict action rejects the match`,
    );
    deepEqual(
      exploratory.validationMetadata,
      strict.validationMetadata,
      `${actionType} records the same invalid-code truth in both modes`,
    );
    equal(
      exploratory.validationMetadata.disposition,
      "rejected_invalid_code",
      `${actionType} has an explicit not-applied disposition`,
    );
  }

  for (const candidate of [
    [0, 2, 3],
    [1, 2, 5],
    [1, 2],
    "1,2,3",
  ]) {
    equal(
      disposition({
        candidate,
        parseQuality: "clean",
        strictExecution: false,
      }).actionApplied,
      false,
      `invalid candidate ${JSON.stringify(candidate)} fails closed`,
    );
  }
}

async function testSameProviderReplyFailsClosedAcrossModes(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const model = "deepseek/deepseek-v4-flash-0731";
  let fetchCount = 0;

  process.env.OPENROUTER_API_KEY = "offline-test-key";
  resetProviderThrottleState();
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        id: `offline-invalid-code-${fetchCount}`,
        model,
        provider: "DeepInfra",
        choices: [
          {
            message: { content: "ANSWER: 1, 1, 2" },
            finish_reason: "stop",
          },
        ],
        openrouter_metadata: {
          attempt: 1,
          endpoints: {
            available: [{ provider: "DeepInfra", selected: true }],
          },
        },
        usage: {
          prompt_tokens: 9,
          completion_tokens: 5,
          total_tokens: 14,
          cost: 0.000001,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const config = getConfigForModel("openrouter", model);
    for (const actionType of [
      "generate_guess",
      "generate_interception",
    ] as const) {
      for (const strictExecution of [false, true]) {
        const callResult =
          actionType === "generate_guess"
            ? await generateGuess(
                config,
                {
                  keywords: ["alpha", "beta", "gamma", "delta"],
                  clues: ["cipher", "veil", "signal"],
                  history: [],
                },
                { strictExecution },
              )
            : await generateInterception(
                config,
                {
                  clues: ["cipher", "veil", "signal"],
                  history: [],
                },
                { strictExecution },
              );
        const application =
          resolveCodeActionValidationDisposition({
            actionType,
            candidate: callResult.result,
            parseQuality: callResult.parseQuality,
            timedOut: false,
            error: callResult.error,
            strictExecution,
          });

        equal(
          callResult.rawResponse,
          "ANSWER: 1, 1, 2",
          `${actionType} preserves the exact invalid provider reply when strict=${strictExecution}`,
        );
        equal(
          application.actionApplied,
          false,
          `${actionType} does not apply the same invalid reply when strict=${strictExecution}`,
        );
        equal(
          application.rejectMatch,
          true,
          `${actionType} rejects the same invalid reply when strict=${strictExecution}`,
        );
      }
    }
    equal(fetchCount, 4, "invalid code responses are never retried");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
    resetProviderThrottleState();
  }
}

function testFabricatedFallbackNeverOccupiesActionSlot(): void {
  for (const strictExecution of [false, true]) {
    const timeout = disposition({
      candidate: [1, 2, 3],
      parseQuality: "error",
      timedOut: true,
      error: "timeout",
      strictExecution,
    });
    equal(
      timeout.actionApplied,
      false,
      `timeout placeholder is not applied when strict=${strictExecution}`,
    );
    equal(
      timeout.validationMetadata.disposition,
      "rejected_source_failure",
      "timeout records a source-failure disposition",
    );
    ok(
      (timeout.validationMetadata.problems as string[]).some((problem) =>
        problem.includes("timed out"),
      ),
      "timeout reason remains explicit",
    );
  }

  const parserFallback = disposition({
    actionType: "generate_interception",
    candidate: [1, 2, 3],
    parseQuality: "fallback_used",
    strictExecution: false,
  });
  equal(
    parserFallback.actionApplied,
    false,
    "exploratory parser fallback is not applied despite being rule-legal",
  );
  ok(
    (parserFallback.validationMetadata.problems as string[]).some((problem) =>
      problem.includes("fallback placeholder"),
    ),
    "fabricated parser fallback is named in validation evidence",
  );
}

function testValidPartialRecoveryPolicy(): void {
  const candidate = [3, 1, 4];
  const exploratory = disposition({
    candidate,
    parseQuality: "partial_recovery",
    strictExecution: false,
  });
  equal(
    exploratory.actionApplied,
    true,
    "valid partial recovery is accepted in exploratory mode",
  );
  equal(
    exploratory.validationMetadata.disposition,
    "accepted_partial_recovery_exploratory",
    "exploratory partial recovery records its explicit policy",
  );
  equal(
    exploratory.validationMetadata.policy,
    "valid partial recovery is exploratory-only",
    "partial-recovery policy is durable in validation metadata",
  );

  const strict = disposition({
    candidate,
    parseQuality: "partial_recovery",
    strictExecution: true,
  });
  equal(
    strict.actionApplied,
    false,
    "strict mode rejects the same valid partial recovery",
  );
  equal(
    strict.validationMetadata.disposition,
    "rejected_partial_recovery_strict",
    "strict partial recovery records a distinct rejection disposition",
  );

  for (const strictExecution of [false, true]) {
    equal(
      disposition({
        candidate,
        parseQuality: "clean",
        strictExecution,
      }).actionApplied,
      true,
      `clean valid triple is applied when strict=${strictExecution}`,
    );
  }
}

function testReadySignalsRemainVisibleToSharedValidation(): void {
  deepEqual(
    parseReadyCodeSignal("Still thinking."),
    { present: false, candidate: null },
    "ordinary chatter is not treated as an action",
  );
  deepEqual(
    parseReadyCodeSignal("Reasoning\nREADY: 4, 1, 3"),
    { present: true, candidate: [4, 1, 3] },
    "valid READY line produces the exact candidate",
  );
  for (const content of [
    "I agree with your read. READY: 4, 1, 3",
    "**READY: 4, 1, 3**",
    "> READY: 4, 1, 3",
    "READY: 4, 1, 3.",
    "READY: 4, 1, 3 -- this matches the round-2 pattern.",
  ]) {
    deepEqual(
      parseReadyCodeSignal(content),
      { present: true, candidate: [4, 1, 3] },
      `${content} preserves the documented prose-tolerant READY contract`,
    );
  }

  for (const content of [
    "READY: 1, 1, 2",
    "READY: 5, 2, 3",
    "READY: -1, 2, 3",
  ]) {
    const parsed = parseReadyCodeSignal(content);
    equal(parsed.present, true, `${content} remains an explicit action attempt`);
    equal(
      disposition({
        candidate: parsed.candidate,
        parseQuality: "clean",
        strictExecution: false,
      }).actionApplied,
      false,
      `${content} cannot bypass shared validation in 3v3`,
    );
  }

  for (const content of [
    "READY: 1, 2",
    "READY: one, two, three",
    "signal READY: X,Y,Z when you agree",
  ]) {
    deepEqual(
      parseReadyCodeSignal(content),
      { present: false, candidate: null },
      `${content} is not fabricated into a code action`,
    );
  }
}

async function loadFunctionBody(functionName: string): Promise<string> {
  const absolutePath = resolve(process.cwd(), "server/headlessRunner.ts");
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
  ok(found, `found ${functionName}`);
  return found!.getText(sourceFile);
}

async function testEveryApplicationPathUsesTheBoundary(): Promise<void> {
  const applyBody = await loadFunctionBody("applyValidatedCodeAction");
  const validateIndex = applyBody.indexOf("validateCodeGuess(candidate)");
  const ownSubmitIndex = applyBody.indexOf("submitOwnTeamGuess(");
  const interceptSubmitIndex = applyBody.indexOf("submitInterception(");
  ok(validateIndex >= 0, "application boundary uses shared validateCodeGuess");
  ok(
    validateIndex < ownSubmitIndex && validateIndex < interceptSubmitIndex,
    "shared validation precedes either game-state mutator",
  );

  for (const functionName of [
    "processGuesses",
    "processInterceptions",
  ]) {
    const body = await loadFunctionBody(functionName);
    const persistIndex = body.indexOf("await logAiCall(");
    const dispositionIndex = body.indexOf(
      "resolveCodeActionValidationDisposition(",
    );
    const applicationIndex = body.indexOf("applyValidatedCodeAction(");
    ok(
      persistIndex >= 0 &&
        persistIndex < dispositionIndex &&
        dispositionIndex < applicationIndex,
      `${functionName} persists, validates, then applies`,
    );
    equal(
      body.includes("resolveActionValidationDisposition("),
      false,
      `${functionName} cannot use legacy exploratory continuity`,
    );
    equal(
      body.includes("submitOwnTeamGuess(") ||
        body.includes("submitInterception("),
      false,
      `${functionName} has no direct game-state bypass`,
    );
  }

  const deliberationBody = await loadFunctionBody("processDeliberation");
  ok(
    deliberationBody.includes("parseReadyCodeSignal(") &&
      deliberationBody.includes("resolveCodeActionValidationDisposition("),
    "3v3 READY attempts flow through the shared code policy",
  );
  equal(
    deliberationBody.includes("fallbackAnswer") ||
      deliberationBody.includes("[1, 2, 3]"),
    false,
    "3v3 termination has no synthetic answer",
  );
  ok(
    deliberationBody.includes(
      'rejectDeliberation("max_exchanges", null, false)',
    ),
    "3v3 no-consensus termination rejects instead of filling the slot",
  );

  const matchBody = await loadFunctionBody("runHeadlessMatch");
  equal(
    matchBody.match(/requireApplicableDeliberationCodeAction\(/g)?.length,
    2,
    "both 3v3 final application lanes have a defensive validation gate",
  );
  equal(
    matchBody.match(/applyValidatedCodeAction\(/g)?.length,
    2,
    "both 3v3 final application lanes use the sole validated mutator",
  );
  equal(
    matchBody.includes("submitOwnTeamGuess(") ||
      matchBody.includes("submitInterception("),
    false,
    "3v3 orchestration has no direct game-state bypass",
  );

  const logBody = await loadFunctionBody("logAiCall");
  ok(
    logBody.includes("rejectedCodePlaceholder") &&
      logBody.includes("suppressParsedResult"),
    "timeout/error placeholders are retained as failed calls, not parsed actions",
  );
}

async function main(): Promise<void> {
  testInvalidRepliesRejectIdenticallyAcrossModes();
  await testSameProviderReplyFailsClosedAcrossModes();
  testFabricatedFallbackNeverOccupiesActionSlot();
  testValidPartialRecoveryPolicy();
  testReadySignalsRemainVisibleToSharedValidation();
  await testEveryApplicationPathUsesTheBoundary();
  console.log(
    `Guess/interception fail-closed checks passed (${assertions} assertions).`,
  );
}

main().catch((error) => {
  console.error("Guess/interception fail-closed checks failed:");
  console.error(error);
  process.exitCode = 1;
});
