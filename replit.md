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
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` for shared types, `shared/models/` for database tables
- **Migrations**: Drizzle Kit (`drizzle-kit push` for schema sync)
- **In-Memory State**: Game sessions stored in memory Map for real-time gameplay

### Game State Management
- Games are created via REST API and stored in memory
- WebSocket connections manage real-time game state updates
- Players connect to games using 4-character game codes
- State broadcasts to all connected clients on changes

### AI Integration
- Multiple AI providers supported: OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini)
- AI players can generate clues, make guesses, and attempt interceptions
- Lazy initialization of AI clients to avoid startup crashes

### Project Structure
```
client/           # React frontend
  src/
    components/   # UI components (game-specific and shadcn/ui)
    pages/        # Route pages (Home, Game)
    lib/          # Utilities, context providers, query client
    hooks/        # Custom React hooks
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route registration
  websocket.ts    # WebSocket handler for game logic
  game.ts         # Game state management functions
  ai.ts           # AI provider integrations
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