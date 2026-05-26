import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || 'data');
const backupRootDir = path.resolve(rootDir, process.env.BACKUP_DIR || path.join(dataDir, 'backup'));

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function shouldSkip(source) {
  const resolved = path.resolve(source);
  return resolved === backupRootDir || resolved.startsWith(`${backupRootDir}${path.sep}`);
}

function copyDir(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return 0;
  }

  let count = 0;
  fs.mkdirSync(targetDir, { recursive: true });

  for (const item of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, item.name);
    const target = path.join(targetDir, item.name);

    if (shouldSkip(source) || item.name === 'backups') {
      continue;
    }

    if (item.isDirectory()) {
      count += copyDir(source, target);
    } else if (item.isFile()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      count += 1;
    }
  }

  return count;
}

const backupDir = path.join(backupRootDir, `backup-${timestamp()}`);
const fileCount = copyDir(dataDir, backupDir);

console.log(`Backup created: ${backupDir}`);
console.log(`Files copied: ${fileCount}`);
