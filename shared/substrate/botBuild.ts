/**
 * Immutable identity for the bot implementation behind one decoder decision.
 *
 * This first shared-runtime slice deliberately omits evaluation licenses,
 * seating policy, clue-generation policy, social behavior, and human actors.
 * Those need their own evidence and should not be implied by a structural
 * manifest that neither runtime enforces yet.
 */
import { contentHash } from "./hash";
import {
  assertNoSecretBearingFields,
  cloneAndDeepFreeze,
  exactKeys,
  validateExactContentIdentityRef,
  type ContentIdentityRef,
} from "./identity";
import { validateModelRef } from "./modelRef";
import {
  validateTableCompetitiveIdentities,
  type CompetitiveIdentitySet,
} from "./protocol";

export const BOT_BUILD_MANIFEST_VERSION = "0.1";

export type JsonScalar = string | number | boolean | null;
export type JsonValue =
  | JsonScalar
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface WireConfigSource {
  readonly id: string;
  /** Request-affecting values only. Credentials are forbidden recursively. */
  readonly parameters: { readonly [key: string]: JsonValue };
}

export interface WireConfig extends WireConfigSource {
  readonly contentHash: string;
}

export interface RequestedModelRoute {
  readonly provider: string;
  readonly model: string;
  readonly upstream: string | null;
  readonly aliasEpoch: string | null;
  readonly reasoning: {
    readonly requestedEffort: string | null;
    readonly wireEffort: string | null;
  };
  readonly wireConfig: WireConfig;
}

export interface BotBuildManifestSource {
  readonly manifestVersion: typeof BOT_BUILD_MANIFEST_VERSION;
  readonly name: string;
  readonly version: string;
  readonly game: "decrypto";
  readonly scope: "decoder";
  readonly strategyArtifact: ContentIdentityRef;
  readonly compilation: {
    readonly strategyCompiler: ContentIdentityRef;
    readonly contextCompiler: ContentIdentityRef;
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

export interface BotBuildManifest extends BotBuildManifestSource {
  readonly id: string;
  readonly contentHash: string;
}

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function jsonValueProblems(value: unknown, path: string): string[] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return [];
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? [] : [`${path} must be a finite number`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      jsonValueProblems(entry, `${path}[${index}]`),
    );
  }
  if (typeof value !== "object") return [`${path} must be JSON data`];
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return [`${path} must be a plain JSON object`];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, entry]) => jsonValueProblems(entry, `${path}.${key}`),
  );
}

export function validateWireConfigSource(source: WireConfigSource): string[] {
  const problems: string[] = [];
  try {
    problems.push(...exactKeys(source, ["id", "parameters"], "wire config"));
    if (typeof source?.id !== "string" || source.id.trim() === "") {
      problems.push("wire config id is required");
    }
    if (
      source?.parameters === null ||
      typeof source?.parameters !== "object" ||
      Array.isArray(source?.parameters)
    ) {
      problems.push("wire config parameters must be a JSON object");
    } else {
      problems.push(...jsonValueProblems(source.parameters, "parameters"));
    }
    assertNoSecretBearingFields(source, "wire config");
  } catch (error) {
    problems.push(
      `wire config validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

export function mintWireConfig(source: WireConfigSource): WireConfig {
  const problems = validateWireConfigSource(source);
  if (problems.length > 0) {
    throw new Error(`invalid wire config: ${problems.join("; ")}`);
  }
  const cloned = structuredClone(source);
  return cloneAndDeepFreeze({ ...cloned, contentHash: contentHash(cloned) });
}

export function verifyWireConfig(config: WireConfig): boolean {
  try {
    const { contentHash: recorded, ...source } = config;
    return (
      exactKeys(config, ["id", "parameters", "contentHash"], "wire config")
        .length === 0 &&
      validateWireConfigSource(source).length === 0 &&
      contentHash(source) === recorded
    );
  } catch {
    return false;
  }
}

export function validateRequestedModelRoute(
  route: RequestedModelRoute,
  asOf: string,
): string[] {
  const problems: string[] = [];
  try {
    problems.push(
      ...exactKeys(
        route,
        [
          "provider",
          "model",
          "upstream",
          "aliasEpoch",
          "reasoning",
          "wireConfig",
        ],
        "requestedRoute",
      ),
      ...exactKeys(
        route?.reasoning,
        ["requestedEffort", "wireEffort"],
        "requestedRoute.reasoning",
      ),
    );
    if (typeof route?.provider !== "string" || route.provider.trim() === "") {
      problems.push("requestedRoute.provider is required");
    }
    if (typeof route?.model !== "string" || route.model.trim() === "") {
      problems.push("requestedRoute.model is required");
    }
    for (const [label, value] of [
      ["upstream", route?.upstream],
      ["aliasEpoch", route?.aliasEpoch],
      ["reasoning.requestedEffort", route?.reasoning?.requestedEffort],
      ["reasoning.wireEffort", route?.reasoning?.wireEffort],
    ] as const) {
      if (
        value !== null &&
        (typeof value !== "string" || value.trim() === "")
      ) {
        problems.push(`requestedRoute.${label} must be non-empty string|null`);
      }
    }
    if (!verifyWireConfig(route?.wireConfig)) {
      problems.push("requestedRoute.wireConfig must verify");
    }
    problems.push(
      ...validateModelRef(
        {
          provider: route?.provider ?? "",
          model: route?.model ?? "",
          ...(route?.upstream ? { upstream: route.upstream } : {}),
          ...(route?.aliasEpoch ? { aliasEpoch: route.aliasEpoch } : {}),
          ...(route?.reasoning?.requestedEffort
            ? { reasoningEffort: route.reasoning.requestedEffort }
            : {}),
        },
        asOf,
      ),
    );
    assertNoSecretBearingFields(route, "requested route");
  } catch (error) {
    problems.push(
      `requested route validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

function identityProblems(value: unknown, label: string): string[] {
  return validateExactContentIdentityRef(
    value as ContentIdentityRef | undefined,
    label,
  );
}

export function botBuildContentHash(source: BotBuildManifestSource): string {
  return contentHash(source);
}

export function validateBotBuildManifestSource(
  source: BotBuildManifestSource,
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
        "bot build",
      ),
    );
    if (source?.manifestVersion !== BOT_BUILD_MANIFEST_VERSION) {
      problems.push(`manifestVersion must be "${BOT_BUILD_MANIFEST_VERSION}"`);
    }
    if (!NAME_PATTERN.test(source?.name ?? "")) {
      problems.push("name must be kebab-case");
    }
    if (!VERSION_PATTERN.test(source?.version ?? "")) {
      problems.push("version must be semver (x.y.z)");
    }
    if (source?.game !== "decrypto") problems.push('game must be "decrypto"');
    if (source?.scope !== "decoder") problems.push('scope must be "decoder"');

    problems.push(
      ...identityProblems(source?.strategyArtifact, "strategyArtifact"),
      ...exactKeys(
        source?.compilation,
        ["strategyCompiler", "contextCompiler", "compiledCarrier"],
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
        ...identityProblems(
          source?.execution?.[key],
          `execution.${key}`,
        ),
      );
    }

    const mintedAt = source?.provenance?.mintedAt ?? "";
    problems.push(
      ...exactKeys(
        source?.provenance,
        ["origin", "mintedAt"],
        "provenance",
      ),
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
    assertNoSecretBearingFields(source, "bot build");
  } catch (error) {
    problems.push(
      `bot build validator failed closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return problems;
}

export function mintBotBuildManifest(
  source: BotBuildManifestSource,
): BotBuildManifest {
  const problems = validateBotBuildManifestSource(source);
  if (problems.length > 0) {
    throw new Error(`invalid BotBuildManifest: ${problems.join("; ")}`);
  }
  const cloned = structuredClone(source);
  return cloneAndDeepFreeze({
    ...cloned,
    id: `${cloned.name}@${cloned.version}`,
    contentHash: botBuildContentHash(cloned),
  });
}

export function verifyBotBuildManifest(manifest: BotBuildManifest): boolean {
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
        "bot build manifest",
      ).length === 0 &&
      id === `${source.name}@${source.version}` &&
      validateBotBuildManifestSource(source).length === 0 &&
      recorded === botBuildContentHash(source)
    );
  } catch {
    return false;
  }
}

export function findBotBuildRegistryConflicts(
  manifests: readonly BotBuildManifest[],
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
