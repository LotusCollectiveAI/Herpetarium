import { cn } from "@/lib/utils";
import type { AIProvider } from "@shared/schema";
import { Bot } from "lucide-react";
import { SiOpenai } from "react-icons/si";

interface AIThinkingIndicatorProps {
  aiName: string;
  context?: "clues" | "guess" | "intercept" | "generic";
  size?: "sm" | "lg";
}

const providerStyles: Record<string, { color: string; icon: typeof Bot; label: string }> = {
  ChatGPT: { color: "text-emerald-500", icon: SiOpenai, label: "ChatGPT is crafting clues" },
  Claude: { color: "text-orange-500", icon: Bot, label: "Claude is analyzing patterns" },
  Gemini: { color: "text-blue-500", icon: Bot, label: "Gemini is decoding" },
};

function getProviderAction(aiName: string, context?: string): string {
  switch (context) {
    case "clues": return `${aiName} is crafting clues`;
    case "guess": return `${aiName} is decoding`;
    case "intercept": return `${aiName} is analyzing patterns`;
    default: return `${aiName} is thinking`;
  }
}

export function AIThinkingIndicator({ aiName, context = "generic", size = "lg" }: AIThinkingIndicatorProps) {
  const style = providerStyles[aiName] || { color: "text-primary", icon: Bot, label: `${aiName} is thinking` };
  const IconComponent = style.icon;
  const actionText = getProviderAction(aiName, context);

  if (size === "sm") {
    return (
      <div className="flex items-center gap-2 text-sm" data-testid="ai-thinking-indicator">
        <IconComponent className={cn("h-4 w-4", style.color)} />
        <span className="text-muted-foreground">{actionText}</span>
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
        aiName === "ChatGPT" ? "bg-emerald-500/10" : aiName === "Claude" ? "bg-orange-500/10" : "bg-blue-500/10"
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
    </div>
  );
}
