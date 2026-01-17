import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User } from "lucide-react";
import { SiOpenai, SiClaude, SiGoogle } from "@icons-pack/react-simple-icons";
import type { Player, AIProvider } from "@shared/schema";

interface PlayerAvatarProps {
  player: Player;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  isCurrentPlayer?: boolean;
}

const aiIcons: Record<AIProvider, React.ReactNode> = {
  chatgpt: <SiOpenai className="h-4 w-4" />,
  claude: <SiClaude className="h-4 w-4" />,
  gemini: <SiGoogle className="h-4 w-4" />,
};

const aiColors: Record<AIProvider, string> = {
  chatgpt: "bg-emerald-600",
  claude: "bg-orange-500",
  gemini: "bg-blue-500",
};

export function PlayerAvatar({ player, size = "md", showName = true, isCurrentPlayer = false }: PlayerAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  return (
    <div className={cn("flex items-center gap-2", isCurrentPlayer && "ring-2 ring-primary rounded-full")}>
      <Avatar className={cn(sizeClasses[size], player.isAI && player.aiProvider && aiColors[player.aiProvider])}>
        <AvatarFallback className={cn(
          "font-semibold",
          player.isAI && player.aiProvider && aiColors[player.aiProvider],
          player.isAI && "text-white"
        )}>
          {player.isAI ? (
            player.aiProvider ? aiIcons[player.aiProvider] : <Bot className="h-4 w-4" />
          ) : (
            player.name.slice(0, 2).toUpperCase()
          )}
        </AvatarFallback>
      </Avatar>
      {showName && (
        <span className={cn(
          "font-medium truncate max-w-24",
          isCurrentPlayer && "text-primary font-bold"
        )}>
          {player.name}
        </span>
      )}
    </div>
  );
}
