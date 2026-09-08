import { z } from 'zod';

// Auth
export const TelegramInitDataSchema = z.object({
  initData: z.string(),
});

export const JWTPayloadSchema = z.object({
  userId: z.number(),
  telegramUsername: z.string().optional(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  iat: z.number(),
  exp: z.number(),
});

// Games
export const CreateGameSessionSchema = z.object({
  gameId: z.string().uuid(),
  groupId: z.number().optional(),
});

export const JoinGameSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export const PlayerActionSchema = z.object({
  sessionId: z.string().uuid(),
  actionType: z.string(),
  payload: z.record(z.unknown()),
});

// Profile
export const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});
