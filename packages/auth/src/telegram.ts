import crypto from 'crypto';
import { TelegramUser } from '@to-our-self/shared';

export function validateTelegramInitData(
  initData: string,
  botToken: string
): TelegramUser | null {
  const parsed = new URLSearchParams(initData);
  const hash = parsed.get('hash');
  const userData = parsed.get('user');
  const authDate = parseInt(parsed.get('auth_date') || '0', 10);

  if (!hash || !userData) {
    return null;
  }

  // Verify auth_date freshness (max 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 300) {
    return null;
  }

  // Remove hash from data for validation
  parsed.delete('hash');

  // Create data check string
  const dataCheckString = Array.from(parsed.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // Compute HMAC
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Verify hash
  if (hash !== expectedHash) {
    return null;
  }

  // Parse user
  try {
    return JSON.parse(userData) as TelegramUser;
  } catch {
    return null;
  }
}
