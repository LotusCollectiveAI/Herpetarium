import type {
  CompiledGenomePrompts,
  CompiledPromptArtifact,
  GenomeModuleKey,
  GenomeModules,
  PromptRole,
} from "@shared/schema";

const COMPILER_VERSION = "2.0.0";

const ROLE_TITLES: Record<PromptRole, string> = {
  cluegiver: "Cluegiver",
  own_guesser: "Own Guesser",
  interceptor: "Interceptor",
  own_deliberator: "Own Deliberator",
  intercept_deliberator: "Intercept Deliberator",
  coach: "Coach",
};

const MODULE_TITLES: Record<GenomeModuleKey, string> = {
  cluePhilosophy: "Clue Philosophy",
  opponentModeling: "Opponent Modeling",
  riskTolerance: "Risk Tolerance",
  memoryPolicy: "Memory Policy",
  executionGuidance: "Execution Guidance",
  deliberationScaffold: "Deliberation Scaffold",
};

const COACH_MODULE_KEYS: GenomeModuleKey[] = [
  "cluePhilosophy",
  "opponentModeling",
  "riskTolerance",
  "memoryPolicy",
  "executionGuidance",
  "deliberationScaffold",
];

const ROLE_MODULES: Record<PromptRole, GenomeModuleKey[]> = {
  cluegiver: ["cluePhilosophy", "riskTolerance", "executionGuidance"],
  own_guesser: ["memoryPolicy", "executionGuidance"],
  interceptor: ["opponentModeling", "riskTolerance", "executionGuidance"],
  own_deliberator: ["deliberationScaffold", "executionGuidance"],
  intercept_deliberator: ["deliberationScaffold", "opponentModeling", "executionGuidance"],
  coach: COACH_MODULE_KEYS,
};

const DIRECTIVE_MODULES: Record<Exclude<PromptRole, "coach">, GenomeModuleKey[]> = {
  cluegiver: ["executionGuidance", "cluePhilosophy"],
  own_guesser: ["executionGuidance"],
  interceptor: ["executionGuidance", "opponentModeling"],
  own_deliberator: ["deliberationScaffold"],
  intercept_deliberator: ["deliberationScaffold", "opponentModeling"],
};

function buildTaskDirectives(role: PromptRole, genome: GenomeModules): string | null {
  if (role === "coach") return null;
  const moduleKeys = DIRECTIVE_MODULES[role];
  const sections = moduleKeys
    .map(key => genome[key].trim())
    .filter(s => s.length > 0);
  if (sections.length === 0) return null;
  return sections.join("\n\n");
}

function simpleGenomeHash(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index) | 0;
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildModuleSection(key: GenomeModuleKey, value: string): string {
  return `### ${MODULE_TITLES[key]}\n${value.trim()}`;
}

function buildCharacterCountSummary(genome: GenomeModules): string {
  const lines = COACH_MODULE_KEYS.map((key) => `${MODULE_TITLES[key]}: ${genome[key].length} characters`);
  const total = COACH_MODULE_KEYS.reduce((sum, key) => sum + genome[key].length, 0);
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
    genomeHash: simpleGenomeHash(JSON.stringify(genome)),
    compilerVersion: COMPILER_VERSION,
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
