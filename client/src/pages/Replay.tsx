import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { GameContext } from "@/lib/gameContext";
import type { GameState, MatchEvent, MatchEventPayload, WSMessage } from "@shared/schema";
import { GameHeader } from "@/components/GameHeader";
import { ClueHistoryPanel } from "@/components/ClueHistoryPanel";
import { LobbyView } from "@/components/views/LobbyView";
import { TeamSetupView } from "@/components/views/TeamSetupView";
import { GivingCluesView } from "@/components/views/GivingCluesView";
import { GuessingView } from "@/components/views/GuessingView";
import { InterceptingView } from "@/components/views/InterceptingView";
import { RoundResultsView } from "@/components/views/RoundResultsView";
import { GameOverView } from "@/components/views/GameOverView";
import { MatchSummaryView } from "@/components/MatchSummaryView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward, FileDown,
  Bot, AlertTriangle, Clock, DollarSign, Loader2, ChevronDown, ChevronRight,
  List, ListTree,
} from "lucide-react";
import { buildGameStateAtStep, buildSubmitterMap, REPLAY_SPECTATOR_ID } from "@/lib/replayEngine";

interface MatchEventsResponse {
  matchId: number;
  gameId: string;
  events: MatchEvent[];
}

const AUTO_ADVANCE_MS = 1500;

const EVENT_LABELS: Record<MatchEventPayload["eventType"], string> = {
  game_created: "Game Created",
  round_started: "Round Started",
  clue_submitted: "Clues Submitted",
  selection_updated: "Selection Updated",
  guess_submitted: "Guess Submitted",
  interception_submitted: "Interception Submitted",
  ai_call: "AI Call",
  round_completed: "Round Completed",
  game_completed: "Game Completed",
};

function EventDetailPanel({ event }: { event: MatchEvent | undefined }) {
  const [isOpen, setIsOpen] = useState(true);
  if (!event) return null;
  const payload = event.payload as MatchEventPayload;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full text-left" data-testid="button-toggle-event-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <Badge variant="outline">{EVENT_LABELS[payload.eventType] ?? payload.eventType}</Badge>
                {event.round != null && <span className="text-muted-foreground font-normal">Round {event.round}</span>}
              </span>
              {event.team && (
                <Badge className={event.team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"}>
                  {event.team}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
      <CardContent className="space-y-3">
        {payload.eventType === "ai_call" ? (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1"><Bot className="h-3 w-3" />{payload.provider} / {payload.model}</Badge>
              <Badge variant="outline">{payload.actionType}</Badge>
              {payload.latencyMs != null && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />{payload.latencyMs}ms
                </span>
              )}
              {payload.estimatedCostUsd && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <DollarSign className="h-3 w-3" />{payload.estimatedCostUsd}
                </span>
              )}
              {payload.totalTokens != null && (
                <span className="text-muted-foreground">{payload.totalTokens} tok</span>
              )}
              {payload.timedOut && <Badge variant="destructive">Timed out</Badge>}
              {payload.usedFallback && <Badge variant="destructive">Used fallback</Badge>}
              {payload.parseQuality && payload.parseQuality !== "clean" && (
                <Badge variant="outline">{payload.parseQuality}</Badge>
              )}
            </div>
            {payload.error && (
              <div className="flex items-start gap-1 text-red-500 min-w-0">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <pre className="flex-1 min-w-0 whitespace-pre-wrap break-words font-mono text-[11px] bg-muted p-2 rounded max-h-32 overflow-y-auto">
                  {payload.error}
                </pre>
              </div>
            )}
            {payload.reasoningTrace && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">Reasoning trace</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] bg-muted p-2 rounded max-h-48 overflow-y-auto">
                  {payload.reasoningTrace}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-words bg-muted p-2 rounded max-h-64 overflow-y-auto">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function Replay() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId || "";
  const [, setLocation] = useLocation();

  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [viewTeam, setViewTeam] = useState<"amber" | "blue">("amber");
  const [viewMode, setViewMode] = useState<"detailed" | "summary">("summary");
  const hasInitializedStep = useRef(false);

  const { data, isLoading, error } = useQuery<MatchEventsResponse>({
    queryKey: ["/api/matches", gameId, "events"],
    enabled: !!gameId,
  });

  const events = data?.events ?? [];

  useEffect(() => {
    if (hasInitializedStep.current || events.length === 0) return;
    hasInitializedStep.current = true;
    const firstRound = events.findIndex(e => (e.payload as MatchEventPayload).eventType === "round_started");
    setStepIndex(firstRound >= 0 ? firstRound : 0);
  }, [events]);

  useEffect(() => {
    if (!isPlaying) return;
    if (stepIndex >= events.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStepIndex(i => Math.min(i + 1, events.length - 1)), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, stepIndex, events.length]);

  const submitterMap = useMemo(() => buildSubmitterMap(events), [events]);
  const gameState: GameState = useMemo(
    () => buildGameStateAtStep(gameId, events, stepIndex, submitterMap),
    [gameId, events, stepIndex, submitterMap],
  );
  // Summary mode always shows the whole game so far, independent of the
  // step-through scrubber -- it's a quick-glance overview, not a step.
  const finalGameState: GameState = useMemo(
    () => buildGameStateAtStep(gameId, events, events.length - 1, submitterMap),
    [gameId, events, submitterMap],
  );

  // Summary mode shows the whole match, so its header/score should reflect
  // the final state rather than wherever the (unused, in that mode) step
  // scrubber happens to be parked.
  const headerGameState = viewMode === "summary" ? finalGameState : gameState;

  const contextValue = useMemo(() => ({
    gameState: headerGameState,
    isReplay: true,
    playerId: REPLAY_SPECTATOR_ID,
    playerName: "Spectator",
    myTeam: viewTeam,
    isHost: false,
    isConnected: true,
    aiThinking: null,
    aiThinkingStartTime: null,
    aiFallback: null,
    clueError: null,
    myKeywords: headerGameState.teams[viewTeam].keywords,
    myCode: null,
    phaseAnnouncement: null,
    sendMessage: (_message: WSMessage) => {},
    connect: () => {},
    disconnect: () => {},
  }), [headerGameState, viewTeam]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    // The server withholds replays of games still in play, since the event
    // stream carries both teams' keywords and codes. Say so plainly rather
    // than reporting it as a failure to load.
    const stillPlaying = String((error as Error | null)?.message ?? "").includes("game_in_progress");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">
          {stillPlaying
            ? `Game ${gameId} is still in progress. The replay opens once it finishes.`
            : `Couldn't load replay for game ${gameId}.`}
        </p>
        <Button variant="outline" onClick={() => setLocation("/history")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to History
        </Button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">No recorded events for game {gameId}.</p>
        <Button variant="outline" onClick={() => setLocation("/history")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to History
        </Button>
      </div>
    );
  }

  const renderPhaseView = () => {
    switch (gameState.phase) {
      case "lobby": return <LobbyView />;
      case "team_setup": return <TeamSetupView />;
      case "giving_clues": return <GivingCluesView />;
      case "own_team_guessing": return <GuessingView />;
      case "opponent_intercepting": return <InterceptingView />;
      case "round_results": return <RoundResultsView />;
      case "game_over": return <GameOverView />;
      default: return null;
    }
  };

  const currentEvent = events[stepIndex];

  return (
    <GameContext.Provider value={contextValue}>
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b bg-muted/50 p-3 flex flex-wrap items-center gap-3 text-sm">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/history")} data-testid="button-replay-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-semibold">Replay — Game #{gameId}</span>
          {gameState.winner && (
            <Badge className={gameState.winner === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"}>
              {gameState.winner} wins
            </Badge>
          )}

          <div className="flex items-center gap-1 ml-auto">
            <Button size="sm" variant={viewMode === "detailed" ? "default" : "outline"} onClick={() => setViewMode("detailed")} data-testid="button-mode-detailed">
              <ListTree className="h-4 w-4 mr-1" />Detailed
            </Button>
            <Button size="sm" variant={viewMode === "summary" ? "default" : "outline"} onClick={() => setViewMode("summary")} data-testid="button-mode-summary">
              <List className="h-4 w-4 mr-1" />Summary
            </Button>
          </div>

          {viewMode === "detailed" && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">View as</span>
              <Button size="sm" variant={viewTeam === "amber" ? "default" : "outline"} onClick={() => setViewTeam("amber")} data-testid="button-view-amber">
                Amber
              </Button>
              <Button size="sm" variant={viewTeam === "blue" ? "default" : "outline"} onClick={() => setViewTeam("blue")} data-testid="button-view-blue">
                Blue
              </Button>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/export/v2/matches/${gameId}/replay?format=json`, "_blank")}
            data-testid="button-download-replay-json"
          >
            <FileDown className="h-4 w-4 mr-1" />Download JSON
          </Button>
        </div>

        <GameHeader gameId={gameId} />

        {viewMode === "summary" ? (
          <MatchSummaryView gameState={finalGameState} />
        ) : (
          <>
            <main className="flex-1 flex flex-col overflow-y-auto">
              {renderPhaseView()}
            </main>

            {gameState.phase !== "lobby" && gameState.phase !== "team_setup" && <ClueHistoryPanel />}

            <div className="p-4 border-t">
              <EventDetailPanel event={currentEvent} />
            </div>

            <div className="border-t bg-muted/50 p-3 flex items-center gap-3 sticky bottom-0">
              <Button size="icon" variant="outline" onClick={() => { setIsPlaying(false); setStepIndex(i => Math.max(0, i - 1)); }} disabled={stepIndex === 0} data-testid="button-replay-prev">
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button size="icon" onClick={() => setIsPlaying(p => !p)} disabled={stepIndex >= events.length - 1 && !isPlaying} data-testid="button-replay-play-pause">
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="outline" onClick={() => { setIsPlaying(false); setStepIndex(i => Math.min(events.length - 1, i + 1)); }} disabled={stepIndex >= events.length - 1} data-testid="button-replay-next">
                <SkipForward className="h-4 w-4" />
              </Button>
              <Slider
                value={[stepIndex]}
                min={0}
                max={events.length - 1}
                step={1}
                onValueChange={([v]) => { setIsPlaying(false); setStepIndex(v); }}
                className="flex-1"
                data-testid="slider-replay-scrubber"
              />
              <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                {stepIndex + 1} / {events.length}
              </span>
            </div>
          </>
        )}
      </div>
    </GameContext.Provider>
  );
}
