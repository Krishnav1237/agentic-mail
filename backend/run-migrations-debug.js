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
  const client = new Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase') || dbUrl.includes('ssl=true')
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await client.connect();

  const schema = fs
    .readFileSync('db/schema.sql', 'utf8')
    .replace(/\r\n/g, '\n');
  try {
    await client.query(schema);
    console.log('✅ Schema applied.');
  } catch (err) {
    console.error('❌ Schema error:', err.message, err.code);
    // Log full statement context for debugging
    const position = err.position ? parseInt(err.position, 10) : null;
    if (position) {
      const snippet = schema.substring(
        Math.max(0, position - 80),
        position + 80
      );
      console.error('Near:', snippet);
    }
    process.exit(1);
  }

  const files = fs
    .readdirSync('db/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let passed = 0;
  let failed = 0;
  for (const file of files) {
    const sql = fs
      .readFileSync(`db/migrations/${file}`, 'utf8')
      .replace(/\r\n/g, '\n');
    try {
      await client.query(sql);
      console.log(`✅ ${file}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${file}: ${err.message} (${err.code})`);
      const position = err.position ? parseInt(err.position, 10) : null;
      if (position) {
        const snippet = sql.substring(
          Math.max(0, position - 80),
          position + 80
        );
        console.error('   Near:', snippet);
      }
      failed++;
    }
  }
  await client.end();
  console.log(
    `\nDone: ${passed} passed, ${failed} failed out of ${files.length} migrations.`
  );
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
