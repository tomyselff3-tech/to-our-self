import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query, queryOne } from '@to-our-self/database';
import { PERMISSIONS } from '@to-our-self/shared';

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  bio: z.string().max(500).optional(),
});

export const createProfileRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user profile
  fastify.get<{ Params: { userId: string } }>(
    '/api/profiles/:userId',
    async (request, reply) => {
      try {
        const { userId } = request.params;
        const profile = await queryOne(
          `SELECT p.*, u.telegram_username, w.coins, w.gems, w.rating
           FROM profiles p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN wallets w ON w.user_id = p.user_id
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

  // Update own profile
  fastify.put<{ Body: z.infer<typeof UpdateProfileSchema> }>(
    '/api/profiles/me',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const userId = (request as any).user.userId;
        const { displayName, bio } = UpdateProfileSchema.parse(request.body);

        const profile = await queryOne(
          `UPDATE profiles 
           SET display_name = COALESCE($1, display_name),
               bio = COALESCE($2, bio),
               updated_at = NOW()
           WHERE user_id = $3
           RETURNING *`,
          [displayName, bio, userId]
        );

        return reply.send({ profile });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(400).send({ error: (error as Error).message });
      }
    }
  );

  // Get leaderboard
  fastify.get<{}>('/api/leaderboards/:type', async (request, reply) => {
    try {
      const { type } = request.params as { type: string };

      const leaderboard = await queryOne(
        `SELECT entries FROM leaderboards WHERE leaderboard_type = $1`,
        [type]
      );

      if (!leaderboard) {
        return reply.status(404).send({ error: 'Leaderboard not found' });
      }

      return reply.send(leaderboard);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: (error as Error).message });
    }
  });

  // Get user stats
  fastify.get<{}>(
    '/api/users/:userId/stats',
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };

        const stats = await queryOne(
          `SELECT 
             p.level,
             p.xp,
             p.reputation,
             p.total_wins,
             p.total_losses,
             w.coins,
             w.gems,
             w.rating,
             (SELECT COUNT(*) FROM player_achievements WHERE user_id = $1 AND unlocked_at IS NOT NULL) as achievements_count
           FROM profiles p
           LEFT JOIN wallets w ON w.user_id = p.user_id
           WHERE p.user_id = $1`,
          [userId]
        );

        if (!stats) {
          return reply.status(404).send({ error: 'Stats not found' });
        }

        return reply.send(stats);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: (error as Error).message });
      }
    }
  );
};
