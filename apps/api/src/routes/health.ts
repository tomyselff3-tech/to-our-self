import { FastifyInstance } from 'fastify';
import { query } from '@to-our-self/database';

export async function setupHealthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{}>('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: Date.now() });
  });

  fastify.get<{}>('/ready', async (_request, reply) => {
    try {
      await query('SELECT 1');
      return reply.send({ ready: true });
    } catch (error) {
      return reply.status(503).send({ ready: false, error: (error as Error).message });
    }
  });
}
