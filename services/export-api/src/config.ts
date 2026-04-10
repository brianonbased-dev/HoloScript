/**
 * Application Configuration
 *
 * Centralized configuration with environment variable overrides.
 * All sensitive values are loaded from environment variables.
 *
 * ADR-003: API keys stored as SHA-256 hash only.
 * ADR-005: Source code in encrypted S3, NOT in database.
 */

export interface AppConfig {
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** Node environment */
  env: 'development' | 'production' | 'test';
  /** API version prefix */
  apiPrefix: string;

  /** JWT secret for token signing */
  jwtSecret: string;
  /** JWT token expiry (default: 1h) */
  jwtExpiresIn: string;

  /** Rate limiting: max requests per window */
  rateLimitMax: number;
  /** Rate limiting: window size in ms */
  rateLimitWindowMs: number;

  /** Maximum request body size */
  maxBodySize: string;

  /** Compile job timeout in ms (default: 5 minutes) */
  compileTimeoutMs: number;
  /** Maximum concurrent compile workers */
  maxCompileWorkers: number;

  /** S3 bucket for source code storage (ADR-005) */
  s3Bucket: string;
  /** S3 region */
  s3Region: string;

  /** Database connection URL */
  databaseUrl: string;

  /** Audit log retention in days */
  auditRetentionDays: number;

  /** CORS allowed origins */
  corsOrigins: string[];

  /** Log level */
  logLevel: string;
}

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function getEnvInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export function loadConfig(): AppConfig {
  return {
    port: getEnvInt('PORT', 3100),
    host: getEnv('HOST', '0.0.0.0'),
    env: getEnv('NODE_ENV', 'development') as AppConfig['env'],
    apiPrefix: '/api/v1',

    jwtSecret: getEnv('JWT_SECRET', 'CHANGE_ME_IN_PRODUCTION'),
    jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '1h'),

    rateLimitMax: getEnvInt('RATE_LIMIT_MAX', 100),
    rateLimitWindowMs: getEnvInt('RATE_LIMIT_WINDOW_MS', 60_000),

    maxBodySize: getEnv('MAX_BODY_SIZE', '1mb'),

    compileTimeoutMs: getEnvInt('COMPILE_TIMEOUT_MS', 300_000),
    maxCompileWorkers: getEnvInt('MAX_COMPILE_WORKERS', 4),

    s3Bucket: getEnv('S3_BUCKET', 'holoscript-source'),
    s3Region: getEnv('S3_REGION', 'us-east-1'),

    databaseUrl: getEnv('DATABASE_URL', 'postgresql://localhost:5432/holoscript_api'),

    auditRetentionDays: getEnvInt('AUDIT_RETENTION_DAYS', 365),

    corsOrigins: getEnv('CORS_ORIGINS', 'http://localhost:3000').split(','),

    logLevel: getEnv('LOG_LEVEL', 'info'),
  };
}

export const config = loadConfig();
