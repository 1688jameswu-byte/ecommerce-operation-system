import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  fs.readFileSync(envPath, 'utf-8')
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || (process.env[match[1]] !== undefined && process.env[match[1]] !== '')) {
        return;
      }

      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    });
}

loadEnvFile();

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET === 'replace-with-server-secret' ||
    process.env.SESSION_SECRET === 'replace-with-a-long-random-string')
) {
  throw new Error('生产环境必须配置有效 SESSION_SECRET');
}

const port = process.env.PORT || '3000';
const pathFromRoot = (value) => path.resolve(process.cwd(), value);
const isWindows = process.platform === 'win32';
const viteBin = isWindows
  ? pathFromRoot('node_modules/.bin/vite.cmd')
  : pathFromRoot('node_modules/.bin/vite');

const previewArgs = ['preview', '--host', '0.0.0.0', '--port', port, '--configLoader', 'runner'];
const child = isWindows
  ? spawn('cmd.exe', ['/d', '/c', viteBin, ...previewArgs], { stdio: 'inherit', shell: false })
  : spawn(viteBin, previewArgs, { stdio: 'inherit', shell: false });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
