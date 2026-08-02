/**
 * Immutable identity for the complete implementation behind one cluegiver
 * decision. This is a sibling contract rather than an expansion of
 * BotBuildManifest@0.1, whose decoder scope and pinned hash remain frozen.
 *
 * A cluegiver build is an implementation identity only. It does not claim an
 * evaluation result, seating permission, trusted issuer, or runtime adoption.
 */
import {
  verifyBotBuildManifest,
  type BotBuildManifest,
  type RequestedModelRoute,
  validateRequestedModelRoute,
} from "./botBuild";
import { contentHash } from "./hash";
import {
  assertNoSecretBearingFields,
  cloneAndDeepFreeze,
  exactKeys,
  validateExactContentIdentityRef,
  type ContentIdentityRef,
} from "./identity";
import {
  validateTableCompetitiveIdentities,
  type CompetitiveIdentitySet,
} from "./protocol";
import {
  validateObservationV2,
  type DecryptoObservationV2,
  type DecryptoObservationV2Source,
} from "./observation";

export const CLUEGIVER_BOT_BUILD_MANIFEST_VERSION = "cluegiver-0.1";

export interface CluegiverBotBuildManifestSource {
  readonly manifestVersion: typeof CLUEGIVER_BOT_BUILD_MANIFEST_VERSION;
  readonly name: string;
  readonly version: string;
  readonly game: "decrypto";
  readonly scope: "cluegiver";
  readonly strategyArtifact: ContentIdentityRef;
  readonly compilation: {
    readonly strategyCompiler: ContentIdentityRef;
    readonly contextCompiler: ContentIdentityRef;
    readonly candidatePolicy: ContentIdentityRef;
    readonly actionContract: ContentIdentityRef;
    readonly promptAssembler: ContentIdentityRef;
    readonly compiledCarrier: ContentIdentityRef;
  };
  readonly execution: {
    readonly responseParser: ContentIdentityRef;
    readonly actionValidator: ContentIdentityRef;
    readonly providerAdapter: ContentIdentityRef;
    readonly orchestrationPolicy: ContentIdentityRef;
    readonly retryPolicy: ContentIdentityRef;
    readonly fallbackPolicy: ContentIdentityRef;
  };
  readonly requestedRoute: RequestedModelRoute;
  readonly gameplay: CompetitiveIdentitySet;
  readonly provenance: {
    readonly origin: string;
    readonly mintedAt: string;
  };
}

export interface CluegiverBotBuildManifest extends CluegiverBotBuildManifestSource {
  readonly id: string;
  readonly contentHash: string;
}

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function identityProblems(value: unknown, label: string): string[] {
  return validateExactContentIdentityRef(
    value as ContentIdentityRef | undefined,
    label,
  );
}

export function cluegiverBotBuildContentHash(
  source: CluegiverBotBuildManifestSource,
): string {
  return contentHash(source);
}

export function validateCluegiverBotBuildManifestSource(
  source: CluegiverBotBuildManifestSource,
): string[] {
  const problems: string[] = [];
  try {
    problems.push(
      ...exactKeys(
        source,
        [
          "manifestVersion",
          "name",
          "version",
          "game",
          "scope",
          "strategyArtifact",
          "compilation",
          "execution",
          "requestedRoute",
          "gameplay",
          "provenance",
        ],
        "cluegiver bot build",
      ),
    );
    if (source?.manifestVersion !== CLUEGIVER_BOT_BUILD_MANIFEST_VERSION) {
      problems.push(
        `manifestVersion must be "${CLUEGIVER_BOT_BUILD_MANIFEST_VERSION}"`,
      );
    }
    if (!NAME_PATTERN.test(source?.name ?? "")) {
      problems.push("name must be kebab-case");
    }
    if (!VERSION_PATTERN.test(source?.version ?? "")) {
      problems.push("version must be semver (x.y.z)");
    }
    if (source?.game !== "decrypto") problems.push('game must be "decrypto"');
    if (source?.scope !== "cluegiver") {
      problems.push('scope must be "cluegiver"');
    }

    problems.push(
      ...identityProblems(source?.strategyArtifact, "strategyArtifact"),
      ...exactKeys(
        source?.compilation,
        [
          "strategyCompiler",
          "contextCompiler",
          "candidatePolicy",
          "actionContract",
          "promptAssembler",
          "compiledCarrier",
        ],
        "compilation",
      ),
      ...identityProblems(
        source?.compilation?.strategyCompiler,
        "compilation.strategyCompiler",
      ),
      ...identityProblems(
        source?.compilation?.contextCompiler,
        "compilation.contextCompiler",
      ),
      ...identityProblems(
        source?.compilation?.candidatePolicy,
        "compilation.candidatePolicy",
      ),
      ...identityProblems(
        source?.compilation?.actionContract,
        "compilation.actionContract",
      ),
      ...identityProblems(
        source?.compilation?.promptAssembler,
        "compilation.promptAssembler",
      ),
      ...identityProblems(
        source?.compilation?.compiledCarrier,
        "compilation.compiledCarrier",
      ),
      ...exactKeys(
        source?.execution,
        [
          "responseParser",
          "actionValidator",
          "providerAdapter",
          "orchestrationPolicy",
          "retryPolicy",
          "fallbackPolicy",
        ],
        "execution",
      ),
    );
    for (const key of [
      "responseParser",
      "actionValidator",
      "providerAdapter",
      "orchestrationPolicy",
      "retryPolicy",
      "fallbackPolicy",
    ] as const) {
      problems.push(
        ...identityProblems(source?.execution?.[key], `execution.${key}`),
      );
    }

    const mintedAt = source?.provenance?.mintedAt ?? "";
    problems.push(
      ...exactKeys(source?.provenance, ["origin", "mintedAt"], "provenance"),
    );
    if (
      typeof source?.provenance?.origin !== "string" ||
      source.provenance.origin.trim() === ""
    ) {
      problems.push("provenance.origin is required");
    }
    if (!ISO_PATTERN.test(mintedAt) || !Number.isFinite(Date.parse(mintedAt))) {
      problems.push("provenance.mintedAt must be an ISO UTC timestamp");
    }
    problems.push(
      ...validateRequestedModelRoute(
        source?.requestedRoute,
        mintedAt.slice(0, 10),
      ),
      ...validateTableCompetitiveIdentities(source?.gameplay, "gameplay"),
    );
    assertNoSecretBearingFields(source, "cluegiver bot build");
  } catch (error) {
    problems.push(
      `cluegiver bot build validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

export function mintCluegiverBotBuildManifest(
  source: CluegiverBotBuildManifestSource,
): CluegiverBotBuildManifest {
  const problems = validateCluegiverBotBuildManifestSource(source);
  if (problems.length > 0) {
    throw new Error(
      `invalid CluegiverBotBuildManifest: ${problems.join("; ")}`,
    );
  }
  const cloned = structuredClone(source);
  return cloneAndDeepFreeze({
    ...cloned,
    id: `cluegiver:${cloned.name}@${cloned.version}`,
    contentHash: cluegiverBotBuildContentHash(cloned),
  });
}

export function verifyCluegiverBotBuildManifest(
  manifest: CluegiverBotBuildManifest,
): boolean {
  try {
    const { id, contentHash: recorded, ...source } = manifest;
    return (
      exactKeys(
        manifest,
        [
          "manifestVersion",
          "name",
          "version",
          "game",
          "scope",
          "strategyArtifact",
          "compilation",
          "execution",
          "requestedRoute",
          "gameplay",
          "provenance",
          "id",
          "contentHash",
        ],
        "cluegiver bot build manifest",
      ).length === 0 &&
      id === `cluegiver:${source.name}@${source.version}` &&
      validateCluegiverBotBuildManifestSource(source).length === 0 &&
      recorded === cluegiverBotBuildContentHash(source)
    );
  } catch {
    return false;
  }
}

export function findCluegiverBotBuildRegistryConflicts(
  manifests: readonly CluegiverBotBuildManifest[],
): string[] {
  const hashesById = new Map<string, Set<string>>();
  for (const manifest of manifests) {
    const hashes = hashesById.get(manifest.id) ?? new Set<string>();
    hashes.add(manifest.contentHash);
    hashesById.set(manifest.id, hashes);
  }
  return [...hashesById.entries()]
    .filter(([, hashes]) => hashes.size > 1)
    .map(([id]) => id)
    .sort();
}

export type BotDecisionRole = "cluegiver" | "decoder" | "interceptor";
export type BotBuildManifestForDecision =
  | BotBuildManifest
  | CluegiverBotBuildManifest;

/**
 * Resolve the otherwise opaque observation reference against the exact
 * immutable manifest before provider dispatch or research ingestion.
 *
 * Observation hashes intentionally carry only an id/hash reference. This
 * registry-aware gate is therefore load-bearing: a syntactically valid
 * reference cannot establish the build's scope by itself.
 */
export function validateBotBuildReferenceForDecisionRole(input: {
  readonly role?: BotDecisionRole;
  readonly reference?: ContentIdentityRef;
  readonly manifest?: BotBuildManifestForDecision;
}): string[] {
  const problems: string[] = [];
  try {
    const role = input?.role;
    const reference = input?.reference;
    const manifest = input?.manifest;
    if (role !== "cluegiver" && role !== "decoder" && role !== "interceptor") {
      problems.push("decision role must be cluegiver|decoder|interceptor");
    }
    problems.push(
      ...validateExactContentIdentityRef(reference, "observation BotBuild"),
    );
    if (!manifest || typeof manifest !== "object") {
      problems.push("BotBuild manifest is unresolved");
      return problems;
    }
    const expectedScope = role === "cluegiver" ? "cluegiver" : "decoder";
    if (manifest.scope !== expectedScope) {
      problems.push(
        `${role} decision requires a ${expectedScope}-scope BotBuild`,
      );
    }
    const manifestVerifies =
      manifest.scope === "cluegiver"
        ? verifyCluegiverBotBuildManifest(manifest)
        : verifyBotBuildManifest(manifest);
    if (!manifestVerifies) {
      problems.push("BotBuild manifest must verify");
    }
    if (
      reference?.id !== manifest.id ||
      reference?.contentHash !== manifest.contentHash
    ) {
      problems.push("observation BotBuild reference must match the manifest");
    }
  } catch (error) {
    problems.push(
      `BotBuild decision-role binding failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

/**
 * Required registry-aware composition gate for frozen decoder/interceptor
 * observations. This adds scope resolution without changing Observation v0.2
 * or any of its existing content hashes.
 */
export function validateGuessDecisionContext(
  observation: DecryptoObservationV2Source | DecryptoObservationV2,
  manifest: BotBuildManifestForDecision,
): string[] {
  const problems = validateObservationV2(observation);
  try {
    problems.push(
      ...validateBotBuildReferenceForDecisionRole({
        role: observation?.role,
        reference: observation?.identities?.botBuild,
        manifest,
      }),
    );
  } catch (error) {
    problems.push(
      `guess decision context failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}
