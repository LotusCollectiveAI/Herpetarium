import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeductionNotesProps {
  gameId: string;
  opponentTeam: "amber" | "blue";
  defaultExpanded?: boolean;
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

export function DeductionNotes({ gameId, opponentTeam, defaultExpanded = true }: DeductionNotesProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [notes, setNotes] = useState<[string, string, string, string]>(() => loadNotes(gameId));

  useEffect(() => {
    setNotes(loadNotes(gameId));
  }, [gameId]);

  const handleChange = useCallback((index: number, value: string) => {
    setNotes(prev => {
      const updated = [...prev] as [string, string, string, string];
      updated[index] = value;
      saveNotes(gameId, updated);
      return updated;
    });
  }, [gameId]);

  const teamColor = opponentTeam === "amber" ? "amber" : "blue";
  const hasNotes = notes.some(n => n.trim() !== "");

  return (
    <div
      className={cn(
        "rounded-lg border",
        opponentTeam === "amber" ? "border-amber-500/30" : "border-blue-500/30"
      )}
      data-testid="deduction-notes"
    >
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between px-4 py-3 h-auto"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-notes"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <NotebookPen className="h-4 w-4" />
          <span>Deduction Notes</span>
          {!expanded && hasNotes && (
            <span className="text-xs text-muted-foreground">(has notes)</span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex flex-col gap-1">
              <label
                className={cn(
                  "text-xs font-medium",
                  teamColor === "amber" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"
                )}
              >
                Keyword {i + 1}
              </label>
              <Input
                value={notes[i]}
                onChange={(e) => handleChange(i, e.target.value)}
                placeholder={`What is keyword ${i + 1}?`}
                className="text-sm h-8"
                data-testid={`input-note-${i + 1}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
