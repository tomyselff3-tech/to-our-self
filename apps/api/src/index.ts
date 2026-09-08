import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import pino from 'pino';
import { initializeDatabase } from '@to-our-self/database';
import { createAuthRoutes } from './routes/auth';
import { createGameRoutes } from './routes/games';
import { createProfileRoutes } from './routes/profiles';
import { createHealthRoutes } from './routes/health';
import { AuthContext } from '@to-our-self/shared';

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
  pino.destination()
);

// Extend Fastify Request to include auth context
declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

const app = Fastify({ logger });

// Register plugins
await app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
});

await app.register(fastifyCors, {
  origin: process.env.MINIAPP_DOMAIN || 'http://localhost:5173',
  credentials: true,
});

await app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '15 minutes',
});

await app.register(fastifyWebsocket);

// Initialize database
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}
initializeDatabase(databaseUrl);

// Routes
await app.register(createHealthRoutes);
await app.register(createAuthRoutes);
await app.register(createGameRoutes);
await app.register(createProfileRoutes);

// Start server
const host = process.env.API_HOST || '0.0.0.0';
const port = parseInt(process.env.API_PORT || '3000', 10);

const start = async (): Promise<void> => {
  try {
    await app.listen({ host, port });
    console.log(`✓ API server running at http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
