# P4: Deep Evolution — Final Implementation Spec

> **Sign-off note:** This spec incorporates all feedback from Claude's review (9 issues).
> PRs 1+3+5 merged into PR-A. PRs 2+8 merged into PR-B. 5-keyword option deferred from PR-C.
> Seed genome 4 rotation made flexible (principle, not prescription). Directive injection uses
> natural language framing ("Your team's strategic approach:"), not mechanical delimiters.
> Token budget implemented via ordering strategy (summary first, then raw clue detail).
> Base rate context added to evaluation formatting. `directiveRoleMapping` metadata dropped.

---

## Diagnosis

The honesty audit revealed four root causes of evolutionary theater:

1. **Genome text barely changes player behavior.** System prompts are weak levers. The user prompt (keywords, code, history, deliberation context) dominates player output. 6 of 8 seed genomes produce indistinguishable play.
2. **Coaches confabulate, not diagnose.** They see aggregate stats (`miscommunicationRate: 0.357`) but never the actual clues that caused problems. Every coach converges on "simplify clues."
3. **Evolution collapsed to 1 dimension.** 66% of patches target `cluePhilosophy`. `deliberationScaffold` has never been edited. 5 of 6 modules are evolutionarily dead.
4. **Sample sizes are noise.** 4 games per sprint gives near-zero statistical power.

P4 addresses all four. Five PRs, buildable in parallel.

| PR | Name | Root Cause Addressed |
|----|------|---------------------|
| PR-A | Clue-Level Evidence + Match Narratives | Coach blindness |
| PR-B | Task Directive Pipeline | Genome leverage |
| PR-C | Game Rules: 3 intercepts, min 3 rounds | Richer data |
| PR-D | Actionable Seed Genomes | Behavioral coupling |
| PR-E | Sprint Size + Base Rates | Statistical power |

---

## PR-A: Clue-Level Evidence + Match Narratives

### Summary

Extract per-round clue-level evidence from match data — our clues AND opponent clues — and present the coach with ONE integrated view per match. The coach sees an aggregate evaluation summary FIRST, then the full raw clue data below it for causal diagnosis.

### Files to Modify

- `server/sprintEvaluator.ts` — new function `buildClueEvidence()`, rewrite `buildPerMatchSummaries()` to produce clue-level narratives
- `server/coachPrompts.ts` — new formatter `formatMatchEvidence()`, wire into `buildProposalSystemPrompt()` and `buildReviewSystemPrompt()`
- `shared/schema.ts` — new types for clue evidence on `SprintEvaluation`

### Detailed Implementation

**New types in `shared/schema.ts`:**

```typescript
export interface ClueEvidence {
  clueWord: string;
  targetKeyword: string;
  targetPosition: number;  // 1-4
  teammateCorrect: boolean;
  opponentIntercepted: boolean;
}

export interface RoundEvidence {
  matchId: number;
  roundNumber: number;
  team: "amber" | "blue";
  code: [number, number, number];
  keywords: string[];
  clues: ClueEvidence[];
  teamDecoded: boolean;
  opponentIntercepted: boolean;
}

export interface MatchClueEvidence {
  matchId: number;
  focalTeam: "amber" | "blue";
  ourKeywords: string[];
  theirKeywords: string[];
  ourRounds: RoundEvidence[];
  opponentRounds: RoundEvidence[];
}
```

Add `clueEvidence: MatchClueEvidence[]` to `SprintEvaluation`.

**In `server/sprintEvaluator.ts`, add `buildClueEvidence()`:**

For each match, extract BOTH focal team and opponent team rounds:

```typescript
function buildClueEvidence(
  matches: Match[],
  rounds: MatchRound[],
  input: SprintEvaluationInput,
): MatchClueEvidence[] {
  const evidence: MatchClueEvidence[] = [];
  const roundsByMatch = groupBy(rounds, r => r.matchId);

  for (const match of matches) {
    const focalTeam = resolveFocalTeam(match, input);
    const opponentTeam = oppositeTeam(focalTeam);
    const ourKeywords = asStringArray(
      focalTeam === "amber" ? match.amberKeywords : match.blueKeywords
    );
    const theirKeywords = asStringArray(
      opponentTeam === "amber" ? match.amberKeywords : match.blueKeywords
    );

    const allMatchRounds = roundsByMatch.get(match.id) || [];

    const extractRounds = (team: Team, keywords: string[]): RoundEvidence[] => {
      return allMatchRounds
        .filter(r => r.team === team)
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map(round => {
          const code = asCodeTuple(round.code);
          const clues = asStringArray(round.clues);
          if (!code || clues.length === 0) return null;

          const ownGuess = asCodeTuple(round.ownGuess);
          const opponentGuess = asCodeTuple(round.opponentGuess);

          const clueEvidences: ClueEvidence[] = code.map((pos, i) => ({
            clueWord: clues[i] || "???",
            targetKeyword: keywords[pos - 1] || `keyword_${pos}`,
            targetPosition: pos,
            teammateCorrect: ownGuess ? ownGuess[i] === pos : round.ownCorrect,
            opponentIntercepted: opponentGuess ? opponentGuess[i] === pos : round.intercepted,
          }));

          return {
            matchId: match.id,
            roundNumber: round.roundNumber,
            team,
            code,
            keywords,
            clues: clueEvidences,
            teamDecoded: round.ownCorrect,
            opponentIntercepted: round.intercepted,
          };
        })
        .filter(Boolean) as RoundEvidence[];
    };

    evidence.push({
      matchId: match.id,
      focalTeam,
      ourKeywords,
      theirKeywords,
      ourRounds: extractRounds(focalTeam, ourKeywords),
      opponentRounds: extractRounds(opponentTeam, theirKeywords),
    });
  }

  return evidence;
}
```

**Integrated match narrative formatter in `server/coachPrompts.ts`:**

Each match gets ONE integrated view: outcome, our clues with results, opponent clues.

```typescript
function formatMatchEvidence(evidence: MatchClueEvidence[], match: Match): string {
  const focalTeam = evidence.focalTeam;
  const opponentTeam = oppositeTeam(focalTeam);
  const outcome = match.winner === focalTeam ? "WIN" : match.winner === null ? "DRAW" : "LOSS";
  const lines: string[] = [];

  lines.push(
    `Match ${evidence.matchId} (us: ${focalTeam}, opp: ${opponentTeam}) -- ${outcome} in ${match.totalRounds ?? 0} rounds`
  );
  lines.push(`  Our keywords: ${evidence.ourKeywords.join(", ")}`);
  lines.push(`  Their keywords: ${evidence.theirKeywords.join(", ")}`);

  // Our clues with full outcomes
  for (const round of evidence.ourRounds) {
    const codeStr = `[${round.code.join(",")}]`;
    const clueDetails = round.clues.map(c => {
      const tm = c.teammateCorrect ? "ok" : "MISS";
      const op = c.opponentIntercepted ? "LEAK" : "safe";
      return `"${c.clueWord}"->${c.targetKeyword} ${tm}/${op}`;
    }).join(", ");

    let roundStatus = "";
    if (!round.teamDecoded) roundStatus += " MISCOM";
    if (round.opponentIntercepted) roundStatus += " INTERCEPTED";

    lines.push(`  R${round.roundNumber} ${codeStr}: ${clueDetails}${roundStatus}`);
  }

  // Opponent clues
  if (evidence.opponentRounds.length > 0) {
    lines.push(`  --- opponent clues ---`);
    for (const round of evidence.opponentRounds) {
      const clues = round.clues.map(c =>
        `"${c.clueWord}"->${c.targetKeyword}`
      ).join(", ");
      const weCracked = round.opponentIntercepted ? " [WE CRACKED THIS]" : "";
      lines.push(`  R${round.roundNumber}: ${clues}${weCracked}`);
    }
  }

  return lines.join("\n");
}

function formatAllMatchEvidence(evidenceList: MatchClueEvidence[], matches: Match[]): string {
  if (evidenceList.length === 0) return "No clue-level evidence available.";
  const matchById = new Map(matches.map(m => [m.id, m]));
  return evidenceList.map(ev => {
    const match = matchById.get(ev.matchId);
    if (!match) return null;
    return formatMatchEvidence(ev, match);
  }).filter(Boolean).join("\n\n");
}
```

**Token budget strategy — ordering in coach prompt:**

The clue-level detail goes AFTER the aggregate evaluation section. The coach reads the summary/evaluation first (framing context), then the raw clue data for causal diagnosis. This means the coach reads:

1. Sprint result summary (aggregate stats)
2. Sprint evaluation (win rates, miscommunication rates, with base rate context — see PR-E)
3. Clue-level evidence (full match narratives with every clue, outcome, opponent data)

In `buildProposalSystemPrompt()`, the sections are ordered:

```
"## Latest Sprint Result",
formatSprintResult(...),

"## Sprint Evaluation",
formatEvaluation(...),  // includes base rates — see PR-E

"## Clue-Level Evidence (raw match data for diagnosis)",
formatAllMatchEvidence(clueEvidence, matches),
```

The aggregate evaluation provides framing ("miscommunication rate was 35.7%, above arena average of 22%"). The raw data below lets the coach identify WHY ("'surf' leaked for 'wave' in 3 of 4 matches").

### Schema Changes

Add to `SprintEvaluation` interface:
```typescript
clueEvidence: MatchClueEvidence[];
```

No SQL migration needed — `SprintEvaluation` is stored as JSONB in `sprint_evaluations.evaluation`.

### Validation

- Coach proposals reference specific clues by name ("'surf' leaked because it's a direct synonym for 'wave'")
- Coach patches target modules other than `cluePhilosophy` when evidence shows deliberation or interception problems
- Coach proposals reference opponent clue patterns ("opponent used 'reaping' for 'harvest' — their clue style is concrete/functional")
- `opponentModeling` module patch frequency increases from near-zero
- The formatted evidence is human-readable in coach AI call logs

---

## PR-B: Task Directive Pipeline

### Summary

Extend the genome compiler to produce `taskDirectives` per role. These are freeform text strings injected into the user prompt with natural language framing, where the model will actually follow them. Defines exactly where in each user prompt the directives appear.

### Files to Modify

- `shared/schema.ts` — extend `CompiledPromptArtifact` with `taskDirectives: string | null`
- `server/genomeCompiler.ts` — new directive extraction logic, bump `COMPILER_VERSION` to `"2.0.0"`
- `server/promptStrategies.ts` — add directive injection slots to all template functions
- `server/headlessRunner.ts` — thread directives through prompt building
- `server/coachPrompts.ts` — inform coach about task directives and how to write them

### Detailed Implementation

**Extend `CompiledPromptArtifact`:**

```typescript
export interface CompiledPromptArtifact {
  role: PromptRole;
  systemPrompt: string;
  taskDirectives: string | null;  // NEW: injected into user prompt
  tokenEstimate: number;
  charCount: number;
}
```

**No new genome module.** The compiler routes existing module text into `taskDirectives` for the appropriate roles:

```typescript
// In genomeCompiler.ts

const DIRECTIVE_MODULES: Record<Exclude<PromptRole, "coach">, GenomeModuleKey[]> = {
  cluegiver: ["executionGuidance", "cluePhilosophy"],
  own_guesser: ["executionGuidance"],
  interceptor: ["executionGuidance", "opponentModeling"],
  own_deliberator: ["deliberationScaffold"],
  intercept_deliberator: ["deliberationScaffold", "opponentModeling"],
};

function buildTaskDirectives(role: PromptRole, genome: GenomeModules): string | null {
  if (role === "coach") return null;
  const moduleKeys = DIRECTIVE_MODULES[role];
  const sections = moduleKeys
    .map(key => genome[key].trim())
    .filter(s => s.length > 0);
  if (sections.length === 0) return null;
  return sections.join("\n\n");
}
```

Update `buildArtifact()`:

```typescript
function buildArtifact(role: PromptRole, genome: GenomeModules): CompiledPromptArtifact {
  const systemPrompt = buildPrompt(role, genome);
  const taskDirectives = buildTaskDirectives(role, genome);
  const charCount = systemPrompt.length + (taskDirectives?.length || 0);
  return {
    role,
    systemPrompt,
    taskDirectives,
    charCount,
    tokenEstimate: Math.ceil(charCount / 4),
  };
}
```

**Inject into user prompts with natural language framing in `promptStrategies.ts`:**

Add a `taskDirectives?: string` field to every template params interface (`ClueTemplateParams`, `GuessTemplateParams`, `InterceptionTemplateParams`, `DeliberationOwnTemplateParams`, `DeliberationInterceptTemplateParams`).

In each template function, inject as a natural paragraph before the task instruction:

```typescript
// In clue template, before "YOUR TASK: Give one clue per keyword..."
if (params.taskDirectives) {
  prompt += `\n\nYour team's strategic approach:\n${params.taskDirectives}`;
}
```

For deliberation templates:

```typescript
// In deliberation own first turn, before "YOUR TASK: Work with your teammate..."
if (params.taskDirectives) {
  prompt += `\n\nYour team's analytical approach:\n${params.taskDirectives}`;
}
```

The framing is conversational — "Your team's strategic approach:" — not mechanical delimiters. The model reads it as part of the prompt, not as a separate injected artifact.

**Hook point specification (for reference — no data structure needed):**

| Role | Hook Location | What Gets Injected |
|------|---------------|-------------------|
| `cluegiver` | After game state, before "YOUR TASK" | `executionGuidance` + `cluePhilosophy` |
| `own_guesser` | After clues shown, before "YOUR TASK" | `executionGuidance` |
| `interceptor` | After opponent clues shown, before "YOUR TASK" | `executionGuidance` + `opponentModeling` |
| `own_deliberator` | After game state, before "ANALYTICAL APPROACH" | `deliberationScaffold` |
| `intercept_deliberator` | After opponent evidence, before "YOUR TASK" | `deliberationScaffold` + `opponentModeling` |

**Thread through `headlessRunner.ts`:**

In `processClues()`, `processGuesses()`, `processInterceptions()`, and deliberation functions:

```typescript
const taskDirectives = promptOverrides?.[team]?.compiledPrompts?.prompts[role]?.taskDirectives ?? undefined;

const clueParams = {
  ...existing,
  taskDirectives,
};
```

No change to `HeadlessTeamPromptOverrides` — `compiledPrompts` already carries `CompiledPromptArtifact` which now includes `taskDirectives`.

**Update coach prompt in `coachPrompts.ts`:**

Explain the directive pipeline in plain text. No `directiveRoleMapping` data structure — the coach prompt itself describes the mapping:

```
"## How Genome Modules Affect Players",
"Your genome modules are compiled into two outputs per role:",
"1. A system prompt (advisory context the model sees before the task)",
"2. Task directives (injected into the user prompt where the model sees the actual game task)",
"",
"Task directives are the HIGH-LEVERAGE channel. Here's how modules map to roles:",
"  executionGuidance -> cluegiver, own_guesser, interceptor (during action phases)",
"  deliberationScaffold -> own_deliberator, intercept_deliberator (during team discussion)",
"  cluePhilosophy -> cluegiver (during clue generation)",
"  opponentModeling -> interceptor, intercept_deliberator (during opponent analysis)",
"  riskTolerance, memoryPolicy -> system prompt only (advisory context)",
"",
"Write executionGuidance and deliberationScaffold as specific, operational instructions the",
"player should follow during gameplay — not philosophical essays.",
"",
"Example executionGuidance that works:",
"  'For each keyword, mentally list 3 candidate clues. For each candidate, estimate: (a) probability",
"   teammate decodes correctly, (b) probability opponent intercepts. Choose the candidate with the",
"   best ratio. Never use a direct synonym or category label.'",
"",
"Example deliberationScaffold that works:",
"  'State your confidence level (high/medium/low) before each guess. If you and your teammate",
"   disagree, explicitly list the evidence for each interpretation before converging.'",
```

### Schema Changes

- `CompiledPromptArtifact.taskDirectives: string | null` — no SQL migration, stored in JSONB.
- All template param interfaces gain `taskDirectives?: string`.
- **No `directiveRoleMapping` metadata.** The coach prompt explains the mapping in plain text.

### Validation

- Grep player AI call logs for "Your team's strategic approach:" — should appear in user prompts
- Compare player output with and without directives — directive-equipped genomes should produce measurably different clue patterns
- `deliberationScaffold` edits by coaches should now appear in patch history (currently zero)
- Coach edits to `executionGuidance` and `deliberationScaffold` increase as a percentage of total patches (target: >40%, up from ~5%)

---

## PR-C: Game Rules — 3 Intercepts, Min 3 Rounds

### Summary

Require 3 interception tokens to win (up from 2) and enforce a minimum of 3 rounds before any terminal condition. This creates richer data per game.

### Files to Modify

- `shared/schema.ts` — update `GameRules` defaults
- `server/game.ts` — respect new rules in game logic

### Detailed Implementation

**Update `GameRules` defaults:**

```typescript
export const DEFAULT_GAME_RULES: GameRules = {
  whiteTokenLimit: 2,
  blackTokenLimit: 3,       // CHANGED from 2: requires 3 intercepts to win
  minRoundsBeforeWin: 3,    // CHANGED from 0: minimum 3 rounds before any terminal condition
  maxRounds: 20,
};
```

The `blackTokenLimit: 3` change is the key one. Requiring 3 intercepts instead of 2:
- Produces more rounds per game (more data per game)
- Gives more time for strategy to develop and adapt
- Makes interception a sustained campaign, not a lucky 2-shot
- Creates more clue evidence per game for the coach

The `minRoundsBeforeWin: 3` ensures every game produces at least 3 rounds of data regardless of token accumulation.

**Keep old defaults available:**

```typescript
export const CLASSIC_GAME_RULES: GameRules = {
  whiteTokenLimit: 2,
  blackTokenLimit: 2,
  minRoundsBeforeWin: 0,
  maxRounds: 20,
};
```

**5-keyword option is DEFERRED.** It touches keyword generation, code generation, prompt templates, UI rendering, and scoring logic — non-trivial changes that don't address any of the four root causes. Can revisit post-P4 if needed.

### Schema Changes

No SQL migration. `GameRules` is stored as JSONB on the `matches` table. New defaults applied at runtime.

### Validation

- Average rounds per match increases from ~3-4 to ~5-6 with new defaults
- Interception-win games require 3 tokens (verify in match data)
- No game ends before round 3

---

## PR-D: Actionable Seed Genomes

### Summary

Replace vague philosophical seed genomes with specific, operational directives that LLMs actually follow. Focus especially on `executionGuidance` and `deliberationScaffold` (the task-directive channels from PR-B).

### Files to Modify

- `server/coachLoop.ts` — replace `SEED_GENOME_TEMPLATES` array and `DEFAULT_GENOME_EXTENSION_FIELDS`

### Detailed Implementation

**New seed genomes (8 templates, showing first 4):**

```typescript
export const SEED_GENOME_TEMPLATES: GenomeModules[] = [
  {
    cluePhilosophy:
      "Connect through intermediate concepts. Never use direct synonyms, category labels, " +
      "or rhymes. For 'ocean', don't say 'water' or 'sea' -- say 'horizon' (visible at the " +
      "ocean) or 'salt' (ocean is salty). The intermediate hop makes interception harder " +
      "while keeping the path traceable for teammates who know the keyword.",
    opponentModeling:
      "After round 2, review the opponent's clue history. For each of their clue words, " +
      "note which keyword position it most likely maps to. When you have 2+ clues pointing " +
      "at the same keyword, attempt interception. Do not guess randomly -- only intercept " +
      "when you have a specific hypothesis about at least 2 of the 3 code positions.",
    riskTolerance:
      "Default to teammate-clarity over obscurity. If a clue has >80% chance your teammate " +
      "gets it but 30% chance opponent intercepts, use it. Only shift to riskier clues when " +
      "opponent is at 2 interception tokens and you must avoid giving them the third.",
    memoryPolicy:
      "Track which of your clue words got intercepted. Any clue approach that was intercepted " +
      "must not be reused for the same keyword. If 'metallic' was intercepted for 'iron', " +
      "next time clue 'wrinkle' (iron a shirt) or 'golf' (iron club).",
    executionGuidance:
      "For each keyword in the code, mentally list 3 candidate clues. For each candidate, " +
      "estimate: (a) probability teammate decodes it correctly, (b) probability opponent " +
      "intercepts. Choose the candidate with the best clarity-to-leakage ratio. State your " +
      "chosen clue as a single word.",
    deliberationScaffold:
      "State your confidence level (high/medium/low) before each guess. Explain the specific " +
      "association chain: 'I think clue X maps to keyword Y because X connects to Y through Z.' " +
      "If you and your teammate disagree, list the evidence for each interpretation before " +
      "converging. Do not agree just to end the discussion.",
  },
  {
    cluePhilosophy:
      "Clue using physical sensory experience. For each keyword, ask: what does this look like, " +
      "sound like, smell like, feel like? Prioritize texture, sound, smell over visual appearance " +
      "(visual is too obvious). For 'forest', say 'pine' (smell) or 'crunch' (leaves underfoot), " +
      "not 'trees' or 'green'.",
    opponentModeling:
      "Aggressive interception focus. From round 1, build a running map of opponent keyword " +
      "positions. Each clue narrows the possibilities. By round 3, you should have strong " +
      "hypotheses for 3 of their 4 keywords. Share your interception hypotheses with teammates " +
      "during deliberation.",
    riskTolerance:
      "High risk tolerance. Accept that 1 in 5 clues may confuse your teammate if it makes " +
      "interception near-impossible. The math favors security: a miscommunication costs 1 token, " +
      "but giving the opponent an easy intercept also costs 1 token while giving them information " +
      "about your keywords for future rounds.",
    memoryPolicy:
      "Maintain a mental map of opponent keyword-clue associations. After each round, update: " +
      "'Position 2 is probably castle -- they used fortress (R1), medieval (R2).' When " +
      "interception evidence is strong enough (3+ consistent clues), commit to the intercept.",
    executionGuidance:
      "When giving clues, close your eyes mentally and imagine encountering the keyword. What " +
      "physical sensation stands out? Use that sensation as your clue. When guessing, reverse " +
      "the process: what physical experience does this clue evoke, and which keyword would " +
      "produce that experience?",
    deliberationScaffold:
      "During own-team deliberation, always address interception risk explicitly: 'If we think " +
      "clue X means keyword Y, would the opponent also think that?' During intercept deliberation, " +
      "build the hypothesis table out loud: 'Position 1 evidence: R1=fortress, R2=medieval, " +
      "R3=drawbridge. Hypothesis: castle. Confidence: high.'",
  },
  {
    cluePhilosophy:
      "Use functional and relational associations. What does the keyword DO? What is it used FOR? " +
      "What is it part of? For 'hammer', say 'build' (function) or 'toolbox' (container), not " +
      "'heavy' (property) or 'Thor' (too obvious cultural reference). Functional links are " +
      "harder to intercept because many keywords share functions.",
    opponentModeling:
      "Defensive posture. Focus 80% of deliberation time on decoding your own clues correctly. " +
      "Only attempt interception when the evidence is overwhelming (4+ clues clearly pointing " +
      "to the same keyword). Your win condition is sustained correct decoding without " +
      "miscommunication, forcing the opponent to take risks.",
    riskTolerance:
      "Low risk. Always prefer the clue your teammate is most likely to decode, even if the " +
      "opponent might also get it. A guaranteed team decode is worth more than a possible " +
      "interception defense. The exception: when opponent is at 2 interception tokens, " +
      "then obscurity becomes critical.",
    memoryPolicy:
      "Focus on YOUR OWN consistency. Establish clue patterns early and maintain them. If you " +
      "clued 'ocean' with 'tide' in R1, consider 'surf' in R2 (same experiential domain). " +
      "Teammates learn your style. Consistency builds decode reliability over multiple rounds.",
    executionGuidance:
      "Before giving a clue, ask: 'What is the primary function of this keyword?' Use that " +
      "function as your clue. Before guessing, ask: 'What keyword has this function?' " +
      "Before intercepting, ask: 'What function pattern has the opponent been cluing?'",
    deliberationScaffold:
      "Start each deliberation by listing what you are CERTAIN about, then what you are UNCERTAIN " +
      "about. 'Certain: clue A maps to keyword 3 (same pattern as R1). Uncertain: clue B could " +
      "be keyword 1 or keyword 4.' Then focus discussion on the uncertain mappings only.",
  },
  {
    cluePhilosophy:
      "Rotate your association type between rounds to prevent opponent pattern recognition. " +
      "Don't use the same kind of link twice in a row -- if you used a synonym last round, " +
      "switch to sensory, functional, or cultural this round. The variety makes it harder " +
      "for opponents to build a consistent model of your cluing style while keeping each " +
      "individual clue clear for your teammate.",
    opponentModeling:
      "Balanced approach. Split deliberation time 50/50 between own decode and interception " +
      "analysis. Adapt based on score: when behind on interception tokens, increase interception " +
      "effort to 70%. When opponent is close to winning via interception, shift to maximum " +
      "security cluing.",
    riskTolerance:
      "Adaptive risk. High risk in early rounds (establish advantage while opponent has limited " +
      "data). Conservative in later rounds (protect accumulated position). If losing, increase " +
      "risk dramatically -- nothing to lose. If winning, play safe.",
    memoryPolicy:
      "Learn from failures, not successes. If a clue was intercepted, WHY? Was it too direct? " +
      "Too consistent with previous rounds? If a clue caused miscommunication, WHY? Was it too " +
      "abstract? Too obscure? Adjust the specific failure mode, not your whole strategy.",
    executionGuidance:
      "Before each clue, ask: 'What kind of association did I use last round?' Then deliberately " +
      "pick a different kind. If you used a synonym last time, try a sensory link. If sensory, " +
      "try functional. The goal is unpredictability for the opponent while maintaining clarity " +
      "for your teammate. When guessing, consider that your clue-giver may be varying their style.",
    deliberationScaffold:
      "Frame each deliberation as a decision under uncertainty. For each possible code mapping, " +
      "state the probability and key evidence. 'P(clue A = kw3) = 0.8 because of R1 pattern. " +
      "P(clue B = kw1) = 0.5, could also be kw4.' Then pick the mapping with highest joint " +
      "probability.",
  },
  // ... 4 more templates with distinct operational styles
];
```

**Note on seed genome 4:** The rotation strategy is expressed as a flexible principle ("don't use the same kind of link twice in a row") rather than a rigid per-round prescription (no "R1: synonyms, R2: sensory, R3: functional" sequence). The LLM chooses which association type to switch to based on the game situation.

**Update `DEFAULT_GENOME_EXTENSION_FIELDS`:**

```typescript
const DEFAULT_EXECUTION_GUIDANCE =
  "For each keyword in the code, mentally generate 3 candidate clues. " +
  "Evaluate each for teammate decode probability and opponent interception risk. " +
  "Choose the candidate with the best ratio. When guessing, explain the " +
  "association chain connecting each clue to your proposed keyword.";

const DEFAULT_DELIBERATION_SCAFFOLD =
  "State your confidence level before each guess. Explain the specific " +
  "association chain: clue X maps to keyword Y because X connects to Y " +
  "through Z. If disagreement exists, list evidence for each interpretation " +
  "before converging. Do not agree just to end discussion.";
```

### Schema Changes

None. Genome modules are stored as JSONB. New seed genomes are just different text.

### Validation

- Player output shows behavioral differentiation between seed genomes (compare clue patterns across seeds)
- Players follow directive-style instructions: "mentally list 3 candidates" produces visible reasoning in AI call logs
- The 8 seed genomes produce measurably different interception and miscommunication rates

---

## PR-E: Sprint Size + Base Rates

### Summary

Increase default games per sprint and add arena-wide base rate context to evaluations so coaches can reason about relative performance.

### Files to Modify

- `server/coachLoop.ts` — change default `matchesPerSprint` to `4`
- `server/anchorEvaluator.ts` — change `DEFAULT_GAMES_PER_ANCHOR` from `1` to `4`
- `server/sprintEvaluator.ts` — compute and include arena-wide base rates in evaluation
- `server/coachPrompts.ts` — format base rate context in evaluation section
- `scripts/test-arena.ts`, `scripts/test-ecology.ts` — update hardcoded values with comments

### Detailed Implementation

**In `server/coachLoop.ts`:**

```typescript
matchesPerSprint: asPositiveInteger(overrides.matchesPerSprint, 4),
// Development default: 4 (= 8 games after side-swap). For production/real runs, set to 8 (= 16 games).
// Test scripts use 2.
```

`matchesPerSprint: 4` means 8 games per sprint. This is the development default — enough signal for iteration without excessive cost. For real arena runs, set `matchesPerSprint: 8` (16 games) for stronger statistical power.

**In `server/anchorEvaluator.ts`:**

```typescript
const DEFAULT_GAMES_PER_ANCHOR = 4;
```

**Base rate context in `server/sprintEvaluator.ts`:**

Compute arena-wide averages for the current sprint across all coaches:

```typescript
interface ArenaBaseRates {
  avgMiscommunicationRate: number;
  avgInterceptionRate: number;
  avgWinRate: number;
  coachCount: number;
}

async function computeArenaBaseRates(
  sprintNumber: number,
  arenaId: number,
): Promise<ArenaBaseRates> {
  // Query all sprint evaluations for this sprint in this arena
  // Average the key metrics across all coaches
  // Return base rates
}
```

Add `arenaBaseRates: ArenaBaseRates | null` to `SprintEvaluation`.

**Format base rates in `server/coachPrompts.ts`:**

In the evaluation section, add base rate context inline:

```typescript
function formatEvaluationWithBaseRates(
  evaluation: SprintEvaluation,
  baseRates: ArenaBaseRates | null,
): string {
  let lines: string[] = [];

  // Existing evaluation metrics
  lines.push(`Win rate: ${evaluation.winRate}`);
  lines.push(`Miscommunication rate: ${evaluation.miscommunicationRate}`);
  lines.push(`Interception rate: ${evaluation.interceptionRate}`);

  // Base rate context
  if (baseRates) {
    lines.push("");
    lines.push(`Arena context (${baseRates.coachCount} coaches this sprint):`);
    lines.push(`  Arena avg miscommunication: ${baseRates.avgMiscommunicationRate}`);
    lines.push(`  Arena avg interception rate: ${baseRates.avgInterceptionRate}`);
    lines.push(`  Arena avg win rate: ${baseRates.avgWinRate}`);
  }

  return lines.join("\n");
}
```

This lets coaches reason about relative performance. "35.7% miscommunication" means nothing in isolation. "35.7% miscommunication vs arena average of 22%" tells the coach they have a real problem.

**In test scripts, use smaller values with comments:**

```typescript
matchesPerSprint: 2, // Test mode: development default is 4, production is 8
```

### Schema Changes

Add `arenaBaseRates: ArenaBaseRates | null` to `SprintEvaluation`. No SQL migration (JSONB).

### Validation

- Default arena runs produce 8 games per sprint per coach (4 matchesPerSprint * 2 side-swap)
- Sprint evaluations include base rate context
- Coach proposals reference relative performance ("our miscommunication rate is above arena average")
- Anchor evaluation uses 4 games per anchor (not 1)

---

## Migration Plan

### SQL Migrations

**No SQL migrations required.** All new fields are within existing JSONB columns:

- `SprintEvaluation` (stored as JSONB in `sprint_evaluations.evaluation`) gains `clueEvidence` and `arenaBaseRates`
- `CompiledPromptArtifact` gains `taskDirectives` — stored within `CompiledGenomePrompts` JSONB
- `GameRules` defaults change but schema does not

### Data Backfill

None required. New fields are populated going forward. Old sprint evaluations without `clueEvidence` will render as "No clue-level evidence available." in coach prompts via null-check in formatters.

### Rollback

All changes are additive. Old coaches that don't understand task directives will simply see slightly longer prompts. Old game rules continue to work (new defaults only apply to new matches).

---

## Validation Checklist

### PR-A (Clue-Level Evidence + Match Narratives)
- [ ] Sprint evaluations contain `clueEvidence` array with per-round, per-clue data for both teams
- [ ] Coach prompt shows aggregate evaluation FIRST, then raw clue data
- [ ] Coach proposals reference specific clue words by name
- [ ] Coach proposals reference opponent clue patterns
- [ ] `opponentModeling` module patch frequency > 10% (up from ~0%)

### PR-B (Task Directive Pipeline)
- [ ] Player AI call logs contain "Your team's strategic approach:" in user prompts (not mechanical delimiters)
- [ ] Removing all task directives produces measurably different player output
- [ ] `executionGuidance` text appears verbatim in cluegiver user prompts
- [ ] Coach edits to `executionGuidance` and `deliberationScaffold` > 40% of total patches
- [ ] No `directiveRoleMapping` data structure in compiled output

### PR-C (Game Rules)
- [ ] Average rounds per match >= 4 with new defaults
- [ ] Games require 3 interception tokens to end (not 2)
- [ ] `minRoundsBeforeWin: 3` enforced (no game ends before R3)
- [ ] No `keywordCount` option (deferred)

### PR-D (Actionable Seed Genomes)
- [ ] Seed genomes produce distinguishable player behavior (different clue word patterns)
- [ ] Seed genome 4 uses flexible rotation principle, not rigid per-round prescription
- [ ] `executionGuidance` and `deliberationScaffold` are non-generic across seeds
- [ ] Player AI call logs show players following seed-specific instructions

### PR-E (Sprint Size + Base Rates)
- [ ] Default sprint produces 8 games (4 matchesPerSprint * 2 side-swap)
- [ ] Documentation notes that 8 matchesPerSprint is for production runs
- [ ] Evaluation section includes arena-wide base rates
- [ ] Coach proposals reference relative performance vs arena average
- [ ] Anchor evaluation uses 4 games per anchor (not 1)

### Cross-PR Integration
- [ ] Genome module edit distribution across 6 modules is more even (no module > 40% of patches)
- [ ] Coach proposals demonstrate causal reasoning: "clue X failed because Y, so I'm changing module Z"
- [ ] Evolution produces genuine behavioral divergence between coaches after 5+ sprints
