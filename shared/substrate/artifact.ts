/**
 * Named immutable strategy artifacts.
 *
 * An artifact is a (name, version, genome, provenance) tuple whose identity
 * is `name@version` and whose integrity is a sha-256 content hash. Once a
 * name@version is minted its content never changes — retraining mints a new
 * version. Herpetarium mints; The Table seats; both cite `id` + `contentHash`
 * in every trace so a human game is attributable to the exact trained object.
 */
import { compileGenomePrompts, type CompiledGenomePrompts } from "./compile";
import { isGenomeModules, type GenomeModules } from "./genome";
import { contentHash } from "./hash";
import type { ModelRef } from "./modelRef";
import { SUBSTRATE_VERSION } from "./version";

export type ArtifactMethod = "seed" | "coach_loop" | "evolution" | "manual";

export interface ArtifactProvenance {
  /** Where the genome text came from (repo path, run id, DB row…). */
  origin: string;
  method: ArtifactMethod;
  /** ISO date the artifact was minted (assigned by the minting run). */
  mintedAt: string;
  /** Models this strategy was trained/evaluated against, pinned. */
  trainedAgainst?: ModelRef[];
  /**
   * Informal pointers to evaluation evidence (run ids, doc paths) for
   * humans. NOT the promotion gate — seating validation consumes typed
   * EvaluationRecords, never this list.
   */
  evalRefs?: string[];
  /** Parent artifact id for lineage (e.g. "sensory-anchor@0.1.0"). */
  parent?: string;
  notes?: string;
}

export interface StrategyArtifactSource {
  name: string;
  version: string;
  game: "decrypto";
  genome: GenomeModules;
  provenance: ArtifactProvenance;
}

export interface StrategyArtifact extends StrategyArtifactSource {
  /** `${name}@${version}` */
  id: string;
  /** sha-256 of the canonical source (name, version, game, genome, provenance). */
  contentHash: string;
  substrateVersion: string;
}

const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function mintStrategyArtifact(source: StrategyArtifactSource): StrategyArtifact {
  const problems = validateArtifactSource(source);
  if (problems.length > 0) {
    throw new Error(`invalid strategy artifact source: ${problems.join("; ")}`);
  }
  return {
    ...source,
    id: `${source.name}@${source.version}`,
    contentHash: artifactContentHash(source),
    substrateVersion: SUBSTRATE_VERSION,
  };
}

export function artifactContentHash(source: StrategyArtifactSource): string {
  return contentHash({
    name: source.name,
    version: source.version,
    game: source.game,
    genome: source.genome,
    provenance: source.provenance,
  });
}

export function validateArtifactSource(source: StrategyArtifactSource): string[] {
  const problems: string[] = [];
  if (!NAME_PATTERN.test(source.name)) {
    problems.push(`name "${source.name}" must be kebab-case`);
  }
  if (!VERSION_PATTERN.test(source.version)) {
    problems.push(`version "${source.version}" must be semver (x.y.z)`);
  }
  if (source.game !== "decrypto") {
    problems.push(`game "${String(source.game)}" is not supported`);
  }
  if (!isGenomeModules(source.genome)) {
    problems.push("genome must contain all six non-empty modules");
  }
  if (!source.provenance || typeof source.provenance.origin !== "string" || source.provenance.origin === "") {
    problems.push("provenance.origin is required");
  }
  if (!source.provenance || !/^\d{4}-\d{2}-\d{2}/.test(source.provenance.mintedAt ?? "")) {
    problems.push("provenance.mintedAt must be an ISO date");
  }
  return problems;
}

/** Recompute the hash and confirm the artifact has not been altered. */
export function verifyStrategyArtifact(artifact: StrategyArtifact): boolean {
  if (artifact.id !== `${artifact.name}@${artifact.version}`) return false;
  return artifactContentHash(artifact) === artifact.contentHash;
}

/**
 * Immutability guard for an artifact registry: the same id must never appear
 * with two different content hashes. Returns conflicting ids.
 */
export function findRegistryConflicts(artifacts: StrategyArtifact[]): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const artifact of artifacts) {
    const previous = seen.get(artifact.id);
    if (previous !== undefined && previous !== artifact.contentHash) {
      conflicts.push(artifact.id);
    }
    seen.set(artifact.id, artifact.contentHash);
  }
  return conflicts;
}

/**
 * Promotion gate. The 2026-07-27 pilot proved bots reach humans with ample
 * deliberation budget but zero demonstrated competence (76.7k tokens,
 * ≈$1.11, 633.7s latency — and six definition clues). Seating policy makes
 * "measured before seated" structural — and "measured" means a typed,
 * immutable EvaluationRecord, not a nonempty pointer list. A record binds
 * the exact artifact (id + content hash), the exact model route, the
 * compiler version, and the decision-time candidate policy to a named
 * protocol version, held-out matched tests, a verdict, and an explicit
 * scope of what the verdict licenses.
 */
export interface EvaluationProtocol {
  /** e.g. "baseline-20610f90" */
  name: string;
  version: string;
}

export interface HeldOutTests {
  games: number;
  /** Opposing configurations faced (artifact ids or named baselines). */
  opponents: string[];
  /** True when conditions were matched (side-balanced, seeded, same rules). */
  matched: boolean;
  /** Seed or fixture set reference for reproduction. */
  fixtureRef?: string;
}

export interface EvaluationRecordSource {
  recordVersion: "0.1";
  artifact: { id: string; contentHash: string };
  compilerVersion: string;
  modelRoute: ModelRef;
  /** The decision-time policy evaluated (candidate generation/selection settings). */
  candidatePolicy: { description: string; contentHash?: string };
  protocol: EvaluationProtocol;
  heldOutTests: HeldOutTests;
  metrics?: Record<string, number>;
  verdict: "pass" | "fail" | "inconclusive";
  /** What this verdict licenses, stated narrowly (game, rules regime, opposition). */
  scope: string;
  evaluatedAt: string;
  /** Pointer to the run and its traces. */
  runRef: string;
}

export interface EvaluationRecord extends EvaluationRecordSource {
  contentHash: string;
}

export function mintEvaluationRecord(source: EvaluationRecordSource): EvaluationRecord {
  const problems = validateEvaluationRecordSource(source);
  if (problems.length > 0) {
    throw new Error(`invalid evaluation record: ${problems.join("; ")}`);
  }
  return { ...source, contentHash: contentHash(source) };
}

export function verifyEvaluationRecord(record: EvaluationRecord): boolean {
  const { contentHash: recorded, ...source } = record;
  return contentHash(source) === recorded;
}

export function validateEvaluationRecordSource(source: EvaluationRecordSource): string[] {
  const problems: string[] = [];
  if (source.recordVersion !== "0.1") problems.push("recordVersion must be \"0.1\"");
  if (!source.artifact?.id || !source.artifact?.contentHash) {
    problems.push("artifact id and contentHash are required");
  }
  if (!source.compilerVersion) problems.push("compilerVersion is required");
  if (!source.modelRoute?.provider || !source.modelRoute?.model) {
    problems.push("modelRoute must carry provider and model");
  }
  if (!source.candidatePolicy?.description) problems.push("candidatePolicy.description is required");
  if (!source.protocol?.name || !source.protocol?.version) {
    problems.push("protocol name and version are required");
  }
  if (!Number.isInteger(source.heldOutTests?.games) || source.heldOutTests.games < 1) {
    problems.push("heldOutTests.games must be a positive integer");
  }
  if (source.verdict !== "pass" && source.verdict !== "fail" && source.verdict !== "inconclusive") {
    problems.push("verdict must be pass | fail | inconclusive");
  }
  if (!source.scope) problems.push("scope is required");
  if (!/^\d{4}-\d{2}-\d{2}/.test(source.evaluatedAt ?? "")) {
    problems.push("evaluatedAt must be an ISO date");
  }
  if (!source.runRef) problems.push("runRef is required");
  return problems;
}

function modelRouteSatisfies(record: ModelRef, required: ModelRef): boolean {
  if (record.provider !== required.provider || record.model !== required.model) return false;
  if (required.upstream !== undefined && record.upstream !== required.upstream) return false;
  if (required.aliasEpoch !== undefined && record.aliasEpoch !== required.aliasEpoch) return false;
  return true;
}

export interface SeatingPolicy {
  allowUnvalidated: boolean;
  /** When set, only passing records under this protocol name qualify. */
  requiredProtocol?: string;
  /** When set, the passing record must bind this exact model route. */
  requiredModelRoute?: ModelRef;
}

export interface SeatingDecision {
  seatable: boolean;
  validated: boolean;
  reason: string;
  /** The evaluation record that licensed seating, when validated. */
  license?: { recordHash: string; protocol: EvaluationProtocol; scope: string };
}

export function evaluateSeating(
  artifact: StrategyArtifact,
  records: EvaluationRecord[],
  policy: SeatingPolicy,
): SeatingDecision {
  if (!verifyStrategyArtifact(artifact)) {
    return { seatable: false, validated: false, reason: "artifact failed integrity verification" };
  }
  const qualifying = records.find(
    (record) =>
      verifyEvaluationRecord(record) &&
      record.artifact.id === artifact.id &&
      record.artifact.contentHash === artifact.contentHash &&
      record.verdict === "pass" &&
      (policy.requiredProtocol === undefined ||
        record.protocol.name === policy.requiredProtocol) &&
      (policy.requiredModelRoute === undefined ||
        modelRouteSatisfies(record.modelRoute, policy.requiredModelRoute)),
  );
  if (qualifying) {
    return {
      seatable: true,
      validated: true,
      reason: `licensed by ${qualifying.protocol.name}@${qualifying.protocol.version}: ${qualifying.scope}`,
      license: {
        recordHash: qualifying.contentHash,
        protocol: qualifying.protocol,
        scope: qualifying.scope,
      },
    };
  }
  if (policy.allowUnvalidated) {
    return {
      seatable: true,
      validated: false,
      reason: "unvalidated artifact seated by explicit policy; traces must mark it unvalidated",
    };
  }
  return {
    seatable: false,
    validated: false,
    reason: "no passing evaluation record binds this exact artifact under the required policy",
  };
}

export interface CompiledStrategyArtifact {
  artifactId: string;
  artifactContentHash: string;
  compiled: CompiledGenomePrompts;
}

/** Compile a verified artifact into role prompts for seating. */
export function compileStrategyArtifact(artifact: StrategyArtifact): CompiledStrategyArtifact {
  if (!verifyStrategyArtifact(artifact)) {
    throw new Error(`artifact ${artifact.id} failed integrity verification`);
  }
  return {
    artifactId: artifact.id,
    artifactContentHash: artifact.contentHash,
    compiled: compileGenomePrompts(artifact.genome),
  };
}
