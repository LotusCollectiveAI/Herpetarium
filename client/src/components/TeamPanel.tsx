import { cn } from "@/lib/utils";
import { KeywordCard } from "./KeywordCard";
import { RoundHistory } from "./RoundHistory";
import { PlayerAvatar } from "./PlayerAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Player, TeamState } from "@shared/schema";

interface TeamPanelProps {
  team: "amber" | "blue";
  teamState: TeamState;
  players: Player[];
  currentClueGiverId: string | null;
  showKeywords: boolean;
  isMyTeam: boolean;
}

export function TeamPanel({ 
  team, 
  teamState, 
  players, 
  currentClueGiverId,
  showKeywords,
  isMyTeam 
}: TeamPanelProps) {
  return (
    <div className={cn(
      "flex flex-col h-full rounded-lg border overflow-hidden",
      team === "amber" ? "border-amber-500/30" : "border-blue-500/30"
    )}>
      <div className={cn(
        "p-3 flex items-center justify-between",
        team === "amber" ? "team-amber" : "team-blue"
      )}>
        <span className="font-bold text-white text-shadow">
          {team === "amber" ? "Team Amber" : "Team Blue"}
        </span>
        {isMyTeam && (
          <span className="text-xs bg-white/20 px-2 py-1 rounded text-white">
            Your Team
          </span>
        )}
      </div>

      <Tabs defaultValue="keywords" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger 
            value="keywords" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            Keywords
          </TabsTrigger>
          <TabsTrigger 
            value="history"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            History
          </TabsTrigger>
          <TabsTrigger 
            value="players"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            Players
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keywords" className="flex-1 m-0 p-3">
          <div className="grid grid-cols-2 gap-2">
            {teamState.keywords.map((keyword, index) => (
              <KeywordCard
                key={index}
                number={index + 1}
                keyword={keyword}
                isRevealed={showKeywords}
                team={team}
                size="sm"
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full p-3">
            <RoundHistory history={teamState.history} team={team} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="players" className="flex-1 m-0 p-3">
          <div className="flex flex-col gap-2">
            {players.map((player) => (
              <div
                key={player.id}
                className={cn(
                  "flex items-center justify-between p-2 rounded-md",
                  currentClueGiverId === player.id && "bg-muted"
                )}
              >
                <PlayerAvatar player={player} size="sm" />
                {currentClueGiverId === player.id && (
                  <span className="text-xs text-muted-foreground">Clue Giver</span>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
