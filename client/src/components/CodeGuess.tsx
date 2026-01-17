import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface CodeGuessProps {
  onSubmit: (guess: [number, number, number]) => void;
  disabled?: boolean;
  team: "amber" | "blue";
  label?: string;
}

export function CodeGuess({ onSubmit, disabled = false, team, label = "Submit Guess" }: CodeGuessProps) {
  const [guess, setGuess] = useState<(number | null)[]>([null, null, null]);

  const handleNumberClick = (position: number, num: number) => {
    const newGuess = [...guess];
    if (newGuess[position] === num) {
      newGuess[position] = null;
    } else {
      newGuess[position] = num;
    }
    setGuess(newGuess);
  };

  const isComplete = guess.every(g => g !== null);
  const usedNumbers = guess.filter(g => g !== null);

  const handleSubmit = () => {
    if (isComplete) {
      onSubmit(guess as [number, number, number]);
      setGuess([null, null, null]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        {[0, 1, 2].map((position) => (
          <div
            key={position}
            className={cn(
              "flex flex-col gap-2 p-2 rounded-lg border",
              team === "amber" ? "border-amber-500/30" : "border-blue-500/30"
            )}
          >
            <div className="text-xs text-muted-foreground text-center">
              Clue {position + 1}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {[1, 2, 3, 4].map((num) => {
                const isSelected = guess[position] === num;
                const isUsedElsewhere = usedNumbers.includes(num) && !isSelected;
                
                return (
                  <button
                    key={num}
                    onClick={() => handleNumberClick(position, num)}
                    disabled={disabled || isUsedElsewhere}
                    className={cn(
                      "w-10 h-10 rounded-md font-bold text-lg transition-all",
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

      <Button
        onClick={handleSubmit}
        disabled={disabled || !isComplete}
        className="w-full"
        data-testid="button-submit-guess"
      >
        <Check className="h-4 w-4 mr-2" />
        {label}
      </Button>
    </div>
  );
}
