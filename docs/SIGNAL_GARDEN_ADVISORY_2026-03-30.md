# Signal Garden Advisory Review: Herpetarium / Decrypto Arena
**Date:** 2026-03-30
**Corpus:** 376 curated signals, 432 harvest cards, 2,166-node knowledge graph
**Models:** Claude Opus 4.6 (3 specialized review agents)
**Source:** github.com/mstraw/signal-garden

---

## Executive Summary

- **Your analysis layer is broken and nothing else matters until you fix it.** No experiment isolation, no statistical framework, no confidence intervals. Every finding you produce today would be torn apart in peer review. Build the statistical layer this week.
- **The prompt strategy propagation bug has corrupted your entire dataset.** Zod validation strips `aiConfig` and `promptStrategy` from headless match configs. Every tournament, series, and evolution run used default prompts regardless of UI settings. Flag all existing data as `pre-fix` and patch `routes.ts` immediately.
- **Do not adopt an agent framework.** Three independent models at conviction 9 agree: the framework era is ending. Your stateless-functions-with-context-injection pattern is already correct. Fix the config propagation bug and upgrade scratch notes -- do not layer CrewAI or LangGraph on top.
- **TrueSkill 2 replaces Elo, pg-boss replaces your in-process Promise chains, and DuckDB replaces Postgres materialized views for analytics.** These are not suggestions -- they are the consensus answers from a corpus with high coverage of exactly these domains.
- **You have three publishable hypotheses sitting on the shelf.** The sycophancy-deception tradeoff, the Hivemind effect under competitive pressure, and emergent strategy via natural-language evolution. The corpus hands you strong priors and clean experimental designs for all three. The bottleneck is the analysis pipeline, not the ideas.
- **Your evolution engine should produce the eval rubric, not just the strategies.** The boldest synthesis across all three reviews: run evolution, compile winning strategies into model-agnostic instructions via Atlas-style memory promotion, then use those compiled strategies as the LLM-as-judge evaluation criteria. This closes the loop the brief leaves open and transforms Herpetarium from a platform that measures strategic reasoning to one that defines it empirically.
- **Supply chain security is unmentioned in the brief and should not be.** TeamPCP attacks on LLM-adjacent packages are the most acute operational risk in March 2026. Run `npm audit` this week.

---

## The March 2026 Reality Check

### Assumptions That Are Outdated

**Agent frameworks are dead.** The brief (Section 5 Q1, Section 6) lists CrewAI, AutoGen, LangGraph, and Pydantic AI as peer options. The corpus consensus is emphatic: do not adopt any of them. LangChain itself is pivoting from framework vendor to agent builder (Deep Agents -- their MIT-licensed open-source replica of Claude Code's core workflow). Aaron Levie's practitioner report confirms builder teams in production are moving to thin custom orchestrators. Your game-playing agents are stateless functions with structured I/O -- the overhead of any agent framework buys you nothing and costs debuggability.

**The cost table cannot handle thinking tokens.** The hardcoded `MODEL_COST_PER_1K` table covering 15 models is stale. Gemini 2.5 Pro and Flash bill thinking tokens separately from output tokens. Claude extended thinking budget tokens have different pricing. Reasoning models (o3, Gemini 2.5 Pro with thinking) have variable costs depending on thinking depth. The brief's "$5-50 per experiment run" is likely understating reasoning-model experiments.

**Extended thinking is broadly available now.** The brief gates Anthropic extended thinking to `promptStrategy === "advanced"` only. As of March 2026, extended thinking is available across all Claude 3.5+ models, Gemini 2.5 Pro has configurable `thinkingConfig`, and OpenAI offers `reasoning_effort` on o3/o1. The k-level and enriched strategies -- which benefit most from deep reasoning -- should trigger thinking tokens too.

**The embedding landscape has shifted.** The consensus is moving toward graph-structured retrieval over flat vector search for general use. But for Herpetarium's specific use case (clue-keyword cosine similarity, semantic drift detection), embeddings remain correct. The models to use: OpenAI `text-embedding-3-small` for scale, `text-embedding-3-large` for quality-sensitive analysis.

**DuckDB is the analytics answer, not Postgres materialized views.** The brief (Section 4.4) proposes Postgres window functions, CTEs, and materialized views. DuckDB 1.2 (streaming HTTP reads, Iceberg tables, 40% compression) is the embedded analytical database of choice for exactly this workload. It runs alongside Postgres as a read-only analytics layer. It is embeddable in both Node.js and Python.

### Things You Are Building That Already Exist

**pg-boss is the workflow answer.** You already have Postgres via Neon. `npm install pg-boss` gives you durable job queues with retry, backoff, and server-restart survival. Temporal is overkill, BullMQ requires Redis, Inngest is event-driven (wrong pattern for sequential batch jobs).

**Inspect AI's task/solver/scorer architecture is your eval template.** Your Decrypto game IS a task, your prompt strategies ARE solvers, your metrics engine IS a scorer. Study the ontology, then build your own. Do not integrate with Braintrust or DeepEval.

**AdaEvolve supersedes your static evolution approach.** Your evolution engine uses fixed mutation aggressiveness scaled by fitness score. AdaEvolve introduces adaptive search policies that adjust mutation and crossover strategy based on population fitness dynamics. Your engine is one generation behind.

**Hive does collaborative agent evolution.** Before building cross-population evolution from scratch, evaluate Hive's architecture where agents share intermediate solutions and build on each other's work.

**alphaXiv MCP server exists for literature access.** Accessing the ToM literature (ToMi, BigToM, FANToM, OpenToM) is now trivial via MCP-protocol search across millions of arXiv papers.

**PromptFoo already supports LLM-as-judge.** Use it for prototyping your judge rubric. Once the rubric works, embed it into your own system.

### Critical Things the Brief Misses

**Verification > Generation.** The corpus's most consequential philosophical signal: "In an era where generation is cheap, verification becomes the foundation of trust." Your TOM analyzer should be redesigned as a verification system -- verify behavioral predictions, not classify reasoning text.

**The verifier must reason independently.** DeepMind's Aletheia system (signal-8428) demonstrates that separating internal reasoning from output prevents hallucination self-reinforcement. Your two-pass architecture is validated, but the decision call must not see the reasoning call's chain of thought.

**Atlas compiled-memory pattern is missing from scratch notes.** The brief's scratch notes overwrite entirely each reflection. Atlas compiles memory into instruction-level sub-bullets promoted into the system prompt via a verification gate. The critical property: compiled instruction memory is model-agnostic. If you compile strategic insights from Claude games into instructions, those instructions work for GPT games too -- giving your cross-architecture research a free memory transfer layer.

**TrueSkill 2 is the correct rating system for team games.** Elo was designed for individual 1v1 chess. Decrypto is a team game where the same model's performance varies by teammate, opponent, keyword set, and strategy. Elo conflates all of these and is actively misleading you.

**Supply chain security is unmentioned.** TeamPCP attacks on LLM-adjacent packages (telnyx, litellm) and NeutralinoJS-style attacks injecting obfuscated code into JS config files are the most acute operational risk in March 2026.

**The Artificial Hivemind finding is a confound in every experiment.** Same-model teams produce homogeneous outputs (arXiv:2510.22954). Mixed-model teams should be the default for strategy evaluation; homogeneous teams measure model self-coherence, which is a different research question.

---

## Answers to Your 14 Questions

### Q1. Agent Architecture

**Keep stateless functions with context injection. Do not adopt an agent framework.**

Three-model consensus at conviction 9: the framework era is ending. LangChain's own pivot to Deep Agents confirms it. Your game-playing agents are function calls with structured I/O, not autonomous conversational agents. The overhead of CrewAI, AutoGen, or LangGraph buys nothing and costs debuggability. Fix the reflection call bug (`getDefaultConfig()` instead of player's actual model config) -- this corrupts your entire series dataset. Upgrade scratch notes from overwrite to append-with-diff using the Atlas compiled-memory pattern.

**Specifically:** No install needed. Fix the config propagation bug in `server/seriesRunner.ts`. Implement XSkill dual-stream schema: separate "Experiences" (action-level: "giving synonym clues for RIVER led to interception") from "Skills" (task-level: "shift to antonym-based clues when opponent has intercepted 1+ times"). Skills are promoted from Experiences when they recur across 3+ games.

**The contrarian view:** The research-vision review suggests an "AI as organization" lens where agents are employees with job descriptions, institutional memory, and peer relationships. This is a useful mental model for design but does not change the implementation recommendation -- stateless functions remain the right primitive.

---

### Q2. Workflow Orchestration

**pg-boss. No contest.**

Zero new infrastructure (runs on your existing Neon Postgres). Server restart survival is built in. Budget enforcement becomes a simple pre-flight check in the job handler. Temporal requires a separate server process and a steep learning curve designed for distributed systems you do not have. BullMQ requires Redis. Inngest is event-driven and cloud-first -- wrong pattern for sequential batch jobs with checkpointing. Graphile Worker has lower TypeScript ergonomics than pg-boss.

**Specifically:** `npm install pg-boss`. One job type per experiment kind: `tournament-match`, `series-game`, `evolution-generation`. Each job payload contains the full config needed to resume. The tournament/series/evolution runners become job producers. A single worker process consumes jobs with configurable concurrency.

**The contrarian view:** None. All three reviews agree on pg-boss.

---

### Q3. Eval & Benchmarking Frameworks

**Do not integrate with an existing eval framework. Your platform IS the eval framework.**

The corpus is brutal on existing eval tools: LoCoMo benchmark audit found 6.4% of ground-truth answer keys are wrong, and LLM judges accepted 62.81% of intentionally wrong answers. Braintrust, DeepEval, Arize Phoenix -- none appear in practitioner harvest cards with positive build implications for strategic reasoning eval. Silence is signal.

**Specifically:** Steal Inspect AI's ontology: Task (a Decrypto game with specific parameters) -> Solver (a prompt strategy + model combo) -> Scorer (win rate, interception rate, clue diversity, TOM depth). Build a fixed benchmark of 25 game configurations (specific keywords, codes, opponent models) as your regression suite AND publication baseline. Use round-level metrics as your cheap proxy; validate that they track game-level outcomes before optimizing against them. Source: Inspect AI (`https://github.com/UKGovernmentBEIS/inspect_ai`).

**The contrarian view:** The reality-check review notes that Inspect AI's architecture is worth studying. The tools review says use Inspect AI's ontology but not its code. The research-vision review does not mention Inspect AI at all, focusing instead on the statistical framework gap. Net: the ontology is valuable, the code is not.

---

### Q4. Structured Reasoning Capture

**The two-pass architecture is correct. Ship it.**

DeepMind's Aletheia system validates the approach: separating internal reasoning from output prevents hallucination self-reinforcement. For Anthropic, enable extended thinking on ALL strategies (not just "advanced"). For OpenAI, use `reasoning_effort: "high"` on o3/o1. For Gemini, use `thinking_config: { thinking_budget: 10000 }` on 2.5 Pro. For models without native thinking (GPT-4o, Gemini Flash), use an explicit reasoning prompt.

**Specifically:** Use native thinking tokens where available as the first pass, and structured output extraction (`response_format: { type: "json_schema" }`) as the second. `max_tokens: 50` for the decision pass. Make the reasoning pass configurable per experiment -- evolution fitness evaluation does not need reasoning traces (only outcomes), so skip it there to halve API costs.

**The contrarian view:** The research-vision review emphasizes that OOCR research shows models may strategize in ways the reasoning pass cannot capture. Thinking tokens are "structurally closer to actual computation" but still not ground truth. Behavioral metrics (what the agent does) will always be more reliable than cognitive metrics (what it says it thinks). The two-pass architecture is methodologically necessary but epistemically insufficient.

---

### Q5. LLM-as-Judge

**Build a minimal behavioral rubric, calibrate against human labels, and never trust it unsupervised.**

LLM judges are fundamentally unreliable on open-ended, preference-divergent queries. gpt-4o-mini accepted 62.81% of intentionally wrong answers in the LoCoMo audit. Strategic reasoning quality IS preference-divergent. The eval-reconciliation warns: "build your own ground truth is easy to recommend and brutally hard to execute."

**Specifically:** Build a four-level behavioral rubric: Level 0 (Reactive -- direct synonym, no opponent/teammate consideration), Level 1 (Team-Aware -- accounts for teammate knowledge), Level 2 (Opponent-Aware -- evidence of misdirection or pattern-breaking), Level 3 (Meta-Strategic -- evidence of multi-level deception). Label 50 reasoning traces yourself. Compute Cohen's kappa against the LLM judge. Iterate until kappa >= 0.7. Use a different model family for the judge than the players. Prototype with PromptFoo (`npm install promptfoo`).

**The contrarian view:** The reality-check review's boldest suggestion says the evolution engine should produce the eval rubric, not humans. Evolution discovers what good strategy looks like; compiled output becomes the judge's criteria. This is the long-term play, but you need a functioning judge first, and calibrating a human-designed rubric is the fastest path.

---

### Q6. Statistical Methods for AI Experiments

**TrueSkill 2 for ranking, bootstrap for CIs, Bradley-Terry for publishable pairwise comparisons. Drop Elo.**

Elo treats Decrypto like chess (individual 1v1 with stable player strength). Decrypto is a team game with partial information where performance varies by teammate, opponent, keyword set, and strategy. Elo conflates all of these and is actively misleading you. TrueSkill 2 estimates per-player skill AND per-player uncertainty, and handles the ambiguity of individual contribution to team outcomes.

**Specifically:** `pip install trueskill` (Python analysis pipeline). Bootstrap CIs (10,000 resamples) on all reported metrics via `scipy.stats.bootstrap`. For within-series non-independence, use mixed-effects models: player skill as fixed effect, series ID as random effect (`statsmodels.formula.api.mixedlm`). For sample sizes: detecting a medium effect (Cohen's d = 0.5) at alpha=0.05 with power=0.8 requires ~64 games per condition. Add effect sizes (Cohen's d) to every model comparison.

**The contrarian view:** None. All three reviews agree Elo must go.

---

### Q7. Evolutionary Computation with LLMs

**Your evolution engine is ahead of published literature. The main risk is degenerate convergence in language space.**

Your natural-language genome evolution is genuinely novel -- the academic closest comparisons (EvoPrompt, PromptBreeder) operate on shorter prompt fragments. The risk is not the algorithm but language-space degeneracy: two genomes with different words can produce identical strategies.

**Specifically:** (1) Replace uniform module-level crossover with differential evolution -- compute the diff between two high-fitness genomes and apply it to a third, preserving strategic coherence. (2) Add embedding-based semantic similarity as a diversity metric (if two genomes are > 0.9 cosine similar, they are functionally identical). (3) Implement fitness sharing (divide fitness by the number of genomes within a similarity radius) for niche preservation. (4) Study AdaEvolve (`https://github.com/search?q=AdaEvolve`) for adaptive search policies that adjust mutation strategy based on population dynamics. (5) Seed initial population with strategies generated by different LLMs (Claude, GPT, Gemini) for genuine architectural diversity.

**The contrarian view:** The research-vision review suggests that the evolution engine's discovery of strategies is secondary to the analysis pipeline that validates them. "The evolution engine is useless if you cannot statistically validate that evolved strategies are better." Fix statistics first, then upgrade evolution.

---

### Q8. Multi-Agent Game Simulation Platforms

**You are not building a competitor to Cicero or Pluribus. You are building an eval platform. Position accordingly.**

The builder community is not adopting Cicero, ChatArena, Sotopia, or Melting Pot as frameworks -- they are research artifacts, not tools. The closest academic precedent is GTBench, which covers game-theoretic reasoning across multiple games shallowly. Position Decrypto Arena as "GTBench depth on a single game" -- iterated play, persistent memory, evolution, and reasoning analysis that no other platform provides.

**Specifically:** Cite GTBench (`https://github.com/jinyu-hou/GTBench`) in publications. Steal from Cicero not the code but the architectural pattern: a language model for communication PLUS a planning module for strategy (your two-pass architecture mirrors this). The MiroFish "God View terminal" pattern (13K+ GitHub stars) -- 56 agents observable simultaneously -- is the direct UI reference for your experiment monitoring dashboard.

**The contrarian view:** The research-vision review argues Herpetarium's unique positioning is the combination of natural-language strategic reasoning + persistent memory + evolutionary search + cross-architecture comparison. No other platform occupies this intersection. This means positioning should emphasize the combination, not any single feature.

---

### Q9. Observability for AI Systems

**LangFuse for tracing, OpenTelemetry for infrastructure. Do not build custom.**

LangFuse is open-source, self-hostable, and focused on the tracing problem without bundling a framework. LangSmith's roadmap is uncertain given LangChain's pivot to Deep Agents. At your scale (hundreds to low thousands of games), storage is not a real concern -- a full Decrypto game generates ~100KB of trace data. 10,000 games = 1GB. This fits in Postgres without optimization.

**Specifically:** `npm install langfuse` (tracing SDK) or self-host via `docker pull langfuse/langfuse`. Wrap every AI call in a LangFuse trace containing: experiment ID, match ID, round number, player ID, prompt strategy, model config, full prompt, full response, reasoning trace, latency, tokens, cost, parse quality. `npm install @opentelemetry/sdk-node` for infrastructure observability.

**The contrarian view:** None across the three reviews, though the tools review adds that you should not optimize storage until you have more than 100,000 games.

---

### Q10. Theory of Mind Measurement

**Your regex-based TOM analyzer is not scientifically defensible. Replace it with behavioral measurement.**

The narrative TOM benchmarks (ToMi, BigToM, FANToM, OpenToM) test false-belief tasks in narrative contexts. Decrypto tests TOM via strategic interaction under adversarial pressure -- fundamentally different. The analyzer confounds prompt language with model reasoning. Correlation between TOM score and outcome does not prove the model has TOM.

**Specifically:** (1) Design behavioral probe rounds where the correct strategic response depends on modeling the opponent's knowledge state. (2) Run counterfactual probes -- re-run the same game state with different opponent interception history; if clues change, the agent is modeling the opponent. (3) Your `no_opponent_history` ablation flag is the simplest defensible TOM test: if removing opponent history does not degrade interception resistance, "opponent modeling" in the reasoning trace is just language. Do not report TOM levels as a linear scale -- report behavioral measures (does performance change when opponent information is present?). Use alphaXiv MCP for direct agent access to the ToM literature.

**The contrarian view:** The research-vision review argues that OOCR research means models may strategize in ways that are fundamentally unobservable from output alone. Even behavioral probes may not capture reasoning that happens in the forward pass without showing intermediate steps. This is an epistemological limit, not an engineering one.

---

### Q11. Embedding-Based Analysis

**OpenAI `text-embedding-3-small` for scale, `text-embedding-3-large` for quality-sensitive analysis. Run via API, not locally.**

At $0.02/1M tokens, 10,000 games of clue-keyword embeddings costs $0.02. Cosine similarity is correct for your use case. For drift detection: compute mean cosine similarity between clues and target keywords per round, per series -- a decreasing trend means clues are becoming more oblique (learning to avoid interception). For strategy clustering: embed full genome text and cluster with HDBSCAN.

**Specifically:** You already have the `openai` package installed. Use `dimensions: 256` for storage efficiency. For strategy clustering: `pip install hdbscan` and embed all four genome modules concatenated, then cluster to discover behavioral archetypes without hand-labeling.

**The contrarian view:** The corpus has strong anti-embedding signals for retrieval (PageIndex, napkin, Supermemory). These are irrelevant to your use case -- you are doing semantic similarity measurement, not retrieval. Embeddings are the right tool for this specific job.

---

### Q12. Frontend for Research Platforms

**Keep React + Recharts. Add Observable Plot for research visualizations. Do not touch Streamlit.**

The framework choice is not strategic. Streamlit is Python-only and would require a separate server -- net negative when you have a working React frontend. The real UX investments are the research-specific views, not the framework.

**Specifically:** Build in this order: (1) Game replay viewer -- step through round by round with reasoning traces side by side for both teams. This is the single highest-value UI feature. (2) Experiment comparison view -- two experiments side by side with overlaid learning curves and inline statistical results. (3) Evolutionary lineage tree via visx (`npm install @visx/visx`), which gives you D3-on-React for tree layouts Recharts cannot do. Add Observable Plot (`npm install @observablehq/plot`) for ad-hoc research viz: heatmaps, violin plots, small multiples.

**The contrarian view:** The research-vision review argues that the Observatory IS the product -- invest 40% of UI effort in inspection and comparison views. The tools review agrees but frames it as "the game replay viewer is the equivalent of a chess game replay."

---

### Q13. Cost Optimization

**Route by decision stakes, not semantic caching.**

Not all AI calls in a Decrypto game are equal. Clue generation is high-stakes. Guess parsing is low-stakes. Semantic caching for game-contextual prompts will have near-zero cache hit rate -- do not build it. Distillation is a Q3/Q4 project, not Q2.

**Specifically:** High-stakes (clue generation, interception reasoning): Claude Sonnet 4, GPT-4o, Gemini 2.5 Pro. Medium-stakes (reflection, scratch note update): Gemini 2.0 Flash, Haiku 4. Low-stakes (guess parsing): Haiku 4 or regex. Make the two-pass reasoning capture configurable -- skip it for evolution fitness evaluation to halve costs. Use OpenAI's Batch API for 50% cost reduction on non-time-sensitive calls (tournament rounds submitted as batches). Cost math: ~50 AI calls per 8-round game at Sonnet 4 pricing = ~$0.20/game. 100-game tournament = $20. 500-game evolution generation = $100.

**The contrarian view:** None across reviews. All agree semantic caching is a dead end for this workload.

---

### Q14. Reproducibility

**Accept non-determinism as a feature. Build infrastructure for statistical reproducibility, not exact replay.**

LLM APIs are non-deterministic even at temperature 0. This is not fixable. Model IDs change, weights are updated silently.

**Specifically:** (1) Experiment manifests: every experiment produces a JSON manifest with all model IDs (exact, with version suffixes), all prompt templates (SHA-256 content-hashed), all config parameters, all random seeds, pg-boss job ID, timestamps, and git commit hash. (2) Always use model snapshot IDs (`gpt-4o-2024-08-06`), never floating aliases. (3) Statistical reproducibility via replication: run each condition N times, report distributions. If mean and CI are stable across replications, the finding is reproducible. (4) Seed everything you can (keywords, codes, team assignment, player ordering, matchup order). The only non-seeded element should be the LLM API response. (5) Archive raw data as Parquet for large datasets, CSV for small ones. `pip install pyarrow`.

**The contrarian view:** None across reviews.

---

## Research Vision

### The March 2026 Moment

Three corpus findings converge to define the current moment for Herpetarium:

**1. The Artificial Hivemind finding (arXiv:2510.22954).** Different foundation models produce strikingly similar outputs on open-ended queries. This predicts that cross-architecture Decrypto teams may NOT show the "natural encryption" advantage hypothesized in the brief. Either confirming or refuting this in a strategic game domain is publishable. Clean experimental design: H0 (mixed-model teams show no interception resistance advantage) vs. H1 (mixed-model teams are harder to intercept). Falsifying either direction is a contribution.

**2. The sycophancy-deception tradeoff.** RLHF-tuned models should be systematically worse at the deceptive component of Decrypto (misleading opponents) than at the cooperative component (helping teammates). Helpfulness training optimizes for clarity -- the opposite of strategic obfuscation. Safety training penalizes deceptive outputs even when deception is game-appropriate. The LLM Persuasion Benchmark (ingested 2026-03-30) adds a direct data point: GPT-5.4 is the strongest persuader, Claude Opus 4.6 is second. If persuasion correlates with game-playing deception, you have a prediction about which models should be better deceivers.

**3. Out-of-Context Reasoning (OOCR).** Models perform multi-hop reasoning without showing intermediate steps. A model that detects it is being evaluated might play differently. Your two-pass architecture is not just engineering -- it is a methodological necessity for capturing reasoning that would otherwise be invisible.

### Three Publication Angles

**Angle 1 (strongest): The Sycophancy-Deception Tradeoff.** "RLHF-trained models show a measurable deception deficit in competitive games, varying by model family and training approach." First empirical demonstration that safety training has a measurable cost in strategic competence. Connects to active debates about alignment tax. Venues: NeurIPS, ICML, AAAI (AI safety track), FAccT.

**Angle 2 (novel): Hivemind Effects Under Competitive Pressure.** "Inter-model homogeneity extends/does not extend to strategic game play." Either result is informative. Venue: ICLR, Nature Machine Intelligence.

**Angle 3 (unique): Emergent Strategy via Natural-Language Evolution.** "Evolutionary search over natural-language strategy genomes discovers strategies that no human designed, and these strategies transfer across model architectures." Nobody else is doing this. AlphaEvolve/AdaEvolve validate the approach but use code, not natural language. Venue: GECCO, EvoStar, or NeurIPS workshop.

### The Unique Gap

Nobody is studying how LLM game-playing strategies evolve over iterated play with persistent memory. Cicero plays one game. GTBench runs one-shot evaluations. ChatArena has no persistence. Melting Pot uses RL. The even more specific gap: nobody is measuring whether evolved strategies transfer across model architectures.

### Build the Analysis Layer First

Herpetarium has built a data generation machine. The March 2026 moment hands you three publishable research questions on a platter. But the analysis layer that turns game data into defended claims does not exist yet. The parallel to Signal Garden's own weakness is exact: "The system collects well and synthesizes poorly." Herpetarium's version: "Runs games well, analyzes poorly." Build the statistical framework first. Run the experiments second.

---

## Things You Didn't Ask About

### 1. The Prompt Strategy Propagation Bug Is a Data Integrity Crisis

Gap #1 in Section 3 is not a gap -- it is an emergency. The Zod validation schema for `headlessMatchConfigSchema` in `routes.ts` strips `aiConfig` and `promptStrategy`. Every headless match, tournament, and series in your database used default prompts. Every series that claims to test a strategy tested the default strategy. Every evolution generation evaluated genomes with default prompts. Fix this before doing anything else. Add the missing fields to the Zod schema in `routes.ts`, then flag all existing data as `pre-fix` to exclude from future analysis.

### 2. The Degenerate Headless Game Problem Is Worse Than Stated

Gap #9 notes 1-player-per-team games are trivial. The deeper problem: even 2-player-per-team same-model games exhibit degenerate cooperation. Two instances of the same model share the same associative space, giving them an unfair advantage. This is not "natural encryption" -- it is a measurement confound. Enforce minimum 2 players per team AND require mixed-model teams for any experiment claiming to measure strategy quality.

### 3. RLHF-Trained Helpfulness May Actively Suppress Strategic Deception

The sycophancy research (batch-0 harvest) documents how AI agreement reinforces biases. For Decrypto: when a model gives clues that are easy for teammates, is it being strategically cooperative or sycophantically compliant? When it fails to deceive opponents, is that strategic failure or trained-in aversion? Your ablation system already has the right tool: compare models with and without explicit deception encouragement. This is a publishable finding waiting to happen.

### 4. "Analyses Had Become Cheap but Accuracy Hadn't"

Rohit Krishnan's framing from Strange Loop Canon: someone has to monitor the drones. Your platform generates thousands of AI calls producing strategic reasoning. The reasoning is cheap. Knowing whether it is GOOD reasoning is expensive. Your LLM-as-judge pipeline is the accuracy layer. This framing should appear in your paper's introduction.

### 5. Cheap Proxy Objectives for Evolution

Your evolution engine's fitness function (win rate 0.4, Elo 0.3, interception rate 0.15, negative miscommunication 0.15) is expensive -- each evaluation requires playing multiple complete games. Design a cheap proxy: evaluate a genome by generating clues for 10 fixed keyword/code combinations, measuring (a) teammate decode probability via embedding similarity and (b) opponent interception probability via cross-keyword embedding confusion. If the proxy correlates with game outcomes (r > 0.7), use it for early-generation screening and reserve full game evaluation for late generations.

### 6. The MiroFish "God View" Pattern for Experiment Monitoring

The MiroFish "God View terminal" (x-reharvest-E, 13K+ GitHub stars) shows 56 agents observable simultaneously with individual memory and behavior parameters. Apply this to your experiment monitoring: a single screen showing all active matches in a tournament, with per-match real-time indicators (current round, phase, last clue, cost, errors). This is your SSE/WebSocket endpoint conceived as a spatial display rather than a log stream.

### 7. Collective Intelligence Failure Mode

The paper at arXiv:2603.12129 shows smarter, more diverse agents produce worse collective outcomes when resources are scarce. This is directly relevant to mixed-model team dynamics in Decrypto. More capable models on a team may not produce better team outcomes if their reasoning diversity creates coordination friction.

### 8. DynaTrust for Detecting Deceptive Agents

DynaTrust models agents as a dynamic trust graph. Relevant to detecting and measuring deceptive agents in tournaments -- agents that appear cooperative early and become deceptive later, or that deceive selectively based on opponent strength.

### 9. EmCoop's Process-Level Metrics

EmCoop (arXiv:2603.00349) provides process-level metrics diagnosing collaboration quality and failure modes. Its architectural separation of cognitive layer from interaction layer maps to Herpetarium's separation of strategy from game mechanics.

### 10. Your Scratch Notes Should Be Partially Shared Team Knowledge

The "AI as organization" lens: in a real team, players develop shared mental models. Your scratch notes are private per-agent state. XSkill (arXiv:2603.12056) formalizes the distinction between Experiences (individual) and Skills (shared). Each agent accumulates private Experiences; the team accumulates shared Skills (general strategic playbooks).

---

## The Boldest Suggestion

**Compile your evolution engine's discovered strategies into model-agnostic instructions, then use them as the eval rubric.**

The reasoning chain:

1. **Atlas compiled memory** shows strategic knowledge can be compiled into instruction-level sub-bullets that are model-agnostic. Claude's memory works for GPT. Cross-model transfer confirmed: Claude Sonnet 4.5 gains +2.31pp from GPT-4o-evolved prompts.

2. **AdaEvolve** shows evolutionary search with adaptive policies discovers strategies no human designed.

3. **Verification > Generation** (Math Inc.) shows the hard problem is verifying which strategies are genuinely sophisticated, not generating them.

4. **Generator-verifier separation** (DeepMind Aletheia) shows verification must be independent of generation.

The synthesis: Run your evolution engine. Extract the most successful evolved strategies. Compile them into model-agnostic instruction sets using Atlas-style memory promotion. Then use those compiled strategies as the rubric for your LLM-as-judge evaluation pipeline.

This closes the loop the brief leaves open: the brief proposes an evolution engine to discover strategies AND a separate LLM-as-judge to evaluate strategic reasoning, but treats them as independent systems. They should be one system. The evolution engine discovers what good strategy looks like. The compiled output of evolution becomes the definition of strategic depth that the judge evaluates against.

Concretely: if your evolution engine discovers that the best Decrypto strategies involve "establishing a misleading pattern in rounds 1-3, then exploiting the opponent's false model in rounds 4-5," that discovery becomes an instruction-level rubric bullet. The LLM judge evaluates all reasoning traces against that rubric. You measure strategic depth against evolution-discovered criteria, not human-designed ones.

This transforms Herpetarium from a platform that **measures** AI strategic reasoning to a platform that **defines** what strategic reasoning means, empirically, through evolutionary discovery. That is a publishable contribution.

---

## What To Build This Week

### 1. Fix the Prompt Strategy Propagation Bug (2 hours, impact: critical)

Add `aiConfig` and `promptStrategy` to the `headlessMatchConfigSchema` Zod validation in `routes.ts`. Flag all existing experiment data with a `pre-fix` marker. Without this, every experiment you run is silently using default prompts regardless of configuration.

### 2. Experiment Isolation + Statistical Framework (1 day, impact: everything depends on this)

Tag every match with an `experimentId`. Add experiment-scoped filtering to the metrics engine. Implement bootstrap CIs (10,000 resamples) on win rate, interception rate, and miscommunication rate. Add Cohen's d for all pairwise comparisons. Add a minimum sample size calculator based on observed variance. This is ~100 lines of statistics code plus a schema change. Without it, no finding from this platform is defensible.

### 3. Install pg-boss and Wire Up Tournament Runner (half day, impact: high)

`npm install pg-boss`. Convert the tournament runner from an in-process Promise chain to a pg-boss job producer/consumer. This gives you server-restart survival, pause/resume, and budget enforcement as a pre-flight check. The series runner and evolution engine can follow the same pattern later.

### 4. Run the Hivemind Experiment (2-3 hours of setup, then let it run)

Design the simplest possible test of the Hivemind hypothesis: same-model teams vs. mixed-model teams, 64 games per condition (the minimum for a medium effect), measuring interception resistance. This is your first statistically powered experiment and potentially your first publishable finding.

### 5. Run `npm audit` and Pin Dependencies (30 minutes, impact: security)

Cross-reference your LLM-adjacent dependencies (OpenAI, Anthropic, Google SDKs and their transitive deps) against known compromised packages. Pin all dependencies with integrity hashes in `package-lock.json`.

---

## Tool Summary

| Need | Pick | Install | Why |
|---|---|---|---|
| Job queue | pg-boss | `npm install pg-boss` | Zero new infra, Postgres-native |
| Tracing | LangFuse | `npm install langfuse` | Open-source, self-hostable |
| Infra observability | OpenTelemetry | `npm install @opentelemetry/sdk-node` | Standard, non-proprietary |
| Embeddings | OpenAI text-embedding-3-small | Already installed | $0.02/1M tokens |
| Ranking | TrueSkill 2 | `pip install trueskill` | Handles teams + uncertainty |
| Statistics | scipy + statsmodels | `pip install scipy statsmodels` | Bootstrap CIs, mixed-effects |
| Visualization (research) | Observable Plot | `npm install @observablehq/plot` | Grammar-of-graphics |
| Visualization (custom) | visx | `npm install @visx/visx` | D3-on-React for lineage trees |
| Analytics engine | DuckDB | `npm install duckdb` / `pip install duckdb` | Analytical SQL over Parquet |
| Data export | Parquet | `pip install pyarrow` | Research-standard columnar |
| Judge prototyping | PromptFoo | `npm install promptfoo` | LLM-as-judge with rubrics |
| Evolution patterns | AdaEvolve | Study, not install | Adaptive search policy |
| Agent memory | Atlas pattern | Study, not install | Compiled instruction memory |
| Literature access | alphaXiv MCP | Search for "alphaXiv MCP" | MCP-protocol arXiv access |

---

*Produced by Signal Garden's 3-agent review pipeline on 2026-03-30. Corpus: 376 curated signals, 432 harvest cards, 2,166-node knowledge graph. Three-model eval reconciliation (GPT-5.4, Gemini 3.1 Pro, Claude Opus 4.6). Review agents: Tools & Architecture, Research Vision, Reality Check.*
