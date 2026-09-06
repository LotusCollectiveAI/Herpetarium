import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, History, Target, X } from "lucide-react";
import type { GameState, RoundHistory } from "@shared/schema";

// A chronological log of what has happened so far this game, collapsed by
// default so it costs one line of vertical space until asked for.
//
// Everything here is derived from the GameState the server already sent
// this client, which is redacted for the viewer's own team -- so the panel
// cannot reveal anything the rest of the UI wasn't already allowed to show.
// That is deliberate: the match_events REST endpoint would be the obvious
// source for an ordered action log, but its payloads carry both teams'
// codes and keywords, and it has no notion of who is asking.

type Team = "amber" | "blue";

interface HistoryEntry {
  key: string;
  team: Team;
  action: string;
  words?: string[];
  code?: readonly number[];
  codeLabel?: string;
  outcome?: "good" | "bad";
  penalty?: boolean;
}

interface RoundGroup {
  round: number;
  pending: boolean;
  entries: HistoryEntry[];
}

const TEAM_LABEL: Record<Team, string> = { amber: "Amber", blue: "Blue" };
const OTHER: Record<Team, Team> = { amber: "blue", blue: "amber" };

function teamTextClass(team: Team) {
  return team === "amber"
    ? "text-amber-600 dark:text-amber-400"
    : "text-blue-600 dark:text-blue-400";
}

function teamDotClass(team: Team) {
  return team === "amber" ? "bg-amber-500" : "bg-blue-500";
}

function playerName(gameState: GameState, playerId: string | null): string {
  if (!playerId) return "—";
  return gameState.players.find(p => p.id === playerId)?.name ?? "a player";
}

// One completed round, for which both teams' codes are already public --
// that reveal is what makes cross-round deduction possible, and
// RoundResultsView shows the same thing.
function entriesForFinishedRound(
  gameState: GameState,
  round: number,
  byTeam: Record<Team, RoundHistory>,
): HistoryEntry[] {
  const entries: HistoryEntry[] = [];

  for (const team of ["amber", "blue"] as const) {
    entries.push({
      key: `r${round}-clues-${team}`,
      team,
      action: `${playerName(gameState, byTeam[team].clueGiverId)} clued`,
      words: byTeam[team].clues,
      code: byTeam[team].targetCode,
      codeLabel: "→",
    });
  }

  for (const team of ["amber", "blue"] as const) {
    const h = byTeam[team];
    entries.push({
      key: `r${round}-decode-${team}`,
      team,
      action: "decoded",
      code: h.ownTeamGuess ?? undefined,
      outcome: h.ownTeamCorrect ? "good" : "bad",
    });
  }

  // A team's `opponentGuess` is the *other* team's attempt on it, so the
  // acting team here is the opponent of whichever history row we read.
  for (const team of ["amber", "blue"] as const) {
    const h = byTeam[team];
    if (!h.opponentGuess) continue;
    entries.push({
      key: `r${round}-intercept-${OTHER[team]}`,
      team: OTHER[team],
      action: `intercept on ${TEAM_LABEL[team]}`,
      code: h.opponentGuess,
      outcome: h.intercepted ? "good" : "bad",
    });
  }

  // Both token types are penalties against the team they attach to: a white
  // one for failing to read your own clues, a black one for letting the
  // other team read them.
  for (const team of ["amber", "blue"] as const) {
    const h = byTeam[team];
    const penalties: string[] = [];
    if (!h.ownTeamCorrect) penalties.push("+1 miscommunication");
    if (h.intercepted) penalties.push("+1 interception");
    if (penalties.length === 0) continue;
    entries.push({
      key: `r${round}-penalty-${team}`,
      team,
      action: penalties.join(", "),
      penalty: true,
    });
  }

  return entries;
}

// The round still being played. Only facts already visible to this viewer
// are listed: clues are public once submitted, but a code is still secret,
// and the opponent's guess values are withheld by the server -- so for them
// only the fact that they have submitted is reported.
function entriesForPendingRound(gameState: GameState, myTeam: Team | null): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const round = gameState.round;

  for (const team of ["amber", "blue"] as const) {
    const clues = gameState.currentClues[team];
    if (!clues) continue;
    entries.push({
      key: `r${round}-live-clues-${team}`,
      team,
      action: `${playerName(gameState, gameState.currentClueGiver[team])} clued`,
      words: clues,
    });
  }

  for (const team of ["amber", "blue"] as const) {
    const guess = gameState.currentGuesses[team].ownTeam;
    if (!guess) continue;
    const mine = team === myTeam;
    entries.push({
      key: `r${round}-live-decode-${team}`,
      team,
      action: mine ? "decoded" : "submitted a decode",
      code: mine ? guess : undefined,
    });
  }

  for (const team of ["amber", "blue"] as const) {
    const guess = gameState.currentGuesses[team].opponent;
    if (!guess) continue;
    const mine = team === myTeam;
    entries.push({
      key: `r${round}-live-intercept-${team}`,
      team,
      action: mine
        ? `intercept on ${TEAM_LABEL[OTHER[team]]}`
        : `submitted an intercept on ${TEAM_LABEL[OTHER[team]]}`,
      code: mine ? guess : undefined,
    });
  }

  return entries;
}

function buildRoundGroups(gameState: GameState, myTeam: Team | null): RoundGroup[] {
  const groups: RoundGroup[] = [];
  const amber = gameState.teams.amber.history;
  const blue = gameState.teams.blue.history;
  const finished = Math.min(amber.length, blue.length);

  for (let i = 0; i < finished; i++) {
    groups.push({
      round: amber[i].round,
      pending: false,
      entries: entriesForFinishedRound(gameState, amber[i].round, { amber: amber[i], blue: blue[i] }),
    });
  }

  // Only show a live group while the current round hasn't been scored yet;
  // once it has, it is already covered by the finished groups above.
  const alreadyScored = groups.some(g => g.round === gameState.round);
  if (!alreadyScored && gameState.phase !== "lobby" && gameState.phase !== "team_setup") {
    const entries = entriesForPendingRound(gameState, myTeam);
    if (entries.length > 0) {
      groups.push({ round: gameState.round, pending: true, entries });
    }
  }

  return groups;
}

function CodeChips({ code }: { code: readonly number[] }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {code.map((n, i) => (
        <span
          key={i}
          className="inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] font-bold tabular-nums"
        >
          {n}
        </span>
      ))}
    </span>
  );
}

function EntryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <li className="flex items-start gap-2 text-[11px] leading-5" data-testid={`history-entry-${entry.key}`}>
      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", teamDotClass(entry.team))} />
      <span className="min-w-0 flex-1">
        <span className={cn("font-medium", teamTextClass(entry.team))}>{TEAM_LABEL[entry.team]}</span>
        <span className={cn(entry.penalty ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
          {" · "}{entry.action}
        </span>
        {entry.words && (
          <span className="ml-1 font-mono uppercase text-foreground">{entry.words.join(" · ")}</span>
        )}
        {entry.code && (
          <>
            {entry.codeLabel && <span className="text-muted-foreground"> {entry.codeLabel}</span>}
            <span className="ml-1">
              <CodeChips code={entry.code} />
            </span>
          </>
        )}
        {entry.outcome === "good" && <Check className="ml-1 inline h-3 w-3 align-middle text-emerald-500" />}
        {entry.outcome === "bad" && <X className="ml-1 inline h-3 w-3 align-middle text-red-500" />}
      </span>
    </li>
  );
}

export function GameHistoryPanel() {
  const { gameState, myTeam } = useGame();
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const groups = gameState ? buildRoundGroups(gameState, myTeam) : [];
  const entryCount = groups.reduce((sum, g) => sum + g.entries.length, 0);

  // Entries read oldest-first, so the newest is off the bottom of the
  // scroll box -- jump there whenever it opens or something new lands.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, entryCount]);

  if (!gameState) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-t bg-card shrink-0"
      data-testid="game-history-panel"
    >
      <CollapsibleTrigger
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/40"
        data-testid="button-toggle-history"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          Game History
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
            {entryCount}
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div ref={scrollRef} className="max-h-56 overflow-y-auto px-3 pb-3" data-testid="history-scroll">
          {groups.length === 0 ? (
            <p className="py-1 text-[11px] text-muted-foreground" data-testid="text-history-empty">
              Nothing has happened yet.
            </p>
          ) : (
            groups.map(group => (
              <div key={group.round} className="pt-1" data-testid={`history-round-${group.round}`}>
                <div className="flex items-center gap-2 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Round {group.round}
                  </span>
                  {group.pending && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Target className="h-2.5 w-2.5" />
                      in progress
                    </span>
                  )}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <ul className="space-y-0.5">
                  {group.entries.map(entry => (
                    <EntryRow key={entry.key} entry={entry} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
