import fs from 'fs';
import path from 'path';
import { getAlibaba1688Pool } from '../alibaba1688/postgresDatabase.js';

let migrationPromise;

export function isTemuPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function runTemuMigrations() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const migrationsDir = path.join(process.cwd(), 'server', 'temu', 'migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.sql'))
        .sort();
      for (const file of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await getAlibaba1688Pool().query(sql);
      }
    })().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

export async function queryTemuDatabase(text, values = []) {
  await runTemuMigrations();
  return getAlibaba1688Pool().query(text, values);
}
