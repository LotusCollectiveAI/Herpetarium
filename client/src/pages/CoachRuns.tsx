import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowLeft, Brain, GitBranch, Shield, ChevronDown, ChevronRight } from "lucide-react";
import type { SprintEvaluation, PatchReviewStatus } from "@shared/schema";

interface EvaluationRecord {
  runId: string;
  sprintNumber: number;
  evaluation: SprintEvaluation;
}

interface PatchReviewRecord {
  id: number;
  runId: string;
  proposalId: string;
  committedSprint: number;
  reviewSprint: number;
  status: PatchReviewStatus;
  evaluations: any[] | null;
  summary: string | null;
}

interface PatchIndexRecord {
  id: number;
  runId: string;
  sprintNumber: number;
  module: string;
  decision: string;
  proposalId: string | null;
  reviewDueSprint: number | null;
  reviewStatus: string | null;
  reviewSummary: string | null;
}

function statusColor(status: string): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "trigger_fired": return "destructive";
    case "clear": return "default";
    case "mixed": return "secondary";
    default: return "outline";
  }
}

export default function CoachRuns() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const runId = params?.id;

  const { data: evaluations, isLoading: evalsLoading } = useQuery<EvaluationRecord[]>({
    queryKey: ["/api/coach", runId, "evaluations"],
    queryFn: async () => {
      const response = await fetch(`/api/coach/${runId}/evaluations`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!runId,
  });

  const { data: patchReviews } = useQuery<PatchReviewRecord[]>({
    queryKey: ["/api/coach", runId, "patch-reviews"],
    queryFn: async () => {
      const response = await fetch(`/api/coach/${runId}/patch-reviews`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!runId,
  });

  const { data: patches } = useQuery<PatchIndexRecord[]>({
    queryKey: ["/api/coach", runId, "patches"],
    queryFn: async () => {
      const response = await fetch(`/api/coach/${runId}/patches`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!runId,
  });

  const { data: anchors } = useQuery<any[]>({
    queryKey: ["/api/coach", runId, "anchors"],
    queryFn: async () => {
      const response = await fetch(`/api/coach/${runId}/anchors`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!runId,
  });

  if (!runId) {
    return (
      <div className="min-h-screen bg-background p-4 max-w-7xl mx-auto">
        <p className="text-muted-foreground">No coach run ID provided.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/arena")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold">Coach Run Detail</h1>
          <Badge variant="outline" className="font-mono">{runId.slice(0, 16)}</Badge>
        </div>
        <ThemeToggle />
      </div>

      <Tabs defaultValue="sprints">
        <TabsList>
          <TabsTrigger value="sprints"><Brain className="w-4 h-4 mr-1" /> Sprints</TabsTrigger>
          <TabsTrigger value="patches"><GitBranch className="w-4 h-4 mr-1" /> Patches</TabsTrigger>
          <TabsTrigger value="reviews"><Shield className="w-4 h-4 mr-1" /> Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="sprints" className="space-y-4">
          {evalsLoading ? (
            <Skeleton className="h-48" />
          ) : (evaluations || []).length === 0 ? (
            <Card><CardContent className="pt-6"><p className="text-muted-foreground">No sprint evaluations yet.</p></CardContent></Card>
          ) : (
            (evaluations || [])
              .sort((a, b) => a.sprintNumber - b.sprintNumber)
              .map((record) => (
                <SprintCard key={record.sprintNumber} record={record} />
              ))
          )}
        </TabsContent>

        <TabsContent value="patches" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Patch History (Fossil Museum)</CardTitle></CardHeader>
            <CardContent>
              {(patches || []).length === 0 ? (
                <p className="text-muted-foreground">No patches recorded.</p>
              ) : (
                <div className="space-y-2">
                  {(patches || []).map((patch) => (
                    <div key={patch.id} className="flex items-center justify-between p-3 rounded border">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">S{patch.sprintNumber}</Badge>
                        <Badge>{patch.module}</Badge>
                        <Badge variant={patch.decision === "committed" ? "default" : "secondary"}>
                          {patch.decision}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {patch.reviewDueSprint && (
                          <span className="text-xs text-muted-foreground">
                            Review due: S{patch.reviewDueSprint}
                          </span>
                        )}
                        {patch.reviewStatus && (
                          <Badge variant={statusColor(patch.reviewStatus)}>
                            {patch.reviewStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Patch Reviews</CardTitle></CardHeader>
            <CardContent>
              {(patchReviews || []).length === 0 ? (
                <p className="text-muted-foreground">No patch reviews yet.</p>
              ) : (
                <div className="space-y-3">
                  {(patchReviews || []).map((review) => (
                    <div key={review.id} className="border rounded p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {review.proposalId.slice(0, 8)}
                        </Badge>
                        <Badge>Committed S{review.committedSprint}</Badge>
                        <Badge variant="secondary">Reviewed S{review.reviewSprint}</Badge>
                        <Badge variant={statusColor(review.status)}>{review.status}</Badge>
                      </div>
                      {review.summary && (
                        <p className="text-sm text-muted-foreground">{review.summary}</p>
                      )}
                      {review.evaluations && review.evaluations.length > 0 && (
                        <ul className="mt-2 text-xs space-y-1">
                          {review.evaluations.map((ev: any, idx: number) => (
                            <li key={idx} className="pl-2 border-l-2 border-muted">
                              <Badge variant={ev.status === "fired" ? "destructive" : ev.status === "clear" ? "default" : "outline"} className="text-xs mr-1">
                                {ev.status}
                              </Badge>
                              {ev.description}
                              {ev.evidenceLines?.length > 0 && (
                                <span className="text-muted-foreground ml-1">— {ev.evidenceLines[0]}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {(anchors || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Anchor Evaluations</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(anchors || []).map((anchor: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded border">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">S{anchor.sprintNumber}</Badge>
                        <span className="text-sm">{anchor.anchorLabel}</span>
                        <Badge variant="secondary">{anchor.variant}</Badge>
                      </div>
                      {anchor.result && (
                        <span className="text-sm text-muted-foreground">
                          {JSON.stringify(anchor.result).slice(0, 60)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SprintCard({ record }: { record: EvaluationRecord }) {
  const [isOpen, setIsOpen] = useState(false);
  const ev = record.evaluation;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <CardTitle className="text-base">Sprint {record.sprintNumber}</CardTitle>
              <Badge variant="secondary">
                {ev.training.wins}W-{ev.training.losses}L-{ev.training.draws}D
              </Badge>
              <Badge variant="outline">
                WR {(ev.training.winRate * 100).toFixed(0)}%
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={ev.sideBalance.sideGap > 0.2 ? "destructive" : "secondary"}>
                Gap {(ev.sideBalance.sideGap * 100).toFixed(0)}%
              </Badge>
              <Badge variant="outline">
                {ev.complexity.genomeCharCount} chars
              </Badge>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <MetricBox label="Own Decode" value={`${(ev.execution.ownDecodeRate * 100).toFixed(1)}%`} />
              <MetricBox label="Our Intercept" value={`${(ev.execution.ourInterceptRate * 100).toFixed(1)}%`} />
              <MetricBox label="Opp Intercept" value={`${(ev.execution.opponentInterceptRateAgainstUs * 100).toFixed(1)}%`} />
              <MetricBox label="Miscomm" value={`${(ev.execution.miscommunicationRate * 100).toFixed(1)}%`} />
              <MetricBox label="Own Consensus" value={`${(ev.deliberation.ownConsensusRate * 100).toFixed(1)}%`} />
              <MetricBox label="Int Consensus" value={`${(ev.deliberation.interceptConsensusRate * 100).toFixed(1)}%`} />
              <MetricBox label="Mean Leakage" value={ev.leakage.meanLeakageScore.toFixed(2)} />
              <MetricBox label="Rounds/Match" value={ev.training.meanRoundsPerMatch.toFixed(1)} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold mb-1">Evidence</h4>
              {ev.evidenceLines.map((line, idx) => (
                <p key={idx} className="text-xs text-muted-foreground pl-2 border-l-2 border-muted">{line}</p>
              ))}
            </div>
            {ev.policyNotices.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold mb-1">Policy Notices</h4>
                {ev.policyNotices.map((notice, idx) => (
                  <Badge key={idx} variant={notice.severity === "warning" ? "destructive" : "secondary"} className="mr-1">
                    {notice.message}
                  </Badge>
                ))}
              </div>
            )}
            {ev.pendingPatchReviews.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-semibold mb-1">Pending Patch Reviews</h4>
                {ev.pendingPatchReviews.map((review, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <Badge variant={statusColor(review.status)} className="text-xs">
                      {review.status}
                    </Badge>
                    <span className="font-mono">{review.proposalId.slice(0, 8)}</span>
                    <span className="text-muted-foreground">from S{review.committedSprint}</span>
                    {review.firedTriggers.length > 0 && (
                      <span className="text-destructive">Fired: {review.firedTriggers.join(", ")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-2 rounded bg-muted/50">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
