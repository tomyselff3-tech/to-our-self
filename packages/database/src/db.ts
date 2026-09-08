import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

export function initializeDatabase(connectionString: string): Pool {
  if (pool) return pool;
  
  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  return pool;
}

export function getDatabase(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function query<T extends any[]>(
  sql: string,
  params?: any[]
): Promise<T> {
  const result = await getDatabase().query(sql, params);
  return result.rows as T;
}

export async function queryOne<T>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const result = await getDatabase().query(sql, params);
  return (result.rows[0] as T) || null;
}
