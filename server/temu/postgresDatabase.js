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
      const migrationPath = path.join(process.cwd(), 'server', 'temu', 'migrations', '001_create_temu_core_tables.sql');
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await getAlibaba1688Pool().query(sql);
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
