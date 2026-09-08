import { FastifyPluginAsync } from 'fastify';
import { query } from '@to-our-self/database';

export const createGameRoutes: FastifyPluginAsync = async (fastify) => {
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
};
