export default {
  apps: [
    {
      name: 'ecommerce-ops-system',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
        AI_PROVIDER: process.env.AI_PROVIDER || 'mock',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        DATA_DIR: process.env.DATA_DIR || './data',
        DATABASE_PATH: process.env.DATABASE_PATH || './data/database.sqlite',
        BACKUP_DIR: process.env.BACKUP_DIR || './data/backup',
        SESSION_SECRET: process.env.SESSION_SECRET || '',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
        AI_PROVIDER: process.env.AI_PROVIDER || 'mock',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        DATA_DIR: process.env.DATA_DIR || './data',
        DATABASE_PATH: process.env.DATABASE_PATH || './data/database.sqlite',
        BACKUP_DIR: process.env.BACKUP_DIR || './data/backup',
        SESSION_SECRET: process.env.SESSION_SECRET || '',
      },
    },
  ],
};
