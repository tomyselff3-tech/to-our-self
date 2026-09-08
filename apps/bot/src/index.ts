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

const miniAppUrl = process.env.MINIAPP_URL || 'https://t.me/to_our_self_bot/app';

// Initialize services
initializeDatabase(databaseUrl);
const telegramClient = new TelegramBotClient(botToken);

// Bot commands
const commands: Record<string, (userId: number, args: string[]) => Promise<string>> = {
  start: async (userId: number) => {
    const users = await query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [userId]
    );

    const message = `🎮 مرحباً بك في **To Our Self**!

🕹️ اختر لعبتك المفضلة من القائمة أدناه:

🎡 **Roulette** - اختبر حظك!
🕵️ **Mafia** - ابحث عن المحتالين
🎲 **Dice** - رمي النرد والفوز
🪑 **Chairs** - الكراسي الموسيقية
🙈 **Hide & Seek** - اختبي واعثر

📱 اضغط على الزر أدناه للدخول للعبة:`;

    return message;
  },

  help: async () => {
    return `📖 أوامر المساعدة:

/start - ابدأ اللعبة
/profile - عرض ملفك الشخصي
/games - قائمة الألعاب
/stats - إحصائياتك
/help - المساعدة`;
  },

  profile: async (userId: number) => {
    const profile = await query(
      'SELECT p.*, w.coins, w.gems FROM profiles p LEFT JOIN wallets w ON w.user_id = p.user_id WHERE p.user_id = (SELECT id FROM users WHERE telegram_id = $1)',
      [userId]
    );

    if (!profile || profile.length === 0) {
      return '❌ لم نجد ملفك الشخصي';
    }

    const p = (profile as any)[0];
    return `👤 **ملفك الشخصي**

📊 الإحصائيات:
• الرتبة: ${p.level}
• نقاط الخبرة: ${p.xp}
• الفوز: ${p.total_wins}
• الخسارة: ${p.total_losses}

💰 المحفظة:
• العملات: ${p.coins || 0}
• الجواهر: ${p.gems || 0}`;
  },

  games: async () => {
    const games = await query(
      'SELECT name, display_name, description FROM games ORDER BY created_at DESC'
    );

    if (!games || games.length === 0) {
      return '❌ لا توجد ألعاب متاحة حالياً';
    }

    const gamesList = (games as any)
      .map((g: any) => `• ${g.display_name} (${g.name})`)
      .join('\n');

    return `🎮 **الألعاب المتاحة**\n\n${gamesList}`;
  },

  stats: async (userId: number) => {
    const stats = await query(
      `SELECT p.level, p.xp, p.total_wins, p.total_losses, w.coins, w.gems
       FROM profiles p
       LEFT JOIN wallets w ON w.user_id = p.user_id
       WHERE p.user_id = (SELECT id FROM users WHERE telegram_id = $1)`,
      [userId]
    );

    if (!stats || stats.length === 0) {
      return '❌ لا توجد إحصائيات';
    }

    const s = (stats as any)[0];
    const winRate = s.total_wins + s.total_losses > 0 
      ? ((s.total_wins / (s.total_wins + s.total_losses)) * 100).toFixed(1)
      : 0;

    return `📊 **إحصائياتك**

🎯 الأداء:
• الرتبة: Level ${s.level}
• نقاط الخبرة: ${s.xp}
• نسبة الفوز: ${winRate}%
• إجمالي الفوز: ${s.total_wins}
• إجمالي الخسارة: ${s.total_losses}

💰 المحفظة:
• العملات: ${s.coins || 0}
• الجواهر: ${s.gems || 0}`;
  },
};

// Handle Telegram updates
async function handleUpdate(update: any): Promise<void> {
  try {
    if (update.message) {
      const { text, from, chat } = update.message;
      if (!text || !from) return;

      const args = text.split(' ');
      const command = args[0].replace('/', '').toLowerCase();
      const handler = commands[command];

      logger.info(`Command: ${command} from user ${from.id}`);

      if (!handler) {
        await telegramClient.sendMessage(
          chat.id,
          `❓ أمر غير معروف: ${command}\n\nاكتب /help للمساعدة`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const response = await handler(from.id, args.slice(1));

      if (command === 'start') {
        await telegramClient.sendMessage(chat.id, response, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🎮 اللعب الآن',
                  web_app: { url: miniAppUrl },
                },
              ],
              [
                { text: '📖 المساعدة', callback_data: 'help' },
                { text: '👤 ملفي', callback_data: 'profile' },
              ],
            ],
          },
        });
      } else {
        await telegramClient.sendMessage(chat.id, response, {
          parse_mode: 'Markdown',
        });
      }
    } else if (update.callback_query) {
      const { data, from, message } = update.callback_query;
      const handler = commands[data];

      if (handler) {
        const response = await handler(from.id, []);
        await telegramClient.editMessage(message.chat.id, message.message_id, response, {
          parse_mode: 'Markdown',
        });
      }

      await telegramClient.answerCallbackQuery(update.callback_query.id);
    }
  } catch (error) {
    logger.error('Handle update error:', error);
  }
}

// Polling mode (for development)
let lastUpdateId = 0;

async function startPolling(): Promise<void> {
  logger.info('🤖 Bot started in polling mode');

  while (true) {
    try {
      const response = await (telegramClient as any).client.get('/getUpdates', {
        params: {
          offset: lastUpdateId + 1,
          timeout: 30,
        },
      });

      if (response.data.ok && response.data.result) {
        for (const update of response.data.result) {
          await handleUpdate(update);
          lastUpdateId = update.update_id;
        }
      }
    } catch (error) {
      logger.error('Polling error:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// Verify bot token and start
async function start(): Promise<void> {
  try {
    const me = await telegramClient.getMe();
    logger.info(`✅ Bot authenticated as @${me.username}`);
    logger.info(`🌐 Mini App URL: ${miniAppUrl}`);

    // Seed database with games if empty
    const existingGames = await query('SELECT COUNT(*) as count FROM games');
    if ((existingGames as any)[0].count === 0) {
      logger.info('Seeding database with games...');
      await seedGames();
    }

    await startPolling();
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

async function seedGames(): Promise<void> {
  const games = [
    {
      name: 'roulette',
      displayName: '🎡 Roulette',
      description: 'Spin the wheel and win!',
      minPlayers: 2,
      maxPlayers: 8,
      aiEnabled: true,
    },
    {
      name: 'mafia',
      displayName: '🕵️ Mafia',
      description: 'Find the impostor!',
      minPlayers: 4,
      maxPlayers: 10,
      aiEnabled: true,
    },
    {
      name: 'dice',
      displayName: '🎲 Dice',
      description: 'Roll and bet!',
      minPlayers: 2,
      maxPlayers: 6,
      aiEnabled: true,
    },
    {
      name: 'chairs',
      displayName: '🪑 Chairs',
      description: 'Musical chairs game',
      minPlayers: 3,
      maxPlayers: 10,
      aiEnabled: true,
    },
    {
      name: 'hide_and_seek',
      displayName: '🙈 Hide & Seek',
      description: 'Find the hiders',
      minPlayers: 3,
      maxPlayers: 8,
      aiEnabled: true,
    },
  ];

  for (const game of games) {
    await query(
      `INSERT INTO games (name, display_name, description, min_players, max_players, ai_enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO NOTHING`,
      [
        game.name,
        game.displayName,
        game.description,
        game.minPlayers,
        game.maxPlayers,
        game.aiEnabled,
      ]
    );
  }

  logger.info('✅ Games seeded successfully');
}

start();
