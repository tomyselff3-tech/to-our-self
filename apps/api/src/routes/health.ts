import { FastifyPluginAsync } from 'fastify';
import { queryOne } from '@to-our-self/database';

export const createHealthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{}>('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: Date.now() });
  });

  fastify.get<{}>('/ready', async (_request, reply) => {
    try {
      // Test database connection
      await queryOne('SELECT 1');
      return reply.send({ ready: true });
    } catch (error) {
      return reply.status(503).send({ ready: false, error: (error as Error).message });
    }
  });
};
