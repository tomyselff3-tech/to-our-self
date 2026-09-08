import { FastifyPluginAsync } from 'fastify';
import { query, queryOne } from '@to-our-self/database';

export const createProfileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { userId: string } }>(
    '/api/profiles/:userId',
    async (request, reply) => {
      try {
        const { userId } = request.params;
        const profile = await queryOne(
          `SELECT p.*, u.telegram_username
           FROM profiles p
           JOIN users u ON u.id = p.user_id
           WHERE p.user_id = $1`,
          [userId]
        );

        if (!profile) {
          return reply.status(404).send({ error: 'Profile not found' });
        }

        return reply.send({ profile });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: (error as Error).message });
      }
    }
  );
};
