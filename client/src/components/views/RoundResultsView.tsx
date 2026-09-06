import { useEffect, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Target, ArrowRight, Trophy, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoundReveal } from "@/lib/useRoundReveal";
import { RoundRevealView } from "./RoundRevealView";

export function RoundResultsView() {
  const { gameState, myTeam, isHost, sendMessage, isReplay } = useGame();
  const [showTokens, setShowTokens] = useState(false);

  // Always amber then blue, the same for everyone. Ordering it by viewer --
  // your own code first, which carries more suspense on its own -- meant two
  // people sat next to each other were watching different codes at the same
  // moment, and a table talking through one reveal is worth more than each
  // player getting a private one.
  const revealOrder = ["amber", "blue"] as const;

  // Not in replay: there the viewer drives the pace with the scrubber, and
  // a sequence playing itself out on arrival at a step fights that.
  const reveal = useRoundReveal(revealOrder.length, !isReplay);

  useEffect(() => {
    if (!reveal.done) return;
    const timer = setTimeout(() => setShowTokens(true), 600);
    return () => clearTimeout(timer);
  }, [reveal.done]);

  if (!gameState || !myTeam) return null;

  const isGameDecided = gameState.winner !== null || gameState.round >= gameState.rules.maxRounds;

  const handleContinue = () => {
    sendMessage({ type: "next_round" });
  };

  const amberHistory = gameState.teams.amber.history;
  const blueHistory = gameState.teams.blue.history;
  const latestAmber = amberHistory[amberHistory.length - 1];
  const latestBlue = blueHistory[blueHistory.length - 1];

  // Decoding and being intercepted are scored separately, so a team can do
  // both in one round. The two clauses are joined into a single sentence
  // rather than left as two exclamations: "but" when the interception
  // undercuts a successful decode, "and" when it compounds a failed one.
  const getTeamSummary = (team: "amber" | "blue", latest: typeof latestAmber | undefined) => {
    const teamName = team === "amber" ? "Amber" : "Blue";
    if (!latest) return null;

    const decode = latest.ownTeamCorrect ? "decoded correctly" : "failed to decode";
    if (!latest.intercepted) {
      return `Team ${teamName} ${decode}!`;
    }
    const conjunction = latest.ownTeamCorrect ? "but" : "and";
    return `Team ${teamName} ${decode}, ${conjunction} their code was intercepted!`;
  };

  const renderTeamResult = (
    team: "amber" | "blue",
    latestRound: typeof latestAmber | undefined
  ) => {
    if (!latestRound) return null;

    const isGoodOutcome = latestRound.ownTeamCorrect && !latestRound.intercepted;

    return (
      <Card className={cn(
        "border-2 transition-all duration-500",
        team === "amber" ? "border-amber-500/30" : "border-blue-500/30"
      )}>
        <CardHeader className={cn(
          "py-3",
          team === "amber" ? "team-amber" : "team-blue"
        )}>
          {/* Centered to match the round title above and the summary line
              directly below, both of which are centered -- a left-aligned
              header between them read as misaligned. text-lg rather than
              CardTitle's default text-2xl: it is the label on a card, not
              the heading of the screen. */}
          <CardTitle className="text-white text-lg flex items-center justify-center gap-2">
            {/* Keyed off the same condition as the banner colour, so a round
                that was decoded but intercepted is marked as the bad outcome
                it is instead of showing no icon at all. */}
            {isGoodOutcome
              ? <Trophy className="h-5 w-5 shrink-0" />
              : <AlertTriangle className="h-5 w-5 shrink-0" />}
            Team {team === "amber" ? "Amber" : "Blue"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <p className={cn(
            "text-sm font-medium text-center px-2 py-1.5 rounded",
            isGoodOutcome ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
          )} data-testid={`text-summary-${team}`}>
            {getTeamSummary(team, latestRound)}
          </p>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Code:</span>
            {latestRound.targetCode.map((num, i) => (
              <span
                key={i}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white"
                )}
              >
                {num}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {latestRound.clues.map((clue, i) => (
              <span
                key={i}
                className="text-xs font-mono uppercase bg-muted px-2 py-1 rounded"
              >
                {clue}
              </span>
            ))}
          </div>

          <div className="space-y-2">
            <div className={cn(
              "flex items-center justify-between p-2 rounded transition-all duration-300",
              latestRound.ownTeamCorrect ? "bg-emerald-500/10" : "bg-red-500/10"
            )}>
              <span className="text-sm">Team {team === "amber" ? "Amber" : "Blue"} Guess</span>
              <div className="flex items-center gap-2">
                {latestRound.ownTeamGuess?.map((num, i) => (
                  <span
                    key={i}
                    className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold bg-muted"
                  >
                    {num}
                  </span>
                ))}
                {latestRound.ownTeamCorrect ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </div>
            </div>

            <div className={cn(
              "flex items-center justify-between p-2 rounded transition-all duration-300",
              latestRound.intercepted ? "bg-red-500/10" : "bg-muted"
            )}>
              <span className="text-sm">Interception Attempt</span>
              <div className="flex items-center gap-2">
                {latestRound.opponentGuess?.map((num, i) => (
                  <span
                    key={i}
                    className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold bg-muted"
                  >
                    {num}
                  </span>
                ))}
                {latestRound.intercepted ? (
                  <Target className="h-4 w-4 text-red-500" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          <div className={cn(
            "flex items-center gap-4 pt-2 border-t transition-all duration-500",
            showTokens ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          )}>
            {!latestRound.ownTeamCorrect && (
              <div className="flex items-center gap-1 text-xs" data-testid={`token-white-${team}`}>
                <div className={cn(
                  "w-5 h-5 rounded-full bg-white border-2 border-gray-300 transition-transform duration-500",
                  showTokens ? "scale-100" : "scale-0"
                )} />
                <span className="text-red-500 font-medium">+1 White Token</span>
              </div>
            )}
            {latestRound.intercepted && (
              <div className="flex items-center gap-1 text-xs" data-testid={`token-black-${team}`}>
                <div className={cn(
                  "w-5 h-5 rounded-full bg-gray-900 border-2 border-gray-700 transition-transform duration-500 delay-200",
                  showTokens ? "scale-100" : "scale-0"
                )} />
                <span className="text-red-500 font-medium">+1 Black Token</span>
              </div>
            )}
            {latestRound.ownTeamCorrect && !latestRound.intercepted && (
              <span className={cn(
                "text-sm text-emerald-500 font-medium transition-all duration-500",
                showTokens ? "opacity-100" : "opacity-0"
              )}>
                Perfect round!
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Uncover one team's code at a time before showing the scored round. The
  // history rows are already final -- this only paces how they are read.
  if (!reveal.done && reveal.teamIndex !== null) {
    const revealTeam = revealOrder[reveal.teamIndex];
    const revealHistory = revealTeam === "amber" ? latestAmber : latestBlue;
    if (revealHistory) {
      return (
        <RoundRevealView
          round={gameState.round}
          team={revealTeam}
          history={revealHistory}
          revealed={reveal.revealed}
          onSkip={reveal.skip}
        />
      );
    }
  }

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold" data-testid="text-round-results-title">Round {gameState.round} Results</h2>
      </div>

      <div className="space-y-4">
        {renderTeamResult("amber", latestAmber)}
        {renderTeamResult("blue", latestBlue)}
      </div>

      {isGameDecided && (
        <div
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-5 px-4 text-2xl font-bold text-white shadow-lg",
            gameState.winner === "amber" ? "team-amber" : gameState.winner === "blue" ? "team-blue" : "bg-muted text-foreground"
          )}
          data-testid="text-game-decided"
        >
          {gameState.winner && <Trophy className="h-7 w-7 shrink-0" />}
          {gameState.winner
            ? `Team ${gameState.winner === "amber" ? "Amber" : "Blue"} Wins the Game!`
            : "The Game Has Ended in a Tie!"}
        </div>
      )}

      {isHost && (
        <Button
          size="lg"
          onClick={handleContinue}
          className="w-full"
          data-testid="button-next-round"
        >
          {isGameDecided ? <Trophy className="h-5 w-5 mr-2" /> : <ArrowRight className="h-5 w-5 mr-2" />}
          {isGameDecided ? "See Final Results" : "Next Round"}
        </Button>
      )}

      {!isHost && (
        <div className="text-center text-sm text-muted-foreground">
          {isGameDecided ? "Waiting for host to continue..." : "Waiting for host to start the next round..."}
        </div>
      )}
    </div>
  );
}
