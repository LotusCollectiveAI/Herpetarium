import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Dna, Play, Bot, BarChart3, Loader2, ChevronDown, ChevronRight, Zap, TrendingUp, GitBranch, Shield, Brain, Crosshair, BookOpen, AlertTriangle, Square, DollarSign } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import type { MODEL_OPTIONS, AIProvider } from "@shared/schema";

interface EvolutionRun {
  id: number;
  name: string;
  status: string;
  config: any;
  populationSize: number;
  totalGenerations: number;
  currentGeneration: number;
  mutationRate: string;
  crossoverRate: string;
  elitismCount: number;
  budgetCapUsd: string | null;
  actualCostUsd: string | null;
  phaseTransitions: any[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface Generation {
  id: number;
  evolutionRunId: number;
  generationNumber: number;
  status: string;
  avgFitness: string | null;
  maxFitness: string | null;
  minFitness: string | null;
  fitnessStdDev: string | null;
  avgElo: number | null;
  maxElo: number | null;
  diversityScore: string | null;
  matchIds: number[];
}

interface GenomeModules {
  cluePhilosophy: string;
  opponentModeling: string;
  riskTolerance: string;
  memoryPolicy: string;
}

interface StrategyGenome {
  id: number;
  evolutionRunId: number;
  generationNumber: number;
  parentIds: number[];
  modules: GenomeModules;
  fitnessScore: string | null;
  eloRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  interceptionRate: string | null;
  miscommunicationRate: string | null;
  lineageTag: string | null;
  mutationLog: string | null;
}

interface RunDetail extends EvolutionRun {
  generations: Generation[];
  currentPopulation: StrategyGenome[];
  isRunning: boolean;
}

const MODEL_MAP: Record<string, Array<{ value: string; label: string }>> = {
  chatgpt: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  claude: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-haiku-4-20250414", label: "Claude Haiku 4" },
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
};

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-gray-500/20 text-gray-400",
    running: "bg-amber-500/20 text-amber-400",
    completed: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
    stopped: "bg-gray-500/20 text-gray-400",
    budget_exceeded: "bg-orange-500/20 text-orange-400",
  };
  return <Badge data-testid={`badge-status-${status}`} className={variants[status] || "bg-gray-500/20 text-gray-400"}>{status.replace("_", " ")}</Badge>;
}

function PhaseTransitionBadge({ type }: { type: string }) {
  const variants: Record<string, { color: string; icon: any }> = {
    exploration: { color: "bg-blue-500/20 text-blue-400", icon: Crosshair },
    exploitation: { color: "bg-amber-500/20 text-amber-400", icon: TrendingUp },
    convergence: { color: "bg-green-500/20 text-green-400", icon: GitBranch },
    collapse: { color: "bg-red-500/20 text-red-400", icon: AlertTriangle },
  };
  const v = variants[type] || { color: "bg-gray-500/20 text-gray-400", icon: Zap };
  const Icon = v.icon;
  return <Badge className={v.color}><Icon className="w-3 h-3 mr-1" />{type}</Badge>;
}

function CreateRunForm({ onCreated }: { onCreated: () => void }) {
  const [provider, setProvider] = useState<string>("gemini");
  const [model, setModel] = useState<string>("gemini-2.0-flash");
  const [popSize, setPopSize] = useState(8);
  const [generations, setGenerations] = useState(5);
  const [mutationRate, setMutationRate] = useState(0.3);
  const [crossoverRate, setCrossoverRate] = useState(0.7);
  const [elitism, setElitism] = useState(2);
  const [matchesPerEval, setMatchesPerEval] = useState(1);
  const [budgetCap, setBudgetCap] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/evolution", {
        baseProvider: provider,
        baseModel: model,
        populationSize: popSize,
        totalGenerations: generations,
        mutationRate,
        crossoverRate,
        elitismCount: elitism,
        matchesPerEvaluation: matchesPerEval,
        budgetCapUsd: budgetCap || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Evolution run started" });
      queryClient.invalidateQueries({ queryKey: ["/api/evolution"] });
      onCreated();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const totalMatches = (popSize * (popSize - 1)) / 2 * matchesPerEval * generations;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Dna className="w-5 h-5 text-amber-400" />New Evolution Run</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground">Provider</label>
            <Select value={provider} onValueChange={(v) => { setProvider(v); setModel(MODEL_MAP[v]?.[0]?.value || ""); }}>
              <SelectTrigger data-testid="select-provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chatgpt">ChatGPT</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Model</label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger data-testid="select-model"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(MODEL_MAP[provider] || []).map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-muted-foreground">Population Size</label>
            <Input data-testid="input-pop-size" type="number" value={popSize} onChange={e => setPopSize(parseInt(e.target.value) || 8)} min={4} max={20} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Generations</label>
            <Input data-testid="input-generations" type="number" value={generations} onChange={e => setGenerations(parseInt(e.target.value) || 5)} min={1} max={50} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Matches per Eval</label>
            <Input data-testid="input-matches-per-eval" type="number" value={matchesPerEval} onChange={e => setMatchesPerEval(parseInt(e.target.value) || 1)} min={1} max={5} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-muted-foreground">Mutation Rate</label>
            <Input data-testid="input-mutation-rate" type="number" step="0.05" value={mutationRate} onChange={e => setMutationRate(parseFloat(e.target.value) || 0.3)} min={0} max={1} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Crossover Rate</label>
            <Input data-testid="input-crossover-rate" type="number" step="0.05" value={crossoverRate} onChange={e => setCrossoverRate(parseFloat(e.target.value) || 0.7)} min={0} max={1} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Elitism Count</label>
            <Input data-testid="input-elitism" type="number" value={elitism} onChange={e => setElitism(parseInt(e.target.value) || 2)} min={0} max={10} />
          </div>
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Budget Cap (USD, optional)</label>
          <Input data-testid="input-budget-cap" placeholder="e.g., 5.00" value={budgetCap} onChange={e => setBudgetCap(e.target.value)} />
        </div>

        <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded">
          Estimated total matches: <span className="font-medium text-foreground">{totalMatches}</span> across {generations} generations
        </div>

        <Button
          data-testid="button-start-evolution"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="w-full bg-amber-600 hover:bg-amber-700"
        >
          {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Start Evolution
        </Button>
      </CardContent>
    </Card>
  );
}

function FitnessChart({ generations, phaseTransitions }: { generations: Generation[]; phaseTransitions: any[] }) {
  const data = generations
    .filter(g => g.status === "completed")
    .map(g => ({
      gen: g.generationNumber,
      avgFitness: g.avgFitness ? parseFloat(g.avgFitness) : 0,
      maxFitness: g.maxFitness ? parseFloat(g.maxFitness) : 0,
      minFitness: g.minFitness ? parseFloat(g.minFitness) : 0,
      diversity: g.diversityScore ? parseFloat(g.diversityScore) : 0,
      avgElo: g.avgElo || 1200,
      maxElo: g.maxElo || 1200,
    }));

  if (data.length === 0) return <div className="text-muted-foreground text-center py-8">No generation data yet</div>;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-2">Fitness Over Generations</h4>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="gen" label={{ value: "Generation", position: "insideBottom", offset: -5 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Legend />
            {phaseTransitions?.map((pt: any, i: number) => (
              <ReferenceLine key={i} x={pt.toGeneration} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: pt.type, position: "top", fill: "hsl(var(--destructive))" }} />
            ))}
            <Line type="monotone" dataKey="maxFitness" stroke="hsl(38 92% 50%)" strokeWidth={2} name="Max Fitness" dot={false} />
            <Line type="monotone" dataKey="avgFitness" stroke="hsl(217 91% 60%)" strokeWidth={2} name="Avg Fitness" dot={false} />
            <Line type="monotone" dataKey="minFitness" stroke="hsl(var(--muted-foreground))" strokeWidth={1} name="Min Fitness" dot={false} strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Elo & Diversity</h4>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="gen" stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="elo" stroke="hsl(38 92% 50%)" />
            <YAxis yAxisId="diversity" orientation="right" stroke="hsl(142 71% 45%)" domain={[0, 1]} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Legend />
            <Line yAxisId="elo" type="monotone" dataKey="maxElo" stroke="hsl(38 92% 50%)" strokeWidth={2} name="Max Elo" dot={false} />
            <Line yAxisId="elo" type="monotone" dataKey="avgElo" stroke="hsl(217 91% 60%)" strokeWidth={2} name="Avg Elo" dot={false} />
            <Line yAxisId="diversity" type="monotone" dataKey="diversity" stroke="hsl(142 71% 45%)" strokeWidth={2} name="Diversity" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GenomeCard({ genome, rank }: { genome: StrategyGenome; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const modules = genome.modules;
  const winRate = genome.matchesPlayed > 0 ? (genome.wins / genome.matchesPlayed * 100).toFixed(0) : "—";

  const moduleIcons: Record<keyof GenomeModules, any> = {
    cluePhilosophy: Brain,
    opponentModeling: Crosshair,
    riskTolerance: Shield,
    memoryPolicy: BookOpen,
  };

  const moduleLabels: Record<keyof GenomeModules, string> = {
    cluePhilosophy: "Clue Philosophy",
    opponentModeling: "Opponent Modeling",
    riskTolerance: "Risk Tolerance",
    memoryPolicy: "Memory Policy",
  };

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className="border-border/50">
        <CollapsibleTrigger className="w-full text-left">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rank <= 3 ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"}`}>
                  #{rank}
                </div>
                <div>
                  <div className="font-medium text-sm">{genome.lineageTag || `Genome ${genome.id}`}</div>
                  <div className="text-xs text-muted-foreground">Gen {genome.generationNumber} | Elo {genome.eloRating}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-sm">
                  <div className="font-medium">{winRate}% WR</div>
                  <div className="text-xs text-muted-foreground">{genome.wins}W/{genome.losses}L ({genome.matchesPlayed})</div>
                </div>
                {genome.fitnessScore && (
                  <Badge variant="outline" className="text-xs">F: {parseFloat(genome.fitnessScore).toFixed(3)}</Badge>
                )}
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {(Object.keys(moduleLabels) as (keyof GenomeModules)[]).map(key => {
              const Icon = moduleIcons[key];
              return (
                <div key={key} className="bg-muted/30 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium">{moduleLabels[key]}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{modules[key]}</p>
                </div>
              );
            })}
            {genome.mutationLog && (
              <div className="text-xs text-muted-foreground italic bg-muted/20 p-2 rounded">
                {genome.mutationLog}
              </div>
            )}
            {genome.parentIds && (genome.parentIds as number[]).length > 0 && (
              <div className="text-xs text-muted-foreground">
                <GitBranch className="w-3 h-3 inline mr-1" />Parents: {(genome.parentIds as number[]).join(", ")}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function RunDetail({ runId }: { runId: number }) {
  const { data: run, isLoading } = useQuery<RunDetail>({
    queryKey: ["/api/evolution", runId],
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.isRunning ? 5000 : false;
    },
  });

  const [selectedGen, setSelectedGen] = useState<number | null>(null);

  const { data: genGenomes } = useQuery<StrategyGenome[]>({
    queryKey: ["/api/evolution", runId, "genomes", selectedGen],
    queryFn: async () => {
      const gen = selectedGen !== null ? selectedGen : (run?.currentGeneration ? run.currentGeneration - 1 : 0);
      const res = await fetch(`/api/evolution/${runId}/genomes?generation=${gen}`);
      return res.json();
    },
    enabled: !!run,
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/evolution/${runId}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evolution", runId] });
    },
  });

  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!run) return <div className="text-muted-foreground">Run not found</div>;

  const displayGenomes = genGenomes || run.currentPopulation || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" data-testid="text-run-name">{run.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={run.status} />
            {run.isRunning && <Badge className="bg-amber-500/20 text-amber-400 animate-pulse"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>}
            <span className="text-sm text-muted-foreground">Gen {run.currentGeneration}/{run.totalGenerations}</span>
          </div>
        </div>
        {run.isRunning && (
          <Button data-testid="button-stop-evolution" variant="destructive" size="sm" onClick={() => stopMutation.mutate()}>
            <Square className="w-4 h-4 mr-1" />Stop
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-amber-400" data-testid="text-pop-size">{run.populationSize}</div>
            <div className="text-xs text-muted-foreground">Population</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-blue-400" data-testid="text-current-gen">{run.currentGeneration}/{run.totalGenerations}</div>
            <div className="text-xs text-muted-foreground">Generations</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-400">{run.phaseTransitions?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Phase Transitions</div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{run.actualCostUsd ? `$${parseFloat(run.actualCostUsd).toFixed(4)}` : "—"}</div>
            <div className="text-xs text-muted-foreground">Cost {run.budgetCapUsd && `/ $${run.budgetCapUsd}`}</div>
          </CardContent>
        </Card>
      </div>

      {run.phaseTransitions && run.phaseTransitions.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Phase Transitions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.phaseTransitions.map((pt: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <PhaseTransitionBadge type={pt.type} />
                <span className="text-muted-foreground">Gen {pt.fromGeneration} → {pt.toGeneration}:</span>
                <span className="text-xs">{pt.evidence}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="fitness">
        <TabsList>
          <TabsTrigger value="fitness" data-testid="tab-fitness"><BarChart3 className="w-4 h-4 mr-1" />Fitness</TabsTrigger>
          <TabsTrigger value="population" data-testid="tab-population"><Dna className="w-4 h-4 mr-1" />Population</TabsTrigger>
          <TabsTrigger value="lineage" data-testid="tab-lineage"><GitBranch className="w-4 h-4 mr-1" />Lineage</TabsTrigger>
        </TabsList>

        <TabsContent value="fitness">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <FitnessChart generations={run.generations || []} phaseTransitions={run.phaseTransitions || []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="population">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Population (Generation {selectedGen !== null ? selectedGen : (run.currentGeneration > 0 ? run.currentGeneration - 1 : 0)})</CardTitle>
                <Select
                  value={String(selectedGen !== null ? selectedGen : (run.currentGeneration > 0 ? run.currentGeneration - 1 : 0))}
                  onValueChange={v => setSelectedGen(parseInt(v))}
                >
                  <SelectTrigger className="w-40" data-testid="select-generation"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: run.currentGeneration || 1 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>Generation {i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {displayGenomes.length === 0 ? (
                <div className="text-muted-foreground text-center py-4">No genomes found for this generation</div>
              ) : (
                displayGenomes.map((g, i) => <GenomeCard key={g.id} genome={g} rank={i + 1} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lineage">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lineage Browser</CardTitle>
            </CardHeader>
            <CardContent>
              {displayGenomes.length === 0 ? (
                <div className="text-muted-foreground text-center py-4">No lineage data available</div>
              ) : (
                <div className="space-y-3">
                  {displayGenomes.slice(0, 5).map(g => (
                    <div key={g.id} className="bg-muted/30 rounded p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <GitBranch className="w-4 h-4 text-amber-400" />
                        <span className="font-medium text-sm">{g.lineageTag || `Genome ${g.id}`}</span>
                        <Badge variant="outline" className="text-xs">Elo {g.eloRating}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {g.parentIds && (g.parentIds as number[]).length > 0 ? (
                          <span>Descended from genomes: {(g.parentIds as number[]).join(", ")}</span>
                        ) : (
                          <span>Seed genome (no parents)</span>
                        )}
                      </div>
                      {g.mutationLog && (
                        <div className="text-xs text-muted-foreground mt-1 italic">{g.mutationLog}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Provider:</span> <span className="font-medium">{run.config?.baseProvider}</span></div>
            <div><span className="text-muted-foreground">Model:</span> <span className="font-medium">{run.config?.baseModel}</span></div>
            <div><span className="text-muted-foreground">Mutation:</span> <span className="font-medium">{run.mutationRate}</span></div>
            <div><span className="text-muted-foreground">Crossover:</span> <span className="font-medium">{run.crossoverRate}</span></div>
            <div><span className="text-muted-foreground">Elitism:</span> <span className="font-medium">{run.elitismCount}</span></div>
            <div><span className="text-muted-foreground">Matches/Eval:</span> <span className="font-medium">{run.config?.matchesPerEvaluation || 1}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Evolution() {
  const [, setLocation] = useLocation();
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: runs, isLoading } = useQuery<EvolutionRun[]>({
    queryKey: ["/api/evolution"],
    refetchInterval: 10000,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => selectedRunId ? setSelectedRunId(null) : setLocation("/")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1" />Back
            </Button>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Dna className="w-5 h-5 text-amber-400" />
              Evolution Lab
            </h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {selectedRunId ? (
          <RunDetail runId={selectedRunId} />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Evolution Runs</h2>
              <Button
                data-testid="button-new-run"
                onClick={() => setShowCreate(!showCreate)}
                className="bg-amber-600 hover:bg-amber-700"
                size="sm"
              >
                <Dna className="w-4 h-4 mr-1" />{showCreate ? "Cancel" : "New Run"}
              </Button>
            </div>

            {showCreate && <CreateRunForm onCreated={() => setShowCreate(false)} />}

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : !runs || runs.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="text-center py-12 text-muted-foreground">
                  <Dna className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No evolution runs yet. Start one to evolve AI strategies.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {runs.map(run => (
                  <Card
                    key={run.id}
                    className="border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setSelectedRunId(run.id)}
                    data-testid={`card-evolution-run-${run.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{run.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Pop {run.populationSize} | Gen {run.currentGeneration}/{run.totalGenerations}
                            {run.actualCostUsd && ` | $${parseFloat(run.actualCostUsd).toFixed(4)}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={run.status} />
                          {run.status === "running" && <Loader2 className="w-4 h-4 animate-spin text-amber-400" />}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
