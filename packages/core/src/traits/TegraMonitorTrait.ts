/**
 * @TegraMonitor — Jetson tegrastats hardware monitoring trait
 *
 * Jetson-specific extension of @SystemMonitor. Reads tegrastats snapshot
 * for GPU utilisation, power draw (watts), thermal zones, and EMC bandwidth.
 * Extends the EdgeCompiler's monitor.py with Jetson GPU metrics.
 *
 * Requires: Jetson device running JetPack 5+ with tegrastats in PATH.
 *
 * Usage:
 *   traits ["tegrastats"]   // in .hsplus compositions
 *   @TegraMonitor           // in .holo/.hs objects
 */

export interface TegraMonitorConfig {
  /** tegrastats sampling interval in ms (default: 1000) */
  intervalMs?: number;
  /** Whether to expose full raw tegrastats output (default: false) */
  includeRawOutput?: boolean;
  /** Power alert threshold in watts (default: 10.0) */
  powerAlertW?: number;
  /** GPU temperature alert in °C (default: 80) */
  tempAlertC?: number;
}

export interface TegraStats {
  timestamp: number;
  /** RAM used / total in MB */
  ram_used_mb: number | null;
  ram_total_mb: number | null;
  /** GPU utilisation 0–100 */
  gpu_util_pct: number | null;
  /** GPU clock frequency in MHz */
  gpu_freq_mhz: number | null;
  /** CPU core stats: [{util_pct, freq_mhz}] */
  cpu_cores: Array<{ util_pct: number; freq_mhz: number }>;
  /** Total board power draw in watts */
  power_total_w: number | null;
  /** Thermal zone temperatures in °C keyed by zone name */
  thermal_zones: Record<string, number>;
  /** EMC bandwidth utilisation 0–100 */
  emc_util_pct: number | null;
  raw?: string;
  alerts: string[];
}

export const TEGRA_MONITOR_DEFAULTS: Required<TegraMonitorConfig> = {
  intervalMs: 1000,
  includeRawOutput: false,
  powerAlertW: 10.0,
  tempAlertC: 80,
};

export function resolveTegraMonitorConfig(
  params?: Partial<TegraMonitorConfig>
): Required<TegraMonitorConfig> {
  return { ...TEGRA_MONITOR_DEFAULTS, ...params };
}

/**
 * Parse a single line of tegrastats output into structured TegraStats.
 *
 * tegrastats output example (Orin Nano Super):
 *   RAM 1456/8064MB ... CPU [35%@1510,18%@1510,...] ... GPU 42%@918 ...
 *   POM_5V_IN 4200/4200 ... thermal CPU@42C GPU@40C ...
 */
export function parseTegraStatsLine(raw: string): Partial<TegraStats> {
  const result: Partial<TegraStats> = { raw };

  // RAM
  const ramMatch = raw.match(/RAM (\d+)\/(\d+)MB/);
  if (ramMatch) {
    result.ram_used_mb = parseInt(ramMatch[1], 10);
    result.ram_total_mb = parseInt(ramMatch[2], 10);
  }

  // GPU utilisation and freq: "GPU 42%@918"
  const gpuMatch = raw.match(/GPU\s+(\d+)%@(\d+)/);
  if (gpuMatch) {
    result.gpu_util_pct = parseInt(gpuMatch[1], 10);
    result.gpu_freq_mhz = parseInt(gpuMatch[2], 10);
  }

  // CPU cores: "CPU [35%@1510,18%@1510,...]"
  const cpuMatch = raw.match(/CPU \[([^\]]+)\]/);
  if (cpuMatch) {
    result.cpu_cores = cpuMatch[1].split(',').map((core) => {
      const m = core.match(/(\d+)%@(\d+)/);
      return m
        ? { util_pct: parseInt(m[1], 10), freq_mhz: parseInt(m[2], 10) }
        : { util_pct: 0, freq_mhz: 0 };
    });
  }

  // Power: "POM_5V_IN 4200/4200" (mW → W)
  const powMatch = raw.match(/POM_5V_IN (\d+)\/\d+/);
  if (powMatch) {
    result.power_total_w = parseInt(powMatch[1], 10) / 1000;
  }

  // Thermal zones: "CPU@42C GPU@40C SOC@39C"
  const thermalZones: Record<string, number> = {};
  const thermalMatches = raw.matchAll(/(\w+)@(\d+)C/g);
  for (const m of thermalMatches) {
    thermalZones[m[1]] = parseInt(m[2], 10);
  }
  if (Object.keys(thermalZones).length > 0) result.thermal_zones = thermalZones;

  // EMC: "EMC_FREQ 45%"
  const emcMatch = raw.match(/EMC_FREQ\s+(\d+)%/);
  if (emcMatch) result.emc_util_pct = parseInt(emcMatch[1], 10);

  return result;
}

export function computeTegraAlerts(
  stats: Partial<TegraStats>,
  config: Required<TegraMonitorConfig>
): string[] {
  const alerts: string[] = [];
  if (
    stats.power_total_w !== null &&
    stats.power_total_w !== undefined &&
    stats.power_total_w > config.powerAlertW
  ) {
    alerts.push(`high_power:${stats.power_total_w.toFixed(1)}W`);
  }
  if (stats.thermal_zones) {
    for (const [zone, temp] of Object.entries(stats.thermal_zones)) {
      if (temp > config.tempAlertC) alerts.push(`overheat:${zone}@${temp}C`);
    }
  }
  return alerts;
}
