import {
  type User,
  type InsertUser,
  type Match,
  type InsertMatch,
  type MatchRound,
  type InsertMatchRound,
  type AiCallLog,
  type InsertAiCallLog,
  type Tournament,
  type InsertTournament,
  type TournamentMatch,
  type InsertTournamentMatch,
  type Experiment,
  type InsertExperiment,
  type Series,
  type InsertSeries,
  type ScratchNote,
  type InsertScratchNote,
  type StrategyGenome,
  type InsertStrategyGenome,
  type EvolutionRun,
  type InsertEvolutionRun,
  type Generation,
  type InsertGeneration,
  type CoachRun,
  type InsertCoachRun,
  type CoachSprint,
  type InsertCoachSprint,
  type SprintEvaluationRecord,
  type InsertSprintEvaluationRecord,
  type AnchorEvaluationRecord,
  type InsertAnchorEvaluationRecord,
  type PatchIndex,
  type InsertPatchIndex,
  type PatchReviewRecord,
  type InsertPatchReviewRecord,
  type MetricYield,
  type InsertMetricYield,
  type TeamChatter,
  type InsertTeamChatter,
  matches,
  matchRounds,
  aiCallLogs,
  tournaments,
  tournamentMatches,
  experiments,
  series,
  scratchNotes,
  strategyGenomes,
  evolutionRuns,
  generations,
  coachRuns,
  coachSprints,
  sprintEvaluations,
  anchorEvaluations,
  patchIndex,
  patchReviews,
  metricYield,
  teamChatter,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, like, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createMatch(match: InsertMatch): Promise<Match>;
  updateMatch(id: number, data: Partial<InsertMatch>): Promise<Match | undefined>;
  getMatch(id: number): Promise<Match | undefined>;
  getMatchByGameId(gameId: string): Promise<Match | undefined>;
  getMatches(params: { page: number; limit: number; model?: string; winner?: string; dateFrom?: string; dateTo?: string; experimentId?: string }): Promise<{ matches: Match[]; total: number }>;
  getAllMatches(params?: { model?: string; strategy?: string; dateFrom?: string; dateTo?: string; experimentId?: string }): Promise<Match[]>;
  getMatchesByIds(ids: number[]): Promise<Match[]>;

  createMatchRound(round: InsertMatchRound): Promise<MatchRound>;
  getMatchRounds(matchId: number): Promise<MatchRound[]>;
  getMatchRoundsForMatches(matchIds: number[]): Promise<MatchRound[]>;

  createAiCallLog(log: InsertAiCallLog): Promise<AiCallLog>;
  getAiCallLogs(matchId: number): Promise<AiCallLog[]>;
  getAllAiCallLogs(matchIds?: number[]): Promise<AiCallLog[]>;

  createTournament(data: InsertTournament): Promise<Tournament>;
  updateTournament(id: number, data: Partial<InsertTournament>): Promise<Tournament | undefined>;
  getTournament(id: number): Promise<Tournament | undefined>;
  getTournaments(): Promise<Tournament[]>;

  createTournamentMatch(data: InsertTournamentMatch): Promise<TournamentMatch>;
  updateTournamentMatch(id: number, data: Partial<InsertTournamentMatch>): Promise<TournamentMatch | undefined>;
  getTournamentMatches(tournamentId: number): Promise<TournamentMatch[]>;

  createExperiment(experiment: InsertExperiment): Promise<Experiment>;
  getExperiment(id: number): Promise<Experiment | undefined>;
  getExperiments(): Promise<Experiment[]>;
  updateExperiment(id: number, data: Partial<InsertExperiment>): Promise<Experiment | undefined>;

  createSeries(data: InsertSeries): Promise<Series>;
  updateSeries(id: number, data: Partial<InsertSeries>): Promise<Series | undefined>;
  getSeries(id: number): Promise<Series | undefined>;
  getAllSeries(): Promise<Series[]>;

  createScratchNote(note: InsertScratchNote): Promise<ScratchNote>;
  getScratchNotes(seriesId: number): Promise<ScratchNote[]>;
  getLatestScratchNote(seriesId: number, playerConfigHash: string): Promise<ScratchNote | undefined>;
  getScratchNotesForPlayer(seriesId: number, playerConfigHash: string): Promise<ScratchNote[]>;

  createEvolutionRun(data: InsertEvolutionRun): Promise<EvolutionRun>;
  updateEvolutionRun(id: number, data: Partial<InsertEvolutionRun>): Promise<EvolutionRun | undefined>;
  getEvolutionRun(id: number): Promise<EvolutionRun | undefined>;
  getEvolutionRuns(): Promise<EvolutionRun[]>;

  createGeneration(data: InsertGeneration): Promise<Generation>;
  updateGeneration(id: number, data: Partial<InsertGeneration>): Promise<Generation | undefined>;
  getGenerations(evolutionRunId: number): Promise<Generation[]>;
  getGeneration(evolutionRunId: number, generationNumber: number): Promise<Generation | undefined>;

  createCoachRun(run: InsertCoachRun): Promise<CoachRun>;
  updateCoachRun(id: string, fields: Partial<InsertCoachRun>): Promise<CoachRun | undefined>;
  getCoachRun(id: string): Promise<CoachRun | undefined>;
  listCoachRuns(): Promise<CoachRun[]>;
  getCoachRunsByArenaId(arenaId: string): Promise<CoachRun[]>;

  createCoachSprint(sprint: InsertCoachSprint): Promise<CoachSprint>;
  getCoachSprints(runId: string): Promise<CoachSprint[]>;
  createSprintEvaluation(entry: InsertSprintEvaluationRecord): Promise<SprintEvaluationRecord>;
  getSprintEvaluation(runId: string, sprintNumber: number): Promise<SprintEvaluationRecord | undefined>;
  getSprintEvaluations(runId: string): Promise<SprintEvaluationRecord[]>;
  createAnchorEvaluation(entry: InsertAnchorEvaluationRecord): Promise<AnchorEvaluationRecord>;
  getAnchorEvaluations(runId: string, sprintNumber?: number): Promise<AnchorEvaluationRecord[]>;
  createPatchIndexEntry(entry: InsertPatchIndex): Promise<PatchIndex>;
  getPatchHistory(runId: string): Promise<PatchIndex[]>;
  createPatchReview(entry: InsertPatchReviewRecord): Promise<PatchReviewRecord>;
  getPatchReviews(runId: string): Promise<PatchReviewRecord[]>;
  getPendingPatchReviews(runId: string): Promise<PatchIndex[]>;
  upsertMetricYield(entry: InsertMetricYield): Promise<MetricYield>;
  getMetricYields(arenaId: string): Promise<MetricYield[]>;

  createStrategyGenome(data: InsertStrategyGenome): Promise<StrategyGenome>;
  updateStrategyGenome(id: number, data: Partial<InsertStrategyGenome>): Promise<StrategyGenome | undefined>;
  getStrategyGenomes(evolutionRunId: number, generationNumber?: number): Promise<StrategyGenome[]>;
  getStrategyGenome(id: number): Promise<StrategyGenome | undefined>;
  getTopGenomes(evolutionRunId: number, generationNumber: number, limit: number): Promise<StrategyGenome[]>;

  createTeamChatter(entry: InsertTeamChatter): Promise<TeamChatter>;
  getTeamChatter(matchId: number): Promise<TeamChatter[]>;
  getTeamChatterByRound(matchId: number, roundNumber: number): Promise<TeamChatter[]>;
  getTeamChatterForMatches(matchIds: number[]): Promise<TeamChatter[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const { users } = await import("@shared/schema");
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { users } = await import("@shared/schema");
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const { users } = await import("@shared/schema");
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createMatch(match: InsertMatch): Promise<Match> {
    const [created] = await db.insert(matches).values(match as typeof matches.$inferInsert).returning();
    return created;
  }

  async updateMatch(id: number, data: Partial<InsertMatch>): Promise<Match | undefined> {
    const [updated] = await db.update(matches).set(data as Partial<typeof matches.$inferInsert>).where(eq(matches.id, id)).returning();
    return updated;
  }

  async getMatch(id: number): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
    return match;
  }

  async getMatchByGameId(gameId: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.gameId, gameId)).orderBy(desc(matches.createdAt)).limit(1);
    return match;
  }

  async getMatches(params: { page: number; limit: number; model?: string; winner?: string; dateFrom?: string; dateTo?: string; experimentId?: string }): Promise<{ matches: Match[]; total: number }> {
    const conditions = [];

    if (params.winner) {
      conditions.push(eq(matches.winner, params.winner));
    }

    if (params.dateFrom) {
      conditions.push(sql`${matches.createdAt} >= ${params.dateFrom}::timestamp`);
    }

    if (params.dateTo) {
      conditions.push(sql`${matches.createdAt} <= ${params.dateTo}::timestamp`);
    }

    if (params.experimentId) {
      conditions.push(eq(matches.experimentId, params.experimentId));
    }

    if (params.model) {
      conditions.push(
        sql`(${matches.playerConfigs}::text ILIKE ${'%' + params.model + '%'}
          OR ${matches.id} IN (
            SELECT DISTINCT ${aiCallLogs.matchId} FROM ${aiCallLogs}
            WHERE ${aiCallLogs.matchId} IS NOT NULL
            AND (${aiCallLogs.model} ILIKE ${'%' + params.model + '%'}
              OR ${aiCallLogs.provider} ILIKE ${'%' + params.model + '%'})
          ))`
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(matches).where(where);
    const total = Number(countResult.count);

    const offset = (params.page - 1) * params.limit;
    const results = await db.select().from(matches).where(where).orderBy(desc(matches.createdAt)).limit(params.limit).offset(offset);

    return { matches: results, total };
  }

  async createMatchRound(round: InsertMatchRound): Promise<MatchRound> {
    const [created] = await db.insert(matchRounds).values(round).returning();
    return created;
  }

  async getMatchRounds(matchId: number): Promise<MatchRound[]> {
    return db.select().from(matchRounds).where(eq(matchRounds.matchId, matchId)).orderBy(matchRounds.roundNumber, matchRounds.team);
  }

  async createAiCallLog(logEntry: InsertAiCallLog): Promise<AiCallLog> {
    const [created] = await db.insert(aiCallLogs).values(logEntry).returning();
    return created;
  }

  async getAiCallLogs(matchId: number): Promise<AiCallLog[]> {
    return db.select().from(aiCallLogs).where(eq(aiCallLogs.matchId, matchId)).orderBy(aiCallLogs.createdAt);
  }

  async getAllAiCallLogs(matchIds?: number[]): Promise<AiCallLog[]> {
    if (matchIds && matchIds.length === 0) return [];
    const where = matchIds ? inArray(aiCallLogs.matchId, matchIds) : undefined;
    return db.select().from(aiCallLogs).where(where).orderBy(aiCallLogs.createdAt);
  }

  async getMatchIdsWithTraces(matchIds: number[]): Promise<Set<number>> {
    if (matchIds.length === 0) return new Set();
    const rows = await db.selectDistinct({ matchId: aiCallLogs.matchId })
      .from(aiCallLogs)
      .where(and(
        inArray(aiCallLogs.matchId, matchIds),
        sql`${aiCallLogs.reasoningTrace} IS NOT NULL`
      ));
    return new Set(rows.map(r => r.matchId).filter((id): id is number => id !== null));
  }

  async getCumulativeCost(matchIds: number[]): Promise<number> {
    if (matchIds.length === 0) return 0;
    const logs = await db.select({ cost: aiCallLogs.estimatedCostUsd }).from(aiCallLogs).where(inArray(aiCallLogs.matchId, matchIds));
    return logs.reduce((sum, l) => sum + (l.cost ? parseFloat(l.cost) : 0), 0);
  }

  async createTournament(data: InsertTournament): Promise<Tournament> {
    const [created] = await db.insert(tournaments).values(data).returning();
    return created;
  }

  async updateTournament(id: number, data: Partial<InsertTournament>): Promise<Tournament | undefined> {
    const [updated] = await db.update(tournaments).set(data).where(eq(tournaments.id, id)).returning();
    return updated;
  }

  async getTournament(id: number): Promise<Tournament | undefined> {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
    return tournament;
  }

  async getTournaments(): Promise<Tournament[]> {
    return db.select().from(tournaments).orderBy(desc(tournaments.createdAt));
  }

  async createTournamentMatch(data: InsertTournamentMatch): Promise<TournamentMatch> {
    const [created] = await db.insert(tournamentMatches).values(data).returning();
    return created;
  }

  async updateTournamentMatch(id: number, data: Partial<InsertTournamentMatch>): Promise<TournamentMatch | undefined> {
    const [updated] = await db.update(tournamentMatches).set(data).where(eq(tournamentMatches.id, id)).returning();
    return updated;
  }

  async getTournamentMatches(tournamentId: number): Promise<TournamentMatch[]> {
    return db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId)).orderBy(tournamentMatches.matchIndex);
  }

  async getAllMatches(params?: { model?: string; strategy?: string; dateFrom?: string; dateTo?: string; experimentId?: string }): Promise<Match[]> {
    const conditions = [];
    if (params?.model) {
      conditions.push(
        sql`${matches.playerConfigs}::text ILIKE ${'%' + params.model + '%'}`
      );
    }
    if (params?.strategy) {
      conditions.push(
        sql`${matches.playerConfigs}::text ILIKE ${'%' + params.strategy + '%'}`
      );
    }
    if (params?.dateFrom) {
      conditions.push(sql`${matches.createdAt} >= ${params.dateFrom}::timestamp`);
    }
    if (params?.dateTo) {
      conditions.push(sql`${matches.createdAt} <= ${params.dateTo}::timestamp`);
    }
    if (params?.experimentId) {
      conditions.push(eq(matches.experimentId, params.experimentId));
    }
    conditions.push(sql`${matches.winner} IS NOT NULL`);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(matches).where(where).orderBy(desc(matches.createdAt));
  }

  async getMatchesByIds(ids: number[]): Promise<Match[]> {
    if (ids.length === 0) return [];
    return db.select().from(matches).where(inArray(matches.id, ids));
  }

  async getMatchRoundsForMatches(matchIds: number[]): Promise<MatchRound[]> {
    if (matchIds.length === 0) return [];
    return db.select().from(matchRounds).where(inArray(matchRounds.matchId, matchIds)).orderBy(matchRounds.roundNumber, matchRounds.team);
  }

  async createExperiment(experiment: InsertExperiment): Promise<Experiment> {
    const [created] = await db.insert(experiments).values(experiment).returning();
    return created;
  }

  async getExperiment(id: number): Promise<Experiment | undefined> {
    const [exp] = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);
    return exp;
  }

  async getExperiments(): Promise<Experiment[]> {
    return db.select().from(experiments).orderBy(desc(experiments.createdAt));
  }

  async updateExperiment(id: number, data: Partial<InsertExperiment>): Promise<Experiment | undefined> {
    const [updated] = await db.update(experiments).set(data).where(eq(experiments.id, id)).returning();
    return updated;
  }

  async createSeries(data: InsertSeries): Promise<Series> {
    const [created] = await db.insert(series).values(data).returning();
    return created;
  }

  async updateSeries(id: number, data: Partial<InsertSeries>): Promise<Series | undefined> {
    const [updated] = await db.update(series).set(data).where(eq(series.id, id)).returning();
    return updated;
  }

  async getSeries(id: number): Promise<Series | undefined> {
    const [s] = await db.select().from(series).where(eq(series.id, id)).limit(1);
    return s;
  }

  async getAllSeries(): Promise<Series[]> {
    return db.select().from(series).orderBy(desc(series.createdAt));
  }

  async createScratchNote(note: InsertScratchNote): Promise<ScratchNote> {
    const [created] = await db.insert(scratchNotes).values(note).returning();
    return created;
  }

  async getScratchNotes(seriesId: number): Promise<ScratchNote[]> {
    return db.select().from(scratchNotes).where(eq(scratchNotes.seriesId, seriesId)).orderBy(scratchNotes.gameIndex);
  }

  async getLatestScratchNote(seriesId: number, playerConfigHash: string): Promise<ScratchNote | undefined> {
    const [note] = await db.select().from(scratchNotes)
      .where(and(eq(scratchNotes.seriesId, seriesId), eq(scratchNotes.playerConfigHash, playerConfigHash)))
      .orderBy(desc(scratchNotes.gameIndex))
      .limit(1);
    return note;
  }

  async getScratchNotesForPlayer(seriesId: number, playerConfigHash: string): Promise<ScratchNote[]> {
    return db.select().from(scratchNotes)
      .where(and(eq(scratchNotes.seriesId, seriesId), eq(scratchNotes.playerConfigHash, playerConfigHash)))
      .orderBy(scratchNotes.gameIndex);
  }

  async createEvolutionRun(data: InsertEvolutionRun): Promise<EvolutionRun> {
    const [created] = await db.insert(evolutionRuns).values(data).returning();
    return created;
  }

  async updateEvolutionRun(id: number, data: Partial<InsertEvolutionRun>): Promise<EvolutionRun | undefined> {
    const [updated] = await db.update(evolutionRuns).set(data).where(eq(evolutionRuns.id, id)).returning();
    return updated;
  }

  async getEvolutionRun(id: number): Promise<EvolutionRun | undefined> {
    const [run] = await db.select().from(evolutionRuns).where(eq(evolutionRuns.id, id)).limit(1);
    return run;
  }

  async getEvolutionRuns(): Promise<EvolutionRun[]> {
    return db.select().from(evolutionRuns).orderBy(desc(evolutionRuns.createdAt));
  }

  async createGeneration(data: InsertGeneration): Promise<Generation> {
    const [created] = await db.insert(generations).values(data).returning();
    return created;
  }

  async updateGeneration(id: number, data: Partial<InsertGeneration>): Promise<Generation | undefined> {
    const [updated] = await db.update(generations).set(data).where(eq(generations.id, id)).returning();
    return updated;
  }

  async getGenerations(evolutionRunId: number): Promise<Generation[]> {
    return db.select().from(generations)
      .where(eq(generations.evolutionRunId, evolutionRunId))
      .orderBy(generations.generationNumber);
  }

  async getGeneration(evolutionRunId: number, generationNumber: number): Promise<Generation | undefined> {
    const [gen] = await db.select().from(generations)
      .where(and(eq(generations.evolutionRunId, evolutionRunId), eq(generations.generationNumber, generationNumber)))
      .limit(1);
    return gen;
  }

  async createCoachRun(run: InsertCoachRun): Promise<CoachRun> {
    const [created] = await db.insert(coachRuns).values(run as typeof coachRuns.$inferInsert).returning();
    return created;
  }

  async updateCoachRun(id: string, fields: Partial<InsertCoachRun>): Promise<CoachRun | undefined> {
    const [updated] = await db.update(coachRuns).set(fields as Partial<typeof coachRuns.$inferInsert>).where(eq(coachRuns.id, id)).returning();
    return updated;
  }

  async getCoachRun(id: string): Promise<CoachRun | undefined> {
    const [run] = await db.select().from(coachRuns).where(eq(coachRuns.id, id)).limit(1);
    return run;
  }

  async listCoachRuns(): Promise<CoachRun[]> {
    return db.select().from(coachRuns).orderBy(desc(coachRuns.createdAt));
  }

  async getCoachRunsByArenaId(arenaId: string): Promise<CoachRun[]> {
    return db.select().from(coachRuns)
      .where(eq(coachRuns.arenaId, arenaId))
      .orderBy(coachRuns.createdAt, coachRuns.id);
  }

  async createCoachSprint(sprint: InsertCoachSprint): Promise<CoachSprint> {
    const [created] = await db.insert(coachSprints).values(sprint as typeof coachSprints.$inferInsert).returning();
    return created;
  }

  async getCoachSprints(runId: string): Promise<CoachSprint[]> {
    return db.select().from(coachSprints)
      .where(eq(coachSprints.runId, runId))
      .orderBy(coachSprints.sprintNumber);
  }

  async createSprintEvaluation(entry: InsertSprintEvaluationRecord): Promise<SprintEvaluationRecord> {
    const [created] = await db.insert(sprintEvaluations).values(entry as typeof sprintEvaluations.$inferInsert).returning();
    return created;
  }

  async getSprintEvaluation(runId: string, sprintNumber: number): Promise<SprintEvaluationRecord | undefined> {
    const [evaluation] = await db.select().from(sprintEvaluations)
      .where(and(
        eq(sprintEvaluations.runId, runId),
        eq(sprintEvaluations.sprintNumber, sprintNumber),
      ))
      .limit(1);
    return evaluation;
  }

  async getSprintEvaluations(runId: string): Promise<SprintEvaluationRecord[]> {
    return db.select().from(sprintEvaluations)
      .where(eq(sprintEvaluations.runId, runId))
      .orderBy(sprintEvaluations.sprintNumber, sprintEvaluations.createdAt, sprintEvaluations.id);
  }

  async createAnchorEvaluation(entry: InsertAnchorEvaluationRecord): Promise<AnchorEvaluationRecord> {
    const [created] = await db.insert(anchorEvaluations).values(entry as typeof anchorEvaluations.$inferInsert).returning();
    return created;
  }

  async getAnchorEvaluations(runId: string, sprintNumber?: number): Promise<AnchorEvaluationRecord[]> {
    const conditions = [eq(anchorEvaluations.runId, runId)];
    if (sprintNumber !== undefined) {
      conditions.push(eq(anchorEvaluations.sprintNumber, sprintNumber));
    }

    return db.select().from(anchorEvaluations)
      .where(and(...conditions))
      .orderBy(anchorEvaluations.sprintNumber, anchorEvaluations.anchorLabel, anchorEvaluations.variant, anchorEvaluations.createdAt, anchorEvaluations.id);
  }

  async createPatchIndexEntry(entry: InsertPatchIndex): Promise<PatchIndex> {
    const [created] = await db.insert(patchIndex).values(entry as typeof patchIndex.$inferInsert).returning();
    return created;
  }

  async getPatchHistory(runId: string): Promise<PatchIndex[]> {
    return db.select().from(patchIndex)
      .where(eq(patchIndex.runId, runId))
      .orderBy(patchIndex.sprintNumber, patchIndex.createdAt, patchIndex.id);
  }

  async createPatchReview(entry: InsertPatchReviewRecord): Promise<PatchReviewRecord> {
    const [created] = await db.insert(patchReviews).values(entry as typeof patchReviews.$inferInsert).returning();
    return created;
  }

  async getPatchReviews(runId: string): Promise<PatchReviewRecord[]> {
    return db.select().from(patchReviews)
      .where(eq(patchReviews.runId, runId))
      .orderBy(patchReviews.reviewSprint, patchReviews.committedSprint, patchReviews.createdAt, patchReviews.id);
  }

  async getPendingPatchReviews(runId: string): Promise<PatchIndex[]> {
    return db.select().from(patchIndex)
      .where(and(
        eq(patchIndex.runId, runId),
        sql`${patchIndex.reviewDueSprint} IS NOT NULL`,
        sql`${patchIndex.reviewStatus} IS NULL`,
      ))
      .orderBy(patchIndex.reviewDueSprint, patchIndex.sprintNumber, patchIndex.createdAt, patchIndex.id);
  }

  async upsertMetricYield(entry: InsertMetricYield): Promise<MetricYield> {
    const [existing] = await db.select().from(metricYield)
      .where(and(
        eq(metricYield.arenaId, entry.arenaId),
        eq(metricYield.metricKey, entry.metricKey),
      ))
      .limit(1);

    if (!existing) {
      const [created] = await db.insert(metricYield)
        .values(entry as typeof metricYield.$inferInsert)
        .returning();
      return created;
    }

    const [updated] = await db.update(metricYield)
      .set({
        ...entry,
        updatedAt: new Date(),
      } as Partial<typeof metricYield.$inferInsert>)
      .where(eq(metricYield.id, existing.id))
      .returning();
    return updated;
  }

  async getMetricYields(arenaId: string): Promise<MetricYield[]> {
    return db.select().from(metricYield)
      .where(eq(metricYield.arenaId, arenaId))
      .orderBy(metricYield.metricKey, metricYield.id);
  }

  async createStrategyGenome(data: InsertStrategyGenome): Promise<StrategyGenome> {
    const [created] = await db.insert(strategyGenomes).values(data).returning();
    return created;
  }

  async updateStrategyGenome(id: number, data: Partial<InsertStrategyGenome>): Promise<StrategyGenome | undefined> {
    const [updated] = await db.update(strategyGenomes).set(data).where(eq(strategyGenomes.id, id)).returning();
    return updated;
  }

  async getStrategyGenomes(evolutionRunId: number, generationNumber?: number): Promise<StrategyGenome[]> {
    const conditions = [eq(strategyGenomes.evolutionRunId, evolutionRunId)];
    if (generationNumber !== undefined) {
      conditions.push(eq(strategyGenomes.generationNumber, generationNumber));
    }
    return db.select().from(strategyGenomes)
      .where(and(...conditions))
      .orderBy(desc(strategyGenomes.eloRating));
  }

  async getStrategyGenome(id: number): Promise<StrategyGenome | undefined> {
    const [genome] = await db.select().from(strategyGenomes).where(eq(strategyGenomes.id, id)).limit(1);
    return genome;
  }

  async getTopGenomes(evolutionRunId: number, generationNumber: number, limit: number): Promise<StrategyGenome[]> {
    return db.select().from(strategyGenomes)
      .where(and(eq(strategyGenomes.evolutionRunId, evolutionRunId), eq(strategyGenomes.generationNumber, generationNumber)))
      .orderBy(desc(strategyGenomes.eloRating))
      .limit(limit);
  }

  async createTeamChatter(entry: InsertTeamChatter): Promise<TeamChatter> {
    const [created] = await db.insert(teamChatter).values(entry).returning();
    return created;
  }

  async getTeamChatter(matchId: number): Promise<TeamChatter[]> {
    return db.select().from(teamChatter)
      .where(eq(teamChatter.matchId, matchId))
      .orderBy(teamChatter.roundNumber, teamChatter.team, teamChatter.phase);
  }

  async getTeamChatterByRound(matchId: number, roundNumber: number): Promise<TeamChatter[]> {
    return db.select().from(teamChatter)
      .where(and(
        eq(teamChatter.matchId, matchId),
        eq(teamChatter.roundNumber, roundNumber),
      ))
      .orderBy(teamChatter.team, teamChatter.phase);
  }

  async getTeamChatterForMatches(matchIds: number[]): Promise<TeamChatter[]> {
    if (matchIds.length === 0) return [];
    return db.select().from(teamChatter)
      .where(inArray(teamChatter.matchId, matchIds))
      .orderBy(teamChatter.matchId, teamChatter.roundNumber, teamChatter.team, teamChatter.phase);
  }
}

export const storage = new DatabaseStorage();
