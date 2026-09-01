import { useEffect, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { RoundHistory } from "@shared/schema";

// Always-visible footer merging what used to be two separate, overlapping
// features: the opponent clue-history table and the deduction-notes
// scratchpad. Shows every clue ever given for each keyword slot, for both
// teams, plus an editable guess for the opponent's keywords.

interface SlotClue {
  round: number;
  clue: string;
}

function buildSlotClues(
  history: RoundHistory[],
  current: { round: number; clues: string[]; code: [number, number, number] } | null
): SlotClue[][] {
  const bySlot: SlotClue[][] = [[], [], [], []];
  // Once a round finishes, its clues live in both `history` and (until
  // "Next Round" is clicked) `currentClues` — only append `current` if it
  // isn't already recorded, or it'd get counted twice.
  const alreadyRecorded = current !== null && history.some(h => h.round === current.round);
  const rounds: { round: number; clues: string[]; targetCode: [number, number, number] }[] =
    current && !alreadyRecorded
      ? [...history, { round: current.round, clues: current.clues, targetCode: current.code }]
      : history;

  for (const r of rounds) {
    r.clues.forEach((clue, i) => {
      const slot = r.targetCode[i] - 1;
      if (slot >= 0 && slot < bySlot.length) {
        bySlot[slot].push({ round: r.round, clue });
      }
    });
  }
  return bySlot;
}

function getStorageKey(gameId: string) {
  return `deduction_notes_${gameId}`;
}

function loadNotes(gameId: string): [string, string, string, string] {
  try {
    const stored = localStorage.getItem(getStorageKey(gameId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length === 4) {
        return parsed as [string, string, string, string];
      }
    }
  } catch {}
  return ["", "", "", ""];
}

function saveNotes(gameId: string, notes: [string, string, string, string]) {
  localStorage.setItem(getStorageKey(gameId), JSON.stringify(notes));
}

function ClueChips({ clues }: { clues: SlotClue[] }) {
  if (clues.length === 0) {
    return <span className="text-[10px] text-muted-foreground">No clues yet</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {clues.map((c, i) => (
        <span
          key={i}
          className="text-[10px] font-mono uppercase bg-muted px-1.5 py-0.5 rounded"
          title={`Round ${c.round}`}
        >
          {c.clue}
        </span>
      ))}
    </div>
  );
}

export function ClueHistoryPanel() {
  const { gameState, myTeam } = useGame();
  const [notes, setNotes] = useState<[string, string, string, string]>(["", "", "", ""]);

  const gameId = gameState?.id ?? null;

  useEffect(() => {
    if (gameId) setNotes(loadNotes(gameId));
  }, [gameId]);

  if (!gameState || !myTeam) return null;

  const opponentTeam = myTeam === "amber" ? "blue" : "amber";

  // Clues aren't "revealed" until both teams have finished giving them —
  // the phase only advances past giving_clues once that's true. Reading
  // the opponent's currentClues before then would show them the instant
  // they're submitted rather than when the round naturally reveals them.
  const cluesRevealed = gameState.phase !== "giving_clues";

  const myClueSlots = buildSlotClues(
    gameState.teams[myTeam].history,
    gameState.currentClues[myTeam]
      ? { round: gameState.round, clues: gameState.currentClues[myTeam]!, code: gameState.currentCode[myTeam]! }
      : null
  );
  const opponentClueSlots = buildSlotClues(
    gameState.teams[opponentTeam].history,
    cluesRevealed && gameState.currentClues[opponentTeam]
      ? { round: gameState.round, clues: gameState.currentClues[opponentTeam]!, code: gameState.currentCode[opponentTeam]! }
      : null
  );

  const myKeywords = gameState.teams[myTeam].keywords;

  const handleNoteChange = (index: number, value: string) => {
    if (!gameId) return;
    setNotes(prev => {
      const updated = [...prev] as [string, string, string, string];
      updated[index] = value;
      saveNotes(gameId, updated);
      return updated;
    });
  };

  const teamLabelClass = (team: "amber" | "blue") =>
    team === "amber" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400";

  return (
    <div className="border-t bg-card shrink-0" data-testid="clue-history-panel">
      <div className="grid grid-cols-2">
        <div className="p-3 text-xs font-semibold text-muted-foreground" data-testid="clue-history-own">
          Your Team's Clues
        </div>
        <div className="p-3 border-l text-xs font-semibold text-muted-foreground" data-testid="clue-history-opponent">
          Opponent's Clues
        </div>

        {[0, 1, 2, 3].flatMap(i => [
          <div key={`own-${i}`} className="px-3 pb-3">
            <div className={cn("text-xs font-medium", teamLabelClass(myTeam))}>
              {i + 1}. {myKeywords[i]}
            </div>
            <ClueChips clues={myClueSlots[i]} />
          </div>,

          <div key={`opp-${i}`} className="px-3 pb-3 border-l">
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium shrink-0", teamLabelClass(opponentTeam))}>
                Keyword {i + 1}
              </span>
              <Input
                value={notes[i]}
                onChange={(e) => handleNoteChange(i, e.target.value)}
                placeholder="Your guess..."
                className="h-6 text-xs flex-1 min-w-0"
                data-testid={`input-note-${i + 1}`}
              />
            </div>
            <ClueChips clues={opponentClueSlots[i]} />
          </div>,
        ])}
      </div>
    </div>
  );
}
