/**
 * Structured HoloMap lifecycle logs for support (JSON lines on stderr/console).
 * Disable with HOLOMAP_LOG=0.
 */

function loggingDisabled(): boolean {
  try {
    return typeof process !== 'undefined' && process.env?.HOLOMAP_LOG === '0';
  } catch {
    return false;
  }
}

export function createHoloMapRunId(): string {
  try {
    const c = globalThis.crypto;
    if (c && 'randomUUID' in c) {
      return `hm_${(c as Crypto).randomUUID().slice(0, 8)}`;
    }
  } catch {
    /* ignore */
  }
  return `hm_${Math.random().toString(36).slice(2, 10)}`;
}

export function logHoloMapEvent(
  runId: string,
  event: 'init' | 'step' | 'finalize' | 'dispose' | 'error',
  detail?: Record<string, unknown>,
): void {
  if (loggingDisabled()) {
    return;
  }
  const payload = {
    t: new Date().toISOString(),
    runId,
    event,
    ...detail,
  };
  console.log(`[HoloMap] ${JSON.stringify(payload)}`);
}
