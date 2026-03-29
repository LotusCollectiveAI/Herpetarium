import { useGame } from "@/lib/gameContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClueInput } from "@/components/ClueInput";
import { KeywordCard } from "@/components/KeywordCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { AIThinkingIndicator } from "@/components/AIThinkingIndicator";
import { MessageSquare } from "lucide-react";

export function GivingCluesView() {
  const { gameState, playerId, myTeam, myKeywords, myCode, sendMessage, aiThinking, aiThinkingStartTime } = useGame();

  if (!gameState || !myTeam) return null;

  const isClueGiver = gameState.currentClueGiver[myTeam] === playerId;
  const clueGiver = gameState.players.find(p => p.id === gameState.currentClueGiver[myTeam]);

  const handleSubmitClues = (clues: string[]) => {
    sendMessage({ type: "submit_clues", clues });
  };

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold">Round {gameState.round} - Giving Clues</h2>
        <p className="text-muted-foreground text-sm">
          {isClueGiver 
            ? "You are the clue giver! Give clues for your secret code." 
            : `${clueGiver?.name || "Clue giver"} is creating clues...`}
        </p>
      </div>

      {myKeywords && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Your Team's Keywords</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {myKeywords.map((keyword, index) => (
                <KeywordCard
                  key={index}
                  number={index + 1}
                  keyword={keyword}
                  team={myTeam}
                  isHighlighted={myCode?.includes(index + 1)}
                  size="sm"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isClueGiver && myCode && myKeywords ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Create Your Clues
            </CardTitle>
            <CardDescription>
              Give one-word clues that will help your team guess the code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClueInput
              code={myCode}
              keywords={myKeywords}
              team={myTeam}
              onSubmit={handleSubmitClues}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              {aiThinking ? (
                <AIThinkingIndicator aiName={aiThinking} context="clues" startTime={aiThinkingStartTime} />
              ) : clueGiver ? (
                <>
                  <PlayerAvatar player={clueGiver} size="lg" showName={false} />
                  <div>
                    <p className="font-medium">{clueGiver.name}</p>
                    <p className="text-sm text-muted-foreground">is creating clues...</p>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">Waiting for clue giver...</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
