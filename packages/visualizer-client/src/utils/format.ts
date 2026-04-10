/**
 * Format a Date as a locale date string (e.g. "Apr 2, 2026").
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a Date as a locale time string (e.g. "02:30 PM").
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a speed value for display in the time controls.
 * 365.25 -> "1Y/24H", 1000 -> "1k", 10000 -> "10k", else -> "Nx"
 */
export function formatSpeed(speed: number): string {
  if (speed === 365.25) return '1Y/24H';
  if (speed >= 1000) return `${speed / 1000}k`;
  return `${speed}`;
}

/**
 * Map a ConnectionStatus to a display label.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'connected':
      return 'SYSTEM ONLINE';
    case 'connecting':
      return 'SYNCING...';
    case 'error':
      return 'CORE ERROR';
    default:
      return 'OFFLINE';
  }
}

/**
 * Map a ConnectionStatus to a CSS color string.
 */
export function statusColor(status: string): string {
  switch (status) {
    case 'connected':
      return '#00ff00';
    case 'connecting':
      return '#ffaa00';
    default:
      return '#ff0000';
  }
}

/**
 * Compute the Euclidean distance from origin for a 3D position.
 */
export function distanceFromOrigin(pos: { x: number; y: number; z: number }): number {
  return Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
}
