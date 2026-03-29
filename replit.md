# Decrypto - Multiplayer Word Game

## Overview

Decrypto is a real-time multiplayer word deduction game where teams compete to decode secret messages while intercepting opponents' communications. Players can compete with friends or AI opponents powered by ChatGPT, Claude, and Gemini. The game follows the classic Decrypto board game rules with digital enhancements for online play.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: React Context for game state, TanStack Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Build Tool**: Vite with HMR support

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **Real-time Communication**: WebSocket (ws library) for game state synchronization
- **API Style**: REST endpoints for game creation, WebSocket for gameplay

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM (via @neondatabase/serverless driver)
- **Schema Location**: `shared/schema.ts` for shared types and database tables, `shared/models/` for legacy user model
- **DB Connection**: `server/db.ts` - Drizzle connection setup
- **Migrations**: Drizzle Kit (`drizzle-kit push` for schema sync)
- **In-Memory State**: Game sessions stored in memory Map for real-time gameplay
- **Match Persistence**: Completed games persisted to PostgreSQL with round-by-round detail and AI call logs

### Game State Management
- Games are created via REST API and stored in memory
- WebSocket connections manage real-time game state updates
- Players connect to games using 4-character game codes
- State broadcasts to all connected clients on changes

### AI Integration
- Multiple AI providers supported: OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini)
- AI players carry a full `AIPlayerConfig`: provider, model, timeout_ms, temperature, prompt_strategy
- **Model Selection**: Per-player model choice (e.g. gpt-4o, o3, claude-sonnet-4-20250514, gemini-2.5-pro)
- **Reasoning Model Support**: OpenAI o-series (reasoning_effort, no temperature), Claude extended thinking (budget_tokens), Gemini thinking models (thinkingConfig)
- **Prompt Strategies**: Named presets ("default", "advanced") stored in `server/promptStrategies.ts`. Advanced uses chain-of-thought, theory-of-mind, full history analysis
- **Configurable Timeouts**: Per-player timeout (default 120s, max 300s). UI shows real-time elapsed time while AI thinks
- **Reasoning Traces**: When models return chain-of-thought/thinking tokens, these are captured in server logs
- Lazy initialization of AI clients to avoid startup crashes
- AI failures broadcast "ai_fallback" messages to all clients for UI feedback
- Every AI call is logged to `ai_call_logs` table with: provider, model, prompt, raw response, parsed result, latency, timeout/error status, parse quality (valid/partial/fallback/error), prompt/completion/total token counts

### Persistent Scratch Notes & Series
- **Series System**: Agents play multiple games in sequence, carrying strategic notes forward between games
- **Database Tables**: `series` (id, name, config, total_games, completed_games, status, note_token_budget), `scratch_notes` (id, series_id, player_config_hash, game_index, notes_text, token_count, match_id)
- **Post-Game Reflection**: After each game in a series, an AI call generates updated strategic notes based on game results and prior notes
- **Notes Injection**: Scratch notes are injected into clue, guess, and interception prompts as additional strategic context
- **Series Runner** (`server/seriesRunner.ts`): Executes N games sequentially with note propagation between games
- **API Endpoints**: POST `/api/series` (create and run), GET `/api/series` (list), GET `/api/series/:id` (detail with note evolution)
- **UI**: `/series` page with series creation form, list view, detail view with notes evolution timeline and token growth visualization

### Data Foundation (Phase A)
- **Parse Quality Tracking**: Every AI response is tagged as `valid`, `partial`, `fallback`, or `error` — no more silent data corruption
- **Token/Cost Logging**: `promptTokens`, `completionTokens`, `totalTokens` extracted from all providers (OpenAI usage, Anthropic input/output tokens, Gemini usageMetadata)
- **Seed-based Reproducibility**: Headless matches use deterministic PRNG (xorshift32) seeded per match. Seed stored in `matches.gameSeed` column. Replay identical keyword/code sequences by reusing a seed
- **Game State Validation**: `validateGameState()` checks invariants (token counts, team membership, winner/phase consistency, duplicate IDs) and logs warnings during headless matches

### Match Persistence
- **Database Tables**: `matches` (incl. `gameSeed`), `match_rounds`, `ai_call_logs` (incl. `parseQuality`, `promptTokens`, `completionTokens`, `totalTokens`), `experiments`, `tournaments`, `tournament_matches`
- Match record created when teams are confirmed (before first round)
- Round results persisted after each round completes (with dedup guard)
- Game completion updates match with winner and final token counts
- **API Endpoints**: GET `/api/matches` (paginated, filterable), GET `/api/matches/:id` (full detail with rounds and AI logs)
- **UI**: `/history` page shows past games with expandable round details and AI call logs

### Headless Game Runner & Tournament Mode
- **Headless Runner** (`server/headlessRunner.ts`): Runs complete AI-vs-AI games without WebSocket or browser. Takes a match config (player names, AI providers, team assignments) and executes all phases automatically.
- **Tournament System** (`server/tournament.ts`): Creates and runs tournaments with multiple match configurations. Matches run sequentially to manage API rate limits.
- **Auto-advance**: When all players in a WebSocket game are AI, the server automatically advances from round_results to the next round (1s delay).
- **API Endpoints**: POST `/api/matches/run` (queue headless match), POST `/api/matches/run/sync` (run and wait for result), POST `/api/tournaments` (create and start tournament), GET `/api/tournaments` (list all), GET `/api/tournaments/:id` (detail with stats)
- **UI**: `/tournaments` page with tournament creation form, leaderboard with model win rates, per-match results, and live refresh for running tournaments

### Eval Harness & A/B Testing
- **Metrics Module**: `server/metrics.ts` computes per-model, per-strategy, per-matchup, team composition, and self-play metrics
- **Eval Dashboard**: `/eval` page with tabs for Overview (charts, tables, filters), Team Composition (mixed vs homogeneous win rates, synergy scores, self-play variance), A/B Tests (experiments), Clue Analysis (with cross-model communication flags), and Data Export
- **Team Composition Analytics**: Mixed vs homogeneous team win rates, per-pair synergy scores, interception vulnerability by composition type
- **Self-Play Analytics**: Outcome variance, game length distribution, amber vs blue win balance for same-model matchups
- **Cross-Model Communication Analysis**: Clue analysis view flags cross-architecture clues, shows whether cross-model interpretation succeeded or failed
- **Tournament Presets**: Quick preset buttons on tournament creation: Cross-Model Round Robin, Self-Play Series, Provider Showdown, Full Matrix — each auto-fills matchups for one-click launch
- **A/B Testing**: Experiments system to compare prompt strategies. POST `/api/experiments`, GET `/api/experiments`, GET `/api/experiments/:id`
- **Clue Analysis**: GET `/api/matches/:id/analysis` maps each clue to its target keyword, highlights "too obvious" (intercepted) vs "too obscure" (miscommunicated) clues, includes cross-model analysis data
- **Data Export**: GET `/api/export/matches` and `/api/export/ai-logs` endpoints supporting JSON and CSV formats. Export buttons on both History and Eval Dashboard pages

### Input Validation
- Frontend clue validation: single-word only, no blanks, no keywords or root words
- Server-side clue validation mirrors frontend rules; rejects invalid clues with "clue_error" message
- Stem-matching prevents submitting word variants of keywords

### UX Polish
- Phase transition announcements: `PhaseAnnouncement` overlay component shows briefly when game phase changes
- Round results: animated token awards with delayed reveal, summary text per team
- AI thinking indicators: `AIThinkingIndicator` component with provider-specific styling (ChatGPT green, Claude orange, Gemini blue) and animated dots
- Mobile interception layout: tabbed interface (Clues/History/Guess) on screens < 640px
- Play again: host can create new game with same players from game over screen via `new_game_same_players` WebSocket message
- Toast notifications for phase transitions and key game events

### WebSocket Resilience
- Client auto-reconnects on unexpected close with exponential backoff (1s, 2s, 4s, max 3 attempts)
- Re-sends join message with stored playerId on reconnect
- Ghost player cleanup: server closes old WebSocket connections when a player reconnects with the same playerId

### Vision & Research Documents
- `docs/PRODUCT_VISION.md` - Mission statement, abstraction ladder concept, core principles
- `docs/MODES_OF_PLAY_ROADMAP.md` - Future capabilities roadmap (5 phases: cross-model teams → evolutionary tournaments)
- `docs/FUTURE_VIGNETTES.md` - Four narrative vignettes from advanced versions of the product
- `docs/ARCHITECTURE_PROGRESSION.md` - Visual progression diagrams, capability matrix, Karpathy Auto Research parallels

### Project Structure
```
client/           # React frontend
  src/
    components/   # UI components (game-specific and shadcn/ui)
                  # DeductionNotes.tsx - Collapsible notes panel for tracking opponent keywords (localStorage)
                  # RoundHistory.tsx - Supports both list and columnar view (columnar=true for interception)
    pages/        # Route pages (Home, Game, History, Tournaments, EvalDashboard, Series)
    lib/          # Utilities, context providers, query client
    hooks/        # Custom React hooks
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route registration (games, matches, tournaments, eval metrics, experiments, export, series)
  metrics.ts      # Metrics computation module (model, strategy, matchup, clue analysis)
  websocket.ts    # WebSocket handler for game logic + match persistence + auto-advance
  game.ts         # Game state management functions
  ai.ts           # AI provider integrations (configurable models, reasoning support, trace capture) with call logging
  headlessRunner.ts # Headless game runner for all-AI games
  tournament.ts   # Tournament creation and execution
  seriesRunner.ts # Series execution with scratch note propagation between games
  db.ts           # Database connection setup
  storage.ts      # Storage interface with match/round/AI log CRUD
  promptStrategies.ts # Named prompt strategy presets (default, advanced)
shared/           # Shared code between client and server
  schema.ts       # Zod schemas and TypeScript types
  models/         # Drizzle database models
```

## External Dependencies

### AI Services
- **OpenAI API**: ChatGPT for AI players (via `@anthropic-ai/sdk` proxy or direct)
- **Anthropic API**: Claude for AI players
- **Google Generative AI**: Gemini for AI players
- Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_GEMINI_API_KEY`

### Database
- **PostgreSQL**: Primary database
- Environment variable: `DATABASE_URL`
- Session storage: `connect-pg-simple` for Express sessions

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `ws`: WebSocket server
- `zod`: Runtime type validation
- `wouter`: Client-side routing
- `@tanstack/react-query`: Server state management
- Full shadcn/ui component suite via Radix UI primitives