# Database Schema & Migrations

## PostgreSQL Setup

### Version
PostgreSQL 15+

### Initial Connection

```bash
DATABASE_URL=postgresql://to_our_self:password@localhost:5432/to_our_self_db
```

## Core Tables

### Users & Authentication

#### `users`
Core user identity linked to Telegram.

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username VARCHAR(255) UNIQUE,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  is_bot BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE,
  avatar_url VARCHAR(1024),
  banned_at TIMESTAMP,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_created_at ON users(created_at DESC);
```

#### `user_sessions`
JWT and refresh token tracking.

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jwt_token TEXT NOT NULL,
  refresh_token TEXT UNIQUE,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at);
```

### Profiles & Social

#### `profiles`
Public user profile data.

```sql
CREATE TABLE profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(255) NOT NULL,
  bio TEXT,
  avatar_url VARCHAR(1024),
  level INTEGER DEFAULT 1,
  xp BIGINT DEFAULT 0,
  reputation INTEGER DEFAULT 0,
  total_wins BIGINT DEFAULT 0,
  total_losses BIGINT DEFAULT 0,
  favorite_games TEXT[] DEFAULT '{}',
  frame_id UUID,
  banner_id UUID,
  clan_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_level ON profiles(level DESC);
CREATE INDEX idx_profiles_xp ON profiles(xp DESC);
CREATE INDEX idx_profiles_clan_id ON profiles(clan_id);
```

### Groups

#### `groups`
Telegram groups using the bot.

```sql
CREATE TABLE groups (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id BIGINT NOT NULL REFERENCES users(id),
  is_forum BOOLEAN DEFAULT FALSE,
  enabled_games TEXT[] DEFAULT '{}',
  min_players INTEGER DEFAULT 2,
  max_players INTEGER DEFAULT 10,
  entry_fee_coins BIGINT DEFAULT 0,
  allow_ai BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groups_telegram_id ON groups(telegram_id);
CREATE INDEX idx_groups_owner_id ON groups(owner_id);
```

#### `group_members`
Group membership with roles.

```sql
CREATE TABLE group_members (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- owner, admin, game_manager, moderator, member
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
```

### Games

#### `games`
Game definitions.

```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  min_players INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  ai_enabled BOOLEAN DEFAULT FALSE,
  icon_url VARCHAR(1024),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### `game_sessions`
Active game instances.

```sql
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id),
  group_id BIGINT REFERENCES groups(id),
  creator_id BIGINT NOT NULL REFERENCES users(id),
  status VARCHAR(50) NOT NULL DEFAULT 'waiting',
  game_version VARCHAR(50) NOT NULL,
  round_seed BIGINT,
  round_number INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  winner_ids BIGINT[] DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_sessions_status ON game_sessions(status);
CREATE INDEX idx_game_sessions_game_id ON game_sessions(game_id);
CREATE INDEX idx_game_sessions_creator_id ON game_sessions(creator_id);
```

#### `game_players`
Player participation in session.

```sql
CREATE TABLE game_players (
  id BIGSERIAL PRIMARY KEY,
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  is_ai BOOLEAN DEFAULT FALSE,
  ai_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'waiting',
  position INTEGER,
  score BIGINT DEFAULT 0,
  eliminated_at TIMESTAMP,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(game_session_id, user_id)
);

CREATE INDEX idx_game_players_session_id ON game_players(game_session_id);
CREATE INDEX idx_game_players_user_id ON game_players(user_id);
```

#### `game_actions`
Player actions (server-verified).

```sql
CREATE TABLE game_actions (
  id BIGSERIAL PRIMARY KEY,
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  round_number INTEGER NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  result JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_actions_session_id ON game_actions(game_session_id);
CREATE INDEX idx_game_actions_user_id ON game_actions(user_id);
CREATE INDEX idx_game_actions_processed ON game_actions(processed);
```

#### `game_events`
Immutable event log.

```sql
CREATE TABLE game_events (
  id BIGSERIAL PRIMARY KEY,
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_events_session_id ON game_events(game_session_id);
CREATE INDEX idx_game_events_created_at ON game_events(created_at DESC);
```

### Economy

#### `wallets`
User balance (derived from ledger, NOT source of truth).

```sql
CREATE TABLE wallets (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coins BIGINT DEFAULT 0,
  gems BIGINT DEFAULT 0,
  rating BIGINT DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### `wallet_transactions`
Immutable ledger (SOURCE OF TRUTH).

```sql
CREATE TABLE wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  currency VARCHAR(50) DEFAULT 'coins',
  type VARCHAR(100) NOT NULL,
  reference_type VARCHAR(100),
  reference_id VARCHAR(255),
  metadata JSONB,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(type);
CREATE INDEX idx_wallet_transactions_reference ON wallet_transactions(reference_type, reference_id);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);
```

### Progression

#### `missions`
Daily/weekly/season tasks.

```sql
CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  mission_type VARCHAR(50) NOT NULL,
  period VARCHAR(50) NOT NULL,
  condition_type VARCHAR(100) NOT NULL,
  condition_target BIGINT,
  reward_xp BIGINT DEFAULT 0,
  reward_coins BIGINT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### `player_missions`
Completion status.

```sql
CREATE TABLE player_missions (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES missions(id),
  progress BIGINT DEFAULT 0,
  completed_at TIMESTAMP,
  reward_claimed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mission_id)
);

CREATE INDEX idx_player_missions_user_id ON player_missions(user_id);
```

#### `achievements`
Achievements library.

```sql
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon_url VARCHAR(1024),
  is_hidden BOOLEAN DEFAULT FALSE,
  rarity VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### `player_achievements`
Progress and unlock timestamp.

```sql
CREATE TABLE player_achievements (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id),
  unlocked_at TIMESTAMP,
  progress JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX idx_player_achievements_user_id ON player_achievements(user_id);
CREATE INDEX idx_player_achievements_unlocked_at ON player_achievements(unlocked_at DESC);
```

### Leaderboards

#### `leaderboards`
Cached snapshots.

```sql
CREATE TABLE leaderboards (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  leaderboard_type VARCHAR(50) NOT NULL,
  entries JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(name, leaderboard_type)
);
```

### Admin & Logging

#### `audit_logs`
Every sensitive operation.

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  changes JSONB,
  ip_address INET,
  result VARCHAR(50),
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

#### `feature_flags`
Feature toggles.

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## Constraints & Indexes Strategy

### Primary Keys
- All tables have explicit primary keys (BIGSERIAL or UUID)

### Foreign Keys
- All relationships use ON DELETE CASCADE for cleanup
- No orphaned records possible

### Unique Constraints
- `users(telegram_id)`: One user per Telegram account
- `profiles(user_id)`: One profile per user
- `group_members(group_id, user_id)`: No duplicate memberships
- `game_players(game_session_id, user_id)`: No duplicate player in session
- `wallet_transactions(idempotency_key)`: Prevents duplicate transactions

### Indexes
- All foreign keys indexed
- All WHERE clauses indexed (status, created_at, type)
- Leaderboard queries indexed (level, xp, wins)

---

## Migration Strategy

### Migration Tool
Use `pg-migrate` or `Flyway` for version control.

Example structure:
```
migrations/
├── 001-initial-schema.sql
├── 002-add-audit-logs.sql
├── 003-add-economy-ledger.sql
└── 004-add-leaderboards.sql
```

### Running Migrations
```bash
pnpm db:migrate up
```

### Rollback
```bash
pnpm db:migrate down 1
```

---

## Backup & Recovery

### Daily Backup
```bash
pg_dump -U to_our_self to_our_self_db | gzip > backup-$(date +%Y%m%d).sql.gz
```

### Restore
```bash
gunzip -c backup-20260908.sql.gz | psql -U to_our_self to_our_self_db
```
