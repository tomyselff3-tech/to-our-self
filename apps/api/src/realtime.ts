import { FastifyInstance, FastifyRequest } from 'fastify';
import { createClient, RedisClientType } from 'redis';
import { verifyJWT } from '@to-our-self/auth';
import { query, queryOne, transaction } from '@to-our-self/database';
import { GameSessionId, UserId, AuthContext } from '@to-our-self/shared';

let redisClient: RedisClientType;

export async function initializeRedis(redisUrl: string): Promise<void> {
  redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  await redisClient.connect();
}

export function getRedis(): RedisClientType {
  return redisClient;
}

export async function publishGameEvent(
  sessionId: GameSessionId,
  event: Record<string, unknown>
): Promise<void> {
  const channel = `game:${sessionId}`;
  await redisClient.publish(channel, JSON.stringify(event));
}

export async function subscribeToGameSession(
  sessionId: GameSessionId,
  callback: (event: Record<string, unknown>) => Promise<void>
): Promise<() => Promise<void>> {
  const subscriber = redisClient.duplicate();
  await subscriber.connect();
  
  const channel = `game:${sessionId}`;
  await subscriber.subscribe(channel, (message) => {
    try {
      const event = JSON.parse(message);
      callback(event).catch(console.error);
    } catch (error) {
      console.error('Failed to parse event:', error);
    }
  });

  return async () => {
    await subscriber.unsubscribe();
    await subscriber.disconnect();
  };
}

export async function cacheGameSession(
  sessionId: GameSessionId,
  data: Record<string, unknown>,
  ttl: number = 3600
): Promise<void> {
  const key = `session:${sessionId}`;
  await redisClient.setEx(key, ttl, JSON.stringify(data));
}

export async function getGameSessionCache(
  sessionId: GameSessionId
): Promise<Record<string, unknown> | null> {
  const key = `session:${sessionId}`;
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
}

export async function setRateLimit(
  key: string,
  limit: number,
  window: number
): Promise<boolean> {
  const count = await redisClient.incr(`rate:${key}`);
  if (count === 1) {
    await redisClient.expire(`rate:${key}`, window);
  }
  return count <= limit;
}

export async function setupWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.register(async (fastify) => {
    fastify.get<{ Params: { sessionId: string } }>(
      '/api/games/:sessionId/ws',
      { websocket: true },
      async (connection, request) => {
        const { sessionId } = request.params as { sessionId: string };
        const token = request.headers.authorization?.replace('Bearer ', '');

        // Verify JWT
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret || !token) {
          connection.socket.close(1008, 'Unauthorized');
          return;
        }

        const authContext = verifyJWT(token, jwtSecret) as AuthContext | null;
        if (!authContext) {
          connection.socket.close(1008, 'Invalid token');
          return;
        }

        // Get game session
        const session = await queryOne(
          'SELECT * FROM game_sessions WHERE id = $1',
          [sessionId]
        );
        if (!session) {
          connection.socket.close(1008, 'Game not found');
          return;
        }

        // Verify player is in session
        const player = await queryOne(
          'SELECT * FROM game_players WHERE game_session_id = $1 AND user_id = $2',
          [sessionId, authContext.userId]
        );
        if (!player) {
          connection.socket.close(1008, 'Player not in session');
          return;
        }

        // Subscribe to game events
        let unsubscribe: (() => Promise<void>) | null = null;

        try {
          unsubscribe = await subscribeToGameSession(sessionId as GameSessionId, async (event) => {
            connection.socket.send(JSON.stringify(event));
          });

          // Send initial game state
          const snapshot = await queryOne(
            'SELECT * FROM game_sessions WHERE id = $1',
            [sessionId]
          );
          connection.socket.send(
            JSON.stringify({
              type: 'INITIAL_STATE',
              data: snapshot,
            })
          );

          // Handle incoming messages
          connection.socket.on('message', async (message: any) => {
            try {
              const action = JSON.parse(message.toString());
              await handleGameAction(sessionId, authContext.userId, action);
            } catch (error) {
              console.error('WebSocket message error:', error);
              connection.socket.send(
                JSON.stringify({
                  type: 'ERROR',
                  error: (error as Error).message,
                })
              );
            }
          });

          connection.socket.on('close', async () => {
            if (unsubscribe) {
              await unsubscribe();
            }
          });
        } catch (error) {
          console.error('WebSocket setup error:', error);
          connection.socket.close(1011, 'Internal error');
        }
      }
    );
  });
}

async function handleGameAction(
  sessionId: string,
  userId: UserId,
  action: Record<string, unknown>
): Promise<void> {
  // Record action in database
  const session = await queryOne(
    'SELECT round_number FROM game_sessions WHERE id = $1',
    [sessionId]
  );

  if (!session) throw new Error('Session not found');

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO game_actions 
       (game_session_id, user_id, round_number, action_type, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, userId, session.round_number, action.type, JSON.stringify(action.payload)]
    );
  });

  // Publish action to all players
  await publishGameEvent(sessionId as GameSessionId, {
    type: 'PLAYER_ACTION',
    userId,
    action,
    timestamp: Date.now(),
  });
}
