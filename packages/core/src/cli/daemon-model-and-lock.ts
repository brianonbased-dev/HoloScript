/**
 * Daemon model selection and lock liveness — extracted so tests can pin
 * the three selection bugs from task_1785878992456_zf9z without importing
 * holoscript-runner.ts (which always runs main()).
 */

export const DAEMON_LOCK_STALE_MS = 120_000;

export function resolveDaemonModel(input: {
  modelExplicit: boolean;
  cliModel?: string;
  envModel?: string;
  providerDefault: string;
}): string {
  if (input.modelExplicit) {
    const selected = String(input.cliModel || '').trim();
    if (!selected) {
      throw new Error('--model requires a non-empty model identifier');
    }
    return selected;
  }
  const envModel = String(input.envModel || '').trim();
  return envModel || input.providerDefault;
}

export function isPidAlive(pid: unknown): boolean {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'EPERM') return true;
    return false;
  }
}

export function shouldReclaimDaemonLock(
  lock: { pid?: unknown; heartbeat?: unknown } | null,
  nowMs = Date.now(),
  staleMs = DAEMON_LOCK_STALE_MS
): boolean {
  if (!lock) return true;
  const heartbeat = Number(lock.heartbeat);
  const heartbeatFresh = Number.isFinite(heartbeat) && nowMs - heartbeat < staleMs;
  if (!heartbeatFresh) return true;
  return !isPidAlive(lock.pid);
}
