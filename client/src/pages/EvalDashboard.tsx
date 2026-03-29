import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import {
  Lock, ArrowLeft, BarChart3, FlaskConical, FileDown, Eye,
  TrendingUp, Shield, AlertTriangle, Target, Shuffle, BookOpen,
  ChevronDown, ChevronRight, Check, X
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Cell
} from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ModelMetrics {
  model: string;
  provider: string;
  wins: number;
  losses: number;
  winRate: number;
  totalGames: number;
  interceptionSuccessRate: number;
  interceptionVulnerability: number;
  miscommunicationRate: number;
  avgRounds: number;
  clueDiversity: number;
}

interface MatchupMetrics {
  modelA: string;
  modelB: string;
  modelAWins: number;
  modelBWins: number;
  totalGames: number;
  modelAWinRate: number;
  modelBWinRate: number;
}

interface TeamCompositionMetrics {
  mixedTeamWins: number;
  mixedTeamLosses: number;
  mixedTeamGames: number;
  mixedTeamWinRate: number;
  homogeneousTeamWins: number;
  homogeneousTeamLosses: number;
  homogeneousTeamGames: number;
  homogeneousTeamWinRate: number;
  synergyScores: Array<{
    provider1: string;
    provider2: string;
    wins: number;
    losses: number;
    games: number;
    winRate: number;
    interceptionVulnerability: number;
  }>;
  interceptionByComposition: {
    mixedIntercepted: number;
    mixedCluesGiven: number;
    mixedInterceptionRate: number;
    homogeneousIntercepted: number;
    homogeneousCluesGiven: number;
    homogeneousInterceptionRate: number;
  };
}

interface SelfPlayMetrics {
  modelStats: Array<{
    model: string;
    games: number;
    amberWins: number;
    blueWins: number;
    winRateVariance: number;
    avgGameLength: number;
    gameLengths: number[];
    tokenAccumulation: Array<{
      round: number;
      avgAmberWhite: number;
      avgAmberBlack: number;
      avgBlueWhite: number;
      avgBlueBlack: number;
    }>;
  }>;
  totalSelfPlayGames: number;
  avgSelfPlayLength: number;
  avgNonSelfPlayLength: number;
}

interface CrossModelClueAnalysis extends ClueAnalysisItem {
  clueGiverProvider: string;
  guesserProviders: string[];
  isCrossModel: boolean;
}

interface EvalData {
  modelMetrics: ModelMetrics[];
  matchupMetrics: MatchupMetrics[];
  strategyMetrics: Record<string, ModelMetrics>;
  teamCompositionMetrics: TeamCompositionMetrics;
  selfPlayMetrics: SelfPlayMetrics;
  summary: {
    totalMatches: number;
    totalRounds: number;
    avgRoundsPerGame: number;
  };
}

interface Experiment {
  id: number;
  name: string;
  model: string;
  provider: string;
  strategyA: string;
  strategyB: string;
  numGames: number;
  status: string;
  matchIdsA: number[];
  matchIdsB: number[];
  results: unknown;
  createdAt: string;
  completedAt: string | null;
}

interface ClueAnalysisItem {
  roundNumber: number;
  team: string;
  clueGiver: string;
  keywords: string[];
  code: number[];
  clues: string[];
  clueKeywordMap: Array<{ clue: string; keyword: string; position: number }>;
  ownCorrect: boolean;
  intercepted: boolean;
  status: "good" | "too_obvious" | "too_obscure";
}

interface MatchAnalysisResponse {
  match: {
    id: number;
    gameId: string;
    winner: string | null;
    totalRounds: number;
    amberKeywords: string[];
    blueKeywords: string[];
  };
  analysis: ClueAnalysisItem[];
  crossModelAnalysis: CrossModelClueAnalysis[];
}

const CHART_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#ec4899"];

function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function MetricCard({ title, value, icon: Icon, description }: { title: string; value: string | number; icon: any; description?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold" data-testid={`metric-${title.toLowerCase().replace(/\s/g, '-')}`}>{value}</p>
            <p className="text-sm text-muted-foreground">{title}</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelMetricsChart({ metrics }: { metrics: ModelMetrics[] }) {
  if (metrics.length === 0) return null;

  const chartData = metrics.map(m => ({
    name: m.model,
    "Win Rate": +(m.winRate * 100).toFixed(1),
    "Interception Success": +(m.interceptionSuccessRate * 100).toFixed(1),
    "Vulnerability": +(m.interceptionVulnerability * 100).toFixed(1),
    "Miscommunication": +(m.miscommunicationRate * 100).toFixed(1),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Model Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis unit="%" fontSize={12} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Win Rate" fill="#f59e0b" />
            <Bar dataKey="Interception Success" fill="#10b981" />
            <Bar dataKey="Vulnerability" fill="#ef4444" />
            <Bar dataKey="Miscommunication" fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ModelDetailsTable({ metrics }: { metrics: ModelMetrics[] }) {
  if (metrics.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No model data available. Play some games to see metrics.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Model Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-model-metrics">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 pr-4">Games</th>
                <th className="py-2 pr-4">W/L</th>
                <th className="py-2 pr-4">Win Rate</th>
                <th className="py-2 pr-4">Intercept %</th>
                <th className="py-2 pr-4">Vulnerable %</th>
                <th className="py-2 pr-4">Miscomm %</th>
                <th className="py-2 pr-4">Avg Rounds</th>
                <th className="py-2">Clue Diversity</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m.model} className="border-b" data-testid={`model-row-${m.model}`}>
                  <td className="py-2 pr-4 font-medium">{m.model}</td>
                  <td className="py-2 pr-4">{m.totalGames}</td>
                  <td className="py-2 pr-4">{m.wins}/{m.losses}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={m.winRate >= 0.5 ? "default" : "secondary"}>{pct(m.winRate)}</Badge>
                  </td>
                  <td className="py-2 pr-4">{pct(m.interceptionSuccessRate)}</td>
                  <td className="py-2 pr-4">{pct(m.interceptionVulnerability)}</td>
                  <td className="py-2 pr-4">{pct(m.miscommunicationRate)}</td>
                  <td className="py-2 pr-4">{m.avgRounds.toFixed(1)}</td>
                  <td className="py-2">{pct(m.clueDiversity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchupTable({ matchups }: { matchups: MatchupMetrics[] }) {
  if (matchups.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shuffle className="h-5 w-5" />
          Head-to-Head Matchups
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {matchups.map((mu, i) => (
            <div key={i} className="border rounded-lg p-3" data-testid={`matchup-${mu.modelA}-vs-${mu.modelB}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{mu.modelA} vs {mu.modelB}</span>
                <Badge variant="outline">{mu.totalGames} games</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="h-3 rounded-l bg-amber-500"
                  style={{ width: `${mu.modelAWinRate * 100}%`, minWidth: mu.modelAWins > 0 ? '20px' : '0' }}
                />
                <div
                  className="h-3 rounded-r bg-blue-500"
                  style={{ width: `${mu.modelBWinRate * 100}%`, minWidth: mu.modelBWins > 0 ? '20px' : '0' }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{mu.modelA}: {mu.modelAWins}W ({pct(mu.modelAWinRate)})</span>
                <span>{mu.modelB}: {mu.modelBWins}W ({pct(mu.modelBWinRate)})</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StrategyComparison({ strategies }: { strategies: Record<string, ModelMetrics> }) {
  const entries = Object.entries(strategies);
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          Strategy Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map(([name, m]) => (
            <div key={name} className="border rounded-lg p-4" data-testid={`strategy-${name}`}>
              <h4 className="font-semibold capitalize mb-3">{name} Strategy</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Games</span><span>{m.totalGames}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Win Rate</span><Badge variant={m.winRate >= 0.5 ? "default" : "secondary"}>{pct(m.winRate)}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Interception Success</span><span>{pct(m.interceptionSuccessRate)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vulnerability</span><span>{pct(m.interceptionVulnerability)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Miscommunication</span><span>{pct(m.miscommunicationRate)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Clue Diversity</span><span>{pct(m.clueDiversity)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ExperimentsSection() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("chatgpt");
  const [strategyA, setStrategyA] = useState("default");
  const [strategyB, setStrategyB] = useState("advanced");
  const [numGames, setNumGames] = useState("10");
  const [isCreating, setIsCreating] = useState(false);

  const { data: experiments, isLoading } = useQuery<Experiment[]>({
    queryKey: ["/api/experiments"],
  });

  const handleCreate = async () => {
    if (!name.trim() || !model.trim()) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      await apiRequest("POST", "/api/experiments", {
        name: name.trim(),
        model: model.trim(),
        provider,
        strategyA,
        strategyB,
        numGames: parseInt(numGames) || 10,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/experiments"] });
      toast({ title: "Experiment created", description: "Your A/B test experiment has been created." });
      setName("");
      setModel("");
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to create experiment.", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Create A/B Test Experiment
          </CardTitle>
          <CardDescription>
            Compare two prompt strategies under the same conditions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Experiment Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Default vs Advanced GPT-4o"
                data-testid="input-experiment-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Model</label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., gpt-4o"
                data-testid="input-experiment-model"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Provider</label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger data-testid="select-experiment-provider">
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
              <label className="text-sm font-medium mb-1 block">Number of Games</label>
              <Input
                type="number"
                value={numGames}
                onChange={(e) => setNumGames(e.target.value)}
                min="1"
                max="100"
                data-testid="input-experiment-games"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Strategy A</label>
              <Select value={strategyA} onValueChange={setStrategyA}>
                <SelectTrigger data-testid="select-strategy-a">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Strategy B</label>
              <Select value={strategyB} onValueChange={setStrategyB}>
                <SelectTrigger data-testid="select-strategy-b">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={isCreating} data-testid="button-create-experiment">
            {isCreating ? "Creating..." : "Create Experiment"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Experiments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : experiments && experiments.length > 0 ? (
            <div className="space-y-3">
              {experiments.map(exp => (
                <ExperimentRow key={exp.id} experiment={exp} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No experiments yet. Create one above to get started.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExperimentRow({ experiment }: { experiment: Experiment }) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail } = useQuery<{
    experiment: Experiment;
    metricsA: ModelMetrics[];
    metricsB: ModelMetrics[];
  }>({
    queryKey: ["/api/experiments", experiment.id],
    enabled: expanded,
  });

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="border rounded-lg">
        <CollapsibleTrigger className="w-full text-left p-4 flex items-center gap-3" data-testid={`experiment-row-${experiment.id}`}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div className="flex-1">
            <div className="font-medium">{experiment.name}</div>
            <div className="text-xs text-muted-foreground">
              {experiment.model} | {experiment.strategyA} vs {experiment.strategyB} | {experiment.numGames} games
            </div>
          </div>
          <Badge variant={experiment.status === "completed" ? "default" : "secondary"}>
            {experiment.status}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {detail && (
            <div className="border-t p-4 space-y-4 bg-muted/30">
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-2">Strategy A: {experiment.strategyA}</h4>
                  {detail.metricsA.length > 0 ? (
                    <div className="text-xs space-y-1">
                      {detail.metricsA.map(m => (
                        <div key={m.model}>
                          <div>Win Rate: {pct(m.winRate)}</div>
                          <div>Games: {m.totalGames}</div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No data yet</p>}
                </div>
                <div className="border rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-2">Strategy B: {experiment.strategyB}</h4>
                  {detail.metricsB.length > 0 ? (
                    <div className="text-xs space-y-1">
                      {detail.metricsB.map(m => (
                        <div key={m.model}>
                          <div>Win Rate: {pct(m.winRate)}</div>
                          <div>Games: {m.totalGames}</div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No data yet</p>}
                </div>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function TeamCompositionSection({ data }: { data: EvalData }) {
  const tc = data.teamCompositionMetrics;
  const sp = data.selfPlayMetrics;

  const compositionChartData = [
    {
      name: "Mixed Teams",
      "Win Rate": +(tc.mixedTeamWinRate * 100).toFixed(1),
      "Interception Rate": +(tc.interceptionByComposition.mixedInterceptionRate * 100).toFixed(1),
      Games: tc.mixedTeamGames,
    },
    {
      name: "Homogeneous Teams",
      "Win Rate": +(tc.homogeneousTeamWinRate * 100).toFixed(1),
      "Interception Rate": +(tc.interceptionByComposition.homogeneousInterceptionRate * 100).toFixed(1),
      Games: tc.homogeneousTeamGames,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Mixed Team Win Rate"
          value={pct(tc.mixedTeamWinRate)}
          icon={Shuffle}
          description={`${tc.mixedTeamWins}W/${tc.mixedTeamLosses}L (${tc.mixedTeamGames} games)`}
        />
        <MetricCard
          title="Homogeneous Win Rate"
          value={pct(tc.homogeneousTeamWinRate)}
          icon={Shield}
          description={`${tc.homogeneousTeamWins}W/${tc.homogeneousTeamLosses}L (${tc.homogeneousTeamGames} games)`}
        />
        <MetricCard
          title="Self-Play Games"
          value={sp.totalSelfPlayGames}
          icon={Target}
          description={`Avg length: ${sp.avgSelfPlayLength.toFixed(1)} rounds`}
        />
        <MetricCard
          title="Avg Game Length Diff"
          value={`${(sp.avgSelfPlayLength - sp.avgNonSelfPlayLength).toFixed(1)}R`}
          icon={TrendingUp}
          description="Self-play vs non-self-play"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shuffle className="h-5 w-5" />
            Mixed vs Homogeneous Teams
          </CardTitle>
          <CardDescription>
            Do mixed-provider teams outperform single-provider teams?
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tc.mixedTeamGames + tc.homogeneousTeamGames > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={compositionChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis unit="%" fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Win Rate" fill="#f59e0b" />
                <Bar dataKey="Interception Rate" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">No team composition data yet. Run some tournaments with mixed teams.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Synergy Scores
          </CardTitle>
          <CardDescription>
            Which provider pairings work best together?
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tc.synergyScores.length > 0 ? (
            <div className="space-y-3">
              {tc.synergyScores
                .sort((a, b) => b.winRate - a.winRate)
                .map((s, i) => {
                  const label = s.provider1 === s.provider2
                    ? `${s.provider1} (solo)`
                    : `${s.provider1} + ${s.provider2}`;
                  return (
                    <div key={i} className="border rounded-lg p-3" data-testid={`synergy-${s.provider1}-${s.provider2}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{label}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{s.games} games</Badge>
                          <Badge variant={s.winRate >= 0.5 ? "default" : "secondary"}>
                            {pct(s.winRate)} win rate
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 rounded bg-green-500"
                          style={{ width: `${s.winRate * 100}%` }}
                        />
                        <div
                          className="h-2 rounded bg-red-300 dark:bg-red-800"
                          style={{ width: `${(1 - s.winRate) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{s.wins}W / {s.losses}L</span>
                        <span>Interception vulnerability: {pct(s.interceptionVulnerability)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No synergy data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Self-Play Variance Analysis
          </CardTitle>
          <CardDescription>
            How much randomness exists when the same model plays itself?
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sp.modelStats.length > 0 ? (
            <div className="space-y-4">
              {sp.modelStats.map((ms) => (
                <div key={ms.model} className="border rounded-lg p-4" data-testid={`self-play-${ms.model}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold">{ms.model}</span>
                    <Badge variant="outline">{ms.games} self-play games</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Amber Wins</div>
                      <div className="font-bold text-amber-600 dark:text-amber-400">{ms.amberWins}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Blue Wins</div>
                      <div className="font-bold text-blue-600 dark:text-blue-400">{ms.blueWins}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Win Rate Variance</div>
                      <div className="font-bold">{ms.winRateVariance.toFixed(3)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Avg Game Length</div>
                      <div className="font-bold">{ms.avgGameLength.toFixed(1)} rounds</div>
                    </div>
                  </div>
                  {ms.gameLengths.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-1">Game Length Distribution</div>
                      <div className="flex items-end gap-1 h-12">
                        {ms.gameLengths.map((len, i) => (
                          <div
                            key={i}
                            className="bg-primary/60 rounded-t flex-1 min-w-[4px]"
                            style={{ height: `${Math.min((len / Math.max(...ms.gameLengths)) * 100, 100)}%` }}
                            title={`Game ${i + 1}: ${len} rounds`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {ms.tokenAccumulation.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-2">Round-by-Round Token Accumulation (cumulative avg)</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={ms.tokenAccumulation}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="round" fontSize={10} label={{ value: "Round", position: "insideBottom", offset: -2, fontSize: 10 }} />
                          <YAxis fontSize={10} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="avgAmberWhite" name="Amber Miscomm" fill="#f59e0b" />
                          <Bar dataKey="avgAmberBlack" name="Amber Intercept" fill="#d97706" />
                          <Bar dataKey="avgBlueWhite" name="Blue Miscomm" fill="#3b82f6" />
                          <Bar dataKey="avgBlueBlack" name="Blue Intercept" fill="#1d4ed8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No self-play data yet. Run a Self-Play Series tournament.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClueAnalysisSection() {
  const [matchId, setMatchId] = useState("");
  const [submittedId, setSubmittedId] = useState<number | null>(null);

  const { data: analysis, isLoading, isError } = useQuery<MatchAnalysisResponse>({
    queryKey: ["/api/matches", submittedId, "analysis"],
    enabled: submittedId !== null,
  });

  const handleAnalyze = () => {
    const id = parseInt(matchId);
    if (!isNaN(id)) setSubmittedId(id);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Clue Analysis
          </CardTitle>
          <CardDescription>
            Analyze clues from a specific match to see which were too obvious or too obscure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Enter Match ID..."
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              className="max-w-[200px]"
              data-testid="input-analysis-match-id"
            />
            <Button onClick={handleAnalyze} disabled={!matchId.trim()} data-testid="button-analyze-match">
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Failed to load analysis. Make sure the match ID is valid.
          </CardContent>
        </Card>
      )}

      {analysis && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Match #{analysis.match.id} — {analysis.match.gameId}
                {analysis.match.winner && (
                  <Badge className={`ml-2 ${analysis.match.winner === "amber" ? "bg-amber-500" : "bg-blue-500"} text-white`}>
                    {analysis.match.winner} wins
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {analysis.match.totalRounds} rounds | Amber keywords: {(analysis.match.amberKeywords as string[]).join(", ")} | Blue keywords: {(analysis.match.blueKeywords as string[]).join(", ")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(analysis.crossModelAnalysis || analysis.analysis).map((item, i) => {
                  const crossItem = analysis.crossModelAnalysis?.[i] as CrossModelClueAnalysis | undefined;
                  return (
                    <div
                      key={i}
                      className={`border rounded-lg p-4 ${
                        item.status === "too_obvious" ? "border-red-300 bg-red-50 dark:bg-red-950/20" :
                        item.status === "too_obscure" ? "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20" :
                        "border-green-300 bg-green-50 dark:bg-green-950/20"
                      }`}
                      data-testid={`clue-analysis-${item.roundNumber}-${item.team}`}
                    >
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Badge variant="outline">Round {item.roundNumber}</Badge>
                        <Badge className={item.team === "amber" ? "bg-amber-500 text-white" : "bg-blue-500 text-white"}>
                          {item.team}
                        </Badge>
                        <span className="text-sm text-muted-foreground">by {item.clueGiver}</span>
                        {crossItem && (
                          <Badge
                            variant="outline"
                            className={crossItem.isCrossModel
                              ? "border-purple-400 text-purple-600 dark:text-purple-400"
                              : "border-gray-300 text-gray-500"
                            }
                            data-testid={`cross-model-badge-${item.roundNumber}-${item.team}`}
                          >
                            {crossItem.isCrossModel ? "Cross-Model" : "Same-Model"}
                          </Badge>
                        )}
                        <Badge
                          variant={item.status === "good" ? "default" : "destructive"}
                          className="ml-auto"
                        >
                          {item.status === "good" && <><Check className="h-3 w-3 mr-1" />Good</>}
                          {item.status === "too_obvious" && <><AlertTriangle className="h-3 w-3 mr-1" />Too Obvious</>}
                          {item.status === "too_obscure" && <><X className="h-3 w-3 mr-1" />Too Obscure</>}
                        </Badge>
                      </div>

                      {crossItem && crossItem.isCrossModel && (
                        <div className="mb-3 p-2 rounded bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 text-xs">
                          <span className="font-medium text-purple-700 dark:text-purple-300">
                            Clue giver: {crossItem.clueGiverProvider} → Guesser(s): {crossItem.guesserProviders.join(", ")}
                          </span>
                          {!item.ownCorrect && (
                            <span className="ml-2 text-red-600 dark:text-red-400">Cross-architecture interpretation failed</span>
                          )}
                          {item.ownCorrect && !item.intercepted && (
                            <span className="ml-2 text-green-600 dark:text-green-400">Cross-architecture communication succeeded</span>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {item.clueKeywordMap.map((ckm, j) => (
                          <div key={j} className="border rounded p-2 bg-background">
                            <div className="text-xs text-muted-foreground mb-1">Position {ckm.position}</div>
                            <div className="font-medium text-sm">Keyword: <span className="text-primary">{ckm.keyword}</span></div>
                            <div className="text-sm">Clue: <span className="font-mono">{ckm.clue}</span></div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                        <span>Code: [{item.code.join(", ")}]</span>
                        <span>{item.ownCorrect ? "✓ Own team decoded" : "✗ Own team failed"}</span>
                        {item.intercepted && <span className="text-red-500">⚠ Intercepted by opponent</span>}
                      </div>
                    </div>
                  );
                })}
                {analysis.analysis.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">No round data found for this match.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {analysis.crossModelAnalysis && analysis.crossModelAnalysis.some(c => c.isCrossModel) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shuffle className="h-5 w-5" />
                  Cross-Model Communication Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const cross = analysis.crossModelAnalysis.filter(c => c.isCrossModel);
                  const same = analysis.crossModelAnalysis.filter(c => !c.isCrossModel);
                  const crossSuccess = cross.filter(c => c.ownCorrect).length;
                  const sameSuccess = same.filter(c => c.ownCorrect).length;
                  const crossIntercepted = cross.filter(c => c.intercepted).length;
                  const sameIntercepted = same.filter(c => c.intercepted).length;

                  return (
                    <div className="grid grid-cols-2 gap-4" data-testid="cross-model-summary">
                      <div className="border rounded-lg p-4">
                        <h4 className="font-semibold text-sm mb-2 text-purple-600 dark:text-purple-400">Cross-Model Clues</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>{cross.length}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Decoded</span><span className="text-green-600">{crossSuccess} ({cross.length > 0 ? pct(crossSuccess / cross.length) : "0%"})</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Intercepted</span><span className="text-red-600">{crossIntercepted} ({cross.length > 0 ? pct(crossIntercepted / cross.length) : "0%"})</span></div>
                        </div>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h4 className="font-semibold text-sm mb-2">Same-Model Clues</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>{same.length}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Decoded</span><span className="text-green-600">{sameSuccess} ({same.length > 0 ? pct(sameSuccess / same.length) : "0%"})</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Intercepted</span><span className="text-red-600">{sameIntercepted} ({same.length > 0 ? pct(sameIntercepted / same.length) : "0%"})</span></div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ExportSection() {
  const handleExport = (endpoint: string, filename: string) => {
    window.open(endpoint, "_blank");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileDown className="h-5 w-5" />
          Export Data
        </CardTitle>
        <CardDescription>
          Download match results and AI logs for external analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">Match Data</h4>
            <p className="text-sm text-muted-foreground">Export all completed matches with round details</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("/api/export/matches?format=json", "matches.json")}
                data-testid="button-export-matches-json"
              >
                <FileDown className="h-4 w-4 mr-1" />
                JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("/api/export/matches?format=csv", "matches.csv")}
                data-testid="button-export-matches-csv"
              >
                <FileDown className="h-4 w-4 mr-1" />
                CSV
              </Button>
            </div>
          </div>
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">AI Call Logs</h4>
            <p className="text-sm text-muted-foreground">Export AI prompts, responses, and timing data</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("/api/export/ai-logs?format=json", "ai-logs.json")}
                data-testid="button-export-logs-json"
              >
                <FileDown className="h-4 w-4 mr-1" />
                JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("/api/export/ai-logs?format=csv", "ai-logs.csv")}
                data-testid="button-export-logs-csv"
              >
                <FileDown className="h-4 w-4 mr-1" />
                CSV
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EvalDashboard() {
  const [, setLocation] = useLocation();
  const [filterModel, setFilterModel] = useState("");
  const [filterStrategy, setFilterStrategy] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const queryParams = new URLSearchParams();
  if (filterModel) queryParams.set("model", filterModel);
  if (filterStrategy) queryParams.set("strategy", filterStrategy);
  if (filterDateFrom) queryParams.set("dateFrom", filterDateFrom);
  if (filterDateTo) queryParams.set("dateTo", filterDateTo);

  const queryString = queryParams.toString();
  const { data, isLoading } = useQuery<EvalData>({
    queryKey: ["/api/eval/metrics" + (queryString ? "?" + queryString : "")],
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

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")} data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Home
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-eval-title">Eval Dashboard</h1>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="h-4 w-4 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="teams" data-testid="tab-teams">
              <Shuffle className="h-4 w-4 mr-1" />
              Team Composition
            </TabsTrigger>
            <TabsTrigger value="experiments" data-testid="tab-experiments">
              <FlaskConical className="h-4 w-4 mr-1" />
              A/B Tests
            </TabsTrigger>
            <TabsTrigger value="analysis" data-testid="tab-analysis">
              <Eye className="h-4 w-4 mr-1" />
              Clue Analysis
            </TabsTrigger>
            <TabsTrigger value="export" data-testid="tab-export">
              <FileDown className="h-4 w-4 mr-1" />
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardContent className="flex flex-wrap gap-3 py-4">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Model</label>
                  <Input
                    placeholder="Filter by model..."
                    value={filterModel}
                    onChange={(e) => setFilterModel(e.target.value)}
                    className="h-9"
                    data-testid="input-eval-filter-model"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Strategy</label>
                  <Input
                    placeholder="Filter by strategy..."
                    value={filterStrategy}
                    onChange={(e) => setFilterStrategy(e.target.value)}
                    className="h-9"
                    data-testid="input-eval-filter-strategy"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">From</label>
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="h-9"
                    data-testid="input-eval-filter-from"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">To</label>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="h-9"
                    data-testid="input-eval-filter-to"
                  />
                </div>
              </CardContent>
            </Card>

            {isLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-[300px]" />
              </div>
            ) : data ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <MetricCard
                    title="Total Matches"
                    value={data.summary.totalMatches}
                    icon={Target}
                  />
                  <MetricCard
                    title="Total Rounds"
                    value={data.summary.totalRounds}
                    icon={BookOpen}
                  />
                  <MetricCard
                    title="Avg Rounds/Game"
                    value={data.summary.avgRoundsPerGame.toFixed(1)}
                    icon={TrendingUp}
                  />
                </div>

                <ModelMetricsChart metrics={data.modelMetrics} />
                <ModelDetailsTable metrics={data.modelMetrics} />
                <MatchupTable matchups={data.matchupMetrics} />
                <StrategyComparison strategies={data.strategyMetrics} />
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-40" />
                  <p className="text-lg font-medium">No data yet</p>
                  <p className="text-sm mt-1">Play some games to start seeing metrics</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="teams">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : data ? (
              <TeamCompositionSection data={data} />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Shuffle className="h-12 w-12 mx-auto mb-4 opacity-40" />
                  <p className="text-lg font-medium">No data yet</p>
                  <p className="text-sm mt-1">Run some tournaments with mixed teams to see composition analytics</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="experiments">
            <ExperimentsSection />
          </TabsContent>

          <TabsContent value="analysis">
            <ClueAnalysisSection />
          </TabsContent>

          <TabsContent value="export">
            <ExportSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
