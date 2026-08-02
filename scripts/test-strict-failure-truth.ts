/**
 * Offline regression checks for truthful strict-failure telemetry.
 *
 * No network, provider credential, server, or database is used.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { getConfigForModel } from "@shared/modelRegistry";
import { callAI } from "../server/ai";

const EXACT_MODEL = "deepseek/deepseek-v4-flash-0731";
const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENROUTER_API_KEY;
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

async function testBodyReadFailureRetainsRequestProof(): Promise<void> {
  process.env.OPENROUTER_API_KEY = "offline-body-read-test-key";
  let fetchCount = 0;

  globalThis.fetch = (async (): Promise<Response> => {
    fetchCount += 1;
    const response = new Response('{"partial":', {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-body-read-failure",
        "x-generation-id": "generation-body-read-failure",
      },
    });
    Object.defineProperty(response, "text", {
      value: async () => {
        throw new TypeError("terminated");
      },
    });
    return response;
  }) as typeof fetch;

  const config = getConfigForModel("openrouter", EXACT_MODEL);
  let caught:
    | (Error & { providerMetadata?: Record<string, unknown> })
    | undefined;
  try {
    await callAI(config, "offline system", "offline user", {
      strictExecution: true,
    });
  } catch (error) {
    caught =
      error instanceof Error
        ? (error as Error & {
            providerMetadata?: Record<string, unknown>;
          })
        : new Error(String(error));
  }

  ok(caught, "HTTP-200 body-read failure rejects the strict call");
  ok(
    caught.message.includes(
      "OpenRouter response body error after HTTP 200: terminated",
    ),
    "body-read failure remains explicit",
  );
  equal(fetchCount, 1, "strict body-read failure is never retried");

  const metadata = caught.providerMetadata;
  ok(metadata, "body-read failure retains sanitized request metadata");
  equal(metadata.apiHost, "openrouter.ai", "metadata retains API host");
  equal(
    metadata.requestedModel,
    EXACT_MODEL,
    "metadata retains exact requested model",
  );
  equal(
    metadata.requestedUpstream,
    "deepinfra",
    "metadata retains requested upstream",
  );
  equal(metadata.physicalAttempt, 1, "metadata retains physical attempt");
  equal(metadata.httpStatus, 200, "metadata retains HTTP status");
  equal(
    metadata.requestId,
    "request-body-read-failure",
    "metadata retains request ID",
  );
  equal(
    metadata.generationId,
    "generation-body-read-failure",
    "metadata retains generation ID header",
  );
  equal(
    metadata.wireReasoningEffort,
    "max",
    "metadata retains xhigh-to-max wire effort",
  );
  deepEqual(
    metadata.routing,
    {
      only: ["deepinfra"],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
    },
    "metadata retains the requested pinned route",
  );

  for (const unproven of [
    "servedModel",
    "upstreamProvider",
    "usage",
    "openrouterMetadata",
    "finishReason",
  ]) {
    equal(
      Object.prototype.hasOwnProperty.call(metadata, unproven),
      false,
      `body-read failure does not fabricate ${unproven}`,
    );
  }
}

async function testErrorBodyReadFailureRetainsRequestProof(): Promise<void> {
  let fetchCount = 0;
  globalThis.fetch = (async (): Promise<Response> => {
    fetchCount += 1;
    const response = new Response("partial error", {
      status: 502,
      headers: {
        "x-request-id": "request-error-body-read-failure",
        "x-generation-id": "generation-error-body-read-failure",
      },
    });
    Object.defineProperty(response, "text", {
      value: async () => {
        throw new TypeError("terminated");
      },
    });
    return response;
  }) as typeof fetch;

  let caught:
    | (Error & { providerMetadata?: Record<string, unknown> })
    | undefined;
  try {
    await callAI(
      getConfigForModel("openrouter", EXACT_MODEL),
      "offline system",
      "offline user",
      { strictExecution: true },
    );
  } catch (error) {
    caught =
      error instanceof Error
        ? (error as Error & {
            providerMetadata?: Record<string, unknown>;
          })
        : new Error(String(error));
  }

  ok(caught, "non-OK body-read failure rejects the strict call");
  ok(
    caught.message.includes(
      "OpenRouter error response body read error after HTTP 502: terminated",
    ),
    "non-OK body-read failure remains explicit",
  );
  equal(fetchCount, 1, "strict non-OK body-read failure is not retried");
  equal(
    caught.providerMetadata?.httpStatus,
    502,
    "non-OK body-read failure retains status",
  );
  equal(
    caught.providerMetadata?.requestId,
    "request-error-body-read-failure",
    "non-OK body-read failure retains request ID",
  );
  equal(
    Object.prototype.hasOwnProperty.call(
      caught.providerMetadata ?? {},
      "servedModel",
    ),
    false,
    "non-OK body-read failure does not fabricate served model",
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

async function testStrictFailureIsNotReportedAsAppliedFallback(): Promise<void> {
  const logBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "logAiCall",
  );
  ok(
    /const strictFailure[\s\S]*?strictExecution[\s\S]*?callResult\.parseQuality\s*!==\s*"clean"/m.test(
      logBody,
    ),
    "AI logging identifies strict invalid results",
  );
  ok(
    /const rejectedCodePlaceholder[\s\S]*?const suppressParsedResult\s*=\s*strictFailure\s*\|\|\s*rejectedCodePlaceholder/m.test(
      logBody,
    ),
    "code timeout/error placeholders are suppressed in every mode",
  );
  ok(
    /parsedResult:\s*suppressParsedResult\s*\?\s*null\s*:\s*callResult\.result/m.test(
      logBody,
    ),
    "invalid calls do not persist a synthetic parsed result",
  );
  ok(
    /usedFallback:\s*strictExecution\s*\|\|\s*rejectedCodePlaceholder\s*\?\s*false\s*:\s*usedFallback/m.test(
      logBody,
    ),
    "rejected code placeholders are never persisted as applied fallbacks",
  );

  for (const functionName of [
    "processClues",
    "processGuesses",
    "processInterceptions",
  ]) {
    const body = await loadFunctionBody(
      "server/headlessRunner.ts",
      functionName,
    );
    ok(
      /const fallbackCandidate[\s\S]*?const usedFallback\s*=\s*matchConfig\?\.strictExecution\s*===\s*true\s*\?\s*false\s*:\s*fallbackCandidate/m.test(
        body,
      ),
      `${functionName} distinguishes a candidate from an applied fallback`,
    );
  }

  const clueBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "processClues",
  );
  ok(
    /if\s*\(usedFallback\)[\s\S]*?type:\s*"fallback_clue"/m.test(clueBody),
    "fallback-clue quality accounting occurs only for an applied fallback",
  );

  const deliberationBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "processDeliberation",
  );
  ok(
    /const usedFallback\s*=\s*context\.strictExecution\s*===\s*true\s*\?\s*false\s*:\s*fallbackCandidate/m.test(
      deliberationBody,
    ),
    "strict deliberation does not label its empty candidate as used",
  );
  ok(
    /const rejectDeliberation[\s\S]*?type:\s*"deliberation_failure"[\s\S]*?actionApplied:\s*false[\s\S]*?usedFallback:\s*false/m.test(
      deliberationBody,
    ),
    "deliberation records failure without claiming a fallback action",
  );
}

async function main(): Promise<void> {
  try {
    await testBodyReadFailureRetainsRequestProof();
    await testErrorBodyReadFailureRetainsRequestProof();
    await testStrictFailureIsNotReportedAsAppliedFallback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }

  console.log(
    `Strict failure truthfulness checks passed (${assertions} assertions).`,
  );
}

main().catch((error) => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  }
  console.error("Strict failure truthfulness checks failed:");
  console.error(error);
  process.exitCode = 1;
});
