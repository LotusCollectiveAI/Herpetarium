/**
 * Bradley-Terry model for pairwise comparison.
 *
 * Given a set of match results (winner/loser pairs), estimates
 * the strength parameter for each player using iterative MM algorithm.
 *
 * Reference: Hunter (2004), "MM algorithms for generalized Bradley-Terry models"
 */

export interface BradleyTerryResult {
  ratings: Map<string, number>;
  iterations: number;
  converged: boolean;
}

interface MatchResult {
  winner: string;
  loser: string;
}

/**
 * Estimate Bradley-Terry strength parameters from pairwise match outcomes.
 *
 * @param matchResults - Array of {winner, loser} pairs
 * @param options.maxIter - Maximum iterations (default 100)
 * @param options.tol - Convergence tolerance (default 1e-6)
 * @param options.initialRating - Starting rating for all players (default 1.0)
 * @returns Map of player ID -> strength parameter (higher = stronger)
 */
export function bradleyTerryRatings(
  matchResults: MatchResult[],
  options?: { maxIter?: number; tol?: number; initialRating?: number }
): BradleyTerryResult {
  const maxIter = options?.maxIter ?? 100;
  const tol = options?.tol ?? 1e-6;
  const initialRating = options?.initialRating ?? 1.0;

  // Collect all players
  const players = new Set<string>();
  for (const r of matchResults) {
    players.add(r.winner);
    players.add(r.loser);
  }

  if (players.size < 2) {
    const ratings = new Map<string, number>();
    for (const p of players) ratings.set(p, initialRating);
    return { ratings, iterations: 0, converged: true };
  }

  // Initialize ratings
  const ratings = new Map<string, number>();
  for (const p of players) ratings.set(p, initialRating);

  // Count wins for each player
  const wins = new Map<string, number>();
  for (const p of players) wins.set(p, 0);
  for (const r of matchResults) {
    wins.set(r.winner, (wins.get(r.winner) || 0) + 1);
  }

  // Build pairwise encounter counts
  const encounters = new Map<string, Map<string, number>>();
  for (const r of matchResults) {
    const key = [r.winner, r.loser].sort().join("|");
    const [a, b] = key.split("|");
    if (!encounters.has(a)) encounters.set(a, new Map());
    if (!encounters.has(b)) encounters.set(b, new Map());
    encounters.get(a)!.set(b, (encounters.get(a)!.get(b) || 0) + 1);
    encounters.get(b)!.set(a, (encounters.get(b)!.get(a) || 0) + 1);
  }

  // Iterative MM algorithm
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;

    for (const i of players) {
      const wi = wins.get(i) || 0;
      if (wi === 0) continue; // Player with 0 wins stays at minimum

      let denomSum = 0;
      const iEncounters = encounters.get(i);
      if (!iEncounters) continue;

      for (const [j, nij] of iEncounters) {
        const rj = ratings.get(j) || initialRating;
        const ri = ratings.get(i) || initialRating;
        denomSum += nij / (ri + rj);
      }

      if (denomSum === 0) continue;

      const newRating = wi / denomSum;
      const oldRating = ratings.get(i) || initialRating;
      maxChange = Math.max(maxChange, Math.abs(newRating - oldRating));
      ratings.set(i, newRating);
    }

    if (maxChange < tol) {
      converged = true;
      break;
    }
  }

  // Normalize so ratings sum to number of players (cosmetic)
  const sum = Array.from(ratings.values()).reduce((s, v) => s + v, 0);
  const scale = players.size / sum;
  for (const [p, r] of ratings) {
    ratings.set(p, r * scale);
  }

  return { ratings, iterations: iter, converged };
}

/**
 * Convert Bradley-Terry strength parameters to win probabilities.
 */
export function btWinProbability(ratingA: number, ratingB: number): number {
  return ratingA / (ratingA + ratingB);
}
