import { useGame } from "@/lib/gameContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClueDisplay } from "@/components/ClueDisplay";
import { CodeGuess } from "@/components/CodeGuess";
import { RoundHistory } from "@/components/RoundHistory";
import { Loader2, Crosshair, Shield } from "lucide-react";

export function InterceptingView() {
  const { gameState, playerId, myTeam, sendMessage, aiThinking } = useGame();

  if (!gameState || !myTeam) return null;

  const opponentTeam = myTeam === "amber" ? "blue" : "amber";
  const opponentClues = gameState.currentClues[opponentTeam];
  const opponentHistory = gameState.teams[opponentTeam].history;
  const hasIntercepted = gameState.currentGuesses[myTeam].opponent !== null;
  const isClueGiver = gameState.currentClueGiver[myTeam] === playerId;

  const handleSubmitInterception = (guess: [number, number, number]) => {
    sendMessage({ type: "submit_interception", guess });
  };

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold">Round {gameState.round} - Interception</h2>
        <p className="text-muted-foreground text-sm">
          Try to crack the opponent's code using their clue history!
        </p>
      </div>

      {opponentClues && (
        <Card className={opponentTeam === "amber" ? "border-amber-500/30" : "border-blue-500/30"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Crosshair className="h-4 w-4" />
              {opponentTeam === "amber" ? "Amber" : "Blue"}'s Clues This Round
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClueDisplay clues={opponentClues} team={opponentTeam} showNumbers={false} />
          </CardContent>
        </Card>
      )}

      {opponentHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Opponent's Clue History</CardTitle>
            <CardDescription>
              Use past clues to decode their keywords
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RoundHistory history={opponentHistory} team={opponentTeam} />
          </CardContent>
        </Card>
      )}

      {hasIntercepted ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Interception Submitted!</p>
                <p className="text-sm text-muted-foreground">
                  Waiting for the other team...
                </p>
              </div>
              <div className="flex items-center gap-2">
                {gameState.currentGuesses[myTeam].opponent?.map((num, i) => (
                  <span
                    key={i}
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      myTeam === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"
                    }`}
                  >
                    {num}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : isClueGiver ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              {aiThinking ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">{aiThinking} is intercepting...</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Your team is attempting to intercept...
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Crosshair className="h-5 w-5" />
              Intercept the Code
            </CardTitle>
            <CardDescription>
              Guess the opponent's secret code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeGuess
              team={myTeam}
              onSubmit={handleSubmitInterception}
              label="Submit Interception"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
