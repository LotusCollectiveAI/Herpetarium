import { useState } from "react";
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

export function ClueInput({ code, keywords, team, onSubmit, disabled = false }: ClueInputProps) {
  const [clues, setClues] = useState<string[]>(["", "", ""]);

  const handleChange = (index: number, value: string) => {
    const newClues = [...clues];
    newClues[index] = value.toUpperCase();
    setClues(newClues);
  };

  const handleSubmit = () => {
    if (clues.every(c => c.trim().length > 0)) {
      onSubmit(clues);
    }
  };

  const isComplete = clues.every(c => c.trim().length > 0);

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
              "flex items-center gap-3 p-3 rounded-lg border",
              team === "amber" 
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
        ))}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={disabled || !isComplete}
        className="w-full"
        data-testid="button-submit-clues"
      >
        <Send className="h-4 w-4 mr-2" />
        Submit Clues
      </Button>
    </div>
  );
}
