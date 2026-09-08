import { FastifyPluginAsync } from 'fastify';
import { query, queryOne } from '@to-our-self/database';
import { PERMISSIONS } from '@to-our-self/shared';

export const createAdminRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all users (admin only)
  fastify.get<{}>(
    '/api/admin/users',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const user = (request as any).user;
        if (!user.permissions.includes(PERMISSIONS.ADMIN_MANAGE_USERS)) {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const users = await query(
          'SELECT id, telegram_id, telegram_username, first_name, created_at FROM users ORDER BY created_at DESC LIMIT 100'
        );

        return reply.send({ users });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: (error as Error).message });
      }
    }
  );

  // Ban user (admin only)
  fastify.post<{ Params: { userId: string } }>(
    '/api/admin/users/:userId/ban',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const user = (request as any).user;
        if (!user.permissions.includes(PERMISSIONS.ADMIN_MANAGE_USERS)) {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const { userId } = request.params;
        await query('UPDATE users SET banned_at = NOW() WHERE id = $1', [userId]);

        return reply.send({ status: 'banned' });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: (error as Error).message });
      }
    }
  );

  // Get audit logs
  fastify.get<{}>(
    '/api/admin/audit-logs',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const user = (request as any).user;
        if (!user.permissions.includes(PERMISSIONS.ADMIN_MODERATE)) {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const logs = await query(
          `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`
        );

        return reply.send({ logs });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: (error as Error).message });
      }
    }
  );

  // Get game stats
  fastify.get<{}>(
    '/api/admin/stats',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const user = (request as any).user;
        if (!user.permissions.includes(PERMISSIONS.ADMIN_MODERATE)) {
          return reply.status(403).send({ error: 'Insufficient permissions' });
        }

        const stats = await query(
          `SELECT 
             (SELECT COUNT(*) FROM users) as total_users,
             (SELECT COUNT(*) FROM game_sessions) as total_games,
             (SELECT COUNT(*) FROM game_sessions WHERE status = 'finished') as finished_games,
             (SELECT COUNT(*) FROM wallet_transactions) as total_transactions
          `
        );

        return reply.send(stats[0]);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: (error as Error).message });
      }
    }
  );
};
