# Deployment & Operations Guide

## Local Development

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- pnpm
- PostgreSQL 15 (or Docker)
- Redis (or Docker)

### Quick Start

```bash
# Clone and install
git clone https://github.com/tomyselff3-tech/to-our-self.git
cd to-our-self
pnpm install

# Start services
docker compose -f docker/docker-compose.yml up -d

# Run migrations
pnpm db:migrate up

# Start dev servers
pnpm dev
```

Services will be available at:
- API: http://localhost:3000
- Mini App: http://localhost:5173
- PostgreSQL: localhost:5432
- Redis: localhost:6379

---

## Database Migrations

### Creating a Migration

```bash
pnpm db:migrate create --name add_new_table
```

This creates `migrations/001-add-new-table.sql`.

### Running Migrations

```bash
# Up
pnpm db:migrate up

# Down (rollback 1)
pnpm db:migrate down 1

# To specific version
pnpm db:migrate to 003
```

### Migration Template

```sql
-- migrations/001-initial-schema.sql
-- Up

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Down

DROP TABLE IF EXISTS users;
```

---

## Docker Build & Deploy

### Build Image

```bash
# Local build
Platform=linux/amd64 docker build \
  -f docker/Dockerfile \
  -t to-our-self:latest .

# Tag for registry
docker tag to-our-self:latest registry.example.com/to-our-self:latest
docker push registry.example.com/to-our-self:latest
```

### Docker Compose (Local)

```bash
# Start all services
docker compose -f docker/docker-compose.yml up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Stop
docker compose -f docker/docker-compose.yml down
```

### Production Deployment (Kubernetes Example)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: to-our-self-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: registry.example.com/to-our-self:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: redis-url
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
          requests:
            memory: "256Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

---

## Environment Configuration

### Development (.env.local)

```bash
DATABASE_URL=postgresql://to_our_self:password@localhost:5432/to_our_self_db
REDIS_URL=redis://localhost:6379
TELEGRAM_BOT_TOKEN=YOUR_DEV_BOT_TOKEN
MINIAPP_DOMAIN=localhost:5173
API_URL=http://localhost:3000/api
JWT_SECRET=dev-secret-min-32-characters-long
NODE_ENV=development
```

### Production

```bash
DATABASE_URL=postgresql://prod_user:STRONG_PASSWORD@prod-db.example.com:5432/prod_db
REDIS_URL=redis://prod-redis.example.com:6379
TELEGRAM_BOT_TOKEN=YOUR_PROD_BOT_TOKEN
MINIAPP_DOMAIN=app.example.com
API_URL=https://api.example.com
JWT_SECRET=CRYPTOGRAPHICALLY_RANDOM_32_CHARS
NODE_ENV=production
TLS_ENABLED=true
TLS_CERT_PATH=/etc/secrets/cert.pem
TLS_KEY_PATH=/etc/secrets/key.pem
```

---

## Health Checks & Monitoring

### API Health Endpoint

```typescript
// GET /health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// GET /ready (readiness probe)
app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await redis.ping();
    res.json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});
```

### Metrics (Prometheus)

```typescript
import prom from 'prom-client';

const httpDuration = new prom.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpDuration.labels(req.method, req.route?.path, res.statusCode).observe(duration);
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prom.register.contentType);
  res.end(await prom.register.metrics());
});
```

### Logging

```typescript
import pino from 'pino';

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
  pino.destination('./logs/app.log')
);

logger.info({ userId, action: 'game:join' }, 'User joined game');
```

---

## Database Backup & Recovery

### Automated Daily Backup

```bash
#!/bin/bash
# scripts/backup-db.sh
DATABASE_URL=postgresql://user:pass@host:5432/db
BACKUP_DIR=/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"

# Keep last 30 days
find $BACKUP_DIR -name 'backup_*.sql.gz' -mtime +30 -delete
```

### Restore from Backup

```bash
gunzip -c /backups/backup_20260908.sql.gz | \
  psql postgresql://user:pass@host:5432/db
```

---

## Zero-Downtime Deployment

### Rolling Update (Kubernetes)

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

### Graceful Shutdown

```typescript
const server = app.listen(3000);

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(async () => {
    // Close database
    await db.end();
    // Close Redis
    await redis.quit();
    // Exit
    process.exit(0);
  });
  
  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 30 * 1000);
});
```

### Database Migrations Before Deployment

```bash
# In CI/CD pipeline
pnpm db:migrate up

# Then deploy new version
docker push registry.example.com/to-our-self:v1.2.3
kubectl set image deployment/api api=registry.example.com/to-our-self:v1.2.3
```

---

## Scaling Considerations

### Horizontal Scaling
- API is stateless (except JWT cache in Redis)
- Use load balancer (nginx, cloud LB)
- Redis serves as session store
- Database connection pooling (PgBouncer)

### Vertical Scaling
- Increase CPU/memory per instance
- Connection pool size: `min_pool = CPU_count, max_pool = CPU_count * 2`

### Performance Optimization
- Database indexes (see DATABASE.md)
- Redis caching for leaderboards
- Cursor pagination for large result sets
- WebSocket compression

---

## Security in Production

### TLS/HTTPS
```bash
# Generate self-signed cert
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# In app
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('/etc/secrets/key.pem'),
  cert: fs.readFileSync('/etc/secrets/cert.pem'),
};

https.createServer(options, app).listen(3000);
```

### WAF (Web Application Firewall)
- Rate limiting
- DDoS protection
- SQL injection detection
- XSS filtering

### Secrets Management
- Use AWS Secrets Manager or Vault
- Rotate secrets every 90 days
- Audit access logs

---

## Monitoring Checklist

- [ ] Database query latency
- [ ] Redis memory usage
- [ ] API response times
- [ ] Error rates
- [ ] WebSocket connections
- [ ] Failed authentication attempts
- [ ] Transaction failures
- [ ] Disk usage
- [ ] CPU usage
- [ ] Memory usage

---

## Incident Response

### Database Outage
1. Alert on-call engineer
2. Switch to read-only mode
3. Check connection pool exhaustion
4. Restart database service
5. Run migrations if needed
6. Resume normal operation

### Redis Outage
1. Sessions will fall back to JWT verification
2. Leaderboard cache misses accepted
3. Rate limiting still enforced (slower)
4. Restart Redis service
5. Warm up cache

### API Outage
1. Scale up replicas
2. Check for memory leaks
3. Check database connections
4. Review recent deployments
5. Rollback if necessary
