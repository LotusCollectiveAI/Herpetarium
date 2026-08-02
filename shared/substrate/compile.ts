/**
 * Deterministic strategy→prompt compilation. This is a semantics-preserving
 * port of Herpetarium server/genomeCompiler.ts v2.0.0: identical section
 * titles, module composition, and output text, so any genome evolved or
 * evaluated under that compiler compiles to the same prompts here — in
 * either application. Only the hash function is upgraded (sha-256; the
 * legacy 32-bit hash is preserved separately for DB lineage).
 */
import {
  DIRECTIVE_MODULES,
  GENOME_MODULE_KEYS,
  MODULE_TITLES,
  ROLE_MODULES,
  ROLE_TITLES,
  type GenomeModuleKey,
  type GenomeModules,
  type PromptRole,
} from "./genome";
import { canonicalJson, contentHash, legacyGenomeHash, sha256Hex } from "./hash";
import { SUBSTRATE_VERSION } from "./version";

export const COMPILER_VERSION = "2.0.0";

export interface CompiledPromptArtifact {
  role: PromptRole;
  systemPrompt: string;
  taskDirectives: string | null;
  charCount: number;
  tokenEstimate: number;
}

export interface CompiledGenomePrompts {
  genomeHash: string;
  legacyGenomeHash: string;
  compilerVersion: string;
  substrateVersion: string;
  prompts: Record<PromptRole, CompiledPromptArtifact>;
}

function buildTaskDirectives(role: PromptRole, genome: GenomeModules): string | null {
  if (role === "coach") return null;
  const moduleKeys = DIRECTIVE_MODULES[role];
  const sections = moduleKeys
    .map((key) => genome[key].trim())
    .filter((s) => s.length > 0);
  if (sections.length === 0) return null;
  return sections.join("\n\n");
}

function buildModuleSection(key: GenomeModuleKey, value: string): string {
  return `### ${MODULE_TITLES[key]}\n${value.trim()}`;
}

function buildCharacterCountSummary(genome: GenomeModules): string {
  const lines = GENOME_MODULE_KEYS.map(
    (key) => `${MODULE_TITLES[key]}: ${genome[key].length} characters`,
  );
  const total = GENOME_MODULE_KEYS.reduce((sum, key) => sum + genome[key].length, 0);
  return `### Character Count Summary\n${lines.join("\n")}\nTotal: ${total} characters`;
}

function buildPrompt(role: PromptRole, genome: GenomeModules): string {
  const sections = ROLE_MODULES[role].map((key) => buildModuleSection(key, genome[key]));
  if (role === "coach") {
    sections.push(buildCharacterCountSummary(genome));
  }
  return `## ${ROLE_TITLES[role]} Strategy\n\n${sections.join("\n\n")}`;
}

function buildArtifact(role: PromptRole, genome: GenomeModules): CompiledPromptArtifact {
  const systemPrompt = buildPrompt(role, genome);
  const taskDirectives = buildTaskDirectives(role, genome);
  const charCount = systemPrompt.length + (taskDirectives?.length || 0);
  return {
    role,
    systemPrompt,
    taskDirectives,
    charCount,
    tokenEstimate: Math.ceil(charCount / 4),
  };
}

export function compileGenomePrompts(genome: GenomeModules): CompiledGenomePrompts {
  return {
    genomeHash: contentHash(genome),
    legacyGenomeHash: legacyGenomeHash(JSON.stringify(genome)),
    compilerVersion: COMPILER_VERSION,
    substrateVersion: SUBSTRATE_VERSION,
    prompts: {
      cluegiver: buildArtifact("cluegiver", genome),
      own_guesser: buildArtifact("own_guesser", genome),
      interceptor: buildArtifact("interceptor", genome),
      own_deliberator: buildArtifact("own_deliberator", genome),
      intercept_deliberator: buildArtifact("intercept_deliberator", genome),
      coach: buildArtifact("coach", genome),
    },
  };
}

/** Stable hash of a full compilation, used by golden-fixture parity checks. */
export function compiledPromptsHash(compiled: CompiledGenomePrompts): string {
  return sha256Hex(canonicalJson(compiled));
}
