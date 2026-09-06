import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, FastForward } from "lucide-react";
import { DIGITS_PER_CODE } from "@/lib/useRoundReveal";
import type { RoundHistory } from "@shared/schema";

type Team = "amber" | "blue";

const TEAM_LABEL: Record<Team, string> = { amber: "Amber", blue: "Blue" };

const teamTileClass = (team: Team) =>
  team === "amber" ? "bg-amber-500 text-amber-950" : "bg-blue-500 text-white";

// One digit of the code: face down as "?" until its turn, then flipped.
function CodeTile({ team, digit, revealed }: { team: Team; digit: number; revealed: boolean }) {
  return (
    <div
      className={cn("flip-tile h-16 w-16 sm:h-20 sm:w-20", revealed && "flip-tile-revealed")}
      data-testid={`reveal-tile-${revealed ? "up" : "down"}`}
    >
      <div className="flip-tile-inner h-full w-full">
        <div className="flip-tile-face flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/60 text-2xl font-bold text-muted-foreground">
          ?
        </div>
        <div
          className={cn(
            "flip-tile-face flip-tile-back flex h-full w-full items-center justify-center rounded-xl text-3xl font-bold shadow-lg",
            teamTileClass(team),
          )}
        >
          {digit}
        </div>
      </div>
    </div>
  );
}

// A submitted guess, with each digit marked as the code digit beneath it is
// turned over -- so the row fills in with ticks and crosses as the reveal
// runs, rather than being judged all at once at the end.
function GuessRow({
  label,
  guess,
  code,
  revealed,
  emphasis,
}: {
  label: string;
  guess: [number, number, number] | null;
  code: [number, number, number];
  revealed: number;
  emphasis: Team;
}) {
  const settled = revealed >= DIGITS_PER_CODE;
  const correct = !!guess && guess.every((n, i) => n === code[i]);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-500",
        settled
          ? correct
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-red-500/40 bg-red-500/10"
          : "border-border bg-muted/40",
      )}
      data-testid={`reveal-guess-${emphasis}`}
    >
      <span className="min-w-0 truncate text-sm">{label}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        {(guess ?? [0, 0, 0]).map((num, i) => {
          const judged = i < revealed;
          return (
            <span
              key={i}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-sm font-bold transition-colors duration-300",
                !judged && "bg-muted text-foreground",
                judged && num === code[i] && "bg-emerald-500 text-white",
                judged && num !== code[i] && "bg-red-500 text-white",
              )}
            >
              {num}
            </span>
          );
        })}
        <span className="w-4 shrink-0">
          {settled && (correct
            ? <Check className="h-4 w-4 text-emerald-500" />
            : <X className="h-4 w-4 text-red-500" />)}
        </span>
      </div>
    </div>
  );
}

export function RoundRevealView({
  round,
  team,
  history,
  revealed,
  onSkip,
}: {
  round: number;
  team: Team;
  history: RoundHistory;
  revealed: number;
  onSkip: () => void;
}) {
  const opponent: Team = team === "amber" ? "blue" : "amber";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-4">
      <h2 className="text-center text-lg font-semibold text-muted-foreground" data-testid="text-reveal-title">
        Round {round} — Team {TEAM_LABEL[team]}'s code
      </h2>

      <Card className={cn("w-full max-w-md border-2", team === "amber" ? "border-amber-500/40" : "border-blue-500/40")}>
        <CardHeader className={cn("py-3", team === "amber" ? "team-amber" : "team-blue")}>
          <CardTitle className="flex items-center justify-center gap-2 text-lg text-white">
            Team {TEAM_LABEL[team]}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 pt-4">
          {/* No "Team " prefix: at 375px the row truncated mid-verb, and
              "decoded" / "intercepted" is the part that says what the digits
              beside it are. The card header already names the team. */}
          <GuessRow
            label={`${TEAM_LABEL[team]} decoded`}
            guess={history.ownTeamGuess}
            code={history.targetCode}
            revealed={revealed}
            emphasis={team}
          />
          <GuessRow
            label={`${TEAM_LABEL[opponent]} intercepted`}
            guess={history.opponentGuess}
            code={history.targetCode}
            revealed={revealed}
            emphasis={opponent}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-3">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          The code was
        </span>
        <div className="flex items-center gap-3" data-testid="reveal-code-tiles">
          {history.targetCode.map((digit, i) => (
            <CodeTile key={i} team={team} digit={digit} revealed={i < revealed} />
          ))}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onSkip}
        className="text-muted-foreground"
        data-testid="button-skip-reveal"
      >
        <FastForward className="mr-2 h-4 w-4" />Skip to results
      </Button>
    </div>
  );
}
