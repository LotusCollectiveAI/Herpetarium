import { cn } from "@/lib/utils";

interface ClueDisplayProps {
  clues: string[];
  codeNumbers?: [number, number, number];
  team: "amber" | "blue";
  showNumbers?: boolean;
}

export function ClueDisplay({ clues, codeNumbers, team, showNumbers = true }: ClueDisplayProps) {
  return (
    <div className="flex flex-col gap-2">
      {clues.map((clue, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-3 p-2 rounded-md border",
            team === "amber" 
              ? "border-amber-500/30 bg-amber-500/5" 
              : "border-blue-500/30 bg-blue-500/5"
          )}
          data-testid={`clue-${index}`}
        >
          {showNumbers && codeNumbers && (
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"
              )}
            >
              {codeNumbers[index]}
            </div>
          )}
          <span className="font-mono uppercase tracking-wider text-sm flex-1">
            {clue || "..."}
          </span>
        </div>
      ))}
    </div>
  );
}
