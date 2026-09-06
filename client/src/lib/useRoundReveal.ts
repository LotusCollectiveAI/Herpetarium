import { useEffect, useRef, useState } from "react";

// Drives the round-results reveal: one team at a time, that team's code
// uncovered a digit at a time, so the guesses shown above it can be checked
// off against each digit as it lands.
//
// The whole sequence is presentation. Every value it walks through is
// already in the round history the server sent, so nothing here decides an
// outcome -- skipping it, or never running it at all, shows the same result.

export const REVEAL_TIMINGS = {
  // Long enough to read the two guesses before the first digit lands.
  beforeFirstDigit: 800,
  betweenDigits: 620,
  // Hold on the completed code before moving to the other team.
  afterLastDigit: 1100,
} as const;

export const DIGITS_PER_CODE = 3;

export interface RoundRevealState {
  /** Index into the team order; null once the sequence has finished. */
  teamIndex: number | null;
  /** How many of this team's digits are face up, 0..DIGITS_PER_CODE. */
  revealed: number;
  done: boolean;
  skip: () => void;
}

// Step 0 shows the first team with nothing revealed; each subsequent step
// turns one digit, and every DIGITS_PER_CODE + 1 steps moves to the next
// team. The last step is the finished state.
function stepsFor(teamCount: number) {
  return teamCount * (DIGITS_PER_CODE + 1);
}

function delayForStep(step: number): number {
  const within = step % (DIGITS_PER_CODE + 1);
  if (within === 0) return REVEAL_TIMINGS.beforeFirstDigit;
  if (within === DIGITS_PER_CODE) return REVEAL_TIMINGS.afterLastDigit;
  return REVEAL_TIMINGS.betweenDigits;
}

/**
 * @param teamCount how many teams to walk through, in order
 * @param enabled   false plays nothing and reports the finished state, for
 *                  replay scrubbing and for viewers who want it skipped
 */
export function useRoundReveal(teamCount: number, enabled: boolean): RoundRevealState {
  const total = stepsFor(teamCount);
  const [step, setStep] = useState(enabled ? 0 : total);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A round only reveals once, so the sequence deliberately does not restart
  // when enabled flips: skipping is one-way.
  useEffect(() => {
    if (step >= total) return;
    timer.current = setTimeout(() => setStep(s => s + 1), delayForStep(step));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [step, total]);

  const done = step >= total;
  return {
    teamIndex: done ? null : Math.floor(step / (DIGITS_PER_CODE + 1)),
    revealed: done ? DIGITS_PER_CODE : step % (DIGITS_PER_CODE + 1),
    done,
    skip: () => setStep(total),
  };
}
