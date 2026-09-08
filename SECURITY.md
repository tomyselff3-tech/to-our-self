# Security Model & Guidelines

## Telegram Authentication

### Server-Side Validation (REQUIRED)

```typescript
import crypto from 'crypto';

function validateTelegramInitData(
  initData: string,
  botToken: string
): boolean {
  const parsed = new URLSearchParams(initData);
  const hash = parsed.get('hash');
  
  if (!hash) return false;
  
  // Remove hash from data
  parsed.delete('hash');
  
  // Create data check string
  const dataCheckString = Array.from(parsed.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  
  // Compute HMAC
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  return hash === expectedHash;
}

function extractUserFromInitData(initData: string) {
  const parsed = new URLSearchParams(initData);
  const user = JSON.parse(parsed.get('user') || '{}');
  const authDate = parseInt(parsed.get('auth_date') || '0', 10);
  
  // Check auth_date is fresh (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 300) {
    throw new Error('auth_date too old');
  }
  
  return user;
}
```

### NEVER Trust
- ❌ `initDataUnsafe` — User controlled
- ❌ Client-provided user_id — Always verify from Telegram hash
- ❌ Client-computed results

---

## JWT Tokens

### Issuing
```typescript
const jwt = sign(
  {
    user_id: telegramUserId,
    telegram_username: user.username,
    permissions: userRoles,
    iat: now,
    exp: now + 24 * 60 * 60, // 24 hours
  },
  JWT_SECRET,
  { algorithm: 'HS256' }
);
```

### Verification
- Always verify signature
- Always check expiry
- Always check iat (issued at)
- Store JWT in database for revocation capability

### Refresh Tokens
- Issued alongside JWT
- 7 day expiry
- Single-use (rotate on refresh)
- Stored in database, not client

---

## Request Validation

### Input Validation (Zod/Joi)
```typescript
const joinGameSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(['join', 'spectate']),
});

app.post('/games/:id/join', (req, res) => {
  const validated = joinGameSchema.safeParse(req.body);
  if (!validated.success) {
    return res.status(400).json({ errors: validated.error });
  }
  // Process...
});
```

### Rate Limiting
- Per-IP: 100 requests/minute
- Per-user: 1000 requests/minute
- Per-endpoint: Variable (game actions: 10/sec)
- Use Redis to track

### CORS
```typescript
app.use(
  cors({
    origin: process.env.MINIAPP_DOMAIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
);
```

---

## Authorization (RBAC)

### Permission Checks

```typescript
interface AuthContext {
  userId: bigint;
  roles: string[]; // ['admin', 'user']
  permissions: string[]; // ['game:create', 'game:join']
}

function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = req.authContext as AuthContext;
    if (!ctx.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

app.post('/games', requirePermission('game:create'), (req, res) => {
  // Only authenticated users with game:create permission
});
```

### Resource-Level Authorization
```typescript
function requireResourceOwnership(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = req.authContext as AuthContext;
    const resource = await db.query(
      `SELECT owner_id FROM ${resourceType} WHERE id = $1`,
      [req.params.id]
    );
    
    if (resource.owner_id !== ctx.userId && !ctx.roles.includes('admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
```

---

## Database Security

### Prepared Statements (Always)
```typescript
// ✅ GOOD
const user = await db.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// ❌ WRONG
const user = await db.query(
  `SELECT * FROM users WHERE id = ${userId}`
);
```

### Sensitive Data
- Never store plaintext passwords
- Hash JWT tokens before storing
- Encrypt PII fields (optional)
- Don't log sensitive data (tokens, IPs in detail)

---

## Economy Security

### Transaction Atomicity
```typescript
async function debitAndAwardGame(
  userId: bigint,
  entryFee: bigint,
  gameSessionId: string,
  idempotencyKey: string
) {
  return await db.transaction(async (tx) => {
    // Check balance
    const wallet = await tx.query(
      'SELECT coins FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    
    if (wallet.coins < entryFee) {
      throw new Error('Insufficient balance');
    }
    
    // Debit (atomic)
    await tx.query(
      `INSERT INTO wallet_transactions 
       (user_id, amount, type, reference_type, reference_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, -entryFee, 'GAME_ENTRY', 'game_session', gameSessionId, idempotencyKey]
    );
    
    // Update balance
    await tx.query(
      'UPDATE wallets SET coins = coins - $1 WHERE user_id = $2',
      [entryFee, userId]
    );
  });
}
```

### Idempotency Keys
- Client-provided UUID
- Prevents double-charge on retries
- Stored in database, checked before processing

### Protection Against
- Double-spend: Row-level locks + idempotency
- Negative balance: Pre-check balance
- Duplicate reward: Unique constraint on (user_id, reference_id)
- Race conditions: Database transactions

---

## Game Security

### Server-Authoritative
- ❌ Client computes game result
- ✅ Server validates all player actions
- ✅ Server computes round outcome
- ✅ Server awards rewards

### Action Validation
```typescript
interface PlayerAction {
  userId: bigint;
  sessionId: string;
  actionType: string;
  payload: unknown;
  timestamp: number;
}

async function handleAction(action: PlayerAction) {
  // 1. Verify user is player in session
  const player = await db.query(
    `SELECT * FROM game_players 
     WHERE game_session_id = $1 AND user_id = $2`,
    [action.sessionId, action.userId]
  );
  
  if (!player || player.status === 'eliminated') {
    throw new Error('Player not active in session');
  }
  
  // 2. Verify action is legal for current game state
  const session = await getGameSession(action.sessionId);
  if (!isActionLegal(action, session)) {
    throw new Error('Illegal action for current state');
  }
  
  // 3. Record action (idempotent)
  await db.query(
    `INSERT INTO game_actions (...) VALUES (...)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [...]
  );
  
  // 4. Process and broadcast
  await processAction(action);
}
```

### Cheating Prevention
- All player actions logged
- All game events immutable
- Timestamps server-side
- Actions validated before processing
- No client-side state trusted

---

## Audit Logging

### Log Every
- Authentication (login, logout, token refresh)
- Authorization failures
- Game creation, join, finish
- Economy transactions
- Admin actions
- Permission changes

### Log Entry
```typescript
interface AuditLog {
  user_id: bigint;
  action: string; // 'game:join', 'economy:debit', etc.
  resource_type: string; // 'game_session', 'wallet'
  resource_id: string;
  changes: Record<string, unknown>;
  ip_address: string;
  result: 'success' | 'failure';
  error_message?: string;
  timestamp: number;
}
```

### Query Audit
```sql
SELECT * FROM audit_logs
WHERE user_id = $1
AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

---

## Data Privacy

### Data Minimization
- Only collect: Telegram ID, username, level, wins
- Don't collect: IP address (only for rate limiting, not storage)
- Don't store: Passwords (Telegram auth only)

### Retention
- User data: Kept indefinitely (user can request deletion)
- Audit logs: 1 year
- Sessions: 30 days after expiry
- Game history: 1 year (for leaderboards)

### Deletion
```typescript
async function deleteUser(userId: bigint) {
  return await db.transaction(async (tx) => {
    // Anonymize user
    await tx.query(
      `UPDATE users SET telegram_id = NULL, telegram_username = NULL
       WHERE id = $1`,
      [userId]
    );
    
    // Delete profile
    await tx.query('DELETE FROM profiles WHERE user_id = $1', [userId]);
    
    // Keep wallet for audit trail
    // Keep game history for leaderboards
  });
}
```

---

## Secrets Management

### Environment Variables (Never Commit)
- `JWT_SECRET` (min 32 characters)
- `TELEGRAM_BOT_TOKEN`
- `DATABASE_URL`
- `REDIS_URL`
- `ADMIN_SECRET`

### In Production
- Use environment service (AWS Secrets Manager, HashiCorp Vault)
- Rotate secrets regularly
- Use strong, unique values

---

## Rate Limiting Strategy

```typescript
const limiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rate-limit:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // requests per window
  keyGenerator: (req) => req.authContext.userId.toString(),
  skip: (req) => req.authContext.roles.includes('admin'),
});

app.use('/api/', limiter);

// Endpoint-specific limits
app.post(
  '/games/:id/action',
  rateLimit({
    windowMs: 1000,
    max: 10, // 10 actions per second
  }),
  handleGameAction
);
```

---

## Testing Security

### Manual Testing
- Modify JWT and try authenticated requests
- Try IDOR: Access resource with different user_id
- Try privilege escalation: Change admin flag in JWT
- Try SQL injection: Pass malicious input
- Try race conditions: Submit duplicate actions concurrently

### Automated Testing
```typescript
describe('Security', () => {
  it('rejects invalid Telegram signature', async () => {
    const tampered = initData.replace('user', 'admin');
    const res = await request(app)
      .post('/auth/telegram')
      .send({ initData: tampered });
    expect(res.status).toBe(401);
  });
  
  it('prevents double-spend', async () => {
    const promises = Array(10)
      .fill(null)
      .map(() => submitGameEntry(userId, 100));
    
    const results = await Promise.all(promises);
    const successful = results.filter((r) => r.status === 200).length;
    expect(successful).toBe(1); // Only one succeeds
  });
});
```
