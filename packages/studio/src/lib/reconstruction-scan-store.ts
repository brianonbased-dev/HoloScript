/**
 * Reconstruction room-scan sessions: in-memory (default) or Upstash Redis when
 * UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN are set (matches connector-upstash env).
 */

import type { ReconstructionManifest } from '@holoscript/core/reconstruction';
import { Redis } from '@upstash/redis';
import { clientIpFromRequest, takeRateLimitToken } from './reconstruction-session-rate-limit';

export interface ScanSession {
  token: string;
  createdAt: string;
  expiresAt: string;
  desktopUser?: string;
  status: 'pending-phone' | 'capturing' | 'uploaded' | 'processing' | 'done' | 'error';
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
  frameCount?: number;
  videoBytes?: number;
  videoHash?: string;
  lastError?: string;
  replayFingerprint?: string;
  manifest?: ReconstructionManifest;
}

const SESSION_KEY = (t: string) => `holoscript:scan-session:${t}`;
const RL_KEY = (kind: string, id: string) => `holoscript:scan-rl:${kind}:${id}`;

function sessionTtlSec(session: ScanSession): number {
  const ms = new Date(session.expiresAt).getTime() - Date.now();
  return Math.max(30, Math.min(Math.ceil(ms / 1000), 24 * 3600));
}

declare global {
  // eslint-disable-next-line no-var
  var __reconstructionScanSessions__: Map<string, ScanSession> | undefined;
}

const memorySessions: Map<string, ScanSession> =
  globalThis.__reconstructionScanSessions__ ??
  (globalThis.__reconstructionScanSessions__ = new Map());

function pruneMemoryExpired(): void {
  const now = Date.now();
  for (const [token, session] of memorySessions) {
    if (new Date(session.expiresAt).getTime() < now) {
      memorySessions.delete(token);
    }
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export interface ScanSessionStore {
  mode: 'memory' | 'redis';
  get(token: string): Promise<ScanSession | undefined>;
  set(token: string, session: ScanSession): Promise<void>;
  delete(token: string): Promise<void>;
  pruneExpired(): Promise<void>;
  rateLimitPost(ip: string, max: number, windowSec: number): Promise<RateLimitResult>;
  rateLimitGet(ip: string, max: number, windowSec: number): Promise<RateLimitResult>;
  rateLimitPut(token: string, max: number, windowSec: number): Promise<RateLimitResult>;
}

class MemoryScanSessionStore implements ScanSessionStore {
  readonly mode = 'memory' as const;

  async get(token: string): Promise<ScanSession | undefined> {
    pruneMemoryExpired();
    return memorySessions.get(token);
  }

  async set(token: string, session: ScanSession): Promise<void> {
    memorySessions.set(token, session);
  }

  async delete(token: string): Promise<void> {
    memorySessions.delete(token);
  }

  async pruneExpired(): Promise<void> {
    pruneMemoryExpired();
  }

  async rateLimitPost(ip: string, max: number, windowSec: number): Promise<RateLimitResult> {
    const ms = windowSec * 1000;
    const r = takeRateLimitToken(`scan-session:post:${ip}`, max, ms);
    return r.ok ? { ok: true } : { ok: false, retryAfterSec: r.retryAfterSec };
  }

  async rateLimitGet(ip: string, max: number, windowSec: number): Promise<RateLimitResult> {
    const ms = windowSec * 1000;
    const r = takeRateLimitToken(`scan-session:get:${ip}`, max, ms);
    return r.ok ? { ok: true } : { ok: false, retryAfterSec: r.retryAfterSec };
  }

  async rateLimitPut(token: string, max: number, windowSec: number): Promise<RateLimitResult> {
    const ms = windowSec * 1000;
    const r = takeRateLimitToken(`scan-session:put:${token}`, max, ms);
    return r.ok ? { ok: true } : { ok: false, retryAfterSec: r.retryAfterSec };
  }
}

class RedisScanSessionStore implements ScanSessionStore {
  readonly mode = 'redis' as const;

  constructor(private readonly redis: Redis) {}

  async get(token: string): Promise<ScanSession | undefined> {
    const raw = await this.redis.get(SESSION_KEY(token));
    if (raw == null) return undefined;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as ScanSession;
      } catch {
        return undefined;
      }
    }
    return raw as ScanSession;
  }

  async set(token: string, session: ScanSession): Promise<void> {
    const ex = sessionTtlSec(session);
    await this.redis.set(SESSION_KEY(token), JSON.stringify(session), { ex });
  }

  async delete(token: string): Promise<void> {
    await this.redis.del(SESSION_KEY(token));
  }

  async pruneExpired(): Promise<void> {
    /* TTL on keys handles expiry */
  }

  private async rl(key: string, max: number, windowSec: number): Promise<RateLimitResult> {
    const n = await this.redis.incr(key);
    if (n === 1) {
      await this.redis.expire(key, windowSec);
    }
    if (n > max) {
      const ttl = await this.redis.ttl(key);
      return { ok: false, retryAfterSec: Math.max(1, ttl > 0 ? ttl : windowSec) };
    }
    return { ok: true };
  }

  async rateLimitPost(ip: string, max: number, windowSec: number): Promise<RateLimitResult> {
    return this.rl(RL_KEY('post', ip), max, windowSec);
  }

  async rateLimitGet(ip: string, max: number, windowSec: number): Promise<RateLimitResult> {
    return this.rl(RL_KEY('get', ip), max, windowSec);
  }

  async rateLimitPut(token: string, max: number, windowSec: number): Promise<RateLimitResult> {
    return this.rl(RL_KEY('put', token), max, windowSec);
  }
}

let singleton: ScanSessionStore | null = null;

export function getScanSessionStore(): ScanSessionStore {
  if (singleton) return singleton;
  const url = process.env.UPSTASH_REDIS_URL?.trim();
  const token = process.env.UPSTASH_REDIS_TOKEN?.trim();
  if (url && token) {
    singleton = new RedisScanSessionStore(new Redis({ url, token }));
  } else {
    singleton = new MemoryScanSessionStore();
  }
  return singleton;
}

/** @internal */
export function __resetScanSessionStoreForTests(): void {
  singleton = null;
  memorySessions.clear();
}

export function scanStoreUsesRedis(): boolean {
  return getScanSessionStore().mode === 'redis';
}

export { clientIpFromRequest };
