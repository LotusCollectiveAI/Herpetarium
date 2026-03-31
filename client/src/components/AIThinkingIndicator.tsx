import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Bot } from "lucide-react";
import { SiOpenai } from "react-icons/si";

interface AIThinkingIndicatorProps {
  aiName: string;
  context?: "clues" | "guess" | "intercept" | "generic";
  size?: "sm" | "lg";
  startTime?: number | null;
}

const providerStyles: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  ChatGPT: { color: "text-emerald-500", icon: SiOpenai },
  Claude: { color: "text-orange-500", icon: Bot },
  Gemini: { color: "text-blue-500", icon: Bot },
  OpenRouter: { color: "text-violet-500", icon: Bot },
};

function getProviderAction(aiName: string, context?: string): string {
  switch (context) {
    case "clues": return `${aiName} is crafting clues`;
    case "guess": return `${aiName} is decoding`;
    case "intercept": return `${aiName} is analyzing patterns`;
    default: return `${aiName} is thinking`;
  }
}

function useElapsedTime(startTime?: number | null) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) {
      setElapsed(0);
      return;
    }

    const update = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return elapsed;
}

function formatElapsed(seconds: number): string {
  if (seconds < 1) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function AIThinkingIndicator({ aiName, context = "generic", size = "lg", startTime }: AIThinkingIndicatorProps) {
  const baseProviderName = aiName.split(" (")[0];
  const style = providerStyles[baseProviderName] || { color: "text-primary", icon: Bot };
  const IconComponent = style.icon;
  const actionText = getProviderAction(aiName, context);
  const elapsed = useElapsedTime(startTime);
  const elapsedText = formatElapsed(elapsed);

  if (size === "sm") {
    return (
      <div className="flex items-center gap-2 text-sm" data-testid="ai-thinking-indicator">
        <IconComponent className={cn("h-4 w-4", style.color)} />
        <span className="text-muted-foreground">{actionText}</span>
        {elapsedText && (
          <span className="text-xs text-muted-foreground/70" data-testid="ai-thinking-elapsed">
            ({elapsedText})
          </span>
        )}
        <span className="inline-flex gap-[2px]">
          <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", style.color, "bg-current")} style={{ animationDelay: "0ms" }} />
          <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", style.color, "bg-current")} style={{ animationDelay: "150ms" }} />
          <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", style.color, "bg-current")} style={{ animationDelay: "300ms" }} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3" data-testid="ai-thinking-indicator">
      <div className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center",
        baseProviderName === "ChatGPT" ? "bg-emerald-500/10" : baseProviderName === "Claude" ? "bg-orange-500/10" : baseProviderName === "OpenRouter" ? "bg-violet-500/10" : "bg-blue-500/10"
      )}>
        <IconComponent className={cn("h-6 w-6", style.color)} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-medium">{actionText}</span>
        <span className="inline-flex gap-[3px]">
          <span className={cn("w-2 h-2 rounded-full animate-bounce", style.color, "bg-current")} style={{ animationDelay: "0ms" }} />
          <span className={cn("w-2 h-2 rounded-full animate-bounce", style.color, "bg-current")} style={{ animationDelay: "150ms" }} />
          <span className={cn("w-2 h-2 rounded-full animate-bounce", style.color, "bg-current")} style={{ animationDelay: "300ms" }} />
        </span>
      </div>
      {elapsedText && (
        <span className="text-sm text-muted-foreground/60" data-testid="ai-thinking-elapsed">
          {elapsedText}
        </span>
      )}
    </div>
  );
}
