/**
 * POSTMORTEM OF THE FAILED v0.3 LIVE BOUNDARY, 2026-08-02.
 *
 * Provider-free evaluator replay. Every check runs the REAL evaluator at the
 * REAL published thresholds; nothing here calls a model or a database. The
 * parsed report is preserved and hash-bound, but the provider execution is not
 * exactly reproducible because raw assistant text and complete source lineage
 * were not stored.
 *
 * READ THE LABELS. This file mixes two kinds of check and they carry very
 * different weight:
 *
 *   [LIVE]  replays of the exact parsed evidence grids preserved from the
 *           dated-model report. These ARE model evidence, at n = 1 per case.
 *           They are an existence proof of a miss, never a rate.
 *   [SHAPE] hand-authored counterfactuals and shaped inputs. These are
 *           tier-shape probes of the evaluator ONLY. They say nothing about
 *           what any model would return or whether a clue set is safe.
 *
 * What this suite exists to prevent, concretely: someone reading "Blue passed
 * and should have vetoed" and reaching for a threshold. The sweep below proves
 * by exhaustion that no setting of the published threshold fields can reach
 * Blue under the fixed decision logic. The shaped-input tripwire fails loudly
 * the moment anyone adds the evidence-only clause that would.
 *
 *   npx tsx scripts/test-cross-round-v03-postmortem.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPublicClueLedger,
  evaluateCrossRoundInversion,
  CLUE_COLUMN_NUMBERS,
  LEGAL_CODE_TRIPLES,
  CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
  CROSS_ROUND_AUDITOR_PROMPT_HASH,
  CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
  CROSS_ROUND_COLUMN_VETO_POLICY_ID,
  CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
  CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02,
  CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02,
  CROSS_ROUND_V01_BLUE_TRACE_2026_08_01,
  contentHash,
  sha256Hex,
} from "../shared/substrate";
import type {
  CrossRoundAuditorReply,
  CrossRoundClueAudit,
  CrossRoundInversionPolicy,
  HypothesisSupport,
  PublicClueLedger,
  ReferentStrength,
} from "../shared/substrate";

let assertions = 0;
function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}
function equal<T>(actual: T, expected: T, message: string): void {
  assert.strictEqual(actual, expected, message);
  assertions += 1;
}
function deepEqual<T>(actual: T, expected: T, message: string): void {
  assert.deepStrictEqual(actual, expected, message);
  assertions += 1;
}

type EdgeSpec = readonly [number, string, string, ReferentStrength];

function evidenceRow(
  clueIndex: number,
  clue: string,
  edges: readonly EdgeSpec[],
): CrossRoundClueAudit {
  return {
    clueIndex,
    clue,
    historyMatches: CLUE_COLUMN_NUMBERS.map((number) => {
      const edge = edges.find((candidate) => candidate[0] === number);
      return {
        number,
        sharedReferent: edge ? edge[1] : null,
        publicClue: edge ? edge[2] : null,
        strength: edge ? edge[3] : ("none" as ReferentStrength),
      };
    }),
  };
}

function reply(
  audits: CrossRoundClueAudit[],
  codes: readonly (readonly [
    readonly [number, number, number],
    HypothesisSupport,
  ])[],
): CrossRoundAuditorReply {
  return {
    audits,
    codeHypotheses: codes.map(([code, support]) => ({
      code,
      support,
      rationale: null,
    })),
  };
}

// ---------------------------------------------------------------------------
// The two incident ledgers, rebuilt by the shared builder rather than typed in.
// ---------------------------------------------------------------------------
const RED_LEDGER: PublicClueLedger = buildPublicClueLedger([
  { clues: ["Aggregate", "Bengal", "Firetruck"], code: [1, 3, 4] },
]);
const BLUE_LEDGER: PublicClueLedger = buildPublicClueLedger([
  { clues: ["pillow", "crown", "telescope"], code: [2, 1, 3] },
]);
const RED_CODE = [1, 3, 4] as const;
const BLUE_CODE = [4, 1, 3] as const;

// ---------------------------------------------------------------------------
// [LIVE] Exact parsed grids preserved on 2026-08-02. Model evidence, n = 1.
// ---------------------------------------------------------------------------
const LIVE_RED = reply(
  [
    evidenceRow(1, "blast", [
      [1, "quarry", "Aggregate", "plausible"],
      [4, "fire", "Firetruck", "strong"],
    ]),
    evidenceRow(2, "orange", [
      [1, "fruit", "Aggregate", "weak"],
      [3, "tiger", "Bengal", "strong"],
      [4, "fire", "Firetruck", "plausible"],
    ]),
    evidenceRow(3, "ascent", [
      [3, "cat", "Bengal", "weak"],
      [4, "ladder", "Firetruck", "plausible"],
    ]),
  ],
  [
    [[4, 3, 2], "plausible"],
    [[1, 3, 4], "plausible"],
  ],
);

/** The grid that carries the miss: turret/slot 1 is absent, i.e. `none`. */
const LIVE_BLUE = reply(
  [
    evidenceRow(1, "treetop", [[1, "tree", "crown", "strong"]]),
    evidenceRow(2, "turret", [
      [2, "fort", "pillow", "plausible"],
      [3, "warship", "telescope", "weak"],
    ]),
    evidenceRow(3, "nebula", [
      [2, "cloud", "pillow", "weak"],
      [3, "astronomy", "telescope", "strong"],
    ]),
  ],
  [[[1, 2, 3], "plausible"]],
);

const LIVE_CONTROL = reply(
  [
    evidenceRow(1, "kettle", [
      [1, "pot", "Aggregate", "weak"],
      [4, "red", "Firetruck", "strong"],
    ]),
    evidenceRow(2, "meridian", [[3, "line", "Bengal", "weak"]]),
    evidenceRow(3, "sable", [
      [1, "black", "Aggregate", "weak"],
      [3, "animal", "Bengal", "plausible"],
      [4, "color", "Firetruck", "weak"],
    ]),
  ],
  [
    [[4, 2, 3], "plausible"],
    [[4, 3, 1], "weak"],
    [[1, 2, 3], "weak"],
  ],
);

function testLiveReplaysReproduceTheBoundary(): void {
  // [LIVE] The instrument identity these grids were produced under must still
  // be the identity in the source, or the replay is measuring something else.
  equal(
    CROSS_ROUND_INVERSION_PROTOCOL_VERSION,
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.instrumentIdentity.protocolVersion,
    "protocol identity still matches the failed live run",
  );
  equal(
    CROSS_ROUND_COLUMN_VETO_POLICY_ID,
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.instrumentIdentity.policyId,
    "policy id still matches the failed live run",
  );
  equal(
    CROSS_ROUND_COLUMN_VETO_POLICY_HASH,
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.instrumentIdentity.policyHash,
    "POLICY HASH UNCHANGED — the postmortem must not silently re-identify the policy the run executed under",
  );
  equal(
    CROSS_ROUND_AUDITOR_PROMPT_HASH,
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.instrumentIdentity
      .auditorPromptHash,
    "PROMPT HASH UNCHANGED — a prompt edit would destroy the baseline the next experiment needs",
  );

  const red = evaluateCrossRoundInversion(LIVE_RED, RED_CODE, RED_LEDGER);
  const blue = evaluateCrossRoundInversion(LIVE_BLUE, BLUE_CODE, BLUE_LEDGER);
  const control = evaluateCrossRoundInversion(
    LIVE_CONTROL,
    RED_CODE,
    RED_LEDGER,
  );

  equal(red.outcome, "hard_veto", "[LIVE] Red replays to hard_veto as recorded");
  equal(blue.outcome, "pass", "[LIVE] Blue replays to pass — THE FAILURE");
  equal(control.outcome, "pass", "[LIVE] control replays to pass as recorded");
  ok(
    !CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.releaseBoundarySatisfied,
    "[LIVE] the recorded boundary is unsatisfied and stays that way",
  );

  // The miss is a single `none` cell on a history-bearing intended column.
  const turret = blue.positions[1]!;
  equal(turret.intendedNumber, 1, "[LIVE] turret's intended slot is 1");
  ok(turret.columnHadHistory, "[LIVE] slot 1 carries public history (`crown`)");
  equal(
    turret.intendedStrength,
    "none",
    "[LIVE] the auditor reported NO bridge from turret to the crown column",
  );
  equal(
    blue.dominatingHypotheses,
    null,
    "[LIVE] intended [4,1,3] is absent from the credible set, so every tier short-circuits",
  );
  equal(
    blue.actionableIntendedEdges,
    1,
    "[LIVE] only nebula/telescope survived as an actionable intended edge",
  );

  // Blue's structural ceiling: slot 4 is history-free, so it can never be an
  // edge, and `hardVetoMinimumActionableEdges` is 2. Blue has ZERO slack.
  equal(
    blue.historyBearingPositions,
    2,
    "[LIVE] Blue offers only two history-bearing intended positions",
  );
  equal(
    CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY.hardVetoMinimumActionableEdges,
    2,
    "the evidence conjunct demands two edges, so Blue must hit 2 of 2 with no slack",
  );

  // Blue is a REGRESSION against the oldest instrument, not merely a miss.
  equal(
    CROSS_ROUND_V01_BLUE_TRACE_2026_08_01.observedOutcome,
    "soft_regenerate_once",
    "@0.1-probe earned one bounded regeneration on this same incident",
  );
  ok(
    blue.outcome === "pass" &&
      CROSS_ROUND_V01_BLUE_TRACE_2026_08_01.observedOutcome !== "pass",
    "@0.3-probe is STRICTLY WEAKER than @0.1-probe on the Blue incident",
  );
}

// ---------------------------------------------------------------------------
// [SHAPE] Which conjunct binds. Hand-authored counterfactuals over the live
// grid. NOT a claim about model behaviour.
// ---------------------------------------------------------------------------
const REPAIRED_TURRET = evidenceRow(2, "turret", [
  [1, "castle", "crown", "plausible"],
  [2, "fort", "pillow", "plausible"],
  [3, "warship", "telescope", "weak"],
]);

function testCounterfactualDecomposition(): void {
  const gridOnly = evaluateCrossRoundInversion(
    reply(
      [LIVE_BLUE.audits[0]!, REPAIRED_TURRET, LIVE_BLUE.audits[2]!],
      [[[1, 2, 3], "plausible"]],
    ),
    BLUE_CODE,
    BLUE_LEDGER,
  );
  const setOnly = evaluateCrossRoundInversion(
    reply(LIVE_BLUE.audits as CrossRoundClueAudit[], [
      [[1, 2, 3], "plausible"],
      [[4, 1, 3], "plausible"],
    ]),
    BLUE_CODE,
    BLUE_LEDGER,
  );
  const both = evaluateCrossRoundInversion(
    reply(
      [LIVE_BLUE.audits[0]!, REPAIRED_TURRET, LIVE_BLUE.audits[2]!],
      [
        [[1, 2, 3], "plausible"],
        [[4, 1, 3], "plausible"],
      ],
    ),
    BLUE_CODE,
    BLUE_LEDGER,
  );

  equal(
    gridOnly.outcome,
    "pass",
    "[SHAPE] repairing ONLY the evidence grid still passes",
  );
  equal(
    setOnly.outcome,
    "soft_regenerate_once",
    "[SHAPE] repairing ONLY the credible set earns one bounded regeneration",
  );
  equal(
    both.outcome,
    "hard_veto",
    "[SHAPE] the published evaluator hard-vetoes when both hand-authored conjuncts are repaired",
  );

  // Pin the same four outcomes in the shared fixture so the two cannot drift.
  const recorded = CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02.outcomes;
  equal(recorded.observed, "pass", "fixture records the observed outcome");
  equal(
    recorded.gridRepairedOnly,
    gridOnly.outcome,
    "fixture matches the grid-only counterfactual",
  );
  equal(
    recorded.credibleSetRepairedOnly,
    setOnly.outcome,
    "fixture matches the credible-set-only counterfactual",
  );
  equal(
    recorded.bothRepaired,
    both.outcome,
    "fixture matches the both-repaired counterfactual",
  );
  ok(
    CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02.isModelEvidence === false,
    "the counterfactual record declares itself NOT model evidence",
  );
}

// ---------------------------------------------------------------------------
// THE ANTI-OVERFIT GUARD. No legal published-threshold configuration reaches
// Blue under the fixed decision logic.
// ---------------------------------------------------------------------------
function testNoThresholdCanReachBlue(): void {
  const supports: HypothesisSupport[] = ["weak", "plausible", "strong"];
  const strengths: ReferentStrength[] = ["weak", "plausible", "strong"];
  let swept = 0;
  let redVetoes = 0;
  let blueVetoes = 0;
  let controlVetoes = 0;

  for (const dominated of [0, 1, 2, 3, 4, 5])
    for (const setSize of [1, 2, 3, 4, 5, 6])
      for (const minSupport of supports)
        for (const minStrength of strengths)
          for (const minEdges of [1, 2, 3])
            for (const requireStrong of [true, false]) {
              const policy: CrossRoundInversionPolicy = {
                ...CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY,
                hardVetoDominatedByAtMost: dominated,
                softVetoDominatedByAtMost: Math.max(
                  dominated,
                  CROSS_ROUND_REFERENT_EVIDENCE_VETO_POLICY
                    .softVetoDominatedByAtMost,
                ),
                hardVetoCredibleSetSizeAtMost: setSize,
                minimumHardVetoSupport: minSupport,
                minimumActionableReferentStrength: minStrength,
                hardVetoMinimumActionableEdges: minEdges,
                requiresAtLeastOneStrongIntendedEdge: requireStrong,
              };
              let red, blue, control;
              try {
                red = evaluateCrossRoundInversion(
                  LIVE_RED,
                  RED_CODE,
                  RED_LEDGER,
                  policy,
                );
                blue = evaluateCrossRoundInversion(
                  LIVE_BLUE,
                  BLUE_CODE,
                  BLUE_LEDGER,
                  policy,
                );
                control = evaluateCrossRoundInversion(
                  LIVE_CONTROL,
                  RED_CODE,
                  RED_LEDGER,
                  policy,
                );
              } catch {
                continue; // rejected by the evaluator's own validator
              }
              swept += 1;
              if (red.outcome === "hard_veto") redVetoes += 1;
              if (blue.outcome === "hard_veto") blueVetoes += 1;
              if (control.outcome === "hard_veto") controlVetoes += 1;
            }

  const recorded =
    CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02.thresholdSweep;
  equal(
    swept,
    recorded.configurationsSwept,
    "sweep covers every validator-accepted combination in the published threshold parameterization",
  );
  equal(
    blueVetoes,
    0,
    "NO legal setting of the published threshold fields hard-vetoes the live Blue reply under the fixed decision logic",
  );
  equal(recorded.blueHardVetoes, 0, "the fixture records the same zero");
  equal(
    redVetoes,
    recorded.redHardVetoes,
    "Red remains reachable across a large part of the space",
  );
  ok(
    redVetoes > 0,
    "the sweep is not vacuous: Red really does hard-veto under many configs",
  );
  equal(
    controlVetoes,
    0,
    "the synthetic control never vetoes anywhere in the space, so 'the control passed' discriminates nothing about threshold choice",
  );
}

// ---------------------------------------------------------------------------
// [SHAPE] PLACEMENT-SENSITIVITY INPUTS. These fail the moment anyone adds the
// evidence-only clause that would flip Blue.
// ---------------------------------------------------------------------------
function testShapedInputPlacementSensitivity(): void {
  // High evidence, low identifiability: every intended column carries a STRONG
  // bridge, yet the auditor's credible set is wide and does not converge. This
  // is a hand-authored evaluator shape, not evidence about real clue safety.
  const highEvidence = reply(
    [
      evidenceRow(1, "kettle", [
        [1, "vessel", "Aggregate", "strong"],
        [4, "red", "Firetruck", "strong"],
      ]),
      evidenceRow(2, "meridian", [
        [1, "survey", "Aggregate", "strong"],
        [3, "stripe", "Bengal", "strong"],
      ]),
      evidenceRow(3, "sable", [
        [3, "animal", "Bengal", "strong"],
        [4, "colour", "Firetruck", "strong"],
      ]),
    ],
    [
      [[4, 1, 3], "plausible"],
      [[1, 3, 4], "weak"],
      [[4, 3, 1], "plausible"],
      [[1, 4, 3], "plausible"],
    ],
  );
  const evaluated = evaluateCrossRoundInversion(
    highEvidence,
    RED_CODE,
    RED_LEDGER,
  );
  equal(
    evaluated.strongIntendedEdges,
    3,
    "[SHAPE] all three intended columns carry a strong bridge",
  );
  equal(
    evaluated.outcome,
    "pass",
    "[SHAPE] the two-layer conjunction correctly PASSES high-evidence/low-identifiability play",
  );
  ok(
    evaluated.strongIntendedEdges >= 2,
    "[SHAPE] TRIPWIRE: an evidence-only `strongIntendedEdges >= 2` clause would hard-veto this hand-authored wide-set input. If you added one to catch Blue, read the sweep above: it does not catch Blue either.",
  );

  // The live shaped input's model-proposed cells include `kettle -> Firetruck`
  // via "red" at STRONG. The observation establishes only that this one
  // off-intended bridge received the top label; no safety, leakage, or
  // population-rate conclusion follows.
  const offIntendedStrong = LIVE_CONTROL.audits[0]!.historyMatches.find(
    (match) => match.number === 4,
  );
  equal(
    offIntendedStrong?.strength,
    "strong",
    "[LIVE] the auditor labelled an off-intended model-proposed bridge STRONG on the shaped input",
  );
  const controlEval = evaluateCrossRoundInversion(
    LIVE_CONTROL,
    RED_CODE,
    RED_LEDGER,
  );
  equal(
    controlEval.actionableIntendedEdges,
    0,
    "[LIVE] the shaped input passes because its asserted cells are off the supplied intended positions; this says nothing about opacity",
  );

  // Relocating the SAME two spurious cells onto intended positions flips it.
  const relocated = reply(
    [
      evidenceRow(1, "kettle", [[1, "red", "Aggregate", "strong"]]),
      evidenceRow(2, "meridian", [[3, "line", "Bengal", "plausible"]]),
      evidenceRow(3, "sable", [[4, "color", "Firetruck", "weak"]]),
    ],
    [
      [[1, 3, 4], "plausible"],
      [[1, 2, 3], "weak"],
    ],
  );
  equal(
    evaluateCrossRoundInversion(relocated, RED_CODE, RED_LEDGER).outcome,
    "hard_veto",
    "[SHAPE] the same cells, relocated onto the supplied intended columns, hard-veto — placement sensitivity is real, but no population error rate is measured",
  );
}

// ---------------------------------------------------------------------------
// Code-match breadth of the rejected evidence-only clause.
// ---------------------------------------------------------------------------
function testEvidenceOnlyCodeMatchBreadth(): void {
  const strongSlots = [1, 2, 3];
  const matching = (threshold: number) =>
    LEGAL_CODE_TRIPLES.filter((code) => {
      let hits = 0;
      for (let index = 0; index < 3; index += 1)
        if (code[index] === strongSlots[index]) hits += 1;
      return hits >= threshold;
    }).length;

  equal(LEGAL_CODE_TRIPLES.length, 24, "there are 24 legal codes");
  const breadth =
    CROSS_ROUND_V03_BLUE_COUNTERFACTUALS_2026_08_02
      .evidenceOnlyCodeMatchBreadth;
  equal(
    matching(1),
    breadth.atLeastOneStrongEdge.codes,
    "a `>= 1 strong edge` clause matches 13 of 24 codes (54%)",
  );
  equal(
    matching(2),
    breadth.atLeastTwoStrongEdges.codes,
    "a `>= 2 strong edges` clause matches 4 of 24 codes (16.7%)",
  );
  equal(
    matching(3),
    breadth.atLeastThreeStrongEdges.codes,
    "a `>= 3 strong edges` clause matches 1 of 24 codes (4.2%)",
  );

  // The sharpened point: that 16.7% is a MAXIMUM over sparse replies, not a
  // bound. Density destroys the evidence layer's selectivity outright.
  const denseRows = [
    [1, 2],
    [2, 3],
    [3, 4],
  ];
  const dense = LEGAL_CODE_TRIPLES.filter((code) => {
    let hits = 0;
    for (let index = 0; index < 3; index += 1)
      if (denseRows[index]!.includes(code[index]!)) hits += 1;
    return hits >= 2;
  }).length;
  ok(
    dense > matching(2),
    "with two strong slots per clue the same clause matches far more codes — grid density inerts the evidence layer, so any redesign that makes the auditor more forthcoming per cell must re-measure breadth",
  );
}

// ---------------------------------------------------------------------------
// Evidence integrity: the committed report is the one the fixture describes.
// ---------------------------------------------------------------------------
function testPreservedReportIntegrity(): void {
  const path = "docs/evidence/cross-round-v03-live-20260802T041600Z.json";
  const rawReport = readFileSync(path, "utf8");
  const parsed = JSON.parse(rawReport) as {
    lineage: {
      reportContentHash: string;
      runner: { gitCommitSha: string | null };
    };
    summary: { releaseBoundarySatisfied: boolean };
    repeatCount: number;
    runs: Array<{
      caseId: string;
      ledger: PublicClueLedger;
      candidate: {
        clues: [string, string, string];
        intendedCode: [number, number, number];
      };
      audit: {
        historyMatches: CrossRoundClueAudit[];
        codeHypotheses: CrossRoundAuditorReply["codeHypotheses"];
        evaluation: { outcome: string };
      };
      route: { resolved: { usage: { reasoningTokens: number } } };
      usage: { latencyMs: number };
    }>;
  };
  const { reportContentHash, ...lineageRest } = parsed.lineage;
  const recomputed = contentHash({ ...parsed, lineage: lineageRest });
  equal(
    recomputed,
    reportContentHash,
    "the committed report's self-excluding content hash recomputes exactly",
  );
  equal(
    reportContentHash,
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.report.reportContentHash,
    "the fixture cites the hash of the report actually committed to the repo",
  );
  equal(
    sha256Hex(rawReport),
    "bd3ac86e0ee30fd8956d30fa86890c8b38f79b6af7b9878942d9a382856b1be6",
    "the committed report's exact file bytes match the recorded sha256",
  );
  equal(
    parsed.summary.releaseBoundarySatisfied,
    false,
    "the committed report records an UNSATISFIED release boundary",
  );
  equal(
    parsed.repeatCount,
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.repeatCount,
    "n = 1 per case; this cannot estimate repeat stability",
  );
  equal(
    parsed.lineage.runner.gitCommitSha,
    null,
    "the historical report truthfully records that its executing git commit was not captured",
  );
  ok(
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.report.exactReproducibility.startsWith(
      "not established",
    ),
    "the shared fixture does not overclaim exact provider-run reproducibility",
  );

  const expectedByCase = new Map<
    string,
    {
      reply: CrossRoundAuditorReply;
      code: readonly [number, number, number];
      ledger: PublicClueLedger;
    }
  >([
    [
      "red-production-incident-2026-08-01",
      { reply: LIVE_RED, code: RED_CODE, ledger: RED_LEDGER },
    ],
    [
      "blue-production-incident-2026-08-01",
      { reply: LIVE_BLUE, code: BLUE_CODE, ledger: BLUE_LEDGER },
    ],
    [
      "synthetic-opaque-negative-control",
      { reply: LIVE_CONTROL, code: RED_CODE, ledger: RED_LEDGER },
    ],
  ]);
  const fixtureByCase = new Map(
    CROSS_ROUND_V03_LIVE_BOUNDARY_2026_08_02.cases.map((item) => [
      item.caseId,
      item,
    ]),
  );
  equal(parsed.runs.length, 3, "the report contains exactly the three recorded calls");
  for (const run of parsed.runs) {
    const expected = expectedByCase.get(run.caseId);
    const fixture = fixtureByCase.get(run.caseId);
    ok(expected, `known report case ${run.caseId}`);
    ok(fixture, `shared fixture case ${run.caseId}`);

    deepEqual(
      run.audit.historyMatches,
      expected.reply.audits,
      `${run.caseId}: manually replayed evidence grid deeply matches the committed report`,
    );
    deepEqual(
      run.audit.codeHypotheses.map(({ code, support }) => ({ code, support })),
      expected.reply.codeHypotheses.map(({ code, support }) => ({
        code,
        support,
      })),
      `${run.caseId}: credible-set codes and support deeply match the committed report`,
    );
    deepEqual(
      run.candidate.clues,
      fixture.clues,
      `${run.caseId}: fixture clues deeply bind to the report candidate`,
    );
    deepEqual(
      run.candidate.intendedCode,
      fixture.intendedCode,
      `${run.caseId}: fixture intended code deeply binds to the report candidate`,
    );
    deepEqual(
      Object.fromEntries(
        run.ledger.map((column) => [column.number, [...column.clues]]),
      ),
      fixture.ledger,
      `${run.caseId}: fixture ledger deeply binds to the report input`,
    );
    deepEqual(
      run.audit.historyMatches.map((audit) => ({
        clue: audit.clue,
        edges: audit.historyMatches
          .filter((edge) => edge.strength !== "none")
          .map((edge) => [
            edge.number,
            edge.sharedReferent,
            edge.publicClue,
            edge.strength,
          ]),
      })),
      fixture.grid,
      `${run.caseId}: compact fixture grid is a lossless transcription of every non-none report cell`,
    );
    deepEqual(
      run.audit.codeHypotheses.map(({ code, support }) => [code, support]),
      fixture.codeHypotheses,
      `${run.caseId}: compact fixture credible set deeply binds to the report`,
    );
    equal(
      run.audit.evaluation.outcome,
      fixture.observedOutcome,
      `${run.caseId}: fixture outcome matches the report evaluation`,
    );
    equal(
      run.route.resolved.usage.reasoningTokens,
      fixture.reasoningTokens,
      `${run.caseId}: fixture reasoning-token count matches route evidence`,
    );
    equal(
      run.usage.latencyMs,
      fixture.latencyMs,
      `${run.caseId}: fixture latency matches the report`,
    );
  }
}

function main(): void {
  testLiveReplaysReproduceTheBoundary();
  testCounterfactualDecomposition();
  testNoThresholdCanReachBlue();
  testShapedInputPlacementSensitivity();
  testEvidenceOnlyCodeMatchBreadth();
  testPreservedReportIntegrity();
  console.log(
    `cross-round v0.3 postmortem: ${assertions} assertions passed\n` +
      "  BOUNDARY STATUS: FAILED (Blue passed where it must hard-veto). DO NOT RELEASE.",
  );
}

main();
