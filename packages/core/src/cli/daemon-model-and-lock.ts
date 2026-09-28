/**
 * Daemon provider/model selection and lock liveness — extracted so tests can pin
 * the three selection bugs from task_1785878992456_zf9z without importing
 * holoscript-runner.ts (which always runs main()).
 */

export const DAEMON_LOCK_STALE_MS = 120_000;

export type DaemonProviderName = 'sovereign' | 'anthropic' | 'xai' | 'openai' | 'ollama';

/** A known provider name (case-insensitive; 'auto' means sovereign), else undefined. */
export function parseProvider(value: string | undefined): DaemonProviderName | undefined {
  const normalized = value?.toLowerCase();
  if (normalized === 'sovereign' || normalized === 'auto') {
    return 'sovereign';
  }
  if (
    normalized === 'anthropic' ||
    normalized === 'xai' ||
    normalized === 'openai' ||
    normalized === 'ollama'
  ) {
    return normalized;
  }
  return undefined;
}

/**
 * The composition's provider_rotation list, checked. Every name must be a provider the
 * daemon knows: an unknown one used to be cast straight to a provider name and fall
 * through to createDaemonLLMProvider's last branch, which is Ollama.
 */
export function parseRotationProviders(names: unknown): DaemonProviderName[] {
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('provider_rotation must be a non-empty list of provider names.');
  }
  return names.map((name) => {
    const provider = typeof name === 'string' ? parseProvider(name) : undefined;
    if (!provider) {
      throw new Error(
        `provider_rotation names an unknown provider ${JSON.stringify(name)}. ` +
          'Use sovereign, anthropic, xai, openai or ollama.'
      );
    }
    return provider;
  });
}

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
