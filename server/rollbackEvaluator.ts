import type {
  CoachRollbackTrigger,
  CoachSemanticDelta,
  PatchIndex,
  PatchReview,
  PatchReviewStatus,
  RollbackTriggerEvaluation,
  SprintEvaluation,
} from "@shared/schema";
import { storage } from "./storage";

/**
 * Deterministic rollback trigger evaluator.
 *
 * For each pending patch (committed, with a reviewDueSprint <= currentSprint),
 * evaluates all rollback triggers from the patch's semantic deltas against
 * the current sprint evaluation metrics. No LLM calls — structured hints
 * are evaluated deterministically, freeform triggers yield "insufficient_data".
 */

type MetricExtractor = (evaluation: SprintEvaluation) => number | null;

const KNOWN_METRICS: Record<string, MetricExtractor> = {
  "winRate": (ev) => ev.training.winRate,
  "ownDecodeRate": (ev) => ev.execution.ownDecodeRate,
  "opponentInterceptRateAgainstUs": (ev) => ev.execution.opponentInterceptRateAgainstUs,
  "ourInterceptRate": (ev) => ev.execution.ourInterceptRate,
  "miscommunicationRate": (ev) => ev.execution.miscommunicationRate,
  "catastrophicAsymmetryRate": (ev) => ev.execution.catastrophicAsymmetryRate,
  "ownConsensusRate": (ev) => ev.deliberation.ownConsensusRate,
  "interceptConsensusRate": (ev) => ev.deliberation.interceptConsensusRate,
  "timeoutRate": (ev) => ev.deliberation.timeoutRate,
  "fallbackRate": (ev) => ev.deliberation.fallbackRate,
  "meanDeliberationExchanges": (ev) => ev.deliberation.meanDeliberationExchanges,
  "meanLeakageScore": (ev) => ev.leakage.meanLeakageScore,
  "maxLeakageScore": (ev) => ev.leakage.maxLeakageScore,
  "keywordMentionRate": (ev) => ev.leakage.keywordMentionRate,
  "codePatternRate": (ev) => ev.leakage.codePatternRate,
  "sideGap": (ev) => ev.sideBalance.sideGap,
  "genomeCharCount": (ev) => ev.complexity.genomeCharCount,
  "genomeSentenceCount": (ev) => ev.complexity.genomeSentenceCount,
  "compiledPromptTotalChars": (ev) => ev.complexity.compiledPromptTotalChars,
};

function extractMetric(metricHint: string, evaluation: SprintEvaluation): number | null {
  const extractor = KNOWN_METRICS[metricHint];
  if (!extractor) return null;
  return extractor(evaluation);
}

function evaluateStructuredTrigger(
  trigger: CoachRollbackTrigger,
  currentEvaluation: SprintEvaluation,
  baselineEvaluation?: SprintEvaluation,
): RollbackTriggerEvaluation {
  if (!trigger.metricHint || trigger.threshold === undefined || !trigger.comparatorHint) {
    return {
      description: trigger.description,
      status: "insufficient_data",
      evidenceLines: ["Trigger has no structured metric hint, comparator, or threshold — requires manual review."],
      supportingMetrics: {},
    };
  }

  const currentValue = extractMetric(trigger.metricHint, currentEvaluation);
  if (currentValue === null) {
    return {
      description: trigger.description,
      status: "insufficient_data",
      evidenceLines: [`Metric "${trigger.metricHint}" not found or unavailable in current evaluation.`],
      supportingMetrics: { [trigger.metricHint]: null },
    };
  }

  const supportingMetrics: Record<string, number | null> = {
    [trigger.metricHint]: currentValue,
  };

  let fired = false;
  let evidenceLine: string;

  switch (trigger.comparatorHint) {
    case "gt":
      fired = currentValue > trigger.threshold;
      evidenceLine = `${trigger.metricHint} = ${currentValue.toFixed(4)} ${fired ? ">" : "<="} ${trigger.threshold} threshold`;
      break;
    case "lt":
      fired = currentValue < trigger.threshold;
      evidenceLine = `${trigger.metricHint} = ${currentValue.toFixed(4)} ${fired ? "<" : ">="} ${trigger.threshold} threshold`;
      break;
    case "delta_gt":
    case "delta_lt": {
      if (!baselineEvaluation) {
        return {
          description: trigger.description,
          status: "insufficient_data",
          evidenceLines: ["No baseline evaluation available for delta comparison."],
          supportingMetrics,
        };
      }
      const baselineValue = extractMetric(trigger.metricHint, baselineEvaluation);
      if (baselineValue === null) {
        return {
          description: trigger.description,
          status: "insufficient_data",
          evidenceLines: [`Baseline metric "${trigger.metricHint}" not available.`],
          supportingMetrics,
        };
      }
      const delta = currentValue - baselineValue;
      supportingMetrics[`${trigger.metricHint}_baseline`] = baselineValue;
      supportingMetrics[`${trigger.metricHint}_delta`] = delta;

      if (trigger.comparatorHint === "delta_gt") {
        fired = delta > trigger.threshold;
        evidenceLine = `${trigger.metricHint} delta = ${delta.toFixed(4)} ${fired ? ">" : "<="} ${trigger.threshold} threshold (current=${currentValue.toFixed(4)}, baseline=${baselineValue.toFixed(4)})`;
      } else {
        fired = delta < trigger.threshold;
        evidenceLine = `${trigger.metricHint} delta = ${delta.toFixed(4)} ${fired ? "<" : ">="} ${trigger.threshold} threshold (current=${currentValue.toFixed(4)}, baseline=${baselineValue.toFixed(4)})`;
      }
      break;
    }
    default:
      return {
        description: trigger.description,
        status: "insufficient_data",
        evidenceLines: [`Unknown comparator "${trigger.comparatorHint}".`],
        supportingMetrics,
      };
  }

  return {
    description: trigger.description,
    status: fired ? "fired" : "clear",
    evidenceLines: [evidenceLine],
    supportingMetrics,
  };
}

function evaluateFreeformTrigger(description: string): RollbackTriggerEvaluation {
  return {
    description,
    status: "insufficient_data",
    evidenceLines: ["Freeform trigger — no structured evaluation possible. Shown to coach for judgment."],
    supportingMetrics: {},
  };
}

function extractTriggersFromPatch(patch: PatchIndex): Array<string | CoachRollbackTrigger> {
  const delta = patch.delta as CoachSemanticDelta | null;
  if (!delta?.rollbackTriggers?.length) return [];
  return delta.rollbackTriggers;
}

function computeReviewStatus(evaluations: RollbackTriggerEvaluation[]): PatchReviewStatus {
  if (evaluations.length === 0) return "insufficient_data";

  const hasFired = evaluations.some((ev) => ev.status === "fired");
  const hasClear = evaluations.some((ev) => ev.status === "clear");
  const allInsufficient = evaluations.every((ev) => ev.status === "insufficient_data");

  if (allInsufficient) return "insufficient_data";
  if (hasFired && hasClear) return "mixed";
  if (hasFired) return "trigger_fired";
  return "clear";
}

function buildReviewSummary(evaluations: RollbackTriggerEvaluation[], status: PatchReviewStatus): string {
  const firedCount = evaluations.filter((ev) => ev.status === "fired").length;
  const clearCount = evaluations.filter((ev) => ev.status === "clear").length;
  const insufficientCount = evaluations.filter((ev) => ev.status === "insufficient_data").length;

  const parts: string[] = [`${evaluations.length} trigger(s) evaluated`];
  if (firedCount > 0) parts.push(`${firedCount} fired`);
  if (clearCount > 0) parts.push(`${clearCount} clear`);
  if (insufficientCount > 0) parts.push(`${insufficientCount} insufficient data`);
  parts.push(`overall: ${status}`);

  return parts.join("; ");
}

export async function evaluatePendingPatchReviews(input: {
  runId: string;
  currentSprint: number;
  evaluationsBySprint: Map<number, SprintEvaluation>;
}): Promise<PatchReview[]> {
  const pendingPatches = await storage.getPendingPatchReviews(input.runId);

  // Only evaluate patches whose reviewDueSprint <= currentSprint
  const duePatches = pendingPatches.filter(
    (patch) => patch.reviewDueSprint !== null && patch.reviewDueSprint <= input.currentSprint,
  );

  if (duePatches.length === 0) return [];

  // Group by proposalId so we evaluate all edits from a single proposal together
  const byProposal = new Map<string, PatchIndex[]>();
  for (const patch of duePatches) {
    const key = patch.proposalId ?? `patch-${patch.id}`;
    const group = byProposal.get(key) ?? [];
    group.push(patch);
    byProposal.set(key, group);
  }

  const reviews: PatchReview[] = [];

  for (const [proposalId, patches] of byProposal) {
    const committedSprint = patches[0].sprintNumber;
    const currentEvaluation = input.evaluationsBySprint.get(input.currentSprint);

    // Baseline is the evaluation from the sprint when the patch was committed
    const baselineEvaluation = input.evaluationsBySprint.get(committedSprint);

    const allEvaluations: RollbackTriggerEvaluation[] = [];

    for (const patch of patches) {
      const triggers = extractTriggersFromPatch(patch);

      for (const trigger of triggers) {
        if (typeof trigger === "string") {
          allEvaluations.push(evaluateFreeformTrigger(trigger));
        } else if (!currentEvaluation) {
          allEvaluations.push({
            description: trigger.description,
            status: "insufficient_data",
            evidenceLines: ["No current sprint evaluation available."],
            supportingMetrics: {},
          });
        } else {
          allEvaluations.push(
            evaluateStructuredTrigger(trigger, currentEvaluation, baselineEvaluation),
          );
        }
      }
    }

    // If no triggers were defined at all, still produce a review marking it clear
    if (allEvaluations.length === 0) {
      allEvaluations.push({
        description: "No rollback triggers defined for this patch.",
        status: "clear",
        evidenceLines: ["Patch had no triggers — auto-cleared."],
        supportingMetrics: {},
      });
    }

    const status = computeReviewStatus(allEvaluations);
    const summary = buildReviewSummary(allEvaluations, status);

    const review: PatchReview = {
      runId: input.runId,
      proposalId,
      committedSprint,
      reviewSprint: input.currentSprint,
      status,
      evaluations: allEvaluations,
      summary,
    };

    reviews.push(review);

    // Persist the review
    await storage.createPatchReview({
      runId: input.runId,
      proposalId,
      committedSprint,
      reviewSprint: input.currentSprint,
      status,
      evaluations: allEvaluations,
      summary,
    });

    // Update patch_index entries with review results
    for (const patch of patches) {
      await storage.updatePatchIndexReview(patch.id, {
        reviewStatus: status,
        reviewSummary: summary,
      });
    }
  }

  return reviews;
}
