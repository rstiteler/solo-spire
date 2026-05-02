# Solo D&D 5e Companion App — Solo Spire

A full-stack solo D&D 5e companion app with an AI Dungeon Master powered by Anthropic Claude. Players create accounts, manage campaigns, build characters, explore the world through narrative chat, roll dice, track quests, and manage inventory — all in an immersive dark fantasy interface.

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
- **Auth**: Clerk (Replit-managed, provisioned) — `@clerk/react` (frontend) + `@clerk/express` (backend)
- **AI**: Anthropic Claude (claude-sonnet-4-6) via Replit AI Integrations proxy
- **Code generation**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)

## Key Features

1. **Landing Page** (`/`) — Public marketing page for signed-out users; auto-redirects signed-in users to `/campaigns`
2. **Auth** — Clerk-powered sign-in/sign-up at `/sign-in` and `/sign-up` with custom dark fantasy theme
3. **Campaign Hub** (`/campaigns`) — Per-user campaign list with last-played info; protected route
4. **Character Creation Wizard** (`/campaign/new`) — 6-step wizard: basics → race → class+skills → equipment&spells → ability scores → confirm
   - Step 3: Class grid + skill proficiency selection (class-specific, pick N from list), saving throw info
   - Step 4: Starting gear packages (2 options per class, armor auto-calculates starting AC) + spell/cantrip selection for spellcasting classes
   - Step 5: Ability scores (27-pt point buy or 4d6-drop-lowest roll)
   - All 12 classes supported with full data (hit die, saving throws, skill choices, gear packages, spells)
5. **Game View** (`/campaign/:id`) — Three-panel desktop layout:
   - **Left**: Character sheet (HP adjuster, stats, spell slots, conditions, XP bar, gold)
   - **Center**: AI DM chat with SSE streaming, dice roll entries, typing indicator
   - **Right**: Quest log + Inventory tabs
6. **Dice Rolling** — d4/d6/d8/d10/d12/d20/d100 tray
7. **AI DM** — Claude with full system prompt tracking HP, XP, quests, inventory via structured `<STATE_UPDATE>` parsing
8. **Auto-save** — Campaign state updated automatically on each AI response
9. **Multi-user** — Each user sees only their own campaigns; all routes enforce auth

## Database Schema

Tables: `campaigns` (with `user_id`), `characters`, `chat_messages`, `quests`, `inventory_items`

### inventory_items fields
- `item_properties` (jsonb) — mechanical stats: `{ armorType, acBase, stealthDisadvantage, strengthRequirement, damage, damageType, versatileDamage, weaponProperties }`
- Equipping armor auto-recalculates character AC server-side: light=acBase+DEX, medium=acBase+min(DEX,2), heavy=acBase, shield=+2

## API Routes

All routes prefixed with `/api` and protected by `requireAuth` middleware:
- `GET/POST /campaigns` — List / create campaigns (scoped to authenticated user)
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

## Auth Architecture

- **Backend proxy**: `clerkProxyMiddleware` at `/api/__clerk` forwards Clerk requests
- **Backend middleware**: `clerkMiddleware` from `@clerk/express` populates `req.auth`
- **Route protection**: `requireAuth` middleware extracts `userId` and attaches to `req.userId`
- **Frontend**: `ClerkProvider` with custom dark/amber appearance wrapping all routes
- **Session cookies**: Browser sends session cookies automatically; no manual token handling needed

## Design

- **Always dark** — Deep slate blacks, warm amber/gold primary accent (`hsl(35 90% 50%)`)
- **Fonts**: Crimson Text (serif, narrative text), Inter (UI)
- **Aesthetic**: Aged grimoire / forbidden tome feel
- **Clerk theme**: Custom shadcn base with dark fantasy colors + branded logo at `public/logo.svg`

## Development

```bash
# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/dnd-companion run dev

# Push DB schema changes
pnpm --filter @workspace/db run push

# Force push (accepts data loss)
pnpm --filter @workspace/db run push-force

# Regenerate API client from spec
pnpm --filter @workspace/api-spec run codegen

# Typecheck everything
pnpm run typecheck
```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Replit AI Integrations proxy URL
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Replit AI Integrations API key
- `CLERK_SECRET_KEY` — Clerk secret key (auto-provisioned by Replit)
- `CLERK_PUBLISHABLE_KEY` — Clerk publishable key (auto-provisioned)
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key for Vite frontend

## Deployment

Live at **https://solo-spire.replit.app** (autoscale). Development and production Clerk user stores are separate — accounts made in dev do not carry over to production.
