import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";

interface ClueInputProps {
  code: [number, number, number];
  keywords: string[];
  team: "amber" | "blue";
  onSubmit: (clues: string[]) => void;
  disabled?: boolean;
}

function getStem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  return w
    .replace(/(ing|ed|er|est|ly|tion|sion|ness|ment|able|ible|ful|less|ous|ive|al|ial|ical)$/, "")
    || w;
}

function validateClue(clue: string, keywords: string[]): string | null {
  const trimmed = clue.trim();
  if (trimmed.length === 0) return "Clue cannot be empty";
  if (/\s/.test(trimmed)) return "Clue must be a single word";
  const lowerClue = trimmed.toLowerCase();
  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase();
    if (lowerClue === lowerKw) return `Cannot use keyword "${kw}"`;
    if (getStem(lowerClue) === getStem(lowerKw) && getStem(lowerClue).length >= 3) {
      return `Too similar to keyword "${kw}"`;
    }
  }
  return null;
}

export function ClueInput({ code, keywords, team, onSubmit, disabled = false }: ClueInputProps) {
  const [clues, setClues] = useState<string[]>(["", "", ""]);

  const handleChange = (index: number, value: string) => {
    const newClues = [...clues];
    newClues[index] = value.toUpperCase();
    setClues(newClues);
  };

  const errors = useMemo(() => {
    return clues.map(c => c.trim().length > 0 ? validateClue(c, keywords) : null);
  }, [clues, keywords]);

  const hasErrors = errors.some(e => e !== null);
  const isComplete = clues.every(c => c.trim().length > 0);

  const handleSubmit = () => {
    if (isComplete && !hasErrors) {
      onSubmit(clues);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center text-sm text-muted-foreground mb-2">
        Give one-word clues for your team to guess the code:
        <div className="flex items-center justify-center gap-2 mt-2">
          {code.map((num, i) => (
            <span
              key={i}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-bold",
                team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"
              )}
            >
              {num}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {code.map((num, index) => (
          <div
            key={index}
            className={cn(
              "flex flex-col gap-1"
            )}
          >
            <div
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                errors[index]
                  ? "border-red-500/50 bg-red-500/5"
                  : team === "amber" 
                    ? "border-amber-500/30 bg-amber-500/5" 
                    : "border-blue-500/30 bg-blue-500/5"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"
                )}
              >
                {num}
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-muted-foreground font-mono uppercase">
                  {keywords[num - 1]}
                </span>
                <Input
                  type="text"
                  placeholder="Enter clue..."
                  value={clues[index]}
                  onChange={(e) => handleChange(index, e.target.value)}
                  disabled={disabled}
                  className="font-mono uppercase tracking-wider"
                  data-testid={`input-clue-${index}`}
                />
              </div>
            </div>
            {errors[index] && (
              <p className="text-xs text-red-500 ml-12 mt-1" data-testid={`error-clue-${index}`}>
                {errors[index]}
              </p>
            )}
          </div>
        ))}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={disabled || !isComplete || hasErrors}
        className="w-full"
        data-testid="button-submit-clues"
      >
        <Send className="h-4 w-4 mr-2" />
        Submit Clues
      </Button>
    </div>
  );
}
