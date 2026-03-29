import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Bot, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { SiOpenai, SiAnthropic, SiGoogle } from "react-icons/si";
import { type AIProvider, type AIPlayerConfig, MODEL_OPTIONS, PROMPT_STRATEGY_OPTIONS, getDefaultConfig } from "@shared/schema";

interface AIPlayerButtonProps {
  provider: AIProvider;
  onAdd: (config: AIPlayerConfig) => void;
  disabled?: boolean;
}

const providerUi: Record<AIProvider, { name: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  chatgpt: {
    name: "ChatGPT",
    icon: <SiOpenai className="h-4 w-4" />,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30",
  },
  claude: {
    name: "Claude",
    icon: <SiAnthropic className="h-4 w-4" />,
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

export function AIPlayerButton({ provider, onAdd, disabled = false }: AIPlayerButtonProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<AIPlayerConfig>(getDefaultConfig(provider));
  const ui = providerUi[provider];
  const models = MODEL_OPTIONS[provider];
  const selectedModel = models.find(m => m.value === config.model);
  const isReasoningModel = selectedModel?.isReasoning ?? false;

  const handleAdd = () => {
    onAdd(config);
    setShowConfig(false);
    setConfig(getDefaultConfig(provider));
  };

  const timeoutLabel = (ms: number) => {
    const s = ms / 1000;
    if (s >= 60) return `${Math.round(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ""}`.trim();
    return `${s}s`;
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={handleAdd}
          disabled={disabled}
          className={cn("flex-1 flex items-center gap-2 border", ui.bgColor)}
          data-testid={`button-add-ai-${provider}`}
        >
          <span className={ui.color}>{ui.icon}</span>
          <span>Add {ui.name}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowConfig(!showConfig)}
          className="h-9 w-9 shrink-0"
          data-testid={`button-config-ai-${provider}`}
        >
          {showConfig ? <ChevronUp className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
        </Button>
      </div>

      {showConfig && (
        <div className="mt-2 p-3 border rounded-lg space-y-3 bg-card" data-testid={`config-panel-${provider}`}>
          <div className="space-y-1.5">
            <Label className="text-xs">Model</Label>
            <Select
              value={config.model}
              onValueChange={(val) => setConfig({ ...config, model: val })}
            >
              <SelectTrigger className="h-8 text-xs" data-testid={`select-model-${provider}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Prompt Strategy</Label>
            <Select
              value={config.promptStrategy}
              onValueChange={(val) => setConfig({ ...config, promptStrategy: val })}
            >
              <SelectTrigger className="h-8 text-xs" data-testid={`select-strategy-${provider}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROMPT_STRATEGY_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isReasoningModel && (
            <div className="space-y-1.5">
              <Label className="text-xs">Temperature: {config.temperature?.toFixed(1)}</Label>
              <Slider
                value={[config.temperature ?? 0.7]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={([val]) => setConfig({ ...config, temperature: val })}
                data-testid={`slider-temperature-${provider}`}
              />
            </div>
          )}

          {isReasoningModel && (
            <p className="text-xs text-muted-foreground">
              Reasoning models use internal thinking instead of temperature.
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Timeout: {timeoutLabel(config.timeoutMs)}</Label>
            <Slider
              value={[config.timeoutMs]}
              min={10000}
              max={300000}
              step={10000}
              onValueChange={([val]) => setConfig({ ...config, timeoutMs: val })}
              data-testid={`slider-timeout-${provider}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
