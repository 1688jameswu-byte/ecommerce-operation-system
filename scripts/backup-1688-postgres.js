import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const databaseName = process.env.BACKUP_1688_DATABASE_NAME || 'ecommerce_ops';

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
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function resolveBackupRootDir() {
  return path.resolve(
    process.env.BACKUP_1688_DIR ||
    process.env.BACKUP_DIR ||
    path.join(process.cwd(), 'data', 'backup', 'alibaba-1688'),
  );
}

function resolveUploadsDir() {
  return path.resolve(
    process.env.UPLOADS_1688_DIR ||
    process.env.UPLOADS_DIR ||
    path.join(process.cwd(), 'public', 'uploads', 'alibaba-1688'),
  );
}

function resolvePgDumpCommand() {
  if (process.env.PG_DUMP_PATH) {
    return process.env.PG_DUMP_PATH;
  }

  const windowsDefault = 'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe';
  if (process.platform === 'win32' && fs.existsSync(windowsDefault)) {
    return windowsDefault;
  }

  return 'pg_dump';
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
    const child = spawn(resolvePgDumpCommand(), args, {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';

    child.stdout.on('data', () => {
      // pg_dump writes the backup to --file; stdout is intentionally ignored.
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      reject(new Error(`pg_dump 启动失败：${error.message}。请确认服务器已安装 PostgreSQL client，或设置 PG_DUMP_PATH。`));
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

function copyDirectory(sourceDir, targetDir) {
  const summary = { fileCount: 0, totalBytes: 0 };
  if (!fs.existsSync(sourceDir)) {
    return summary;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const item of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, item.name);
    const targetPath = path.join(targetDir, item.name);

    if (item.isDirectory()) {
      const child = copyDirectory(sourcePath, targetPath);
      summary.fileCount += child.fileCount;
      summary.totalBytes += child.totalBytes;
      continue;
    }

    if (!item.isFile()) {
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    const stat = fs.statSync(targetPath);
    summary.fileCount += 1;
    summary.totalBytes += stat.size;
  }

  return summary;
}

function writeManifest(manifestPath, manifest) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

async function main() {
  loadLocalEnv();

  const config = getDatabaseConfig();
  if (config.database !== databaseName) {
    throw new Error(`当前 DATABASE_URL 指向数据库 ${config.database}，本脚本只允许备份 ${databaseName}。`);
  }

  const startedAt = new Date();
  const backupRootDir = resolveBackupRootDir();
  const backupDir = path.join(backupRootDir, `1688-${formatTimestamp(startedAt)}`);
  const postgresDir = path.join(backupDir, 'postgres');
  const uploadsBackupDir = path.join(backupDir, 'uploads', 'alibaba-1688');
  const uploadsSourceDir = resolveUploadsDir();
  const outputPath = path.join(postgresDir, `${databaseName}_${formatTimestamp(startedAt)}.sql`);

  fs.mkdirSync(postgresDir, { recursive: true });
  await runPgDump(config, outputPath);

  if (!fs.existsSync(outputPath)) {
    throw new Error(`备份失败：未生成备份文件 ${outputPath}`);
  }

  const sqlStats = fs.statSync(outputPath);
  if (sqlStats.size <= 0) {
    throw new Error(`备份失败：备份文件为空 ${outputPath}`);
  }

  const uploadsSummary = copyDirectory(uploadsSourceDir, uploadsBackupDir);
  const manifestPath = path.join(backupDir, 'manifest.json');
  writeManifest(manifestPath, {
    createdAt: startedAt.toISOString(),
    database: {
      host: config.host,
      port: config.port,
      name: config.database,
      username: config.username,
      dumpFile: path.relative(backupDir, outputPath),
      dumpBytes: sqlStats.size,
    },
    uploads: {
      sourceDir: uploadsSourceDir,
      backupDir: path.relative(backupDir, uploadsBackupDir),
      fileCount: uploadsSummary.fileCount,
      totalBytes: uploadsSummary.totalBytes,
      existed: fs.existsSync(uploadsSourceDir),
    },
  });

  console.log('1688 数据备份完成');
  console.log(`备份目录：${backupDir}`);
  console.log(`数据库备份：${outputPath}`);
  console.log(`数据库大小：${formatBytes(sqlStats.size)} (${sqlStats.size} bytes)`);
  console.log(`图片文件：${uploadsSummary.fileCount} 个，${formatBytes(uploadsSummary.totalBytes)}`);
  if (!fs.existsSync(uploadsSourceDir)) {
    console.log(`图片目录不存在，已跳过：${uploadsSourceDir}`);
  }
  console.log(`清单文件：${manifestPath}`);
}

main().catch((error) => {
  console.error(`1688 数据备份失败：${error.message}`);
  process.exitCode = 1;
});
