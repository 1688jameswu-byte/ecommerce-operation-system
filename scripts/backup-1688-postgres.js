import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pgDumpPath = 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe';
const backupDir = 'F:\\ecommerce-operation-system\\backup\\postgres';
const databaseName = 'ecommerce_ops';

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('DATABASE_URL 未配置：项目根目录未找到 .env 文件。');
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const index = trimmed.indexOf('=');
    if (index <= 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getDatabaseConfig() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未配置：请在项目根目录 .env 中配置 PostgreSQL 连接。');
  }

  let url;
  try {
    url = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL 格式无效：请使用 postgresql://user:password@host:port/database 格式。');
  }

  const database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('DATABASE_URL 缺少数据库名。');
  }

  return {
    host: url.hostname || 'localhost',
    port: url.port || '5432',
    database,
    username: decodeUrlPart(url.username),
    password: decodeUrlPart(url.password),
    sslMode: url.searchParams.get('sslmode') || (process.env.DATABASE_SSL === 'true' ? 'require' : ''),
  };
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(2)} KB`;
  }

  return `${(kb / 1024).toFixed(2)} MB`;
}

function runPgDump(config, outputPath) {
  const env = {
    ...process.env,
    PGHOST: config.host,
    PGPORT: config.port,
    PGDATABASE: config.database,
    PGUSER: config.username,
    PGPASSWORD: config.password,
    PGCONNECT_TIMEOUT: process.env.DATABASE_CONNECTION_TIMEOUT_MS
      ? String(Math.max(1, Math.ceil(Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS) / 1000)))
      : '5',
  };

  if (config.sslMode) {
    env.PGSSLMODE = config.sslMode;
  }

  const args = [
    '--format=plain',
    '--no-owner',
    '--no-privileges',
    '--file',
    outputPath,
    config.database,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(pgDumpPath, args, {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';

    child.stdout.on('data', () => {
      // pg_dump writes the backup to --file; stdout is intentionally ignored to avoid noisy output.
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pg_dump 执行失败，退出码 ${code}。${stderr.trim() ? `\n${stderr.trim()}` : ''}`));
    });
  });
}

async function main() {
  loadLocalEnv();

  if (!fs.existsSync(pgDumpPath)) {
    throw new Error(`未找到 pg_dump：${pgDumpPath}。请确认 PostgreSQL 16 客户端工具已安装。`);
  }

  const config = getDatabaseConfig();
  if (config.database !== databaseName) {
    throw new Error(`当前 DATABASE_URL 指向数据库 ${config.database}，本脚本只允许备份 ${databaseName}。`);
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const startedAt = new Date();
  const outputPath = path.join(backupDir, `${databaseName}_${formatTimestamp(startedAt)}.sql`);

  await runPgDump(config, outputPath);

  if (!fs.existsSync(outputPath)) {
    throw new Error(`备份失败：未生成备份文件 ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  if (stats.size <= 0) {
    throw new Error(`备份失败：备份文件为空 ${outputPath}`);
  }

  console.log('1688 PostgreSQL 备份完成');
  console.log(`备份文件：${outputPath}`);
  console.log(`文件大小：${formatBytes(stats.size)} (${stats.size} bytes)`);
  console.log(`备份时间：${startedAt.toLocaleString('zh-CN', { hour12: false })}`);
}

main().catch((error) => {
  console.error(`1688 PostgreSQL 备份失败：${error.message}`);
  process.exitCode = 1;
});
