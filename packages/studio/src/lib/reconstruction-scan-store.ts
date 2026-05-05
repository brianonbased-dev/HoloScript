/**
 * Reconstruction room-scan sessions: local file store by default, or Upstash
 * Redis when UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN are set.
 *
 * The file store is intentional for local Studio: desktop polls localhost while
 * the phone often calls the LAN IP, and Next dev workers/HMR can split or reset
 * module globals. File persistence keeps the QR session visible across both
 * request paths without requiring Redis for lab work.
 */

import type { ReconstructionManifest } from '@holoscript/core/reconstruction';
import type { HoloMapScanRenderAsset } from './holomap-scan-render';
import { Redis } from '@upstash/redis';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clientIpFromRequest, takeRateLimitToken } from './reconstruction-session-rate-limit';

export type ScanKind = 'room' | 'face';

export interface ScanSession {
  token: string;
  createdAt: string;
  expiresAt: string;
  desktopUser?: string;
  status:
    | 'pending-phone'
    | 'phone-connected'
    | 'capturing'
    | 'uploaded'
    | 'processing'
    | 'done'
    | 'error';
  scanKind?: ScanKind;
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
  frameCount?: number;
  videoBytes?: number;
  videoHash?: string;
  lastError?: string;
  replayFingerprint?: string;
  manifest?: ReconstructionManifest;
  renderAsset?: HoloMapScanRenderAsset;
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
  mode: 'memory' | 'file' | 'redis';
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

class FileScanSessionStore implements ScanSessionStore {
  readonly mode = 'file' as const;

  constructor(private readonly rootDir: string) {}

  private async ensureDir(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  private sessionPath(token: string): string | null {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null;
    return join(this.rootDir, `${token}.json`);
  }

  async get(token: string): Promise<ScanSession | undefined> {
    const path = this.sessionPath(token);
    if (!path) return undefined;

    try {
      const raw = await readFile(path, 'utf8');
      const session = JSON.parse(raw) as ScanSession;
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        await this.delete(token);
        return undefined;
      }
      return session;
    } catch {
      return undefined;
    }
  }

  async set(token: string, session: ScanSession): Promise<void> {
    const path = this.sessionPath(token);
    if (!path) return;

    await this.ensureDir();
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(session), 'utf8');
    await rename(tmpPath, path);
  }

  async delete(token: string): Promise<void> {
    const path = this.sessionPath(token);
    if (!path) return;
    await rm(path, { force: true });
  }

  async pruneExpired(): Promise<void> {
    await this.ensureDir();
    const now = Date.now();
    let entries: string[];
    try {
      entries = await readdir(this.rootDir);
    } catch {
      return;
    }

    await Promise.all(
      entries
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          const path = join(this.rootDir, name);
          try {
            const raw = await readFile(path, 'utf8');
            const session = JSON.parse(raw) as ScanSession;
            if (new Date(session.expiresAt).getTime() < now) {
              await rm(path, { force: true });
            }
          } catch {
            await rm(path, { force: true });
          }
        }),
    );
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
  const forcedStore = process.env.STUDIO_SCAN_SESSION_STORE?.trim().toLowerCase();
  const url = process.env.UPSTASH_REDIS_URL?.trim();
  const token = process.env.UPSTASH_REDIS_TOKEN?.trim();
  if (forcedStore === 'memory') {
    singleton = new MemoryScanSessionStore();
  } else if (url && token && forcedStore !== 'file') {
    singleton = new RedisScanSessionStore(new Redis({ url, token }));
  } else {
    singleton = new FileScanSessionStore(
      process.env.STUDIO_SCAN_SESSION_DIR?.trim() ||
        join(tmpdir(), 'holoscript-studio-scan-sessions'),
    );
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
