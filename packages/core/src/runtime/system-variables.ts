/**
 * System variables — extracted from HoloScriptRuntime (W1-T4 slice 9)
 *
 * Initializes the runtime's reactive `$time`, `$date`, `$user`,
 * `$location`, `$weather`, `$wallet`, `$ai_config`, and
 * `$chat_status` system variables. Defaults are only written if
 * the variable is currently undefined — callers override at any
 * time and the defaults don't overwrite.
 *
 * **Mock data**: the default payloads (e.g. `city: 'Neo Tokyo'`)
 * are demo-visible constants. The host/runtime is expected to
 * overwrite these with real data from its environment. Keeping
 * them as named consts here (rather than inline object literals
 * allocated every tick) also avoids per-frame allocations.
 *
 * **Pattern**: multi-callback + injected browser state (pattern 5).
 * Caller threads `setVariable`, `getVariable`, and the already-read
 * `brittneyApiKeysJson` string so the pure module has no hidden
 * dependency on `localStorage`.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 9 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2148-2226)
 */

import { readJson } from '../errors/safeJsonParse';

// ──────────────────────────────────────────────────────────────────
// Default payloads — extracted as named consts (once-alloc vs.
// per-tick re-alloc inside the original inline literals).
// ──────────────────────────────────────────────────────────────────

const DEFAULT_USER = {
  id: 'user_123',
  name: 'Alpha Explorer',
  level: 42,
  rank: 'Legendary',
  achievements: ['First World', 'Spirit Guide'],
  preferences: { theme: 'holographic', language: 'en' },
};

const DEFAULT_LOCATION = {
  city: 'Neo Tokyo',
  region: 'Holo-Sector 7',
  coordinates: { lat: 35.6895, lng: 139.6917 },
  altitude: 450,
};

const DEFAULT_WEATHER = {
  condition: 'Neon Mist',
  temperature: 24,
  humidity: 65,
  windSpeed: 12,
  unit: 'C',
};

const DEFAULT_WALLET = {
  address: '0xHolo...42ff',
  balance: 1337.5,
  currency: 'HOLO',
  network: 'MainNet',
};

const DEFAULT_CHAT_STATUS = {
  active: true,
  typing: false,
  version: '1.0.0-brittney',
};

/** Context passed by the runtime — reads + writes + injected host state. */
export interface SystemVariablesContext {
  setVariable: (name: string, value: unknown) => void;
  getVariable: (name: string) => unknown;
  /**
   * Raw JSON string previously read from `localStorage.brittney_api_keys`,
   * or `null` if localStorage is unavailable / key missing. The pure
   * module parses and counts configured keys internally so the caller
   * doesn't need to care about parsing/error shapes.
   */
  brittneyApiKeysJson: string | null;
}

/**
 * Update the runtime's system variables. Time variables ($time,
 * $date, …) are always overwritten from the current clock. Mock
 * data variables ($user, $location, …) are written only if
 * undefined so host overrides persist.
 */
export function updateSystemVariables(ctx: SystemVariablesContext): void {
  const now = new Date();

  // Time variables — always refreshed
  ctx.setVariable('$time', now.toLocaleTimeString());
  ctx.setVariable('$date', now.toLocaleDateString());
  ctx.setVariable('$timestamp', now.getTime());
  ctx.setVariable('$hour', now.getHours());
  ctx.setVariable('$minute', now.getMinutes());
  ctx.setVariable('$second', now.getSeconds());

  // Mock real-life data — only set if undefined (host overrides)
  if (ctx.getVariable('$user') === undefined) {
    ctx.setVariable('$user', DEFAULT_USER);
  }

  if (ctx.getVariable('$location') === undefined) {
    ctx.setVariable('$location', DEFAULT_LOCATION);
  }

  if (ctx.getVariable('$weather') === undefined) {
    ctx.setVariable('$weather', DEFAULT_WEATHER);
  }

  if (ctx.getVariable('$wallet') === undefined) {
    ctx.setVariable('$wallet', DEFAULT_WALLET);
  }

  if (ctx.getVariable('$ai_config') === undefined) {
    let configuredCount = 0;
    if (ctx.brittneyApiKeysJson) {
      try {
        const keys = readJson(ctx.brittneyApiKeysJson) as Record<string, unknown>;
        configuredCount = Object.values(keys).filter((k) => !!k).length;
      } catch (_e) {
        // Intentionally swallowed: malformed localStorage JSON should not block runtime init
      }
    }

    ctx.setVariable('$ai_config', {
      status: configuredCount > 0 ? 'configured' : 'pending',
      providerCount: configuredCount,
      lastUpdated: Date.now(),
    });
  }

  if (ctx.getVariable('$chat_status') === undefined) {
    ctx.setVariable('$chat_status', DEFAULT_CHAT_STATUS);
  }
}
