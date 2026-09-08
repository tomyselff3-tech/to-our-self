import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validateTelegramInitData, issueJWT, getPermissionsForRoles } from '@to-our-self/auth';
import { query, queryOne } from '@to-our-self/database';
import { User, ROLES } from '@to-our-self/shared';

const TelegramInitDataSchema = z.object({
  initData: z.string(),
});

export const createAuthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: z.infer<typeof TelegramInitDataSchema> }>(
    '/api/auth/telegram',
    async (request, reply) => {
      try {
        const { initData } = TelegramInitDataSchema.parse(request.body);
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!botToken) {
          return reply.status(500).send({ error: 'Bot not configured' });
        }

        // Validate Telegram init data
        const telegramUser = validateTelegramInitData(initData, botToken);
        if (!telegramUser) {
          return reply.status(401).send({ error: 'Invalid Telegram signature' });
        }

        // Get or create user
        let user = await queryOne<User>(
          `SELECT * FROM users WHERE telegram_id = $1`,
          [telegramUser.id]
        );

        if (!user) {
          // Create new user
          const result = await query<User[]>(
            `INSERT INTO users (telegram_id, telegram_username, first_name, last_name, is_bot, is_premium)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
              telegramUser.id,
              telegramUser.username,
              telegramUser.first_name,
              telegramUser.last_name,
              telegramUser.is_bot,
              telegramUser.is_premium,
            ]
          );
          user = result[0];

          // Create profile
          await query(
            `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`,
            [user.id, telegramUser.first_name]
          );

          // Create wallet
          await query(
            `INSERT INTO wallets (user_id, coins, gems, rating) VALUES ($1, $2, $3, $4)`,
            [user.id, 0, 0, 0]
          );
        }

        // Update last login
        await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

        // Issue JWT
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          return reply.status(500).send({ error: 'JWT secret not configured' });
        }

        const roles = [ROLES.USER];
        const permissions = getPermissionsForRoles(roles);
        const token = issueJWT(
          user.id as number,
          jwtSecret,
          '24h',
          user.telegramUsername,
          roles,
          permissions
        );

        return reply.send({
          token,
          user: {
            id: user.id,
            telegramId: user.telegramId,
            telegramUsername: user.telegramUsername,
            firstName: user.firstName,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(400).send({ error: (error as Error).message });
      }
    }
  );
};
