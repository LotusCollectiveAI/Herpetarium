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

// Only ever slots clues from finished rounds. Which keyword position a clue
// maps to is exactly what players are supposed to deduce during the current
// round -- for their own team's guess as much as for interception -- so
// slotting the in-progress round's clue by its (still-secret-in-spirit)
// target code would hand out the answer before anyone guesses anything.
// The raw clue words for the current round are already shown, un-slotted,
// by the guessing/interception views themselves.
function buildSlotClues(history: RoundHistory[]): SlotClue[][] {
  const bySlot: SlotClue[][] = [[], [], [], []];
  for (const r of history) {
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
  const { gameState, myTeam, isReplay } = useGame();
  const [notes, setNotes] = useState<[string, string, string, string]>(["", "", "", ""]);

  const gameId = gameState?.id ?? null;

  useEffect(() => {
    if (gameId) setNotes(loadNotes(gameId));
  }, [gameId]);

  if (!gameState || !myTeam) return null;

  const opponentTeam = myTeam === "amber" ? "blue" : "amber";

  const myClueSlots = buildSlotClues(gameState.teams[myTeam].history);
  const opponentClueSlots = buildSlotClues(gameState.teams[opponentTeam].history);

  const myKeywords = gameState.teams[myTeam].keywords;

  // The server withholds the opponent's keywords for the whole game and
  // sends them once it is over, so having the word at all is the signal
  // that it is safe to show. Keying off that rather than off the phase
  // keeps the server the only thing deciding what stays secret -- during
  // play the array is empty and these stay "Keyword 1".
  const opponentKeywords = gameState.teams[opponentTeam].keywords;
  const opponentSlotLabel = (i: number) =>
    opponentKeywords[i] ? `${i + 1}. ${opponentKeywords[i]}` : `Keyword ${i + 1}`;

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

        {/* space-y-1.5 on both columns, not just the one with the input:
            the guess field's focus ring extends past its box and was
            landing on the clue chips underneath, and the two columns have
            to keep the same gap or their chip rows stop lining up. */}
        {[0, 1, 2, 3].flatMap(i => [
          <div key={`own-${i}`} className="px-3 pb-3 space-y-1.5">
            {/* h-6 matches the height the guess field gives the opposite
                column, so both sides' chip rows stay on the same line. */}
            <div
              className={cn("flex h-6 items-center text-xs font-medium", teamLabelClass(myTeam))}
              data-testid={`own-slot-${i + 1}`}
            >
              {i + 1}. {myKeywords[i]}
            </div>
            <ClueChips clues={myClueSlots[i]} />
          </div>,

          <div key={`opp-${i}`} className="px-3 pb-3 border-l space-y-1.5">
            <div className="flex h-6 items-center gap-2">
              <span
                className={cn("text-xs font-medium shrink-0", teamLabelClass(opponentTeam))}
                data-testid={`opponent-slot-${i + 1}`}
              >
                {opponentSlotLabel(i)}
              </span>
              {isReplay ? (
                // The scratchpad is for working out a code that is still
                // secret. In a recording it is already on screen, so the
                // field would be pointless to fill in -- but notes taken
                // while the game was live are worth still being able to
                // read back.
                notes[i] && (
                  <span
                    className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                    title={notes[i]}
                    data-testid={`note-readonly-${i + 1}`}
                  >
                    {notes[i]}
                  </span>
                )
              ) : (
                <Input
                  value={notes[i]}
                  onChange={(e) => handleNoteChange(i, e.target.value)}
                  placeholder="Your guess..."
                  className="h-6 text-xs flex-1 min-w-0"
                  data-testid={`input-note-${i + 1}`}
                />
              )}
            </div>
            <ClueChips clues={opponentClueSlots[i]} />
          </div>,
        ])}
      </div>
    </div>
  );
}
