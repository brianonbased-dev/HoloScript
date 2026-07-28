/**
 * @JetsonGPU — NVIDIA Jetson GPU extension trait
 *
 * Jetson-specific extension. Declares CUDA compute availability, power mode,
 * and JetPack version. Triggers EdgeCompiler to emit NVIDIA-specific sections:
 * nvpmodel power-mode config, jetson_clocks call, and CUDA capability hints.
 *
 * Compose with @LocalInference + @TegraMonitor for a full Jetson brain stack.
 *
 * Usage:
 *   traits ["jetson", "local_inference", "tegrastats"]   // .hsplus
 *   @JetsonGPU                                           // .holo/.hs
 */

export type JetsonPowerMode =
  | 'MAXN' // Max performance (all cores, max freq)
  | 'MAXN_SUPER' // Orin Nano Super max (6-core + GPU boost)
  | '10W' // 10W power cap
  | '15W' // 15W power cap
  | '25W' // 25W power cap (Orin NX)
  | 'DEFAULT'; // Board default

export type JetsonSoC = 'orin-nano' | 'orin-nx' | 'agx-orin' | 'xavier-nx' | 'nano' | 'unknown';

export interface JetsonGPUConfig {
  /** Target SoC variant (default: orin-nano) */
  soc?: JetsonSoC;
  /** Power mode to set on startup (default: MAXN_SUPER for Orin Nano Super) */
  powerMode?: JetsonPowerMode;
  /** nvpmodel mode index (0 = MAXN on most Orin boards) */
  nvpmodelIndex?: number;
  /** Whether to run jetson_clocks on startup (default: true) */
  jetsonClocks?: boolean;
  /** JetPack version (informational) */
  jetpackVersion?: string;
  /** CUDA compute capability (e.g. "8.7" for Orin) */
  cudaComputeCapability?: string;
  /** Available GPU CUDA cores */
  cudaCores?: number;
}

export interface JetsonGPUState {
  soc: JetsonSoC;
  powerMode: JetsonPowerMode;
  cudaAvailable: boolean;
  jetpackVersion: string | null;
  gpuUtilPct: number | null;
  gpuFreqMHz: number | null;
  powerDrawW: number | null;
  thermalZones: Record<string, number>;
}

/** Orin Nano Super 8GB verified config (W.733, 2026-06-15) */
export const JETSON_ORIN_NANO_SUPER_DEFAULTS: Required<JetsonGPUConfig> = {
  soc: 'orin-nano',
  powerMode: 'MAXN_SUPER',
  nvpmodelIndex: 0,
  jetsonClocks: true,
  jetpackVersion: '6.2.1',
  cudaComputeCapability: '8.7',
  cudaCores: 1024,
};

export function resolveJetsonGPUConfig(
  params?: Partial<JetsonGPUConfig>
): Required<JetsonGPUConfig> {
  return { ...JETSON_ORIN_NANO_SUPER_DEFAULTS, ...params };
}

/** Map SoC to nvpmodel index for MAXN mode */
export const SOC_MAXN_MODE: Record<JetsonSoC, number> = {
  'orin-nano': 0,
  'orin-nx': 0,
  'agx-orin': 0,
  'xavier-nx': 8,
  nano: 0,
  unknown: 0,
};

export function nvpmodelCommand(config: Required<JetsonGPUConfig>): string {
  const idx = config.nvpmodelIndex ?? SOC_MAXN_MODE[config.soc];
  return `sudo nvpmodel -m ${idx}`;
}
