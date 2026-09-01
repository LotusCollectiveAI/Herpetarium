import { useGame } from "@/lib/gameContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClueDisplay } from "@/components/ClueDisplay";
import { CodeGuess } from "@/components/CodeGuess";
import { Crosshair, Shield } from "lucide-react";

export function InterceptingView() {
  const { gameState, playerId, myTeam, sendMessage } = useGame();

  if (!gameState || !myTeam) return null;

  const opponentTeam = myTeam === "amber" ? "blue" : "amber";
  const opponentClues = gameState.currentClues[opponentTeam];
  const hasIntercepted = gameState.currentGuesses[myTeam].opponent !== null;

  const designatedSubmitterId = gameState.interceptSubmitter[myTeam];
  const canSubmit = designatedSubmitterId === playerId;
  const submitter = gameState.players.find(p => p.id === designatedSubmitterId);
  const teammates = gameState.players
    .filter(p => p.team === myTeam && p.id !== playerId)
    .map(p => ({ id: p.id, name: p.name }));

  const handleSubmitInterception = (guess: [number, number, number]) => {
    sendMessage({ type: "submit_interception", guess });
  };

  const handleSelectionChange = (selection: [number | null, number | null, number | null]) => {
    sendMessage({ type: "update_selection", selection });
  };

  const cluesContent = opponentClues && (
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
  );

  const guessContent = hasIntercepted ? (
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
          clues={opponentClues ?? undefined}
          onSubmit={handleSubmitInterception}
          label="Submit Interception"
          canSubmit={canSubmit}
          submitterName={submitter?.name}
          teammates={teammates}
          teammateSelections={gameState.currentSelections[myTeam]}
          onSelectionChange={handleSelectionChange}
        />
      </CardContent>
    </Card>
  );

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold">Round {gameState.round} - Interception</h2>
        <p className="text-muted-foreground text-sm">
          Try to crack the opponent's code using their clue history!
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {hasIntercepted && cluesContent}
        {guessContent}
      </div>
    </div>
  );
}
