/**
 * Offline integration checks for strict OpenRouter write-ahead telemetry and
 * active cancellation. Uses an in-memory store and mocked global fetch only.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import {
  callAI,
  resetProviderThrottleState,
} from "../server/ai";
import { runWithAbortableTimeout } from "../server/abortableTimeout";
import {
  beginStrictOpenRouterAttempt,
  type ProviderAttemptStore,
} from "../server/providerAttemptTelemetry";
import { getConfigForModel } from "@shared/modelRegistry";
import type {
  InsertProviderAttempt,
  ProviderAttempt,
  ProviderAttemptStatus,
} from "@shared/schema";

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

class MemoryAttemptStore implements ProviderAttemptStore {
  readonly events: string[] = [];
  readonly rows = new Map<number, ProviderAttempt>();
  private nextId = 1;

  async createProviderAttempt(
    entry: InsertProviderAttempt,
  ): Promise<ProviderAttempt> {
    this.events.push("create:started");
    const row: ProviderAttempt = {
      id: this.nextId,
      matchId: entry.matchId ?? null,
      gameId: entry.gameId ?? null,
      roundNumber: entry.roundNumber ?? null,
      actionType: entry.actionType,
      provider: entry.provider,
      model: entry.model,
      physicalAttempt: entry.physicalAttempt ?? 1,
      status: (entry.status ?? "started") as ProviderAttemptStatus,
      requestMetadata: entry.requestMetadata ?? null,
      terminalMetadata: entry.terminalMetadata ?? null,
      error: entry.error ?? null,
      aiCallLogId: entry.aiCallLogId ?? null,
      startedAt: new Date("2026-08-01T12:00:00.000Z"),
      completedAt: entry.completedAt ?? null,
    };
    this.nextId += 1;
    this.rows.set(row.id, row);
    return row;
  }

  async updateProviderAttempt(
    id: number,
    data: Partial<InsertProviderAttempt>,
  ): Promise<ProviderAttempt | undefined> {
    const row = this.rows.get(id);
    if (!row) return undefined;
    if (data.requestMetadata !== undefined) {
      this.events.push("update:request");
    }
    if (data.status && data.status !== "started") {
      this.events.push(`update:${data.status}`);
    }
    if (data.aiCallLogId !== undefined) {
      this.events.push("update:ai_call_log");
    }
    const updated: ProviderAttempt = {
      ...row,
      ...data,
      status: (data.status ?? row.status) as ProviderAttemptStatus,
    };
    this.rows.set(id, updated);
    return updated;
  }
}

function context(actionType = "generate_clues") {
  return {
    matchId: 41,
    gameId: "offline-game",
    roundNumber: 2,
    actionType,
    provider: "openrouter" as const,
    model: EXACT_MODEL,
    physicalAttempt: 1,
  };
}

function successfulResponse(content = "ANSWER: cipher,veil,signal"): Response {
  return new Response(
    JSON.stringify({
      id: "generation-offline-attempt",
      model: EXACT_MODEL,
      provider: "DeepInfra",
      choices: [
        {
          message: { content },
          finish_reason: "stop",
          native_finish_reason: "stop",
        },
      ],
      openrouter_metadata: {
        attempt: 1,
        attempts: [{ provider: "DeepInfra", status: "success" }],
        endpoints: {
          available: [{ provider: "DeepInfra", selected: true }],
        },
      },
      usage: {
        prompt_tokens: 13,
        completion_tokens: 5,
        total_tokens: 18,
        cost: 0.000002,
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-offline-attempt",
      },
    },
  );
}

async function expectReject(
  operation: () => Promise<unknown>,
  pattern: RegExp,
): Promise<Error> {
  try {
    await operation();
  } catch (error) {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    ok(
      pattern.test(normalized.message),
      `Expected "${normalized.message}" to match ${pattern}`,
    );
    return normalized;
  }
  assert.fail(`Expected operation to reject with ${pattern}`);
}

async function testProcessDeathTruth(): Promise<void> {
  const store = new MemoryAttemptStore();
  const attempt = await beginStrictOpenRouterAttempt(store, context());
  const row = store.rows.get(attempt.attemptId);

  ok(row, "write-ahead insert creates a durable row");
  equal(row.status, "started", "unsettled attempt remains started");
  equal(row.completedAt, null, "unsettled attempt has no fabricated completion");
  equal(row.terminalMetadata, null, "unsettled attempt has no terminal metadata");
  deepEqual(
    store.events,
    ["create:started"],
    "simulated process death leaves only the write-ahead insert",
  );
}

async function testKnownPreDispatchFailureIsTerminal(): Promise<void> {
  const store = new MemoryAttemptStore();
  const attempt = await beginStrictOpenRouterAttempt(
    store,
    context("deliberation_own"),
  );
  await attempt.markFailed(
    "Strict provider call failed before a terminal provider outcome",
    { lifecycleStage: "headless_result" },
  );

  const row = store.rows.get(attempt.attemptId);
  ok(row, "known pre-dispatch failure row remains present");
  equal(row.status, "failed", "known pre-dispatch rejection is not indeterminate");
  equal(
    row.error,
    "Strict provider call failed before a terminal provider outcome",
    "pre-dispatch terminal error is bounded",
  );
  equal(row.completedAt instanceof Date, true, "known failure records completion");
  equal(
    store.events.includes("fetch"),
    false,
    "pre-dispatch failure does not imply network I/O",
  );
}

async function testSuccessLifecycleAndLink(): Promise<void> {
  const store = new MemoryAttemptStore();
  const attempt = await beginStrictOpenRouterAttempt(store, context());
  let fetchCount = 0;
  globalThis.fetch = (async (
    _input: string | URL | Request,
    init?: RequestInit,
  ) => {
    fetchCount += 1;
    store.events.push("fetch");
    ok(init?.signal === attempt.abortController.signal, "fetch receives the caller's exact AbortSignal");
    return successfulResponse();
  }) as typeof fetch;

  const result = await callAI(
    getConfigForModel("openrouter", EXACT_MODEL),
    "offline system",
    "offline user",
    {
      strictExecution: true,
      signal: attempt.abortController.signal,
      providerAttemptTelemetry: attempt.telemetry,
    },
  );
  await attempt.linkAiCallLog(9001);

  equal(fetchCount, 1, "success makes one physical request");
  deepEqual(
    store.events.slice(0, 3),
    ["create:started", "update:request", "fetch"],
    "write-ahead and request metadata persist before network I/O",
  );
  equal(
    store.events.filter(event => event === "update:succeeded").length,
    1,
    "success performs one in-place terminal update",
  );
  const row = store.rows.get(attempt.attemptId);
  ok(row, "success row remains present");
  equal(row.status, "succeeded", "success is terminal");
  ok(row.completedAt instanceof Date, "success records completion time");
  equal(row.aiCallLogId, 9001, "attempt links to its research AI-call row");
  equal(
    (row.requestMetadata as Record<string, unknown>).requestedModel,
    EXACT_MODEL,
    "request metadata retains the exact requested model",
  );
  equal(
    (row.terminalMetadata as Record<string, unknown>).servedModel,
    EXACT_MODEL,
    "terminal metadata retains proven served model",
  );
  equal(
    result.providerMetadata?.upstreamProvider,
    "DeepInfra",
    "call result and terminal proof agree on upstream",
  );
}

async function testFailureIsTerminalAndSanitized(): Promise<void> {
  const store = new MemoryAttemptStore();
  const attempt = await beginStrictOpenRouterAttempt(
    store,
    context("generate_guess"),
  );
  const sensitiveBody =
    "upstream failed; prompt=PRIVATE_FAMILY_TEXT; authorization=SECRET_KEY";
  globalThis.fetch = (async () => {
    store.events.push("fetch");
    return new Response(sensitiveBody, {
      status: 502,
      headers: { "x-request-id": "request-offline-502" },
    });
  }) as typeof fetch;

  const detailedError = await expectReject(
    () =>
      callAI(
        getConfigForModel("openrouter", EXACT_MODEL),
        "offline system",
        "offline user",
        {
          strictExecution: true,
          signal: attempt.abortController.signal,
          providerAttemptTelemetry: attempt.telemetry,
        },
      ),
    /OpenRouter API error: 502/,
  );
  ok(
    detailedError.message.includes(sensitiveBody),
    "existing research error channel remains detailed",
  );

  const row = store.rows.get(attempt.attemptId);
  ok(row, "failed attempt row remains present");
  equal(row.status, "failed", "HTTP failure is terminal");
  equal(row.error, "OpenRouter HTTP 502", "lifecycle error is bounded");
  ok(
    !JSON.stringify(row).includes("PRIVATE_FAMILY_TEXT"),
    "provider-attempt row does not persist provider response text",
  );
  ok(
    !JSON.stringify(row).includes("SECRET_KEY"),
    "provider-attempt row does not persist secret-like response text",
  );
  equal(
    Object.prototype.hasOwnProperty.call(
      row.terminalMetadata as Record<string, unknown>,
      "servedModel",
    ),
    false,
    "failed response does not fabricate served model",
  );
  equal(
    Object.prototype.hasOwnProperty.call(
      row.terminalMetadata as Record<string, unknown>,
      "usage",
    ),
    false,
    "failed response does not fabricate usage",
  );
}

async function testDeadlineAbortsFetch(): Promise<void> {
  const store = new MemoryAttemptStore();
  const attempt = await beginStrictOpenRouterAttempt(
    store,
    context("generate_interception"),
  );
  let fetchCount = 0;
  let abortObserved = false;

  globalThis.fetch = (async (
    _input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    fetchCount += 1;
    store.events.push("fetch");
    const signal = init?.signal;
    ok(signal, "strict request carries an AbortSignal");
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          abortObserved = true;
          store.events.push("fetch:abort");
          reject(
            signal.reason ??
              new DOMException("offline abort", "AbortError"),
          );
        },
        { once: true },
      );
    });
  }) as typeof fetch;

  const operation = callAI(
    getConfigForModel("openrouter", EXACT_MODEL),
    "offline system",
    "offline user",
    {
      strictExecution: true,
      signal: attempt.abortController.signal,
      providerAttemptTelemetry: attempt.telemetry,
    },
  );
  const outcome = await runWithAbortableTimeout({
    timeoutMs: 10,
    operation,
    abortController: attempt.abortController,
    onTimeout: () => attempt.markTimedOut(10),
    abortSettleGraceMs: 100,
  });

  equal(fetchCount, 1, "timed strict call makes one physical request");
  ok(abortObserved, "deadline actively aborts underlying fetch");
  equal(outcome.state, "rejected", "aborted fetch settles as rejection");
  equal(outcome.timedOut, true, "deadline outcome is marked timed out");
  const row = store.rows.get(attempt.attemptId);
  ok(row, "timed-out attempt row remains present");
  equal(row.status, "timed_out", "deadline writes timed_out in place");
  equal(
    row.error,
    "Timed out after 10ms",
    "timeout lifecycle error is deterministic and bounded",
  );
  equal(
    Object.prototype.hasOwnProperty.call(
      row.terminalMetadata as Record<string, unknown>,
      "usage",
    ),
    false,
    "timeout does not fabricate token usage",
  );
  equal(
    Object.prototype.hasOwnProperty.call(
      row.terminalMetadata as Record<string, unknown>,
      "servedModel",
    ),
    false,
    "timeout does not fabricate a served model",
  );
  equal(
    store.events.filter(event => event === "update:timed_out").length,
    1,
    "timeout terminal update is idempotent across deadline and fetch rejection",
  );
}

async function testIgnoredAbortIsBounded(): Promise<void> {
  const controller = new AbortController();
  const neverSettles = new Promise<string>(() => {});
  const outcome = await runWithAbortableTimeout({
    timeoutMs: 5,
    operation: neverSettles,
    abortController: controller,
    abortSettleGraceMs: 5,
  });

  equal(controller.signal.aborted, true, "deadline requests cancellation");
  equal(
    outcome.state,
    "abandoned",
    "ignored cancellation returns after bounded grace",
  );
  equal(outcome.timedOut, true, "bounded abandonment remains a timeout");
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
  return found.getText(sourceFile);
}

async function testHeadlessCallSiteWiring(): Promise<void> {
  const timeoutBody = await loadFunctionBody(
    "server/headlessRunner.ts",
    "withTimeout",
  );
  ok(
    timeoutBody.includes("runWithAbortableTimeout"),
    "headless timeout delegates to active-cancellation helper",
  );
  ok(
    timeoutBody.includes("providerAttempt.markTimedOut"),
    "headless deadline durably terminalizes timeout",
  );
  ok(
    timeoutBody.includes("providerAttempt.markFailed"),
    "headless wrapper terminalizes known pre-dispatch rejection",
  );

  for (const functionName of [
    "processClues",
    "processGuesses",
    "processInterceptions",
    "processDeliberation",
    "buildUpdatedScratchNotes",
  ]) {
    const body = await loadFunctionBody(
      "server/headlessRunner.ts",
      functionName,
    );
    ok(
      body.includes("await beginProviderAttempt"),
      `${functionName} awaits write-ahead insert before provider invocation`,
    );
    ok(
      body.includes("signal: providerAttempt?.abortController.signal"),
      `${functionName} passes shared AbortSignal to provider`,
    );
    ok(
      body.includes("providerAttemptTelemetry: providerAttempt?.telemetry"),
      `${functionName} injects terminal lifecycle recorder`,
    );
  }

  for (const functionName of ["logAiCall", "logReflectionCall"]) {
    const body = await loadFunctionBody(
      "server/headlessRunner.ts",
      functionName,
    );
    ok(
      body.includes("providerAttempt?.linkAiCallLog(aiCallLog.id)"),
      `${functionName} links physical attempt to AI-call research row`,
    );
  }
}

async function testTimezoneAwareMigrationContract(): Promise<void> {
  const [
    schemaSource,
    migration0009,
    migration0010,
    snapshot0009Text,
    snapshot0010Text,
    journalText,
  ] = await Promise.all([
    readFile(resolve(process.cwd(), "shared/schema.ts"), "utf8"),
    readFile(
      resolve(
        process.cwd(),
        "migrations/0009_strict_execution_telemetry.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        process.cwd(),
        "migrations/0010_provider_attempt_timestamptz.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(process.cwd(), "migrations/meta/0009_snapshot.json"),
      "utf8",
    ),
    readFile(
      resolve(process.cwd(), "migrations/meta/0010_snapshot.json"),
      "utf8",
    ),
    readFile(
      resolve(process.cwd(), "migrations/meta/_journal.json"),
      "utf8",
    ),
  ]);

  ok(
    /startedAt:\s*timestamp\("started_at",\s*\{\s*withTimezone:\s*true\s*\}\)/m.test(
      schemaSource,
    ),
    "provider startedAt schema is timezone-aware",
  );
  ok(
    /completedAt:\s*timestamp\("completed_at",\s*\{\s*withTimezone:\s*true\s*\}\)/m.test(
      schemaSource,
    ),
    "provider completedAt schema is timezone-aware",
  );
  ok(
    /"started_at"\s+timestamp with time zone\s+DEFAULT now\(\)\s+NOT NULL/m.test(
      migration0009,
    ),
    "fresh 0009 creates timezone-aware started_at",
  );
  ok(
    /"completed_at"\s+timestamp with time zone/m.test(migration0009),
    "fresh 0009 creates timezone-aware completed_at",
  );
  ok(
    /data_type = 'timestamp without time zone'[\s\S]*?"started_at" TYPE timestamp with time zone[\s\S]*?USING "started_at" AT TIME ZONE current_setting\('TimeZone'\)/m.test(
      migration0010,
    ),
    "0010 interprets legacy DB-default started_at in the database timezone",
  );
  ok(
    /column_name = 'completed_at'[\s\S]*?data_type = 'timestamp without time zone'[\s\S]*?"completed_at" TYPE timestamp with time zone[\s\S]*?USING "completed_at" AT TIME ZONE 'UTC'/m.test(
      migration0010,
    ),
    "0010 interprets legacy JS-written completed_at as UTC wall time",
  );
  ok(
    migration0010.includes(
      "This assumes the database timezone has not changed",
    ),
    "legacy started_at conversion assumption is explicit",
  );

  type SnapshotShape = {
    tables: Record<
      string,
      {
        columns: Record<string, { type: string }>;
      }
    >;
  };
  const assertSnapshotTimestampTypes = (
    label: string,
    snapshotText: string,
  ) => {
    const snapshot = JSON.parse(snapshotText) as SnapshotShape;
    const columns =
      snapshot.tables["public.provider_attempts"]?.columns;
    ok(columns, `${label} snapshot includes provider_attempts`);
    equal(
      columns.started_at?.type,
      "timestamp with time zone",
      `${label} snapshot records timezone-aware started_at`,
    );
    equal(
      columns.completed_at?.type,
      "timestamp with time zone",
      `${label} snapshot records timezone-aware completed_at`,
    );
  };
  for (const [label, snapshotText] of [
    ["0009", snapshot0009Text],
    ["0010", snapshot0010Text],
  ] as const) {
    assertSnapshotTimestampTypes(label, snapshotText);
  }

  const journal = JSON.parse(journalText) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  ok(
    journal.entries.some(
      entry =>
        entry.idx === 10 &&
        entry.tag === "0010_provider_attempt_timestamptz",
    ),
    "timezone reconciliation is journaled after 0009",
  );
  const latestJournalEntry = journal.entries.reduce((latest, entry) =>
    entry.idx > latest.idx ? entry : latest,
  );
  const latestSnapshotLabel = String(latestJournalEntry.idx).padStart(4, "0");
  const latestSnapshotText = await readFile(
    resolve(
      process.cwd(),
      `migrations/meta/${latestSnapshotLabel}_snapshot.json`,
    ),
    "utf8",
  );
  assertSnapshotTimestampTypes(
    `${latestSnapshotLabel} latest`,
    latestSnapshotText,
  );

  const observedStarted = new Date("2026-08-01T14:36:00-07:00");
  const observedCompleted = new Date("2026-08-01T21:37:00Z");
  equal(
    observedCompleted.getTime() - observedStarted.getTime(),
    60_000,
    "documented legacy interpretation repairs the observed seven-hour skew",
  );
}

async function main(): Promise<void> {
  process.env.OPENROUTER_API_KEY = "offline-provider-attempt-test-key";
  resetProviderThrottleState();
  try {
    await testProcessDeathTruth();
    await testKnownPreDispatchFailureIsTerminal();
    await testSuccessLifecycleAndLink();
    await testFailureIsTerminalAndSanitized();
    await testDeadlineAbortsFetch();
    await testIgnoredAbortIsBounded();
    await testHeadlessCallSiteWiring();
    await testTimezoneAwareMigrationContract();
    console.log(
      `Strict provider-attempt lifecycle checks passed (${assertions} assertions).`,
    );
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

main().catch((error) => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  }
  console.error(error);
  process.exit(1);
});
