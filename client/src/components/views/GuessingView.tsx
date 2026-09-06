import { useGame } from "@/lib/gameContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClueDisplay } from "@/components/ClueDisplay";
import { CodeGuess } from "@/components/CodeGuess";
import { KeywordCard } from "@/components/KeywordCard";
import { AIThinkingIndicator } from "@/components/AIThinkingIndicator";
import { Target } from "lucide-react";

export function GuessingView() {
  const { gameState, playerId, myTeam, myKeywords, sendMessage, aiThinking, aiThinkingStartTime } = useGame();

  if (!gameState || !myTeam) return null;

  const myClues = gameState.currentClues[myTeam];
  const isClueGiver = gameState.currentClueGiver[myTeam] === playerId;
  const hasGuessed = gameState.currentGuesses[myTeam].ownTeam !== null;

  const designatedSubmitterId = gameState.decodeSubmitter[myTeam];
  const canSubmit = designatedSubmitterId === playerId;
  const submitter = gameState.players.find(p => p.id === designatedSubmitterId);
  const teammates = gameState.players
    .filter(p => p.team === myTeam && p.id !== playerId)
    .map(p => ({ id: p.id, name: p.name }));

  const handleSubmitGuess = (guess: [number, number, number]) => {
    sendMessage({ type: "submit_guess", guess });
  };

  const handleSelectionChange = (selection: [number | null, number | null, number | null]) => {
    sendMessage({ type: "update_selection", selection });
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
          {/* No heading: four numbered word tiles on your own screen don't
              need to be labelled as your keywords. Card's default p-6 is
              also generous for a reference panel sharing a phone screen with
              the clues and the guess input, so it is halved -- except at the
              top, which keeps enough room for the number badges to overhang
              their tiles without being clipped. */}
          <CardContent className="p-3 pt-4">
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

      {myClues && (hasGuessed || isClueGiver) && (
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
                <AIThinkingIndicator aiName={aiThinking} context="guess" startTime={aiThinkingStartTime} />
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Target className="h-6 w-6 text-muted-foreground" />
                  </div>
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
          {/* Bare, matching the clue and intercept panels: the banner above
              already says this is the decode phase, and the keywords and
              clues are both on screen directly above the input. */}
          <CardContent className="pt-4">
            <CodeGuess
              team={myTeam}
              clues={myClues ?? undefined}
              onSubmit={handleSubmitGuess}
              label="Submit Guess"
              canSubmit={canSubmit}
              submitterName={submitter?.name}
              teammates={teammates}
              teammateSelections={gameState.currentSelections[myTeam]}
              onSelectionChange={handleSelectionChange}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
