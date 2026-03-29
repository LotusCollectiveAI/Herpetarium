import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Lock, ChevronDown, ChevronRight, ArrowLeft, Trophy, Clock, Users, Bot, Brain, FileDown, Lightbulb, DollarSign } from "lucide-react";

interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  aiProvider: string | null;
  aiConfig?: { model?: string };
  team: string;
}

interface Match {
  id: number;
  gameId: string;
  createdAt: string;
  completedAt: string | null;
  winner: string | null;
  playerConfigs: PlayerConfig[];
  amberKeywords: string[];
  blueKeywords: string[];
  totalRounds: number;
  amberWhiteTokens: number;
  amberBlackTokens: number;
  blueWhiteTokens: number;
  blueBlackTokens: number;
}

interface MatchRound {
  id: number;
  matchId: number;
  roundNumber: number;
  team: string;
  clueGiverId: string;
  code: number[];
  clues: string[];
  ownGuess: number[] | null;
  opponentGuess: number[] | null;
  ownCorrect: boolean;
  intercepted: boolean;
}

interface AiCallLog {
  id: number;
  matchId: number;
  gameId: string;
  roundNumber: number;
  provider: string;
  model: string;
  actionType: string;
  prompt: string;
  rawResponse: string | null;
  parsedResult: unknown;
  latencyMs: number;
  timedOut: boolean;
  error: string | null;
  reasoningTrace: string | null;
  parseQuality: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: string | null;
  createdAt: string;
}

interface MatchListResponse {
  matches: Match[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  matchIdsWithTraces: number[];
}

interface MatchDetailResponse {
  match: Match;
  rounds: MatchRound[];
  aiLogs: AiCallLog[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProviderColor(provider: string): string {
  switch (provider) {
    case "chatgpt": return "text-green-600 dark:text-green-400";
    case "claude": return "text-orange-600 dark:text-orange-400";
    case "gemini": return "text-blue-600 dark:text-blue-400";
    default: return "text-foreground";
  }
}

function getProviderBgColor(provider: string): string {
  switch (provider) {
    case "chatgpt": return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
    case "claude": return "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
    case "gemini": return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
    default: return "bg-muted border-border";
  }
}

function ReasoningTraceViewer({ log }: { log: AiCallLog }) {
  const [expanded, setExpanded] = useState(false);

  if (!log.reasoningTrace) return null;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className={`flex items-center gap-1 text-xs mt-1 px-2 py-1 rounded cursor-pointer transition-colors ${getProviderBgColor(log.provider)} border`} data-testid={`reasoning-trace-toggle-${log.id}`}>
        <Lightbulb className={`h-3 w-3 ${getProviderColor(log.provider)}`} />
        <span className={`font-medium ${getProviderColor(log.provider)}`}>Reasoning Trace</span>
        {expanded ? <ChevronDown className="h-3 w-3 ml-1" /> : <ChevronRight className="h-3 w-3 ml-1" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={`mt-1 p-3 rounded border text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto ${getProviderBgColor(log.provider)}`} data-testid={`reasoning-trace-content-${log.id}`}>
          {log.reasoningTrace}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function inferTeamFromAiLog(aiLog: AiCallLog, players: PlayerConfig[]): string | null {
  const aiPlayersOnTeam = (team: string) => players.filter(p => p.isAI && p.team === team && p.aiProvider === aiLog.provider);
  const amberMatches = aiPlayersOnTeam("amber");
  const blueMatches = aiPlayersOnTeam("blue");
  if (amberMatches.length > 0 && blueMatches.length === 0) return "amber";
  if (blueMatches.length > 0 && amberMatches.length === 0) return "blue";
  if (amberMatches.length > 0 && blueMatches.length > 0 && aiLog.model) {
    const amberModelMatch = amberMatches.filter(p => p.aiConfig?.model === aiLog.model);
    const blueModelMatch = blueMatches.filter(p => p.aiConfig?.model === aiLog.model);
    if (amberModelMatch.length > 0 && blueModelMatch.length === 0) return "amber";
    if (blueModelMatch.length > 0 && amberModelMatch.length === 0) return "blue";
  }
  return null;
}

function getCallOutcome(aiLog: AiCallLog, rounds: MatchRound[], players: PlayerConfig[]): { label: string; variant: "default" | "destructive" | "outline" | "secondary" } | null {
  if (!aiLog.actionType || !aiLog.roundNumber) return null;

  const action = aiLog.actionType.toLowerCase();
  const team = inferTeamFromAiLog(aiLog, players);

  if (action === "clue" || action === "generate_clues") {
    const round = team ? rounds.find(r => r.roundNumber === aiLog.roundNumber && r.team === team) : rounds.find(r => r.roundNumber === aiLog.roundNumber);
    if (!round) return null;
    if (round.intercepted) return { label: "Intercepted", variant: "destructive" };
    if (round.ownCorrect) return { label: "Safe", variant: "default" };
    return { label: "Misread", variant: "destructive" };
  }
  if (action === "guess" || action === "generate_guess") {
    const round = team ? rounds.find(r => r.roundNumber === aiLog.roundNumber && r.team === team) : rounds.find(r => r.roundNumber === aiLog.roundNumber);
    if (!round) return null;
    return round.ownCorrect
      ? { label: "Correct", variant: "default" }
      : { label: "Wrong", variant: "destructive" };
  }
  if (action === "intercept" || action === "generate_interception") {
    const opponentTeam = team === "amber" ? "blue" : team === "blue" ? "amber" : null;
    const round = opponentTeam ? rounds.find(r => r.roundNumber === aiLog.roundNumber && r.team === opponentTeam) : rounds.find(r => r.roundNumber === aiLog.roundNumber);
    if (!round) return null;
    return round.intercepted
      ? { label: "Intercepted!", variant: "default" }
      : { label: "Missed", variant: "secondary" };
  }
  return null;
}

function MatchRow({ match, hasTraces }: { match: Match; hasTraces: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail, isLoading: detailLoading } = useQuery<MatchDetailResponse>({
    queryKey: ["/api/matches", match.id],
    enabled: expanded,
  });

  const aiPlayers = (match.playerConfigs as PlayerConfig[]).filter(p => p.isAI);
  const humanPlayers = (match.playerConfigs as PlayerConfig[]).filter(p => !p.isAI);

  const findPlayerName = (playerId: string) => {
    const p = (match.playerConfigs as PlayerConfig[]).find(pc => pc.id === playerId);
    return p ? p.name : playerId;
  };

  const hasReasoningTraces = detail?.aiLogs.some(l => l.reasoningTrace);
  const totalCost = detail?.aiLogs.reduce((sum, l) => sum + (l.estimatedCostUsd ? parseFloat(l.estimatedCostUsd) : 0), 0);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className="mb-3">
        <CollapsibleTrigger className="w-full text-left" data-testid={`match-row-${match.id}`}>
          <CardContent className="flex items-center gap-4 py-4 px-6">
            <div className="flex-shrink-0">
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm" data-testid={`match-date-${match.id}`}>{formatDate(match.createdAt)}</span>
                <span className="text-xs text-muted-foreground">#{match.gameId}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {humanPlayers.map(p => (
                  <Badge key={p.id} variant="outline" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />{p.name}
                  </Badge>
                ))}
                {aiPlayers.map(p => (
                  <Badge key={p.id} variant="secondary" className="text-xs">
                    <Bot className="h-3 w-3 mr-1" />{p.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              {hasTraces && (
                <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-trace-indicator-${match.id}`}>
                  <Lightbulb className="h-3 w-3" />
                  Traces
                </Badge>
              )}
              <div className="text-sm text-muted-foreground" data-testid={`match-rounds-${match.id}`}>
                {match.totalRounds} round{match.totalRounds !== 1 ? "s" : ""}
              </div>
              {match.winner ? (
                <Badge
                  className={`${match.winner === "amber" ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-500 hover:bg-blue-600"} text-white`}
                  data-testid={`match-winner-${match.id}`}
                >
                  <Trophy className="h-3 w-3 mr-1" />
                  {match.winner} wins
                </Badge>
              ) : (
                <Badge variant="outline" data-testid={`match-status-${match.id}`}>
                  In progress
                </Badge>
              )}
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-6 py-4 space-y-4 bg-muted/30">
            {detailLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : detail ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-1 text-amber-600 dark:text-amber-400">Team Amber</h4>
                    <p className="text-xs text-muted-foreground mb-1">Keywords: {(match.amberKeywords as string[]).join(", ")}</p>
                    <div className="flex gap-2 text-xs">
                      <span>White tokens: {match.amberWhiteTokens}</span>
                      <span>Black tokens: {match.amberBlackTokens}</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-1 text-blue-600 dark:text-blue-400">Team Blue</h4>
                    <p className="text-xs text-muted-foreground mb-1">Keywords: {(match.blueKeywords as string[]).join(", ")}</p>
                    <div className="flex gap-2 text-xs">
                      <span>White tokens: {match.blueWhiteTokens}</span>
                      <span>Black tokens: {match.blueBlackTokens}</span>
                    </div>
                  </div>
                </div>

                {detail.rounds.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Round Details</h4>
                    {Array.from(new Set(detail.rounds.map(r => r.roundNumber))).sort((a, b) => a - b).map(roundNum => {
                      const roundRows = detail.rounds.filter(r => r.roundNumber === roundNum);
                      return (
                        <div key={roundNum} className="mb-3 border rounded-lg p-3 bg-background" data-testid={`round-detail-${match.id}-${roundNum}`}>
                          <h5 className="text-xs font-semibold mb-2">Round {roundNum}</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {roundRows.map(row => (
                              <div key={row.id} className={`text-xs p-2 rounded ${row.team === "amber" ? "bg-amber-50 dark:bg-amber-950/30" : "bg-blue-50 dark:bg-blue-950/30"}`}>
                                <div className="font-medium capitalize mb-1">{row.team}</div>
                                <div>Clue Giver: {findPlayerName(row.clueGiverId)}</div>
                                <div>Code: [{(row.code as number[]).join(", ")}]</div>
                                <div>Clues: {(row.clues as string[]).join(", ")}</div>
                                {row.ownGuess && <div>Own Guess: [{(row.ownGuess as number[]).join(", ")}]</div>}
                                {row.opponentGuess && <div>Opponent Guess: [{(row.opponentGuess as number[]).join(", ")}]</div>}
                                <div className="flex gap-2 mt-1">
                                  <Badge variant={row.ownCorrect ? "default" : "destructive"} className="text-xs px-1 py-0">
                                    {row.ownCorrect ? "✓ Correct" : "✗ Wrong"}
                                  </Badge>
                                  {row.intercepted && (
                                    <Badge variant="destructive" className="text-xs px-1 py-0">
                                      Intercepted!
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {detail.aiLogs.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        <span className="text-sm font-semibold">AI Call Logs ({detail.aiLogs.length})</span>
                        {hasReasoningTraces && (
                          <Badge variant="outline" className="text-xs gap-1" data-testid="badge-has-traces">
                            <Lightbulb className="h-3 w-3" />
                            Has Reasoning
                          </Badge>
                        )}
                      </div>
                      {totalCost !== undefined && totalCost > 0 && (
                        <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-match-cost-${match.id}`}>
                          <DollarSign className="h-3 w-3" />
                          ${totalCost.toFixed(4)}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {detail.aiLogs.map(aiLog => {
                        const outcome = getCallOutcome(aiLog, detail.rounds, match.playerConfigs as PlayerConfig[]);
                        return (
                          <div key={aiLog.id} className="text-xs border rounded p-2 bg-background" data-testid={`ai-log-${aiLog.id}`}>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className={`text-xs px-1 py-0 ${getProviderColor(aiLog.provider)}`}>{aiLog.provider}</Badge>
                              <Badge variant="secondary" className="text-xs px-1 py-0">{aiLog.actionType}</Badge>
                              <span className="text-muted-foreground">R{aiLog.roundNumber}</span>
                              {outcome && (
                                <Badge variant={outcome.variant} className="text-xs px-1 py-0" data-testid={`ai-log-outcome-${aiLog.id}`}>
                                  {outcome.label}
                                </Badge>
                              )}
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />{aiLog.latencyMs}ms
                              </span>
                              {aiLog.parseQuality && aiLog.parseQuality !== "clean" && (
                                <Badge variant={aiLog.parseQuality === "error" ? "destructive" : "outline"} className="text-xs px-1 py-0">
                                  {aiLog.parseQuality}
                                </Badge>
                              )}
                              {aiLog.totalTokens && (
                                <span className="text-muted-foreground">{aiLog.totalTokens} tok</span>
                              )}
                              {aiLog.estimatedCostUsd && (
                                <span className="text-muted-foreground flex items-center gap-0.5">
                                  <DollarSign className="h-3 w-3" />{parseFloat(aiLog.estimatedCostUsd).toFixed(4)}
                                </span>
                              )}
                              {aiLog.timedOut && <Badge variant="destructive" className="text-xs px-1 py-0">Timeout</Badge>}
                              {aiLog.error && <Badge variant="destructive" className="text-xs px-1 py-0">Error</Badge>}
                              {aiLog.reasoningTrace && (
                                <Badge variant="outline" className="text-xs px-1 py-0 gap-0.5">
                                  <Lightbulb className="h-3 w-3" /> Trace
                                </Badge>
                              )}
                            </div>
                            <div className="text-muted-foreground truncate">Model: {aiLog.model}</div>
                            {aiLog.rawResponse && (
                              <div className="text-muted-foreground truncate">Response: {aiLog.rawResponse}</div>
                            )}
                            <ReasoningTraceViewer log={aiLog} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function History() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [filterModel, setFilterModel] = useState("");
  const [filterWinner, setFilterWinner] = useState("all");

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", "20");
  if (filterModel) queryParams.set("model", filterModel);
  if (filterWinner && filterWinner !== "all") queryParams.set("winner", filterWinner);

  const { data, isLoading, isError } = useQuery<MatchListResponse>({
    queryKey: ["/api/matches?" + queryParams.toString()],
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Lock className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">Decrypto</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Home
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-history-title">Match History</h1>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/api/export/matches?format=json", "_blank")}
              data-testid="button-export-history-json"
            >
              <FileDown className="h-4 w-4 mr-1" />
              JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/api/export/matches?format=csv", "_blank")}
              data-testid="button-export-history-csv"
            >
              <FileDown className="h-4 w-4 mr-1" />
              CSV
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="flex flex-wrap gap-3 py-4">
            <div className="flex-1 min-w-[150px]">
              <Input
                placeholder="Filter by model..."
                value={filterModel}
                onChange={(e) => { setFilterModel(e.target.value); setPage(1); }}
                className="h-9"
                data-testid="input-filter-model"
              />
            </div>
            <div className="w-[150px]">
              <Select value={filterWinner} onValueChange={(val) => { setFilterWinner(val); setPage(1); }}>
                <SelectTrigger className="h-9" data-testid="select-filter-winner">
                  <SelectValue placeholder="Winner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="amber">Amber wins</SelectItem>
                  <SelectItem value="blue">Blue wins</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="py-4">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Failed to load match history. Please try again.
            </CardContent>
          </Card>
        ) : data && data.matches.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-3" data-testid="text-total-matches">
              {data.total} match{data.total !== 1 ? "es" : ""} found
            </p>
            {data.matches.map(match => (
              <MatchRow key={match.id} match={match} hasTraces={data.matchIdsWithTraces?.includes(match.id) ?? false} />
            ))}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                  Page {page} of {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center" data-testid="text-no-matches">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No matches found</p>
              <p className="text-sm text-muted-foreground mt-1">Play some games and they'll appear here!</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
