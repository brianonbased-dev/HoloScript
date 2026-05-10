import { promises as fs } from 'fs';
import type { FileHandle } from 'fs/promises';
import { dirname } from 'path';

interface JsonFileStoreOptions {
  lockTimeoutMs?: number;
  staleLockMs?: number;
  retryDelayMs?: number;
  now?: () => number;
}

export class JsonFileStore<T extends object> {
  private readonly lockPath: string;
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;
  private readonly retryDelayMs: number;
  private readonly now: () => number;

  constructor(
    private readonly filePath: string,
    private readonly createDefault: () => T,
    options: JsonFileStoreOptions = {}
  ) {
    this.lockPath = `${filePath}.lock`;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
    this.staleLockMs = options.staleLockMs ?? 30_000;
    this.retryDelayMs = options.retryDelayMs ?? 25;
    this.now = options.now ?? Date.now;
  }

  async read(): Promise<T> {
    await this.ensureDir();
    return this.readUnlocked();
  }

  async update<R>(mutate: (state: T) => R | Promise<R>): Promise<R> {
    return this.withLock(async () => {
      const state = await this.readUnlocked();
      const result = await mutate(state);
      await this.writeUnlocked(state);
      return result;
    });
  }

  private async withLock<R>(fn: () => Promise<R>): Promise<R> {
    await this.ensureDir();
    const startedAt = this.now();
    let handle: FileHandle | null = null;

    while (!handle) {
      try {
        handle = await fs.open(this.lockPath, 'wx');
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
        await this.removeStaleLock();
        if (this.now() - startedAt > this.lockTimeoutMs) {
          throw new Error(`Timed out acquiring JSON store lock: ${this.lockPath}`);
        }
        await sleep(this.retryDelayMs);
      }
    }

    try {
      return await fn();
    } finally {
      await handle.close().catch(() => undefined);
      await fs.unlink(this.lockPath).catch(() => undefined);
    }
  }

  private async removeStaleLock(): Promise<void> {
    try {
      const stat = await fs.stat(this.lockPath);
      if (this.now() - stat.mtimeMs > this.staleLockMs) {
        await fs.unlink(this.lockPath).catch(() => undefined);
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  private async readUnlocked(): Promise<T> {
    try {
      const text = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(text) as T;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return this.createDefault();
      throw error;
    }
  }

  private async writeUnlocked(state: T): Promise<void> {
    const tempPath = `${this.filePath}.${process.pid}.${this.now()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs.rename(tempPath, this.filePath);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
