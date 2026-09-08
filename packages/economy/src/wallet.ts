import { UserId, Wallet, WalletTransaction, TransactionType } from '@to-our-self/shared';
import { query, queryOne, transaction } from '@to-our-self/database';

export async function getWallet(userId: UserId): Promise<Wallet | null> {
  return queryOne<Wallet>(
    'SELECT user_id, coins, gems, rating, updated_at FROM wallets WHERE user_id = $1',
    [userId]
  );
}

export async function ensureWallet(userId: UserId): Promise<Wallet> {
  const existing = await getWallet(userId);
  if (existing) return existing;

  await transaction(async (client) => {
    await client.query(
      'INSERT INTO wallets (user_id, coins, gems, rating) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [userId, 0, 0, 0]
    );
  });

  return { userId, coins: 0, gems: 0, rating: 0, updatedAt: new Date() };
}

export async function addTransaction(
  userId: UserId,
  amount: number,
  type: TransactionType,
  options: {
    currency?: 'coins' | 'gems';
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  } = {}
): Promise<WalletTransaction> {
  const currency = options.currency || 'coins';
  const idempotencyKey = options.idempotencyKey || `${userId}-${Date.now()}-${Math.random()}`;

  return transaction(async (client) => {
    // Check if already processed
    if (options.idempotencyKey) {
      const existing = await client.query(
        'SELECT * FROM wallet_transactions WHERE idempotency_key = $1',
        [options.idempotencyKey]
      );

      if (existing.rows.length > 0) {
        return existing.rows[0] as WalletTransaction;
      }
    }

    // Prevent negative balance for debits
    if (amount < 0) {
      const wallet = await client.query(
        'SELECT coins, gems FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      const balance = currency === 'coins' ? wallet.rows[0].coins : wallet.rows[0].gems;
      if (balance + amount < 0) {
        throw new Error('Insufficient balance');
      }
    }

    // Insert transaction
    const result = await client.query(
      `INSERT INTO wallet_transactions 
       (user_id, amount, currency, type, reference_type, reference_id, metadata, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        amount,
        currency,
        type,
        options.referenceType,
        options.referenceId,
        JSON.stringify(options.metadata || {}),
        idempotencyKey,
      ]
    );

    // Update wallet balance
    const columnName = currency === 'coins' ? 'coins' : 'gems';
    await client.query(
      `UPDATE wallets SET ${columnName} = ${columnName} + $1, updated_at = NOW() WHERE user_id = $2`,
      [amount, userId]
    );

    return result.rows[0] as WalletTransaction;
  });
}

export async function getTransactionHistory(
  userId: UserId,
  limit: number = 50,
  offset: number = 0
): Promise<WalletTransaction[]> {
  return query<WalletTransaction[]>(
    `SELECT * FROM wallet_transactions 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
}
