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
import { Lock, ChevronDown, ChevronRight, ArrowLeft, Trophy, Clock, Users, Bot, Brain } from "lucide-react";

interface PlayerConfig {
  id: string;
  name: string;
  isAI: boolean;
  aiProvider: string | null;
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
  createdAt: string;
}

interface MatchListResponse {
  matches: Match[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

function MatchRow({ match }: { match: Match }) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail, isLoading: detailLoading } = useQuery<MatchDetailResponse>({
    queryKey: ["/api/matches", match.id],
    enabled: expanded,
  });

  const aiPlayers = (match.playerConfigs as PlayerConfig[]).filter(p => p.isAI);
  const humanPlayers = (match.playerConfigs as PlayerConfig[]).filter(p => !p.isAI);
  const models = aiPlayers.map(p => p.aiProvider).filter(Boolean);

  const findPlayerName = (playerId: string) => {
    const p = (match.playerConfigs as PlayerConfig[]).find(pc => pc.id === playerId);
    return p ? p.name : playerId;
  };

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
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground" data-testid={`ai-logs-toggle-${match.id}`}>
                      <Brain className="h-4 w-4" />
                      AI Call Logs ({detail.aiLogs.length})
                      <ChevronDown className="h-3 w-3" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 space-y-2 max-h-96 overflow-y-auto">
                        {detail.aiLogs.map(aiLog => (
                          <div key={aiLog.id} className="text-xs border rounded p-2 bg-background" data-testid={`ai-log-${aiLog.id}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs px-1 py-0">{aiLog.provider}</Badge>
                              <Badge variant="secondary" className="text-xs px-1 py-0">{aiLog.actionType}</Badge>
                              <span className="text-muted-foreground">R{aiLog.roundNumber}</span>
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />{aiLog.latencyMs}ms
                              </span>
                              {aiLog.timedOut && <Badge variant="destructive" className="text-xs px-1 py-0">Timeout</Badge>}
                              {aiLog.error && <Badge variant="destructive" className="text-xs px-1 py-0">Error</Badge>}
                            </div>
                            <div className="text-muted-foreground truncate">Model: {aiLog.model}</div>
                            {aiLog.rawResponse && (
                              <div className="text-muted-foreground truncate">Response: {aiLog.rawResponse}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
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
              <MatchRow key={match.id} match={match} />
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
