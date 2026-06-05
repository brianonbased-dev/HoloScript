/**
 * Visualizer server helpers — extracted from HoloScriptRuntime (W1-T4 slice 7)
 *
 * Pure helpers for the WebSocket visualizer subsystem:
 *   - `broadcast` sends a JSON message to every open client
 *   - `handleTimeControl` applies a UI command to the time manager
 *
 * The stateful lifecycle method `startVisualizationServer` stays in
 * HSR because it composes too many concerns (wss creation +
 * timeManager init + orb snapshot + event wiring). Only the narrow,
 * cleanly-scoped pieces are extracted here.
 *
 * **Pattern**: state-container injection (pattern 4) — `wss` and
 * `timeManager` are passed in as arguments. Null-guarded inside.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 7 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2453-2492)
 */

import type { WebSocketServer } from 'ws';
// `ws` is an OPTIONAL dependency; a static value import eager-resolves it and
// breaks a `--omit=optional` cold install (W.690). Defer to first use via the
// same `barrel/lazy-peer` helper the runtime barrel uses. `WebSocket.OPEN` is
// read off the lazy proxy only when broadcasting (server already running ⇒ ws present).
import { lazyPeerSymbol } from '../barrel/lazy-peer';
const WebSocket = lazyPeerSymbol('ws', 'WebSocket') as typeof import('ws').WebSocket;

/**
 * Minimal structural type for the time controller `handleTimeControl` drives.
 * Defined LOCALLY (not imported from `@holoscript/engine/orbital`) so that
 * `@holoscript/core`'s `./runtime` type surface does not reference the optional
 * peer `@holoscript/engine` — a core-only ("cold") consumer must resolve these
 * types without engine installed (W.673-class cold-consume leak fix,
 * task_1780452479619_c25f). A real engine `TimeManager` is structurally
 * assignable to this, so callers passing the engine instance are unaffected.
 */
interface TimeControllable {
  play(): void;
  pause(): void;
  togglePause(): void;
  setTimeScale(scale: number): void;
  setDate(date: Date): void;
}

/**
 * Send a typed message to every connected WebSocket client. No-ops
 * if `wss` is null/undefined (server not yet started).
 */
export function broadcast(
  wss: WebSocketServer | null | undefined,
  type: string,
  payload: unknown,
): void {
  if (!wss) return;
  const message = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * Apply a UI-originated time-control command to the time manager.
 * No-ops if `timeManager` is null (server not yet started).
 *
 * Supported commands: play / pause / toggle / setSpeed / setDate /
 * syncRealTime. Unknown commands are silently ignored.
 */
export function handleTimeControl(
  timeManager: TimeControllable | null | undefined,
  command: string,
  value?: unknown,
): void {
  if (!timeManager) return;

  switch (command) {
    case 'play':
      timeManager.play();
      break;
    case 'pause':
      timeManager.pause();
      break;
    case 'toggle':
      timeManager.togglePause();
      break;
    case 'setSpeed':
      if (typeof value === 'number') {
        timeManager.setTimeScale(value);
      }
      break;
    case 'setDate':
      if (value) {
        timeManager.setDate(new Date(value as string | number));
      }
      break;
    case 'syncRealTime':
      timeManager.setDate(new Date());
      timeManager.setTimeScale(1);
      timeManager.play();
      break;
  }
}
