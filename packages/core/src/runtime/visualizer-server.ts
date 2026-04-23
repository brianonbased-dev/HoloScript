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
import { WebSocket } from 'ws';
import type { TimeManager } from '@holoscript/engine/orbital';

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
  timeManager: TimeManager | null | undefined,
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
