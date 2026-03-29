import { useState } from "react";
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
import { ArrowLeft, ChevronDown, ChevronRight, Play, Bot, Loader2, BookOpen, Brain, TrendingUp, FileText } from "lucide-react";
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

function CreateSeriesForm({ onCreated }: { onCreated: () => void }) {
  const [totalGames, setTotalGames] = useState("5");
  const [tokenBudget, setTokenBudget] = useState("500");
  const [amberProvider, setAmberProvider] = useState("chatgpt");
  const [blueProvider, setBlueProvider] = useState("claude");
  const { toast } = useToast();

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
        </div>

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

      <div className="grid grid-cols-3 gap-4">
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
            <div className="text-sm text-muted-foreground">Games with Results</div>
            <div className="text-2xl font-bold" data-testid="text-match-count">{matchDetails.length}</div>
          </CardContent>
        </Card>
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
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Notes Evolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {playerHashes.map((ph) => (
              <NoteEvolutionView
                key={ph.hash}
                notes={notesByPlayer[ph.hash] || []}
                playerName={ph.name}
                team={ph.team}
              />
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
