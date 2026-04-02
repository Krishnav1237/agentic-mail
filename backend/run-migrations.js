import fs from 'fs';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Missing DATABASE_URL in .env file');
  process.exit(1);
}

async function run() {
  console.log('Connecting to database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase') || dbUrl.includes('ssl=true')
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await client.connect();

  console.log('Running schema...');
  const schema = fs
    .readFileSync('db/schema.sql', 'utf8')
    .replace(/\r\n/g, '\n');
  await client.query(schema);
  console.log('Schema applied.');

  const files = fs
    .readdirSync('db/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs
      .readFileSync(`db/migrations/${file}`, 'utf8')
      .replace(/\r\n/g, '\n');
    try {
      await client.query(sql);
      console.log(`✅ ${file}`);
    } catch (err) {
      console.error(`❌ ${file}: ${err.message} (${err.code})`);
      // Do not exit — continue attempting remaining migrations
    }
  }
  await client.end();
  console.log('Migration run complete.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
