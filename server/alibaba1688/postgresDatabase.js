import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

let pool;
let migrationPromise;

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  fs.readFileSync(envPath, 'utf-8')
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) {
        return;
      }

      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    });
}

loadLocalEnv();

export class Alibaba1688DatabaseConfigError extends Error {
  constructor() {
    super('1688业务 PostgreSQL 未配置：请在项目根目录 .env 设置 DATABASE_URL=postgresql://用户名:密码@localhost:5433/ecommerce_ops；如需 SSL，可设置 DATABASE_SSL=true。');
    this.name = 'Alibaba1688DatabaseConfigError';
    this.statusCode = 503;
  }
}

export function getAlibaba1688Pool() {
  if (!process.env.DATABASE_URL) {
    throw new Alibaba1688DatabaseConfigError();
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 5000),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    });
  }

  return pool;
}

export async function runAlibaba1688Migrations() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const migrationPath = path.join(process.cwd(), 'server', 'alibaba1688', 'migrations', '001_create_1688_business_tables.sql');
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await getAlibaba1688Pool().query(sql);
    })().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

export async function queryAlibaba1688Database(text, values = []) {
  await runAlibaba1688Migrations();
  return getAlibaba1688Pool().query(text, values);
}

export async function closeAlibaba1688Pool() {
  if (pool) {
    await pool.end();
    pool = null;
    migrationPromise = null;
  }
}
