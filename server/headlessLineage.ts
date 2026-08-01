import type {
  HeadlessPromptOverrides,
  PromptRole,
  TeamId,
} from "@shared/schema";
import {
  INTERMEDIATE_HOPS_SOURCE,
  SENSORY_ANCHOR_SOURCE,
  contentHash,
  compileStrategyArtifact,
  mintStrategyArtifact,
  sha256Hex,
} from "@shared/substrate";

const HEADLESS_STRATEGY_LINEAGE_VERSION = "0.1" as const;

const PROMPT_ROLES: PromptRole[] = [
  "cluegiver",
  "own_guesser",
  "interceptor",
  "own_deliberator",
  "intercept_deliberator",
  "coach",
];

const HEADLESS_RUNTIME_PROMPT_ROLES: PromptRole[] = [
  "cluegiver",
  "own_guesser",
  "interceptor",
  "own_deliberator",
  "intercept_deliberator",
];

interface NamedArtifactBinding {
  artifact: {
    id: string;
    contentHash: string;
  };
  compiledPromptsHash: string;
}

const KNOWN_ARTIFACT_BINDINGS: NamedArtifactBinding[] = [
  INTERMEDIATE_HOPS_SOURCE,
  SENSORY_ANCHOR_SOURCE,
].map((source) => {
  const compiled = compileStrategyArtifact(mintStrategyArtifact(source));
  return {
    artifact: {
      id: compiled.artifactId,
      contentHash: compiled.artifactContentHash,
    },
    compiledPromptsHash: contentHash(compiled.compiled),
  };
});

export interface HeadlessRolePromptLineage {
  systemPromptSource: "compiled" | "monolithic" | "app_default";
  systemPromptHash?: string;
  taskDirectivesHash?: string;
  candidatePolicyHash?: string;
  usedByHeadlessRunner: boolean;
}

export interface HeadlessTeamStrategyLineage {
  artifact?: {
    id: string;
    contentHash: string;
  };
  compilation?: {
    compiledPromptsHash: string;
    genomeHash: string;
    legacyGenomeHash?: string;
    compilerVersion: string;
    substrateVersion?: string;
  };
  candidatePolicy?: {
    id: string;
    contentHash: string;
    appliesToRoles: ["cluegiver"];
  };
  monolithicSystemPromptHash?: string;
  roles: Record<PromptRole, HeadlessRolePromptLineage>;
}

export interface HeadlessStrategyLineage {
  lineageVersion: typeof HEADLESS_STRATEGY_LINEAGE_VERSION;
  /**
   * The exact normalized carrier accepted by the runner. This is preserved
   * alongside hashes so an experiment can be reproduced without reconstructing
   * prompt text from a mutable source checkout.
   */
  promptOverrides: HeadlessPromptOverrides;
  promptOverridesHash: string;
  teams: Partial<Record<TeamId, HeadlessTeamStrategyLineage>>;
}

function findNamedArtifact(
  compiledPromptsHash: string,
): NamedArtifactBinding["artifact"] | undefined {
  return KNOWN_ARTIFACT_BINDINGS.find(
    (candidate) =>
      candidate.compiledPromptsHash === compiledPromptsHash,
  )?.artifact;
}

function buildRoleLineage(
  role: PromptRole,
  teamOverrides: NonNullable<HeadlessPromptOverrides[TeamId]>,
): HeadlessRolePromptLineage {
  const compiledPrompt = teamOverrides.compiledPrompts?.prompts[role];
  const monolithicPrompt = teamOverrides.monolithicSystemPrompt;
  const candidatePolicy =
    role === "cluegiver" ? teamOverrides.candidatePolicy : undefined;

  return {
    systemPromptSource: compiledPrompt
      ? "compiled"
      : monolithicPrompt
        ? "monolithic"
        : "app_default",
    systemPromptHash: compiledPrompt
      ? sha256Hex(compiledPrompt.systemPrompt)
      : monolithicPrompt
        ? sha256Hex(monolithicPrompt)
        : undefined,
    taskDirectivesHash:
      compiledPrompt?.taskDirectives === null ||
      compiledPrompt?.taskDirectives === undefined
        ? undefined
        : sha256Hex(compiledPrompt.taskDirectives),
    candidatePolicyHash: candidatePolicy?.contentHash,
    // The shared compiler carries a coach prompt for coach-loop use, but
    // runHeadlessMatch does not currently consume it for post-match reflection.
    usedByHeadlessRunner:
      HEADLESS_RUNTIME_PROMPT_ROLES.includes(role),
  };
}

function buildTeamLineage(
  teamOverrides: NonNullable<HeadlessPromptOverrides[TeamId]>,
): HeadlessTeamStrategyLineage {
  const compiledPromptsHash = teamOverrides.compiledPrompts
    ? contentHash(teamOverrides.compiledPrompts)
    : undefined;

  const roles = Object.fromEntries(
    PROMPT_ROLES.map((role) => [
      role,
      buildRoleLineage(role, teamOverrides),
    ]),
  ) as Record<PromptRole, HeadlessRolePromptLineage>;

  return {
    artifact: compiledPromptsHash
      ? findNamedArtifact(compiledPromptsHash)
      : undefined,
    compilation:
      compiledPromptsHash && teamOverrides.compiledPrompts
        ? {
            compiledPromptsHash,
            genomeHash: teamOverrides.compiledPrompts.genomeHash,
            legacyGenomeHash:
              teamOverrides.compiledPrompts.legacyGenomeHash,
            compilerVersion:
              teamOverrides.compiledPrompts.compilerVersion,
            substrateVersion:
              teamOverrides.compiledPrompts.substrateVersion,
          }
        : undefined,
    candidatePolicy: teamOverrides.candidatePolicy
      ? {
          id: teamOverrides.candidatePolicy.id,
          contentHash: teamOverrides.candidatePolicy.contentHash,
          appliesToRoles: ["cluegiver"],
        }
      : undefined,
    monolithicSystemPromptHash: teamOverrides.monolithicSystemPrompt
      ? sha256Hex(teamOverrides.monolithicSystemPrompt)
      : undefined,
    roles,
  };
}

/**
 * Build the match-level strategy lineage snapshot after request
 * parsing/normalization and immediately before the match row is created.
 *
 * Named artifact identity is inferred only when the complete compiled carrier
 * exactly matches a known immutable shared artifact. Unknown or modified
 * compilations remain reproducible by their exact snapshot and hashes, but do
 * not receive an artifact identity merely because a caller claimed one.
 */
export function buildHeadlessStrategyLineage(
  promptOverrides: HeadlessPromptOverrides | undefined,
): HeadlessStrategyLineage | null {
  if (!promptOverrides) return null;

  const promptOverridesSnapshot = JSON.parse(
    JSON.stringify(promptOverrides),
  ) as HeadlessPromptOverrides;
  const teams: HeadlessStrategyLineage["teams"] = {};

  for (const team of ["amber", "blue"] as const) {
    const teamOverrides = promptOverridesSnapshot[team];
    if (teamOverrides) {
      teams[team] = buildTeamLineage(teamOverrides);
    }
  }

  return {
    lineageVersion: HEADLESS_STRATEGY_LINEAGE_VERSION,
    promptOverrides: promptOverridesSnapshot,
    promptOverridesHash: contentHash(promptOverridesSnapshot),
    teams,
  };
}
