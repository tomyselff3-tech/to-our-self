import { initializeDatabase, closeDatabase, runMigrations } from './db';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

async function main(): Promise<void> {
  try {
    console.log('Connecting to database...');
    initializeDatabase(databaseUrl);
    
    console.log('Running migrations...');
    await runMigrations();
    
    console.log('✓ All migrations completed successfully');
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
