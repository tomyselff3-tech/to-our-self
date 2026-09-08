# System Architecture

## Overview

**to-our-self** is a production-grade Telegram Mini App gaming platform supporting multiplayer games with real-time interactions, economy systems, progression, tournaments, and social features.

### Core Principles

1. **Server-Authoritative**: All game state, results, rewards, and payments are determined server-side
2. **Scalable by Design**: Supports horizontal scaling via Redis, message queues, and stateless API instances
3. **Secure**: Telegram authentication verified server-side, RBAC, audit logs, rate limiting
4. **Modular**: Game engine supports pluggable game modules, economy is ledger-based, auth is abstracted
5. **Resilient**: No in-memory state as single source of truth, reconnection support, idempotent operations

---

## Monorepo Structure

```
apps/
├── api/                 # Main backend (Fastify)
├── bot/                 # Telegram bot service
├── miniapp/             # React frontend + Vite
└── admin/               # Admin dashboard (React)

packages/
├── database/            # PostgreSQL schema + migrations + queries
├── shared/              # TypeScript types, constants, utilities
├── auth/                # Telegram auth, JWT, RBAC
├── telegram/            # Telegram API integration
├── game-engine/         # Core game state machine + module system
└── economy/             # Wallet, transactions, ledger
```

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Language** | TypeScript (strict) | Type safety, refactoring safety |
| **Backend** | Fastify + Node.js 20 | Lightweight, WebSocket-ready, high performance |
| **Database** | PostgreSQL 15+ | ACID, constraints, migrations, proper schema design |
| **Realtime** | WebSockets + Redis Pub/Sub | Scalable, decoupled realtime events |
| **Cache/Queue** | Redis | Session cache, game locks, rate limiting, queues |
| **Frontend** | React 18 + Vite | Fast HMR, modern tooling, mobile-friendly |
| **Package Manager** | pnpm | Workspace support, faster installs |
| **Testing** | Vitest + Playwright | Fast unit/integration, E2E capability |
| **Deploy** | Docker + Docker Compose | Reproducible environments |

---

## API Layer

### Authentication Flow

```
Client sends Telegram initData
    ↓
API validates initData signature (server-side, not initDataUnsafe)
    ↓
API verifies auth_date freshness (max 5 min old)
    ↓
API creates/updates User in database
    ↓
API issues JWT with user_id + permissions
    ↓
Client stores JWT in localStorage
    ↓
All subsequent requests use Authorization: Bearer <JWT>
```

### RBAC (Role-Based Access Control)

- **Roles**: Admin, Moderator, User, Guest
- **Permissions**: Verified at endpoint level + resource level
- **Audit**: All sensitive operations logged with user, action, timestamp, result

---

## Database Schema

### User & Profile Management
- `users`: Core identity, Telegram ID, created_at
- `profiles`: Displayable user data (username, avatar, bio, level, XP, etc.)
- `user_sessions`: JWT sessions, expiry, IP

### Groups & Social
- `groups`: Telegram groups using the bot
- `group_members`: Membership with roles
- `clans`: Player clans, XP, leaderboard
- `clan_members`: Clan membership with roles

### Games
- `games`: Game definitions (roulette, mafia, dice, etc.)
- `game_sessions`: Active game instances
- `game_players`: Player participation in session
- `game_rounds`: Individual rounds within a game
- `game_actions`: Player actions (server-verified)
- `game_events`: Immutable event log

### Economy
- `wallets`: User balance (coins, gems, rating) — NOT the source of truth
- `wallet_transactions`: Immutable ledger of all money movements
  - Types: GAME_ENTRY, GAME_REWARD, PURCHASE, REFUND, MISSION_REWARD, etc.
  - Every transaction is atomic, idempotent, prevents double-spend

### Progression
- `missions`: Daily/weekly/season tasks
- `player_missions`: Completion status
- `achievements`: Player achievements
- `player_achievements`: Progress + unlock timestamp
- `leaderboards`: Cached snapshots (XP, wins, clan rank, seasonal)

### Items & Store
- `items`: Digital cosmetics (skins, frames, banners, titles, emotes)
- `inventory`: Player owns item, purchase date, expiry
- `store_listings`: Active store promotions
- `purchases`: Purchase history with refund support

### Payments
- `payments`: Telegram Stars transactions
- `purchase_orders`: Purchase order tracking

### Admin & Logging
- `audit_logs`: Every sensitive operation
- `feature_flags`: Feature toggles
- `admin_actions`: Moderator/admin actions with justification

---

## Game Engine Architecture

### GameModule Interface

Each game implements:

```typescript
interface GameModule {
  gameType: string;
  minPlayers: number;
  maxPlayers: number;
  
  createSession(params: CreateSessionParams): Promise<GameSession>;
  join(sessionId: string, player: Player): Promise<void>;
  start(sessionId: string): Promise<void>;
  handleAction(sessionId: string, action: PlayerAction): Promise<void>;
  resolveRound(sessionId: string): Promise<RoundResult>;
  finish(sessionId: string): Promise<GameResult>;
  calculateRewards(result: GameResult): RewardMap;
}
```

### State Machine

All games follow:
```
Waiting → Starting → Active → Resolving → Result → [Next Round] → Finished
```

- **Waiting**: Collecting players
- **Starting**: Pre-game setup (role assignment, etc.)
- **Active**: Gameplay in progress
- **Resolving**: Computing results
- **Result**: Showing round outcome
- **Finished**: Game complete, rewards distributed

### Key Features

- **Server-Authoritative**: Client sends actions, server computes results
- **Deterministic**: Results based on game_version + round_seed for reproducibility
- **Versioned**: game_version saved with session to handle deployments
- **Idempotent**: Duplicate actions are ignored after first processing
- **Resilient**: Session state in database, player can reconnect

---

## Realtime Architecture

### WebSocket Flow

```
Client connects → Server authenticates JWT
    ↓
Client joins game_session/{id}
    ↓
Server sends current GameSnapshot to client
    ↓
Client sends PlayerAction
    ↓
Server validates, broadcasts GameEvent to all players in session
    ↓
On disconnect: Server stores action intent, client re-joins with same token
```

### Event Types

- `GAME_STARTED`
- `PLAYER_JOINED`
- `ROUND_STARTED`
- `PLAYER_ACTION`
- `PLAYER_ELIMINATED`
- `ROUND_RESOLVED`
- `GAME_FINISHED`
- `ERROR`
- `RECONNECT_OK`

### Redis Pub/Sub

- Channel per game_session: `game:{session_id}`
- Backend instances subscribe, broadcast to connected clients
- Events are idempotent (client deduplicates by event_id)

---

## Economy System

### Wallet (NOT the source of truth)

`wallets` table shows current balance but is **derived** from transaction ledger.

```
balance = SUM(wallet_transactions.amount) WHERE user_id = X
```

### Transaction Ledger

Every money movement is atomic, immutable, idempotent:

```sql
INSERT INTO wallet_transactions (
  user_id, amount, type, reference_id, reference_type, 
  metadata, created_at, idempotency_key
) VALUES (...)
```

- `type`: GAME_ENTRY, GAME_REWARD, PURCHASE, REFUND, MISSION_REWARD, TRANSFER, ADMIN_ADJUSTMENT
- `reference_id`: Game session ID, purchase order ID, etc.
- `idempotency_key`: Prevents duplicate processing
- `metadata`: Game-specific data

### Protection Against Abuse

- **Double-spend**: Idempotency key ensures single processing
- **Negative balance**: Pre-check balance before GAME_ENTRY
- **Duplicate reward**: idempotency_key + reference_id uniqueness
- **Race conditions**: Database-level constraints + row locks during transaction

---

## Security Model

### Telegram Authentication

1. Client sends `initData` from Telegram Mini App
2. Server validates:
   - `hash` matches HMAC-SHA256(bot_token, data_check_string)
   - `auth_date` is within 5 minutes of now
   - Never trust `initDataUnsafe`
3. Extract user_id, first_name, username, is_bot, is_premium
4. Create/update User, issue JWT

### Request Validation

- All input validated with Zod/Joi schemas
- Rate limiting per endpoint + per user
- CORS restricted to Telegram Mini App domain
- Security headers (CSP, HSTS, X-Frame-Options)

### Authorization

- JWT verified on every request
- RBAC checked at resource level
- Admin actions require 2FA (future enhancement)

### Audit Trail

Every sensitive operation:
- user_id, action, timestamp, IP, result, error (if any)
- Used for fraud detection, compliance, debugging

---

## Deployment

### Local Development

```bash
pnpm install
docker compose up
pnpm db:migrate
pnpm dev
```

### Production

- Docker images per app (api, bot, miniapp)
- Environment-specific configs
- Database migrations via CI/CD
- Zero-downtime deployments (via load balancer + health checks)
- Monitoring: Prometheus metrics, structured logging

---

## Performance Targets

- API latency: <100ms p95
- WebSocket message latency: <50ms p95
- Database query: <10ms p95 (with proper indexing)
- Concurrent users: 1000+ (with horizontal scaling)

---

## Monitoring & Observability

- Structured JSON logging (bunyan/winston)
- Prometheus metrics (request rate, latency, errors)
- Error tracking (Sentry integration ready)
- Database slow query log
- Redis memory monitoring

---

## Development Roadmap

1. ✅ Monorepo foundation
2. ✅ PostgreSQL schema + migrations
3. ✅ Shared types + domain models
4. → Telegram auth + Mini App validation
5. → API foundation + RBAC
6. → Redis infrastructure
7. → WebSocket + realtime
8. → Core Game Engine
9. → Roulette game
10. → Economy system
11. → Profiles + progression
12. → Mafia game
13. → Dice, Chairs, Hide & Seek
14. → AI players
15. → Leaderboards, clans, tournaments
16. → Seasons
17. → Payments (Telegram Stars)
18. → Admin dashboard
19. → Testing + hardening
20. → Production deployment
