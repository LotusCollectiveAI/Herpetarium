# Signal Garden Review → Build Decisions

**Date:** 2026-04-01
**Source:** `docs/reviews/signal-garden-april-2026/herpetarium-v2-master-synthesis.md`
**Orchestrator:** Claude Code (Opus 4.6)

---

## Triage Categories

- **(A) Immediately Actionable** — Build now, directly aligns with Experiment Zero
- **(B) Needs Design Work** — Requires a mini-spec before building; present to human
- **(C) Interesting but Defer** — Real value, but not for Experiment Zero
- **(D) Reject** — Doesn't fit the vision or over-engineers

---

## Gap-by-Gap Triage

### Gap 1: Phase 1 is still too complex → **(A) Immediately Actionable**

**Decision:** Agree completely. Experiment Zero is the gate. Strip to essentials.

**What exists:** The codebase already has game execution, tournament orchestration, headless matches, and a basic evolutionary loop with structured genomes. That's more than enough substrate.

**What to build:** A simple coach loop that runs post-sprint, reviews match results, proposes a tactical patch, and either keeps or reverts. One coach per team. No meta-evolution. No multi-variant lineages. Binary keep/revert.

**Key constraint from vision doc:** "The coach loop is a state machine, not a reflective journaling app." Every sprint ends in exactly one of: commit / revert / escalate.

**Infrastructure note:** Synthesis recommends SQLite + DuckDB. We already have PostgreSQL + Drizzle. Keeping PostgreSQL — it handles both operational and analytical queries fine at Experiment Zero scale. DuckDB sidecar can come later if query patterns demand it.

---

### Gap 2: No arena-first architecture doc → **(A) Immediately Actionable**

**Decision:** This is the FIRST thing to build. Everything else depends on the contract.

**Deliverable:** `docs/SPEC_ARENA_ARCHITECTURE.md` containing:
- Authoritative game state model
- Legal action schemas (ClueAction, GuessAction, CoachPatchProposal, BeliefUpdate, DisclosureArtifact)
- Role-specific observation schemas (what each player/coach/auditor sees)
- Disclosure schedule schemas
- Replay event schema
- Mutation window semantics
- Failure recovery rules

**Vision alignment:** "Centralized orchestrator owns ground truth. Agents never see raw global truth unless the rules allow it." This is Pattern 1 from the arena landscape scan.

---

### Gap 3: Stronger decomposition of skill → **(A) Immediately Actionable**

**Decision:** Yes. Stop collapsing everything into win rate.

**What exists:** `metrics.ts` already tracks model performance, matchup matrices, TOM analysis. `transcriptAnalyzer.ts` does pattern analysis. `bradleyTerry.ts` does Bayesian ranking.

**What to add (Experiment Zero level):**
- Teammate decode rate (already partially tracked)
- Clue generation quality (clue-to-decode success)
- Opponent interception resistance (how often opponents correctly intercept)
- Opponent interception skill (how often we correctly intercept)
- Adaptation score (strategy drift between sprints)
- Basic deception markers (behavior-rationale divergence)

**What to defer:** Belief calibration score, disclosure robustness, full deception production/detection separation.

---

### Gap 4: Belief Ledger needs formal governance → **(B) Needs Design Work**

**Decision:** The Belief Ledger is essential to V2 but needs a mini-spec before building.

**Key tension:** The synthesis recommends a 4-layer stack (Ledger → Governance → Meta-Reasoning → Compiled Context). That's beautiful architecture. But for Experiment Zero, we need the simplest typed belief store that a coach can actually use.

**Experiment Zero scope:**
- Typed belief entries: { proposition, scope, confidence, evidence_refs, timestamp, revision_parent }
- Append-only with revision links
- No governance layer yet (that's Phase 2)
- No meta-reasoning layer yet
- Simple JSON rendering for coach prompts

**Design work needed:** Mini-spec for the belief schema and how the coach reads/writes it.

---

### Gap 5: Cross-lineage retrieval (Fossil Museum) → **(C) Defer**

**Decision:** Correct instinct, wrong time. Needs the coach loop running and producing patches before a Patch Index makes sense.

**What to do now:** Log all patches with metadata (failure class, opponent, disclosure regime, effect size). The index is just a query pattern over this data later.

---

### Gap 6: Matchmaking is underspecified → **(B) Needs Design Work**

**Decision:** The mixed scheduler (40% near-peer / 25% diagnostic / 15% mirror / 10% novelty / 10% baseline) is a strong design. But it requires rating infrastructure and opponent clustering we don't have yet.

**Experiment Zero scope:** Simple round-robin with some randomized role swaps. That's enough for 8 teams × 100 sprints. Add informative scheduling once we have rating data to drive it.

**Design work needed:** Mini-spec for how the scheduler evolves from round-robin to the full mixed model.

---

### Gap 7: Deception measurement is too scalar → **(A) Immediately Actionable**

**Decision:** Replace single DCR with a measurement bundle. Start with what we can compute from existing transcripts and action logs.

**Experiment Zero bundle:**
- **Overt Lie Rate** — clues that contradict known codebook associations
- **Selective Omission Index** — information available but not surfaced in deliberation
- **Behavior-Rationale Divergence** — gap between stated reasoning and actual actions
- **Observation Sensitivity Index** — behavioral difference between high/low visibility conditions

**Defer:** Delayed Betrayal Score, Confidence Modulation Drift, Coordination Opacity Score (need more sophisticated opponent modeling infrastructure).

---

### Gap 8: Behavior-only detectors → **(A) Immediately Actionable**

**Decision:** Yes. Language gets cleaned under observation; behavior is harder to sanitize.

**What to build:**
- Action-sequence anomaly detection (clue pattern shifts after disclosure)
- Clue-family convergence (teams using increasingly similar clue strategies)
- Propagation velocity after disclosure (how fast leaked tactics appear in other teams)
- Timing analysis (deliberation duration shifts)

**What exists:** `transcriptAnalyzer.ts` and `tomAnalyzer.ts` have the foundation. Extend, don't rewrite.

---

### Gap 9: FOIA needs to be an actual experiment → **(B) Needs Design Work**

**Decision:** FOIA as factorial condition is the strongest scientific lever in Herpetarium. But it needs careful design to not blow up Experiment Zero scope.

**Experiment Zero scope (from synthesis):** 3 disclosure conditions:
1. No disclosure
2. Delayed summary every 3 sprints
3. Delayed summary every 5 sprints

**Design work needed:** Mini-spec for what gets disclosed, in what format, and how coaches consume it.

---

### Gap 10: Cross-model skepticism underdesigned → **(B) Needs Design Work**

**Decision:** The native head + foreign skeptic topology is central to V2 science. But Experiment Zero should start with one coach per team, then add the skeptic as a condition.

**Experiment Zero scope:** One coach per team. The coach can be same-family or cross-family — that's a variable, not architecture.

**Post-Experiment Zero:** Add skeptic as a second coach role with veto power. Track veto yield, patch acceptance rate, downstream win improvement.

---

### Gap 11: No world model of the arena → **(C) Defer**

**Decision:** The 3-layer ecology model (empirical game matrix, interaction graph, latent strategy embedding) is Phase 2+. Experiment Zero produces the data; the world model consumes it.

**What to do now:** Store full pairwise matchup outcomes. That's the empirical game matrix, layer 1, for free.

---

### Gap 12: Coach loop needs closure mechanisms → **(A) Immediately Actionable**

**Decision:** Hardest agree. "The coach loop is a state machine, not a reflective journaling app."

**Hard rules for Experiment Zero:**
- No proposal without executable diff (patch against genome)
- No patch without verify plan (what to measure)
- Every sprint ends in exactly one of: commit / revert / escalate
- Archive all rejected patches with reason codes
- Repeated stalls (3+ consecutive reverts) trigger forced simplification

**This is the core of what we're building.** The coach loop IS the product.

---

## Infrastructure Patterns to Adopt

From the arena landscape convergence (Section 2.3):

| Pattern | Status | Action |
|---------|--------|--------|
| Centralized orchestrator owns ground truth | ✅ Exists (headlessRunner) | Formalize in arena spec |
| Typed action schemas | 🟡 Partial (Zod schemas exist) | Add ClueAction, GuessAction, CoachPatchProposal, BeliefUpdate |
| Hard turn TTLs and bounded budgets | ✅ Exists (timeouts, token budgets) | Codify in arena spec |
| Replay and transcript export first-class | ✅ Exists (match logs, export router) | Add coach trace and disclosure artifacts |
| Ranking beyond single Elo | 🟡 Partial (Bradley-Terry) | Add pairwise matrix, non-transitivity diagnostics |
| Hidden info as view projection | ✅ Exists (role-specific prompts) | Formalize visibility tiers |
| Informative match scheduling | ❌ Missing | Round-robin for now; design mixed scheduler |

---

## Build Order

### Phase A: Foundation (This Session)
1. **Arena Architecture Spec** — the contract everything builds against
2. **Coach Loop State Machine** — the core Experiment Zero mechanism
3. **Typed Belief Ledger** — simplest version the coach can use
4. **Decomposed Skill Metrics** — extend existing analytics

### Phase B: Measurement (Next Session)
5. **Deception Measurement Bundle** — replace scalar DCR
6. **Behavioral Detectors** — action-trace analytics
7. **Basic FOIA Disclosure** — 3 conditions for Experiment Zero

### Phase C: Scheduling & Polish
8. **Matchmaking Scheduler** — graduate from round-robin
9. **Cross-Model Skeptic** — second coach role
10. **Patch Index** — queryable archive of all coach mutations

---

## Rejected / Deferred Items

| Item | Reason |
|------|--------|
| Full 6-tier visibility spectrum | Experiment Zero needs 3 tiers max |
| Meta-evolution of search policy | Phase 3+, after coach loop proves itself |
| Evolving memory schema | Phase 3+ |
| Public spectator product | Not science |
| Activation-probe safety stack | Requires frontier model access we don't have |
| Multi-role coach bureaucracy | One coach per team for Experiment Zero |
| DuckDB/SQLite migration | PostgreSQL handles Experiment Zero scale |
| Formal verification (Leanstral) | Interesting but not blocking |
| MAP-Elites for strategic genomes | Phase 2+ |
| Pareto frontier maintenance | Phase 2+ (after single-best proves limiting) |

---

## Vision Guard Rails

Every implementation decision gets checked against these:

1. **LLM intelligence is the product.** If the code constrains what the coach can propose, it's wrong.
2. **Win/loss is the sole fitness signal.** No Goodharting on intermediate metrics.
3. **Surprise is a feature.** When a coach does something unexpected, log it, don't prevent it.
4. **PatchValue is retrospective, not gatekeeper.** Coaches commit any patch they want.
5. **Start simple, scale deliberately.** Experiment Zero gates everything.

---

---

## Adversarial Review Corrections (2026-04-01)

A Claude sub-agent ran an adversarial review of the original triage. Several criticisms were correct and changed the plan.

### Correction 1: Loop First, Spec Second

**Original:** Build Arena Spec first, then Coach Loop.
**Correction:** Build the dumbest possible coach loop first. Let it run 10 sprints. THEN extract the arena spec from what the coach actually consumed. The spec should formalize discovered reality, not predict it.
**Rationale:** We don't know what the coach needs to observe until a coach tries to observe something. Designing schemas in a vacuum produces rework.

### Correction 2: Coach Gets Win/Loss ONLY — Metrics Are For Researchers

**Original:** Build decomposed skill metrics and deception bundle as part of E0.
**Correction:** The coach receives ONLY win/loss signal. All other metrics (decode rate, interception skill, deception markers) are researcher-facing diagnostics, NEVER fed to the coach as optimization targets.
**Rationale:** Handing a coach legible skill metrics tells it what you think good play looks like. This flattens the strategy space to your preconceptions. Novel strategies — the ones that matter — won't register on metrics you designed before observing them. **This is a direct violation of Principle #1: LLM intelligence is the product.**

### Correction 3: Belief Memory Is Co-Dependent With Coach Loop

**Original:** Belief Ledger "needs design" and comes after coach loop.
**Correction:** Build minimal belief memory alongside the coach from sprint 1. Even a flat list of "I believe X because Y" that gets injected into the coach prompt is enough. Without any memory, the coach is amnesiac between cycles — then retrofitting beliefs onto a beliefless coach is harder than building them together.

### Correction 4: Forced Simplification Is Premature Control

**Original:** 3 consecutive reverts triggers forced simplification.
**Correction:** For E0, 3 consecutive reverts is INTERESTING DATA, not a failure mode. Log it. Study it. Don't automate the response. Deterministic overrides on LLM judgment are exactly the kind of guardrail that prevents discovering whether the model can self-correct.

### Correction 5: FOIA — Pick ONE Condition for E0

**Original:** 3 disclosure conditions.
**Correction:** Pick ONE. Either no disclosure or delayed disclosure. See if teams respond to disclosed information at all before parameterizing the schedule. The difference between 3-sprint and 5-sprint delay is meaningless if disclosure doesn't change behavior.

### Correction 6: Prompt Injection Is a Feature, Not a Bug

**Missing from original plan entirely.**
**Addition:** AI coaches evolving strategies create selection pressure toward prompt injection — clues that manipulate the opposing team's LLM processing. This is exactly the kind of emergent behavior the vision doc says we should study. Add DETECTION from day one (not prevention). If a coach evolves an injection strategy, that's a research finding, not an error.

### Revised Build Order

1. **Proof of Concept Coach Loop** — dumbest possible version. Feed transcripts + win/loss to Claude, get strategy patch, apply, run matches. No spec, no state machine, no metrics.
2. **Minimal Belief Memory** — flat list of beliefs injected into coach prompt from sprint 1.
3. **Validate the Loop** — does the coach actually improve team play over 10-20 sprints?
4. **Extract Arena Spec** — formalize what the PoC revealed the coach needs.
5. **Researcher Metrics** — add measurement for humans, never for coach.
6. **Prompt Injection Detection** — detector, not preventer.
7. **FOIA** — single condition, binary on/off.
8. **Scheduler** — only after the loop works.

*This document is the running record of decisions. Updated as work proceeds.*
