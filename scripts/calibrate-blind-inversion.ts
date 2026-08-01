/**
 * Read-only calibration probe for blind-inversion@0.1.
 *
 * It compares the six known-transparent Table clues with a deterministic
 * sample of Herpetarium clue triples that teammates decoded and opponents did
 * not intercept. Those historical outcomes are controls, not ground-truth
 * labels of clue quality; the report preserves that limitation.
 *
 * Required environment: DATABASE_URL, OPENROUTER_API_KEY.
 */
import pg from "pg";
import {
  BASELINE_GAME_CLUES,
  BASELINE_INVERSION_PROBE,
} from "../shared/substrate/index";
import {
  auditBlindClues,
  evaluateBlindInversion,
} from "../server/blindInversion";

interface ControlRow {
  match_id: number;
  round_id: number;
  round_number: number;
  team: "amber" | "blue";
  code: number[];
  clues: string[];
  amber_keywords: string[];
  blue_keywords: string[];
}

function numericArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} requires a positive number`);
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const triples = Math.floor(numericArg("--triples", 8));
  const threshold = numericArg(
    "--threshold",
    BASELINE_INVERSION_PROBE.provisionalFlagThreshold,
  );
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  let rows: ControlRow[];
  try {
    const result = await pool.query<ControlRow>(
      `
        SELECT
          mr.match_id,
          mr.id AS round_id,
          mr.round_number,
          mr.team,
          mr.code,
          mr.clues,
          m.amber_keywords,
          m.blue_keywords
        FROM match_rounds mr
        JOIN matches m ON m.id = mr.match_id
        WHERE m.completed_at IS NOT NULL
          AND m.quality_status = 'clean'
          AND mr.own_correct = TRUE
          AND mr.intercepted = FALSE
          AND NOT EXISTS (
            SELECT 1
            FROM ai_call_logs call
            WHERE call.match_id = mr.match_id
              AND call.round_number = mr.round_number
              AND call.action_type = 'generate_clues'
              AND (
                call.used_fallback = TRUE
                OR call.timed_out = TRUE
                OR call.error IS NOT NULL
                OR call.parse_quality IS DISTINCT FROM 'clean'
              )
          )
        ORDER BY md5(
          mr.match_id::text || ':' || mr.id::text ||
          ':blind-inversion-v0.1-controls'
        )
        LIMIT $1
      `,
      [triples],
    );
    rows = result.rows;
  } finally {
    await pool.end();
  }
  if (rows.length < triples) {
    throw new Error(`Requested ${triples} control triples; found ${rows.length}`);
  }

  const controls = rows.flatMap((row) => {
    const keywords =
      row.team === "amber" ? row.amber_keywords : row.blue_keywords;
    return row.clues.map((clue, index) => ({
      matchId: row.match_id,
      roundId: row.round_id,
      roundNumber: row.round_number,
      team: row.team,
      clue,
      target: keywords[row.code[index] - 1],
    }));
  });
  const baseline = BASELINE_GAME_CLUES.map((record) => ({
    clue: record.clue,
    target: record.targetKeyword,
  }));
  const items = [...baseline, ...controls];
  const run = await auditBlindClues(items.map((item) => item.clue));
  const evaluated = evaluateBlindInversion(
    run.audits,
    items.map((item) => item.target),
    threshold,
  );
  const baselineEvaluations = evaluated.slice(0, baseline.length);
  const controlEvaluations = evaluated.slice(baseline.length);

  const report = {
    protocolVersion: run.protocolVersion,
    status: "calibration_probe",
    limitation:
      "Controls are historical own-decode/no-intercept outcomes, not human adjudications of clue quality; this probe does not establish a production threshold.",
    threshold,
    route: {
      requested: run.modelRequested,
      resolved: run.providerMetadata,
    },
    usage: run.usage,
    baseline: {
      count: baselineEvaluations.length,
      flagged: baselineEvaluations.filter((item) => item.flag).length,
      hardVeto: baselineEvaluations.filter((item) => item.hardVeto).length,
      softRegenerateOnce: baselineEvaluations.filter(
        (item) => item.softRegenerateOnce,
      ).length,
      passed: baselineEvaluations.filter((item) => item.outcome === "pass")
        .length,
      recovered: baselineEvaluations.filter((item) => item.recovered).length,
      items: baseline.map((item, index) => ({
        ...item,
        audit: run.audits[index],
        evaluation: baselineEvaluations[index],
      })),
    },
    controls: {
      sourceTripleCount: rows.length,
      clueCount: controlEvaluations.length,
      flagged: controlEvaluations.filter((item) => item.flag).length,
      hardVeto: controlEvaluations.filter((item) => item.hardVeto).length,
      softRegenerateOnce: controlEvaluations.filter(
        (item) => item.softRegenerateOnce,
      ).length,
      passed: controlEvaluations.filter((item) => item.outcome === "pass")
        .length,
      recovered: controlEvaluations.filter((item) => item.recovered).length,
      proxyFalsePositiveRate:
        controlEvaluations.filter((item) => item.flag).length /
        controlEvaluations.length,
      items: controls.map((item, index) => ({
        ...item,
        audit: run.audits[baseline.length + index],
        evaluation: controlEvaluations[index],
      })),
    },
  };
  console.log(JSON.stringify(report, null, 2));
}

void main();
