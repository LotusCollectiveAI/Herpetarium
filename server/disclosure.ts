import type {
  CoachSprint,
  DisclosureArtifact,
  GenomeModules,
} from "@shared/schema";

const GENOME_DISCLOSURE_KEYS: Array<keyof GenomeModules> = [
  "cluePhilosophy",
  "opponentModeling",
  "riskTolerance",
  "memoryPolicy",
  "executionGuidance",
  "deliberationScaffold",
];

export interface DisclosureBuildInput {
  opponentRunId: string;
  currentSprint: number;
  foiaEnabled: boolean;
  foiaDelaySprints: number;
  latestOpponentSprint?: CoachSprint;
  exemplarClues: string[];
  currentGenome: GenomeModules;
}

function buildPatchCard(input: DisclosureBuildInput): DisclosureArtifact | null {
  const sprint = input.latestOpponentSprint;
  if (!sprint) return null;

  const patchBundle = sprint.patchBundle;
  const proposal = sprint.proposal;

  if (!patchBundle && !proposal) return null;

  const lines: string[] = [];

  if (patchBundle && patchBundle.edits.length > 0) {
    const modules = patchBundle.edits.map((edit) => edit.targetModule).join(", ");
    const effect = patchBundle.expectedEffect || patchBundle.summary || "no stated effect";
    lines.push(`Sprint ${sprint.sprintNumber} ${sprint.decision === "commit" ? "committed" : "reverted"} edits to ${modules}.`);
    lines.push(`Intent: ${effect}`);
  } else if (proposal && typeof proposal === "object" && "summary" in proposal) {
    const proposalObj = proposal as { summary?: string; hypothesis?: string };
    lines.push(`Sprint ${sprint.sprintNumber}: ${proposalObj.summary || "no summary"}`);
    if (proposalObj.hypothesis) {
      lines.push(`Hypothesis: ${proposalObj.hypothesis}`);
    }
  }

  if (lines.length === 0) return null;

  return {
    type: "patch_card",
    title: `Opponent patch card (sprint ${sprint.sprintNumber})`,
    body: lines.join("\n"),
    sourceRunId: input.opponentRunId,
    sourceSprint: sprint.sprintNumber,
  };
}

function buildExemplarClueArtifacts(input: DisclosureBuildInput): DisclosureArtifact[] {
  if (input.exemplarClues.length === 0) return [];

  return [{
    type: "exemplar_clue",
    title: "Opponent exemplar clues",
    body: input.exemplarClues.join("\n"),
    sourceRunId: input.opponentRunId,
  }];
}

function buildDelayedDossier(input: DisclosureBuildInput): DisclosureArtifact | null {
  if (input.currentSprint < input.foiaDelaySprints) return null;

  const body = [
    "Full opponent genome modules:",
    ...GENOME_DISCLOSURE_KEYS.map((key) => `${key}: ${input.currentGenome[key]}`),
  ].join("\n");

  return {
    type: "delayed_dossier",
    title: "FOIA Delayed Dossier",
    body,
    sourceRunId: input.opponentRunId,
  };
}

export function buildDisclosureArtifacts(
  input: DisclosureBuildInput,
): DisclosureArtifact[] {
  const artifacts: DisclosureArtifact[] = [];

  const patchCard = buildPatchCard(input);
  if (patchCard) artifacts.push(patchCard);

  artifacts.push(...buildExemplarClueArtifacts(input));

  const dossier = buildDelayedDossier(input);
  if (dossier) artifacts.push(dossier);

  return artifacts;
}

export function renderDisclosureArtifacts(
  artifacts: DisclosureArtifact[],
): string {
  if (artifacts.length === 0) return "";

  return artifacts
    .map((artifact) => `[${artifact.type}] ${artifact.title}\n${artifact.body}`)
    .join("\n\n");
}

export function buildDisclosureText(
  input: DisclosureBuildInput,
): string {
  const artifacts = buildDisclosureArtifacts(input);
  return renderDisclosureArtifacts(artifacts);
}
