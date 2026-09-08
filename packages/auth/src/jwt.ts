import jwt from 'jsonwebtoken';
import { AuthContext } from '@to-our-self/shared';

export function issueJWT(
  userId: number,
  secret: string,
  expiresIn: string = '24h',
  telegramUsername?: string,
  roles: string[] = ['user'],
  permissions: string[] = []
): string {
  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = parseExpiryString(expiresIn);

  const payload: AuthContext = {
    userId: userId as any,
    telegramUsername,
    roles,
    permissions,
    iat: now,
    exp: now + expirySeconds,
  };

  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
  });
}

export function verifyJWT(token: string, secret: string): AuthContext | null {
  try {
    return jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as AuthContext;
  } catch {
    return null;
  }
}

export function decodeJWT(token: string): AuthContext | null {
  try {
    return jwt.decode(token) as AuthContext;
  } catch {
    return null;
  }
}

function parseExpiryString(expiresIn: string): number {
  const match = expiresIn.match(/(\d+)([smhd]?)/);
  if (!match) return 86400; // Default 24h

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case 's':
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 3600;
    case 'd':
      return num * 86400;
    default:
      return num; // Assume seconds if no unit
  }
}
