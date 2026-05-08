/**
 * HoloLand Device Lab — hardware readiness probes and receipts.
 *
 * This is the executable counterpart to validation-receipt data models: it
 * runs local hardware checks, attaches headset/replay evidence, and emits a
 * durable receipt that agents can cite before claiming HoloLand readiness.
 *
 * task_1778188462361_2597
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { platform, release, arch, cpus, freemem, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export type ProbeStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface ProbeCheck {
  id: string;
  label: string;
  status: ProbeStatus;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface DeviceGotcha {
  id: string;
  severity: 'low' | 'medium' | 'high';
  summary: string;
  evidenceCheckId: string;
}

export interface GpuController {
  name: string;
  driverVersion?: string;
  adapterRAMGB?: number;
}

export interface RuntimeInventory {
  platform: string;
  release: string;
  arch: string;
  nodeVersion: string;
  v8Version: string;
  cpuModel: string;
  logicalCores: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
  gpuControllers: GpuController[];
  env: {
    ci: boolean;
    webgpuProbeChrome?: string;
    webgpuProbeAngle?: string;
  };
}

export interface ArtifactReceipt {
  kind: 'webgpu-report' | 'headset-report' | 'replay';
  path: string;
  sha256: string;
  bytes: number;
  capturedAt: string;
}

export interface DeviceLabReceipt {
  schemaVersion: 'hololand-device-lab-receipt/v1';
  receiptId: string;
  taskId?: string;
  createdAt: string;
  generatedBy: '@holoscript/hololand-platform/device-lab';
  command: string;
  host: RuntimeInventory;
  checks: ProbeCheck[];
  artifacts: ArtifactReceipt[];
  gotchas: DeviceGotcha[];
  overallStatus: Exclude<ProbeStatus, 'skipped'>;
}

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunnerOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandRunnerOptions
) => CommandResult;

export interface WebGpuProbeCommand {
  command: string;
  args: string[];
}

export interface DeviceLabOptions {
  cwd?: string;
  now?: string;
  taskId?: string;
  command?: string;
  skipWebGpu?: boolean;
  webgpuReportPath?: string;
  webgpuProbeCommand?: WebGpuProbeCommand;
  headsetReportPath?: string;
  replayPath?: string;
  commandRunner?: CommandRunner;
  env?: Record<string, string | undefined>;
}

interface QuestProbeRow {
  capability: string;
  status: 'OK' | 'WARN' | 'FAIL';
  notes: string;
}

const WASM_SIMD_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
  0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b,
]);

export const DEFAULT_DEVICE_LAB_OUTPUT_DIR = '.holoscript/device-lab';

export function defaultCommandRunner(
  command: string,
  args: string[],
  options: CommandRunnerOptions = {}
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 20_000,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
  };
}

export function detectWasmSimd(): ProbeCheck {
  const supported = typeof WebAssembly !== 'undefined' && WebAssembly.validate(WASM_SIMD_BYTES);

  return {
    id: 'wasm-simd',
    label: 'WASM SIMD',
    status: supported ? 'pass' : 'fail',
    detail: supported
      ? 'WebAssembly SIMD validation passed.'
      : 'WebAssembly SIMD validation failed; HoloLand must use scalar WASM/TypeScript fallback.',
    evidence: {
      nodeVersion: process.version,
      v8Version: process.versions.v8,
    },
  };
}

export function collectRuntimeInventory(options: DeviceLabOptions = {}): RuntimeInventory {
  const env = options.env ?? process.env;
  const cpu = cpus()[0];

  return {
    platform: platform(),
    release: release(),
    arch: arch(),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    cpuModel: cpu?.model ?? 'unknown',
    logicalCores: cpus().length,
    totalMemoryGB: roundGB(totalmem()),
    freeMemoryGB: roundGB(freemem()),
    gpuControllers: collectGpuControllers(options),
    env: {
      ci: env.CI === '1' || env.CI === 'true',
      webgpuProbeChrome: env.WEBGPU_PROBE_CHROME,
      webgpuProbeAngle: env.WEBGPU_PROBE_ANGLE,
    },
  };
}

export function runDeviceLabProbe(options: DeviceLabOptions = {}): DeviceLabReceipt {
  const cwd = resolve(options.cwd ?? process.cwd());
  const now = options.now ?? new Date().toISOString();
  const artifacts: ArtifactReceipt[] = [];
  const checks: ProbeCheck[] = [detectWasmSimd(), buildRuntimeInventoryCheck(options)];

  const webgpu = buildWebGpuCheck({ ...options, cwd, now }, artifacts);
  checks.push(webgpu);

  const headset = buildHeadsetCheck({ ...options, cwd, now }, artifacts);
  checks.push(headset);

  const replay = buildReplayCheck({ ...options, cwd, now }, artifacts);
  checks.push(replay);

  const gotchas = deriveDeviceGotchas(checks);
  const receiptBase: Omit<DeviceLabReceipt, 'receiptId'> = {
    schemaVersion: 'hololand-device-lab-receipt/v1',
    ...(options.taskId ? { taskId: options.taskId } : {}),
    createdAt: now,
    generatedBy: '@holoscript/hololand-platform/device-lab',
    command: options.command ?? 'hololand-device-lab',
    host: collectRuntimeInventory(options),
    checks,
    artifacts,
    gotchas,
    overallStatus: computeOverallStatus(checks),
  };

  const digest = sha256Canonical(receiptBase);
  return {
    receiptId: `hldev_${digest.slice(0, 16)}`,
    ...receiptBase,
  };
}

export function writeDeviceLabReceipt(receipt: DeviceLabReceipt, outPath: string): string {
  const target = resolve(outPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return target;
}

export function defaultReceiptPath(cwd: string, now: string): string {
  const safe = now.replace(/[:.]/g, '-');
  return join(cwd, DEFAULT_DEVICE_LAB_OUTPUT_DIR, `hololand-device-lab-${safe}.json`);
}

export function parseQuestProbeMarkdown(markdown: string): QuestProbeRow[] {
  const rows: QuestProbeRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 4) continue;
    if (!/^\d+$/.test(cells[0])) continue;
    const status = cells[2];
    if (status !== 'OK' && status !== 'WARN' && status !== 'FAIL') continue;
    rows.push({
      capability: cells[1],
      status,
      notes: cells[3],
    });
  }
  return rows;
}

export function deriveDeviceGotchas(checks: ProbeCheck[]): DeviceGotcha[] {
  const gotchas: DeviceGotcha[] = [];
  for (const check of checks) {
    if (check.status === 'pass') continue;
    if (check.id === 'webgpu-browser') {
      gotchas.push({
        id: 'G.HW.WEBGPU_BROWSER',
        severity: check.status === 'fail' ? 'high' : 'medium',
        summary:
          check.status === 'skipped'
            ? 'WebGPU browser smoke was not run; HoloLand readiness cannot claim GPU path coverage.'
            : 'WebGPU browser smoke failed; HoloLand must keep WASM/TypeScript fallback active.',
        evidenceCheckId: check.id,
      });
    } else if (check.id === 'wasm-simd') {
      gotchas.push({
        id: 'G.HW.WASM_SIMD',
        severity: 'high',
        summary: 'WASM SIMD is unavailable; SIMD-optimized HoloLand paths need scalar fallback.',
        evidenceCheckId: check.id,
      });
    } else if (check.id === 'headset-report') {
      gotchas.push({
        id: 'G.HW.HEADSET_REPORT',
        severity: check.status === 'fail' ? 'high' : 'medium',
        summary:
          check.status === 'skipped'
            ? 'Quest/headset probe report missing; headset-specific readiness is unproven.'
            : 'Quest/headset probe contains warnings or failures that need device-specific follow-up.',
        evidenceCheckId: check.id,
      });
    } else if (check.id === 'replay-receipt') {
      gotchas.push({
        id: 'G.HW.REPLAY_RECEIPT',
        severity: 'medium',
        summary:
          check.status === 'skipped'
            ? 'Replay receipt not attached; the run has no deterministic replay evidence.'
            : 'Replay receipt capture failed; evidence layer is incomplete.',
        evidenceCheckId: check.id,
      });
    } else if (check.id === 'runtime-inventory') {
      gotchas.push({
        id: 'G.HW.GPU_INVENTORY',
        severity: 'medium',
        summary: 'No local GPU controller was detected in the runtime inventory.',
        evidenceCheckId: check.id,
      });
    }
  }
  return gotchas;
}

function buildRuntimeInventoryCheck(options: DeviceLabOptions): ProbeCheck {
  const inventory = collectRuntimeInventory(options);
  const hasGpu = inventory.gpuControllers.length > 0;
  return {
    id: 'runtime-inventory',
    label: 'Local GPU/runtime inventory',
    status: hasGpu ? 'pass' : 'warn',
    detail: hasGpu
      ? `Detected ${inventory.gpuControllers.length} GPU controller(s) on ${inventory.platform}.`
      : `No GPU controller detected on ${inventory.platform}; browser probes may still expose WebGPU adapters.`,
    evidence: {
      platform: inventory.platform,
      arch: inventory.arch,
      nodeVersion: inventory.nodeVersion,
      logicalCores: inventory.logicalCores,
      totalMemoryGB: inventory.totalMemoryGB,
      gpuControllers: inventory.gpuControllers,
    },
  };
}

function buildWebGpuCheck(options: DeviceLabOptions, artifacts: ArtifactReceipt[]): ProbeCheck {
  if (options.skipWebGpu) {
    return {
      id: 'webgpu-browser',
      label: 'WebGPU browser smoke',
      status: 'skipped',
      detail: 'Skipped by CLI flag.',
    };
  }

  if (options.webgpuReportPath) {
    const reportPath = resolve(options.cwd ?? process.cwd(), options.webgpuReportPath);
    return checkWebGpuReportFile(reportPath, options.now ?? new Date().toISOString(), artifacts);
  }

  const command =
    options.webgpuProbeCommand ?? defaultWebGpuProbeCommand(options.cwd ?? process.cwd());
  if (!command) {
    return {
      id: 'webgpu-browser',
      label: 'WebGPU browser smoke',
      status: 'skipped',
      detail:
        'No WebGPU probe command available. Expected scripts/probe-webgpu.mjs or --webgpu-report.',
    };
  }

  const runner = options.commandRunner ?? defaultCommandRunner;
  const result = runner(command.command, command.args, {
    cwd: options.cwd,
    timeoutMs: 60_000,
    env: options.env,
  });

  const parsed = parseJsonRecord(result.stdout);
  const ok = parsed?.ok === true;
  return {
    id: 'webgpu-browser',
    label: 'WebGPU browser smoke',
    status: ok ? 'pass' : 'fail',
    detail: ok
      ? 'WebGPU adapter/device smoke shader completed.'
      : webGpuFailureDetail(parsed, result),
    evidence: parsed ?? {
      exitStatus: result.status,
      stderr: result.stderr.slice(0, 400),
    },
  };
}

function buildHeadsetCheck(options: DeviceLabOptions, artifacts: ArtifactReceipt[]): ProbeCheck {
  if (!options.headsetReportPath) {
    return {
      id: 'headset-report',
      label: 'Quest/headset probe report',
      status: 'skipped',
      detail:
        'No headset report supplied. Export observations.md from Studio /quest-probe and pass --headset-report.',
    };
  }

  const reportPath = resolve(options.cwd ?? process.cwd(), options.headsetReportPath);
  if (!existsSync(reportPath)) {
    return {
      id: 'headset-report',
      label: 'Quest/headset probe report',
      status: 'fail',
      detail: `Headset report not found: ${reportPath}`,
    };
  }

  artifacts.push(
    buildArtifactReceipt('headset-report', reportPath, options.now ?? new Date().toISOString())
  );
  const rows = parseQuestProbeMarkdown(readFileSync(reportPath, 'utf8'));
  if (rows.length === 0) {
    return {
      id: 'headset-report',
      label: 'Quest/headset probe report',
      status: 'fail',
      detail: 'Headset report did not contain QuestProbe observation rows.',
    };
  }

  const failures = rows.filter((row) => row.status === 'FAIL');
  const warnings = rows.filter((row) => row.status === 'WARN');
  return {
    id: 'headset-report',
    label: 'Quest/headset probe report',
    status: failures.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
    detail:
      failures.length > 0
        ? `${failures.length} headset capability check(s) failed.`
        : warnings.length > 0
          ? `${warnings.length} headset capability check(s) warned.`
          : `${rows.length} headset capability check(s) passed.`,
    evidence: {
      rows,
    },
  };
}

function buildReplayCheck(options: DeviceLabOptions, artifacts: ArtifactReceipt[]): ProbeCheck {
  if (!options.replayPath) {
    return {
      id: 'replay-receipt',
      label: 'Replay receipt capture',
      status: 'skipped',
      detail:
        'No replay artifact supplied. Pass --replay with a scene replay, trace, or validation receipt.',
    };
  }

  const replayPath = resolve(options.cwd ?? process.cwd(), options.replayPath);
  if (!existsSync(replayPath)) {
    return {
      id: 'replay-receipt',
      label: 'Replay receipt capture',
      status: 'fail',
      detail: `Replay artifact not found: ${replayPath}`,
    };
  }

  const receipt = buildArtifactReceipt(
    'replay',
    replayPath,
    options.now ?? new Date().toISOString()
  );
  artifacts.push(receipt);
  return {
    id: 'replay-receipt',
    label: 'Replay receipt capture',
    status: 'pass',
    detail: `Captured replay artifact sha256:${receipt.sha256.slice(0, 16)} (${receipt.bytes} bytes).`,
    evidence: {
      artifact: receipt,
    },
  };
}

function checkWebGpuReportFile(
  reportPath: string,
  now: string,
  artifacts: ArtifactReceipt[]
): ProbeCheck {
  if (!existsSync(reportPath)) {
    return {
      id: 'webgpu-browser',
      label: 'WebGPU browser smoke',
      status: 'fail',
      detail: `WebGPU report not found: ${reportPath}`,
    };
  }

  artifacts.push(buildArtifactReceipt('webgpu-report', reportPath, now));
  const parsed = parseJsonRecord(readFileSync(reportPath, 'utf8'));
  const ok = parsed?.ok === true;
  return {
    id: 'webgpu-browser',
    label: 'WebGPU browser smoke',
    status: ok ? 'pass' : 'fail',
    detail: ok
      ? 'WebGPU report says adapter/device smoke shader completed.'
      : `WebGPU report says not ready: ${String(parsed?.reason ?? 'unknown failure')}`,
    evidence: parsed ?? { parseError: 'report was not a JSON object' },
  };
}

function defaultWebGpuProbeCommand(cwd: string): WebGpuProbeCommand | null {
  const script = join(cwd, 'scripts', 'probe-webgpu.mjs');
  if (!existsSync(script)) return null;
  return {
    command: process.execPath,
    args: [script],
  };
}

function collectGpuControllers(options: DeviceLabOptions): GpuController[] {
  const runner = options.commandRunner ?? defaultCommandRunner;
  if (platform() === 'win32') {
    const ps = runner(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM | ConvertTo-Json -Compress',
      ],
      { timeoutMs: 8_000, env: options.env }
    );
    if (ps.status !== 0) return [];
    return parseWindowsGpuControllers(ps.stdout);
  }

  if (platform() === 'darwin') {
    const sp = runner('system_profiler', ['SPDisplaysDataType', '-json'], {
      timeoutMs: 12_000,
      env: options.env,
    });
    if (sp.status !== 0) return [];
    return parseMacGpuControllers(sp.stdout);
  }

  const lspci = runner('lspci', [], { timeoutMs: 8_000, env: options.env });
  if (lspci.status !== 0) return [];
  return lspci.stdout
    .split(/\r?\n/)
    .filter((line) => /vga|3d controller|display/i.test(line))
    .map((line) => ({ name: line.trim() }))
    .filter((gpu) => gpu.name.length > 0);
}

function parseWindowsGpuControllers(stdout: string): GpuController[] {
  const raw = parseJsonUnknown(stdout);
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  return rows
    .map((row): GpuController | null => {
      if (!row || typeof row !== 'object') return null;
      const record = row as Record<string, unknown>;
      const name = typeof record.Name === 'string' ? record.Name : '';
      if (!name) return null;
      const adapterRAM = typeof record.AdapterRAM === 'number' ? record.AdapterRAM : undefined;
      return {
        name,
        ...(typeof record.DriverVersion === 'string'
          ? { driverVersion: record.DriverVersion }
          : {}),
        ...(adapterRAM ? { adapterRAMGB: roundGB(adapterRAM) } : {}),
      };
    })
    .filter((gpu): gpu is GpuController => gpu !== null);
}

function parseMacGpuControllers(stdout: string): GpuController[] {
  const raw = parseJsonUnknown(stdout);
  if (!raw || typeof raw !== 'object') return [];
  const displays = (raw as Record<string, unknown>).SPDisplaysDataType;
  if (!Array.isArray(displays)) return [];
  return displays
    .map((row): GpuController | null => {
      if (!row || typeof row !== 'object') return null;
      const record = row as Record<string, unknown>;
      const name = typeof record.sppci_model === 'string' ? record.sppci_model : '';
      return name ? { name } : null;
    })
    .filter((gpu): gpu is GpuController => gpu !== null);
}

function buildArtifactReceipt(
  kind: ArtifactReceipt['kind'],
  filePath: string,
  capturedAt: string
): ArtifactReceipt {
  const bytes = readFileSync(filePath);
  return {
    kind,
    path: filePath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: statSync(filePath).size,
    capturedAt,
  };
}

function computeOverallStatus(checks: ProbeCheck[]): Exclude<ProbeStatus, 'skipped'> {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn' || check.status === 'skipped')) return 'warn';
  return 'pass';
}

function webGpuFailureDetail(
  parsed: Record<string, unknown> | null,
  result: CommandResult
): string {
  if (parsed && typeof parsed.reason === 'string') return parsed.reason;
  if (parsed && typeof parsed.error === 'string') return parsed.error;
  if (result.stderr.trim()) return result.stderr.trim().slice(0, 400);
  return `WebGPU probe exited with status ${result.status}.`;
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  const parsed = parseJsonUnknown(text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function parseJsonUnknown(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function roundGB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100;
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = canonicalize(record[key]);
  }
  return out;
}
