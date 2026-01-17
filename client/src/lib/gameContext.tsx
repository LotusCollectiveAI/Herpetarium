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
  myKeywords: string[] | null;
  myCode: [number, number, number] | null;
  sendMessage: (message: WSMessage) => void;
  connect: (gameId: string, playerName: string) => void;
  disconnect: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [aiThinking, setAiThinking] = useState<string | null>(null);
  const [myKeywords, setMyKeywords] = useState<string[] | null>(null);
  const [myCode, setMyCode] = useState<[number, number, number] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const myTeam = gameState?.players.find(p => p.id === playerId)?.team ?? null;
  const isHost = gameState?.hostId === playerId;

  const sendMessage = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connect = useCallback((gameId: string, name: string) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setPlayerName(name);
      ws.send(JSON.stringify({ type: "join", gameId, playerName: name }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        
        switch (message.type) {
          case "game_state":
            setGameState(message.state);
            if (!playerId) {
              const storedId = sessionStorage.getItem(`player_${gameId}`);
              const player = message.state.players.find(p => p.id === storedId || p.name === name);
              if (player) {
                setPlayerId(player.id);
                sessionStorage.setItem(`player_${gameId}`, player.id);
              }
            }
            break;
          case "player_joined":
            if (message.player.name === name && !playerId) {
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
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, [playerId]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setGameState(null);
    setPlayerId(null);
    setIsConnected(false);
    setMyKeywords(null);
    setMyCode(null);
  }, []);

  useEffect(() => {
    return () => {
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
