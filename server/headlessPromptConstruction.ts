import type {
  AblationFlag,
  AIPlayerConfig,
  HeadlessPromptOverrides,
  TeamId,
} from "@shared/schema";
import { buildCluePromptForConfig } from "./ai";
import { resolveRoleCandidatePolicy } from "./headlessPromptAuthority";
import type { ClueTemplateParams } from "./promptStrategies";

export interface HeadlessClueCallPromptInput {
  config: AIPlayerConfig;
  team: TeamId;
  keywords: string[];
  targetCode: [number, number, number];
  history: ClueTemplateParams["history"];
  scratchNotes?: string;
  ablations?: AblationFlag[];
  promptOverrides?: HeadlessPromptOverrides;
}

/**
 * Single construction seam for the exact clue prompt dispatched by the
 * headless runner. Offline experiment-integrity tests call this same seam, so
 * synthetic prompt strings cannot accidentally certify a runner drift.
 */
export function buildHeadlessClueCallPrompt(
  input: HeadlessClueCallPromptInput,
): {
  params: ClueTemplateParams;
  fullPrompt: string;
} {
  const override =
    input.promptOverrides?.[input.team]?.compiledPrompts?.prompts
      .cluegiver;
  const params: ClueTemplateParams = {
    keywords: input.keywords,
    targetCode: input.targetCode,
    history: input.history,
    scratchNotes: input.scratchNotes,
    ablations: input.ablations,
    systemPromptOverride:
      override?.systemPrompt ??
      input.promptOverrides?.[input.team]?.monolithicSystemPrompt ??
      undefined,
    taskDirectives: override?.taskDirectives ?? undefined,
    candidatePolicy: resolveRoleCandidatePolicy(
      input.promptOverrides,
      input.team,
      "cluegiver",
    ),
  };
  return {
    params,
    fullPrompt: buildCluePromptForConfig(input.config, params),
  };
}
