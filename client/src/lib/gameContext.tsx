import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { GameState, Player, ServerMessage, WSMessage } from "@shared/schema";

interface GameContextType {
  gameState: GameState | null;
  playerId: string | null;
  playerName: string | null;
  myTeam: "amber" | "blue" | null;
  isHost: boolean;
  isConnected: boolean;
  aiThinking: string | null;
  aiFallback: string | null;
  clueError: string | null;
  myKeywords: string[] | null;
  myCode: [number, number, number] | null;
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
  const [aiFallback, setAiFallback] = useState<string | null>(null);
  const [clueError, setClueError] = useState<string | null>(null);
  const [myKeywords, setMyKeywords] = useState<string[] | null>(null);
  const [myCode, setMyCode] = useState<[number, number, number] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const intentionalCloseRef = useRef(false);

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
          case "game_state":
            setGameState(message.state);
            if (!isReconnect) {
              const storedId = sessionStorage.getItem(`player_${gameId}`);
              const player = message.state.players.find(p => p.id === storedId || p.name === name);
              if (player) {
                setPlayerId(player.id);
                sessionStorage.setItem(`player_${gameId}`, player.id);
              }
            } else {
              const storedId = sessionStorage.getItem(`player_${gameId}`);
              if (storedId) {
                const player = message.state.players.find(p => p.id === storedId);
                if (player) {
                  setPlayerId(player.id);
                }
              }
            }
            break;
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
            break;
          case "ai_done":
            setAiThinking(null);
            break;
          case "ai_fallback":
            setAiFallback(`${message.aiName}: ${message.reason}`);
            setTimeout(() => setAiFallback(null), 5000);
            break;
          case "clue_error":
            setClueError(message.message);
            setTimeout(() => setClueError(null), 5000);
            break;
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
  }, []);

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
      aiFallback,
      clueError,
      myKeywords,
      myCode,
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
