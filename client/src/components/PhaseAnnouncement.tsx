import { useEffect, useState } from "react";
import type { GamePhase } from "@shared/schema";
import { cn } from "@/lib/utils";

interface PhaseAnnouncementProps {
  phase: GamePhase;
  round: number;
  myTeam: "amber" | "blue" | null;
}

const phaseConfig: Record<GamePhase, { title: string; description: string; color: "neutral" | "amber" | "blue" | "green" | "red" } | null> = {
  lobby: null,
  team_setup: { title: "Team Setup", description: "Choose your teams!", color: "neutral" },
  giving_clues: { title: "Clue Phase", description: "Encryptors, give your clues!", color: "neutral" },
  own_team_deliberation: { title: "Team Deliberation", description: "Discuss and decode your team's code!", color: "neutral" },
  own_team_guessing: { title: "Decode Phase", description: "Crack your team's code!", color: "neutral" },
  opponent_deliberation: { title: "Interception Deliberation", description: "Analyze and crack the enemy's code!", color: "red" },
  opponent_intercepting: { title: "Interception Phase", description: "Try to crack the enemy's code!", color: "red" },
  round_results: { title: "Results", description: "See how everyone did!", color: "neutral" },
  game_over: null,
};

export function PhaseAnnouncement({ phase, round, myTeam }: PhaseAnnouncementProps) {
  const [visible, setVisible] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<GamePhase | null>(null);

  useEffect(() => {
    if (phase === currentPhase || !phaseConfig[phase]) return;

    setCurrentPhase(phase);
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [phase, currentPhase]);

  if (!visible || !currentPhase) return null;

  const config = phaseConfig[currentPhase];
  if (!config) return null;

  const title = currentPhase === "giving_clues" || currentPhase === "own_team_guessing" || currentPhase === "opponent_intercepting"
    ? `Round ${round} — ${config.title}`
    : config.title;

  const colorClasses = {
    neutral: "from-primary/90 to-primary/70 text-primary-foreground",
    amber: "from-amber-500/90 to-amber-600/70 text-white",
    blue: "from-blue-500/90 to-blue-600/70 text-white",
    green: "from-emerald-500/90 to-emerald-600/70 text-white",
    red: "from-red-500/90 to-red-600/70 text-white",
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center pointer-events-none",
        visible ? "animate-in fade-in zoom-in-95 duration-300" : "animate-out fade-out zoom-out-95 duration-300"
      )}
      data-testid="phase-announcement"
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className={cn(
        "relative z-10 px-8 py-6 rounded-2xl bg-gradient-to-br shadow-2xl text-center",
        colorClasses[config.color]
      )}>
        <h2 className="text-2xl font-bold tracking-tight" data-testid="text-phase-title">{title}</h2>
        <p className="text-sm opacity-90 mt-1" data-testid="text-phase-description">{config.description}</p>
      </div>
    </div>
  );
}
