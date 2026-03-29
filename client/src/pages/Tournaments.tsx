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
import { Lock, ArrowLeft, Trophy, ChevronDown, ChevronRight, Plus, Play, Bot, BarChart3, Swords, Loader2, Zap, Users, Repeat, Grid3X3, DollarSign, AlertTriangle, Layers } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TournamentConfig } from "@shared/schema";

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

interface Tournament {
  id: number;
  name: string;
  status: string;
  config: any;
  totalMatches: number;
  completedMatches: number;
  budgetCapUsd: string | null;
  actualCostUsd: string | null;
  estimatedCostUsd: string | null;
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
    case "budget_exceeded":
      return <Badge className="bg-red-500 hover:bg-red-600 text-white" data-testid="badge-status-budget-exceeded"><DollarSign className="h-3 w-3 mr-1" />Budget Exceeded</Badge>;
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

interface ThrottleState {
  lastRateLimitAt: number;
  backoffMs: number;
  totalRetries: number;
  totalRateLimits: number;
}

function TournamentRow({ tournament }: { tournament: Tournament }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = tournament.status === "running";

  const { data: detail, isLoading: detailLoading } = useQuery<TournamentDetail>({
    queryKey: ["/api/tournaments", tournament.id],
    enabled: expanded,
    refetchInterval: isRunning ? 5000 : false,
  });

  const { data: throttleState } = useQuery<Record<string, ThrottleState>>({
    queryKey: ["/api/throttle-state"],
    enabled: isRunning,
    refetchInterval: isRunning ? 3000 : false,
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
              {(tournament.actualCostUsd || tournament.estimatedCostUsd) && (
                <Badge variant="outline" className="text-xs gap-1" data-testid={`tournament-cost-${tournament.id}`}>
                  <DollarSign className="h-3 w-3" />
                  {tournament.actualCostUsd
                    ? <>${parseFloat(tournament.actualCostUsd).toFixed(4)}</>
                    : null}
                  {tournament.estimatedCostUsd && (
                    <span className="text-muted-foreground">
                      {tournament.actualCostUsd ? " / " : ""}est. ${parseFloat(tournament.estimatedCostUsd).toFixed(4)}
                    </span>
                  )}
                  {tournament.budgetCapUsd && (
                    <span className="text-muted-foreground"> (cap ${parseFloat(tournament.budgetCapUsd).toFixed(2)})</span>
                  )}
                </Badge>
              )}
              <div className="text-sm text-muted-foreground" data-testid={`tournament-progress-${tournament.id}`}>
                {tournament.completedMatches}/{tournament.totalMatches} matches
              </div>
              {isRunning && throttleState && Object.values(throttleState).some(s => s.totalRateLimits > 0) && (
                <Badge variant="outline" className="text-xs gap-1 text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-600" data-testid={`throttle-indicator-${tournament.id}`}>
                  <AlertTriangle className="h-3 w-3" />
                  Rate limited
                </Badge>
              )}
              {isRunning && (tournament.config as TournamentConfig)?.concurrency && (tournament.config as TournamentConfig).concurrency! > 1 && (
                <Badge variant="outline" className="text-xs gap-1" data-testid={`parallel-indicator-${tournament.id}`}>
                  <Layers className="h-3 w-3" />
                  {(tournament.config as TournamentConfig).concurrency}x parallel
                </Badge>
              )}
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
                {isRunning && throttleState && Object.entries(throttleState).some(([, s]) => s.totalRateLimits > 0) && (
                  <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3" data-testid="throttle-detail">
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1 text-orange-700 dark:text-orange-400">
                      <AlertTriangle className="h-4 w-4" /> Rate Limit Status
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(throttleState)
                        .filter(([, s]) => s.totalRateLimits > 0)
                        .map(([provider, state]) => (
                          <div key={provider} className="text-xs p-2 bg-background rounded border" data-testid={`throttle-provider-${provider}`}>
                            <div className="font-medium">{getProviderLabel(provider)}</div>
                            <div className="text-muted-foreground mt-1">
                              {state.totalRateLimits} rate limit{state.totalRateLimits !== 1 ? "s" : ""}, {state.totalRetries} retries
                            </div>
                            {state.backoffMs > 0 && (
                              <div className="text-orange-600 dark:text-orange-400 mt-0.5">
                                Backoff: {(state.backoffMs / 1000).toFixed(1)}s
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

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

const PROVIDERS = ["chatgpt", "claude", "gemini"] as const;

function generateCrossModelRoundRobin(): MatchupConfig[] {
  const matchups: MatchupConfig[] = [];
  const teamCombos: [string, string][] = [];
  for (let i = 0; i < PROVIDERS.length; i++) {
    for (let j = i + 1; j < PROVIDERS.length; j++) {
      teamCombos.push([PROVIDERS[i], PROVIDERS[j]]);
    }
  }
  for (let i = 0; i < teamCombos.length; i++) {
    for (let j = i + 1; j < teamCombos.length; j++) {
      matchups.push({
        amberProvider1: teamCombos[i][0],
        amberProvider2: teamCombos[i][1],
        blueProvider1: teamCombos[j][0],
        blueProvider2: teamCombos[j][1],
      });
    }
  }
  return matchups;
}

function generateSelfPlaySeries(): MatchupConfig[] {
  return PROVIDERS.map(p => ({
    amberProvider1: p,
    amberProvider2: p,
    blueProvider1: p,
    blueProvider2: p,
  }));
}

function generateProviderShowdown(): MatchupConfig[] {
  const matchups: MatchupConfig[] = [];
  for (let i = 0; i < PROVIDERS.length; i++) {
    for (let j = i + 1; j < PROVIDERS.length; j++) {
      matchups.push({
        amberProvider1: PROVIDERS[i],
        amberProvider2: PROVIDERS[i],
        blueProvider1: PROVIDERS[j],
        blueProvider2: PROVIDERS[j],
      });
    }
  }
  return matchups;
}

function generateFullMatrix(): MatchupConfig[] {
  const matchups: MatchupConfig[] = [];
  const teamCombos: [string, string][] = [];
  for (const p of PROVIDERS) {
    teamCombos.push([p, p]);
  }
  for (let i = 0; i < PROVIDERS.length; i++) {
    for (let j = i + 1; j < PROVIDERS.length; j++) {
      teamCombos.push([PROVIDERS[i], PROVIDERS[j]]);
    }
  }
  for (let i = 0; i < teamCombos.length; i++) {
    for (let j = i; j < teamCombos.length; j++) {
      matchups.push({
        amberProvider1: teamCombos[i][0],
        amberProvider2: teamCombos[i][1],
        blueProvider1: teamCombos[j][0],
        blueProvider2: teamCombos[j][1],
      });
    }
  }
  return matchups;
}

interface PresetConfig {
  name: string;
  icon: any;
  description: string;
  generate: () => MatchupConfig[];
  defaultName: string;
  defaultGames: string;
}

const TOURNAMENT_PRESETS: PresetConfig[] = [
  {
    name: "Cross-Model Round Robin",
    icon: Users,
    description: "Every 2-model team vs every other",
    generate: generateCrossModelRoundRobin,
    defaultName: "Cross-Model Round Robin",
    defaultGames: "3",
  },
  {
    name: "Self-Play Series",
    icon: Repeat,
    description: "Same model on both teams",
    generate: generateSelfPlaySeries,
    defaultName: "Self-Play Series",
    defaultGames: "5",
  },
  {
    name: "Provider Showdown",
    icon: Zap,
    description: "Each provider vs each other (homogeneous teams)",
    generate: generateProviderShowdown,
    defaultName: "Provider Showdown",
    defaultGames: "5",
  },
  {
    name: "Full Matrix",
    icon: Grid3X3,
    description: "All combinations including mixed & self-play",
    generate: generateFullMatrix,
    defaultName: "Full Matrix",
    defaultGames: "2",
  },
];

function TournamentCostEstimate({ matchups, gamesPerMatchup }: { matchups: MatchupConfig[]; gamesPerMatchup: number }) {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);

  useEffect(() => {
    const estimates = matchups.map(m => {
      const players = [
        { name: "A1", aiProvider: m.amberProvider1, team: "amber" },
        { name: "A2", aiProvider: m.amberProvider2, team: "amber" },
        { name: "B1", aiProvider: m.blueProvider1, team: "blue" },
        { name: "B2", aiProvider: m.blueProvider2, team: "blue" },
      ];
      return apiRequest("POST", "/api/cost-estimate", { players, totalGames: gamesPerMatchup })
        .then(r => r.json());
    });

    Promise.all(estimates).then(results => {
      const totalGames = matchups.length * gamesPerMatchup;
      const totalCost = results.reduce((s: number, r: CostEstimate) => s + r.estimatedTotalCost, 0);
      const breakdownMap = new Map<string, { model: string; provider: string; totalCost: number; costPerGame: number; callTypeBreakdown?: Record<string, { callsPerGame: number; costPerGame: number }> }>();
      for (const r of results) {
        for (const b of r.breakdown) {
          const key = `${b.provider}:${b.model}`;
          const ex = breakdownMap.get(key);
          if (ex) {
            ex.totalCost += b.totalCost;
          } else {
            breakdownMap.set(key, { ...b });
          }
        }
      }
      setEstimate({
        estimatedTotalCost: +totalCost.toFixed(4),
        perGameCost: +(totalCost / totalGames).toFixed(6),
        totalGames,
        avgRoundsPerGame: results[0]?.avgRoundsPerGame || 5,
        breakdown: Array.from(breakdownMap.values()),
      });
    }).catch(() => setEstimate(null));
  }, [matchups, gamesPerMatchup]);

  if (!estimate) return null;

  return (
    <div className="rounded-lg border p-3 bg-muted/30 space-y-2" data-testid="tournament-cost-estimate">
      <div className="flex items-center gap-2 text-sm font-medium">
        <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
        Estimated Cost
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">Total</div>
          <div className="font-bold text-base" data-testid="text-tournament-cost-total">${estimate.estimatedTotalCost.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Per Game</div>
          <div className="font-bold">${estimate.perGameCost.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Total Games</div>
          <div className="font-bold">{matchups.length * gamesPerMatchup}</div>
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

type AblationFlag = "no_history" | "no_scratch_notes" | "no_opponent_history" | "no_chain_of_thought" | "random_clues";

const ABLATION_PRESETS: { name: string; description: string; flags: AblationFlag[] }[] = [
  { name: "No History", description: "Remove all round history from prompts", flags: ["no_history"] },
  { name: "No Notes", description: "Remove scratch notes / strategy memory", flags: ["no_scratch_notes"] },
  { name: "No CoT", description: "Disable chain-of-thought reasoning", flags: ["no_chain_of_thought"] },
  { name: "Memory Wipe", description: "No history + no notes", flags: ["no_history", "no_scratch_notes"] },
  { name: "Blind Play", description: "No history, notes, or opponent info", flags: ["no_history", "no_scratch_notes", "no_opponent_history"] },
  { name: "Random Baseline", description: "Replace clues with random words", flags: ["random_clues"] },
];

function CreateTournamentForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [gamesPerMatchup, setGamesPerMatchup] = useState("3");
  const [budgetCapUsd, setBudgetCapUsd] = useState("");
  const [concurrency, setConcurrency] = useState("1");
  const [delayMs, setDelayMs] = useState("0");
  const [ablationFlags, setAblationFlags] = useState<AblationFlag[]>([]);
  const [matchups, setMatchups] = useState<MatchupConfig[]>([
    { amberProvider1: "chatgpt", amberProvider2: "chatgpt", blueProvider1: "claude", blueProvider2: "claude" },
  ]);
  const { toast } = useToast();

  const applyPreset = (preset: PresetConfig) => {
    setMatchups(preset.generate());
    setName(preset.defaultName);
    setGamesPerMatchup(preset.defaultGames);
    toast({ title: `Preset applied: ${preset.name}`, description: `${preset.generate().length} matchups configured.` });
  };

  const launchPreset = (preset: PresetConfig) => {
    const presetMatchups = preset.generate();
    const matchConfigs = presetMatchups.map(m => ({
      players: [
        { name: `${getProviderLabel(m.amberProvider1)} A1`, aiProvider: m.amberProvider1, team: "amber" as const },
        { name: `${getProviderLabel(m.amberProvider2)} A2`, aiProvider: m.amberProvider2, team: "amber" as const },
        { name: `${getProviderLabel(m.blueProvider1)} B1`, aiProvider: m.blueProvider1, team: "blue" as const },
        { name: `${getProviderLabel(m.blueProvider2)} B2`, aiProvider: m.blueProvider2, team: "blue" as const },
      ],
      fastMode: true,
    }));

    launchMutation.mutate({
      name: preset.defaultName,
      matchConfigs,
      gamesPerMatchup: parseInt(preset.defaultGames) || 3,
    });
  };

  const launchMutation = useMutation({
    mutationFn: async (config: { name: string; matchConfigs: any[]; gamesPerMatchup: number }) => {
      const res = await apiRequest("POST", "/api/tournaments", config);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Tournament launched", description: "Your preset tournament is now running." });
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      onCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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
        budgetCapUsd: budgetCapUsd ? budgetCapUsd : undefined,
        concurrency: parseInt(concurrency) || 1,
        delayBetweenMatchesMs: parseInt(delayMs) || 0,
        ablations: ablationFlags.length > 0 ? { flags: ablationFlags } : undefined,
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
        <div>
          <label className="text-sm font-medium mb-2 block">Quick Presets</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TOURNAMENT_PRESETS.map((preset) => {
              const Icon = preset.icon;
              return (
                <div key={preset.name} className="border rounded-lg p-3 flex flex-col items-center gap-2 text-center">
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">{preset.name}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{preset.description}</span>
                  <div className="flex gap-1 w-full mt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => applyPreset(preset)}
                      data-testid={`preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      Configure
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => launchPreset(preset)}
                      disabled={launchMutation.isPending}
                      data-testid={`launch-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {launchMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                      Launch
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Parallel Matches (1-5)</label>
            <Input
              type="number"
              min="1"
              max="5"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              data-testid="input-concurrency"
            />
            <span className="text-xs text-muted-foreground mt-1 block">Run multiple matches simultaneously</span>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Delay Between Matches (ms)</label>
            <Input
              type="number"
              min="0"
              max="60000"
              step="1000"
              placeholder="0"
              value={delayMs}
              onChange={(e) => setDelayMs(e.target.value)}
              data-testid="input-delay-ms"
            />
            <span className="text-xs text-muted-foreground mt-1 block">Rate limit protection</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Ablation Experiment</label>
          <p className="text-xs text-muted-foreground mb-2">Disable specific AI capabilities to study their impact on performance</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {ABLATION_PRESETS.map((preset) => {
              const isActive = preset.flags.every(f => ablationFlags.includes(f)) && preset.flags.length > 0;
              return (
                <button
                  key={preset.name}
                  className={`border rounded-lg p-2 text-left transition-colors ${isActive ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
                  onClick={() => {
                    if (isActive) {
                      setAblationFlags(ablationFlags.filter(f => !preset.flags.includes(f)));
                    } else {
                      setAblationFlags([...new Set([...ablationFlags, ...preset.flags])]);
                    }
                  }}
                  data-testid={`ablation-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="text-xs font-medium">{preset.name}</div>
                  <div className="text-[10px] text-muted-foreground">{preset.description}</div>
                </button>
              );
            })}
          </div>
          {ablationFlags.length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Active:</span>
              {ablationFlags.map(f => (
                <Badge key={f} variant="secondary" className="text-[10px] gap-1" data-testid={`ablation-active-${f}`}>
                  {f.replace(/_/g, " ")}
                  <button onClick={() => setAblationFlags(ablationFlags.filter(af => af !== f))} className="ml-1 hover:text-destructive">&times;</button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-5 text-xs px-2" onClick={() => setAblationFlags([])} data-testid="button-clear-ablations">
                Clear all
              </Button>
            </div>
          )}
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

        <TournamentCostEstimate matchups={matchups} gamesPerMatchup={parseInt(gamesPerMatchup) || 3} />

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
