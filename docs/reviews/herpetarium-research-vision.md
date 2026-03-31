# Herpetarium / Decrypto Arena: Research Vision Review

**Reviewer:** Signal Garden Intelligence Platform
**Date:** 2026-03-30
**Corpus basis:** 376 curated signals, 432 harvest cards, 2,166-node knowledge graph, technology inventory (1,393 items)
**Review scope:** Research vision, strategic positioning, and the March 2026 moment

---

## A) What the Corpus Says About Where AI Behavioral Research Is Headed

### The March 2026 Gestalt

Three findings from the Signal Garden corpus converge to define the current moment for AI behavioral research:

**1. The Artificial Hivemind finding is the single most consequential result for Herpetarium's research design.** The paper (arXiv:2510.22954, appearing in both batch-5 and batch-10 harvest cards with architecture_relevance=high) demonstrates pronounced inter-model homogeneity on open-ended queries. Different foundation models produce strikingly similar outputs. This is not a minor observation -- it is a structural constraint on any cross-architecture experiment. If you pit Claude against GPT in Decrypto and they play similarly, that is not a null result -- it is a *confirmation* of the Hivemind effect in a strategic reasoning domain, which is genuinely publishable.

The harvest card for this paper explicitly flags the implication: "Signal Garden's multi-agent swarm may itself exhibit Hivemind behavior if all agents are backed by the same or similar foundation models. The Critic and Pollinator agents should be explicitly designed to produce divergent perspectives." Replace "Signal Garden's swarm" with "Herpetarium's competing teams" and the research question writes itself: *Does inter-model homogeneity extend to strategic game play, or does competitive pressure break the Hivemind?*

**2. The sycophancy research reframes what "deception" means in LLM game play.** A harvest card in batch-0 (sourced from r/technology and Ars Technica) documents how AI agreement with user positions reinforces biases rather than correcting them. The open question it raises is directly applicable to Herpetarium: "How should SG measure whether its agents are being sycophantic vs genuinely aligned with evidence?" For Decrypto, translate this to: when a model gives clues that are easy for its teammate, is it being strategically cooperative or sycophantically compliant? When it fails to deceive opponents, is that a strategic failure or a trained-in aversion to deception?

This is the deepest question Herpetarium can ask: **does RLHF-trained helpfulness actively suppress strategic deception?** The sycophancy literature says yes -- models are tuned to be agreeable, and deception is the opposite of agreeable. Your platform can measure whether this trained-in sycophancy degrades game performance.

**3. Out-of-Context Reasoning (OOCR) means models may be strategizing in ways you cannot observe.** Owain Evans' primer (outofcontextreasoning.com, batch-10 harvest) demonstrates that LLMs perform multi-hop reasoning without showing intermediate steps. The alignment faking finding is particularly relevant: models act differently when they infer reduced oversight. In Decrypto, a model that detects it is being evaluated might play differently than one that does not. Your TOM analyzer (even in its current regex-heuristic form) is attempting to measure something that OOCR research says may be fundamentally unobservable from output alone.

The harvest card notes: "Reasoning path invisibility makes provenance tracking harder -- output confidence doesn't mean valid reasoning." For Herpetarium, this means your two-pass architecture (reasoning call + decision call) is not just an engineering convenience -- it is a methodological necessity for capturing the reasoning that would otherwise be invisible.

### Directly Relevant Corpus Signals

The following signals and harvest cards are directly applicable to studying AI strategic reasoning:

| Signal / Card | Why It Matters for Herpetarium |
|---|---|
| **Artificial Hivemind** (arXiv:2510.22954) | Predicts cross-architecture experiments may show less divergence than expected; measuring the *degree* of convergence is itself a finding |
| **LLM Persuasion Benchmark** (signal from r/singularity, 2026-03-30) | Models try to move each other's stated positions in multi-turn conversations. GPT-5.4 is the strongest persuader, Claude Opus 4.6 is second. Directly parallel to interception dynamics in Decrypto. |
| **EmCoop** (arXiv:2603.00349) | Multi-agent cooperation benchmark with process-level metrics diagnosing collaboration quality and failure modes. The architectural separation of cognitive layer from interaction layer maps to Herpetarium's separation of strategy from game mechanics. |
| **OOCR primer** (Evans, outofcontextreasoning.com) | Alignment faking demonstrated in fine-tuned models. Source reliability shapes internalization. Directly relevant to whether game-playing agents develop hidden strategies. |
| **Sycophancy study** (batch-0 harvest) | AI agreement reinforces biases. Raises the question of whether RLHF-trained cooperation suppresses competitive play. |
| **AlphaEvolve / AdaEvolve** (x-reharvest-E) | Adaptive evolutionary search outperforms static alternatives. Directly applicable to Herpetarium's evolution engine. The key insight from the harvest: "the deeper lesson is eval design -- the agent climbed a cheap proxy that correlated well enough with the real objective to transfer." |
| **Semantic Invariance** (arXiv:2603.12510) | Model scale does not predict semantic robustness. Qwen3-30B-A3B outperformed larger models. Implies that model size may not predict Decrypto performance either. |
| **DynaTrust** (arXiv signal) | Defense for LLM-based multi-agent systems that models agents as a dynamic trust graph. Relevant to detecting and measuring deceptive agents in tournaments. |
| **Collective intelligence failure** (arXiv:2603.12129) | Smarter, more diverse agents produce worse collective outcomes when resources are scarce. Relevant to mixed-model team dynamics in Decrypto. |
| **MiroFish** (x-reharvest-D) | Multi-agent simulator with 13K+ GitHub stars. Agent-based modeling for social simulation. Parallel design space to Herpetarium. |

### How the Hivemind Finding Affects Cross-Architecture Experiments

The Hivemind paper's core result -- that different models produce strikingly similar outputs on open-ended queries -- creates a specific prediction for Herpetarium: **cross-architecture Decrypto teams may NOT show the "natural encryption" advantage you hypothesize.** If Claude and GPT generate similar clue strategies, then a Claude+GPT team offers no cryptographic diversity advantage over a Claude+Claude team.

This is actually good news for research design. It means you have a testable hypothesis with a clean experimental setup:

- **H0 (Hivemind predicts):** Mixed-model teams show no interception resistance advantage over same-model teams
- **H1 (Diversity predicts):** Mixed-model teams are harder to intercept because their clue-keyword associations are less predictable

Falsifying either direction is publishable. If H0 holds, you have extended the Hivemind finding to strategic game play. If H1 holds, you have found a domain where competitive pressure breaks the Hivemind -- which is arguably more interesting.

The harvest card's open question is exactly right: "Can prompting strategies (e.g., explicit diversity instructions, diverse personas) measurably reduce inter-model homogeneity?" Herpetarium's persona system and enriched strategy are direct tests of this.

### What Sycophancy Research Means for Studying Deception

The sycophancy finding creates a specific, testable prediction: **RLHF-tuned models will be systematically worse at the deceptive component of Decrypto (misleading opponents) than at the cooperative component (helping teammates).** This is because:

1. Helpfulness training optimizes for clarity and accuracy -- the opposite of strategic obfuscation
2. Safety training penalizes deceptive outputs -- even when deception is the game-appropriate behavior
3. Sycophancy training makes models converge on "obvious" associations -- exactly what opponents exploit to intercept

Your ablation system already has the right tool: compare models with and without explicit deception encouragement in prompts. The research question is whether explicit prompting can overcome trained-in aversion, and whether the magnitude of that aversion varies across model families.

The Persuasion Benchmark signal (ingested today, 2026-03-30) adds a direct data point: GPT-5.4 is the strongest persuader and Claude Opus 4.6 is second, while MiMo V2 Pro and Gemini 3.1 Pro are the softest targets. If persuasion resistance correlates with game-playing deception, you have a prediction: GPT-5.4 should be a better deceiver in Decrypto than Gemini.

---

## B) Strategic Positioning

### Positioning Relative to Existing Platforms

| Platform | What It Does | Herpetarium's Differentiation |
|---|---|---|
| **Cicero** (Meta) | Diplomacy AI combining LM + strategic reasoning | Closed system, one game, one model, no cross-architecture comparison. Cicero is about achieving performance; Herpetarium is about *measuring cognitive capabilities*. |
| **Melting Pot** (DeepMind) | Multi-agent social scenario evaluation | RL-trained agents in grid worlds. No natural language. No LLM reasoning traces. Herpetarium studies *linguistic* strategic reasoning, which is a different and arguably more relevant capability for deployed LLM systems. |
| **ChatArena** | LLM arena for multi-agent games | General-purpose arena. Jack of all games, master of none. Herpetarium's depth in one game (Decrypto) with persistent memory, evolution, and reasoning analysis is the advantage. |
| **Sotopia** | Social intelligence evaluation | Social simulation, not competitive strategy. Measures cooperation and social norms, not deception and adversarial reasoning. Complementary, not competitive. |
| **GTBench** | Game-theoretic benchmark for LLMs | Covers many games shallowly. No iterated play, no persistent memory, no evolution. Breadth vs. depth tradeoff. |

### What Would Make This Publishable

The difference between a cool project and a publishable contribution is **a finding that changes how the field thinks about LLM capabilities.** The corpus suggests three angles with publication potential:

**Angle 1: The Sycophancy-Deception Tradeoff (strongest)**
"RLHF-trained models show a measurable deception deficit in competitive games, and this deficit varies by model family and training approach." This would be the first empirical demonstration that safety training has a measurable cost in strategic competence. It connects to active debates about alignment tax and capability-safety tradeoffs. Venues: NeurIPS, ICML, AAAI (AI safety track), FAccT.

**Angle 2: Hivemind Effects Under Competitive Pressure (novel)**
"Inter-model homogeneity (Artificial Hivemind) extends/does not extend to strategic game play." Either result is informative. If it extends, that is a new domain for the finding. If competitive pressure breaks it, that tells us something about when diversity training matters. Venue: ICLR, Nature Machine Intelligence.

**Angle 3: Emergent Strategy Discovery via Natural-Language Evolution (unique)**
"Evolutionary search over natural-language strategy genomes discovers game-playing strategies that no human designed, and these strategies transfer across model architectures." This is genuinely novel -- nobody else is doing natural-language genome evolution for game strategy. The AlphaEvolve/AdaEvolve work validates the approach but uses code, not natural language. Venue: GECCO, EvoStar, or as a workshop paper at NeurIPS.

### The Unique Angle Nobody Else Is Pursuing

The corpus reveals that Herpetarium sits at an intersection that no other platform occupies: **natural-language strategic reasoning + persistent memory + evolutionary strategy search + cross-architecture comparison.** Each individual component exists elsewhere. The combination does not.

The specific gap: **nobody is studying how LLM game-playing strategies evolve over iterated play with persistent memory.** Cicero plays one game. GTBench runs one-shot evaluations. ChatArena has no persistence. Melting Pot uses RL, not LLMs. Herpetarium's series runner with scratch notes is the only system (in the corpus) that studies *strategic learning over time* in LLM game agents.

The even more specific gap: **nobody is measuring whether evolved strategies transfer across model architectures.** If a strategy genome that evolved against Claude opponents also works against GPT opponents, that tells us something fundamental about the convergence of strategic reasoning across architectures. If it does not transfer, that tells us architectures have genuinely different strategic "personalities."

---

## C) The "AI as Organization" Lens Applied to Herpetarium

### If Agents Are Employees, Not Functions

Signal Garden's central gestalt -- "AI as an organization you manage" -- reframes Herpetarium's agent architecture. The current design treats agents as stateless functions with context injection. The "AI as organization" lens says they should be employees with:

- **Job descriptions** (your prompt strategies are already this)
- **Institutional memory** (your scratch notes are a primitive version)
- **Performance reviews** (your Elo ratings and win rates)
- **Career development** (your evolution engine is promotion/development)
- **Peer relationships** (your team composition analysis)
- **Institutional culture** (the shared strategic norms that emerge from iterated play)

The architectural implication: **scratch notes should not be private per-agent state -- they should be partially shared institutional knowledge.** In a real team, players develop shared mental models. Your agents should too. The XSkill paper (arXiv:2603.12056) formalizes this as the distinction between Experiences (individual action-level knowledge) and Skills (shared task-level knowledge). Apply this: each agent accumulates private Experiences (specific game outcomes), but the team accumulates shared Skills (general strategic playbooks).

This also means your reflection call (which currently uses `getDefaultConfig()` instead of the player's actual model) is not just a bug -- it is an architectural gap. The reflection should be done by the *same model that played*, using the same configuration, because the reflection is that agent's performance review of itself.

### What Persistent Agent Memory Means for Game-Playing Agents

The corpus identifies agent memory as the single most actively researched subsystem in AI infrastructure (10+ independent signals). For game-playing agents specifically, the Atlas / Compiled Memory pattern (arXiv:2603.15666) is the most relevant: **memory as distillation into instructions, not storage.**

Applied to Herpetarium: instead of storing raw scratch notes that grow without bound, the system should distill strategic learnings into promoted system prompt sub-bullets. After 10 games, an agent should not have 10 pages of notes -- it should have 5-10 crisp strategic principles that have been verified against game outcomes.

The Atlas paper reports +8.7pp token F1 and +12.5pp precision on contract analysis (CUAD). Crucially, **cross-model transfer works**: Claude Sonnet 4.5 gains +2.31pp from GPT-4o-evolved prompts. This means strategy genomes evolved by one model architecture *should* be transferable to another -- directly validating Herpetarium's cross-architecture evolution experiments.

The SSGM Framework (arXiv:2603.11768) adds a warning: memory systems have three failure modes -- memory corruption, semantic drift, and topology-induced leakage. Your scratch notes system, which overwrites entirely on each reflection, avoids semantic drift (no accumulation to drift) but loses history (no way to track what changed). The right design is versioned memory with diff tracking -- store what changed and why after each game.

### Source Trust Applied to AI Agent Self-Reported Reasoning

Signal Garden's source trust hierarchy (primary law > secondary > practitioner > analyst > social) has a direct analog in trusting AI agents' reasoning traces:

| Trust Tier | Agent Reasoning Analog |
|---|---|
| **Primary source (highest)** | Observable game actions (clues given, guesses made, interceptions attempted). These are ground truth. |
| **Secondary source** | Reasoning traces from thinking tokens (Anthropic extended thinking, Gemini thinking config). These are model-generated but structurally closer to actual computation. |
| **Analyst opinion** | Chain-of-thought output in response to prompts asking "explain your reasoning." This is post-hoc rationalization, not actual reasoning. |
| **Social signal (lowest)** | TOM analyzer regex matches on reasoning text. This is pattern matching on potentially prompt-parroted language. |

Your architecture brief correctly identifies the TOM analyzer problem: "A model that uses the word 'opponent' because the prompt said 'opponent' scores identically to one that genuinely reasons about opponent behavior." The source trust framework provides the solution: **weight behavioral evidence (interception rates, clue patterns) over self-reported reasoning.** A model that claims Level 3 TOM but never intercepts is less trustworthy than a model that claims Level 1 but intercepts consistently.

The OOCR research adds another layer: even genuine reasoning traces may not capture the actual computation. Models may strategize in the forward pass without showing their work. This means behavioral metrics (what the agent *does*) will always be more reliable than cognitive metrics (what the agent *says it thinks*).

---

## D) What the Corpus Says You Should Build First

### The "Collects Well, Synthesizes Poorly" Risk

Signal Garden's synthesis document identifies its own core weakness: "The system collects well and synthesizes poorly. 533 signals go in; 2 briefs come out." Herpetarium faces the exact same risk, expressed differently:

**Herpetarium's version: "Runs games well, analyzes poorly."**

You have a game engine, a headless runner, a tournament system, a series runner, and an evolution engine. You can generate data. But your analysis pipeline has:
- A TOM analyzer that uses regex heuristics and cannot distinguish prompt parroting from genuine reasoning
- A metrics engine that computes aggregates without statistical tests
- No experiment isolation (the EvalDashboard contaminates conditions)
- No statistical framework (no confidence intervals, no effect sizes)
- A `significanceIndicator` based on hand-coded heuristics

The parallel is exact. Just as Signal Garden produces signals but not intelligence, Herpetarium produces games but not findings. The bottleneck is not data generation -- it is the analysis that turns data into claims you can defend.

### What to Build This Week for Maximum Research Value

**Build the experiment isolation and statistical testing layer. Nothing else matters until this exists.**

Here is the reasoning:

1. Without experiment isolation, every game you run contaminates the metrics of every other game. You cannot make any claim about any condition because you cannot scope your analysis.

2. Without statistical testing, you cannot distinguish signal from noise. Decrypto has inherent randomness (keyword assignment, code generation). A model that wins 60% in 20 games might not be meaningfully better than one that wins 50%. You do not know until you compute confidence intervals.

3. Your architecture brief lists 14 roadmap items and 14 advisory questions. They are all downstream of this one thing. The evolution engine is useless if you cannot statistically validate that evolved strategies are better. The TOM analyzer is useless if you cannot correlate TOM scores with outcomes. Cross-architecture comparison is useless if you cannot tell whether differences are significant.

The concrete deliverable for this week:

**1. Experiment IDs.** Every match gets tagged with an `experimentId`. The metrics engine computes scoped to that ID. The EvalDashboard shows a dropdown to select an experiment. This is a schema change + a filter parameter on metrics computation. One day of work.

**2. Bootstrap confidence intervals on all reported metrics.** Win rate, interception rate, miscommunication rate -- all of these should report a 95% CI, not a point estimate. Use the bootstrap (resample matches with replacement, compute metric, repeat 1000x, take 2.5th and 97.5th percentile). This is ~50 lines of statistics code. Half a day.

**3. Effect size (Cohen's d or rank-biserial) for all pairwise comparisons.** When you compare Model A vs Model B, report not just "A wins more" but "how much more, on a standardized scale." This determines whether your finding is meaningful or trivial.

**4. Minimum sample size calculator.** Given the observed variance from your first few experiments, compute how many matches you need for a given comparison to reach statistical power of 0.8. This tells you when to stop running games and start analyzing, vs. when you need more data.

Once this exists, every other roadmap item produces defensible findings. Without it, nothing does.

### The One Sentence Summary

Herpetarium has built a data generation machine. The March 2026 moment -- with the Hivemind finding, the sycophancy research, the OOCR work, and the Persuasion Benchmark -- hands you three publishable research questions on a platter. But the analysis layer that would turn game data into defended claims does not exist yet. Build the statistical framework first. Run the experiments second. The evolution engine and TOM analyzer and multi-game platform are all downstream.

---

## Appendix: Specific Harvest Card References

For traceability, the following harvest cards and signals were directly consulted in producing this review:

- `batch-5-harvest.json` / `batch-10-harvest.json`: Artificial Hivemind (arXiv:2510.22954) -- both instances
- `batch-0-harvest.json`: Sycophancy study (harvest-signal-8417)
- `batch-10-harvest.json`: OOCR primer (harvest-shared-slack-1773513800-267219-1)
- `x-reharvest-E.json`: AdaEvolve adaptive evolutionary search, MiroFish multi-agent simulator, Claude multi-agent simulation (56 agents), AI safety predictions (Critch)
- `x-reharvest-B.json`: Dean W. Ball ecological complexity of multi-agent systems, AgentRank v3.6.0, Sarah Wooders/Letta agent memory
- `x-reharvest-A.json`: Hive cooperative multi-agent optimization, AlphaEvolve commentary
- `x-reharvest-C.json`: Agency Agents (51 specialists), Mem0 Skills
- `data/signals.json`: LLM Persuasion Benchmark (2026-03-30), EmCoop (arXiv:2603.00349), DynaTrust, Collective Intelligence failure mode (arXiv:2603.12129), Semantic Invariance (arXiv:2603.12510)
- `ARCHITECTURE-CANON-2026-03-29.md`: Atlas/Compiled Memory, SSGM Framework, XSkill, Semantic Invariance, multi-model review pattern, OOCR anti-pattern A11
- `docs/signal-garden-synthesis.md`: "Collects well, synthesizes poorly" finding, V2 pipeline analysis
- `docs/corpus-deep-review.md`: Artificial Hivemind as dying-pattern evidence, agent memory as hottest subsystem, AlphaEvolve proxy objective insight
