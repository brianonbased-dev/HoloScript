/**
 * HoloShell local API resolution (stage-2 of the machine-state design).
 *
 * The operate-room server (ai-ecosystem/scripts/holoshell-operate-room-server.mjs)
 * binds 127.0.0.1:8747 on the same machine as a local Studio. In non-production
 * we default to it so a dev Studio needs zero env config; in production the
 * env var must be set explicitly (a Railway Studio has no local HoloShell —
 * it reads the prod MCP cache that the local publisher feeds, stage-1).
 */
export function resolveHoloShellApiUrl(): string | null {
  const explicit = process.env.HOLOSHELL_API_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.NODE_ENV !== 'production') return 'http://127.0.0.1:8747';
  return null;
}
