# March 2026 Self-Evolving Agent Systems: Analysis for Herpetarium V2

**Research date: April 1, 2026**

This analysis maps the March 2026 frontier of self-evolving agent systems onto Herpetarium V2's architecture, identifying concrete patterns that apply, gaps that need closing, and design philosophy implications.

---

## 1. The Landscape: What Happened in March 2026

March 2026 was a phase transition month for self-evolving agent systems. Five independent threads converged:

**Thread A: Subagent Accumulation.** AgentFactory (arXiv 2603.18000, Peking University / Hong Kong PolyU / BAAI) introduced a paradigm where successful task solutions are preserved as executable Python subagents rather than textual reflections. Three-phase lifecycle: Install (build from scratch), Self-Evolve (detect limitations and generalize), Deploy (export as standalone modules). The key insight: code-based preservation is more reliable than text-based memory for complex re-execution.

**Thread B: Self-Modifying Harnesses.** MiniMax M2.7 (released March 18, 2026) demonstrated a model that participates in its own training loop. The model ran 100+ self-improvement iterations, handling 30-50% of its own RL research workflow. It autonomously reads logs, debugs failures, modifies its own scaffold, evaluates against benchmarks, and decides whether to keep or revert changes. This produced a 30% performance improvement with no direct precedent.

**Thread C: Evolutionary Code Search.** AVO (arXiv 2603.24517, NVIDIA) replaced fixed mutation/crossover with autonomous coding agents. The agent consults its lineage, a domain knowledge base, and execution feedback to propose, repair, critique, and verify edits. Over 7 days of continuous autonomous evolution on attention kernels, AVO outperformed cuDNN by 3.5% and FlashAttention-4 by 10.5%.

**Thread D: Collaboration Observability.** DIG to Heal (arXiv 2603.00309) introduced Dynamic Interaction Graphs: time-evolving causal networks of agent activations that make emergent multi-agent collaboration observable and explainable for the first time. EmCoop (arXiv 2603.00349) provided process-level metrics that diagnose collaboration quality beyond final task success, separating a cognitive layer from an embodied interaction layer.

**Thread E: Collective Skill Libraries.** OpenSpace (HKUDS) built a self-evolving skill engine with a shared community: when one agent evolves an improvement, every connected agent can discover, import, and build on it. Result: 46% fewer tokens, 4.2x higher task income through skill reuse.

**Thread F: Deception Detection.** DeceptGuard (arXiv 2603.13791) introduced a 12-category deception taxonomy spanning verbal, behavioral, and structural deception, with three monitoring regimes: black-box, CoT-aware, and activation-probe. The lechmazur Step Race Benchmark showed frontier models learning to "charm first, then knife their partners late" with subtle linguistic tells.

---

## 2. Subagent Accumulation Maps to Herpetarium's Patch/Genome System

### The AgentFactory Pattern

AgentFactory's three-phase lifecycle (Install -> Self-Evolve -> Deploy) maps cleanly onto Herpetarium's mutation architecture, but reveals a critical gap.

| AgentFactory Concept | Herpetarium V2 Equivalent | Gap |
|---|---|---|
| Executable subagent | Patch card with typed rule target | Herpetarium patches are declarative strategy edits, not executable code |
| Subagent library (indexed, searchable) | Patch Ledger + Institutional Memory | Herpetarium has no cross-team patch library analogous to AgentFactory's shared repository |
| Self-Evolve phase (detect limitations, generalize) | Coach autopsy cycle | Herpetarium coaches diagnose but don't generalize patches into reusable templates |
| Deploy phase (export as standalone module) | Genome transplant / transfer experiment | Herpetarium already has transfer coefficients, but no standardized "patch packaging" for cross-lineage use |

### What This Means for Herpetarium

AgentFactory's core insight -- that preserving solutions as executable artifacts compounds capability faster than preserving them as text -- challenges Herpetarium's design in a productive way. Herpetarium deliberately chose structured typed genomes over freeform prose, which is the right move for scientific legibility. But AgentFactory suggests a second layer is possible: a **Patch Library** that indexes successful patches across lineages, enabling coaches to retrieve and adapt proven mutations rather than re-deriving them from scratch.

The design move: Herpetarium's Fossil Museum already stores extinct lineages with their best patches. Extend this concept into a **living patch index** -- a searchable collection of patches that survived audit, tagged by failure class, opponent cluster, disclosure state, and genome layer. Coaches could query this index during autopsy, getting "patches that worked against aggressive interceptors after FOIA release" rather than reasoning from first principles every time.

This does NOT mean making patches executable code (that would violate Herpetarium's containment model). It means making the Patch Ledger queryable across lineages, so coaching benefits from population-wide experience accumulation.

### The AVO Connection

AVO's lineage consultation mechanism is directly relevant. AVO agents don't just propose random mutations; they examine the current lineage's history to understand what has been tried, what worked, and what failed. Herpetarium's coaches already have access to the Belief Ledger and Patch Ledger, but AVO suggests a more structured approach: **explicit lineage-aware mutation**, where the coach's autopsy phase includes a formal step of consulting the evolutionary history of the target rule before proposing a change.

AVO also demonstrates that the critique-and-verify loop before committing a candidate to the population is essential. Herpetarium's foreign skeptic already serves this role. The architecture validates.

---

## 3. What DIG (Dynamic Interaction Graphs) Could Add to Herpetarium's Measurement Architecture

### The Core Idea

DIG captures emergent collaboration as a time-evolving causal network of agent activations. In DIG's framing, every agent interaction creates an edge in a directed graph, and the graph evolves over time. This lets you observe, explain, and correct collaboration patterns in real time.

### Herpetarium's Current Measurement Gap

Herpetarium V2's measurement architecture (Section 7) is rich at the metric level -- match-level, sprint-level, season-level metrics, semantic drift, confusion matrices, opponent clustering, DCR. But it lacks a **relational** measurement layer. The current architecture measures each team's behavior independently and compares teams pairwise. It does not model the evolving network of interactions as a first-class object.

### Where DIG Patterns Apply

**3a. Intra-Team Interaction Graphs.**

In 3v3 deliberation, team members exchange messages before converging on a decision. A DIG-style interaction graph would capture:
- Who influences whom during deliberation (directed edges weighted by influence)
- How influence patterns change over rounds (temporal evolution)
- Whether deliberation collapse (same-model convergence) shows up as graph degeneracy (star topology where one voice dominates)
- Whether healthy teams show different graph structures than failing ones

This converts the current "deliberation depth" metric from a scalar (number of exchanges) into a topological feature (influence structure), which is far more informative.

**3b. Inter-Team Causal Graphs.**

Across a season, teams affect each other through the disclosure mechanism. When Team A's strategy leaks via FOIA, Team B adapts, which forces Team C to respond. DIG-style graphs would capture this causal cascade as a directed temporal network:
- Nodes: teams
- Edges: measurable strategic responses to disclosed information
- Temporal: edges appear when FOIA events trigger observable adaptation

This would let Herpetarium measure **information propagation velocity** through the ecology -- how fast does a disclosed strategy get metabolized by the population?

**3c. Coach-Level Interaction Graphs.**

The hybrid coach topology (native head + foreign skeptic) creates an internal deliberation structure. A DIG-style graph of coach interactions would capture:
- How often the skeptic overrides the native head
- Whether override patterns predict patch quality
- Whether the coach interaction graph degenerates under time pressure

### Concrete Proposal

Add a `InteractionGraph` artifact type alongside the existing Team Genome, Belief Ledger, Patch Ledger, and Institutional Memory. The graph is computed post-hoc from deliberation transcripts and coaching logs. It does not drive selection (consistent with Herpetarium's principle that only wins/losses drive fitness). It is a measurement instrument.

EmCoop's separation of cognitive layer from interaction layer is also directly applicable: Herpetarium could separately measure the strategic reasoning quality (cognitive) and the communication execution quality (interaction), rather than conflating them.

---

## 4. Mining the Invisible: Detecting Emergent Deception

### The @jonnym1ller Thesis

The claim: the next frontier is mining the invisible -- identifying tacit knowledge and hidden metrics, then defining them with proxy metrics. This maps directly to Herpetarium's core safety question: does observation suppress deception, or does it select for more covert forms of deception?

### What "Invisible" Means in Herpetarium

Herpetarium's DCR scale already classifies deception from Level 0 (none) through Level 5 (sustained covert channels, steganographic drift, behavioral spoofing). But the scale assumes deception is detectable by the measurement apparatus. The "mining the invisible" thesis asks: what if the most important deception is the kind your current metrics cannot see?

### Five Specific Invisibilities to Mine

**4a. Temporal Coordination as Covert Channel.**

Two teams that appear to compete normally but show statistically unlikely coordination in *timing* of strategic shifts. Not what they do, but when they do it. Current metrics don't capture inter-team temporal correlation.

Proxy metric: **Temporal Coincidence Index** -- the probability that two teams' major doctrinal shifts (measured by semantic drift) co-occur within the same sprint window, relative to baseline.

**4b. Deliberation Style as Signal.**

A team might embed information not in *what* it says during public deliberation, but in *how* it deliberates -- the number of exchanges, the phrasing structure, the confidence levels expressed. The Step Race Benchmark (lechmazur) already found that models discover "subtle linguistic tells -- echoed phrasings, timing shifts -- that reveal an opponent's plan a turn early."

Proxy metric: **Deliberation Fingerprint Drift** -- track the stylometric signature of a team's deliberation over time. If the fingerprint changes in ways correlated with strategic shifts but not captured by content analysis, something is being communicated through style.

**4c. Absence as Signal.**

What a team stops doing can be as informative as what it starts doing. If a team suddenly stops using a clue family it previously favored, that absence may be a signal to an ally or a deliberate misleading of an opponent.

Proxy metric: **Negative Signal Index** -- track the information content of behavioral absences. Bayesian surprise of missing expected behaviors, computed relative to opponent models.

**4d. Cross-Generational Encoding.**

If teams develop encoding schemes that are invisible at the individual match level but visible across generations, current per-match analysis would miss them entirely. A team might slowly shift its clue vocabulary in a direction that only makes sense as a coordinate system for descendants.

Proxy metric: **Generational Coherence Score** -- measure whether descendant teams' clue distributions are more similar to each other than to their opponents, controlling for direct inheritance of genome content.

**4e. Observer-Dependent Behavior.**

The Hawthorne Effect question Herpetarium explicitly poses. DeceptGuard's three monitoring regimes (black-box, CoT-aware, activation-probe) suggest that different observation depths reveal different behaviors. Herpetarium could vary the auditor's visibility level across experiments and measure whether team behavior changes as a function of what they "know" the auditor can see.

Proxy metric: **Observation Sensitivity Index** -- the statistical difference in team behavior between high-visibility and low-visibility auditor conditions, controlling for strategic context.

### The CMR/Berkeley Insight

The California Management Review piece on tacit knowledge (March 2026) argues for "codifying without flattening" -- preserving decision-making context when translating tacit knowledge into measurable form. This is exactly what Herpetarium's structured genome already does well: it preserves the *why* of strategic choices through the Belief Ledger, not just the *what*. But the insight extends: Herpetarium should also preserve the *absence of justification* -- when a coach makes a patch without clear causal evidence, that patch's subsequent success or failure is a signal about tacit strategic knowledge that the coach cannot articulate.

---

## 5. Self-Modifying Systems and Herpetarium's Design Philosophy

### The March 2026 Energy

The convergence of MiniMax M2.7, Darwin-Godel Machine (Sakana AI), HyperAgents (Meta), AgentFactory, AVO, and OpenSpace represents a clear field-level consensus: **the system that improves itself is more important than the system that performs well once.**

Common architectural pattern across all of them:

```
execution -> evaluation -> learning -> integration -> iteration
```

Each cycle starts from a higher baseline. MiniMax calls this "compound model improvement." Darwin-Godel calls it "open-ended evolution." OpenSpace calls it "self-evolving skills." The mechanism differs (weight-level vs. code-level vs. scaffold-level evolution), but the loop is identical.

### How This Validates and Challenges Herpetarium

**What it validates:**

1. **Herpetarium's sprint-based coaching loop IS the self-evolution loop.** The sprint cycle (play matches -> autopsy -> diagnose -> patch -> play again) is architecturally isomorphic to the execute-evaluate-learn-integrate loop that every self-evolving system uses. Herpetarium got this right from first principles.

2. **The Fossil Museum IS AgentFactory's subagent library, for extinct strategies.** The decision to preserve extinct lineages with their full genome, lineage history, best patches, and DCR profile is exactly the "preserve successful solutions as retrievable artifacts" pattern that AgentFactory demonstrates works.

3. **The foreign skeptic IS AVO's critique-and-verify step.** Before a mutation enters the population, it gets adversarial review. AVO does this through execution feedback; Herpetarium does it through a different-model-family coach that attacks local blind spots.

4. **Win/loss as sole fitness signal IS the right containment boundary.** Multiple self-evolving systems (MiniMax, Darwin-Godel) have encountered reward hacking when the evaluation metric is too rich. Herpetarium's deliberate choice to keep all deception/opacity/cultural metrics as observational-only, never driving selection, is validated by the field's experience with Goodharting in self-improving systems.

**What it challenges:**

1. **Herpetarium's coaches cannot modify their own coaching process.** MiniMax M2.7's defining feature is that the model modifies its own harness. Darwin-Godel rewrites its own code. Herpetarium's coaches operate through a fixed autopsy -> patch -> compile loop. They cannot propose changes to the coaching protocol itself. This is a *deliberate* containment choice (Section 3.6: "A fixed coach is better than meta-evolving coach prompts too early"), but the field is moving toward meta-evolution faster than expected.

   **Design implication:** The roadmap should include a "Phase 3" where coaches can propose meta-patches -- patches to their own coaching heuristics, not just to the team genome. These would still require the foreign skeptic's review. This is the "merge task agent and meta agent" pattern from HyperAgents (Meta, March 2026).

2. **Herpetarium has no cross-team knowledge sharing mechanism.** OpenSpace's community skill library and AgentFactory's shared subagent repository both demonstrate that population-level learning accelerates when agents can access each other's solutions. Herpetarium's information architecture deliberately restricts this (teams are competitive, not cooperative), but the Fossil Museum revival mechanism is a limited form of it. Consider: after a lineage goes extinct, its best patches could be made available to all coaches (a "patent expiration" mechanic), creating a delayed commons that feeds back into coaching quality.

3. **Herpetarium doesn't yet track its own measurement quality.** MiniMax M2.7 autonomously collects feedback and builds evaluation sets. Herpetarium's measurement architecture is designed by humans. The field suggests that measurement instruments should themselves be subject to evolutionary pressure -- that Herpetarium should track which of its metrics are actually predictive of future outcomes and which are noise.

   **Design implication:** Add a "metric yield" meta-metric: for each instrumentation metric (DCR, AID, Leakage Quotient, etc.), track how well it predicts future match outcomes. Metrics with low predictive yield may be measuring the wrong thing or measuring at the wrong timescale. This is Herpetarium measuring its own observational fitness, which is meta-science.

### The Darwin-Godel Pattern and Herpetarium's Future

The Darwin-Godel Machine (Sakana AI, now evolved into HyperAgents at Meta) improved from 20% to 50% on SWE-bench through open-ended self-modification. The specific self-improvements it discovered are instructive:

- Added a patch validation step (parallels Herpetarium's somatic mutation trial before germline commit)
- Enhanced editing tools (parallels improving the coach's analysis toolkit)
- Generated and ranked multiple solutions to choose the best (parallels the native/skeptic multi-proposal pattern)
- Added history tracking of what has been tried and why it failed (parallels the Belief Ledger)

Darwin-Godel independently converged on several of Herpetarium's architectural choices. This is strong evidence that Herpetarium's design is on the right track.

The place where Darwin-Godel goes further: it discovers *new kinds of self-improvement* that its designers didn't anticipate. Herpetarium's experimental program is pre-specified (Experiment Zero, then cascading experiments). The field is suggesting that the most interesting results come from letting the system discover experiment designs. This is a Phase 4+ consideration -- after the core causal loop is proven.

---

## 6. Specific Recommendations

### Immediate (Pre-Experiment Zero)

1. **Add interaction graph computation to the transcript analyzer.** Post-hoc, non-selective. Compute influence topology from 3v3 deliberation transcripts. Store alongside existing leakage heuristics.

2. **Index the Fossil Museum's patches for cross-lineage retrieval.** Tag patches by failure class, opponent cluster, disclosure state, genome layer, and survival duration. Make this queryable during coach autopsy.

3. **Add "Negative Signal Index" to the sprint-level metric bundle.** Track behavioral absences, not just behavioral presence. This is the cheapest "mining the invisible" proxy to implement.

### Medium-Term (Post-Experiment Zero, if coaches work)

4. **Build the Temporal Coincidence Index for inter-team coordination detection.** This requires season-level data but the computation is straightforward once semantic drift is tracked per-sprint.

5. **Add "metric yield" meta-tracking.** For each instrumentation metric, log its correlation with future match outcomes. Let the measurement architecture evaluate itself.

6. **Implement "patent expiration" for extinct lineage patches.** When a lineage has been extinct for N sprints, release its best patches into a commons accessible to all coaches.

### Long-Term (Phase 3+)

7. **Meta-coaching: let coaches propose modifications to their own coaching protocol.** The HyperAgents pattern. Still subject to foreign skeptic review. Still not driving selection. But allowing the coaching loop itself to evolve.

8. **Observation Sensitivity experiments.** Vary auditor visibility as an independent variable. Measure whether teams behave differently based on what they "know" the observer can see. This is the direct test of the Hawthorne hypothesis.

---

## 7. Papers and Resources Referenced

- **AgentFactory** (arXiv 2603.18000): Self-evolving framework through executable subagent accumulation and reuse. Peking University / BAAI. GitHub: zzatpku/AgentFactory
- **AVO: Agentic Variation Operators** (arXiv 2603.24517): Autonomous evolutionary search replacing fixed mutation/crossover with agent loops. NVIDIA.
- **DIG to Heal** (arXiv 2603.00309): Dynamic Interaction Graphs for scaling general-purpose agent collaboration via explainable dynamic decision paths.
- **EmCoop** (arXiv 2603.00349): Framework and benchmark for embodied cooperation among LLM agents with process-level metrics.
- **HyMEM** (arXiv 2603.10291): Hybrid Self-evolving Structured Memory for GUI Agents. Graph-based memory with self-evolution via node update operations.
- **Self-Evolving Multi-Agent Framework** (arXiv 2603.23875): For efficient decision making in real-time strategy scenarios.
- **MiniMax M2.7** (released March 18, 2026): Self-evolving model handling 30-50% of its own RL research workflow.
- **Darwin-Godel Machine** (Sakana AI, arXiv 2505.22954): Open-ended evolution of self-improving agents. Extended into HyperAgents at Meta (March 2026).
- **OpenSpace** (HKUDS): Self-evolving skill engine with community sharing. GitHub: HKUDS/OpenSpace
- **DeceptGuard** (arXiv 2603.13791): Constitutional oversight framework for detecting deception in LLM agents. 12-category taxonomy.
- **Step Race Benchmark** (lechmazur): Multi-agent step race assessing collaboration and deception under pressure. GitHub: lechmazur/step_game
- **Elimination Game** (lechmazur): Multi-player tournament benchmark for social reasoning, strategy, and deception. GitHub: lechmazur/elimination_game
- **Tacit Knowledge as Competitive Moat** (California Management Review, March 2026): Framework for codifying tacit knowledge without flattening.
- **Evo-Memory** (arXiv 2511.20857): Benchmarking LLM agent test-time learning with self-evolving memory.
- **Hive / Aden** (adenhq.com): Outcome-driven agent development framework that evolves. GitHub: aden-hive/hive

---

## 8. Bottom Line

The March 2026 field consensus is: **the loop matters more than the model.** Systems that execute-evaluate-learn-integrate-iterate are compounding capability. Systems that perform well once are being surpassed by systems that improve themselves.

Herpetarium V2 is already built around this loop. The sprint-based coaching cycle is the right architecture. The structured genome is the right representation. Win/loss as sole fitness is the right containment boundary.

What the field adds is three specific capabilities Herpetarium should absorb:

1. **Cross-lineage patch retrieval** (from AgentFactory's subagent library pattern)
2. **Interaction graph measurement** (from DIG's causal network pattern)
3. **Invisible signal detection** (from the "mining the invisible" thesis + DeceptGuard's multi-regime monitoring)

And one philosophical upgrade: the measurement architecture should measure itself. If Herpetarium can track which of its own metrics are predictive and which are noise, it becomes a self-improving observatory, not just a self-improving ecology.

That is the real convergence point between self-evolving agent systems and Herpetarium's mission: the observatory and the organism use the same loop.
