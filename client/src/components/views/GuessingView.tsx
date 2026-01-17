import { useGame } from "@/lib/gameContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClueDisplay } from "@/components/ClueDisplay";
import { CodeGuess } from "@/components/CodeGuess";
import { KeywordCard } from "@/components/KeywordCard";
import { Loader2, Target } from "lucide-react";

export function GuessingView() {
  const { gameState, playerId, myTeam, myKeywords, sendMessage, aiThinking } = useGame();

  if (!gameState || !myTeam) return null;

  const myClues = gameState.currentClues[myTeam];
  const isClueGiver = gameState.currentClueGiver[myTeam] === playerId;
  const hasGuessed = gameState.currentGuesses[myTeam].ownTeam !== null;

  const handleSubmitGuess = (guess: [number, number, number]) => {
    sendMessage({ type: "submit_guess", guess });
  };

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold">Round {gameState.round} - Decode the Clues</h2>
        <p className="text-muted-foreground text-sm">
          {isClueGiver 
            ? "Wait for your team to decode your clues" 
            : "Guess the code based on the clues"}
        </p>
      </div>

      {myKeywords && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Your Keywords</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {myKeywords.map((keyword, index) => (
                <KeywordCard
                  key={index}
                  number={index + 1}
                  keyword={keyword}
                  team={myTeam}
                  size="sm"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {myClues && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clues from Your Encryptor</CardTitle>
          </CardHeader>
          <CardContent>
            <ClueDisplay clues={myClues} team={myTeam} showNumbers={false} />
          </CardContent>
        </Card>
      )}

      {hasGuessed ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Guess Submitted!</p>
                <p className="text-sm text-muted-foreground">
                  Waiting for the other team...
                </p>
              </div>
              <div className="flex items-center gap-2">
                {gameState.currentGuesses[myTeam].ownTeam?.map((num, i) => (
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
                  <p className="text-muted-foreground">{aiThinking} is guessing...</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Your team is decoding your clues...
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
              <Target className="h-5 w-5" />
              Make Your Guess
            </CardTitle>
            <CardDescription>
              Which keywords do these clues refer to?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeGuess
              team={myTeam}
              onSubmit={handleSubmitGuess}
              label="Submit Guess"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
