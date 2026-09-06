import { cn } from "@/lib/utils";

interface KeywordCardProps {
  number: number;
  keyword: string;
  isRevealed?: boolean;
  isHighlighted?: boolean;
  team: "amber" | "blue";
  size?: "sm" | "md" | "lg";
}

export function KeywordCard({ 
  number, 
  keyword, 
  isRevealed = true, 
  isHighlighted = false,
  team,
  size = "md" 
}: KeywordCardProps) {
  // Each tile holds one line of text, so the height is really just breathing
  // room around it. sm is the in-play size, shown on the same screen as the
  // clues and the action panel -- it stays tight enough that all three fit
  // on a phone, while leaving the number badge (which overhangs the top
  // edge) clear of the word.
  const sizeClasses = {
    sm: "h-14 text-sm",
    md: "h-20 text-base",
    lg: "h-24 text-lg",
  };

  return (
    <div
      className={cn(
        "relative rounded-md border-2 flex flex-col items-center justify-center gap-1 transition-all",
        sizeClasses[size],
        team === "amber" 
          ? "border-amber-500/50 bg-amber-500/10" 
          : "border-blue-500/50 bg-blue-500/10",
        isHighlighted && team === "amber" && "border-amber-500 bg-amber-500/30 shadow-lg shadow-amber-500/20",
        isHighlighted && team === "blue" && "border-blue-500 bg-blue-500/30 shadow-lg shadow-blue-500/20",
      )}
      data-testid={`keyword-card-${number}`}
    >
      <div 
        className={cn(
          "absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
          team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"
        )}
      >
        {number}
      </div>
      {isRevealed ? (
        <span className="font-mono font-bold tracking-wide uppercase text-center px-2">
          {keyword}
        </span>
      ) : (
        <span className="text-muted-foreground">???</span>
      )}
    </div>
  );
}
