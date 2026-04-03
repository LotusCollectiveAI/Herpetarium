# Autoresearch x Herpetarium: How the Coach Loop Maps to the Hottest Pattern in AI

**April 2026**

This analysis maps the autoresearch pattern -- as embodied by Karpathy's repo and its March 2026 explosion of derivatives -- onto the Herpetarium V2 coach loop. It identifies what to steal, what Herpetarium already has that autoresearch lacks, and specific implementation patterns that would make the coach loop more effective.

---

## 1. The Autoresearch Landscape as of April 2026

### 1.1 Karpathy's Original (March 7, 2026)

**Repo:** [karpathy/autoresearch](https://github.com/karpathy/autoresearch) -- 61.5k stars, 8.6k forks as of late March.

The core is three files: `prepare.py` (data), `train.py` (the single file the agent edits), and `program.md` (the instruction prompt). The loop: edit `train.py`, train for exactly 5 minutes, check `val_bpb`, keep or revert via git, log to `results.tsv`, repeat forever. The instruction includes "NEVER STOP" in all caps. Git is the memory. The metric is the only judge.

The design is deliberately minimal. One file, one metric, one fixed time budget, one binary decision (keep/discard). No exploration-exploitation tradeoff management. No multi-objective balancing. No experiment budgeting beyond the 5-minute cap. The agent's own reasoning about what to try next is the only "exploration strategy."

Key result from the original: Karpathy ran it for 2 days and found ~20 tweaks yielding ~11% speedup on hand-tuned code. Shopify CEO Tobi Lutke pointed it at their templating engine and got 53% faster rendering from 93 automated commits.

### 1.2 The Derivative Explosion

Within three weeks of release, the pattern spawned a recognizable ecosystem:

**Direct domain ports:**
- [Nunchi-trade/auto-researchtrading](https://github.com/Nunchi-trade/auto-researchtrading) -- Autoresearch for trading strategies. Modifies `strategy.py`, backtests against Hyperliquid perp data, keeps improvements. Started from Sharpe 2.7, discovered a 6-signal ensemble at Sharpe 21.4 over 103 experiments. The most important finding: the strongest gains came from *removing* complexity, not adding it. Every "smart" feature was tested then permanently removed.
- **WecoAI/awesome-autoresearch** -- Curated list with optimization traces. Includes nanoGPT optimization (20 improvements overnight), Vesuvius Challenge ink detection (cross-scroll generalization nearly doubled), Bitcoin price formula search (328 experiments, 50.5% RMSE improvement).

**Generalized agent skills:**
- [uditgoenka/autoresearch](https://github.com/uditgoenka/autoresearch) -- Claude Code skill that generalizes autoresearch beyond ML. "Set the GOAL, Claude runs the LOOP, you wake up to results." Any domain with a measurable metric. Released March 13, one week after Karpathy.
- [drivelineresearch/autoresearch-claude-code](https://github.com/drivelineresearch/autoresearch-claude-code) -- Port of pi-autoresearch as a Claude Code skill.
- **ARIS (Auto-Research-In-Sleep)** -- 31 composable Markdown-only skills for autonomous ML research. Zero dependencies. Cross-model review loops where Claude drives research and an external LLM acts as critical reviewer. Works with Claude Code, Codex, OpenClaw, or any agent.

**Full research pipelines:**
- [aiming-lab/AutoResearchClaw](https://github.com/aiming-lab/AutoResearchClaw) -- 23-stage pipeline from idea to LaTeX paper. Multi-source literature discovery (OpenAlex, Semantic Scholar, arXiv), sandbox experimentation, multi-agent peer review. As of March 30, supports loading custom skills and runs on any ACP-compatible backend.

### 1.3 Sakana AI's "The AI Scientist" (Published in Nature, March 2026)

**Paper:** [Nature, s41586-026-10265-5](https://www.nature.com/articles/s41586-026-10265-5)

Collaboration between Sakana AI, UBC, Vector Institute, and Oxford. The system creates research ideas, writes code, runs experiments, plots data, writes manuscripts, and performs its own peer review. AI Scientist-v2 submitted three fully AI-generated papers to an ICLR 2025 workshop; one was accepted with scores of 6, 7, 6 (above average human acceptance threshold).

The scaling law finding matters: as foundation models improve, generated paper quality improves correspondingly. The automated reviewer achieved 69% balanced accuracy, comparable to human reviewers, and exceeded the inter-human agreement measured in the NeurIPS 2021 consistency experiment.

Important caveat from the Nature publication itself: humans helped filter the most promising outputs. This is not yet fully autonomous end-to-end.

### 1.4 GEPA: Genetic-Pareto Reflective Prompt Evolution (ICLR 2026 Oral)

**Repo:** [gepa-ai/gepa](https://github.com/gepa-ai/gepa) | **Paper:** [arxiv 2507.19457](https://arxiv.org/abs/2507.19457)

This is the most directly relevant system for Herpetarium's coach loop. GEPA merges textual reflection with multi-objective evolutionary search for prompt optimization. Three core mechanisms:

1. **Genetic prompt evolution** -- iteratively mutates prompts using natural language feedback from rollouts. Each candidate accumulates "high-level lessons" from observations.
2. **Natural language reflection** -- instead of collapsing traces to scalar reward, the LLM reads full execution traces (error messages, profiling data, reasoning logs) to diagnose *why* a candidate failed and propose targeted fixes.
3. **Pareto-based selection** -- maintains a Pareto front instead of evolving only the global best. Stochastic exploration of top performers for each problem instance.

Results: outperforms GRPO (reinforcement learning) by 6% on average and up to 20%, using up to 35x fewer rollouts. Outperforms MIPROv2 (leading prompt optimizer) by over 10%.

---

## 2. The Structural Mapping: Autoresearch Loop vs. Coach Loop

Here is the precise correspondence:

| Autoresearch Stage | Herpetarium Coach Stage | Key Difference |
|---|---|---|
| Read code + git history + results log | **Observe**: match outcomes, transcripts, quality events, prior artifacts | Herpetarium observes *adversarial multi-agent dynamics*, not a single metric trajectory |
| Form hypothesis about what might improve | **Diagnose + Hypothesize**: failure matrix completion, Belief Ledger updates | Herpetarium separates diagnosis from hypothesis, requires falsifiers |
| Edit `train.py` | **Patch**: generate patch cards against genome rules | Herpetarium patches are typed, atomic, auditable, tied to specific failure classes |
| Run 5-minute training | **Validate**: next sprint of matches | Herpetarium validation is stochastic (opponent behavior varies) and delayed (FOIA) |
| Check `val_bpb`, keep or revert | **Commit**: germline or somatic mutation | Herpetarium has two commitment levels plus rollback triggers |
| Log to `results.tsv` | Patch Ledger + Institutional Memory | Herpetarium's logging is richer but also heavier |

### What This Mapping Reveals

The coach loop IS an autoresearch loop. It is a strictly more complex instance of the same pattern, with three additional dimensions that standard autoresearch does not handle:

1. **Adversarial non-stationarity.** In autoresearch, the evaluation function (`val_bpb`) is stationary. In Herpetarium, the "eval function" is other teams that are also adapting. The metric landscape shifts as you optimize.

2. **Information asymmetry and delayed feedback.** Autoresearch gets immediate, deterministic feedback. Herpetarium gets stochastic feedback contaminated by opponent behavior, and some causal effects only become visible after FOIA disclosure changes the information regime.

3. **Multi-agent credit assignment.** Autoresearch edits one file and measures one number. Herpetarium must attribute wins and losses across multiple players, multiple rounds, multiple strategic rules, and multiple opponent matchups.

---

## 3. What Herpetarium Should Steal

### 3.1 The "NEVER STOP" Discipline

Karpathy's most important design choice is not technical. It is the instruction "NEVER STOP." The agent does not pause for human approval. It does not ask whether to continue. It runs until killed.

**For Herpetarium:** The coach loop spec describes a rich six-stage cycle, but it does not prescribe autonomy duration. It should. The coach should run N sprints without human intervention as the default mode, with human checkpoints being the exception, not the rule. The interesting behaviors emerge at sprint 50, not sprint 5.

### 3.2 Git as Memory (or: The Genome Versioning System IS the Experiment Log)

Autoresearch uses git commits as the persistent record of what worked. Every successful experiment is a commit. Every failed experiment is a revert. The commit history IS the research narrative.

**For Herpetarium:** The Genome, Belief Ledger, Patch Ledger, and Institutional Memory are the right abstractions, but they should be backed by actual version control semantics. Each sprint's coaching cycle should produce a commit-like immutable snapshot. The diff between sprint N and sprint N+1 should be as legible as a git diff. The "revert to sprint K's genome" operation should be a first-class primitive, not a manual reconstruction.

Consider: `genome_history` as a git-like DAG where germline commits are linear and somatic trials are branches that get merged or abandoned. This is exactly how git works. Use the metaphor literally.

### 3.3 Fixed Time Budgets for Experimentation

Autoresearch's 5-minute training cap is genius. It makes every experiment directly comparable. It prevents the agent from gaming the metric by training longer. It creates a natural clock for the loop.

**For Herpetarium:** Each sprint should have a fixed match count and a fixed time budget for coach deliberation. The coach gets N minutes of LLM inference time to complete all six stages. If it runs out, it must commit whatever patches it has or commit nothing. This prevents coaches from burning infinite tokens on analysis paralysis and makes coach efficiency itself a measurable quantity.

### 3.4 The Binary Keep/Discard Aesthetic (Simplified for Early Phases)

Autoresearch's beauty is the binary decision: improved or not. No "maybe." No "promising but needs more data." Keep or revert.

**For Herpetarium:** The somatic/germline distinction is scientifically correct but adds complexity. For Experiment Zero specifically, consider running a simplified mode: each patch is either promoted (kept) or rolled back after its trial window. No indefinite "somatic" limbo. Force the decision. You can add nuance later once you have proven that the basic loop works. This is exactly the "science first, tournament theater second" principle from the vision doc applied to the coach loop itself.

### 3.5 GEPA's Pareto Front for Multi-Objective Patch Selection

This is the most directly actionable steal. GEPA maintains a Pareto front of candidates rather than only tracking the single best. In Herpetarium terms: the coach should maintain multiple candidate genome variants and evaluate them against different opponent clusters, not just optimize a single genome against the average opponent.

**Concretely:** Instead of committing one patch set per sprint, the coach could maintain 2-3 somatic variants tested against different opponent classes. GEPA's "Pareto-based selection" maps directly to "this genome variant is best against taxonomy-first opponents, this one is best against relational opponents." That is already implicit in the tactics layer's `applies_when` conditions, but GEPA shows you can formalize it as multi-objective optimization with real selection pressure.

### 3.6 ARIS's Cross-Model Review Pattern

ARIS implements cross-model collaboration where one agent drives research while an external LLM acts as critical reviewer. This is exactly the native head + foreign skeptic topology, but ARIS does it with zero infrastructure -- just Markdown skill files.

**For Herpetarium:** The hybrid coach topology is already specified, but the implementation should be as lightweight as ARIS demonstrates. The skeptic review does not need a separate orchestration layer. It can be a single structured prompt exchange: "Here is the head coach's proposed patch set and evidence chain. You are from a different model family. What would you veto and why?" The output is a structured objection list that the head coach must address before commit.

### 3.7 Optimization Traces as First-Class Artifacts

WecoAI's awesome-autoresearch requires every entry to include "a link to the actual optimization trajectory so you can see what the agent tried, not just the final result." This is the right standard.

**For Herpetarium:** The Patch Ledger already captures individual patches, but the sprint-level optimization trajectory -- the full sequence of what the coach considered, what it rejected before proposing, what the skeptic vetoed -- should be a first-class artifact. Not for the coach's consumption (that is what Institutional Memory is for), but for the human researchers analyzing the system. Call it the "Coach Trace" or "Sprint Trajectory." It is the optimization trace for the coaching process itself.

---

## 4. What Herpetarium Has That Autoresearch Lacks

### 4.1 Structured Credit Assignment

Autoresearch has no credit assignment problem. It changes one thing, measures one number, done. Herpetarium's failure matrix, belief ledger, and patch card system are a genuine advance over the autoresearch pattern because they address the hardest problem in multi-agent optimization: figuring out *why* something worked or failed.

The failure matrix (2x2: team hit/miss vs opponent hit/miss) is a simple but powerful diagnostic tool that has no equivalent in any autoresearch derivative. It forces the coach to distinguish between "we got better" and "the opponent got worse" and "we leaked" and "we were unlucky."

### 4.2 Adversarial Evaluation

Every autoresearch system evaluates against a fixed function. Herpetarium evaluates against other adapting agents. This means Herpetarium naturally generates Red Queen dynamics, arms races, and strategy cycles that no single-agent optimization loop can produce. This is scientifically more interesting and practically harder.

### 4.3 Information Architecture as Independent Variable

Autoresearch has no concept of information asymmetry. Everyone can see everything. Herpetarium's visibility tiers, FOIA disclosure, and protocol half-lives create a genuine mechanism design layer that turns information flow into an experimental variable. This is unique. No other auto-research system treats *what the optimizer can see* as a thing you deliberately vary.

### 4.4 Belief Persistence with Falsification

Autoresearch systems are memoryless across experiments in a deep sense. Git history records *what* was tried, but the agent re-reads code and results fresh each iteration. There is no persistent model of "what I believe about the problem."

Herpetarium's Belief Ledger -- with explicit confidence, evidence chains, competing hypotheses, and defined falsifiers -- is architecturally more sophisticated. It lets the coach accumulate knowledge across sprints without re-deriving everything from raw transcripts. This is the difference between a researcher with a lab notebook and a researcher who starts from scratch every morning.

### 4.5 The Compiler as Reproducibility Guarantee

No autoresearch system has anything like the Prompt Compiler with a stable ABI. Autoresearch systems let the agent modify code freely. Herpetarium separates "what the strategy is" (genome) from "how it gets rendered" (compiler) and guarantees that same genome + same ABI = same prompt. This is what makes the science publishable.

---

## 5. What Autoresearch Has That Herpetarium Lacks

### 5.1 Simplicity

The coach loop is a six-stage cycle with four persistent artifacts, two coach roles, six genome layers, typed patch cards with eight metadata fields, and a disclosure clock. Autoresearch is: edit, run, check number, keep or revert.

This is not a criticism. Herpetarium's complexity is justified by its multi-agent adversarial setting. But the complexity creates real implementation risk. The most likely failure mode is that the coach loop is so elaborate that it never actually runs autonomously for long enough to produce interesting results.

**Mitigation:** Build the simplest possible coach loop first. One genome layer (tactics only). One coach (no skeptic). Binary keep/discard on patches. No disclosure clock. Run it for 100 sprints. If it improves teams, add complexity. If it does not, the elaborate architecture is premature.

### 5.2 Speed of Iteration

Autoresearch runs 12 experiments per hour. ~100 overnight. Herpetarium matches take longer (multi-turn, multi-agent, multiple API calls), coach cycles take longer (six stages with LLM inference), and sprints batch multiple matches. The iteration speed will be at least 10x slower, probably 50x slower.

**Mitigation:** Reduce sprint size for early experiments. 3 matches per sprint, not 10. Budget coach inference time strictly. Run matches in parallel where provider rate limits allow. The goal is to get to 50+ sprints in a 48-hour autonomous run, because that is where the interesting dynamics start.

### 5.3 Clear Rollback Semantics

Autoresearch's `git reset` is unambiguous. The state reverts to exactly where it was before the failed experiment. Herpetarium's rollback is muddier: a patch rollback affects one rule in one genome layer, but the Belief Ledger has already been updated, Institutional Memory has already recorded the attempt, and opponents may have already adapted to the failed patch during its trial window.

**Mitigation:** Define "rollback" precisely. A rolled-back somatic patch reverts the genome rule to its pre-patch state. The Belief Ledger retains the entry but marks it "disconfirmed." Institutional Memory records the rollback as evidence. The patch history is permanent; only the genome state reverts.

---

## 6. Specific Implementation Patterns

### 6.1 The "program.md" for Coaches

Karpathy's `program.md` is 630 lines of clear instructions that an LLM agent can follow autonomously. Herpetarium needs the equivalent: a `coach-program.md` that fully specifies the six-stage loop in LLM-executable terms.

This document should be:
- Self-contained (no external references needed during execution)
- Explicit about inputs and outputs for each stage
- Clear about what constitutes a "keep" vs "revert" decision
- Explicit about time/token budgets per stage
- Unambiguous about the "NEVER STOP" equivalent: "Complete the six-stage cycle. Begin the next sprint. Do not pause for human review unless a containment alarm fires."

### 6.2 The Results Log

Autoresearch logs to `results.tsv`: timestamp, experiment description, metric before, metric after, keep/discard. Herpetarium should have an equivalent flat-file sprint log:

```tsv
sprint  matches  wins  losses  patches_proposed  patches_kept  patches_reverted  genome_version  coach_tokens  wall_time_sec
12      5        3     2       3                 2             0                 cobra-v17       45000         340
13      5        4     1       2                 1             1                 cobra-v18       38000         295
```

This makes the optimization trajectory immediately visible without parsing complex artifact structures.

### 6.3 The Cheapness Constraint

Karpathy's setup runs on a single GPU. Tournament 1 cost $33.27 for 84 matches. This cheapness is load-bearing -- it enables running enough experiments for the results to matter.

Coach inference adds cost. Each six-stage cycle is multiple LLM calls. If each sprint costs $5 in coach tokens, 100 sprints is $500 before match costs. That may be fine, but it should be budgeted explicitly.

**Pattern:** Set a per-sprint coach token budget. If the coach exceeds it, it must commit whatever it has. Track coach efficiency (patch yield per dollar) as a metric. This creates natural pressure toward the concise, targeted coaching style that will actually produce good patches.

### 6.4 The Nunchi Insight: Removal as Improvement

Nunchi's auto-research trading found that the strongest gains came from removing complexity. Every "smart" feature was tested then permanently removed when it hurt performance.

**For Herpetarium:** The coach should be explicitly instructed that "remove rule X" is a valid and potentially high-value patch. Genome simplification should be celebrated, not treated as a failure of creativity. Track genome complexity (total rule count, total token count when compiled) as an observational metric. If the best teams converge on simpler genomes, that is a finding.

### 6.5 The GEPA Pattern: Reflective Diagnosis Before Mutation

GEPA reads full execution traces to diagnose *why* a candidate failed before proposing changes. This is exactly what the Diagnose stage does, but GEPA formalizes it as the core innovation over pure evolutionary search.

**For Herpetarium:** The Diagnose stage should produce a structured diagnosis document that the coach must complete before entering Hypothesize. Not "what happened" but "why it happened" with specific transcript evidence. The quality of this diagnosis is the leading indicator of patch quality. Track diagnosis-to-patch-success correlation as a coach calibration metric.

---

## 7. What the March 2026 Energy Means

The explosion happened because Karpathy proved that the pattern works with zero infrastructure. `program.md` is a prompt. `train.py` is a file. Git is the database. The loop runs in a terminal. That is it.

Within three weeks, people applied it to trading, ink detection, Bitcoin prediction, web performance, and fully autonomous paper writing. GEPA won an ICLR Oral by formalizing the evolutionary prompt version. The AI Scientist published in Nature. ARIS turned it into composable Markdown skills.

The energy is: **autonomous improvement loops are now a commodity pattern.** The question is no longer "can an AI agent iteratively improve a thing" -- that is settled. The questions that matter now are:

1. **What eval criteria can you define for fuzzy domains?** (This is @jonnym1ller's "mining the invisible" thesis from Signal Garden's corpus.) Autoresearch works because `val_bpb` is unambiguous. Herpetarium works because win/loss is unambiguous. The hard frontier is domains where the metric itself must be discovered or constructed.

2. **What happens when the thing you are optimizing is also optimizing against you?** This is Herpetarium's unique contribution to the pattern. No autoresearch derivative handles adversarial non-stationarity. Herpetarium is the first system that runs the autoresearch loop against opponents who are also running autoresearch loops. That is Red Queen dynamics, and it produces fundamentally different behavior than optimizing against a fixed benchmark.

3. **What happens when information itself is a strategic variable?** Autoresearch assumes full observability. Herpetarium's disclosure architecture makes observability itself an experimental variable. This is the mechanism design layer that turns "autonomous optimization" into "autonomous strategic adaptation under adversarial information regimes."

4. **How do you maintain persistent beliefs across context windows?** Every autoresearch system is memoryless at the level of beliefs. Git remembers *what* was tried, but not *why* the agent thought it would work. Herpetarium's Belief Ledger is the first attempt to give an autoresearch-style loop a persistent epistemic state.

The right way to build the coach loop is to start with the autoresearch pattern's brutal simplicity -- one metric, one file, keep or revert -- and add complexity only when the simple version produces a specific, named inadequacy. Build the $33 version first. Run it for 100 sprints. Let the science tell you what the architecture needs next.

---

## Sources

- [karpathy/autoresearch](https://github.com/karpathy/autoresearch)
- [autoresearch/program.md](https://github.com/karpathy/autoresearch/blob/master/program.md)
- [Nunchi-trade/auto-researchtrading](https://github.com/Nunchi-trade/auto-researchtrading)
- [uditgoenka/autoresearch (Claude Code skill)](https://github.com/uditgoenka/autoresearch)
- [aiming-lab/AutoResearchClaw](https://github.com/aiming-lab/AutoResearchClaw)
- [gepa-ai/gepa](https://github.com/gepa-ai/gepa) | [ICLR 2026 Oral paper](https://arxiv.org/abs/2507.19457)
- [The AI Scientist, Nature](https://www.nature.com/articles/s41586-026-10265-5) | [Sakana AI announcement](https://sakana.ai/ai-scientist-nature/)
- [WecoAI/awesome-autoresearch](https://github.com/WecoAI/awesome-autoresearch)
- [alvinreal/awesome-autoresearch](https://github.com/alvinreal/awesome-autoresearch)
- [ARIS (Auto-Research-In-Sleep)](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)
- [drivelineresearch/autoresearch-claude-code](https://github.com/drivelineresearch/autoresearch-claude-code)
- [Karpathy Autoresearch Complete Guide (o-mega)](https://o-mega.ai/articles/karpathy-autoresearch-complete-2026-guide)
- [autoresearch: Blueprint for Agents That Improve Themselves (mager.co)](https://www.mager.co/blog/2026-03-14-autoresearch-pattern/)
- [DataCamp Guide to AutoResearch](https://www.datacamp.com/tutorial/guide-to-autoresearch)
