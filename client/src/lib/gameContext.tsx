import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { GameState, GamePhase, Player, ServerMessage, WSMessage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface GameContextType {
  gameState: GameState | null;
  playerId: string | null;
  playerName: string | null;
  myTeam: "amber" | "blue" | null;
  isHost: boolean;
  isConnected: boolean;
  aiThinking: string | null;
  aiThinkingStartTime: number | null;
  aiFallback: string | null;
  clueError: string | null;
  myKeywords: string[] | null;
  myCode: [number, number, number] | null;
  phaseAnnouncement: { phase: GamePhase; round: number } | null;
  sendMessage: (message: WSMessage) => void;
  connect: (gameId: string, playerName: string) => void;
  disconnect: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_RECONNECT_DELAY = 1000;

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [aiThinking, setAiThinking] = useState<string | null>(null);
  const [aiThinkingStartTime, setAiThinkingStartTime] = useState<number | null>(null);
  const [aiFallback, setAiFallback] = useState<string | null>(null);
  const [clueError, setClueError] = useState<string | null>(null);
  const [myKeywords, setMyKeywords] = useState<string[] | null>(null);
  const [myCode, setMyCode] = useState<[number, number, number] | null>(null);
  const [phaseAnnouncement, setPhaseAnnouncement] = useState<{ phase: GamePhase; round: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const intentionalCloseRef = useRef(false);
  const { toast } = useToast();

  const myTeam = gameState?.players.find(p => p.id === playerId)?.team ?? null;
  const isHost = gameState?.hostId === playerId;

  const sendMessage = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connectWs = useCallback((gameId: string, name: string, isReconnect = false) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    gameIdRef.current = gameId;

    ws.onopen = () => {
      setIsConnected(true);
      setPlayerName(name);
      reconnectAttemptRef.current = 0;
      const storedPlayerId = sessionStorage.getItem(`player_${gameId}`);
      ws.send(JSON.stringify({ 
        type: "join", 
        gameId, 
        playerName: name,
        playerId: storedPlayerId || undefined
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        
        switch (message.type) {
          case "game_state": {
            const newState = message.state;
            const currentGameId = gameIdRef.current || gameId;
            setGameState(prev => {
              if (prev && prev.phase !== newState.phase) {
                const phaseToasts: Partial<Record<GamePhase, string>> = {
                  own_team_guessing: "Clues submitted! Time to decode.",
                  opponent_intercepting: "All guesses in — interception phase!",
                  round_results: "Results are in!",
                };
                const toastMsg = phaseToasts[newState.phase];
                if (toastMsg) {
                  toast({ title: toastMsg });
                }
              }
              return newState;
            });
            if (!isReconnect) {
              const storedId = sessionStorage.getItem(`player_${currentGameId}`);
              const player = newState.players.find(p => p.id === storedId || p.name === name);
              if (player) {
                setPlayerId(player.id);
                sessionStorage.setItem(`player_${currentGameId}`, player.id);
              }
            } else {
              const storedId = sessionStorage.getItem(`player_${currentGameId}`);
              if (storedId) {
                const player = newState.players.find(p => p.id === storedId);
                if (player) {
                  setPlayerId(player.id);
                }
              } else {
                const player = newState.players.find(p => p.name === name && !p.isAI);
                if (player) {
                  setPlayerId(player.id);
                  sessionStorage.setItem(`player_${currentGameId}`, player.id);
                }
              }
            }
            break;
          }
          case "player_joined":
            if (message.player.name === name) {
              setPlayerId(message.player.id);
              sessionStorage.setItem(`player_${gameId}`, message.player.id);
            }
            break;
          case "your_code":
            setMyCode(message.code);
            break;
          case "keywords":
            setMyKeywords(message.keywords);
            break;
          case "ai_thinking":
            setAiThinking(message.aiName);
            setAiThinkingStartTime(message.startTime ?? Date.now());
            break;
          case "ai_done":
            setAiThinking(null);
            setAiThinkingStartTime(null);
            break;
          case "ai_fallback":
            setAiFallback(`${message.aiName}: ${message.reason}`);
            setTimeout(() => setAiFallback(null), 5000);
            break;
          case "clue_error":
            setClueError(message.message);
            setTimeout(() => setClueError(null), 5000);
            break;
          case "phase_changed":
            setPhaseAnnouncement({ phase: message.phase, round: message.round });
            setTimeout(() => setPhaseAnnouncement(null), 2000);
            break;
          case "new_game_created": {
            const oldGameKey = `player_${gameIdRef.current || gameId}`;
            sessionStorage.removeItem(oldGameKey);
            gameIdRef.current = message.gameId;
            setMyKeywords(null);
            setMyCode(null);
            window.history.replaceState(null, "", `/game/${message.gameId}`);
            toast({ title: "New game started!", description: "Same players, fresh game." });
            break;
          }
          case "error":
            console.error("Game error:", message.message);
            break;
        }
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      
      if (!intentionalCloseRef.current && gameIdRef.current) {
        const attempt = reconnectAttemptRef.current;
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          const delay = BASE_RECONNECT_DELAY * Math.pow(2, attempt);
          reconnectAttemptRef.current = attempt + 1;
          console.log(`WebSocket closed unexpectedly. Reconnecting in ${delay}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimerRef.current = setTimeout(() => {
            connectWs(gameIdRef.current!, name, true);
          }, delay);
        } else {
          console.error("Max reconnection attempts reached");
        }
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, [toast]);

  const connect = useCallback((gameId: string, name: string) => {
    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;
    connectWs(gameId, name, false);
  }, [connectWs]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    gameIdRef.current = null;
    setGameState(null);
    setPlayerId(null);
    setIsConnected(false);
    setMyKeywords(null);
    setMyCode(null);
  }, []);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return (
    <GameContext.Provider value={{
      gameState,
      playerId,
      playerName,
      myTeam,
      isHost,
      isConnected,
      aiThinking,
      aiThinkingStartTime,
      aiFallback,
      clueError,
      myKeywords,
      myCode,
      phaseAnnouncement,
      sendMessage,
      connect,
      disconnect,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
}
