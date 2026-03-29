import { type User, type InsertUser, type Match, type InsertMatch, type MatchRound, type InsertMatchRound, type AiCallLog, type InsertAiCallLog, type Tournament, type InsertTournament, type TournamentMatch, type InsertTournamentMatch, type Experiment, type InsertExperiment, matches, matchRounds, aiCallLogs, tournaments, tournamentMatches, experiments } from "@shared/schema";
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
  getMatches(params: { page: number; limit: number; model?: string; winner?: string; dateFrom?: string; dateTo?: string }): Promise<{ matches: Match[]; total: number }>;
  getAllMatches(params?: { model?: string; strategy?: string; dateFrom?: string; dateTo?: string }): Promise<Match[]>;
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
    const [created] = await db.insert(matches).values(match).returning();
    return created;
  }

  async updateMatch(id: number, data: Partial<InsertMatch>): Promise<Match | undefined> {
    const [updated] = await db.update(matches).set(data).where(eq(matches.id, id)).returning();
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

  async getMatches(params: { page: number; limit: number; model?: string; winner?: string; dateFrom?: string; dateTo?: string }): Promise<{ matches: Match[]; total: number }> {
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

  async getAllMatches(params?: { model?: string; strategy?: string; dateFrom?: string; dateTo?: string }): Promise<Match[]> {
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
}

export const storage = new DatabaseStorage();
