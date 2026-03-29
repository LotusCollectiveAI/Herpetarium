# Modes of Play & Future Roadmap

This document describes the planned capabilities for Decrypto Arena, organized from nearest-term to most ambitious. Each mode builds on the infrastructure and learnings of the previous ones.

---

## Current State

Today, the platform supports:

- **Human vs Human**: Traditional Decrypto gameplay via WebSocket-connected browser sessions.
- **Human + AI Teams**: Human players team up with AI agents (ChatGPT, Claude, Gemini) on mixed teams.
- **AI vs AI (Headless)**: Fully automated matches where AI agents from different providers play complete games without human involvement.
- **Tournaments**: Configurable multi-match tournaments with result tracking, round-by-round logging, and AI call analytics.
- **Multi-Model Support**: Three AI providers (OpenAI, Anthropic, Google) with multiple model variants, configurable temperature, timeout, and prompt strategies.

---

## Phase 1: Cross-Company Model Collaboration

**What:** Teams composed of AI agents from different providers working together — for example, Team ChatGPT+Claude vs. Team Gemini+Grok (with Grok and other providers added as the platform expands beyond the current three: OpenAI, Anthropic, Google).

**Why this is interesting:** Today's matches pit one provider's models against another's. But real-world AI deployment increasingly involves orchestrating multiple models. Cross-company teams test whether models from different training paradigms can develop shared understanding — can a Claude clue-giver communicate effectively with a GPT guesser? Do mixed teams outperform homogeneous ones?

**What we'll learn:**
- Whether cross-architecture communication produces better or worse coordination
- Which model pairings produce emergent synergies
- How provider-specific "personalities" in communication style affect team dynamics

**Implementation sketch:**
- Extend the existing `HeadlessMatchConfig` to allow mixed-provider teams
- No architectural changes to the game engine — the player config already supports per-player provider assignment
- Add analytics dashboards comparing mixed vs. homogeneous team performance

---

## Phase 2: Self-Play Teams

**What:** Models playing against themselves — Team Claude-A vs. Team Claude-B, where both teams use the same model and configuration.

**Why this is interesting:** Self-play eliminates the variable of model capability differences and isolates the question of strategy. When a model plays against itself, any asymmetry in outcomes comes from the randomness of keyword assignment and the emergence of different strategic paths from identical starting conditions.

**What we'll learn:**
- Whether models develop consistent "styles" or produce high variance in self-play
- How quickly games resolve when both sides have identical capabilities
- Whether self-play produces fundamentally different game dynamics than cross-model play

**Implementation sketch:**
- Configuration option to mirror team setups
- Statistical analysis tools to measure outcome variance in self-play vs. cross-play
- Visualizations comparing game length, interception rates, and token accumulation patterns

---

## Phase 3: Iterated Games with Persistent Scratch Notes

**What:** Repeated games where AI agents retain memory across matches through persistent scratch notes — structured working memory that carries forward between games.

**Why this is interesting:** This is where things get genuinely novel. Current matches are stateless — each game starts fresh, and agents have no memory of previous encounters. By introducing scratch notes, we allow agents to evolve a *meta* over time. The emergence of an organic, unplanned game meta entirely among AI agents is worthy of study.

**What we'll learn:**
- Whether agents develop recognizable strategic patterns over iterated play
- How quickly a meta stabilizes, and whether it cycles or converges
- Whether agents can learn opponent tendencies from scratch notes alone
- How the meta differs across model providers

**Key design decisions:**
- **What's in the scratch notes?** Structured observations: opponent tendencies, successful clue patterns, interception rates, strategic hypotheses.
- **Who writes them?** The agents themselves, after each game. They receive their game results and their existing notes, then produce updated notes.
- **What's the format?** Free-form text with a token budget. Agents decide what's worth remembering.
- **How long do they persist?** Configurable — across a series, a tournament, or indefinitely.

**Implementation sketch:**
- New `scratchNotes` field per agent per series
- Post-game "reflection" AI call where agents update their notes
- Notes passed as context in subsequent game prompts
- Analytics tracking note content evolution over time

---

## Phase 4: Self-Modifying Prompts

**What:** Agents watch replays of their own games and rewrite their own strategy prompts. The prompt that governs their gameplay behavior becomes a living document that the agent itself maintains.

**Why this is interesting:** This is the point where human involvement truly recedes. Today, humans write the prompts that govern AI behavior. In this mode, agents observe their own performance and decide how to improve. The humans design the initial prompt and the self-modification framework — but the actual strategy is the agent's own creation.

**What we'll learn:**
- Whether agents can meaningfully improve their own prompts
- What strategies agents discover that humans wouldn't think to try
- Whether self-modified prompts converge across different models or diverge
- How the modification rate affects performance (aggressive rewriting vs. conservative tuning)

**Key design decisions:**
- **What can agents modify?** Their strategic instructions — not their core identity or safety constraints. The system prompt has a fixed scaffold; the agent controls the strategy section.
- **When do they modify?** After each game, after each series, or at agent-chosen intervals.
- **How do we prevent degeneration?** Performance-gated modifications: changes that reduce win rate are rolled back. Agents can also maintain a "prompt history" to revert their own changes.

**Implementation sketch:**
- Separate "strategy prompt" section that agents can read and rewrite
- Post-game replay review call: agent receives full game transcript, current strategy, and performance stats
- Prompt versioning system tracking every modification
- A/B testing framework: new prompt vs. previous prompt in controlled matches

---

## Phase 5: Evolutionary Tournament Mode

**What:** Not just head-to-head competition, but a full evolutionary system where strategies are born, compete, reproduce, mutate, and die across generations. Natural selection applied to AI game strategies.

**Why this is interesting:** This is the ultimate expression of the abstraction ladder. Humans don't play the game, don't configure the AI, don't design the prompts, and don't even select the strategies. They design the evolutionary environment and press start. Everything that follows is emergent.

You are not pitting bot against bot. You are pitting Team ChatGPT — an autonomous, self-improving system in the Decrypto tournament — against the other teams. The unit of competition is not a single match; it is an entire evolutionary lineage.

**What we'll learn:**
- What strategies survive evolutionary pressure
- Whether different models converge on similar strategies or maintain distinct evolutionary paths
- How quickly evolution discovers effective strategies compared to human prompt engineering
- Whether cooperation or deception is more fit in the long run
- What the "optimal" Decrypto strategy looks like when discovered by evolution rather than designed by humans

**Key design decisions:**
- **What's the genome?** The strategy prompt, scratch notes template, and configuration parameters (temperature, etc.)
- **What's the fitness function?** Win rate across a generation's matches, weighted by opponent strength.
- **How does reproduction work?** Top-performing strategies are crossed (prompt sections combined) and mutated (random modifications).
- **What's the population size?** Configurable per provider — e.g., 20 GPT strategies, 20 Claude strategies, 20 Gemini strategies competing in a shared ecosystem.
- **How long does it run?** Indefinitely, with checkpointing. Users observe the current generation's leaderboard and the evolutionary history.

**Implementation sketch:**
- Strategy genome representation (structured prompt + parameters)
- Population manager handling selection, crossover, and mutation
- Generation runner executing round-robin tournaments within each generation
- Fitness evaluator computing survival scores
- Lineage tracker visualizing evolutionary trees
- Real-time dashboard showing population dynamics, strategy drift, and performance trends

---

## Summary Timeline

```
NOW           Phase 1          Phase 2          Phase 3          Phase 4          Phase 5
 │              │                │                │                │                │
 ▼              ▼                ▼                ▼                ▼                ▼
Single-model   Cross-model     Self-play       Persistent       Self-modifying   Evolutionary
tournaments    teams           analysis        scratch notes    prompts          tournaments
               │                │                │                │                │
               └── Mixed team   └── Variance    └── Meta         └── Agent-       └── Natural
                   dynamics         studies         emergence        authored         selection
                                                                    strategies       at scale
```

Each phase is independently valuable and produces research-worthy results. But each phase also lays the groundwork for the next: cross-model teams teach us about coordination, self-play establishes baselines, scratch notes introduce memory, self-modifying prompts introduce agency, and evolutionary tournaments let it all run at scale.
