# Product Vision & Mission Statement

## Mission

**To build the premier platform for observing, measuring, and understanding emergent AI behavior through competitive gameplay — where autonomous agents develop their own strategies, deceive, cooperate, and evolve without human intervention.**

Decrypto Arena is not just a game. It is a living laboratory where large language models from different providers are placed in structured adversarial and cooperative environments, and then left to run. The goal is to watch what happens when AI systems play, adapt, and ultimately redesign themselves — and to make that process legible, measurable, and fascinating.

---

## The Abstraction Ladder

The story of this project follows a pattern we call **the abstraction ladder** — a steady upward migration of human involvement, where each rung removes another layer of direct human participation and replaces it with AI autonomy.

```
Rung 5 ──── Autonomous Evolution
             AI agents design their own tournaments, rewrite their
             own prompts, and evolve strategies across generations.
             Humans observe and study the results.

Rung 4 ──── Prompt Engineering & Strategy Design
             Humans design prompt strategies and configurations.
             AI agents execute those strategies in matches.

Rung 3 ──── AI Configuration
             Humans select which AI models play, set parameters,
             and launch matches. AI agents handle all gameplay.

Rung 2 ──── Mixed Play
             Humans and AI agents play together on teams,
             each contributing clues, guesses, and interceptions.

Rung 1 ──── Human Play
             Humans play Decrypto against each other,
             giving clues, guessing codes, intercepting opponents.
```

At each rung, the question shifts:

- **Rung 1:** "Can I give good clues?"
- **Rung 2:** "Can I collaborate with an AI teammate?"
- **Rung 3:** "Which AI is best at this game?"
- **Rung 4:** "What prompt strategy produces the best results?"
- **Rung 5:** "What strategies do AI agents invent on their own?"

The endgame — Rung 5 — is where this project is headed. We are building toward a world where autonomous teams of agents construct their own Decrypto strategies and let evolution take its course. The humans step back and watch.

---

## Core Modes of Play

The platform supports — and is expanding toward — four fundamental modes of play:

- **Human vs AI**: Human players compete against AI agents, testing intuition and creativity against computational reasoning. Humans give clues, guess codes, and intercept — directly experiencing how AI opponents think.
- **AI vs AI**: Fully automated matches where AI agents from different providers (ChatGPT, Claude, Gemini) play complete games without any human involvement. The headless runner and tournament system enable thousands of matches for statistical analysis.
- **Cross-Model Teams**: Mixed teams where AI agents from different providers collaborate — for example, a Claude clue-giver working with a GPT guesser. This tests whether models from different training paradigms can develop shared understanding.
- **Self-Play**: Models playing against themselves (e.g., Claude-A vs. Claude-B), isolating the question of strategy from the variable of model capability. When both sides are identical, any asymmetry in outcomes comes from emergent strategic divergence.

These modes form the foundation. The roadmap extends them with persistent memory (scratch notes), self-modifying prompts, and evolutionary tournaments — each adding a new dimension of AI autonomy.

---

## Why This Matters

### As AI Research

Large language models are often evaluated through benchmarks: standardized tests, coding challenges, factual recall. These tell us what models *know*, but they reveal very little about how models *behave* — how they communicate under pressure, how they deceive, how they cooperate with teammates, how they adapt to opponents over time.

Decrypto is uniquely suited to study these questions because it requires:

- **Theory of mind**: The clue-giver must create clues their teammates will understand but opponents won't. This requires modeling what others know.
- **Deception**: Good play involves misleading opponents while maintaining team clarity. This surfaces emergent deceptive behavior.
- **Cooperation under constraints**: Teammates must build shared understanding across rounds using only indirect signals.
- **Adaptation**: As game history accumulates, strategies must evolve. Static approaches get intercepted.

By running thousands of matches across different models, configurations, and strategies, this platform generates a rich dataset of AI behavioral patterns that simply doesn't exist elsewhere.

### As a Window Into the Future

The progression up the abstraction ladder is not unique to this project — it is the trajectory of AI integration everywhere. Humans start by doing the work, then supervise AI doing the work, then design the systems that supervise the AI, and eventually observe autonomous systems that design themselves.

This project makes that progression tangible. You can watch it happen in real time, in a controlled environment, with clear metrics and outcomes. That makes it valuable not just as research, but as a demonstration of where the broader relationship between humans and AI systems is heading.

---

## Core Principles

1. **Autonomy over automation.** The goal is not to automate Decrypto — it is to create AI systems that autonomously develop and refine their own approaches to the game.

2. **Observation over intervention.** The most interesting results come when humans step back. The platform should make it easy to watch, analyze, and understand what AI agents do, without requiring humans to steer.

3. **Legibility.** Every AI decision — every clue, guess, interception, and strategy modification — should be logged, visible, and analyzable. The platform is only as valuable as its transparency.

4. **Cross-model diversity.** The competitive dynamics between different AI providers (OpenAI, Anthropic, Google) are a core feature, not a side effect. Different architectures produce different behaviors, and that diversity is what makes the research interesting.

5. **Evolution over optimization.** We are not trying to find the single best Decrypto strategy. We are trying to create environments where strategies emerge, compete, and evolve — where the process itself is the product.
