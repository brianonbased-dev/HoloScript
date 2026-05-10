import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';
import { JsonFileStore } from './JsonFileStore';
import { StorageService } from './StorageService';

type Role = 'user' | 'admin' | 'service';

interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

interface StoredSession {
  id: string;
  tokenHash: string;
  userId: string;
  username: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
}

interface UsersState {
  version: 1;
  users: Record<string, StoredUser>;
}

interface SessionsState {
  version: 1;
  sessions: Record<string, StoredSession>;
}

export interface AuthPrincipal {
  userId: string;
  username: string;
  role: Role;
  sessionId?: string;
  apiKeyId?: string;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    username: string;
    role: Role;
  };
}

interface AuthServiceOptions {
  sessionTtlMs?: number;
  now?: () => number;
  bootstrapUsername?: string;
  bootstrapPassword?: string;
  allowDevBootstrap?: boolean;
  staticApiKeys?: string[];
}

const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_KEY_LENGTH = 64;

export class AuthService {
  private readonly usersStore: JsonFileStore<UsersState>;
  private readonly sessionsStore: JsonFileStore<SessionsState>;
  private readonly sessionTtlMs: number;
  private readonly now: () => number;
  private readonly bootstrapUsername: string;
  private readonly bootstrapPassword: string;
  private readonly devUsername: string;
  private readonly devPassword: string;
  private readonly allowDevBootstrap: boolean;
  private readonly staticApiKeys: Map<string, string>;

  constructor(storage: StorageService, options: AuthServiceOptions = {}) {
    this.usersStore = new JsonFileStore(join(storage.basePath, 'auth', 'users.json'), () => ({
      version: 1,
      users: {},
    }));
    this.sessionsStore = new JsonFileStore(join(storage.basePath, 'auth', 'sessions.json'), () => ({
      version: 1,
      sessions: {},
    }));
    this.sessionTtlMs = options.sessionTtlMs ?? parseEnvInt('SESSION_TTL_MS', 7 * 24 * 60 * 60 * 1000);
    this.now = options.now ?? Date.now;
    this.bootstrapUsername = options.bootstrapUsername ?? process.env.LLM_SERVICE_BOOTSTRAP_USER ?? '';
    this.bootstrapPassword = options.bootstrapPassword ?? process.env.LLM_SERVICE_BOOTSTRAP_PASSWORD ?? '';
    this.devUsername = process.env.LLM_SERVICE_DEV_USER ?? '';
    this.devPassword = process.env.LLM_SERVICE_DEV_PASSWORD ?? '';
    this.allowDevBootstrap =
      options.allowDevBootstrap ??
      (process.env.NODE_ENV !== 'production' && Boolean(this.devUsername && this.devPassword));
    this.staticApiKeys = parseStaticApiKeys(options.staticApiKeys ?? parseEnvList('LLM_SERVICE_API_KEYS'));
  }

  async init(): Promise<void> {
    const userCount = await this.usersStore.update((state) => {
      if (Object.keys(state.users).length === 0) {
        if (this.bootstrapUsername && this.bootstrapPassword) {
          this.addUser(state, this.bootstrapUsername, this.bootstrapPassword, 'admin');
          logger.info(`[Auth] Seeded bootstrap user: ${normalizeUsername(this.bootstrapUsername)}`);
        } else if (this.allowDevBootstrap) {
          this.addUser(state, this.devUsername, this.devPassword, 'admin');
          logger.warn('[Auth] Seeded local development user from LLM_SERVICE_DEV_USER.');
        }
      }
      return Object.keys(state.users).length;
    });

    await this.pruneExpiredSessions();

    if (process.env.NODE_ENV === 'production' && userCount === 0 && this.staticApiKeys.size === 0) {
      throw new Error(
        'Production auth is fail-closed: configure LLM_SERVICE_BOOTSTRAP_USER/LLM_SERVICE_BOOTSTRAP_PASSWORD or LLM_SERVICE_API_KEYS.'
      );
    }
  }

  async authenticate(username: string, password: string): Promise<boolean> {
    const user = await this.findUser(username);

    if (!user) {
      logger.warn(`[Auth] Failed login attempt for user: ${username}`);
      return false;
    }

    if (!verifyPassword(password, user.passwordHash)) {
      logger.warn(`[Auth] Invalid password for user: ${username}`);
      return false;
    }

    logger.info(`[Auth] Successful login for user: ${username}`);
    return true;
  }

  async login(username: string, password: string): Promise<LoginResult | null> {
    const user = await this.findUser(username);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      logger.warn(`[Auth] Failed login attempt for user: ${username}`);
      return null;
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const now = new Date(this.now()).toISOString();
    const expiresAt = new Date(this.now() + this.sessionTtlMs).toISOString();
    const session: StoredSession = {
      id: uuid(),
      tokenHash,
      userId: user.id,
      username: user.username,
      role: user.role,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
    };

    await this.sessionsStore.update((state) => {
      state.sessions[tokenHash] = session;
    });

    logger.info(`[Auth] Created session for user: ${user.username}`);
    return {
      token,
      expiresAt,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  async validateBearer(token: string): Promise<AuthPrincipal | null> {
    const tokenHash = sha256(token);
    const staticApiKeyId = this.staticApiKeys.get(tokenHash);
    if (staticApiKeyId) {
      return {
        userId: `api-key:${staticApiKeyId}`,
        username: `api-key:${staticApiKeyId}`,
        role: 'service',
        apiKeyId: staticApiKeyId,
      };
    }

    return this.sessionsStore.update((state) => {
      const now = this.now();
      this.pruneExpiredSessionsFromState(state, now);
      const session = state.sessions[tokenHash];
      if (!session) return null;
      session.lastSeenAt = new Date(now).toISOString();
      return {
        userId: session.userId,
        username: session.username,
        role: session.role,
        sessionId: session.id,
      };
    });
  }

  async logout(token: string): Promise<boolean> {
    const tokenHash = sha256(token);
    return this.sessionsStore.update((state) => {
      const existed = Boolean(state.sessions[tokenHash]);
      delete state.sessions[tokenHash];
      return existed;
    });
  }

  async registerUser(username: string, password: string): Promise<boolean> {
    const normalized = normalizeUsername(username);
    if (!normalized || !password) return false;

    return this.usersStore.update((state) => {
      if (state.users[normalized]) return false;
      this.addUser(state, normalized, password, 'user');
      logger.info(`[Auth] New user registered: ${normalized}`);
      return true;
    });
  }

  async getStats(): Promise<{ users: number; activeSessions: number; staticApiKeys: number }> {
    const users = await this.usersStore.read();
    const sessions = await this.sessionsStore.read();
    const now = this.now();
    return {
      users: Object.keys(users.users).length,
      activeSessions: Object.values(sessions.sessions).filter((session) => Date.parse(session.expiresAt) > now).length,
      staticApiKeys: this.staticApiKeys.size,
    };
  }

  private async findUser(username: string): Promise<StoredUser | null> {
    const normalized = normalizeUsername(username);
    if (!normalized) return null;
    const state = await this.usersStore.read();
    return state.users[normalized] ?? null;
  }

  private addUser(state: UsersState, username: string, password: string, role: Role): StoredUser {
    const normalized = normalizeUsername(username);
    const now = new Date(this.now()).toISOString();
    const user: StoredUser = {
      id: uuid(),
      username: normalized,
      passwordHash: hashPassword(password),
      role,
      createdAt: now,
      updatedAt: now,
    };
    state.users[normalized] = user;
    return user;
  }

  private async pruneExpiredSessions(): Promise<void> {
    await this.sessionsStore.update((state) => {
      this.pruneExpiredSessionsFromState(state, this.now());
    });
  }

  private pruneExpiredSessionsFromState(state: SessionsState, now: number): void {
    for (const [tokenHash, session] of Object.entries(state.sessions)) {
      if (Date.parse(session.expiresAt) <= now) {
        delete state.sessions[tokenHash];
      }
    }
  }
}

function normalizeUsername(username: string): string {
  return String(username || '').trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_PARAMS).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, hash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseEnvInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEnvList(name: string): string[] {
  return (process.env[name] || '')
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseStaticApiKeys(values: string[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const value of values) {
    const separator = value.indexOf(':');
    const id = separator > 0 ? value.slice(0, separator).trim() : sha256(value).slice(0, 12);
    const secret = separator > 0 ? value.slice(separator + 1).trim() : value;
    if (secret) keys.set(sha256(secret), id);
  }
  return keys;
}
