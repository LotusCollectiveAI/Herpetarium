# Decrypto - Multiplayer Word Game

## Overview

Decrypto is a real-time multiplayer word deduction game inspired by the classic board game. It allows players to compete against friends or advanced AI opponents (ChatGPT, Claude, Gemini). The project's vision is to create a dynamic online platform for strategic wordplay, enhancing the original game with digital features and sophisticated AI interactions. It aims to offer engaging gameplay, advanced AI opponent capabilities, and robust analytical tools for understanding AI performance and game dynamics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: React Context for game state, TanStack Query for server state
- **UI Components**: shadcn/ui built on Radix UI, styled with Tailwind CSS (light/dark mode)
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express and TypeScript (ESM)
- **Real-time Communication**: WebSockets (`ws` library) for game state synchronization
- **API Style**: REST for game creation and management, WebSockets for live gameplay

### Data Management
- **Database**: PostgreSQL with Drizzle ORM (via `@neondatabase/serverless`)
- **Schema & Migrations**: Defined in `shared/schema.ts`, managed with Drizzle Kit
- **In-Memory State**: Active game sessions stored in memory
- **Persistence**: Completed matches, round details, and AI call logs are persisted to PostgreSQL
- **Series System**: Allows AI agents to play multiple games, carrying strategic notes between them, stored in `series` and `scratch_notes` tables.

### AI Integration
- **Providers**: Supports OpenAI (ChatGPT), Anthropic (Claude), and Google (Gemini) with configurable models.
- **AI Player Configuration**: Each AI player has a `AIPlayerConfig` defining provider, model, timeout, temperature, and prompt strategy.
- **Reasoning Models**: Support for models with explicit reasoning capabilities (e.g., OpenAI o-series, Claude extended thinking, Gemini thinking models), with reasoning traces captured and stored.
- **Prompt Strategies**: Named presets (`"default"`, `"advanced"`) for varying AI complexity, including chain-of-thought.
- **Call Logging**: Every AI call is logged to `ai_call_logs`, capturing prompt, response, latency, token counts, estimated cost, and parse quality.
- **Series Integration**: AI generates and refines strategic notes between games in a series, injecting them into subsequent prompts.

### Game Mechanics
- **Game State Management**: REST API creates games, WebSockets manage real-time updates and player connections via 4-character codes.
- **Headless Mode**: A `headlessRunner` allows AI-vs-AI games without UI, used for tournaments and evaluations.
- **Input Validation**: Frontend and server-side validation for clues, including single-word, no blanks, and keyword exclusion.

### Evaluation & Analytics
- **Metrics**: `server/metrics.ts` computes various performance metrics (per-model, per-strategy, win rates, cost, parse quality).
- **Eval Dashboard**: A dedicated dashboard (`/eval`) displays metrics, team composition analysis, A/B test results, and clue analysis.
- **Reproducibility**: Headless matches use a deterministic PRNG seeded per match for reproducibility.
- **Cost Estimation**: API endpoint and UI display pre-launch cost estimates for series and tournaments based on AI model usage, with per-call-type breakdown (clue/guess/intercept/reflection) and ~6 rounds assumption.
- **Budget Caps**: Tournaments and series support optional `budgetCapUsd` fields. Runtime guards check cumulative cost before each match/game and stop execution if the cap is exceeded (`budget_exceeded` status).
- **Actual Cost Tracking**: `actualCostUsd` is tracked and updated during tournament/series execution, displayed alongside budget caps in the UI.
- **Reasoning Trace Indicators**: Match list shows trace badges for matches with AI reasoning traces without needing to expand. Expanded AI call logs show per-call outcome linkage (correct/wrong/intercepted).

### UX Enhancements
- **Visual Feedback**: Phase announcements, animated token awards, AI thinking indicators with provider-specific styling.
- **Mobile Support**: Tabbed interface for interception on smaller screens.
- **Resilience**: Client auto-reconnects with exponential backoff; server cleans up ghost players.

## External Dependencies

### AI Services
- **OpenAI API**: For ChatGPT models.
- **Anthropic API**: For Claude models.
- **Google Generative AI**: For Gemini models.

### Database
- **PostgreSQL**: Primary data store.

### Key NPM Packages
- `drizzle-orm`, `drizzle-kit`: ORM and migrations.
- `ws`: WebSocket server.
- `zod`: Runtime type validation.
- `wouter`: Client-side routing.
- `@tanstack/react-query`: Server state management.
- `shadcn/ui`, `Radix UI`: UI component libraries.