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
import { Lock, ArrowLeft, Trophy, ChevronDown, ChevronRight, Plus, Play, Bot, BarChart3, Swords, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Tournament {
  id: number;
  name: string;
  status: string;
  config: any;
  totalMatches: number;
  completedMatches: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface TournamentMatchEntry {
  id: number;
  tournamentId: number;
  matchId: number | null;
  matchIndex: number;
  status: string;
  config: any;
  result: any;
  createdAt: string;
  completedAt: string | null;
}

interface ModelStats {
  wins: number;
  losses: number;
  games: number;
  interceptions: number;
  miscommunications: number;
}

interface TournamentDetail {
  tournament: Tournament;
  matches: TournamentMatchEntry[];
  matchDetails: any[];
  stats: {
    totalGames: number;
    completedGames: number;
    modelStats: Record<string, ModelStats>;
  };
}

interface MatchupConfig {
  amberProvider1: string;
  amberProvider2: string;
  blueProvider1: string;
  blueProvider2: string;
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
      return <Badge variant="outline" data-testid="badge-status-pending">Pending</Badge>;
    case "running":
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white" data-testid="badge-status-running"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
    case "completed":
      return <Badge className="bg-green-500 hover:bg-green-600 text-white" data-testid="badge-status-completed">Completed</Badge>;
    case "completed_with_errors":
      return <Badge className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="badge-status-completed-errors">Completed (errors)</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid="badge-status-failed">Failed</Badge>;
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

function TournamentRow({ tournament }: { tournament: Tournament }) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail, isLoading: detailLoading } = useQuery<TournamentDetail>({
    queryKey: ["/api/tournaments", tournament.id],
    enabled: expanded,
    refetchInterval: tournament.status === "running" ? 5000 : false,
  });

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className="mb-3">
        <CollapsibleTrigger className="w-full text-left" data-testid={`tournament-row-${tournament.id}`}>
          <CardContent className="flex items-center gap-4 py-4 px-6">
            <div className="flex-shrink-0">
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm" data-testid={`tournament-name-${tournament.id}`}>{tournament.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(tournament.createdAt)}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-sm text-muted-foreground" data-testid={`tournament-progress-${tournament.id}`}>
                {tournament.completedMatches}/{tournament.totalMatches} matches
              </div>
              {getStatusBadge(tournament.status)}
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-6 py-4 space-y-4 bg-muted/30">
            {detailLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : detail ? (
              <>
                {detail.stats && Object.keys(detail.stats.modelStats).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-1">
                      <BarChart3 className="h-4 w-4" /> Model Leaderboard
                    </h4>
                    <div className="grid gap-2">
                      {Object.entries(detail.stats.modelStats)
                        .sort(([, a], [, b]) => (b.wins / Math.max(b.games, 1)) - (a.wins / Math.max(a.games, 1)))
                        .map(([model, stats]) => (
                          <div key={model} className="flex items-center gap-3 p-3 border rounded-lg bg-background" data-testid={`model-stats-${model}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Bot className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-sm">{getProviderLabel(model)}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <div className="text-center">
                                <div className="font-bold text-green-600 dark:text-green-400" data-testid={`model-wins-${model}`}>{stats.wins}</div>
                                <div className="text-muted-foreground">Wins</div>
                              </div>
                              <div className="text-center">
                                <div className="font-bold text-red-600 dark:text-red-400" data-testid={`model-losses-${model}`}>{stats.losses}</div>
                                <div className="text-muted-foreground">Losses</div>
                              </div>
                              <div className="text-center">
                                <div className="font-bold" data-testid={`model-winrate-${model}`}>
                                  {stats.games > 0 ? Math.round((stats.wins / stats.games) * 100) : 0}%
                                </div>
                                <div className="text-muted-foreground">Win Rate</div>
                              </div>
                              <div className="text-center">
                                <div className="font-bold text-orange-600 dark:text-orange-400">{stats.interceptions}</div>
                                <div className="text-muted-foreground">Intercepts</div>
                              </div>
                              <div className="text-center">
                                <div className="font-bold text-yellow-600 dark:text-yellow-400">{stats.miscommunications}</div>
                                <div className="text-muted-foreground">Miscomm.</div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Swords className="h-4 w-4" /> Match Results
                  </h4>
                  <div className="space-y-1">
                    {detail.matches.map((tm) => {
                      const config = tm.config as any;
                      const amberPlayers = config.players?.filter((p: any) => p.team === "amber") || [];
                      const bluePlayers = config.players?.filter((p: any) => p.team === "blue") || [];

                      return (
                        <div key={tm.id} className="flex items-center gap-3 p-2 border rounded text-xs bg-background" data-testid={`tournament-match-${tm.id}`}>
                          <span className="text-muted-foreground w-8">#{tm.matchIndex + 1}</span>
                          <div className="flex-1 flex items-center gap-1">
                            <span className="text-amber-600 dark:text-amber-400">
                              {amberPlayers.map((p: any) => getProviderLabel(p.aiProvider)).join("+")}
                            </span>
                            <span className="text-muted-foreground">vs</span>
                            <span className="text-blue-600 dark:text-blue-400">
                              {bluePlayers.map((p: any) => getProviderLabel(p.aiProvider)).join("+")}
                            </span>
                          </div>
                          <div>
                            {tm.status === "completed" && tm.result ? (
                              <Badge className={`text-xs ${tm.result.winner === "amber" ? "bg-amber-500" : "bg-blue-500"} text-white`}>
                                {tm.result.winner} wins ({tm.result.totalRounds}R)
                              </Badge>
                            ) : (
                              getStatusBadge(tm.status)
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function CreateTournamentForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [gamesPerMatchup, setGamesPerMatchup] = useState("3");
  const [matchups, setMatchups] = useState<MatchupConfig[]>([
    { amberProvider1: "chatgpt", amberProvider2: "chatgpt", blueProvider1: "claude", blueProvider2: "claude" },
  ]);
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const matchConfigs = matchups.map(m => ({
        players: [
          { name: `${getProviderLabel(m.amberProvider1)} A1`, aiProvider: m.amberProvider1, team: "amber" as const },
          { name: `${getProviderLabel(m.amberProvider2)} A2`, aiProvider: m.amberProvider2, team: "amber" as const },
          { name: `${getProviderLabel(m.blueProvider1)} B1`, aiProvider: m.blueProvider1, team: "blue" as const },
          { name: `${getProviderLabel(m.blueProvider2)} B2`, aiProvider: m.blueProvider2, team: "blue" as const },
        ],
        fastMode: true,
      }));

      const res = await apiRequest("POST", "/api/tournaments", {
        name: name || `Tournament ${new Date().toLocaleDateString()}`,
        matchConfigs,
        gamesPerMatchup: parseInt(gamesPerMatchup) || 3,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Tournament started", description: "Your tournament is now running." });
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      onCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addMatchup = () => {
    setMatchups([...matchups, { amberProvider1: "chatgpt", amberProvider2: "chatgpt", blueProvider1: "gemini", blueProvider2: "gemini" }]);
  };

  const removeMatchup = (index: number) => {
    setMatchups(matchups.filter((_, i) => i !== index));
  };

  const updateMatchup = (index: number, field: keyof MatchupConfig, value: string) => {
    setMatchups(matchups.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const providers = [
    { value: "chatgpt", label: "ChatGPT" },
    { value: "claude", label: "Claude" },
    { value: "gemini", label: "Gemini" },
  ];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Play className="h-5 w-5" /> Create Tournament
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Tournament Name</label>
            <Input
              placeholder="e.g., AI Battle Royale"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-tournament-name"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Games per Matchup</label>
            <Input
              type="number"
              min="1"
              max="100"
              value={gamesPerMatchup}
              onChange={(e) => setGamesPerMatchup(e.target.value)}
              data-testid="input-games-per-matchup"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Matchups</label>
            <Button variant="outline" size="sm" onClick={addMatchup} data-testid="button-add-matchup">
              <Plus className="h-3 w-3 mr-1" /> Add Matchup
            </Button>
          </div>
          <div className="space-y-2">
            {matchups.map((matchup, i) => (
              <div key={i} className="border rounded-lg p-3 bg-muted/30" data-testid={`matchup-config-${i}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Matchup {i + 1}</span>
                  {matchups.length > 1 && (
                    <Button variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={() => removeMatchup(i)} data-testid={`button-remove-matchup-${i}`}>
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-2 items-center">
                  <div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 block mb-1">Amber 1</span>
                    <Select value={matchup.amberProvider1} onValueChange={(v) => updateMatchup(i, "amberProvider1", v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-amber1-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 block mb-1">Amber 2</span>
                    <Select value={matchup.amberProvider2} onValueChange={(v) => updateMatchup(i, "amberProvider2", v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-amber2-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-center text-xs text-muted-foreground font-medium pt-5">VS</div>
                  <div>
                    <span className="text-xs text-blue-600 dark:text-blue-400 block mb-1">Blue 1</span>
                    <Select value={matchup.blueProvider1} onValueChange={(v) => updateMatchup(i, "blueProvider1", v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-blue1-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="text-xs text-blue-600 dark:text-blue-400 block mb-1">Blue 2</span>
                    <Select value={matchup.blueProvider2} onValueChange={(v) => updateMatchup(i, "blueProvider2", v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-blue2-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button
          className="w-full"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          data-testid="button-create-tournament"
        >
          {createMutation.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
          ) : (
            <><Play className="h-4 w-4 mr-2" /> Start Tournament</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Tournaments() {
  const [, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);

  const { data: tournamentsList, isLoading } = useQuery<Tournament[]>({
    queryKey: ["/api/tournaments"],
    refetchInterval: 10000,
  });

  const hasRunning = tournamentsList?.some(t => t.status === "running");

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
          <h1 className="text-2xl font-bold flex-1" data-testid="text-tournaments-title">
            <Trophy className="h-6 w-6 inline mr-2" />
            Tournaments
          </h1>
          <Button
            variant={showCreate ? "secondary" : "default"}
            size="sm"
            onClick={() => setShowCreate(!showCreate)}
            data-testid="button-toggle-create"
          >
            <Plus className="h-4 w-4 mr-1" />
            {showCreate ? "Cancel" : "New Tournament"}
          </Button>
        </div>

        {showCreate && (
          <CreateTournamentForm onCreated={() => setShowCreate(false)} />
        )}

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
        ) : tournamentsList && tournamentsList.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-3" data-testid="text-total-tournaments">
              {tournamentsList.length} tournament{tournamentsList.length !== 1 ? "s" : ""}
              {hasRunning && " (live updates enabled)"}
            </p>
            {tournamentsList.map(t => (
              <TournamentRow key={t.id} tournament={t} />
            ))}
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center" data-testid="text-no-tournaments">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No tournaments yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create a tournament to pit AI models against each other!</p>
              <Button className="mt-4" onClick={() => setShowCreate(true)} data-testid="button-create-first-tournament">
                <Plus className="h-4 w-4 mr-2" /> Create Tournament
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
