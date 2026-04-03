import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Trophy, BarChart3, Dna, GitBranch } from "lucide-react";
import type { SprintEvaluation, GenomeModuleKey } from "@shared/schema";

interface ArenaSlot {
  slotIndex: number;
  runId: string;
  wins: number;
  losses: number;
  draws: number;
}

interface ArenaResult {
  arenaId: string;
  sprintsCompleted: number;
  totalGamesPlayed: number;
  slots: ArenaSlot[];
}

interface EvaluationRecord {
  runId: string;
  sprintNumber: number;
  evaluation: SprintEvaluation;
}

export default function Arena() {
  const [, setLocation] = useLocation();
  const arenaId = window.location.hash.replace("#", "") || null;

  const { data: runs } = useQuery<any[]>({
    queryKey: ["/api/coach-runs"],
    queryFn: async () => {
      const response = await fetch("/api/coach-runs");
      if (!response.ok) return [];
      return response.json();
    },
  });

  const arenaIds = Array.from(new Set((runs || []).filter((r: any) => r.arenaId).map((r: any) => r.arenaId)));

  const { data: evaluations, isLoading } = useQuery<EvaluationRecord[]>({
    queryKey: ["/api/arena", arenaId, "evaluations"],
    queryFn: async () => {
      if (!arenaId) return [];
      const response = await fetch(`/api/arena/${arenaId}/evaluations`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!arenaId,
  });

  const arenaRuns = (runs || []).filter((r: any) => r.arenaId === arenaId);

  // Compute standings from runs
  const standings = arenaRuns
    .map((run: any) => {
      const totalGames = (run.currentSprint || 0);
      return {
        runId: run.id,
        genome: run.currentGenome,
        sprint: run.currentSprint,
        status: run.status,
      };
    })
    .sort((a: any, b: any) => (b.sprint || 0) - (a.sprint || 0));

  // Side balance across all evaluations
  const sideBalanceData = (evaluations || [])
    .sort((a, b) => a.sprintNumber - b.sprintNumber || a.runId.localeCompare(b.runId))
    .map((record) => ({
      label: `${record.runId.slice(0, 8)}/s${record.sprintNumber}`,
      amberWinRate: record.evaluation.sideBalance.amberWinRate,
      blueWinRate: record.evaluation.sideBalance.blueWinRate,
      sideGap: record.evaluation.sideBalance.sideGap,
    }));

  // Module mutation distribution
  const moduleCounts: Record<string, number> = {};
  for (const record of evaluations || []) {
    // Count from evidence lines which modules are being patched
    // We'll count from the evaluations themselves
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold">Arena Dashboard</h1>
          {arenaId && <Badge variant="outline">{arenaId}</Badge>}
        </div>
        <ThemeToggle />
      </div>

      {!arenaId ? (
        <Card>
          <CardHeader><CardTitle>Select Arena</CardTitle></CardHeader>
          <CardContent>
            {arenaIds.length === 0 ? (
              <p className="text-muted-foreground">No arena runs found.</p>
            ) : (
              <div className="space-y-2">
                {arenaIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => window.location.hash = id}
                    className="block w-full text-left p-3 rounded border hover:bg-accent transition-colors"
                  >
                    <span className="font-mono text-sm">{id}</span>
                    <span className="text-muted-foreground ml-2">
                      ({(runs || []).filter((r: any) => r.arenaId === id).length} coaches)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="standings">
          <TabsList>
            <TabsTrigger value="standings"><Trophy className="w-4 h-4 mr-1" /> Standings</TabsTrigger>
            <TabsTrigger value="sideBalance"><BarChart3 className="w-4 h-4 mr-1" /> Side Balance</TabsTrigger>
            <TabsTrigger value="evidence"><Dna className="w-4 h-4 mr-1" /> Evidence</TabsTrigger>
          </TabsList>

          <TabsContent value="standings" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Coach Standings</CardTitle></CardHeader>
              <CardContent>
                {arenaRuns.length === 0 ? (
                  <p className="text-muted-foreground">No coaches found for this arena.</p>
                ) : (
                  <div className="space-y-2">
                    {arenaRuns.map((run: any, idx: number) => (
                      <div key={run.id} className="flex items-center justify-between p-3 rounded border">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground font-mono text-sm">#{idx + 1}</span>
                          <button
                            onClick={() => setLocation(`/coach/${run.id}`)}
                            className="font-mono text-sm text-primary hover:underline"
                          >
                            {run.id.slice(0, 12)}
                          </button>
                          <Badge variant={run.status === "completed" ? "default" : "secondary"}>
                            {run.status}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Sprint {run.currentSprint || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sideBalance" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Side Balance Across Sprints</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48" />
                ) : sideBalanceData.length === 0 ? (
                  <p className="text-muted-foreground">No evaluation data available.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Run/Sprint</th>
                          <th className="text-right p-2">Amber Win%</th>
                          <th className="text-right p-2">Blue Win%</th>
                          <th className="text-right p-2">Gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sideBalanceData.map((row, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="p-2 font-mono text-xs">{row.label}</td>
                            <td className="text-right p-2">{(row.amberWinRate * 100).toFixed(1)}%</td>
                            <td className="text-right p-2">{(row.blueWinRate * 100).toFixed(1)}%</td>
                            <td className="text-right p-2">
                              <Badge variant={row.sideGap > 0.2 ? "destructive" : "secondary"}>
                                {(row.sideGap * 100).toFixed(1)}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evidence" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Sprint Evidence Lines</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48" />
                ) : (evaluations || []).length === 0 ? (
                  <p className="text-muted-foreground">No evaluations available.</p>
                ) : (
                  <div className="space-y-4">
                    {(evaluations || []).map((record, idx) => (
                      <div key={idx} className="border rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="font-mono text-xs">{record.runId.slice(0, 8)}</Badge>
                          <Badge>Sprint {record.sprintNumber}</Badge>
                          <Badge variant="secondary">
                            {record.evaluation.training.wins}W-{record.evaluation.training.losses}L-{record.evaluation.training.draws}D
                          </Badge>
                        </div>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {record.evaluation.evidenceLines.map((line, lineIdx) => (
                            <li key={lineIdx} className="pl-2 border-l-2 border-muted">{line}</li>
                          ))}
                        </ul>
                        {record.evaluation.pendingPatchReviews.length > 0 && (
                          <div className="mt-2">
                            <span className="text-xs font-semibold">Pending Reviews:</span>
                            {record.evaluation.pendingPatchReviews.map((review, rIdx) => (
                              <Badge key={rIdx} variant={review.status === "trigger_fired" ? "destructive" : "secondary"} className="ml-1 text-xs">
                                {review.proposalId.slice(0, 8)} — {review.status}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
