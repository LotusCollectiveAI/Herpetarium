# DECRYPTO ARENA: MASTER ARCHITECTURE & ROADMAP BRIEF

## For Review by Best Practices Advisory Repository

**Date:** 2026-03-30
**Repository:** https://github.com/mstraw/Herpetarium
**Status:** Active development, transitioning from prototype to research platform

---

## SECTION 1: PROJECT OVERVIEW & VISION

### What This Is

Decrypto Arena is an AI behavioral research platform built around the board game Decrypto. In Decrypto, two teams each have four secret keywords. Each round, one player gives three one-word clues corresponding to a secret code (a permutation of keyword positions). Teammates must decode the clues, while opponents try to intercept the code by detecting patterns across rounds. The game demands theory of mind, deception, cooperation under constraints, and adaptive strategy -- making it an unusually rich testbed for studying AI cognition.

### The Research Mission

The platform studies how LLMs behave in structured social deduction games. Specific research questions include:

- **K-level strategic reasoning**: Do models exhibit multi-level strategic thinking (I think that they think that I think...)? Does explicit prompting for K-level reasoning improve performance?
- **Theory of mind**: Do models develop accurate models of opponent behavior over iterated play? Can we measure ToM depth and track its development?
- **Emergent strategy**: When AI agents play hundreds of iterated games with persistent memory, what strategies emerge without human design? Do different model families converge on similar strategies or diverge?
- **Deception**: How do models balance teammate clarity with opponent deception? Do evolved strategies discover deceptive techniques (red herrings, misdirection) independently?
- **Cross-architecture collaboration**: When models from different providers (Claude + GPT) form a team, does the architectural mismatch help or hurt? Does communicative diversity provide natural encryption against interception?

### Current Tech Stack

- **Backend**: Node.js / Express / TypeScript (ES modules)
- **Frontend**: React 18 / Vite 7 / Tailwind CSS / Radix UI / Recharts
- **Database**: PostgreSQL via Drizzle ORM (`@neondatabase/serverless` driver)
- **AI Providers**: OpenAI (GPT-4o, o3, o1), Anthropic (Claude Sonnet 4, Haiku 4), Google Gemini (2.0 Flash, 2.5 Pro/Flash), OpenRouter (DeepSeek R1, Grok 3, Llama 4, Mistral Large, Qwen 2.5)
- **Build**: esbuild for server, Vite for client, tsx for dev
- **Key dependencies**: zod (validation), ws (WebSocket), p-limit/p-retry (concurrency), recharts (visualization)

### Origin and Trajectory

The project originated as a Replit build and is being professionalized into a research platform. The codebase still carries Replit integration code (audio, chat, image routes) that is vestigial. The strategic pivot is away from human play toward AI-vs-AI research capabilities: headless match running, tournament orchestration, iterated series with persistent agent memory, and evolutionary strategy search.

---

## SECTION 2: CURRENT ARCHITECTURE & WHAT EXISTS

### Game Engine (`server/game.ts`)

Pure functional, immutable game state. The `GameState` type tracks the full Decrypto lifecycle: lobby, team setup, clue giving, own-team guessing, opponent interception, round evaluation, game over. Functions like `submitClues()`, `submitOwnTeamGuess()`, `submitInterception()` return new state objects. Seeded RNG via `createSeededRng()` enables reproducible keyword selection and code generation. `validateGameState()` checks internal consistency after each phase transition.

### AI Provider Layer (`server/ai.ts`)

Four providers with dedicated handling for reasoning/thinking models. Rate-limit detection parses 429 responses and `Retry-After` headers, with exponential backoff and jitter via `callAIWithBackoff()`. Token counting and cost estimation use a hardcoded `MODEL_COST_PER_1K` table covering 15 models. Reasoning traces are captured from OpenAI (reasoning_content), Anthropic (thinking blocks), Gemini (thought parts), and OpenRouter. Parse quality tracking classifies every AI response as clean, partial_recovery, fallback_used, or error.

### Headless Match Runner (`server/headlessRunner.ts`)

Runs complete AI-vs-AI games with no UI involvement. Creates game state, assigns players, generates seeded keywords, and loops through rounds calling `processClues()`, `processGuesses()`, and `processInterceptions()`. Every AI call is logged to the database with full prompt text, raw response, reasoning trace, latency, token counts, cost estimate, and parse quality. A 60-second timeout wrapper prevents hung calls.

### Tournament System (`server/tournament.ts`)

Multi-match tournaments with configurable concurrency (1-5 parallel matches), inter-match delay, budget caps with real-time cost tracking, and ablation flags. Tracks completed vs. failed matches. Final status reflects budget exceedance, partial failures, or clean completion.

### Series System (`server/seriesRunner.ts`)

Iterated games where AI agents accumulate strategic "scratch notes" across matches. After each game, a reflection call asks the agent to update its notes based on game outcomes, team/opponent history, and token counts. Notes are keyed by player config hash and carried forward. Token budgets are configurable (100-5000 tokens). The reflection prompt is well-designed but always uses `getDefaultConfig()` rather than the player's actual model configuration.

### Evolution Engine (`server/evolution.ts`)

A genuine evolutionary algorithm operating on natural-language genomes. Each genome has four modules: cluePhilosophy, opponentModeling, riskTolerance, memoryPolicy. Eight hand-crafted seed templates provide initial diversity. Module-level uniform crossover preserves meaningful strategy components. Mutation has two paths: AI-assisted (the LLM rewrites a module based on fitness context, with aggressiveness scaled by fitness score) and fallback (random selection from a predefined variant library). Evaluation uses frequency-weighted pairings that give more matches to rare genome pairs. Elo ratings (K=32) track relative strength. Fitness combines win rate (0.4), normalized Elo (0.3), interception rate (0.15), and negative miscommunication rate (0.15). Phase transition detection monitors diversity, fitness variance, interception rate variance, and fitness skewness to identify exploration, exploitation, convergence, and collapse phases.

### Prompt Strategy System (`server/promptStrategies.ts`, `server/kLevelStrategy.ts`, `server/enrichedStrategy.ts`)

Four strategies:
- **default**: Standard prompts with history awareness and scratch note injection
- **advanced**: Chain-of-thought reasoning with explicit theory-of-mind instructions; triggers Anthropic extended thinking (budget 10K tokens)
- **k-level**: Explicit Level 0-3 strategic reasoning framework adapted from game theory research
- **enriched**: Enhanced with semantic word metadata (vibe/tags from word packs), persona injection from a library of 7 named bot personas, and structured task framing

The ablation system supports five flags: `no_history`, `no_scratch_notes`, `no_opponent_history`, `no_chain_of_thought`, `random_clues`.

### Theory of Mind Analyzer (`server/tomAnalyzer.ts`)

Regex-based pattern matching classifies AI reasoning text into four ToM levels: Level 0 (Reactive), Level 1 (Self-Aware), Level 2 (Theory of Mind), Level 3 (Meta-Strategic). Builds timelines showing ToM progression across series. Computes whether agents are improving, stable, or declining.

### Metrics Engine (`server/metrics.ts`)

Computes per-model metrics (win rate, interception success/vulnerability, miscommunication rate, clue diversity), per-matchup head-to-head results, per-strategy breakdowns, team composition analysis (mixed vs. homogeneous), self-play dynamics, and parse quality statistics. All computation is in-memory over full dataset loads.

### Data Export and Client

Three export endpoints (matches, rounds, AI call logs) in JSON and CSV. Client has seven pages: Home, Game, History, Tournaments, Series, Evolution, and EvalDashboard. Visualizations use Recharts for bar charts, line charts, and radar charts.

---

## SECTION 3: CRITICAL GAPS & KNOWN PROBLEMS

1. **Prompt strategy propagation bug**: The Zod validation schema for `headlessMatchConfigSchema` in `routes.ts` does not include `aiConfig` or `promptStrategy`. The TypeScript type supports these fields, but API validation strips them. Result: all headless matches, tournaments, and series silently use default prompts regardless of UI configuration.

2. **No reasoning capture from non-reasoning models**: Standard models (GPT-4o, Gemini Flash) have `max_tokens: 200`, which forces terse output and discards any chain-of-thought the model might produce. The output format constraint ("respond with exactly 3 words") prevents capturing reasoning even when models could provide it.

3. **Extended thinking gate**: Anthropic extended thinking is only enabled when `promptStrategy === "advanced"`. The k-level and enriched strategies, which arguably benefit most from deep reasoning, do not trigger extended thinking.

4. **TOM analyzer is regex heuristics**: The analyzer confounds prompt language with model reasoning. A model that uses the word "opponent" because the prompt said "opponent" scores identically to one that genuinely reasons about opponent behavior. No behavioral validation (does higher TOM score correlate with better interception?).

5. **No job queue**: All long-running tasks (tournaments, series, evolution) run as in-process Promise chains. Server restart kills running experiments with no resume capability. State is tracked only via database status fields.

6. **No experiment isolation**: The EvalDashboard aggregates metrics across ALL matches in the database. No way to scope analysis to a specific tournament, series, or experiment. Different experimental conditions contaminate each other's metrics.

7. **No statistical framework**: The `significanceIndicator` uses hand-coded heuristics (win rate difference thresholds). No proper statistical tests, no confidence intervals, no effect sizes. No research finding from this platform would survive peer review.

8. **Analytics do not scale**: `computeModelMetrics()` and related functions load full datasets into JavaScript arrays and iterate in memory. No database-side aggregation, no materialized views, no pagination of analytical queries.

9. **Degenerate headless games**: The headless runner allows 1 player per team (same player gives clues and guesses). In that configuration, the clue-giver guesses their own clues, making the game trivial and data meaningless.

10. **Strategy not composable**: Cannot combine k-level reasoning structure with enriched word metadata and a bot persona. Strategies are monolithic alternatives, not composable layers.

11. **Scratch notes overwrite**: Each reflection call produces entirely new notes rather than accumulating diffs. No tracking of what changed between games. The reflection call uses `getDefaultConfig()` for the provider, ignoring the player's actual model configuration.

12. **No real-time monitoring**: No SSE, WebSocket, or polling endpoint for experiment progress. The only way to check a running experiment is to reload the page and check if `completedMatches` incremented.

---

## SECTION 4: THE ROADMAP -- WHAT WE WANT TO BUILD

### 4.1 Experiment Infrastructure

- **Job queue / workflow orchestration** for long-running experiments with pause, resume, retry, and server-restart survival
- **Experiment isolation** with unique experiment IDs, scoped metrics, and side-by-side comparison views
- **Factorial experiment design**: model x strategy x temperature x ablation combinations, automatically generated and executed
- **Proper statistical testing**: bootstrap confidence intervals, permutation tests, effect sizes (Cohen's d), power analysis for sample size planning
- **Seed management** for full reproducibility: stored seeds, "replay with different config" functionality
- **Budget management** with real-time cost tracking, burn rate projection, and per-experiment cost allocation
- **Experiment templates**: pre-built configurations for common research questions (model comparison, strategy ablation, learning curve measurement)

### 4.2 Reasoning Capture & Cognitive Analysis

- **Two-pass architecture**: a reasoning call (unconstrained output, captures thinking) followed by a decision call (structured output, extracts the action). This separates the reasoning signal from the game action.
- **Structured reasoning capture**: extract alternatives considered, confidence levels, opponent models, strategic rationale from reasoning traces
- **LLM-as-judge evaluation pipeline**: a separate model scores reasoning traces on a strategic depth rubric (surface-level, single-step, multi-step, recursive, meta-strategic)
- **Behavioral TOM validation**: correlate TOM scores with downstream outcomes (does higher claimed TOM predict better interception rates?) to distinguish genuine reasoning from prompt parroting
- **Semantic clue analysis** using embeddings: compute clue-keyword cosine similarity, measure semantic drift across rounds, identify which keyword associations are most vulnerable to interception
- **Counterfactual analysis**: re-run specific rounds with different codes to test whether clue quality is code-dependent

### 4.3 Evolution & Strategy Development

- **Composable strategy system**: mix k-level reasoning structure + enriched word metadata + persona + ablation flags as orthogonal layers rather than monolithic alternatives
- **Strategy versioning** with content hashes for deduplication and lineage tracking
- **Cross-population evolution**: pit an evolved Claude population against an evolved GPT population for genuine co-evolutionary dynamics
- **Niche preservation / speciation**: fitness sharing or crowding to prevent premature convergence to a single dominant strategy
- **Behavioral emergence detection**: anomaly detection on clue patterns, interception rate shifts, and meta-game cycles
- **Strategy archaeology**: parse scratch notes for discrete strategic claims, track when specific ideas appear and spread through a population

### 4.4 Data Architecture & Analytics

- Move metric computation from in-memory JavaScript to **database-side aggregation** (Postgres window functions, CTEs, materialized views)
- **Experiment-scoped metric computation** via match tagging
- **Time-series analysis**: learning curves, performance trends across series games, rolling averages
- **Pre-computed aggregates** refreshed on match completion rather than computed on every dashboard load
- **Research-ready data export**: Parquet format, SQLite dump, pandas-ready CSV with proper typing
- **Researcher Python SDK**: programmatic experiment definition, execution, monitoring, and analysis

### 4.5 Monitoring & Observability

- **Real-time experiment progress** via SSE or WebSocket: match count, current cost, ETA, error rate, live match feed
- **Live cost dashboard** with burn rate projection and budget alerts
- **Alerting** on failure patterns, budget thresholds, and anomalous model behavior (e.g., fallback rate spike)
- **Game replay viewer**: step-by-step walkthrough with reasoning traces displayed in context alongside game state
- **Experiment comparison views**: side-by-side metrics, overlaid learning curves, statistical comparison results

### 4.6 Future: Multi-Game Platform

- **Game engine abstraction**: a `GameEngine` interface with methods for `createGame()`, `getPhases()`, `processPhase()`, `evaluateRound()`, `isGameOver()`, `getWinner()`, `getMetrics()`
- **Game-agnostic infrastructure**: tournament, series, evolution, and metrics systems parameterized by game type
- **Candidate games**: Werewolf (role deduction, deception), Codenames (word association, team communication), Diplomacy (negotiation, alliance formation, betrayal)
- **Game-specific AI wrappers**, prompt templates, response parsers, and metric definitions

---

## SECTION 5: SPECIFIC QUESTIONS FOR THE ADVISORY REPO

### 1. Agent Architecture

How should we structure AI agents for game-playing? Should each agent be a stateful object with memory, or stateless functions with context injection? Our current approach is stateless (context injected per call with scratch notes as serialized state). What patterns from the Claude Agent SDK, OpenAI Agents SDK, LangGraph, CrewAI, or AutoGen apply to building game-playing agents that maintain strategic state across turns within a game and across games within a series?

### 2. Workflow Orchestration

For running hundreds of AI-vs-AI games with proper experiment management (pause/resume/retry, budget enforcement, server-restart survival), what is the right orchestration layer? We are evaluating: Temporal (full workflow durability), Inngest (event-driven), BullMQ (Redis-based queue), pg-boss (Postgres-backed queue), or a custom Postgres-backed solution. What fits best for a single-developer TypeScript project that needs reliability without excessive infrastructure complexity?

### 3. Eval & Benchmarking Frameworks

This is essentially an eval platform for AI strategic reasoning. What can we learn from Inspect AI (UK AISI), METR, Braintrust, Langsmith, Arize Phoenix, or DeepEval? Should we integrate with an existing eval framework rather than building our own pipeline? How should we structure our evaluation for maximum research publishability?

### 4. Structured Reasoning Capture

What are the best 2026 patterns for eliciting and capturing structured reasoning from LLMs? We need models to show their strategic thinking in an analyzable format without degrading game performance. Options include: chain-of-thought prompting, structured output schemas, tool-use-as-reasoning, thinking tokens (Anthropic extended thinking, Gemini thinking config), or our proposed two-pass architecture. What works best, and how do we handle models that do not support native thinking tokens?

### 5. LLM-as-Judge

We want to use a separate LLM to evaluate game-playing agents' strategic reasoning quality. What frameworks and rubrics exist for LLM-as-judge in strategic contexts? How do we calibrate the judge, handle inter-rater reliability, and ensure reproducibility? Are there established rubrics for strategic depth that we can adapt?

### 6. Statistical Methods for AI Experiments

What is the right statistical framework for comparing AI agent performance in games with inherent randomness (keyword assignment, code generation)? How do we handle the non-independence of games within a series (where agents learn and adapt)? Bootstrap vs. Bayesian vs. frequentist? Elo vs. TrueSkill vs. Bradley-Terry for ranking? What sample sizes are needed for reliable comparisons given Decrypto's variance?

### 7. Evolutionary Computation with LLMs

Our evolution engine uses natural-language genomes that are AI-mutated. What is the state of the art in prompt evolution, strategy evolution, and LLM-guided search? How do we prevent degenerate convergence in natural-language genome spaces? Are there better crossover operators than uniform module-level swapping?

### 8. Multi-Agent Game Simulation Platforms

What existing platforms do similar things? How should we position relative to Cicero (Diplomacy), Pluribus (poker), Melting Pot (multi-agent scenarios), ChatArena, and Sotopia? Are there established patterns we should adopt or common pitfalls to avoid?

### 9. Observability for AI Systems

What is the right observability stack for a platform generating thousands of AI calls per experiment? We currently store full prompt text and responses for every call, which is comprehensive but storage-heavy. How do we balance trace granularity with storage costs? Should we adopt OpenTelemetry, LangFuse, or build custom?

### 10. Theory of Mind Measurement

What does the academic literature say about measuring TOM in LLMs? What benchmarks exist (ToMi, BigToM, FANToM, OpenToM)? How should we design our TOM measurement to be scientifically defensible -- specifically, how do we distinguish prompt-induced language from genuine recursive reasoning?

### 11. Embedding-Based Analysis

For analyzing clue-keyword semantic relationships, what embedding models and similarity metrics are current best practice? We need to compute semantic similarity at scale (thousands of clue-keyword pairs), detect semantic drift across rounds, and cluster clue strategies. Should we run embeddings locally or via API?

### 12. Frontend for Research Platforms

What are the best patterns for research dashboards? We have a React + Recharts setup. Should we consider Observable, Streamlit, or a hybrid approach? What visualization libraries handle the kinds of displays researchers need (learning curves, heatmaps, evolutionary lineage trees, side-by-side metric comparisons)?

### 13. Cost Optimization

With potentially thousands of API calls per experiment, what are the best practices for cost management? Semantic caching of similar prompts? Routing cheap models for low-stakes decisions (e.g., guess validation)? Distillation of evolved strategies to cheaper models? Batching API calls where possible?

### 14. Reproducibility

What infrastructure is needed for fully reproducible AI experiments? We have seeded RNG for keywords and codes, but API responses are non-deterministic even at temperature 0. How do we handle model versioning (model IDs change), prompt versioning, and the fundamental non-determinism of LLM APIs?

---

## SECTION 6: RELEVANT RESOURCES & REFERENCES

### Agent Frameworks & SDKs

- **Claude Agent SDK** (Anthropic) -- Agent building patterns for Claude models; relevant for structuring our game-playing agents with tool use and memory. https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk
- **OpenAI Agents SDK** -- Multi-agent orchestration with handoffs; relevant for modeling team dynamics (clue-giver hands off to guesser). https://github.com/openai/openai-agents-python
- **LangGraph** (LangChain) -- Stateful agent workflows with persistence and human-in-the-loop; relevant for our series runner's need for persistent agent state across games. https://github.com/langchain-ai/langgraph
- **CrewAI** -- Multi-agent collaboration framework; relevant for modeling team cooperation between clue-giver and guesser agents. https://github.com/crewAIInc/crewAI
- **AutoGen** (Microsoft) -- Multi-agent conversation framework; relevant for the inter-agent communication patterns in team play. https://github.com/microsoft/autogen
- **Pydantic AI** -- Type-safe agent building with structured outputs; relevant for our need to extract structured data from LLM responses. https://github.com/pydantic/pydantic-ai
- **Magentic** -- Lightweight LLM function calling; relevant as a simpler alternative to full agent frameworks for our call pattern. https://github.com/jackmpcollins/magentic

### Eval & Benchmarking

- **Inspect AI** (UK AISI) -- AI safety evaluation framework with task definitions, solvers, and scorers; directly relevant as a model for structuring our game-playing evaluations. https://github.com/UKGovernmentBEIS/inspect_ai
- **METR** -- AI capability evaluation methodology; relevant for our approach to measuring strategic reasoning capabilities. https://metr.org/
- **Braintrust** -- LLM eval platform with experiment tracking and comparison; relevant for our experiment isolation and comparison needs. https://github.com/braintrustdata/braintrust-sdk
- **Langsmith** (LangChain) -- Tracing and evaluation platform; relevant for our AI call logging and trace analysis. https://docs.smith.langchain.com/
- **Arize Phoenix** -- LLM observability with traces, evals, and experiments; relevant for our monitoring and analysis pipeline. https://github.com/Arize-AI/phoenix
- **DeepEval** -- LLM evaluation framework with metrics for faithfulness, relevance, etc.; relevant for evaluating reasoning quality. https://github.com/confident-ai/deepeval
- **PromptFoo** -- Prompt testing and evaluation; relevant for our multi-strategy comparison needs. https://github.com/promptfoo/promptfoo

### Game AI & Multi-Agent Research

- **Cicero** (Meta) -- Diplomacy AI combining language models with strategic reasoning; the closest large-scale precedent for LLM game-playing with natural language communication. https://github.com/facebookresearch/diplomacy_cicero
- **Pluribus** (Meta) -- Poker AI using search and self-play; relevant for our self-play and strategy evolution work. Published in Science 2019.
- **Melting Pot** (DeepMind) -- Multi-agent social scenario evaluation suite; relevant as a model for how to structure multi-agent game evaluations. https://github.com/google-deepmind/meltingpot
- **ChatArena** -- LLM arena for multi-agent evaluation in games; directly relevant as a similar platform concept. https://github.com/chatarena/chatarena
- **Sotopia** -- Social intelligence evaluation for LLM agents; relevant for our theory-of-mind and social reasoning measurement. https://github.com/sotopia-lab/sotopia
- **MAIA** -- Human-like chess AI trained on human games; relevant for our interest in understanding AI strategic "style" rather than just strength. https://github.com/CSSLab/maia-chess
- **GTBench** -- Game-theoretic benchmark for LLMs covering strategic reasoning in various games. https://github.com/jinyu-hou/GTBench

### Theory of Mind

- **ToMi benchmark** -- Theory of Mind evaluation for language models. https://github.com/facebookresearch/ToMi
- **BigToM** -- Large-scale theory of mind benchmark. https://github.com/cicl-stanford/big_tom
- **FANToM** -- Stress-testing TOM in LLMs with false-belief tasks. https://arxiv.org/abs/2310.15421
- **OpenToM** -- Open-ended theory of mind evaluation. https://github.com/seacowx/OpenToM
- **"Mindcraft: Theory of Mind Evaluation in LLMs"** -- Evaluation methodology for recursive reasoning. https://arxiv.org/abs/2404.01030
- Kosinski (2023), "Theory of Mind May Have Spontaneously Emerged in Large Language Models." https://arxiv.org/abs/2302.02083

### Evolutionary & Prompt Optimization

- **EvoPrompt** -- Evolutionary prompt optimization using genetic algorithms and differential evolution. https://arxiv.org/abs/2309.08532
- **PromptBreeder** -- Self-referential self-improvement of LLM prompts via evolutionary methods. https://arxiv.org/abs/2309.16797
- **OpenELM** -- Evolutionary LLM model merging and optimization. https://github.com/CarperAI/OpenELM
- **DSPy** -- Programmatic prompt optimization with automatic few-shot example selection and instruction tuning. https://github.com/stanfordnlp/dspy
- **TextGrad** -- Text-based gradient descent for LLM optimization. https://github.com/zou-group/textgrad
- **OPRO** (Google) -- Optimization by PROmpting, using LLMs as optimizers. https://arxiv.org/abs/2309.03409

### Statistical Methods

- **Bradley-Terry model** -- Pairwise comparison model for ranking; relevant for our matchup analysis. Standard implementation in R's `BradleyTerry2` package and Python's `choix` library.
- **TrueSkill 2** (Microsoft) -- Bayesian ranking system handling team games with partial information; directly relevant for ranking models in team-based Decrypto. https://www.microsoft.com/en-us/research/publication/trueskill-2-an-improved-bayesian-skill-ranking-system/
- **Chatbot Arena / LMSYS Elo methodology** -- Elo rating for LLMs from pairwise comparisons; relevant for our model ranking approach. https://github.com/lm-sys/FastChat
- **Bootstrap methods** -- Efron & Tibshirani's bootstrap for confidence intervals on metrics with small samples; essential for our experiment analysis.
- `scipy.stats` and `statsmodels` (Python) -- Standard libraries for the statistical tests we need (Mann-Whitney U, permutation tests, bootstrap CI).

### Observability & Data

- **OpenTelemetry** -- Standard observability framework; relevant for instrumenting our AI call pipeline. https://opentelemetry.io/
- **LangFuse** -- Open-source LLM observability with traces, scores, and prompt management; relevant as a potential replacement for our custom AI call logging. https://github.com/langfuse/langfuse
- **Weights & Biases** -- Experiment tracking with visualization; relevant for our experiment comparison and metric tracking needs. https://wandb.ai/
- **DuckDB** -- Embedded analytical database; relevant as a potential replacement for our in-memory analytics with SQL-based aggregation. https://duckdb.org/
- **Apache Parquet** -- Columnar storage format; relevant for our research data export needs. https://parquet.apache.org/

### Workflow Orchestration

- **Temporal** -- Durable workflow execution with replay and retry; the heavyweight option for our experiment orchestration needs. https://temporal.io/
- **Inngest** -- Event-driven workflow orchestration; lighter weight than Temporal, good TypeScript support. https://github.com/inngest/inngest
- **BullMQ** -- Redis-based job queue for Node.js; proven, simple, good for our scale. https://github.com/taskforcesh/bullmq
- **pg-boss** -- Postgres-backed job queue; attractive because we already use Postgres, no new infrastructure. https://github.com/timgit/pg-boss
- **Graphile Worker** -- High-performance Postgres-backed job queue; another Postgres-native option. https://github.com/graphile/worker

### Frontend & Visualization

- **Observable Plot** -- Grammar-of-graphics visualization for the web; good for research-oriented charts. https://github.com/observablehq/plot
- **Visx** (Airbnb) -- Low-level React visualization primitives built on D3; relevant for custom research visualizations. https://github.com/airbnb/visx
- **Nivo** -- Rich React chart components; relevant as a Recharts alternative with more chart types. https://github.com/plouc/nivo
- **Streamlit** -- Python-based research dashboard framework; relevant if we add a Python analysis layer. https://streamlit.io/

---

## SECTION 7: CONSTRAINTS & PREFERENCES

### Developer Profile
- **Single developer** with AI coding assistance (Claude Code) -- architecture must be incrementally buildable by one person
- Comfortable with TypeScript (primary), Python (for analysis/ML components), and SQL
- Familiar with the research literature but not a full-time academic researcher

### Technical Constraints
- **TypeScript/Node.js backend** preferred for all game/experiment infrastructure
- **Python acceptable** for analysis pipelines, embedding computation, statistical testing, and researcher SDK
- **PostgreSQL** as primary datastore (already in use via Neon serverless)
- Must remain **runnable locally on a MacBook** -- no mandatory cloud services beyond the database and AI API keys
- **Budget-conscious on API costs** -- this is a research project, not an enterprise deployment. Experiments with reasoning models (o3, Gemini 2.5 Pro) can cost $5-50 per run. Cost awareness is a first-class concern.

### Architectural Preferences
- **Composable and modular** over monolithic frameworks. Prefer small, well-defined interfaces that can be independently developed and tested.
- **Incremental adoption** over big-bang migrations. New capabilities should be addable without rewriting existing working code.
- **Skeptical of heavy frameworks** that add complexity without clear value. The overhead of learning and maintaining Temporal, for example, needs to be justified against a simpler pg-boss solution.
- **Prefer standards** (OpenTelemetry, Parquet, SQL) over proprietary formats
- **Research-community oriented** -- the platform should produce data and insights interesting to the AI research community. Design decisions should favor research value over engineering elegance.

### What Success Looks Like
- Experiments that produce publishable results about AI strategic reasoning
- A platform that other researchers would want to use or adapt
- An evolutionary engine that discovers strategies no human designed
- Clean, well-documented data exports that integrate with standard research tools (Python/pandas, R, Jupyter)
- A codebase that one person can maintain and extend without drowning in infrastructure complexity
