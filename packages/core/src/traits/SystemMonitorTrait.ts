/**
 * @SystemMonitor — generic edge device health monitor trait
 *
 * Provides CPU, RAM, disk, and process health polling on any Linux edge device.
 * Extended by @TegraMonitor for Jetson-specific GPU/power stats.
 * Enables the EdgeCompiler's monitor.py with a /health HTTP endpoint.
 *
 * Usage:
 *   traits ["system_monitor"]   // in .hsplus compositions
 *   @SystemMonitor              // in .holo/.hs objects
 */

export interface SystemMonitorConfig {
  /** Port for the /health HTTP endpoint (default: 9090) */
  port?: number;
  /** Poll interval in seconds (default: 5) */
  pollIntervalS?: number;
  /** Whether to expose disk stats (default: true) */
  includeDisk?: boolean;
  /** Whether to expose process list (default: false — PII risk) */
  includeProcessList?: boolean;
  /** Alert threshold: load average 1m (default: 4.0) */
  loadAlertThreshold?: number;
  /** Alert threshold: free RAM MB (default: 256) */
  memAlertThresholdMB?: number;
}

export interface DeviceHealthStats {
  platform: string;
  node: string;
  timestamp: number;
  load_1m?: number;
  load_5m?: number;
  load_15m?: number;
  mem_total_kb?: number;
  mem_avail_kb?: number;
  mem_used_pct?: number;
  disk_total_gb?: number;
  disk_avail_gb?: number;
  disk_used_pct?: number;
  alerts: string[];
}

export const SYSTEM_MONITOR_DEFAULTS: Required<SystemMonitorConfig> = {
  port: 9090,
  pollIntervalS: 5,
  includeDisk: true,
  includeProcessList: false,
  loadAlertThreshold: 4.0,
  memAlertThresholdMB: 256,
};

export function resolveSystemMonitorConfig(
  params?: Partial<SystemMonitorConfig>
): Required<SystemMonitorConfig> {
  return { ...SYSTEM_MONITOR_DEFAULTS, ...params };
}

export function computeAlerts(stats: DeviceHealthStats, config: Required<SystemMonitorConfig>): string[] {
  const alerts: string[] = [];
  if (stats.load_1m !== undefined && stats.load_1m > config.loadAlertThreshold) {
    alerts.push(`high_load:${stats.load_1m.toFixed(2)}`);
  }
  if (stats.mem_avail_kb !== undefined && stats.mem_avail_kb < config.memAlertThresholdMB * 1024) {
    alerts.push(`low_mem:${Math.round(stats.mem_avail_kb / 1024)}MB`);
  }
  if (stats.disk_used_pct !== undefined && stats.disk_used_pct > 90) {
    alerts.push(`disk_full:${stats.disk_used_pct.toFixed(1)}%`);
  }
  return alerts;
}
