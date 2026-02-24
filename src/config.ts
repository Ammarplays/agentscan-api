import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://agentscan:agentscan@localhost:5432/agentscan',
  storagePath: process.env.STORAGE_PATH || './storage',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  adminSecret: process.env.ADMIN_SECRET || '',
  cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || '60000', 10),
  defaultExpiresIn: parseInt(process.env.DEFAULT_EXPIRES_IN || '3600', 10),
  resultTtlMs: parseInt(process.env.RESULT_TTL_MS || '86400000', 10), // 24h
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3500',
} as const;
