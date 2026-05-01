# Solo D&D 5e Companion App

A full-stack solo D&D 5e companion app with an AI Dungeon Master powered by Anthropic Claude. Players can create campaigns, build characters, explore the world through narrative chat, roll dice, track quests, and manage inventory — all in an immersive dark fantasy interface.

## Architecture

**Monorepo** managed with pnpm workspaces.

### Artifacts
- `artifacts/dnd-companion` — React + Vite frontend at `/` (port 20660)
- `artifacts/api-server` — Express + Node.js backend API at `/api` (port 8080)

### Shared Libraries
- `lib/api-spec` — OpenAPI 3.1 spec (`openapi.yaml`) + Orval codegen config
- `lib/api-client-react` — Generated React Query hooks from spec
- `lib/api-zod` — Generated Zod validation schemas from spec
- `lib/db` — Drizzle ORM schema + PostgreSQL client (`@workspace/db`)
- `lib/integrations-anthropic-ai` — Anthropic Claude client via Replit AI Integrations

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS v4, shadcn/ui, wouter, TanStack Query
- **Backend**: Express.js, Node.js, TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: Anthropic Claude (claude-sonnet-4-6) via Replit AI Integrations proxy
- **Code generation**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)

## Key Features

1. **Campaign Hub** (`/`) — List, load, and delete campaigns with last-played info
2. **Character Creation Wizard** (`/campaign/new`) — 5-step wizard: basics → race → class → ability scores (point buy or roll) → confirm
3. **Game View** (`/campaign/:id`) — Three-panel desktop layout:
   - **Left**: Character sheet (HP adjuster, stats, spell slots, conditions, XP bar, gold)
   - **Center**: AI DM chat with SSE streaming, dice roll entries, typing indicator
   - **Right**: Quest log + Inventory tabs
4. **Dice Rolling** — d4/d6/d8/d10/d12/d20/d100 tray, dice results attach to next message
5. **AI DM** — Claude with full system prompt tracking HP, XP, quests, inventory via structured `<STATE_UPDATE>` parsing
6. **Auto-save** — Campaign state updated automatically on each AI response

## Database Schema

Tables: `campaigns`, `characters`, `chat_messages`, `quests`, `inventory_items`

## API Routes

All routes prefixed with `/api`:
- `GET/POST /campaigns` — List / create campaigns
- `GET/PUT/DELETE /campaigns/:id` — Campaign CRUD
- `POST /campaigns/:id/save` — Manual save with character updates
- `GET /campaigns/:campaignId/messages` — Chat history
- `POST /campaigns/:campaignId/chat` — AI DM chat (SSE streaming)
- `GET/PUT /campaigns/:campaignId/character` — Character management
- `POST /campaigns/:campaignId/character/portrait` — Claude portrait description
- `GET/POST /campaigns/:campaignId/quests` — Quest log
- `PUT /campaigns/:campaignId/quests/:questId` — Update quest
- `GET/POST /campaigns/:campaignId/inventory` — Inventory
- `PUT/DELETE /campaigns/:campaignId/inventory/:itemId` — Item management
- `POST /roll` — Dice rolling (supports XdY+Z, keep highest/lowest)

## Design

- **Always dark** — Deep slate blacks, warm amber/gold primary accent
- **Fonts**: Crimson Text (serif, narrative text), Inter (UI)
- **Aesthetic**: Aged grimoire / forbidden tome feel

## Development

```bash
# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/dnd-companion run dev

# Push DB schema changes
pnpm --filter @workspace/db run push

# Regenerate API client from spec
pnpm --filter @workspace/api-spec run codegen

# Typecheck everything
pnpm run typecheck
```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Replit AI Integrations proxy URL
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Replit AI Integrations API key
- `SESSION_SECRET` — Session secret (reserved)
