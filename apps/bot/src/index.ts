import pino from 'pino';
import { TelegramBotClient } from '@to-our-self/telegram';
import { initializeDatabase, query } from '@to-our-self/database';

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
  pino.destination()
);

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  logger.error('TELEGRAM_BOT_TOKEN environment variable is required');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  logger.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Initialize services
initializeDatabase(databaseUrl);
const telegramClient = new TelegramBotClient(botToken);

// Bot commands
const commands: Record<string, (userId: number, args: string[]) => Promise<string>> = {
  start: async (userId: number) => {
    // Get or create user
    const user = await query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [userId]
    );

    if (!user || user.length === 0) {
      return '👋 مرحبا! لقد تم إنشاء حسابك. افتح Mini App الآن.';
    }

    return '👋 مرحبا! اختر لعبة من القائمة أعلاه.';
  },

  help: async () => {
    return `📖 الأوامر المتاحة:
/start - بدء اللعبة
/profile - عرض ملفك الشخصي
/games - قائمة الألعاب
/help - المساعدة`;
  },
};

// Handle updates
async function handleUpdate(update: any): Promise<void> {
  if (!update.message) return;

  const { text, from } = update.message;
  if (!text || !from) return;

  const args = text.split(' ');
  const command = args[0].replace('/', '');
  const handler = commands[command];

  if (!handler) {
    logger.debug(`Unknown command: ${command}`);
    return;
  }

  try {
    const response = await handler(from.id, args.slice(1));
    await telegramClient.sendMessage(from.id, response, {
      parse_mode: 'HTML',
    });
  } catch (error) {
    logger.error(error);
    await telegramClient.sendMessage(
      from.id,
      '❌ حدث خطأ. حاول لاحقا.',
      { parse_mode: 'HTML' }
    );
  }
}

// Polling mode (for development)
async function startPolling(): Promise<void> {
  logger.info('🤖 Bot started in polling mode');
  let offset = 0;

  while (true) {
    try {
      // This would need the getUpdates implementation in TelegramBotClient
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      logger.error(error);
    }
  }
}

// Verify bot token and start
async function start(): Promise<void> {
  try {
    const me = await telegramClient.getMe();
    logger.info(`✓ Bot authenticated as @${me.username}`);

    // In production, set webhook
    // const webhookUrl = process.env.WEBHOOK_URL;
    // if (webhookUrl) {
    //   await telegramClient.setWebhook(webhookUrl);
    //   logger.info(`✓ Webhook set to ${webhookUrl}`);
    // } else {
    //   await startPolling();
    // }

    await startPolling();
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

start();
