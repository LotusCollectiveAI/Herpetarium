import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Bot } from "lucide-react";
import { SiOpenai, SiClaude, SiGoogle } from "@icons-pack/react-simple-icons";
import type { AIProvider } from "@shared/schema";

interface AIPlayerButtonProps {
  provider: AIProvider;
  onClick: () => void;
  disabled?: boolean;
}

const aiConfig: Record<AIProvider, { name: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  chatgpt: {
    name: "ChatGPT",
    icon: <SiOpenai className="h-4 w-4" />,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30",
  },
  claude: {
    name: "Claude",
    icon: <SiClaude className="h-4 w-4" />,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30",
  },
  gemini: {
    name: "Gemini",
    icon: <SiGoogle className="h-4 w-4" />,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30",
  },
};

export function AIPlayerButton({ provider, onClick, disabled = false }: AIPlayerButtonProps) {
  const config = aiConfig[provider];

  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className={cn("flex items-center gap-2 border", config.bgColor)}
      data-testid={`button-add-ai-${provider}`}
    >
      <span className={config.color}>{config.icon}</span>
      <span>Add {config.name}</span>
    </Button>
  );
}
