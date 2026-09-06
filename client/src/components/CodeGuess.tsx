import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

type Selection = [number | null, number | null, number | null];

interface Teammate {
  id: string;
  name: string;
}

interface CodeGuessProps {
  onSubmit: (guess: [number, number, number]) => void;
  disabled?: boolean;
  team: "amber" | "blue";
  label?: string;
  clues?: string[];
  canSubmit?: boolean;
  submitterName?: string | null;
  teammates?: Teammate[];
  teammateSelections?: Record<string, Selection>;
  onSelectionChange?: (selection: Selection) => void;
}

export function CodeGuess({
  onSubmit,
  disabled = false,
  team,
  label = "Submit Guess",
  clues,
  canSubmit = true,
  submitterName,
  teammates = [],
  teammateSelections = {},
  onSelectionChange,
}: CodeGuessProps) {
  const [guess, setGuess] = useState<Selection>([null, null, null]);

  const handleNumberClick = (position: number, num: number) => {
    const newGuess = [...guess] as Selection;
    newGuess[position] = newGuess[position] === num ? null : num;
    setGuess(newGuess);
    onSelectionChange?.(newGuess);
  };

  const isComplete = guess.every(g => g !== null);
  const usedNumbers = guess.filter(g => g !== null);

  const handleSubmit = () => {
    if (isComplete) {
      onSubmit(guess as [number, number, number]);
      setGuess([null, null, null]);
      onSelectionChange?.([null, null, null]);
    }
  };

  const teammatesPicking = (position: number, num: number) =>
    teammates.filter(t => teammateSelections[t.id]?.[position] === num);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((position) => (
          <div
            key={position}
            className={cn(
              "flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg border",
              team === "amber" ? "border-amber-500/30 bg-amber-500/5" : "border-blue-500/30 bg-blue-500/5"
            )}
            data-testid={`guess-clue-row-${position}`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">
                Clue {position + 1}
              </div>
              <span className="font-mono uppercase tracking-wider text-sm block truncate">
                {clues?.[position] || "..."}
              </span>
            </div>
            <div className="flex gap-1 shrink-0">
              {[1, 2, 3, 4].map((num) => {
                const isSelected = guess[position] === num;
                const isUsedElsewhere = usedNumbers.includes(num) && !isSelected;
                const picking = teammatesPicking(position, num);

                return (
                  <div key={num} className="relative">
                    <button
                      onClick={() => handleNumberClick(position, num)}
                      disabled={disabled || isUsedElsewhere}
                      className={cn(
                        "w-9 h-9 rounded-md font-bold text-base transition-all shrink-0",
                        isSelected
                          ? team === "amber"
                            ? "bg-amber-500 text-amber-950 shadow-md"
                            : "bg-blue-500 text-white shadow-md"
                          : "bg-muted hover:bg-muted/80",
                        isUsedElsewhere && "opacity-30 cursor-not-allowed",
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                      data-testid={`guess-${position}-${num}`}
                    >
                      {num}
                    </button>
                    {picking.length > 0 && (
                      <div className="absolute -top-1.5 -right-1.5 flex -space-x-1.5">
                        {picking.map(t => (
                          <span
                            key={t.id}
                            title={t.name}
                            className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center border border-background"
                          >
                            {t.name[0]?.toUpperCase() ?? "?"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          Your guess:
          {guess.map((g, i) => (
            <span
              key={i}
              className={cn(
                "w-6 h-6 rounded flex items-center justify-center font-mono font-bold",
                g !== null
                  ? team === "amber" ? "bg-amber-500/20 text-amber-600" : "bg-blue-500/20 text-blue-600"
                  : "bg-muted"
              )}
            >
              {g ?? "?"}
            </span>
          ))}
        </div>
      </div>

      {canSubmit ? (
        <Button
          onClick={handleSubmit}
          disabled={disabled || !isComplete}
          className="w-full"
          data-testid="button-submit-guess"
        >
          <Check className="h-4 w-4 mr-2" />
          {label}
        </Button>
      ) : (
        <p className="text-center text-sm text-muted-foreground" data-testid="text-not-submitter">
          Click your picks to show your team — only {submitterName ?? "your teammate"} can submit the final answer.
        </p>
      )}
    </div>
  );
}
