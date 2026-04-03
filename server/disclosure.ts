import type { GenomeModules } from "@shared/schema";

const GENOME_DISCLOSURE_KEYS: Array<keyof GenomeModules> = [
  "cluePhilosophy",
  "opponentModeling",
  "riskTolerance",
  "memoryPolicy",
];

export function buildDisclosureText(genome: GenomeModules): string {
  return [
    "FOIA Disclosure",
    "Current opponent genome modules:",
    ...GENOME_DISCLOSURE_KEYS.map((key) => `${key}: ${genome[key]}`),
  ].join("\n");
}
