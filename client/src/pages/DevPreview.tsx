import { useMemo, useState } from "react";
import { GameContext } from "@/lib/gameContext";
import type { GameState, GamePhase, Player, RoundHistory, WSMessage } from "@shared/schema";
import { DEFAULT_GAME_RULES } from "@shared/schema";
import { GameShell } from "@/components/GameShell";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Dev-only sandbox for eyeballing every phase's UI instantly, without
// spinning up a real game with AI players. Renders the same view
// components and GameHeader the real /game/:id route uses, but feeds
// them a hand-built GameState through GameContext instead of a live
// WebSocket connection.

const PHASES: { value: GamePhase; label: string }[] = [
  { value: "lobby", label: "Lobby" },
  { value: "team_setup", label: "Team Setup" },
  { value: "giving_clues", label: "Giving Clues" },
  { value: "own_team_guessing", label: "Decoding (Own Team)" },
  { value: "opponent_intercepting", label: "Intercepting (Opponent)" },
  { value: "round_results", label: "Round Results" },
  { value: "game_over", label: "Game Over" },
];

const PLAYERS: Player[] = [
  { id: "amber-1", name: "Alex", isAI: false, team: "amber", isReady: true },
  { id: "amber-2", name: "Ari", isAI: false, team: "amber", isReady: true },
  { id: "amber-3", name: "Avery", isAI: false, team: "amber", isReady: true },
  { id: "blue-1", name: "Bailey", isAI: false, team: "blue", isReady: true },
  { id: "blue-2", name: "Casey", isAI: false, team: "blue", isReady: true },
  { id: "blue-3", name: "Devon", isAI: false, team: "blue", isReady: true },
];

// The one teammate allowed to actually submit each team's guess this round.
// Decode and intercept can have different submitters (see getDesignatedSubmitters
// in server/game.ts), but since every fixture player here is human, this
// simple fixture always lands on the same person for both roles.
const DESIGNATED_SUBMITTER: Record<"amber" | "blue", string> = {
  amber: "amber-1",
  blue: "blue-1",
};

const AMBER_KEYWORDS = ["TYPEWRITER", "VOLCANO", "ECLIPSE", "TEMPLE"];
const BLUE_KEYWORDS = ["SKYLINE", "CORONA", "BOTANY", "ANCHOR"];

// Round 1 is always "already played" so round-2 previews get real
// clue-history data (e.g. for the Deduction Notes panel) for free.
const ROUND_1_AMBER_HISTORY: RoundHistory = {
  round: 1,
  clueGiverId: "amber-1",
  clues: ["INK", "LAVA", "MOON"],
  targetCode: [2, 4, 1],
  ownTeamGuess: [2, 4, 1],
  opponentGuess: [1, 3, 2],
  ownTeamCorrect: true,
  intercepted: false,
};

const ROUND_1_BLUE_HISTORY: RoundHistory = {
  round: 1,
  clueGiverId: "blue-1",
  clues: ["TALON", "GRASSLAND", "ARID"],
  targetCode: [4, 2, 1],
  ownTeamGuess: [4, 2, 1],
  opponentGuess: [1, 3, 2],
  ownTeamCorrect: true,
  intercepted: false,
};

const CURRENT_CODE: Record<"amber" | "blue", [number, number, number]> = {
  amber: [3, 1, 2],
  blue: [2, 3, 4],
};
const CURRENT_CLUES: Record<"amber" | "blue", string[]> = {
  amber: ["SUMMIT", "GALAXY", "SHIELD"],
  blue: ["MAGMA", "SHADOW", "ORBIT"],
};
const CURRENT_CLUE_GIVER: Record<"amber" | "blue", string> = {
  amber: "amber-2",
  blue: "blue-2",
};

export default function DevPreview() {
  const [phase, setPhase] = useState<GamePhase>("giving_clues");
  const [viewerId, setViewerId] = useState<string>("amber-2");
  const [ownGuessSubmitted, setOwnGuessSubmitted] = useState(false);
  const [interceptSubmitted, setInterceptSubmitted] = useState(false);
  const [simulateAiThinking, setSimulateAiThinking] = useState(false);
  const [simulateTeammatePicks, setSimulateTeammatePicks] = useState(true);
  const [simulateGameDecided, setSimulateGameDecided] = useState(false);

  const viewer = PLAYERS.find(p => p.id === viewerId) ?? PLAYERS[0];
  const myTeam = viewer.team as "amber" | "blue";
  const isClueGiver = CURRENT_CLUE_GIVER[myTeam] === viewer.id;
  const cluesRevealed = phase !== "lobby" && phase !== "team_setup" && phase !== "giving_clues";

  const gameState: GameState = useMemo(() => ({
    id: "preview",
    phase,
    round: 2,
    rules: DEFAULT_GAME_RULES,
    players: PLAYERS,
    hostId: "amber-1",
    currentClueGiver: CURRENT_CLUE_GIVER,
    currentCode: CURRENT_CODE,
    currentClues: {
      amber: cluesRevealed ? CURRENT_CLUES.amber : null,
      blue: cluesRevealed ? CURRENT_CLUES.blue : null,
    },
    currentGuesses: {
      amber: {
        ownTeam: myTeam === "amber" && ownGuessSubmitted ? CURRENT_CODE.amber : null,
        opponent: myTeam === "amber" && interceptSubmitted ? CURRENT_CODE.blue : null,
      },
      blue: {
        ownTeam: myTeam === "blue" && ownGuessSubmitted ? CURRENT_CODE.blue : null,
        opponent: myTeam === "blue" && interceptSubmitted ? CURRENT_CODE.amber : null,
      },
    },
    decodeSubmitter: DESIGNATED_SUBMITTER,
    interceptSubmitter: DESIGNATED_SUBMITTER,
    currentSelections: (simulateTeammatePicks
      ? { amber: { "amber-3": [2, null, 4] }, blue: { "blue-3": [null, 3, 1] } }
      : { amber: {}, blue: {} }) as GameState["currentSelections"],
    teams: {
      amber: { keywords: AMBER_KEYWORDS, whiteTokens: 1, blackTokens: 0, history: [ROUND_1_AMBER_HISTORY] },
      blue: { keywords: BLUE_KEYWORDS, whiteTokens: 0, blackTokens: 1, history: [ROUND_1_BLUE_HISTORY] },
    },
    winner: phase === "game_over" || simulateGameDecided ? "amber" : null,
  }), [phase, myTeam, ownGuessSubmitted, interceptSubmitted, cluesRevealed, simulateTeammatePicks, simulateGameDecided]);

  const contextValue = useMemo(() => ({
    gameState,
    // The preview exists to exercise the live, interactive views.
    isReplay: false,
    playerId: viewer.id,
    playerName: viewer.name,
    myTeam,
    isHost: gameState.hostId === viewer.id,
    isConnected: true,
    aiThinking: simulateAiThinking ? "Claude" : null,
    aiThinkingStartTime: simulateAiThinking ? Date.now() : null,
    aiFallback: null,
    clueError: null,
    myKeywords: myTeam === "amber" ? AMBER_KEYWORDS : BLUE_KEYWORDS,
    myCode: isClueGiver ? CURRENT_CODE[myTeam] : null,
    phaseAnnouncement: null,
    sendMessage: (message: WSMessage) => console.log("[DevPreview] sendMessage", message),
    connect: () => {},
    disconnect: () => {},
  }), [gameState, viewer.id, viewer.name, myTeam, simulateAiThinking, isClueGiver]);

  return (
    <GameContext.Provider value={contextValue}>
      <div>
        <div className="border-b bg-muted/50 p-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="font-semibold shrink-0">UI Preview</span>

          <div className="flex items-center gap-2">
            <Label htmlFor="phase-select">Phase</Label>
            <Select value={phase} onValueChange={(v) => setPhase(v as GamePhase)}>
              <SelectTrigger id="phase-select" className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHASES.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="viewer-select">View as</Label>
            <Select value={viewerId} onValueChange={setViewerId}>
              <SelectTrigger id="viewer-select" className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYERS.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.team === "amber" ? "Amber" : "Blue"}
                    {CURRENT_CLUE_GIVER[p.team as "amber" | "blue"] === p.id ? " (Clue Giver)" : ""}
                    {DESIGNATED_SUBMITTER[p.team as "amber" | "blue"] === p.id ? " (Submitter)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2">
            <Checkbox checked={ownGuessSubmitted} onCheckedChange={(v) => setOwnGuessSubmitted(!!v)} />
            Own guess submitted
          </label>

          <label className="flex items-center gap-2">
            <Checkbox checked={interceptSubmitted} onCheckedChange={(v) => setInterceptSubmitted(!!v)} />
            Interception submitted
          </label>

          <label className="flex items-center gap-2">
            <Checkbox checked={simulateAiThinking} onCheckedChange={(v) => setSimulateAiThinking(!!v)} />
            Simulate AI thinking
          </label>

          <label className="flex items-center gap-2">
            <Checkbox checked={simulateTeammatePicks} onCheckedChange={(v) => setSimulateTeammatePicks(!!v)} />
            Simulate teammate picks
          </label>

          <label className="flex items-center gap-2">
            <Checkbox checked={simulateGameDecided} onCheckedChange={(v) => setSimulateGameDecided(!!v)} />
            Simulate game decided (test Round Results phase leading into game over)
          </label>
        </div>

        {/* The same screen the live route renders, so anything rearranged
            there shows up here without this page being touched. */}
        <GameShell gameId="preview" />
      </div>
    </GameContext.Provider>
  );
}
