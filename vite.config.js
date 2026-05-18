import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
const dataFiles = {
  orderImportStore: 'order-import-store.json',
  storeOperatorRelations: 'store-operator-relations.json',
  trafficConversionStore: 'traffic-conversion-store.json',
  trafficWarningRules: 'traffic-warning-rules.json',
};

function ensureDataFile(name) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, dataFiles[name]);

  if (!fs.existsSync(filePath)) {
    const initial = name === 'storeOperatorRelations'
      ? '[]'
      : name === 'trafficConversionStore'
        ? '{"records":[]}'
        : name === 'trafficWarningRules'
          ? '{"settings":{"displayLimit":5},"rules":[]}'
          : '{"batches":[]}';
    fs.writeFileSync(filePath, initial, 'utf-8');
  }

  return filePath;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
  });
}

function localDataPlugin() {
  return {
    name: 'local-data-storage',
    configureServer(server) {
      server.middlewares.use('/api/data-path', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ path: dataDir }));
      });

      server.middlewares.use('/api/persistent-data/', async (req, res) => {
        const name = req.url?.split('?')[0].replace(/^\/+/, '');

        if (!name || !(name in dataFiles)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const filePath = ensureDataFile(name);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (req.method === 'GET') {
          res.end(fs.readFileSync(filePath, 'utf-8'));
          return;
        }

        if (req.method === 'PUT') {
          fs.writeFileSync(filePath, await readBody(req), 'utf-8');
          res.end(JSON.stringify({ ok: true, path: filePath }));
          return;
        }

        res.statusCode = 405;
        res.end('Method not allowed');
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localDataPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5176,
    strictPort: true,
  },
});
