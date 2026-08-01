/**
 * The strategy payload format. Adopted unchanged from Herpetarium's proven
 * six-module genome (shared/schema.ts GenomeModules) so every existing
 * genome row, coach patch, and seed template is a valid substrate payload.
 */
export interface GenomeModules {
  cluePhilosophy: string;
  opponentModeling: string;
  riskTolerance: string;
  memoryPolicy: string;
  executionGuidance: string;
  deliberationScaffold: string;
}

export type GenomeModuleKey = keyof GenomeModules;

export const GENOME_MODULE_KEYS: GenomeModuleKey[] = [
  "cluePhilosophy",
  "opponentModeling",
  "riskTolerance",
  "memoryPolicy",
  "executionGuidance",
  "deliberationScaffold",
];

/**
 * Prompt roles. `cluegiver`/`own_guesser`/`interceptor` are the committing
 * action roles (The Table: cipher_encrypt / cipher_decide decode / intercept).
 * The deliberator roles cover team discussion (The Table: cipher_strategy;
 * Herpetarium: 3v3 deliberation). `coach` exists only on the research side.
 */
export type PromptRole =
  | "cluegiver"
  | "own_guesser"
  | "interceptor"
  | "own_deliberator"
  | "intercept_deliberator"
  | "coach";

export const ROLE_TITLES: Record<PromptRole, string> = {
  cluegiver: "Cluegiver",
  own_guesser: "Own Guesser",
  interceptor: "Interceptor",
  own_deliberator: "Own Deliberator",
  intercept_deliberator: "Intercept Deliberator",
  coach: "Coach",
};

export const MODULE_TITLES: Record<GenomeModuleKey, string> = {
  cluePhilosophy: "Clue Philosophy",
  opponentModeling: "Opponent Modeling",
  riskTolerance: "Risk Tolerance",
  memoryPolicy: "Memory Policy",
  executionGuidance: "Execution Guidance",
  deliberationScaffold: "Deliberation Scaffold",
};

/** Which modules compose each role's system prompt (compiler v2.0.0). */
export const ROLE_MODULES: Record<PromptRole, GenomeModuleKey[]> = {
  cluegiver: ["cluePhilosophy", "riskTolerance", "executionGuidance"],
  own_guesser: ["memoryPolicy", "executionGuidance"],
  interceptor: ["opponentModeling", "riskTolerance", "executionGuidance"],
  own_deliberator: ["deliberationScaffold", "executionGuidance"],
  intercept_deliberator: ["deliberationScaffold", "opponentModeling", "executionGuidance"],
  coach: GENOME_MODULE_KEYS,
};

/**
 * Which modules are additionally injected into the task/user prompt — the
 * high-leverage channel per Herpetarium's P4 finding that system-prompt-only
 * genome text was behaviorally inert.
 */
export const DIRECTIVE_MODULES: Record<Exclude<PromptRole, "coach">, GenomeModuleKey[]> = {
  cluegiver: ["executionGuidance", "cluePhilosophy"],
  own_guesser: ["executionGuidance"],
  interceptor: ["executionGuidance", "opponentModeling"],
  own_deliberator: ["deliberationScaffold"],
  intercept_deliberator: ["deliberationScaffold", "opponentModeling"],
};

export function isGenomeModules(value: unknown): value is GenomeModules {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return GENOME_MODULE_KEYS.every(
    (key) => typeof record[key] === "string" && record[key] !== "",
  );
}
