import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, ChevronDown, ChevronRight, Play, Bot, Loader2, BookOpen, Brain, TrendingUp, FileText, DollarSign, AlertTriangle, Trophy } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SeriesEntry {
  id: number;
  name: string;
  status: string;
  config: any;
  totalGames: number;
  completedGames: number;
  noteTokenBudget: number;
  budgetCapUsd: string | null;
  actualCostUsd: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface ScratchNote {
  id: number;
  seriesId: number;
  playerConfigHash: string;
  gameIndex: number;
  notesText: string;
  tokenCount: number;
  matchId: number | null;
  createdAt: string;
  playerName?: string;
  provider?: string;
  team?: string;
}

interface PlayerHash {
  hash: string;
  provider: string;
  team: string;
  name: string;
}

interface SeriesDetail {
  series: SeriesEntry;
  notes: ScratchNote[];
  notesByPlayer: Record<string, ScratchNote[]>;
  playerHashes: PlayerHash[];
  matchDetails: any[];
  running: boolean;
}

interface CostEstimate {
  estimatedTotalCost: number;
  perGameCost: number;
  totalGames: number;
  avgRoundsPerGame: number;
  breakdown: Array<{
    model: string;
    provider: string;
    costPerGame: number;
    totalCost: number;
    callTypeBreakdown?: Record<string, { callsPerGame: number; costPerGame: number }>;
  }>;
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

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" data-testid="badge-series-pending">Pending</Badge>;
    case "running":
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white" data-testid="badge-series-running"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
    case "completed":
      return <Badge className="bg-green-500 hover:bg-green-600 text-white" data-testid="badge-series-completed">Completed</Badge>;
    case "budget_exceeded":
      return <Badge className="bg-red-500 hover:bg-red-600 text-white" data-testid="badge-series-budget-exceeded"><DollarSign className="h-3 w-3 mr-1" />Budget Exceeded</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid="badge-series-failed">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getProviderLabel(provider: string) {
  switch (provider) {
    case "chatgpt": return "ChatGPT";
    case "claude": return "Claude";
    case "gemini": return "Gemini";
    default: return provider;
  }
}

function getTeamColor(team: string) {
  return team === "amber" ? "text-amber-500" : "text-blue-500";
}

function CostEstimateDisplay({ estimate }: { estimate: CostEstimate }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/30 space-y-2" data-testid="cost-estimate-display">
      <div className="flex items-center gap-2 text-sm font-medium">
        <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
        Estimated Cost
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">Total</div>
          <div className="font-bold text-base" data-testid="text-estimated-total">${estimate.estimatedTotalCost.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Per Game</div>
          <div className="font-bold" data-testid="text-estimated-per-game">${estimate.perGameCost.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg Rounds</div>
          <div className="font-bold">{estimate.avgRoundsPerGame}</div>
        </div>
      </div>
      {estimate.breakdown.length > 0 && (
        <div className="text-xs space-y-2 border-t pt-2 mt-2">
          {estimate.breakdown.map((b, i) => (
            <div key={i}>
              <div className="flex justify-between text-muted-foreground font-medium">
                <span>{b.model} ({getProviderLabel(b.provider)})</span>
                <span>${b.totalCost.toFixed(4)}</span>
              </div>
              {b.callTypeBreakdown && (
                <div className="ml-3 mt-1 space-y-0.5">
                  {Object.entries(b.callTypeBreakdown).map(([type, info]) => (
                    <div key={type} className="flex justify-between text-muted-foreground/70">
                      <span className="capitalize">{type} ({info.callsPerGame} calls/game)</span>
                      <span>${info.costPerGame.toFixed(6)}/game</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateSeriesForm({ onCreated }: { onCreated: () => void }) {
  const [totalGames, setTotalGames] = useState("5");
  const [tokenBudget, setTokenBudget] = useState("500");
  const [budgetCapUsd, setBudgetCapUsd] = useState("");
  const [amberProvider, setAmberProvider] = useState("chatgpt");
  const [blueProvider, setBlueProvider] = useState("claude");
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const players = [
      { name: `${getProviderLabel(amberProvider)} A1`, aiProvider: amberProvider, team: "amber" },
      { name: `${getProviderLabel(amberProvider)} A2`, aiProvider: amberProvider, team: "amber" },
      { name: `${getProviderLabel(blueProvider)} B1`, aiProvider: blueProvider, team: "blue" },
      { name: `${getProviderLabel(blueProvider)} B2`, aiProvider: blueProvider, team: "blue" },
    ];
    const numGames = parseInt(totalGames) || 5;
    apiRequest("POST", "/api/cost-estimate", { players, totalGames: numGames, includeReflection: true })
      .then(r => r.json())
      .then(setCostEstimate)
      .catch(() => setCostEstimate(null));
  }, [amberProvider, blueProvider, totalGames]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/series", {
        matchConfig: {
          players: [
            { name: `${getProviderLabel(amberProvider)} A1`, aiProvider: amberProvider, team: "amber" },
            { name: `${getProviderLabel(amberProvider)} A2`, aiProvider: amberProvider, team: "amber" },
            { name: `${getProviderLabel(blueProvider)} B1`, aiProvider: blueProvider, team: "blue" },
            { name: `${getProviderLabel(blueProvider)} B2`, aiProvider: blueProvider, team: "blue" },
          ],
        },
        totalGames: parseInt(totalGames),
        noteTokenBudget: parseInt(tokenBudget),
        budgetCapUsd: budgetCapUsd || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Series started", description: "The series is now running." });
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
      onCreated();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create series", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2" data-testid="text-create-series-title">
          <Brain className="h-5 w-5" />
          New Series
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Amber Team</label>
            <Select value={amberProvider} onValueChange={setAmberProvider} data-testid="select-amber-provider">
              <SelectTrigger data-testid="trigger-amber-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chatgpt">ChatGPT</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Blue Team</label>
            <Select value={blueProvider} onValueChange={setBlueProvider} data-testid="select-blue-provider">
              <SelectTrigger data-testid="trigger-blue-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chatgpt">ChatGPT</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Number of Games</label>
            <Input
              type="number"
              min="1"
              max="100"
              value={totalGames}
              onChange={(e) => setTotalGames(e.target.value)}
              data-testid="input-total-games"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Note Token Budget</label>
            <Input
              type="number"
              min="100"
              max="5000"
              value={tokenBudget}
              onChange={(e) => setTokenBudget(e.target.value)}
              data-testid="input-token-budget"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Budget Cap (USD)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="No limit"
              value={budgetCapUsd}
              onChange={(e) => setBudgetCapUsd(e.target.value)}
              data-testid="input-budget-cap"
            />
          </div>
        </div>

        {costEstimate && <CostEstimateDisplay estimate={costEstimate} />}

        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="w-full"
          data-testid="button-start-series"
        >
          {createMutation.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</>
          ) : (
            <><Play className="h-4 w-4 mr-2" />Start Series</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function computeNoteDiff(prevText: string, currText: string): { added: string[]; removed: string[] } {
  const prevLines = prevText.split("\n").filter(l => l.trim());
  const currLines = currText.split("\n").filter(l => l.trim());
  const prevSet = new Set(prevLines);
  const currSet = new Set(currLines);
  const added = currLines.filter(l => !prevSet.has(l));
  const removed = prevLines.filter(l => !currSet.has(l));
  return { added, removed };
}

function detectKeyMoments(notes: ScratchNote[], matchDetails: any[]): Array<{ gameIndex: number; type: string; description: string }> {
  const moments: Array<{ gameIndex: number; type: string; description: string }> = [];

  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1];
    const curr = notes[i];
    const diff = computeNoteDiff(prev.notesText, curr.notesText);
    const changeRatio = (diff.added.length + diff.removed.length) / Math.max(curr.notesText.split("\n").length, 1);

    if (changeRatio > 0.5) {
      moments.push({ gameIndex: curr.gameIndex, type: "major_revision", description: "Major strategy revision" });
    }

    const tokenDelta = curr.tokenCount - prev.tokenCount;
    if (tokenDelta < -prev.tokenCount * 0.3) {
      moments.push({ gameIndex: curr.gameIndex, type: "compression", description: "Strategy compressed" });
    }
  }

  for (const match of matchDetails) {
    const idx = matchDetails.indexOf(match);
    if (idx > 0 && match.winner && matchDetails[idx - 1].winner) {
      const prevWinner = matchDetails[idx - 1].winner;
      if (match.winner !== prevWinner) {
        moments.push({ gameIndex: idx, type: "reversal", description: "Winner changed" });
      }
    }
  }

  return moments;
}

function StrategyTimeline({ notes, matchDetails, team, playerName }: { notes: ScratchNote[]; matchDetails: any[]; team: string; playerName: string }) {
  const [selectedGame, setSelectedGame] = useState<number | null>(null);

  if (notes.length === 0) return null;

  const keyMoments = detectKeyMoments(notes, matchDetails);
  const momentMap = new Map<number, Array<{ type: string; description: string }>>();
  for (const m of keyMoments) {
    if (!momentMap.has(m.gameIndex)) momentMap.set(m.gameIndex, []);
    momentMap.get(m.gameIndex)!.push(m);
  }

  const selectedNote = selectedGame !== null ? notes.find(n => n.gameIndex === selectedGame) : null;
  const prevNote = selectedGame !== null && selectedGame > 0 ? notes.find(n => n.gameIndex === selectedGame - 1) : null;
  const diff = selectedNote && prevNote ? computeNoteDiff(prevNote.notesText, selectedNote.notesText) : null;

  const teamColor = team === "amber" ? "bg-amber-500" : "bg-blue-500";
  const teamBorderColor = team === "amber" ? "border-amber-500" : "border-blue-500";

  return (
    <div className="space-y-3" data-testid={`strategy-timeline-${playerName}`}>
      <h4 className={`font-medium flex items-center gap-2 ${getTeamColor(team)}`}>
        <Bot className="h-4 w-4" />
        {playerName} ({team})
      </h4>

      <div className="relative">
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          <div className={`h-0.5 w-4 ${teamColor} opacity-30`} />
          {notes.map((note, idx) => {
            const isSelected = selectedGame === note.gameIndex;
            const hasMoment = momentMap.has(note.gameIndex);
            const matchResult = matchDetails[note.gameIndex];
            const won = matchResult?.winner === team;

            return (
              <div key={note.id} className="flex items-center" data-testid={`timeline-node-${note.gameIndex}`}>
                <button
                  onClick={() => setSelectedGame(isSelected ? null : note.gameIndex)}
                  className={`relative flex flex-col items-center gap-1 px-2 py-1 rounded transition-all min-w-[48px] ${isSelected ? `border-2 ${teamBorderColor} bg-muted` : "hover:bg-muted/50"}`}
                  data-testid={`timeline-btn-${note.gameIndex}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? teamColor : "bg-background"} ${teamBorderColor}`}>
                    {hasMoment && <AlertTriangle className="h-2.5 w-2.5 text-yellow-500" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground">G{note.gameIndex + 1}</span>
                  {matchResult?.winner && (
                    <Trophy className={`h-3 w-3 ${won ? "text-green-500" : "text-red-400"}`} />
                  )}
                  <span className="text-[9px] text-muted-foreground">{note.tokenCount}t</span>
                </button>
                {idx < notes.length - 1 && <div className={`h-0.5 w-3 ${teamColor} opacity-30`} />}
              </div>
            );
          })}
        </div>
      </div>

      {selectedNote && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Game {selectedNote.gameIndex + 1} Notes</span>
            <Badge variant="outline" className="text-xs">{selectedNote.tokenCount} tokens</Badge>
          </div>

          {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
            <div className="space-y-1 text-xs">
              {diff.added.length > 0 && (
                <div>
                  <span className="font-medium text-green-600 dark:text-green-400">+ Added ({diff.added.length} lines)</span>
                  <div className="mt-1 p-2 rounded bg-green-50 dark:bg-green-950/30 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {diff.added.join("\n")}
                  </div>
                </div>
              )}
              {diff.removed.length > 0 && (
                <div>
                  <span className="font-medium text-red-600 dark:text-red-400">- Removed ({diff.removed.length} lines)</span>
                  <div className="mt-1 p-2 rounded bg-red-50 dark:bg-red-950/30 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {diff.removed.join("\n")}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-xs">
            <div className="font-medium text-muted-foreground mb-1">Full Notes</div>
            <div className="p-2 bg-muted/50 rounded font-mono whitespace-pre-wrap max-h-48 overflow-y-auto" data-testid={`timeline-full-notes-${selectedNote.gameIndex}`}>
              {selectedNote.notesText}
            </div>
          </div>

          {momentMap.has(selectedNote.gameIndex) && (
            <div className="flex flex-wrap gap-1">
              {momentMap.get(selectedNote.gameIndex)!.map((m, i) => (
                <Badge key={i} variant="outline" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                  {m.description}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoteEvolutionView({ notes, playerName, team }: { notes: ScratchNote[]; playerName: string; team: string }) {
  const [expandedGame, setExpandedGame] = useState<number | null>(null);

  if (notes.length === 0) {
    return <p className="text-muted-foreground text-sm">No notes yet.</p>;
  }

  return (
    <div className="space-y-2">
      <h4 className={`font-medium flex items-center gap-2 ${getTeamColor(team)}`}>
        <Bot className="h-4 w-4" />
        {playerName} ({team})
      </h4>
      <div className="space-y-1">
        {notes.map((note) => (
          <Collapsible
            key={note.id}
            open={expandedGame === note.gameIndex}
            onOpenChange={(open) => setExpandedGame(open ? note.gameIndex : null)}
          >
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted transition-colors" data-testid={`trigger-note-${note.gameIndex}`}>
              {expandedGame === note.gameIndex ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="text-sm font-medium">Game {note.gameIndex + 1}</span>
              <Badge variant="outline" className="ml-auto text-xs" data-testid={`badge-tokens-${note.gameIndex}`}>
                {note.tokenCount} tokens
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-6 p-3 bg-muted/50 rounded text-sm whitespace-pre-wrap font-mono" data-testid={`text-note-${note.gameIndex}`}>
                {note.notesText}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <TrendingUp className="h-3 w-3" />
          Token growth across games
        </div>
        <div className="flex items-end gap-1 h-16">
          {notes.map((note) => {
            const maxTokens = Math.max(...notes.map(n => n.tokenCount), 1);
            const height = (note.tokenCount / maxTokens) * 100;
            return (
              <div
                key={note.id}
                className={`flex-1 rounded-t ${team === "amber" ? "bg-amber-500/60" : "bg-blue-500/60"}`}
                style={{ height: `${height}%` }}
                title={`Game ${note.gameIndex + 1}: ${note.tokenCount} tokens`}
                data-testid={`bar-tokens-${note.gameIndex}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SeriesDetailView({ seriesId }: { seriesId: number }) {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<"timeline" | "list">("timeline");

  const { data, isLoading } = useQuery<SeriesDetail>({
    queryKey: ["/api/series", seriesId],
    refetchInterval: (query) => {
      const d = query.state.data as SeriesDetail | undefined;
      return d?.running ? 5000 : false;
    },
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data) {
    return <p className="text-muted-foreground">Series not found.</p>;
  }

  const { series, notesByPlayer, playerHashes, matchDetails } = data;

  const amberWins = matchDetails.filter(m => m.winner === "amber").length;
  const blueWins = matchDetails.filter(m => m.winner === "blue").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/series")} data-testid="button-back-to-series">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h2 className="text-xl font-bold" data-testid="text-series-name">{series.name}</h2>
        {getStatusBadge(series.status)}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Progress</div>
            <div className="text-2xl font-bold" data-testid="text-series-progress">
              {series.completedGames} / {series.totalGames}
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div
                className="bg-primary rounded-full h-2 transition-all"
                style={{ width: `${(series.completedGames / series.totalGames) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Token Budget</div>
            <div className="text-2xl font-bold" data-testid="text-token-budget">{series.noteTokenBudget}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Amber Wins</div>
            <div className="text-2xl font-bold text-amber-500" data-testid="text-amber-wins">{amberWins}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Blue Wins</div>
            <div className="text-2xl font-bold text-blue-500" data-testid="text-blue-wins">{blueWins}</div>
          </CardContent>
        </Card>
        {(series.actualCostUsd || series.budgetCapUsd) && (
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Cost
              </div>
              <div className="text-2xl font-bold" data-testid="text-series-actual-cost">
                ${series.actualCostUsd ? parseFloat(series.actualCostUsd).toFixed(4) : "0.00"}
              </div>
              {series.budgetCapUsd && (
                <div className="text-xs text-muted-foreground mt-1" data-testid="text-series-budget-cap">
                  Cap: ${parseFloat(series.budgetCapUsd).toFixed(2)}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {matchDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Game Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {matchDetails.map((match, idx) => (
                <div key={match.id} className="flex items-center justify-between p-2 rounded bg-muted/30" data-testid={`row-match-${idx}`}>
                  <span className="text-sm">Game {idx + 1} (Match #{match.id})</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{match.totalRounds} rounds</span>
                    {match.winner ? (
                      <Badge className={match.winner === "amber" ? "bg-amber-500 text-white" : "bg-blue-500 text-white"} data-testid={`badge-winner-${idx}`}>
                        {match.winner} wins
                      </Badge>
                    ) : (
                      <Badge variant="outline">No winner</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              Strategy Evolution
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant={viewMode === "timeline" ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setViewMode("timeline")}
                data-testid="button-view-timeline"
              >
                Timeline
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                List
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {playerHashes.map((ph) => (
              viewMode === "timeline" ? (
                <StrategyTimeline
                  key={ph.hash}
                  notes={notesByPlayer[ph.hash] || []}
                  matchDetails={matchDetails}
                  playerName={ph.name}
                  team={ph.team}
                />
              ) : (
                <NoteEvolutionView
                  key={ph.hash}
                  notes={notesByPlayer[ph.hash] || []}
                  playerName={ph.name}
                  team={ph.team}
                />
              )
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Series() {
  const [, setLocation] = useLocation();
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: seriesList, isLoading } = useQuery<SeriesEntry[]>({
    queryKey: ["/api/series"],
  });

  if (selectedSeriesId !== null) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto p-6">
          <SeriesDetailView seriesId={selectedSeriesId} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Home
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-series-heading">
              <Brain className="h-6 w-6" />
              Series & Scratch Notes
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showCreate ? "secondary" : "default"}
              size="sm"
              onClick={() => setShowCreate(!showCreate)}
              data-testid="button-toggle-create"
            >
              {showCreate ? "Hide" : "New Series"}
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {showCreate && <CreateSeriesForm onCreated={() => setShowCreate(false)} />}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !seriesList || seriesList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground" data-testid="text-no-series">No series created yet. Start one to see agents evolve their strategies!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {seriesList.map((s) => (
              <Card
                key={s.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedSeriesId(s.id)}
                data-testid={`card-series-${s.id}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium" data-testid={`text-series-name-${s.id}`}>{s.name}</div>
                      <div className="text-sm text-muted-foreground">{formatDate(s.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.actualCostUsd && (
                        <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-series-cost-${s.id}`}>
                          <DollarSign className="h-3 w-3" />
                          ${parseFloat(s.actualCostUsd).toFixed(4)}
                          {s.budgetCapUsd && <span className="text-muted-foreground">/ ${parseFloat(s.budgetCapUsd).toFixed(2)}</span>}
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground" data-testid={`text-series-progress-${s.id}`}>
                        {s.completedGames}/{s.totalGames} games
                      </span>
                      {getStatusBadge(s.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
