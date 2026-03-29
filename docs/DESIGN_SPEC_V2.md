# Decrypto Arena — Design Spec v2

## Summary

This spec defines the next build phase for Decrypto Arena, derived from a multi-perspective brainstorm across pragmatic engineering, AI research, experience design, complex systems, and ambitious moonshot thinking. The consistent finding: the platform sits on uniquely valuable data (AI reasoning traces, theory-of-mind evolution, deception strategy development in competitive play) but the data pipeline isn't trustworthy enough to support the research and spectacle features the vision demands.

The build plan follows four phases, each unlocking the next.

---

## Phase A: Data Foundation

*Make the data trustworthy, controlled, and exportable.*

### A1. Fix Silent Fallbacks & Parse Quality Tracking

**Problem:** When AI responses are malformed, the parsers silently fall back to defaults — `["hint", "clue", "guess"]` for clues, `[1, 2, 3]` for codes. These corrupt game outcomes without any indication. You can't tell whether a team guessed `[1, 2, 3]` intentionally or because the AI returned garbage.

**Solution:**
- Add a `parseQuality` field to AI call log records: `"clean"`, `"partial_recovery"`, or `"fallback_used"`
- Tag every AI call with its parse outcome before storing
- Surface parse failure rates per model in the eval dashboard as a first-class metric
- Add a "data quality" indicator to the model breakdown table
- Allow filtering out fallback-contaminated matches from analysis

### A2. Token Count & Cost Logging

**Problem:** No cost tracking exists anywhere. AI provider responses include token usage data but it's discarded. Reasoning models cost 10-50x more per call than standard models, but the UI treats all models as interchangeable.

**Solution:**
- Extract `inputTokens`, `outputTokens` from each provider's response (OpenAI `response.usage`, Anthropic `response.usage`, Gemini usage metadata)
- Add `inputTokens`, `outputTokens`, `estimatedCost` fields to `ai_call_logs`
- Maintain a cost-per-token lookup table by model
- Surface cumulative cost per tournament/series in the dashboard
- Add a pre-launch cost estimator to tournament and series creation UI

### A3. Seed-Based Keyword Control

**Problem:** Keyword assignment is fully random. You can't pin down game setup to isolate variables. Keyword difficulty is a massive uncontrolled confound.

**Solution:**
- Add optional `seed` parameter to `HeadlessMatchConfig` and series config
- Use seeded PRNG for keyword selection and code generation
- Store seed with each match record
- Add "replay with different model" button in match history that copies exact setup but swaps AI config
- Make the keyword pool explicit, configurable, and viewable

### A4. Game State Validation

**Problem:** No validation that game state is internally consistent after phase transitions. Corrupted states complete and get stored as valid data.

**Solution:**
- Add `validateGameState()` function that runs assertions after each phase transition
- Check: keywords unique per team, codes have valid positions without duplicates, clue arrays have exactly 3 entries, guess arrays match code format, token counts are monotonically non-decreasing
- Log validation failures as warnings, tag affected matches in database
- Add "data integrity" indicator to eval dashboard

### A5. Research-Ready Data Export

**Problem:** Data export is raw JSON with nested structures. Researchers need flat tabular data for analysis in Python/R.

**Solution:**
- CSV export endpoints with three flat tables:
  - Match-level: one row per match (team models, strategies, win/loss, token counts, seed, data quality score)
  - Round-level: one row per round (clue-keyword mappings, guess accuracy, interception success, parse quality)
  - AI-call-level: one row per call (latency, tokens, cost, parse quality, model, action type)
- Date range and model filters on export API
- Downloadable data dictionary explaining each field
- Export buttons on History, Eval, and Series pages

---

## Phase B: The Reasoning Layer

*Surface the platform's most unique data asset — how AI agents think during competitive play.*

### B1. Reasoning Trace Viewer

**Problem:** Reasoning traces from o3, Claude extended thinking, and Gemini 2.5 thinking models are captured in `AICallResult.reasoningTrace` and stored in AI call logs — but completely invisible in the UI. This is arguably the most scientifically valuable data the platform generates.

**Solution:**
- Add a "Reasoning" tab/panel to the match detail page showing the thinking process alongside each clue/guess/interception decision
- Collapsible trace viewer with syntax highlighting for structured reasoning
- Trace search/filter: find traces where models explicitly reason about opponents, mention deception, reference prior history
- Trace length as a metric in the eval dashboard (do models that "think more" perform better?)
- Link traces to game outcomes (was this trace's decision correct? intercepted?)

### B2. Strategy Timeline for Series

**Problem:** Series with scratch notes produce the platform's most unique data — an agent's evolving strategic mind across games — but it's presented as a wall of text.

**Solution:**
- Horizontal timeline visualization showing note evolution across games in a series
- Auto-detect and flag key moments: strategy changes, new opponent theories, performance shifts
- Before/after diffs with highlighted changes at each game transition
- Correlate note changes with performance metrics (did the new strategy actually improve win rate?)
- Clickable timeline entries that expand to show full note text and game results

### B3. Cost Estimation Guards

**Problem:** Running tournaments with expensive reasoning models can burn through significant API credits with no warning.

**Solution:**
- Pre-launch cost estimator on tournament and series creation screens
- Calculate expected spend based on: model pricing, estimated tokens per call type (clue/guess/interception/reflection), number of matches, number of rounds per match
- Optional budget cap that pauses tournament when estimated cumulative cost crosses threshold
- Display actual vs estimated cost as tournament progresses
- Cost breakdown by model and call type in tournament results

---

## Phase C: The Experiment Toolkit

*Enable controlled, publishable AI behavioral experiments.*

### C1. Theory of Mind Depth Analyzer

**Problem:** Scratch notes contain rich data about whether agents develop models of opponents' knowledge states, but this isn't systematically measured.

**Solution:**
- Parse scratch note statements and classify by ToM order:
  - Zero-order: "I should vary my clues"
  - First-order: "The opponent has probably identified keyword 2"
  - Second-order: "The opponent knows I know they've identified keyword 2"
  - Higher-order: deeper recursive modeling
- Track ToM depth over time within a series
- Compare ToM depth trajectories across providers
- Correlate ToM depth with win rate and interception success
- Visualize as a line chart showing "cognitive sophistication" growing across games

### C2. Ablation Experiment Mode

**Problem:** No way to decompose what drives AI performance — is it game history, opponent observation, scratch notes, or something else?

**Solution:**
- Experiment mode that selectively removes context from AI prompts:
  - No own-team history
  - No opponent history during interception
  - No scratch notes (even when available)
  - No round number
  - Shuffled history order
- Matched series where control group has full context, treatment groups have one channel ablated
- Automated comparison showing marginal contribution of each information source
- Results visualization showing performance degradation by ablation type

### C3. Parallel Match Execution

**Problem:** Tournament matches run strictly sequentially. A 30-match tournament takes 1-2.5 hours. Iteration speed is the bottleneck for running experiments.

**Solution:**
- Configurable `concurrency` parameter on tournaments (default 1, max 3-5)
- Concurrency pool using Promise.all with a semaphore
- Coordinate with rate-limit backoff so parallel matches share provider awareness
- Show parallel match progress in tournament UI
- Add configurable `delayBetweenMatchesMs` for rate limit management

### C4. Rate Limit Handling

**Problem:** No rate-limit awareness. Provider throttling surfaces as cryptic timeouts or failed matches.

**Solution:**
- Exponential backoff with jitter in the AI call layer
- Parse rate-limit headers (429 responses, `Retry-After`) from each provider
- Surface rate-limit events in tournament progress UI
- Share rate-limit state across parallel matches
- Configurable inter-match delay

---

## Phase D: The Evolutionary Engine

*Build toward autonomous strategy evolution — the platform's long-term vision.*

### D1. Modular Strategy Genomes

**Problem:** Treating strategy prompts as monolithic strings makes crossover nearly meaningless — splicing two paragraphs of English together rarely produces a coherent strategy.

**Solution:**
- Decompose genomes into typed, composable modules:
  - **Clue Philosophy**: approach to generating associations (semantic, phonetic, categorical, etc.)
  - **Opponent Modeling**: how to reason about what opponents know
  - **Risk Tolerance**: balance between miscommunication avoidance and interception resistance
  - **Memory Policy**: what to prioritize in scratch notes
- Crossover operates at the module level — swap one strategy's clue philosophy with another's risk tolerance
- Each module has a defined interface so combinations are always syntactically valid
- Store genomes as structured JSON, not raw text

### D2. Evolutionary Selection & Fitness

**Problem:** No mechanism for strategies to compete, reproduce, and evolve across generations.

**Solution:**
- Population manager handling strategy populations per provider
- Relative fitness (Elo-like): score depends on win rate weighted by opponent strength, not absolute win rate
- Selection: top-performing strategies survive and reproduce
- Crossover: module-level recombination of parent strategies
- Mutation: random modifications to individual modules (via AI-assisted rewriting)
- Frequency-dependent matchmaking: rare strategies get more matches, maintaining diversity
- Generation runner executing round-robin within each generation
- Configurable population size, generation count, mutation rate

### D3. Phase Transition Detection & Ecosystem Monitoring

**Problem:** Without monitoring, you can't tell when something interesting happens in an evolutionary run.

**Solution:**
- Define order parameters: clue entropy, interception rate variance, strategic similarity clustering
- Continuously monitor and algorithmically detect phase transitions — moments where the ecosystem abruptly reorganizes
- Trigger alerts and snapshot full population state at phase transitions
- Lineage tree visualization showing strategy ancestry, splits, and extinctions
- Dashboard showing population dynamics, strategy drift, fitness curves, and dominant lineage history

---

## Build Order & Dependencies

```
Phase A: Data Foundation (build first — everything depends on this)
├── A1: Parse Quality Tracking
├── A2: Token/Cost Logging
├── A3: Seed-Based Keywords
├── A4: Game State Validation
└── A5: CSV Data Export

Phase B: Reasoning Layer (build second — the differentiator)
├── B1: Reasoning Trace Viewer (depends on A1, A2)
├── B2: Strategy Timeline (no blockers)
└── B3: Cost Estimation Guards (depends on A2)

Phase C: Experiment Toolkit (build third — enables research)
├── C1: ToM Depth Analyzer (depends on B2)
├── C2: Ablation Experiment Mode (depends on A3)
├── C3: Parallel Match Execution (depends on C4)
└── C4: Rate Limit Handling (depends on A2)

Phase D: Evolutionary Engine (build fourth — the vision)
├── D1: Modular Strategy Genomes (depends on C1, C2 for evaluation)
├── D2: Evolutionary Selection (depends on D1, C3)
└── D3: Phase Transition Detection (depends on D2)
```

---

## What We're Deliberately Deferring

These ideas are exciting but premature:

- **Live thought bubbles / spectator mode** — needs streaming architecture and reliable WebSocket infrastructure
- **AI commentator** — valuable but depends on having trustworthy data to comment on
- **Diplomacy layer** — architecturally incompatible with Decrypto's stateless AI calls
- **Adversarial rule mutation** — requires rewriting the game engine as a rules interpreter
- **Cross-game transfer** — requires building adapters for multiple games
- **Infinite public tournament** — needs a cost/business model solution first
- **Turing Arena** — needs systematic human baseline data collection first

These are the reason to keep building — but they're not what to build next.
