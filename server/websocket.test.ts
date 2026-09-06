import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import { WebSocket } from "ws";
import type { GameState, ServerMessage } from "@shared/schema";

// Persistence, logging and the AI providers are all replaced, so the test
// exercises the socket layer itself: which payload each connection is
// handed. The redaction function is covered separately in
// redactGameState.test.ts -- what matters here is the fan-out around it.
vi.mock("./index", () => ({ log: () => {} }));
vi.mock("./matchEvents", () => ({
  emitMatchEvent: async () => {},
  clearMatchEventSequence: () => {},
}));
// Creating the match row is a real database round-trip in production, and
// the window it opens is what the duplicate-match test needs, so its
// duration is adjustable here too.
let createMatchLatencyMs = 0;
let nextMatchId = 1;
const createMatch = vi.fn(async () => {
  if (createMatchLatencyMs > 0) await new Promise(r => setTimeout(r, createMatchLatencyMs));
  return { id: nextMatchId++ };
});
vi.mock("./storage", () => ({
  storage: {
    createMatch: (...args: unknown[]) => createMatch(...(args as [])),
    createAiCallLog: async () => {},
    createMatchRound: async () => {},
    updateMatch: async () => {},
  },
}));

// Real provider calls take seconds; the concurrency test needs a call to
// still be in flight when a second dispatch lands, so its duration is
// adjustable rather than instant.
let clueLatencyMs = 0;
const generateClues = vi.fn(async () => {
  if (clueLatencyMs > 0) await new Promise(r => setTimeout(r, clueLatencyMs));
  return {
    result: ["alpha", "beta", "gamma"],
    prompt: "", rawResponse: "", model: "fake", latencyMs: clueLatencyMs,
  };
});
vi.mock("./ai", () => ({
  generateClues: (...args: unknown[]) => generateClues(...(args as [])),
  generateGuess: async () => ({ result: [1, 2, 3], prompt: "", rawResponse: "", model: "fake", latencyMs: 1 }),
  generateInterception: async () => ({ result: [1, 2, 3], prompt: "", rawResponse: "", model: "fake", latencyMs: 1 }),
  withAICallTimeout: async (_ms: number, promise: Promise<unknown>) => ({ result: await promise, timedOut: false }),
}));

const { setupWebSocket } = await import("./websocket");

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer();
  setupWebSocket(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  // Sockets a test left open (or that a failing test never reached its
  // close) would otherwise keep server.close() waiting forever.
  server.closeAllConnections?.();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

// A connection that records every server message it is handed, so a test
// can assert on what this particular socket saw.
class Client {
  ws: WebSocket;
  received: ServerMessage[] = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", raw => this.received.push(JSON.parse(raw.toString())));
  }

  static async connect(): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return new Client(ws);
  }

  send(message: unknown) {
    this.ws.send(JSON.stringify(message));
  }

  latestState(): GameState | undefined {
    for (let i = this.received.length - 1; i >= 0; i--) {
      const m = this.received[i];
      if (m.type === "game_state") return m.state;
    }
    return undefined;
  }

  messagesOfType<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received.filter(
      (m): m is Extract<ServerMessage, { type: T }> => m.type === type,
    );
  }

  close() {
    this.ws.close();
  }
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

let gameCounter = 0;

// Four human players, 2v2, driven through to the clue phase so that
// keywords and codes exist to be leaked.
async function startedGame() {
  const gameId = `TEST${++gameCounter}`;
  const [host, amber2, blue1, blue2] = await Promise.all([
    Client.connect(), Client.connect(), Client.connect(), Client.connect(),
  ]);
  const clients = { host, amber2, blue1, blue2 };

  host.send({ type: "join", gameId, playerName: "AmberHost" });
  await waitFor(() => !!host.latestState(), "host to join");
  amber2.send({ type: "join", gameId, playerName: "AmberTwo" });
  blue1.send({ type: "join", gameId, playerName: "BlueOne" });
  blue2.send({ type: "join", gameId, playerName: "BlueTwo" });
  await waitFor(() => (host.latestState()?.players.length ?? 0) === 4, "four players");

  host.send({ type: "join_team", team: "amber" });
  amber2.send({ type: "join_team", team: "amber" });
  blue1.send({ type: "join_team", team: "blue" });
  blue2.send({ type: "join_team", team: "blue" });
  await waitFor(
    () => host.latestState()?.players.every(p => p.team !== null) ?? false,
    "teams chosen",
  );

  host.send({ type: "start_game" });
  await waitFor(() => host.latestState()?.phase === "team_setup", "team setup");
  host.send({ type: "confirm_teams" });
  await waitFor(() => host.latestState()?.phase === "giving_clues", "clue phase");

  const namesToClients: Record<string, Client> = {
    AmberHost: host, AmberTwo: amber2, BlueOne: blue1, BlueTwo: blue2,
  };
  // Every client sees the same roster, so a player id can't be traced back
  // to its socket from a state payload alone -- go via the name.
  const state = host.latestState()!;
  const clientFor = (playerId: string | null): Client => {
    const name = state.players.find(p => p.id === playerId)?.name;
    const found = name ? namesToClients[name] : undefined;
    if (!found) throw new Error(`no client for player ${playerId}`);
    return found;
  };

  return { gameId, clients, clientFor, state };
}

describe("sendGameState fan-out", () => {
  it("hands each connection the view for its own team", async () => {
    const { clients } = await startedGame();
    const { host, amber2, blue1, blue2 } = clients;

    for (const amberClient of [host, amber2]) {
      const state = amberClient.latestState()!;
      expect(state.teams.amber.keywords).toHaveLength(4);
      expect(state.teams.blue.keywords).toEqual([]);
    }
    for (const blueClient of [blue1, blue2]) {
      const state = blueClient.latestState()!;
      expect(state.teams.blue.keywords).toHaveLength(4);
      expect(state.teams.amber.keywords).toEqual([]);
    }

    Object.values(clients).forEach(c => c.close());
  });

  it("withholds both teams' codes from every connection", async () => {
    const { clients } = await startedGame();
    for (const client of Object.values(clients)) {
      expect(client.latestState()!.currentCode).toEqual({ amber: null, blue: null });
    }
    Object.values(clients).forEach(c => c.close());
  });

  it("sends the round's code only to the clue-giver who owns it", async () => {
    const { clients, clientFor, state } = await startedGame();
    const clueGivers = new Set([
      clientFor(state.currentClueGiver.amber),
      clientFor(state.currentClueGiver.blue),
    ]);

    for (const client of Object.values(clients)) {
      const expected = clueGivers.has(client) ? 1 : 0;
      expect(client.messagesOfType("your_code")).toHaveLength(expected);
    }

    Object.values(clients).forEach(c => c.close());
  });

  it("sends each player their own team's keywords and no others", async () => {
    const { clients } = await startedGame();
    const amberKeywords = clients.host.latestState()!.teams.amber.keywords;
    const blueKeywords = clients.blue1.latestState()!.teams.blue.keywords;
    expect(amberKeywords).not.toEqual(blueKeywords);

    for (const [client, own] of [[clients.amber2, amberKeywords], [clients.blue2, blueKeywords]] as const) {
      const sent = client.messagesOfType("keywords");
      expect(sent.length).toBeGreaterThan(0);
      for (const message of sent) expect(message.keywords).toEqual(own);
    }

    Object.values(clients).forEach(c => c.close());
  });

  it("keeps a team's decode guess from reaching the other team", async () => {
    const { clients, clientFor, state } = await startedGame();
    const { host, blue1 } = clients;

    // Amber clues, blue clues, then whichever amber player may submit
    // decodes -- the opposing side must not learn the digits.
    clientFor(state.currentClueGiver.amber).send({ type: "submit_clues", clues: ["one", "two", "three"] });
    clientFor(state.currentClueGiver.blue).send({ type: "submit_clues", clues: ["four", "five", "six"] });
    await waitFor(() => host.latestState()!.phase === "own_team_guessing", "decode phase");

    clientFor(host.latestState()!.decodeSubmitter.amber).send({ type: "submit_guess", guess: [2, 3, 4] });
    await waitFor(() => host.latestState()!.currentGuesses.amber.ownTeam !== null, "amber decode recorded");

    expect(host.latestState()!.currentGuesses.amber.ownTeam).toEqual([2, 3, 4]);
    // Blue sees that amber submitted, but not what.
    const blueView = blue1.latestState()!.currentGuesses.amber.ownTeam;
    expect(blueView).not.toBeNull();
    expect(blueView).not.toEqual([2, 3, 4]);

    Object.values(clients).forEach(c => c.close());
  });

  it("rejects a clue from someone who is not the clue-giver", async () => {
    const { clients, clientFor, state } = await startedGame();
    const nonGiver = state.players
      .filter(p => p.team === "amber")
      .find(p => p.id !== state.currentClueGiver.amber)!;
    const client = clientFor(nonGiver.id);

    client.send({ type: "submit_clues", clues: ["one", "two", "three"] });
    await waitFor(() => client.messagesOfType("error").length > 0, "clue rejection");
    expect(clients.host.latestState()!.currentClues.amber).toBeNull();

    Object.values(clients).forEach(c => c.close());
  });
});

describe("opponent keywords over the wire", () => {
  it("stays hidden every round, and is only sent once the game is over", async () => {
    // The end-of-game reveal is a change to what the server broadcasts, so
    // this drives a whole game over real sockets and checks what actually
    // arrived at every phase, rather than trusting the redaction unit test
    // to describe what the socket layer does with it.
    const { gameId, clients } = await startedGame();
    const { host, amber2, blue1, blue2 } = clients;
    const everyone = [host, amber2, blue1, blue2];

    const state = () => host.latestState()!;
    const clientByName: Record<string, Client> = {
      AmberHost: host, AmberTwo: amber2, BlueOne: blue1, BlueTwo: blue2,
    };
    // Roles rotate each round, so resolve against the current state rather
    // than the one captured when the game started.
    const actor = (playerId: string | null): Client =>
      clientByName[state().players.find(p => p.id === playerId)!.name];

    const assertHidden = (where: string) => {
      for (const client of [host, amber2]) {
        expect(client.latestState()!.teams.blue.keywords, `amber view at ${where}`).toEqual([]);
      }
      for (const client of [blue1, blue2]) {
        expect(client.latestState()!.teams.amber.keywords, `blue view at ${where}`).toEqual([]);
      }
    };

    let phasesChecked = 0;
    for (let round = 1; round <= 20 && state().phase !== "game_over"; round++) {
      assertHidden(`round ${round} clues`);
      actor(state().currentClueGiver.amber).send({ type: "submit_clues", clues: ["one", "two", "three"] });
      actor(state().currentClueGiver.blue).send({ type: "submit_clues", clues: ["four", "five", "six"] });
      await waitFor(() => state().phase === "own_team_guessing", `round ${round} decode`);

      assertHidden(`round ${round} decode`);
      // Wrong on purpose, so the game reaches a decision quickly.
      actor(state().decodeSubmitter.amber).send({ type: "submit_guess", guess: [1, 1, 1] });
      actor(state().decodeSubmitter.blue).send({ type: "submit_guess", guess: [1, 1, 1] });
      await waitFor(() => state().phase === "opponent_intercepting", `round ${round} intercept`);

      assertHidden(`round ${round} intercept`);
      actor(state().interceptSubmitter.amber).send({ type: "submit_interception", guess: [4, 4, 4] });
      actor(state().interceptSubmitter.blue).send({ type: "submit_interception", guess: [4, 4, 4] });
      await waitFor(
        () => state().phase === "round_results" || state().phase === "game_over",
        `round ${round} results`,
      );
      phasesChecked += 3;

      if (state().phase === "round_results") {
        // Scored, but another round is still to come -- the reveal must not
        // open here.
        assertHidden(`round ${round} results`);
        phasesChecked += 1;
        host.send({ type: "next_round" });
        await waitFor(
          () => state().phase === "giving_clues" || state().phase === "game_over",
          `round ${round} advance`,
        );
      }
    }

    expect(state().phase).toBe("game_over");
    expect(phasesChecked).toBeGreaterThan(3);

    // Only now does every connection get both teams' words.
    for (const client of everyone) {
      const view = client.latestState()!;
      expect(view.teams.amber.keywords).toHaveLength(4);
      expect(view.teams.blue.keywords).toHaveLength(4);
    }
    expect(host.latestState()!.teams.blue.keywords)
      .toEqual(blue1.latestState()!.teams.blue.keywords);

    everyone.forEach(c => c.close());
    expect(gameId).toBeTruthy();
  }, 30000);
});

describe("confirm_teams", () => {
  it("creates one match row even if it is confirmed twice", async () => {
    // A double-clicked button was enough: creating the match row is a
    // database round-trip, and the phase only leaves team_setup after it,
    // so the second message passed the same phase check and created a
    // second row. Both then competed to be the game's record, and the
    // replay resolved to whichever one had received no rounds.
    createMatch.mockClear();
    createMatchLatencyMs = 400;
    try {
      const gameId = `TEST${++gameCounter}`;
      const clients = await Promise.all([
        Client.connect(), Client.connect(), Client.connect(), Client.connect(),
      ]);
      const [host, amber2, blue1, blue2] = clients;

      host.send({ type: "join", gameId, playerName: "Host" });
      await waitFor(() => !!host.latestState(), "host joined");
      amber2.send({ type: "join", gameId, playerName: "AmberTwo" });
      blue1.send({ type: "join", gameId, playerName: "BlueOne" });
      blue2.send({ type: "join", gameId, playerName: "BlueTwo" });
      await waitFor(() => (host.latestState()?.players.length ?? 0) === 4, "four players");

      host.send({ type: "join_team", team: "amber" });
      amber2.send({ type: "join_team", team: "amber" });
      blue1.send({ type: "join_team", team: "blue" });
      blue2.send({ type: "join_team", team: "blue" });
      await waitFor(
        () => host.latestState()?.players.every(p => p.team !== null) ?? false,
        "teams chosen",
      );

      host.send({ type: "start_game" });
      await waitFor(() => host.latestState()?.phase === "team_setup", "team setup");

      host.send({ type: "confirm_teams" });
      host.send({ type: "confirm_teams" });

      await waitFor(() => host.latestState()?.phase === "giving_clues", "clue phase");
      await new Promise(r => setTimeout(r, 600));

      expect(createMatch).toHaveBeenCalledTimes(1);
      // The round must still start exactly once, not be swallowed with it.
      expect(host.latestState()!.round).toBe(1);

      clients.forEach(c => c.close());
    } finally {
      createMatchLatencyMs = 0;
    }
  });
});

describe("host-only actions over the socket", () => {
  it("refuses to start the game for a non-host", async () => {
    const gameId = `TEST${++gameCounter}`;
    const host = await Client.connect();
    const other = await Client.connect();

    host.send({ type: "join", gameId, playerName: "Host" });
    await waitFor(() => !!host.latestState(), "host joined");
    other.send({ type: "join", gameId, playerName: "Other" });
    await waitFor(() => (host.latestState()?.players.length ?? 0) === 2, "second player");

    other.send({ type: "start_game" });
    await waitFor(() => other.messagesOfType("error").length > 0, "rejection");
    expect(other.messagesOfType("error")[0].message).toMatch(/host/i);
    expect(host.latestState()!.phase).toBe("lobby");

    host.close();
    other.close();
  });

  it("refuses to let a non-host assign an AI player", async () => {
    const gameId = `TEST${++gameCounter}`;
    const host = await Client.connect();
    const other = await Client.connect();

    host.send({ type: "join", gameId, playerName: "Host" });
    await waitFor(() => !!host.latestState(), "host joined");
    other.send({ type: "join", gameId, playerName: "Other" });
    await waitFor(() => (host.latestState()?.players.length ?? 0) === 2, "second player");

    host.send({ type: "add_ai", provider: "claude" });
    await waitFor(() => (host.latestState()?.players.length ?? 0) === 3, "ai added");
    const botId = host.latestState()!.players.find(p => p.isAI)!.id;

    other.send({ type: "assign_ai_team", playerId: botId, team: "amber" });
    await waitFor(() => other.messagesOfType("error").length > 0, "rejection");
    expect(host.latestState()!.players.find(p => p.id === botId)!.team).toBeNull();

    // The host may do it.
    host.send({ type: "assign_ai_team", playerId: botId, team: "amber" });
    await waitFor(
      () => host.latestState()!.players.find(p => p.id === botId)!.team === "amber",
      "host assignment",
    );

    host.close();
    other.close();
  });

  it("refuses to assign a human player, even for the host", async () => {
    const gameId = `TEST${++gameCounter}`;
    const host = await Client.connect();
    const other = await Client.connect();

    host.send({ type: "join", gameId, playerName: "Host" });
    await waitFor(() => !!host.latestState(), "host joined");
    other.send({ type: "join", gameId, playerName: "Other" });
    await waitFor(() => (host.latestState()?.players.length ?? 0) === 2, "second player");

    const humanId = host.latestState()!.players.find(p => p.name === "Other")!.id;
    host.send({ type: "assign_ai_team", playerId: humanId, team: "blue" });
    await waitFor(() => host.messagesOfType("error").length > 0, "rejection");
    expect(host.messagesOfType("error").at(-1)!.message).toMatch(/AI/i);
    expect(host.latestState()!.players.find(p => p.id === humanId)!.team).toBeNull();

    host.close();
    other.close();
  });
});

describe("AI turns", () => {
  it("bills exactly one clue call per AI clue-giver", async () => {
    generateClues.mockClear();
    const gameId = `TEST${++gameCounter}`;
    const host = await Client.connect();

    host.send({ type: "join", gameId, playerName: "Watcher" });
    await waitFor(() => !!host.latestState(), "host joined");
    for (let i = 0; i < 3; i++) host.send({ type: "add_ai", provider: "claude" });
    await waitFor(() => (host.latestState()?.players.length ?? 0) === 4, "three bots");

    host.send({ type: "join_team", team: "amber" });
    await waitFor(() => host.latestState()!.players[0].team === "amber", "host on amber");
    host.send({ type: "start_game" });
    await waitFor(() => host.latestState()?.phase === "team_setup", "team setup");
    host.send({ type: "confirm_teams" });
    await waitFor(() => host.latestState()?.phase === "giving_clues", "clue phase");

    // Which seat draws clue-giver isn't fixed, so count the bots holding one
    // rather than assuming both are AI. If the host drew it, supply that
    // team's clues by hand so the phase can still complete.
    const state = host.latestState()!;
    const aiClueGivers = (["amber", "blue"] as const).filter(team => {
      const giver = state.players.find(p => p.id === state.currentClueGiver[team]);
      return giver?.isAI === true;
    });
    if (aiClueGivers.length < 2) {
      host.send({ type: "submit_clues", clues: ["one", "two", "three"] });
    }

    await waitFor(
      () => {
        const s = host.latestState()!;
        return s.currentClues.amber !== null && s.currentClues.blue !== null;
      },
      "both teams clued",
    );

    // Any call beyond one per AI clue-giver means an overlapping dispatch
    // got past the in-progress lock and burned a real, billed call.
    await new Promise(r => setTimeout(r, 600));
    expect(generateClues.mock.calls.length).toBe(aiClueGivers.length);

    host.close();
  });

  it("does not re-dispatch a team's clue call while one is in flight", async () => {
    // start_game and confirm_teams each schedule their own AI dispatch, so
    // confirming promptly leaves two timers pending a few hundred ms apart.
    // The second lands mid-call, and without the in-progress guard it sees
    // currentClues still unset and generates -- and bills -- a second time.
    generateClues.mockClear();
    clueLatencyMs = 700;
    try {
      const gameId = `TEST${++gameCounter}`;
      const host = await Client.connect();

      host.send({ type: "join", gameId, playerName: "Watcher" });
      await waitFor(() => !!host.latestState(), "host joined");
      for (let i = 0; i < 3; i++) host.send({ type: "add_ai", provider: "claude" });
      await waitFor(() => (host.latestState()?.players.length ?? 0) === 4, "three bots");
      host.send({ type: "join_team", team: "amber" });
      await waitFor(() => host.latestState()!.players[0].team === "amber", "host on amber");

      host.send({ type: "start_game" });
      await waitFor(() => host.latestState()?.phase === "team_setup", "team setup");
      host.send({ type: "confirm_teams" });
      await waitFor(() => host.latestState()?.phase === "giving_clues", "clue phase");

      const state = host.latestState()!;
      const aiClueGivers = (["amber", "blue"] as const).filter(
        team => state.players.find(p => p.id === state.currentClueGiver[team])?.isAI === true,
      );

      // Long enough for both dispatches to have fired and any in-flight
      // call to have settled.
      await new Promise(r => setTimeout(r, 2500));
      expect(generateClues.mock.calls.length).toBe(aiClueGivers.length);

      host.close();
    } finally {
      clueLatencyMs = 0;
    }
  });

  it("passes each AI clue-giver only its own team's keywords and code", async () => {
    generateClues.mockClear();
    const gameId = `TEST${++gameCounter}`;
    const host = await Client.connect();

    host.send({ type: "join", gameId, playerName: "Watcher" });
    await waitFor(() => !!host.latestState(), "host joined");
    for (let i = 0; i < 3; i++) host.send({ type: "add_ai", provider: "claude" });
    await waitFor(() => (host.latestState()?.players.length ?? 0) === 4, "three bots");
    host.send({ type: "join_team", team: "amber" });
    await waitFor(() => host.latestState()!.players[0].team === "amber", "host on amber");
    host.send({ type: "start_game" });
    await waitFor(() => host.latestState()?.phase === "team_setup", "team setup");
    host.send({ type: "confirm_teams" });
    await waitFor(() => generateClues.mock.calls.length > 0, "a clue call");

    for (const [, params] of generateClues.mock.calls as unknown as [
      unknown,
      { keywords: string[]; targetCode: [number, number, number] },
    ][]) {
      expect(params.keywords).toHaveLength(4);
      // Every digit has to index a keyword the model was actually handed,
      // otherwise the fallback (keywords[n - 1]) would throw instead.
      for (const digit of params.targetCode) {
        expect(digit).toBeGreaterThanOrEqual(1);
        expect(digit).toBeLessThanOrEqual(4);
      }
    }

    host.close();
  });
});
