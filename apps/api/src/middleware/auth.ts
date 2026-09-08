import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { verifyJWT } from '@to-our-self/auth';
import { AuthContext } from '@to-our-self/shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthContext;
    }
  }
}

export const setupAuthentication = async (fastify: any): Promise<void> => {
  fastify.decorate('authenticate', async (request: FastifyRequest) => {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new Error('Missing authorization token');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT secret not configured');
    }

    const user = verifyJWT(token, jwtSecret) as AuthContext | null;
    if (!user) {
      throw new Error('Invalid token');
    }

    (request as any).user = user;
  });
};
