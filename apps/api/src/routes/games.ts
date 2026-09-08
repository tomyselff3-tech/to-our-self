import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query, queryOne, transaction } from '@to-our-self/database';
import { publishGameEvent, cacheGameSession, getGameSessionCache } from '../realtime';
import { addTransaction } from '@to-our-self/economy';
import { GAME_STATUS } from '@to-our-self/shared';

const CreateGameSessionSchema = z.object({
  gameId: z.string().uuid(),
  groupId: z.number().optional(),
});

const JoinGameSchema = z.object({
  sessionId: z.string().uuid(),
});

export const createGameRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all games
  fastify.get<{}>('/api/games', async (_request, reply) => {
    try {
      const games = await query(
        `SELECT id, name, display_name, description, min_players, max_players, ai_enabled, icon_url
         FROM games
         ORDER BY created_at DESC`
      );
      return reply.send({ games });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  // Create game session
  fastify.post<{ Body: z.infer<typeof CreateGameSessionSchema> }>(
    '/api/games',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { gameId, groupId } = CreateGameSessionSchema.parse(request.body);
        const userId = (request as any).user.userId;

        // Get game
        const game = await queryOne('SELECT * FROM games WHERE id = $1', [gameId]);
        if (!game) {
          return reply.status(404).send({ error: 'Game not found' });
        }

        // Create session
        const session = await transaction(async (client) => {
          const result = await client.query(
            `INSERT INTO game_sessions 
             (game_id, group_id, creator_id, status, game_version, round_number)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [gameId, groupId, userId, GAME_STATUS.WAITING, '1.0', 1]
          );

          const sessionId = result.rows[0].id;

          // Add creator as player
          await client.query(
            `INSERT INTO game_players 
             (game_session_id, user_id, status)
             VALUES ($1, $2, $3)`,
            [sessionId, userId, 'waiting']
          );

          return result.rows[0];
        });

        // Cache session
        await cacheGameSession(session.id, session, 3600);

        // Publish event
        await publishGameEvent(session.id, {
          type: 'GAME_CREATED',
          gameId,
          creatorId: userId,
          sessionId: session.id,
        });

        return reply.status(201).send({ session });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(400).send({ error: (error as Error).message });
      }
    }
  );

  // Join game session
  fastify.post<{ Body: z.infer<typeof JoinGameSchema> }>(
    '/api/games/:sessionId/join',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { sessionId } = request.params as { sessionId: string };
        const userId = (request as any).user.userId;

        // Get session
        const session = await queryOne(
          'SELECT * FROM game_sessions WHERE id = $1',
          [sessionId]
        );
        if (!session) {
          return reply.status(404).send({ error: 'Game not found' });
        }

        if (session.status !== GAME_STATUS.WAITING) {
          return reply.status(400).send({ error: 'Game has already started' });
        }

        // Count players
        const playersResult = await query(
          'SELECT COUNT(*) FROM game_players WHERE game_session_id = $1 AND user_id IS NOT NULL',
          [sessionId]
        );
        const playerCount = parseInt((playersResult as any)[0].count, 10);

        // Get game constraints
        const game = await queryOne('SELECT * FROM games WHERE id = $1', [session.game_id]);
        if (playerCount >= game.max_players) {
          return reply.status(400).send({ error: 'Game is full' });
        }

        // Add player
        const player = await transaction(async (client) => {
          const result = await client.query(
            `INSERT INTO game_players 
             (game_session_id, user_id, status)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [sessionId, userId, 'waiting']
          );

          return result.rows[0];
        });

        // Publish event
        await publishGameEvent(session.id as any, {
          type: 'PLAYER_JOINED',
          sessionId,
          userId,
          playerCount: playerCount + 1,
        });

        return reply.send({ player });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(400).send({ error: (error as Error).message });
      }
    }
  );

  // Start game
  fastify.post<{}>(
    '/api/games/:sessionId/start',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { sessionId } = request.params as { sessionId: string };
        const userId = (request as any).user.userId;

        // Get session
        const session = await queryOne(
          'SELECT * FROM game_sessions WHERE id = $1',
          [sessionId]
        );
        if (!session) {
          return reply.status(404).send({ error: 'Game not found' });
        }

        // Verify creator
        if (session.creator_id !== userId) {
          return reply.status(403).send({ error: 'Only creator can start game' });
        }

        // Get players
        const players = await query(
          'SELECT * FROM game_players WHERE game_session_id = $1',
          [sessionId]
        );

        // Get game
        const game = await queryOne('SELECT * FROM games WHERE id = $1', [session.game_id]);

        if (players.length < game.min_players) {
          return reply.status(400).send({
            error: `Need at least ${game.min_players} players to start`,
          });
        }

        // Update session status
        await transaction(async (client) => {
          await client.query(
            `UPDATE game_sessions 
             SET status = $1, started_at = NOW()
             WHERE id = $2`,
            [GAME_STATUS.ACTIVE, sessionId]
          );
        });

        // Publish event
        await publishGameEvent(session.id as any, {
          type: 'GAME_STARTED',
          sessionId,
          playerCount: players.length,
        });

        return reply.send({ status: GAME_STATUS.ACTIVE });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(400).send({ error: (error as Error).message });
      }
    }
  );

  // Get game session
  fastify.get<{}>(
    '/api/games/:sessionId',
    async (request, reply) => {
      try {
        const { sessionId } = request.params as { sessionId: string };

        // Try cache first
        const cached = await getGameSessionCache(sessionId);
        if (cached) {
          return reply.send(cached);
        }

        // Get from database
        const session = await queryOne(
          'SELECT * FROM game_sessions WHERE id = $1',
          [sessionId]
        );
        if (!session) {
          return reply.status(404).send({ error: 'Game not found' });
        }

        // Get players
        const players = await query(
          'SELECT * FROM game_players WHERE game_session_id = $1',
          [sessionId]
        );

        const data = { ...session, players };
        await cacheGameSession(sessionId, data);

        return reply.send(data);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: (error as Error).message });
      }
    }
  );
};
