# Architecture Progression Diagram

A visual representation of Decrypto Arena's evolution from current state through near-term and long-term vision.

---

## System Progression

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                          CURRENT STATE                                     ║
║                                                                            ║
║   ┌─────────┐     ┌──────────────┐     ┌──────────────┐                    ║
║   │  Human  │────▶│  Game Engine  │◀────│   AI Agent   │                    ║
║   │ Players │     │  (WebSocket)  │     │  (per-match) │                    ║
║   └─────────┘     └──────┬───────┘     └──────────────┘                    ║
║                          │                                                  ║
║                   ┌──────▼───────┐                                          ║
║                   │  Tournament  │     ┌──────────────┐                    ║
║                   │   Runner     │────▶│  Match Store  │                    ║
║                   └──────────────┘     │  + AI Logs   │                    ║
║                                        └──────────────┘                    ║
║                                                                            ║
║   Human role: Play directly, team up with AI, configure tournaments        ║
║   AI role: Execute gameplay (clues, guesses, interceptions) alongside or   ║
║            independent of human players                                     ║
╚══════════════════════════════════════════════════════════════════════════════╝

                                    │
                                    │  NEAR-TERM
                                    ▼

╔══════════════════════════════════════════════════════════════════════════════╗
║                         NEAR-TERM VISION                                   ║
║                                                                            ║
║   ┌──────────────────────────────────────────────────────┐                 ║
║   │              Cross-Model Team Manager                │                 ║
║   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐ │                 ║
║   │  │  GPT    │  │ Claude  │  │ Gemini  │  │  Grok  │ │                 ║
║   │  └────┬────┘  └────┬────┘  └────┬────┘  └───┬────┘ │                 ║
║   │       └────────┬───┴────────┬───┘            │      │                 ║
║   │                ▼            ▼                ▼      │                 ║
║   │          ┌──────────┐  ┌──────────┐                 │                 ║
║   │          │ Team A   │  │ Team B   │  (mixed teams)  │                 ║
║   │          └──────────┘  └──────────┘                 │                 ║
║   └──────────────────────────────────────────────────────┘                 ║
║                          │                                                  ║
║                   ┌──────▼───────┐     ┌──────────────┐                    ║
║                   │  Iterated    │────▶│  Scratch     │                    ║
║                   │  Game Runner │◀────│  Notes Store │                    ║
║                   └──────────────┘     └──────────────┘                    ║
║                          │                                                  ║
║                   ┌──────▼───────┐                                          ║
║                   │  Self-Play   │                                          ║
║                   │  Analyzer    │                                          ║
║                   └──────────────┘                                          ║
║                                                                            ║
║   Human role: Design experiments, analyze results                          ║
║   AI role: Play games, maintain scratch notes, evolve meta                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

                                    │
                                    │  LONG-TERM
                                    ▼

╔══════════════════════════════════════════════════════════════════════════════╗
║                     LONG-TERM: AUTONOMOUS RESEARCH PLATFORM                ║
║                                                                            ║
║   ┌──────────────────────────────────────────────────────────────────┐     ║
║   │                    Evolutionary Engine                           │     ║
║   │                                                                  │     ║
║   │   ┌────────────┐    ┌────────────┐    ┌────────────┐            │     ║
║   │   │ Generation │───▶│ Selection  │───▶│ Crossover  │──┐        │     ║
║   │   │  Runner    │    │ & Fitness  │    │ & Mutation │  │        │     ║
║   │   └────────────┘    └────────────┘    └────────────┘  │        │     ║
║   │        ▲                                               │        │     ║
║   │        └───────────────────────────────────────────────┘        │     ║
║   │                                                                  │     ║
║   └──────────────────────────┬───────────────────────────────────────┘     ║
║                              │                                              ║
║          ┌───────────────────┼───────────────────┐                         ║
║          ▼                   ▼                   ▼                         ║
║   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                  ║
║   │  Strategy    │   │   Prompt     │   │   Replay     │                  ║
║   │  Genome      │   │   Self-      │   │   Analysis   │                  ║
║   │  Population  │   │   Modifier   │   │   Engine     │                  ║
║   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                  ║
║          │                  │                   │                          ║
║          └──────────────────┼───────────────────┘                         ║
║                             ▼                                              ║
║                   ┌──────────────────┐                                     ║
║                   │   Observation    │                                     ║
║                   │   Dashboard     │                                     ║
║                   │                  │                                     ║
║                   │  • Lineage trees │                                     ║
║                   │  • Meta reports  │                                     ║
║                   │  • Strategy diffs│                                     ║
║                   │  • Fitness curves│                                     ║
║                   └──────────────────┘                                     ║
║                             ▲                                              ║
║                             │                                              ║
║                      ┌──────┴──────┐                                       ║
║                      │   Human     │                                       ║
║                      │  Observer   │                                       ║
║                      └─────────────┘                                       ║
║                                                                            ║
║   Human role: Observe, analyze, study emergent behavior                    ║
║   AI role: Everything — play, strategize, evolve, self-improve             ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## Data Flow Progression

```
CURRENT:
  Human ──config──▶ Tournament ──matches──▶ Results ──▶ Human reads logs

NEAR-TERM:
  Human ──config──▶ Series ──matches──▶ Results ──notes──▶ Agent Memory
                        ▲                                       │
                        └──── next series with memory ──────────┘

LONG-TERM:
  Human ──initial design──▶ Evolutionary Engine
                                    │
                           ┌────────┴────────┐
                           ▼                 ▼
                     Tournaments        Prompt Rewriting
                           │                 │
                           ▼                 ▼
                     Fitness Scores    Strategy Versions
                           │                 │
                           └────────┬────────┘
                                    ▼
                              Selection &
                              Reproduction
                                    │
                                    ▼
                           Next Generation
                                    │
                              (loop forever)
```

---

## Capability Accumulation

```
Feature                          Current    Phase 1    Phase 2    Phase 3    Phase 4    Phase 5
─────────────────────────────    ───────    ───────    ───────    ───────    ───────    ───────
Human play                         ●
Human + AI teams                   ●
AI vs AI matches                   ●          ●          ●          ●          ●          ●
Tournament system                  ●          ●          ●          ●          ●          ●
Cross-model teams                             ●          ●          ●          ●          ●
Self-play analysis                                       ●          ●          ●          ●
Persistent agent memory                                             ●          ●          ●
Meta emergence tracking                                             ●          ●          ●
Agent prompt self-modification                                                 ●          ●
Prompt version control                                                         ●          ●
Evolutionary selection                                                                    ●
Strategy genomes                                                                          ●
Crossover & mutation                                                                      ●
Population dynamics                                                                       ●
Lineage visualization                                                                     ●
```

---

## Architectural Inspiration: Karpathy's Auto Research

The long-term architecture draws direct inspiration from Andrej Karpathy's [Auto Research](https://github.com/karpathy/auto-research) open-source project, which demonstrates autonomous agent-driven research loops.

### Parallels

| Auto Research | Decrypto Arena |
|---|---|
| Agent reads papers and identifies research questions | Agent reviews game replays and identifies strategic weaknesses |
| Agent designs and runs experiments | Agent modifies its strategy prompt and plays test matches |
| Agent analyzes results and writes findings | Agent evaluates win rates and updates scratch notes |
| Loop continues autonomously | Evolution continues across generations |
| Human role: set research direction, review outputs | Human role: design evolutionary environment, observe results |

### The Shared Pattern

Both systems implement the same fundamental loop:

```
     ┌──────────────────────────────────────────┐
     │                                          │
     ▼                                          │
  Observe         Hypothesize         Act       │
  (review         (form new           (modify   │
   results)        strategy)           prompt)  │
     │                │                  │      │
     ▼                ▼                  ▼      │
  ┌──────┐      ┌──────────┐      ┌─────────┐  │
  │ Game │      │ Strategy │      │  Test    │  │
  │ Data │─────▶│ Update   │─────▶│  Match   │──┘
  └──────┘      └──────────┘      └─────────┘
```

The key insight from Karpathy's work that applies here: the most interesting results come not from a single cycle of this loop, but from running it at scale — hundreds or thousands of iterations — and observing what patterns emerge when the agent's accumulated experience compounds. In Auto Research, this produces novel research findings. In Decrypto Arena, this produces novel game strategies that no human designed.

### What We Borrow

1. **The autonomous loop structure**: Observe → Hypothesize → Act → Repeat
2. **Minimal human intervention**: Humans design the environment, not the outputs
3. **Compounding learning**: Each iteration builds on all previous iterations
4. **Transparency and logging**: Every decision is recorded for later analysis
5. **Open-ended exploration**: The system doesn't optimize toward a known target — it discovers what's possible

### Where We Diverge

Decrypto Arena adds competitive dynamics that Auto Research doesn't have. In Auto Research, the agent is exploring a static knowledge landscape. In Decrypto Arena, the landscape changes because opponents are simultaneously evolving. This creates arms-race dynamics, meta-game cycles, and the possibility of strategic equilibria — phenomena that only emerge in multi-agent competitive environments.
