/**
 * Provider-free checks for the fixed candidate-policy A/B harness.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import {
  generateClues,
  generateDeliberationMessage,
  generateGuess,
  generateInterception,
  generateReflection,
  buildCluePromptForConfig,
  resetProviderThrottleState,
} from "../server/ai";
import {
  hasActionValidationFailure,
  rejectedHeadlessCallResult,
  resolveActionValidationDisposition,
} from "../server/headlessValidationPolicy";
import type { HeadlessMatchConfig } from "@shared/schema";
import { getConfigForModel } from "@shared/modelRegistry";
import {
  CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  INTERMEDIATE_HOPS_SOURCE,
  compileStrategyArtifact,
  contentHash,
  mintStrategyArtifact,
  sha256Hex,
  HERPETARIUM_CLUE_RULES,
  validateClueSubmission,
  validateCodeGuess,
} from "@shared/substrate";
import {
  CANDIDATE_POLICY_AB_SCHEDULES,
  CALLS_PER_MATCH_ROUND,
  EXACT_COMPLETION_TOKEN_LIMIT,
  EXACT_MODEL,
  PRIMARY_ROUND_WINDOW,
  aggregateBehavioralSeedBlocks,
  assertDisposableLocalDatabaseUrl,
  assertPrimaryRoundWindowMatchesSchedule,
  candidatePolicyAbJobs,
  preregisteredRoundOnePromptProof,
  prepareNewSecureOutputDirectory,
  resolveOutputAgainstRealParent,
  runCandidatePolicyAbExperiment,
  validateCapturedMatch,
  type CandidatePolicyAbDatabaseLineage,
  type CandidatePolicyAbDependencies,
  type CandidatePolicyAbSourceLineage,
  type CapturedMatchData,
  type MatchJob,
} from "./run-candidate-policy-ab-experiment";
import {
  candidatePolicyAbDatabasePreparationPlan,
  prepareCandidatePolicyAbDatabase,
} from "./prepare-candidate-policy-ab-database";
import { storedPrivateProviderReceipt } from "../server/privateProviderReceipt";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = resolve(
  new URL("..", import.meta.url).pathname,
);
const TSX = resolve(REPOSITORY_ROOT, "node_modules/.bin/tsx");
const compiled = compileStrategyArtifact(
  mintStrategyArtifact(INTERMEDIATE_HOPS_SOURCE),
).compiled;
const originalFetch = globalThis.fetch;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
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

async function rejects(
  operation: () => Promise<unknown>,
  pattern: RegExp,
  message: string,
): Promise<void> {
  await assert.rejects(operation, pattern, message);
  assertions += 1;
}

async function withTempRoot<T>(
  operation: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "herp-cpab-test-"));
  try {
    return await operation(root);
  } finally {
    await chmod(root, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}

async function assertPersistedSelfHash(
  path: string,
  hashField: string,
  label: string,
): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  const claimed = parsed[hashField];
  const withoutHash = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key !== hashField),
  );
  equal(
    claimed,
    contentHash(withoutHash),
    `${label} self-hash recomputes from exact disk JSON`,
  );
  return parsed;
}

function sourceLineage(
  sourceSetHash = "a".repeat(64),
): CandidatePolicyAbSourceLineage {
  const runtimeIdentity = {
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    execPath: process.execPath,
  };
  const importResolution = {
    tsconfigPath: "tsconfig.json" as const,
    tsconfigSha256: "c".repeat(64),
    runtimeLoader: "tsx" as const,
    moduleResolution: "bundler",
    baseUrl: ".",
    strict: true,
    pathAliases: [
      {
        specifier: "@shared/*",
        declaredTargets: ["./shared/*"],
        resolvedRoots: ["shared"],
        allResolvedRootsInsideRepository: true,
      },
    ],
  };
  const installedPackages = [
    {
      name: "pg",
      declaredRange: "^8.16.3",
      installedVersion: "8.16.3",
      installedManifestPath: "node_modules/pg/package.json",
      installedManifestSha256: "d".repeat(64),
    },
  ];
  return {
    repositoryRoot: "/offline/source",
    capturedAt: "2026-08-01T12:00:00.000Z",
    gitCommitSha: "1".repeat(40),
    gitTreeSha: "2".repeat(40),
    gitCommitObjectType: "commit",
    gitDirty: false,
    files: [],
    importResolution: {
      ...importResolution,
      importResolutionHash: contentHash(importResolution),
    },
    installedDependencies: {
      packages: installedPackages,
      installedDependencyHash: contentHash(installedPackages),
    },
    sourceSetHash,
    runtimeIdentity,
    runtimeIdentityHash: contentHash(runtimeIdentity),
  };
}

function databaseLineage(): CandidatePolicyAbDatabaseLineage {
  const withoutHash = {
    databaseName: "herp_decrypto_ab_offline_test",
    socketDirectory: "/tmp",
    transport: "local_unix_socket" as const,
    initialApplicationRows: 0 as const,
    requiredTables: [
      "ai_call_logs",
      "match_rounds",
      "matches",
      "provider_attempts",
      "team_chatter",
    ],
    requiredTelemetryColumns: [
      "ai_call_logs.action_applied",
      "ai_call_logs.actor_id",
      "ai_call_logs.team",
      "ai_call_logs.validation_metadata",
      "provider_attempts.action_applied",
      "provider_attempts.actor_id",
      "provider_attempts.private_response_receipt",
      "provider_attempts.team",
      "provider_attempts.validation_metadata",
    ],
    provisioningContract: {
      command:
        "npm run experiment:candidate-policy-ab-db-prepare" as const,
      schemaSyncCommand: "npm run db:push" as const,
      mode: "schema_sync_not_migration_replay" as const,
      migrationJournalAcceptedForProvisioning: false as const,
    },
    schemaHash: "b".repeat(64),
  };
  return {
    ...withoutHash,
    databaseLineageHash: contentHash(withoutHash),
  };
}

function jobOrdinal(config: HeadlessMatchConfig): number {
  const block = Number.parseInt(
    config.roleSwapGroupId!.match(/(\d+)$/)?.[1] ?? "0",
    10,
  );
  return block * 2 - (config.focalTeam === "amber" ? 1 : 0);
}

function buildCapture(
  matchId: number,
  config: HeadlessMatchConfig,
): CapturedMatchData {
  const rounds = config.gameRules!.maxRounds;
  const schedule =
    CANDIDATE_POLICY_AB_SCHEDULES[
      config.matchmakingBucket as keyof typeof CANDIDATE_POLICY_AB_SCHEDULES
    ];
  const job = candidatePolicyAbJobs(schedule).find(
    (candidate) =>
      candidate.roleSwapGroupId === config.roleSwapGroupId &&
      candidate.treatmentTeam === config.focalTeam,
  )!;
  const playerConfigs = config.players.map((entry, index) => ({
    id: `actor-${index + 1}`,
    name: entry.name,
    isAI: true,
    aiProvider: entry.aiProvider,
    aiConfig: entry.aiConfig,
    team: entry.team,
  }));
  const actorFor = (team: "amber" | "blue", round: number) => {
    const teamPlayers = playerConfigs.filter((entry) => entry.team === team);
    return teamPlayers[(round - 1) % teamPlayers.length]!.id;
  };
  const otherActor = (team: "amber" | "blue", round: number) => {
    const cluegiver = actorFor(team, round);
    return playerConfigs.find(
      (entry) => entry.team === team && entry.id !== cluegiver,
    )!.id;
  };
  const arm = (team: "amber" | "blue") =>
    config.focalTeam === team ? "treatment" : "baseline";
  const matchRounds: Array<Record<string, unknown>> = [];
  const aiCallLogs: Array<Record<string, unknown>> = [];
  const providerAttempts: Array<Record<string, unknown>> = [];
  let callId = 1;
  for (let round = 1; round <= rounds; round += 1) {
    for (const team of ["amber", "blue"] as const) {
      matchRounds.push({
        id: matchRounds.length + 1,
        matchId,
        roundNumber: round,
        team,
        clueGiverId: actorFor(team, round),
        code: [1, 2, 3],
        clues: [`clue${round}a`, `clue${round}b`, `clue${round}c`],
        ownGuess: [1, 2, 3],
        opponentGuess: [1, 3, 2],
        ownCorrect: (round + (team === "amber" ? 0 : 1)) % 2 === 0,
        intercepted: (round + (team === "amber" ? 1 : 0)) % 3 === 0,
      });
    }
    for (const actionType of [
      "generate_clues",
      "generate_guess",
      "generate_interception",
    ] as const) {
      for (const team of ["amber", "blue"] as const) {
        const actorId =
          actionType === "generate_guess"
            ? otherActor(team, round)
            : actionType === "generate_interception"
              ? playerConfigs.find((entry) => entry.team === team)!.id
              : actorFor(team, round);
        const role =
          actionType === "generate_clues"
            ? "cluegiver"
            : actionType === "generate_guess"
              ? "own_guesser"
              : "interceptor";
        const promptArtifact = compiled.prompts[role];
        let prompt = `${promptArtifact.systemPrompt}\n\noffline ${actionType} task`;
        if (promptArtifact.taskDirectives) {
          prompt += `\n\nYour team's strategic approach:\n${promptArtifact.taskDirectives}`;
        }
        if (actionType === "generate_guess") {
          prompt += "\nStep 5 — Final Answer: offline fixture";
        } else if (actionType === "generate_interception") {
          prompt += "\nStep 6 — Final Interception: offline fixture";
        }
        if (actionType === "generate_clues") {
          if (round === 1) {
            const proof = preregisteredRoundOnePromptProof(
              job,
              schedule,
              team,
            );
            prompt =
              arm(team) === "treatment"
                ? proof.treatment.fullPrompt
                : proof.baseline.fullPrompt;
          } else if (arm(team) === "treatment") {
            prompt += `\n${CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.instruction}`;
            if (round >= 2) prompt += "\nYOUR PUBLIC COLUMN LEDGER";
          }
        }
        const validationMetadata = {
          validator:
            actionType === "generate_clues"
              ? "shared.validateClueSubmission@substrate"
              : "shared.validateCodeGuess@substrate",
          passed: true,
          problems: [],
        };
        const privateResponseBody = JSON.stringify({
          id: `offline-generation-${callId}`,
          model: EXACT_MODEL,
          provider: "DeepInfra",
          choices: [
            {
              message: {
                content:
                  actionType === "generate_clues"
                    ? "ANSWER: cipher,veil,signal"
                    : "ANSWER: 1,2,3",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            completion_tokens_details: {
              reasoning_tokens: 3,
            },
          },
        });
        const privateResponseReceipt =
          storedPrivateProviderReceipt({
            responseBodyText: privateResponseBody,
            parsedResponse: JSON.parse(privateResponseBody),
            bodyFormat: "parsed_json",
          });
        aiCallLogs.push({
          id: callId,
          matchId,
          gameId: `game-${matchId}`,
          roundNumber: round,
          team,
          actorId,
          provider: "openrouter",
          model: EXACT_MODEL,
          actionType,
          prompt,
          rawResponse:
            actionType === "generate_clues"
              ? "ANSWER: cipher,veil,signal"
              : "ANSWER: 1,2,3",
          parsedResult:
            actionType === "generate_clues"
              ? ["cipher", "veil", "signal"]
              : [1, 2, 3],
          actionApplied: true,
          validationMetadata,
          latencyMs: 100 + callId,
          timedOut: false,
          error: null,
          parseQuality: "clean",
          usedFallback: false,
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          estimatedCostUsd: "0.000003",
          reasoningTrace: null,
          providerMetadata: {
            usage: { costUsd: 0.000003 },
          },
          createdAt: new Date(
            Date.UTC(2026, 7, 1, 12, 0, callId),
          ),
        });
        providerAttempts.push({
          id: callId,
          matchId,
          gameId: `game-${matchId}`,
          roundNumber: round,
          team,
          actorId,
          actionType,
          provider: "openrouter",
          model: EXACT_MODEL,
          physicalAttempt: 1,
          status: "succeeded",
          requestMetadata: {
            requestedModel: EXACT_MODEL,
            requestedUpstream: "deepinfra",
            physicalAttempt: 1,
            wireReasoningEffort: "max",
            privateReasoningReceiptRequested: true,
            maxCompletionTokens: EXACT_COMPLETION_TOKEN_LIMIT,
            routing: {
              only: ["deepinfra"],
              allow_fallbacks: false,
              require_parameters: true,
              data_collection: "deny",
            },
          },
          terminalMetadata: {
            httpStatus: 200,
            servedModel: EXACT_MODEL,
            upstreamProvider: "DeepInfra",
            finishReason: "stop",
            openrouterMetadata: {
              attempt: 1,
              attempts: [{ provider: "DeepInfra", status: 200 }],
              endpoints: {
                available: [{ provider: "DeepInfra", selected: true }],
              },
            },
          },
          privateResponseReceipt,
          error: null,
          aiCallLogId: callId,
          actionApplied: true,
          validationMetadata,
          startedAt: new Date(
            Date.UTC(2026, 7, 1, 12, 0, callId),
          ),
          completedAt: new Date(
            Date.UTC(2026, 7, 1, 12, 0, callId + 1),
          ),
        });
        callId += 1;
      }
    }
  }
  return {
    match: {
      id: matchId,
      gameId: `game-${matchId}`,
      completedAt: new Date("2026-08-01T12:10:00.000Z"),
      winner: "amber",
      playerConfigs,
      amberKeywords: ["a", "b", "c", "d"],
      blueKeywords: ["e", "f", "g", "h"],
      totalRounds: rounds,
      gameSeed: config.seed,
      ablations: config.ablations,
      roleSwapGroupId: config.roleSwapGroupId,
      focalTeam: config.focalTeam,
      strictExecution: true,
      strategyLineage: {},
    },
    rounds: matchRounds,
    aiCallLogs,
    providerAttempts,
    teamChatter: [],
  };
}

function mockDependencies(options: {
  failOrdinals?: Set<number>;
  postSourceHash?: string;
  postSourceError?: Error;
  mutateCapture?: (capture: CapturedMatchData) => void;
  /** Throw on the nth (1-based) capture of a given match id. */
  captureErrorOnNthCall?: { matchId: number; call: number; error: Error };
} = {}): CandidatePolicyAbDependencies & {
  calls: HeadlessMatchConfig[];
  maxActive: () => number;
  closed: () => number;
  captureCalls: () => number;
  preregSeenBeforeCall: () => boolean;
} {
  const calls: HeadlessMatchConfig[] = [];
  const configs = new Map<number, HeadlessMatchConfig>();
  const capturesByMatch = new Map<number, number>();
  let nextMatchId = 100;
  let active = 0;
  let maxActive = 0;
  let closeCount = 0;
  let captureCount = 0;
  let preregSeen = false;
  return {
    calls,
    maxActive: () => maxActive,
    closed: () => closeCount,
    captureCalls: () => captureCount,
    preregSeenBeforeCall: () => preregSeen,
    inspectDatabase: async () => databaseLineage(),
    collectSourceLineage: async () => sourceLineage(),
    collectPostRunSourceLineage: async () => {
      if (options.postSourceError) {
        throw options.postSourceError;
      }
      return sourceLineage(options.postSourceHash ?? "a".repeat(64));
    },
    now: () => new Date("2026-08-01T12:00:00.000Z"),
    afterPreregistrationWritten: async (path) => {
      const prereg = JSON.parse(await readFile(path, "utf8"));
      ok(
        typeof prereg.preregistrationContentHash === "string",
        "durable self-hashed preregistration exists before execution",
      );
      equal(calls.length, 0, "no match starts before preregistration");
      preregSeen = true;
    },
    executeMatch: async (config) => {
      ok(preregSeen, "executor starts only after preregistration callback");
      calls.push(config);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const matchId = nextMatchId++;
      configs.set(matchId, config);
      await new Promise<void>((resolvePromise) =>
        setTimeout(resolvePromise, 5),
      );
      active -= 1;
      if (options.failOrdinals?.has(jobOrdinal(config))) {
        const error = new Error("offline injected match failure");
        Object.assign(error, { matchId });
        throw error;
      }
      return {
        matchId,
        gameId: `game-${matchId}`,
        winner: "amber" as const,
        totalRounds: config.gameRules!.maxRounds,
        teams: {},
        players: [],
      };
    },
    captureMatch: async (matchId) => {
      captureCount += 1;
      const nth = (capturesByMatch.get(matchId) ?? 0) + 1;
      capturesByMatch.set(matchId, nth);
      const failure = options.captureErrorOnNthCall;
      if (
        failure &&
        failure.matchId === matchId &&
        failure.call === nth
      ) {
        throw failure.error;
      }
      const capture = buildCapture(matchId, configs.get(matchId)!);
      options.mutateCapture?.(capture);
      return capture;
    },
    closeDatabase: async () => {
      closeCount += 1;
    },
  };
}

async function testFixedEnumerationsAndInputs(): Promise<void> {
  equal(
    CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"]
      .plannedProviderCalls,
    24,
    "mechanism canary is the fixed 24-call pair",
  );
  equal(
    CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"].protocolUse,
    "mechanism_telemetry_only",
    "mechanism canary is hard-coded as plumbing-only",
  );
  equal(
    CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"]
      .treatmentPackage,
    "candidate_policy_authority_carrier_exercised_behavior_excluded",
    "canary package name says the carrier runs and only behavior is excluded",
  );
  for (const [id, scheduleValue] of Object.entries(
    CANDIDATE_POLICY_AB_SCHEDULES,
  )) {
    ok(
      scheduleValue.treatmentPackageMeaning.length > 0 &&
        !scheduleValue.treatmentPackage.startsWith("none"),
      `schedule ${id} never labels an exercised carrier as no treatment`,
    );
  }
  ok(
    CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"]
      .treatmentPackageMeaning.includes("not an untreated or sham run"),
    "canary meaning explicitly denies being an untreated run",
  );
  equal(
    CANDIDATE_POLICY_AB_SCHEDULES.pilot.plannedProviderCalls,
    96,
    "pilot is the fixed 96-call two-block schedule",
  );
  equal(
    CANDIDATE_POLICY_AB_SCHEDULES.pilot.treatmentPackage,
    "full_candidate_policy_authority_plus_treatment_only_ledger_and_rejection",
    "pilot explicitly estimates the full bundled Herpetarium treatment",
  );
  equal(
    CANDIDATE_POLICY_AB_SCHEDULES.pilot.protocolUse,
    "within_herpetarium_descriptive_unreleasable_protocol_mismatch",
    "pilot explicitly carries the unreleasable protocol mismatch",
  );
  equal(
    CANDIDATE_POLICY_AB_SCHEDULES.full.plannedProviderCalls,
    576,
    "full schedule is the fixed 576-call design",
  );
  const jobs = candidatePolicyAbJobs(CANDIDATE_POLICY_AB_SCHEDULES.full);
  equal(jobs.length, 24, "full schedule has 24 mirrored matches");
  for (let index = 0; index < jobs.length; index += 2) {
    const left = jobs[index]!;
    const right = jobs[index + 1]!;
    equal(left.seed, right.seed, "mirrors share exact seed");
    equal(
      left.roleSwapGroupId,
      right.roleSwapGroupId,
      "mirrors share role-swap group",
    );
    equal(left.treatmentTeam, "amber", "first mirror treats amber");
    equal(right.treatmentTeam, "blue", "second mirror treats blue");
    deepEqual(
      left.config.players.map((entry) => entry.name),
      right.config.players.map((entry) => entry.name),
      "mirrors use neutral identical seat names and ordering",
    );
    deepEqual(
      left.config.ablations?.flags,
      ["no_scratch_notes", "no_opponent_transcript"],
      "both arms stamp both fixed information ablations",
    );
    equal(
      left.config.enablePostMatchReflection,
      false,
      "reflection is explicitly disabled",
    );
    equal(left.config.teamSize, 2, "opponent transcript is absent in 2v2");
    equal(
      left.config.gameRules?.minRoundsBeforeWin,
      4,
      "full design cannot terminate before round four",
    );
    equal(
      left.config.gameRules?.maxRounds,
      4,
      "full design terminates at round four",
    );
  }
}

async function testDisposableDatabaseGuard(): Promise<void> {
  deepEqual(
    assertDisposableLocalDatabaseUrl(
      "postgresql:///herp_decrypto_ab_offline_01?host=/tmp&port=5432",
    ),
    {
      databaseName: "herp_decrypto_ab_offline_01",
      socketDirectory: "/tmp",
    },
    "allowlisted empty-credential Unix-socket URL is accepted",
  );
  for (const invalid of [
    "postgresql://localhost/herp_decrypto_ab_offline_01",
    "postgresql://user:pass@localhost/herp_decrypto_ab_offline_01",
    "postgresql:///production?host=/tmp",
    "postgresql:///herp_decrypto_ab_x?host=/private/tmp",
  ]) {
    assert.throws(
      () => assertDisposableLocalDatabaseUrl(invalid),
      /requires a Unix-socket|must not embed|database name must match|socket must be/,
    );
    assertions += 1;
  }

  const validUrl =
    "postgresql:///herp_decrypto_ab_offline_02?host=/tmp&port=5432";
  const plan = candidatePolicyAbDatabasePreparationPlan(validUrl);
  equal(
    plan.schemaSyncCommand,
    "npm run db:push",
    "guarded provisioning contract explicitly uses schema-sync db:push",
  );
  equal(
    plan.migrationReplayAllowed,
    false,
    "candidate provisioning never treats migration replay as sufficient",
  );
  const order: string[] = [];
  const prepared = await prepareCandidatePolicyAbDatabase(validUrl, {
    assertBlankDatabase: async () => {
      order.push("blank-preflight");
    },
    runSchemaSync: async () => {
      order.push("db:push");
    },
    inspectPreparedDatabase: async () => {
      order.push("post-inspect");
      return {
        ...databaseLineage(),
        databaseName: "herp_decrypto_ab_offline_02",
      };
    },
  });
  deepEqual(
    order,
    ["blank-preflight", "db:push", "post-inspect"],
    "guarded preparation proves blank target before db:push and inspects after",
  );
  equal(
    prepared.databaseName,
    "herp_decrypto_ab_offline_02",
    "guarded preparation returns exact post-push database identity",
  );

  let unsafePushCalls = 0;
  await rejects(
    () =>
      prepareCandidatePolicyAbDatabase(
        "postgresql://prod.example.com/production",
        {
          runSchemaSync: async () => {
            unsafePushCalls += 1;
          },
        },
      ),
    /Unix-socket/,
    "network database is rejected before provisioning",
  );
  equal(
    unsafePushCalls,
    0,
    "unsafe target never reaches db:push",
  );
}

async function testOutputDirectoryGuards(): Promise<void> {
  equal(
    resolveOutputAgainstRealParent(
      "/candidate-ab-output",
      "/",
    ),
    "/candidate-ab-output",
    "filesystem-root child preserves its full basename",
  );
  await rejects(
    () =>
      prepareNewSecureOutputDirectory(
        resolve(REPOSITORY_ROOT, "forbidden-relative-output"),
      ),
    /outside the source repository/,
    "source-worktree-contained output is rejected",
  );
  await withTempRoot(async (root) => {
    const repo = resolve(root, "other-repo");
    await mkdir(repo);
    await execFileAsync("git", ["init", "-q", repo]);
    await rejects(
      () => prepareNewSecureOutputDirectory(resolve(repo, "output")),
      /any Git worktree or repository/,
      "output in another Git repository is rejected",
    );

    const link = resolve(root, "repo-link");
    await symlink(repo, link);
    await rejects(
      () => prepareNewSecureOutputDirectory(resolve(link, "output")),
      /any Git worktree or repository/,
      "symlinked parent into a Git repository is resolved and rejected",
    );

    const previous = process.cwd();
    process.chdir(root);
    try {
      const relativeOutput = await prepareNewSecureOutputDirectory(
        "./relative-output",
      );
      equal(
        relativeOutput,
        resolve(await realpath(root), "relative-output"),
        "relative non-repository output resolves safely",
      );
      const mode = (await lstat(relativeOutput)).mode & 0o777;
      equal(mode, 0o700, "output directory mode is 0700");
      await rejects(
        () => prepareNewSecureOutputDirectory("./relative-output"),
        /already exists/,
        "existing output is never clobbered",
      );
    } finally {
      process.chdir(previous);
    }
  });
}

async function testCompleteMechanismCanary(): Promise<void> {
  await withTempRoot(async (root) => {
    const dependencies = mockDependencies();
    const outputDir = resolve(root, "canary-output");
    const report = await runCandidatePolicyAbExperiment({
      outputDir,
      schedule: "mechanism-canary",
      dependencies,
    });
    equal(report.status, "complete", "valid canary completes");
    equal(
      report.releaseBoundary,
      "blocked_table_protocol_and_prompt_parity",
      "even a complete canary is not a Table release boundary",
    );
    equal(
      report.tableBotBuildLicenseEligible,
      false,
      "canary can never license a Table BotBuild",
    );
    equal(report.validMatches, 2, "both mirrored canary matches are valid");
    equal(dependencies.calls.length, 2, "each canary match executes once");
    equal(dependencies.maxActive(), 2, "only the mirrored pair runs concurrently");
    equal(dependencies.closed(), 1, "runner DB pool close seam runs exactly once");
    equal(
      report.behavioralResults.status,
      "excluded_mechanism_canary",
      "mechanism canary is excluded from behavioral analysis",
    );
    equal(
      report.behavioralResults.primary,
      null,
      "mechanism canary has no behavioral primary summary",
    );
    equal(
      report.operationalResults.providerCalls,
      24,
      "mechanism canary always exposes all 24 provider attempts",
    );
    equal(
      report.operationalResults.routeProof.exactPasses,
      24,
      "mechanism canary operational rollup proves every exact route",
    );
    equal(
      report.operationalResults.completionTokens.observed,
      24,
      "mechanism canary reports every completion-token receipt",
    );
    equal(
      report.operationalResults.completionTokens.unknownCalls,
      0,
      "mechanism canary reports no unknown completion-token receipts",
    );
    equal(
      report.operationalResults.completionTokens
        .minimumObservedHeadroomTokens,
      EXACT_COMPLETION_TOKEN_LIMIT - 5,
      "mechanism canary exposes exact worst-case completion-token headroom",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts.receiptRows,
      24,
      "mechanism canary retains one private paid-call receipt per attempt",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .exactBodiesStored,
      24,
      "mechanism canary privately retains every exact successful HTTP body",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .explicitReasoningAbsent,
      24,
      "provider-omitted reasoning is explicitly counted, not fabricated",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .lineageFailures,
      0,
      "all private receipt hashes and lengths validate",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .materialization.aggregateReportCopiesPerStoredBody,
      0,
      "aggregate report is no longer a materialized copy of any exact body",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .materialization.totalMaterializedCopiesPerStoredBody,
      2,
      "exact bodies exist in exactly two places: DB row and per-match artifact",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .materialization.minimumUnescapedUtf8BytesAcrossCopies,
      report.operationalResults.privatePaidCallReceipts
        .exactBodyUtf8Bytes * 2,
      "report quantifies the DB + match artifact body-copy floor",
    );
    deepEqual(
      report.privateEvidenceBoundary,
      {
        exactProviderResponseBodies:
          "disposable_database_and_per_match_private_artifact_only",
        aggregateCarriesBodyOrReasoningText: false,
        aggregateCarriesLineageAndAccounting: true,
      },
      "report states its own private-evidence boundary",
    );
    const totalAttempts = report.matchArtifacts.reduce(
      (sum, artifact) =>
        sum + (artifact.capture?.providerAttempts.length ?? 0),
      0,
    );
    equal(totalAttempts, 24, "canary retains all 24 one-attempt call rows");
    for (const artifact of report.matchArtifacts) {
      equal(artifact.integrity.valid, true, "mock match passes all invariants");
      equal(
        (await lstat(resolve(outputDir, artifact.job.artifactFile))).mode &
          0o777,
        0o600,
        "per-match artifact mode is 0600",
      );
    }
    equal(
      (await lstat(resolve(outputDir, "preregistration.json"))).mode & 0o777,
      0o600,
      "preregistration mode is 0600",
    );
    equal(
      (await lstat(resolve(outputDir, "report.json"))).mode & 0o777,
      0o600,
      "report mode is 0600",
    );
    const prereg = await assertPersistedSelfHash(
      resolve(outputDir, "preregistration.json"),
      "preregistrationContentHash",
      "preregistration",
    );
    equal(
      prereg.schedule.plannedProviderCalls,
      24,
      "persisted prereg fixes scheduled calls",
    );
    equal(
      prereg.treatmentContrast.compiledArtifact.id,
      "intermediate-hops@0.1.0",
      "prereg binds exact artifact identity",
    );
    deepEqual(
      prereg.route.privateReasoningReceipt,
      {
        requestedForEveryStrictDurableCall: true,
        requestShape: "reasoning_effort_max_exclude_false",
        storage:
          "operator_private_provider_attempt_exact_success_body",
        exactBodyLineage: "sha256_and_utf8_bytes",
        reasoningDisposition:
          "returned_fields_bound_within_exact_body_or_explicit_absence_with_token_count",
        exactBytesMaterializedIn: [
          "disposable_database_provider_attempt_row",
          "per_match_private_artifact_mode_0600",
        ],
        aggregateReportExposure: false,
        gameplayExposure: false,
        trackedEvidenceExposure: false,
      },
      "prereg fixes the operator-private reasoning receipt request, lineage, and isolation contract",
    );
    equal(
      prereg.treatmentContrast.candidatePolicy.contentHash,
      CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT.contentHash,
      "prereg binds exact policy identity",
    );
    equal(
      prereg.treatmentContrast.measuredPackage,
      "full_candidate_policy_authority_plus_treatment_only_ledger_and_rejection",
      "prereg names the full bundled treatment package",
    );
    equal(
      prereg.treatmentContrast.minimalMechanismNotEstimated,
      "minimal_ledger_plus_rejection_only",
      "prereg explicitly excludes the minimal ledger mechanism estimand",
    );
    equal(
      prereg.treatmentContrast.tableTransferBoundary.status,
      "forbidden_known_arm_assignment_and_instruction_mismatch",
      "prereg forbids cross-app transfer under the known prompt mismatch",
    );
    deepEqual(
      prereg.treatmentContrast.tableTransferBoundary
        .forbiddenInterpretations,
      [
        "table_marginal_effect",
        "table_upper_bound",
        "table_lower_bound",
        "table_seating_license",
      ],
      "prereg forbids marginal, bound, and seating interpretations",
    );
    equal(
      prereg.runtimeProtocolParity.status,
      "known_mismatch_unreleasable",
      "legacy runner mismatch is a durable preregistration boundary",
    );
    equal(
      prereg.runtimeProtocolParity.requiredTarget,
      "table-competitive-v1",
      "prereg names the required parity runner",
    );
    equal(
      prereg.runtimeProtocolParity.tableBotBuildLicenseEligible,
      false,
      "runtime mismatch cannot license a Table BotBuild",
    );
    equal(
      prereg.runtimeProtocolParity.knownMismatches.length,
      5,
      "all five independently audited runtime mismatches are enumerated",
    );
    ok(
      prereg.roundOnePromptProofs.every(
        (proof: any) =>
          proof.baseline.fullPromptSha256 ===
            sha256Hex(proof.baseline.fullPrompt) &&
          proof.baseline.charCount ===
            proof.baseline.fullPrompt.length &&
          proof.treatment.fullPromptSha256 ===
            sha256Hex(proof.treatment.fullPrompt) &&
          proof.treatment.charCount ===
            proof.treatment.fullPrompt.length &&
          proof.baseline.fullPromptSha256 !==
            proof.treatment.fullPromptSha256 &&
          proof.baseline.containsCandidatePolicy === false &&
          proof.treatment.containsCandidatePolicy === true &&
          proof.treatment.containsColumnLedger === false,
      ),
      "round-one whole-prompt difference is explicit and ledger-free",
    );
    for (const artifact of report.matchArtifacts) {
      const persistedArtifact = await assertPersistedSelfHash(
        resolve(outputDir, artifact.job.artifactFile),
        "artifactContentHash",
        `match artifact ${artifact.job.ordinal}`,
      );
      const capture = persistedArtifact.capture as {
        aiCallLogs: Array<{ createdAt: unknown }>;
        providerAttempts: Array<{
          startedAt: unknown;
          completedAt: unknown;
        }>;
      };
      equal(
        typeof capture.aiCallLogs[0]?.createdAt,
        "string",
        "Drizzle AI-call Date is hashed and persisted as its ISO string",
      );
      equal(
        typeof capture.providerAttempts[0]?.startedAt,
        "string",
        "Drizzle provider-attempt Date is hashed and persisted as its ISO string",
      );
    }
    const persistedReport = await assertPersistedSelfHash(
      resolve(outputDir, "report.json"),
      "reportContentHash",
      "final report",
    );
    equal(
      contentHash(persistedReport),
      contentHash(report),
      "returned final report is already the exact persisted JSON representation",
    );
  });
}

async function testSequentialBlocksAndFailureStop(): Promise<void> {
  await withTempRoot(async (root) => {
    const pilotDependencies = mockDependencies();
    const pilot = await runCandidatePolicyAbExperiment({
      outputDir: resolve(root, "pilot-output"),
      schedule: "pilot",
      dependencies: pilotDependencies,
    });
    equal(pilot.status, "complete", "four-match pilot completes");
    equal(pilotDependencies.calls.length, 4, "pilot executes four matches");
    equal(
      pilotDependencies.maxActive(),
      2,
      "pilot never exceeds pair concurrency two",
    );
    deepEqual(
      pilotDependencies.calls.map(jobOrdinal),
      [1, 2, 3, 4],
      "seed blocks launch sequentially and mirrors together",
    );
    equal(
      pilot.behavioralResults.status,
      "complete_descriptive_unreleasable_protocol_mismatch",
      "complete pilot remains explicitly unreleasable under protocol mismatch",
    );
    equal(
      pilot.tableBotBuildLicenseEligible,
      false,
      "complete within-Herpetarium pilot cannot license Table BotBuild",
    );
    ok(
      pilot.behavioralResults.qualification.includes(
        "cannot license a Table BotBuild",
      ),
      "behavioral qualification carries the transfer prohibition",
    );
    equal(
      pilot.behavioralResults.roundOne.interpretation,
      "wrapper_only_diagnostic",
      "round one is explicitly labeled wrapper-only diagnostic",
    );
    const primary = pilot.behavioralResults.primary!;
    const roundOne =
      pilot.behavioralResults.roundOne.analysis!;
    equal(
      primary.aggregate.analysisUnit,
      "paired_seed_block",
      "behavioral headline uses the preregistered paired seed block",
    );
    equal(
      primary.aggregate.seedBlocks,
      2,
      "pilot behavioral headline denominator is two seed blocks",
    );
    equal(
      primary.aggregate.teamRoundsAreNotIndependentReplicates,
      true,
      "report explicitly rejects team-round independence",
    );
    equal(primary.blocks.length, 2, "both block contrasts are exposed");
    for (const block of primary.blocks) {
      equal(
        block.mirrors.length,
        2,
        "each block exposes its two same-seed mirror contrasts",
      );
      for (const [arm, summary] of Object.entries(block.arms)) {
      equal(
        summary.roundScope,
        "2-4",
        `${arm} block outcomes are explicitly scoped to rounds 2-4`,
      );
      equal(
        summary.teamRounds,
        6,
        `${arm} block support denominator nests six later-round observations`,
      );
      equal(
        summary.teammateDecodesCorrect +
          summary.miscommunications,
        6,
        `${arm} primary decode numerators partition only rounds 2-4`,
      );
      }
    }
    for (const block of roundOne.blocks) {
      for (const [arm, summary] of Object.entries(block.arms)) {
      equal(
        summary.roundScope,
        "1",
        `${arm} round-one outcomes have a separate diagnostic window`,
      );
      equal(
        summary.teamRounds,
        2,
        `${arm} round-one support denominator stays nested in its block`,
      );
      }
    }
    equal(
      pilot.operationalResults.providerCalls,
      96,
      "pilot operational rollup independently retains every provider attempt",
    );
    equal(
      pilot.operationalResults.completionTokens.byArm.baseline.observed,
      48,
      "baseline completion-token distribution spans every all-round call",
    );
    equal(
      pilot.operationalResults.completionTokens.byArm.treatment.observed,
      48,
      "treatment completion-token distribution spans every all-round call",
    );

    const failedDependencies = mockDependencies({
      failOrdinals: new Set([1]),
    });
    const failed = await runCandidatePolicyAbExperiment({
      outputDir: resolve(root, "failed-output"),
      schedule: "full",
      dependencies: failedDependencies,
    });
    equal(failed.status, "incomplete", "failed pair makes run incomplete");
    equal(
      failedDependencies.calls.length,
      2,
      "both already-started mirrors settle but no later block launches",
    );
    equal(failed.startedMatches, 2, "failed matches remain represented");
    equal(failed.failedMatches, 1, "failed match is retained, not replaced");
    equal(failed.stoppedAfterBlock, 1, "run stops after failed pair");
    equal(
      failed.behavioralResults.status,
      "suppressed_incomplete",
      "incomplete run suppresses behavioral comparison",
    );
    equal(
      failed.operationalResults.providerCalls,
      48,
      "incomplete failed pair still reports every observed provider attempt",
    );
    equal(
      failed.operationalResults.failureState.failedMatchArtifacts,
      1,
      "operational failure state retains the failed match artifact",
    );
  });
}

async function testPostRunLineageFailureStillPersistsReport(): Promise<void> {
  await withTempRoot(async (root) => {
    const dependencies = mockDependencies({
      postSourceError: new Error("offline lineage recapture failure"),
    });
    const outputDir = resolve(root, "lineage-failure-output");
    const report = await runCandidatePolicyAbExperiment({
      outputDir,
      schedule: "mechanism-canary",
      dependencies,
    });

    equal(
      report.status,
      "incomplete",
      "post-run lineage recapture failure prevents a complete run",
    );
    equal(
      report.postRunSourceVerification.valid,
      false,
      "post-run lineage recapture failure is explicit in the report",
    );
    ok(
      report.postRunSourceVerification.mismatches[0]?.includes(
        "offline lineage recapture failure",
      ),
      "the report retains a bounded diagnostic for lineage recapture failure",
    );
    equal(
      dependencies.closed(),
      1,
      "database close still runs after post-run lineage recapture failure",
    );
    equal(
      (await lstat(resolve(outputDir, "report.json"))).mode & 0o777,
      0o600,
      "an incomplete lineage-failure report is durably written mode 0600",
    );
  });
}

/**
 * Blocks the first mirror's artifact path with a pre-existing file so the
 * no-clobber write fails after the match has already been launched and paid for.
 */
function blockFirstArtifactWrite(
  base: ReturnType<typeof mockDependencies>,
): CandidatePolicyAbDependencies {
  return {
    ...base,
    afterPreregistrationWritten: async (
      preregistrationPath,
      preregistration,
    ) => {
      await base.afterPreregistrationWritten!(
        preregistrationPath,
        preregistration,
      );
      await writeFile(
        resolve(
          preregistrationPath,
          "..",
          preregistration.jobs[0]!.artifactFile,
        ),
        '{"offline":"preexisting no-clobber sentinel"}\n',
        { mode: 0o600 },
      );
    },
  };
}

async function testArtifactWriteFailurePreservesSiblingAndReport(): Promise<void> {
  await withTempRoot(async (root) => {
    const dependencies = mockDependencies();
    const outputDir = resolve(root, "artifact-write-failure");
    const report = await runCandidatePolicyAbExperiment({
      outputDir,
      schedule: "pilot",
      dependencies: blockFirstArtifactWrite(dependencies),
    });
    equal(
      report.status,
      "incomplete",
      "one artifact persistence failure makes the run incomplete",
    );
    equal(
      report.startedMatches,
      2,
      "both mirrored jobs remain truthfully counted as launched",
    );
    equal(
      report.matchArtifacts.length,
      1,
      "the successfully persisted sibling remains in the report",
    );
    equal(
      report.artifactPersistenceFailures.length,
      1,
      "the unpersisted sibling has a sanitized failure record",
    );
    equal(
      report.artifactPersistenceFailures[0]!.ordinal,
      1,
      "artifact persistence failure names the exact preregistered ordinal",
    );
    equal(
      report.behavioralResults.status,
      "suppressed_incomplete",
      "artifact persistence failure suppresses pilot behavior",
    );
    equal(
      report.operationalResults.jobs.launched,
      2,
      "operational report distinguishes launched jobs",
    );
    equal(
      report.operationalResults.jobs.persistedArtifacts,
      1,
      "operational report distinguishes persisted artifacts",
    );
    equal(
      report.operationalResults.providerCalls,
      48,
      "both the persisted sibling and the database-recovered mirror are counted",
    );
    equal(
      report.operationalResults
        .missingProviderAttemptsAgainstStartedMatches,
      0,
      "no launched paid attempt is left unaccounted after recovery",
    );
    equal(
      report.operationalResults.jobs
        .unpersistedMatchesRecoveredFromDatabase,
      1,
      "recovered unpersisted match is counted separately from persisted ones",
    );
    equal(
      report.operationalResults.jobs.unpersistedMatchesNotRecoverable,
      0,
      "nothing was left unrecoverable in this scenario",
    );
    const recovery =
      report.artifactPersistenceFailures[0]!
        .recoveredOperationalSummary;
    equal(
      recovery.status,
      "recovered",
      "the unpersisted mirror's operational evidence was re-read from the DB",
    );
    equal(
      recovery.source,
      "disposable_database_requery_after_artifact_persistence_failure",
      "recovery is a database re-read, not a provider retry",
    );
    equal(
      recovery.exactProviderResponseBodiesIncluded,
      false,
      "recovered evidence carries no exact provider body",
    );
    equal(
      recovery.behavioralUse,
      "excluded_match_remains_unpersisted_and_suppressing",
      "recovery never readmits the match to behavior",
    );
    equal(
      recovery.evidence?.providerCalls,
      24,
      "recovered mirror accounts for all 24 of its paid attempts",
    );
    equal(
      recovery.evidence?.routeProof.exactPasses,
      24,
      "recovered mirror retains its exact route proofs",
    );
    equal(
      recovery.evidence?.privatePaidCallReceipts.exactBodiesStored,
      24,
      "recovered mirror reports its stored exact bodies by count, not content",
    );
    ok(
      (recovery.evidence?.cost.knownCostCalls ?? 0) > 0,
      "recovered mirror keeps its paid-cost accounting",
    );
    equal(
      dependencies.captureCalls(),
      3,
      "recovery re-reads the failed match exactly once and never re-runs it",
    );
    equal(
      dependencies.calls.length,
      2,
      "recovery launches no additional match",
    );
    const sibling = report.matchArtifacts[0]!;
    await assertPersistedSelfHash(
      resolve(outputDir, sibling.job.artifactFile),
      "artifactContentHash",
      "successful mirror after sibling artifact rejection",
    );
    equal(
      (await lstat(resolve(outputDir, sibling.job.artifactFile)))
        .mode & 0o777,
      0o600,
      "successful sibling artifact remains mode 0600",
    );
    await assertPersistedSelfHash(
      resolve(outputDir, "report.json"),
      "reportContentHash",
      "incomplete report after artifact rejection",
    );
    const reportText = await readFile(
      resolve(outputDir, "report.json"),
      "utf8",
    );
    ok(
      !reportText.includes("offline-generation-"),
      "no exact provider response body reaches the aggregate, recovered or persisted",
    );
    equal(
      await readFile(
        resolve(
          outputDir,
          report.artifactPersistenceFailures[0]!.artifactFile,
        ),
        "utf8",
      ),
      '{"offline":"preexisting no-clobber sentinel"}\n',
      "the blocking artifact file is never clobbered by recovery",
    );
  });
}

async function testUnrecoverableUnpersistedMatchStaysExplicit(): Promise<void> {
  await withTempRoot(async (root) => {
    const dependencies = mockDependencies({
      // Match 100 is the first mirror: it captures once during execution, then
      // the post-failure database re-read fails.
      captureErrorOnNthCall: {
        matchId: 100,
        call: 2,
        error: new Error(
          "offline disposable database is gone: postgresql://user:pw@/herp_decrypto_ab_x",
        ),
      },
    });
    const outputDir = resolve(root, "unrecoverable-unpersisted");
    const report = await runCandidatePolicyAbExperiment({
      outputDir,
      schedule: "pilot",
      dependencies: blockFirstArtifactWrite(dependencies),
    });
    const recovery =
      report.artifactPersistenceFailures[0]!
        .recoveredOperationalSummary;
    equal(
      recovery.status,
      "unavailable",
      "a failed database re-read is reported as unavailable, not as zero",
    );
    equal(
      recovery.evidence,
      null,
      "unavailable recovery fabricates no operational evidence",
    );
    ok(
      recovery.unavailableReason?.message.includes(
        "[REDACTED_DATABASE_URL]",
      ),
      "the recovery failure reason is sanitized like every other error",
    );
    equal(
      report.operationalResults.jobs.unpersistedMatchesNotRecoverable,
      1,
      "an unrecoverable unpersisted match is counted explicitly",
    );
    equal(
      report.operationalResults
        .missingProviderAttemptsAgainstStartedMatches,
      24,
      "unrecovered paid attempts stay visible as missing, never as absent",
    );
    equal(
      report.status,
      "incomplete",
      "an unrecoverable unpersisted match keeps the run incomplete",
    );
    equal(
      report.behavioralResults.status,
      "suppressed_incomplete",
      "recovery failure does not weaken behavioral suppression",
    );
    await assertPersistedSelfHash(
      resolve(outputDir, "report.json"),
      "reportContentHash",
      "report after unrecoverable artifact persistence failure",
    );
  });
}

/**
 * Rebuilds every captured receipt around bodies that carry unique sentinels, so
 * "the aggregate contains no body or reasoning text" is a byte-level claim
 * rather than a structural one.
 */
function sentinelBodyCapture(capture: CapturedMatchData): void {
  for (const attempt of capture.providerAttempts) {
    const bodyText = JSON.stringify({
      id: `OFFLINE-BODY-SENTINEL-${String(attempt.id)}`,
      model: EXACT_MODEL,
      provider: "DeepInfra",
      choices: [
        {
          message: {
            content: "ANSWER: 1,2,3",
            reasoning: `OFFLINE-REASONING-SENTINEL-${String(attempt.id)}`,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        completion_tokens_details: { reasoning_tokens: 3 },
      },
    });
    attempt.privateResponseReceipt = storedPrivateProviderReceipt({
      responseBodyText: bodyText,
      parsedResponse: JSON.parse(bodyText),
      bodyFormat: "parsed_json",
    });
  }
}

async function testAggregateReportOmitsExactProviderBodies(): Promise<void> {
  await withTempRoot(async (root) => {
    const dependencies = mockDependencies({
      mutateCapture: sentinelBodyCapture,
    });
    const outputDir = resolve(root, "aggregate-body-boundary");
    const report = await runCandidatePolicyAbExperiment({
      outputDir,
      schedule: "mechanism-canary",
      dependencies,
    });
    equal(
      report.status,
      "complete",
      "sentinel-body canary still satisfies every integrity invariant",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .hiddenReasoningPresentAndStored,
      24,
      "every sentinel body carries provider reasoning",
    );

    const reportText = await readFile(
      resolve(outputDir, "report.json"),
      "utf8",
    );
    ok(
      !reportText.includes("OFFLINE-BODY-SENTINEL-"),
      "aggregate report contains no exact provider response body text",
    );
    ok(
      !reportText.includes("OFFLINE-REASONING-SENTINEL-"),
      "aggregate report contains no provider reasoning text",
    );
    ok(
      !/"text":\s*"/.test(reportText),
      "aggregate report carries no receipt body text field at all",
    );

    let aggregateAttempts = 0;
    for (const entry of report.matchArtifacts) {
      const artifactText = await readFile(
        resolve(outputDir, entry.privateArtifact.relativePath),
        "utf8",
      );
      ok(
        artifactText.includes("OFFLINE-BODY-SENTINEL-") &&
          artifactText.includes("OFFLINE-REASONING-SENTINEL-"),
        "the 0600 per-match artifact still holds the exact bytes",
      );
      const artifact = JSON.parse(artifactText) as {
        artifactContentHash: string;
        capture: {
          providerAttempts: Array<{
            id: number;
            privateResponseReceipt: {
              responseBody: { text: string; sha256: string; utf8Bytes: number };
              reasoning: { sha256: string; presence: string };
            };
          }>;
        };
      };
      equal(
        entry.privateArtifact.artifactContentHash,
        artifact.artifactContentHash,
        "aggregate entry points at the authoritative artifact by self-hash",
      );
      equal(
        entry.privateArtifact.mode,
        "0600",
        "aggregate entry records the artifact's private mode",
      );
      equal(
        entry.privateArtifact.holdsExactProviderResponseBodies,
        true,
        "aggregate entry says where the exact bytes actually are",
      );
      equal(
        entry.aggregateProjection,
        "exact_provider_response_bodies_removed",
        "aggregate entry names itself a projection, not the artifact",
      );

      const authoritative = new Map(
        artifact.capture.providerAttempts.map((attempt) => [
          attempt.id,
          attempt.privateResponseReceipt,
        ]),
      );
      equal(
        entry.capture?.providerAttempts.length,
        12,
        "every provider attempt row survives the projection",
      );
      for (const attempt of entry.capture?.providerAttempts ?? []) {
        aggregateAttempts += 1;
        const projected = attempt.privateResponseReceipt as {
          responseBody: {
            sha256: string;
            utf8Bytes: number;
            textPresentInAuthoritativeCopies: boolean;
            textIncludedInThisAggregate: boolean;
          };
          reasoning: { sha256: string; presence: string };
          exactBytesLocation: string;
        };
        const truth = authoritative.get(attempt.id as number)!;
        equal(
          projected.responseBody.sha256,
          truth.responseBody.sha256,
          "projected body digest matches the authoritative receipt",
        );
        equal(
          projected.responseBody.utf8Bytes,
          truth.responseBody.utf8Bytes,
          "projected body UTF-8 length matches the authoritative receipt",
        );
        equal(
          projected.reasoning.sha256,
          truth.reasoning.sha256,
          "projected reasoning digest matches the authoritative receipt",
        );
        equal(
          projected.reasoning.presence,
          "present",
          "projected reasoning presence survives without its text",
        );
        equal(
          projected.responseBody.textPresentInAuthoritativeCopies,
          true,
          "projection states that the authoritative copies do hold the text",
        );
        equal(
          projected.responseBody.textIncludedInThisAggregate,
          false,
          "projection states that this aggregate does not",
        );
        equal(
          projected.exactBytesLocation,
          "provider_attempts_row_and_per_match_private_artifact_only",
          "projection names the two authoritative locations",
        );
        ok(
          !Object.prototype.hasOwnProperty.call(
            projected.responseBody,
            "text",
          ),
          "projected receipt has no body text key",
        );
        ok(
          typeof (attempt.terminalMetadata as { httpStatus?: unknown })
            ?.httpStatus === "number" &&
            typeof (attempt.requestMetadata as { routing?: unknown })
              ?.routing === "object",
          "route and request metadata survive the projection",
        );
      }
    }
    equal(
      aggregateAttempts,
      24,
      "all 24 paid attempts remain countable in the aggregate",
    );
    equal(
      report.operationalResults.providerCalls,
      24,
      "paid-call denominator is unchanged by redaction",
    );
    equal(
      report.operationalResults.routeProof.exactPasses,
      24,
      "route proofs are unchanged by redaction",
    );
    equal(
      report.operationalResults.completionTokens.observed,
      24,
      "usage and headroom accounting is unchanged by redaction",
    );

    const persistedReport = await assertPersistedSelfHash(
      resolve(outputDir, "report.json"),
      "reportContentHash",
      "redacted aggregate report",
    );
    equal(
      contentHash(persistedReport),
      contentHash(report),
      "returned redacted report is byte-identical to the persisted one",
    );
    const reparsed = JSON.parse(reportText) as Record<string, unknown>;
    const reorderedWithoutHash = Object.fromEntries(
      Object.entries(reparsed)
        .filter(([key]) => key !== "reportContentHash")
        .reverse(),
    );
    equal(
      contentHash(reorderedWithoutHash),
      report.reportContentHash,
      "redacted report self-hash is stable and key-order independent",
    );
  });
}

async function testOperationalRollupRetainsPartialReceiptsAndHeadroom(): Promise<void> {
  await withTempRoot(async (root) => {
    const dependencies = mockDependencies({
      mutateCapture: (capture) => {
        if (capture.match?.id !== 100) return;
        capture.aiCallLogs[0]!.completionTokens =
          EXACT_COMPLETION_TOKEN_LIMIT - 36;
        capture.aiCallLogs[1]!.completionTokens = null;
        capture.aiCallLogs[1]!.estimatedCostUsd = null;
        capture.aiCallLogs[1]!.providerMetadata = {};
        capture.providerAttempts[0]!.aiCallLogId =
          "offline-unlinked-attempt";
      },
    });
    const report = await runCandidatePolicyAbExperiment({
      outputDir: resolve(root, "partial-operational-evidence"),
      schedule: "mechanism-canary",
      dependencies,
    });
    equal(
      report.status,
      "incomplete",
      "broken attempt linkage makes the canary incomplete",
    );
    equal(
      report.operationalResults.providerCalls,
      24,
      "unlinked provider attempt is still counted as a physical call",
    );
    equal(
      report.operationalResults.linkedProviderAttemptReceipts,
      23,
      "linked receipt count exposes the missing attribution",
    );
    equal(
      report.operationalResults.unlinkedProviderAttempts,
      1,
      "unlinked attempt is explicitly counted",
    );
    equal(
      report.operationalResults.completionTokens.observed,
      23,
      "known completion-token values survive incomplete integrity",
    );
    equal(
      report.operationalResults.completionTokens.unknownCalls,
      1,
      "missing completion-token value is explicit",
    );
    equal(
      report.operationalResults.completionTokens
        .minimumObservedHeadroomTokens,
      36,
      "near-ceiling call produces exact minimum headroom",
    );
    equal(
      report.operationalResults.completionTokens
        .maximumObservedUtilizationRate,
      (EXACT_COMPLETION_TOKEN_LIMIT - 36) /
        EXACT_COMPLETION_TOKEN_LIMIT,
      "near-ceiling call produces exact maximum utilization",
    );
    equal(
      report.operationalResults.cost.unknownCostCalls,
      1,
      "missing paid-cost receipt is explicit",
    );
    equal(
      report.operationalResults.routeProof.exactPasses,
      24,
      "linkage defect does not erase independently valid route proofs",
    );
  });
}

async function testPrimaryWindowIsPinnedToTheSchedule(): Promise<void> {
  deepEqual(
    { ...PRIMARY_ROUND_WINDOW },
    { firstRound: 2, lastRound: 4, label: "2-4" },
    "the primary window is the fixed rounds 2-4",
  );
  for (const [id, scheduleValue] of Object.entries(
    CANDIDATE_POLICY_AB_SCHEDULES,
  )) {
    if (!scheduleValue.behaviorIncluded) continue;
    equal(
      scheduleValue.roundsPerMatch,
      PRIMARY_ROUND_WINDOW.lastRound,
      `behavior-bearing schedule ${id} runs exactly the primary window`,
    );
  }
  assert.throws(
    () =>
      assertPrimaryRoundWindowMatchesSchedule({
        ...CANDIDATE_POLICY_AB_SCHEDULES.pilot,
        roundsPerMatch: 6 as unknown as 4,
      }),
    /fixed primary window is rounds 2-4/,
    "a drifted roundsPerMatch fails loudly instead of silently truncating",
  );
  assertions += 1;
  assertPrimaryRoundWindowMatchesSchedule({
    ...CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
    roundsPerMatch: 2,
  });
  assertions += 1;
  const prereg = CANDIDATE_POLICY_AB_SCHEDULES.pilot;
  equal(
    prereg.roundsPerMatch * CALLS_PER_MATCH_ROUND * 2,
    48,
    "the pilot's per-block call budget still follows its round count",
  );
}

async function testReciprocalInterceptionIsAnAlias(): Promise<void> {
  await withTempRoot(async (root) => {
    const report = await runCandidatePolicyAbExperiment({
      outputDir: resolve(root, "reciprocal-alias"),
      schedule: "pilot",
      dependencies: mockDependencies(),
    });
    const primary = report.behavioralResults.primary;
    ok(primary !== null, "complete pilot produces the primary analysis");
    for (const block of primary!.blocks) {
      equal(
        block.reciprocalAliasIdentity.holdsExactly,
        true,
        `block ${block.blockOrdinal} interceptions made equal the other arm's vulnerable rounds`,
      );
      equal(
        block.reciprocalAliasIdentity.independentEstimand,
        false,
        "the identity states outright that this is not an estimand",
      );
      for (const mirror of block.mirrors) {
        equal(
          mirror.reciprocalAliasIdentity.holdsExactly,
          true,
          "the identity holds inside each mirrored match too",
        );
      }
      // The alias contrast must be the exact negation of the vulnerability
      // contrast; anything else would mean it had become its own measurement.
      const contrast = block.treatmentMinusBaseline;
      ok(
        contrast.vulnerabilityRate !== null &&
          contrast.opponentArmVulnerabilityRateAlias !== null &&
          Math.abs(
            contrast.vulnerabilityRate +
              contrast.opponentArmVulnerabilityRateAlias,
          ) < 1e-12,
        "alias contrast is the algebraic negation of the vulnerability contrast",
      );
    }
    const arms = primary!.aggregate.armBlockMeanRates;
    equal(
      arms.baseline.opponentArmVulnerabilityRateAlias,
      arms.treatment.vulnerabilityRate,
      "baseline's alias is assigned from treatment's vulnerability, not recomputed",
    );
    equal(
      arms.treatment.opponentArmVulnerabilityRateAlias,
      arms.baseline.vulnerabilityRate,
      "treatment's alias is assigned from baseline's vulnerability, not recomputed",
    );
    const prereg = JSON.parse(
      await readFile(
        resolve(root, "reciprocal-alias", "preregistration.json"),
        "utf8",
      ),
    ) as {
      estimands: { outcomes: string[]; aliasedNonEstimands: string[] };
    };
    equal(
      prereg.estimands.outcomes.length,
      3,
      "only three behavioral outcomes are preregistered as estimands",
    );
    ok(
      prereg.estimands.aliasedNonEstimands.some((entry) =>
        entry.includes("opponentArmVulnerabilityRateAlias"),
      ),
      "interceptions made is preregistered as an alias, in its own section",
    );
  });

  // In a well-formed match the alias and a recomputed interception rate agree,
  // so agreement alone proves nothing. Break the round pairing on one mirror
  // and the two definitions separate: the alias must still be the opposite
  // arm's vulnerability rate, and the identity record must admit it no longer
  // holds rather than presenting a fourth number as if it were measured.
  const schedule = CANDIDATE_POLICY_AB_SCHEDULES.pilot;
  const blockJobs = candidatePolicyAbJobs(schedule).filter(
    (job) => job.blockOrdinal === 1,
  );
  const artifacts = blockJobs.map((job, index) => {
    const capture = buildCapture(200 + index, job.config);
    if (index === 0) {
      capture.rounds = capture.rounds.filter(
        (round) => !(round.team === "blue" && round.roundNumber === 2),
      );
    }
    return {
      job,
      armByTeam: {
        amber: job.treatmentTeam === "amber" ? "treatment" : "baseline",
        blue: job.treatmentTeam === "blue" ? "treatment" : "baseline",
      },
      capture,
    };
  });
  const brokenBlock = aggregateBehavioralSeedBlocks(
    { ...schedule, seeds: [schedule.seeds[0]!] },
    artifacts as unknown as Parameters<
      typeof aggregateBehavioralSeedBlocks
    >[1],
    "2-4",
  ).blocks[0]!;
  const brokenMirror = brokenBlock.mirrors[0];
  equal(
    brokenMirror.reciprocalAliasIdentity.holdsExactly,
    false,
    "a broken round pairing is reported as a broken reciprocal identity",
  );
  const identity = brokenMirror.reciprocalAliasIdentity;
  ok(
    identity.baselineInterceptionsMade !==
      identity.treatmentVulnerableInterceptions ||
      identity.treatmentInterceptionsMade !==
        identity.baselineVulnerableInterceptions,
    "the identity record exposes the four counts so the diverging side is visible",
  );
  equal(
    brokenMirror.arms.baseline.interceptionsMade,
    0,
    "the broken mirror's baseline interception count really did diverge",
  );
  const brokenContrast = brokenMirror.treatmentMinusBaseline;
  ok(
    brokenContrast.vulnerabilityRate !== null &&
      brokenContrast.opponentArmVulnerabilityRateAlias !== null &&
      Math.abs(
        brokenContrast.vulnerabilityRate +
          brokenContrast.opponentArmVulnerabilityRateAlias,
      ) < 1e-12,
    "the alias stays the opposite arm's vulnerability even when the counts diverge",
  );
  ok(
    brokenMirror.arms.baseline.interceptionsMadeAccountingRate !==
      brokenContrast.opponentArmVulnerabilityRateAlias,
    "the alias is not the arm's own recomputed interception rate",
  );
}

async function testEnforcedCluePromptMatchesKeywordValidator(): Promise<void> {
  const config = getConfigForModel("openrouter", EXACT_MODEL);
  const shortKeywordContext = {
    ownKeywords: ["ox", "elm", "cipher", "meadow"] as [
      string,
      string,
      string,
      string,
    ],
    previousOwnClues: [],
  };
  // Each case pins one branch of the validator that the enforced prompt text
  // now describes: the >=4-normalized-character gate, containment, and the
  // per-word first-four-character stem test.
  const cases = [
    {
      clues: ["oxide", "elmer", "beacon"],
      legal: true,
      why: "keywords under 4 normalized characters are exact-equality only",
    },
    {
      clues: ["ox", "beacon", "harbor"],
      legal: false,
      why: "a short keyword is still rejected on exact equality",
    },
    {
      clues: ["ciphered", "beacon", "harbor"],
      legal: false,
      why: "a >=4-character keyword may not be contained in the clue",
    },
    {
      clues: ["ciphon", "beacon", "harbor"],
      legal: false,
      why: "a clue word may not begin with a >=4-character keyword's first four",
    },
    {
      clues: ["beacon", "harbor", "lantern"],
      legal: true,
      why: "unrelated single words pass every enforced rule",
    },
  ] as const;
  for (const fixture of cases) {
    const problems = validateClueSubmission(
      {
        kind: "clues",
        clues: [...fixture.clues] as [string, string, string],
      },
      shortKeywordContext,
      HERPETARIUM_CLUE_RULES,
    );
    equal(
      problems.length === 0,
      fixture.legal,
      `validator behavior matches the enforced prompt text: ${fixture.why}`,
    );
  }

  const prompt = buildCluePromptForConfig(config, {
    keywords: shortKeywordContext.ownKeywords,
    targetCode: [1, 2, 3] as [number, number, number],
    history: [],
  });
  for (const required of [
    "exactly 3 distinct clues",
    "at most 40 characters",
    "lowercases text and\nremoves every character that is not a letter or digit",
    "at least 4 normalized\ncharacters",
    "not contain that keyword anywhere once\nnormalized",
    "may begin with that keyword's first 4 normalized characters",
    "shorter\nthan 4 normalized characters is checked for exact equality only",
    "Never repeat a clue",
  ]) {
    ok(
      prompt.includes(required),
      `enforced prompt states the validator rule verbatim: ${required.replace(/\n/g, " ")}`,
    );
  }
  ok(
    !prompt.includes("share its first 4 normalized letters"),
    "the older ungated wording no longer overstates the keyword rule",
  );
}

async function testPrivateReceiptLineageFailureSuppressesCanary(): Promise<void> {
  await withTempRoot(async (root) => {
    const dependencies = mockDependencies({
      mutateCapture: (capture) => {
        if (capture.match?.id !== 100) return;
        const receipt = capture.providerAttempts[0]!
          .privateResponseReceipt as {
          receiptContentSha256: string;
        };
        receipt.receiptContentSha256 = "0".repeat(64);
      },
    });
    const report = await runCandidatePolicyAbExperiment({
      outputDir: resolve(root, "private-receipt-lineage-failure"),
      schedule: "mechanism-canary",
      dependencies,
    });
    equal(
      report.status,
      "incomplete",
      "one private paid-call receipt lineage defect makes the canary incomplete",
    );
    equal(
      report.validMatches,
      1,
      "the match containing the corrupted receipt is integrity-invalid",
    );
    equal(
      report.behavioralResults.status,
      "excluded_mechanism_canary",
      "mechanism canary remains excluded rather than gaining behavioral output",
    );
    equal(
      report.operationalResults.providerCalls,
      24,
      "receipt corruption never erases the observed paid-call denominator",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .lineageFailures,
      1,
      "operational rollup exposes the exact private receipt lineage failure count",
    );
    equal(
      report.operationalResults.privatePaidCallReceipts
        .receiptRows,
      23,
      "only fully verified receipt rows enter body/reasoning rollups",
    );
    ok(
      report.matchArtifacts.some((artifact) =>
        artifact.integrity.issues.some((issue) =>
          issue.includes(
            "private provider receipt content hash mismatch",
          ),
        ),
      ),
      "per-match integrity identifies the private receipt hash defect",
    );
  });
}

async function testRoundOneCannotAffectPrimaryOutcomes(): Promise<void> {
  await withTempRoot(async (root) => {
    const mutateRoundOne = (value: boolean) => (
      capture: CapturedMatchData,
    ) => {
      for (const round of capture.rounds) {
        if (round.roundNumber === 1) {
          round.ownCorrect = value;
          round.intercepted = value;
        }
      }
    };
    const allSuccess = await runCandidatePolicyAbExperiment({
      outputDir: resolve(root, "round-one-all-success"),
      schedule: "pilot",
      dependencies: mockDependencies({
        mutateCapture: mutateRoundOne(true),
      }),
    });
    const allFailure = await runCandidatePolicyAbExperiment({
      outputDir: resolve(root, "round-one-all-failure"),
      schedule: "pilot",
      dependencies: mockDependencies({
        mutateCapture: mutateRoundOne(false),
      }),
    });

    deepEqual(
      allSuccess.behavioralResults.primary,
      allFailure.behavioralResults.primary,
      "primary seed-block contrasts are invariant to every round-one outcome",
    );
    for (const arm of ["baseline", "treatment"] as const) {
      for (const block of allSuccess.behavioralResults.roundOne
        .analysis!.blocks) {
        equal(
          block.arms[arm].decodeAccuracy,
          1,
          `${arm} round-one success remains visible only in its block diagnostic`,
        );
      }
      for (const block of allFailure.behavioralResults.roundOne
        .analysis!.blocks) {
        equal(
          block.arms[arm].decodeAccuracy,
          0,
          `${arm} round-one failure remains visible only in its block diagnostic`,
        );
      }
    }
  });
}

async function testBehavioralHeadlinePreservesMirroredBlockContrasts(): Promise<void> {
  await withTempRoot(async (root) => {
    const report = await runCandidatePolicyAbExperiment({
      outputDir: resolve(root, "opposite-block-effects"),
      schedule: "pilot",
      dependencies: mockDependencies({
        mutateCapture: (capture) => {
          const matchId = capture.match!.id as number;
          const positiveTreatmentBlock = matchId <= 101;
          const treatmentTeam = capture.match!
            .focalTeam as "amber" | "blue";
          for (const round of capture.rounds) {
            if (round.roundNumber === 1) continue;
            const isTreatment = round.team === treatmentTeam;
            round.ownCorrect = positiveTreatmentBlock
              ? isTreatment
              : !isTreatment;
          }
        },
      }),
    });
    const primary = report.behavioralResults.primary!;
    deepEqual(
      primary.blocks.map(
        (block) =>
          block.treatmentMinusBaseline.decodeAccuracy,
      ),
      [1, -1],
      "opposite signed seed-block treatment contrasts remain visible",
    );
    equal(
      primary.aggregate.meanWithinBlockTreatmentMinusBaseline
        .decodeAccuracy,
      0,
      "headline is the equal-weight mean of two block contrasts",
    );
    equal(
      primary.aggregate.seedBlocks,
      2,
      "headline n is paired seed blocks, not 24 team-round observations",
    );
    for (const block of primary.blocks) {
      equal(
        block.mirrors[0].treatmentMinusBaseline
          .decodeAccuracy,
        block.mirrors[1].treatmentMinusBaseline
          .decodeAccuracy,
        "each block exposes both same-seed mirror contrasts before aggregation",
      );
    }
  });
}

async function testCaptureIntegrityCatchesTreatmentDrift(): Promise<void> {
  const job = candidatePolicyAbJobs(
    CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
  )[0]!;
  const config = job.config;
  const capture = buildCapture(77, config);
  const result = {
    matchId: 77,
    gameId: "game-77",
    winner: "amber" as const,
    totalRounds: 2,
    teams: {},
    players: [],
  };
  deepEqual(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      result,
      capture,
    ),
    [],
    "valid strict capture passes",
  );
  const treatmentClue = capture.aiCallLogs.find(
    (call) =>
      call.team === job.treatmentTeam &&
      call.actionType === "generate_clues" &&
      call.roundNumber === 2,
  )!;
  treatmentClue.prompt = String(treatmentClue.prompt).replace(
    "YOUR PUBLIC COLUMN LEDGER",
    "",
  );
  ok(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      result,
      capture,
    ).some((issue) => issue.includes("column-ledger timing")),
    "missing treatment ledger fails capture integrity",
  );

  const mismatchedAttemptCapture = buildCapture(78, config);
  mismatchedAttemptCapture.providerAttempts[0]!.roundNumber = 99;
  ok(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      { ...result, matchId: 78, gameId: "game-78" },
      mismatchedAttemptCapture,
    ).some((issue) => issue.includes("round/action/disposition")),
    "provider-attempt round identifier must match its linked AI call",
  );

  const duplicateTeamActionCapture = buildCapture(79, config);
  const blueRoundOneGuess = duplicateTeamActionCapture.aiCallLogs.find(
    (call) =>
      call.roundNumber === 1 &&
      call.actionType === "generate_guess" &&
      call.team === "blue",
  )!;
  blueRoundOneGuess.team = "amber";
  ok(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      { ...result, matchId: 79, gameId: "game-79" },
      duplicateTeamActionCapture,
    ).some(
      (issue) =>
        issue.includes("team amber generate_guess count was 2") ||
        issue.includes("team blue generate_guess count was 0"),
    ),
    "capture requires exactly one action of each kind per team and round",
  );

  const wrongCarrierCapture = buildCapture(80, config);
  const baselineGuess = wrongCarrierCapture.aiCallLogs.find(
    (call) => call.actionType === "generate_guess",
  )!;
  baselineGuess.prompt =
    "unregistered but treatment-marker-free decoder carrier";
  ok(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      { ...result, matchId: 80, gameId: "game-80" },
      wrongCarrierCapture,
    ).some((issue) =>
      issue.includes("exact compiled baseline carrier"),
    ),
    "treatment-marker absence cannot substitute for exact non-clue carrier identity",
  );

  const contaminatedCarrierCapture = buildCapture(81, config);
  const contaminatedGuess = contaminatedCarrierCapture.aiCallLogs.find(
    (call) => call.actionType === "generate_guess",
  )!;
  const registeredGuessDirectives =
    compiled.prompts.own_guesser.taskDirectives!;
  contaminatedGuess.prompt = String(contaminatedGuess.prompt).replace(
    registeredGuessDirectives,
    `${registeredGuessDirectives}\nUNREGISTERED STRATEGY DIRECTIVE`,
  );
  ok(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      { ...result, matchId: 81, gameId: "game-81" },
      contaminatedCarrierCapture,
    ).some((issue) =>
      issue.includes("exact compiled baseline carrier"),
    ),
    "an exact registered carrier plus an unauthorized directive must be rejected",
  );

  const contaminatedRoundOneCapture = buildCapture(82, config);
  const roundOneClue = contaminatedRoundOneCapture.aiCallLogs.find(
    (call) =>
      call.actionType === "generate_clues" &&
      call.roundNumber === 1,
  )!;
  roundOneClue.prompt = `${String(roundOneClue.prompt)}\nUNREGISTERED ROUND-ONE SUFFIX`;
  ok(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      { ...result, matchId: 82, gameId: "game-82" },
      contaminatedRoundOneCapture,
    ).some((issue) =>
      issue.includes(
        "round-one prompt bytes/hash differ from preregistration",
      ),
    ),
    "round-one clue prompt must match exact preregistered bytes and digest",
  );

  const contradictoryRouteCapture = buildCapture(83, config);
  const terminal = contradictoryRouteCapture.providerAttempts[0]!
    .terminalMetadata as {
    openrouterMetadata: { attempts: unknown[] };
  };
  terminal.openrouterMetadata.attempts = [
    { provider: "WrongProvider", status: 200 },
  ];
  ok(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      { ...result, matchId: 83, gameId: "game-83" },
      contradictoryRouteCapture,
    ).some((issue) => issue.includes("successful DeepInfra detailed attempt")),
    "capture rejects contradictory detailed router-attempt evidence",
  );

  const decimalStringRouteCapture = buildCapture(84, config);
  const stringTerminal = decimalStringRouteCapture.providerAttempts[0]!
    .terminalMetadata as {
    openrouterMetadata: {
      attempts: Array<{ provider: string; status: number | string }>;
    };
  };
  stringTerminal.openrouterMetadata.attempts[0]!.status = "200";
  deepEqual(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      { ...result, matchId: 84, gameId: "game-84" },
      decimalStringRouteCapture,
    ),
    [],
    "lossless decimal-string HTTP 200 route status is accepted",
  );

  const ambiguousStringRouteCapture = buildCapture(85, config);
  const ambiguousTerminal =
    ambiguousStringRouteCapture.providerAttempts[0]!
      .terminalMetadata as {
      openrouterMetadata: {
        attempts: Array<{ provider: string; status: number | string }>;
      };
    };
  ambiguousTerminal.openrouterMetadata.attempts[0]!.status =
    "success";
  ok(
    validateCapturedMatch(
      job,
      CANDIDATE_POLICY_AB_SCHEDULES["mechanism-canary"],
      { ...result, matchId: 85, gameId: "game-85" },
      ambiguousStringRouteCapture,
    ).some((issue) =>
      issue.includes("successful DeepInfra detailed attempt"),
    ),
    "ambiguous semantic route status remains fail-closed",
  );
}

async function spawnImportCheck(): Promise<void> {
  const code = [
    `import { Server } from "node:http";`,
    `Server.prototype.listen = function () { throw new Error("SERVER_LISTEN_CALLED"); };`,
    `(async () => {`,
    `  await import("./server/headlessRunner.ts");`,
    `  const { closeDatabasePool } = await import("./server/db.ts");`,
    `  await closeDatabasePool();`,
    `  console.log("IMPORT_SAFE");`,
    `})().catch((error) => { console.error(error); process.exitCode = 1; });`,
  ].join("\n");
  const result = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolvePromise, rejectPromise) => {
    const child = spawn(TSX, ["-e", code], {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        DATABASE_URL:
          "postgresql:///herp_decrypto_ab_import_check?host=/tmp&port=5432",
        OPENROUTER_API_KEY: "",
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", rejectPromise);
    child.once("close", (codeValue) =>
      resolvePromise({ code: codeValue, stdout, stderr }),
    );
  });
  equal(result.code, 0, "headless import process exits cleanly");
  ok(result.stdout.includes("IMPORT_SAFE"), "headless import completes");
  equal(
    result.stderr.includes("SERVER_LISTEN_CALLED"),
    false,
    "headless import never starts Express",
  );
}

async function testPersistValidateApplyOrder(): Promise<void> {
  const source = await readFile(
    resolve(REPOSITORY_ROOT, "server/headlessRunner.ts"),
    "utf8",
  );
  const start = source.indexOf("async function processClues(");
  const end = source.indexOf("async function processGuesses(", start);
  const body = source.slice(start, end);
  const generateIndex = body.indexOf("generateClues(");
  const persistIndex = body.indexOf("await logAiCall(");
  const validateIndex = body.indexOf("validateClueSubmission(");
  const submitIndex = body.indexOf("submitClues(");
  ok(generateIndex >= 0, "processClues generates one response");
  equal(
    body.match(/generateClues\(/g)?.length ?? 0,
    1,
    "processClues has no regeneration path",
  );
  ok(
    generateIndex < persistIndex &&
      persistIndex < validateIndex &&
      validateIndex < submitIndex,
    "response is persisted, then shared-validated, then applied",
  );
  ok(
    body.includes("clueDisposition.rejectMatch") &&
      body.includes("action rejected without regeneration"),
    "illegal clue rejection is explicit and scoped to strict disposition",
  );
}

async function testStrictAndNonStrictValidationCompatibility(): Promise<void> {
  const invalidClueMetadata = {
    validator: "shared.validateClueSubmission@substrate",
    passed: false,
    problems: ["clues within a round must be distinct"],
  };
  const strict = resolveActionValidationDisposition(
    invalidClueMetadata,
    true,
  );
  equal(strict.actionApplied, false, "strict invalid clue is not applied");
  equal(strict.rejectMatch, true, "strict invalid clue rejects the match");
  equal(strict.taintsMatch, true, "strict invalid clue taints the match");
  equal(
    strict.validationMetadata.disposition,
    "rejected_strict",
    "strict invalid clue has explicit rejection disposition",
  );

  for (const mode of [false, undefined] as const) {
    const exploratory = resolveActionValidationDisposition(
      invalidClueMetadata,
      mode,
    );
    equal(
      exploratory.actionApplied,
      true,
      "non-strict invalid clue is applied unchanged for continuity",
    );
    equal(
      exploratory.rejectMatch,
      false,
      "non-strict invalid clue does not abort the run",
    );
    equal(
      exploratory.validationMetadata.passed,
      false,
      "non-strict application never rewrites failed validation as passing",
    );
    equal(
      exploratory.validationMetadata.disposition,
      "applied_non_strict_continuity",
      "non-strict invalid clue has explicit tainted continuity disposition",
    );
  }

  const accepted = resolveActionValidationDisposition(
    {
      validator: "shared.validateCodeGuess@substrate",
      passed: true,
      problems: [],
    },
    true,
  );
  equal(accepted.actionApplied, true, "valid strict action is applied");
  equal(accepted.rejectMatch, false, "valid strict action does not reject");
  equal(
    accepted.validationMetadata.disposition,
    "accepted",
    "valid action has accepted disposition",
  );

  for (const actionType of [
    "generate_guess",
    "generate_interception",
  ] as const) {
    const problems = validateCodeGuess([1, 1, 2]);
    ok(problems.length > 0, `${actionType} duplicate tuple is invalid`);
    const nonStrict = resolveActionValidationDisposition(
      {
        validator: "shared.validateCodeGuess@substrate",
        actionType,
        passed: false,
        problems,
      },
      false,
    );
    equal(
      nonStrict.actionApplied,
      true,
      `${actionType} invalid exploratory tuple preserves continuity`,
    );
    const strictCode = resolveActionValidationDisposition(
      nonStrict.validationMetadata,
      true,
    );
    equal(
      strictCode.actionApplied,
      false,
      `${actionType} invalid strict tuple is rejected`,
    );
  }

  const clueContext = {
    ownKeywords: [
      "planet",
      "forest",
      "castle",
      "silver",
    ] as [string, string, string, string],
    previousOwnClues: ["echo"],
  };
  const legalityCases = [
    {
      clues: ["x".repeat(41), "river", "stone"],
      expected: "exceeds 40 characters",
    },
    {
      clues: ["echo", "river", "stone"],
      expected: "repeats an earlier clue",
    },
    {
      clues: ["river", "river", "stone"],
      expected: "within a round must be distinct",
    },
    {
      clues: ["planar", "river", "stone"],
      expected: "shares the 4-letter stem",
    },
    {
      clues: ["forestfire", "river", "stone"],
      expected: "contains keyword",
    },
  ] as const;
  for (const fixture of legalityCases) {
    const problems = validateClueSubmission(
      {
        kind: "clues",
        clues: [...fixture.clues] as [string, string, string],
      },
      clueContext,
      HERPETARIUM_CLUE_RULES,
    );
    ok(
      problems.some((problem) =>
        problem.includes(fixture.expected),
      ),
      `shared validator reports ${fixture.expected}`,
    );
  }

  const config = getConfigForModel("openrouter", EXACT_MODEL);
  const promptParams = {
    keywords: clueContext.ownKeywords,
    targetCode: [1, 2, 3] as [number, number, number],
    history: [
      {
        clues: ["echo", "meadow", "tower"],
        targetCode: [1, 2, 3] as [number, number, number],
      },
    ],
  };
  const baselinePrompt = buildCluePromptForConfig(config, promptParams);
  const treatmentPrompt = buildCluePromptForConfig(config, {
    ...promptParams,
    candidatePolicy: CIPHER_ENCRYPT_CANDIDATE_POLICY_ARTIFACT,
  });
  for (const prompt of [baselinePrompt, treatmentPrompt]) {
    for (const required of [
      "exactly 3 distinct clues",
      "at most 40 characters",
      "first 4 normalized characters",
      "Never repeat a clue",
      "hidden across separators",
    ]) {
      ok(
        prompt.includes(required),
        `both arms state enforced clue rule: ${required}`,
      );
    }
  }

  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    const randomResult = await generateClues(
      config,
      {
        keywords: clueContext.ownKeywords,
        targetCode: [1, 2, 3],
        history: [],
        ablations: ["random_clues"],
      },
      { strictExecution: false },
    );
    deepEqual(
      randomResult.result,
      ["alpha", "alpha", "alpha"],
      "deterministic random_clues fixture exercises duplicate sampling",
    );
    const randomProblems = validateClueSubmission(
      {
        kind: "clues",
        clues: randomResult.result as [string, string, string],
      },
      clueContext,
      HERPETARIUM_CLUE_RULES,
    );
    const randomNonStrict = resolveActionValidationDisposition(
      {
        validator: "shared.validateClueSubmission@substrate",
        passed: randomProblems.length === 0,
        problems: randomProblems,
      },
      false,
    );
    equal(
      randomNonStrict.actionApplied,
      true,
      "invalid random_clues remains playable in non-strict mode",
    );
    equal(
      randomNonStrict.taintsMatch,
      true,
      "invalid random_clues truthfully taints the exploratory match",
    );
    equal(
      resolveActionValidationDisposition(
        randomNonStrict.validationMetadata,
        true,
      ).actionApplied,
      false,
      "the same invalid random_clues triple is rejected in strict mode",
    );
  } finally {
    Math.random = originalRandom;
  }

  const fallbackProblems = validateClueSubmission(
    {
      kind: "clues",
      clues: ["hint", "clue", "guess"],
    },
    {
      ...clueContext,
      previousOwnClues: ["hint"],
    },
    HERPETARIUM_CLUE_RULES,
  );
  ok(fallbackProblems.length > 0, "repeated generic fallback is invalid");
  equal(
    resolveActionValidationDisposition(
      {
        validator: "shared.validateClueSubmission@substrate",
        passed: false,
        problems: fallbackProblems,
      },
      false,
    ).actionApplied,
    true,
    "invalid generic fallback preserves non-strict run continuity",
  );

  const validationEvent = {
    type: "validation_failure",
    roundNumber: 1,
    actionType: "generate_clues",
    actionApplied: true,
    strictExecution: false,
    validationProblems: ["offline invalid clue"],
  } as const;
  ok(
    hasActionValidationFailure([validationEvent]),
    "validation-failure event triggers the quality-summary taint gate",
  );
}

async function testRejectedTimeoutWrapperPreservesPrompt(): Promise<void> {
  const result = rejectedHeadlessCallResult({
    fallback: [1, 2, 3] as [number, number, number],
    model: EXACT_MODEL,
    prompt: "EXACT_PROMPT_BEFORE_REJECTION",
    error: new Error("offline rejection"),
    timedOut: false,
    timeoutMs: 100,
  });
  equal(
    result.prompt,
    "EXACT_PROMPT_BEFORE_REJECTION",
    "timeout/rejection wrapper preserves the prebuilt exact prompt",
  );
  equal(
    result.parseQuality,
    "error",
    "rejected wrapper result remains invalid",
  );
}

function routeInvalidResponse(): Response {
  return new Response(
    JSON.stringify({
      id: "offline-generation",
      model: EXACT_MODEL,
      provider: "WrongProvider",
      choices: [
        {
          message: { content: "VISIBLE_PAID_RESPONSE" },
          finish_reason: "stop",
        },
      ],
      openrouter_metadata: {
        attempt: 1,
        attempts: [{ provider: "WrongProvider", status: 200 }],
        endpoints: {
          available: [{ provider: "WrongProvider", selected: true }],
        },
      },
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        cost: 0.000004,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function testPaidReceiptRetentionAllGenerationPaths(): Promise<void> {
  process.env.OPENROUTER_API_KEY = "offline-test-key";
  resetProviderThrottleState();
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return routeInvalidResponse();
  }) as typeof fetch;
  const config = getConfigForModel("openrouter", EXACT_MODEL);
  const commonOptions = { strictExecution: true };
  const results = await Promise.all([
    generateClues(
      config,
      {
        keywords: ["alpha", "beta", "gamma", "delta"],
        targetCode: [1, 2, 3],
        history: [],
      },
      commonOptions,
    ),
    generateGuess(
      config,
      {
        keywords: ["alpha", "beta", "gamma", "delta"],
        clues: ["cipher", "veil", "signal"],
        history: [],
      },
      commonOptions,
    ),
    generateInterception(
      config,
      { clues: ["cipher", "veil", "signal"], history: [] },
      commonOptions,
    ),
    generateDeliberationMessage(
      config,
      { systemPrompt: "offline", userPrompt: "offline" },
      commonOptions,
    ),
    generateReflection(
      config,
      {
        teamKeywords: ["alpha", "beta", "gamma", "delta"],
        teamHistory: [],
        opponentHistory: [],
        winner: null,
        myTeam: "amber",
        whiteTokens: 0,
        blackTokens: 0,
        opponentWhiteTokens: 0,
        opponentBlackTokens: 0,
        currentNotes: "",
        tokenBudget: 100,
      },
      commonOptions,
    ),
  ]);
  equal(fetchCount, 5, "each generation path makes exactly one client request");
  for (const result of results) {
    equal(
      result.rawResponse,
      "VISIBLE_PAID_RESPONSE",
      "route-invalid paid response text survives generation catch",
    );
    equal(result.promptTokens, 11, "route-invalid prompt usage survives");
    equal(result.completionTokens, 7, "route-invalid completion usage survives");
    equal(result.totalTokens, 18, "route-invalid total usage survives");
    equal(
      result.providerMetadata?.upstreamProvider,
      "WrongProvider",
      "route-invalid served-provider metadata survives",
    );
    equal(result.parseQuality, "error", "route-invalid response stays invalid");
  }
}

async function testContradictoryDetailedAttemptRetainsReceipt(): Promise<void> {
  process.env.OPENROUTER_API_KEY = "offline-test-key";
  resetProviderThrottleState();
  const paidResponse = "CONTRADICTORY_ROUTE_PAID_RESPONSE";
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        id: "offline-contradictory-attempt",
        model: EXACT_MODEL,
        provider: "DeepInfra",
        choices: [
          {
            message: { content: paidResponse },
            finish_reason: "stop",
          },
        ],
        openrouter_metadata: {
          attempt: 1,
          attempts: [{ provider: "WrongProvider", status: 200 }],
          endpoints: {
            available: [{ provider: "DeepInfra", selected: true }],
          },
        },
        usage: {
          prompt_tokens: 13,
          completion_tokens: 8,
          total_tokens: 21,
          cost: 0.000005,
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  const result = await generateClues(
    getConfigForModel("openrouter", EXACT_MODEL),
    {
      keywords: ["alpha", "beta", "gamma", "delta"],
      targetCode: [1, 2, 3],
      history: [],
    },
    { strictExecution: true },
  );

  equal(fetchCount, 1, "contradictory route proof is never retried");
  equal(
    result.parseQuality,
    "error",
    "contradictory detailed attempt invalidates the draw",
  );
  ok(
    result.error?.includes(
      "zero or one successful DeepInfra detailed attempt",
    ),
    "contradictory detailed attempt fails the exact route proof",
  );
  equal(
    result.rawResponse,
    paidResponse,
    "contradictory route rejection retains the paid assistant response",
  );
  equal(
    result.totalTokens,
    21,
    "contradictory route rejection retains paid usage",
  );
  deepEqual(
    (
      result.providerMetadata?.openrouterMetadata as {
        attempts?: unknown[];
      }
    ).attempts,
    [{ provider: "WrongProvider", status: 200 }],
    "contradictory detailed-attempt evidence remains in the receipt",
  );
}

async function testHttp200InvalidJsonReceipt(): Promise<void> {
  process.env.OPENROUTER_API_KEY = "offline-test-key";
  resetProviderThrottleState();
  const body = "EXACT_HTTP_200_INVALID_JSON_BODY";
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-request-id": "offline-invalid-json",
      },
    });
  }) as typeof fetch;
  const result = await generateClues(
    getConfigForModel("openrouter", EXACT_MODEL),
    {
      keywords: ["alpha", "beta", "gamma", "delta"],
      targetCode: [1, 2, 3],
      history: [],
    },
    { strictExecution: true },
  );
  equal(fetchCount, 1, "invalid JSON path makes one client request");
  equal(
    result.rawResponse,
    body,
    "exact HTTP 200 invalid-JSON body survives as response receipt",
  );
  equal(
    result.providerMetadata?.responseBodyFormat,
    "invalid_json",
    "invalid-JSON receipt carries explicit format metadata",
  );
  equal(result.parseQuality, "error", "invalid JSON cannot become a valid draw");
}

async function main(): Promise<void> {
  try {
    await testFixedEnumerationsAndInputs();
    await testDisposableDatabaseGuard();
    await testOutputDirectoryGuards();
    await testCompleteMechanismCanary();
    await testSequentialBlocksAndFailureStop();
    await testPostRunLineageFailureStillPersistsReport();
    await testArtifactWriteFailurePreservesSiblingAndReport();
    await testUnrecoverableUnpersistedMatchStaysExplicit();
    await testAggregateReportOmitsExactProviderBodies();
    await testOperationalRollupRetainsPartialReceiptsAndHeadroom();
    await testPrimaryWindowIsPinnedToTheSchedule();
    await testReciprocalInterceptionIsAnAlias();
    await testEnforcedCluePromptMatchesKeywordValidator();
    await testPrivateReceiptLineageFailureSuppressesCanary();
    await testRoundOneCannotAffectPrimaryOutcomes();
    await testBehavioralHeadlinePreservesMirroredBlockContrasts();
    await testCaptureIntegrityCatchesTreatmentDrift();
    await spawnImportCheck();
    await testPersistValidateApplyOrder();
    await testStrictAndNonStrictValidationCompatibility();
    await testRejectedTimeoutWrapperPreservesPrompt();
    await testPaidReceiptRetentionAllGenerationPaths();
    await testContradictoryDetailedAttemptRetainsReceipt();
    await testHttp200InvalidJsonReceipt();
    console.log(
      `candidate-policy A/B harness tests passed (${assertions} assertions)`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    resetProviderThrottleState();
    if (originalOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
