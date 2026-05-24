'use client';

import { Play, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  P043_REQUIRED_RUNS,
  P043_SAMPLE_SECONDS,
  P043_WARMUP_SECONDS,
  buildP043QuestArtifact,
  buildP043QuestCells,
  parseP043QuestCellId,
  validateP043QuestArtifact,
  type JsonRecord,
  type P043QuestCell,
} from '../../lib/p043QuestCapture';

interface P043QuestCapturePanelProps {
  shaderSource: string;
  initialCellId: string;
  initialRunId: string;
}

interface GpuAdapter {
  info?: unknown;
  requestAdapterInfo?: () => Promise<unknown>;
  requestDevice: () => Promise<GpuDevice>;
}

interface GpuBuffer {
  mapAsync: (mode: number) => Promise<void>;
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy?: () => void;
}

interface GpuPipeline {
  getBindGroupLayout: (index: number) => unknown;
}

interface GpuQueue {
  writeBuffer: (buffer: GpuBuffer, offset: number, data: BufferSource) => void;
  submit: (buffers: unknown[]) => void;
  onSubmittedWorkDone: () => Promise<void>;
}

interface GpuDevice {
  queue: GpuQueue;
  createShaderModule: (descriptor: { code: string }) => unknown;
  createComputePipelineAsync: (descriptor: unknown) => Promise<GpuPipeline>;
  createBuffer: (descriptor: { size: number; usage: number }) => GpuBuffer;
  createBindGroup: (descriptor: unknown) => unknown;
  createCommandEncoder: () => {
    beginComputePass: () => {
      setPipeline: (pipeline: GpuPipeline) => void;
      setBindGroup: (index: number, bindGroup: unknown) => void;
      dispatchWorkgroups: (count: number) => void;
      end: () => void;
    };
    copyBufferToBuffer: (
      source: GpuBuffer,
      sourceOffset: number,
      destination: GpuBuffer,
      destinationOffset: number,
      size: number
    ) => void;
    finish: () => unknown;
  };
}

interface QuestBrowserApis {
  gpu?: {
    requestAdapter: (options?: { powerPreference?: 'high-performance' }) => Promise<GpuAdapter | null>;
  };
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
}

interface ProgressState {
  phase: string;
  run: number;
  samples: number;
}

type CaptureStatus = 'idle' | 'running' | 'saving' | 'saved' | 'error';

const workgroupSize = 64;

function pathPrefix(): string {
  const tunnel = window.location.pathname.match(/^\/t\/[^/]+/);
  if (tunnel) return tunnel[0] ?? '';
  if (window.location.pathname.startsWith('/live/')) return '/live';
  return '';
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePositions(sceneId: string, count: number): Float32Array {
  const rand = mulberry32(hashString(sceneId));
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = sceneId === 'dense-2m' ? Math.pow(rand(), 0.35) * 18 : rand() * 42;
    const height = sceneId === 'outdoor-1m' ? (rand() - 0.5) * 18 : (rand() - 0.5) * 5;
    const zScale = sceneId === 'indoor-500k' ? 0.45 : 1.0;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = Math.sin(a) * r * zScale - 12;
  }
  return positions;
}

function generateViews(viewCount: number): Array<{ eyePosition: number[]; eyeDirection: number[] }> {
  const views = [];
  for (let i = 0; i < viewCount; i += 1) {
    const a = (i / viewCount) * Math.PI * 2;
    const eyePosition = [Math.cos(a) * 2.5, 1.6, Math.sin(a) * 2.5 + 2.5];
    views.push({ eyePosition, eyeDirection: [-eyePosition[0], -0.15, -eyePosition[2] - 10] });
  }
  return views;
}

function checksum(distances: Float32Array, bitmasks: Uint32Array): number {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(distances.length / 4096));
  for (let i = 0; i < distances.length; i += step) {
    hash ^= Math.floor(distances[i] * 1000) >>> 0;
    hash = Math.imul(hash, 16777619);
    hash ^= bitmasks[i] >>> 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function adapterInfo(adapter: GpuAdapter): Promise<unknown> {
  if (adapter.info && Object.keys(adapter.info as JsonRecord).length > 0) return adapter.info;
  if (adapter.requestAdapterInfo) return adapter.requestAdapterInfo();
  return {};
}

async function runQuestCapture(options: {
  shaderSource: string;
  cell: P043QuestCell;
  warmupSeconds: number;
  sampleSeconds: number;
  requiredRuns: number;
  browserShell: string;
  batteryState: string;
  thermalState: string;
  runId: string;
  onProgress: (progress: ProgressState) => void;
}): Promise<JsonRecord> {
  const nav = navigator as unknown as QuestBrowserApis;
  if (!nav.gpu) throw new Error('navigator.gpu is unavailable in this browser session');

  const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('WebGPU requestAdapter returned no adapter');
  const info = await adapterInfo(adapter);
  const device = await adapter.requestDevice();
  const usage = (globalThis as typeof globalThis & {
    GPUBufferUsage: Record<string, number>;
    GPUMapMode: Record<string, number>;
  }).GPUBufferUsage;
  const mapMode = (globalThis as typeof globalThis & {
    GPUMapMode: Record<string, number>;
  }).GPUMapMode;
  const buffers: GpuBuffer[] = [];

  try {
    const positions = generatePositions(options.cell.sceneId, options.cell.gaussianCount);
    const views = generateViews(options.cell.views);
    const splats = new ArrayBuffer(options.cell.gaussianCount * 32);
    const splatF32 = new Float32Array(splats);
    for (let g = 0; g < options.cell.gaussianCount; g += 1) {
      const base = g * 8;
      splatF32[base] = positions[g * 3];
      splatF32[base + 1] = positions[g * 3 + 1];
      splatF32[base + 2] = positions[g * 3 + 2];
      splatF32[base + 6] = 1;
    }

    const viewBufferData = new Float32Array(options.cell.views * 8);
    for (let v = 0; v < options.cell.views; v += 1) {
      const base = v * 8;
      viewBufferData.set(views[v].eyePosition, base);
      viewBufferData.set(views[v].eyeDirection, base + 4);
    }

    const uniforms = new ArrayBuffer(32);
    const uniformView = new DataView(uniforms);
    uniformView.setUint32(0, options.cell.gaussianCount, true);
    uniformView.setUint32(4, options.cell.views, true);
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const view of views) {
      cx += view.eyePosition[0];
      cy += view.eyePosition[1];
      cz += view.eyePosition[2];
    }
    cx /= views.length;
    cy /= views.length;
    cz /= views.length;
    uniformView.setFloat32(16, cx, true);
    uniformView.setFloat32(20, cy, true);
    uniformView.setFloat32(24, cz, true);

    const module = device.createShaderModule({ code: options.shaderSource });
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'cs_preprocess' },
    });
    const makeBuffer = (size: number, bufferUsage: number, data?: BufferSource) => {
      const buffer = device.createBuffer({ size, usage: bufferUsage });
      buffers.push(buffer);
      if (data) device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    };

    const uniformBuffer = makeBuffer(uniforms.byteLength, usage.UNIFORM | usage.COPY_DST, uniforms);
    const splatBuffer = makeBuffer(splats.byteLength, usage.STORAGE | usage.COPY_DST, splats);
    const viewsBuffer = makeBuffer(
      viewBufferData.byteLength,
      usage.STORAGE | usage.COPY_DST,
      viewBufferData
    );
    const distancesBuffer = makeBuffer(options.cell.gaussianCount * 4, usage.STORAGE | usage.COPY_SRC);
    const bitmasksBuffer = makeBuffer(options.cell.gaussianCount * 4, usage.STORAGE | usage.COPY_SRC);
    const readDistances = makeBuffer(options.cell.gaussianCount * 4, usage.COPY_DST | usage.MAP_READ);
    const readBitmasks = makeBuffer(options.cell.gaussianCount * 4, usage.COPY_DST | usage.MAP_READ);
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: splatBuffer } },
        { binding: 2, resource: { buffer: viewsBuffer } },
        { binding: 3, resource: { buffer: distancesBuffer } },
        { binding: 4, resource: { buffer: bitmasksBuffer } },
      ],
    });

    const dispatchOnce = async (copyOut = false) => {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(options.cell.gaussianCount / workgroupSize));
      pass.end();
      if (copyOut) {
        encoder.copyBufferToBuffer(distancesBuffer, 0, readDistances, 0, options.cell.gaussianCount * 4);
        encoder.copyBufferToBuffer(bitmasksBuffer, 0, readBitmasks, 0, options.cell.gaussianCount * 4);
      }
      const started = performance.now();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      return performance.now() - started;
    };

    options.onProgress({ phase: 'warmup', run: 0, samples: 0 });
    const warmupEnd = performance.now() + options.warmupSeconds * 1000;
    while (performance.now() < warmupEnd) await dispatchOnce(false);

    const runSamples: number[][] = [];
    for (let run = 1; run <= options.requiredRuns; run += 1) {
      const samples: number[] = [];
      const sampleEnd = performance.now() + options.sampleSeconds * 1000;
      do {
        const elapsed = await dispatchOnce(false);
        samples.push(elapsed);
        options.onProgress({ phase: 'sampling', run, samples: samples.length });
      } while (performance.now() < sampleEnd || samples.length === 0);
      runSamples.push(samples);
    }

    await dispatchOnce(true);
    await readDistances.mapAsync(mapMode.READ);
    await readBitmasks.mapAsync(mapMode.READ);
    const distanceCopy = new Float32Array(readDistances.getMappedRange().slice(0));
    const bitmaskCopy = new Uint32Array(readBitmasks.getMappedRange().slice(0));
    const resultChecksum = checksum(distanceCopy, bitmaskCopy);
    readDistances.unmap();
    readBitmasks.unmap();

    return buildP043QuestArtifact({
      cell: options.cell,
      runSamples,
      checksum: resultChecksum,
      adapterInfo: info,
      browserVersion: navigator.userAgent,
      osVersion: navigator.platform,
      browserShell: options.browserShell,
      batteryState: options.batteryState,
      thermalState: options.thermalState,
      sampleSeconds: options.sampleSeconds,
      warmupSeconds: options.warmupSeconds,
      requiredRuns: options.requiredRuns,
      runId: options.runId,
      url: window.location.href,
    });
  } finally {
    for (const buffer of buffers) buffer.destroy?.();
  }
}

export function P043QuestCapturePanel({
  shaderSource,
  initialCellId,
  initialRunId,
}: P043QuestCapturePanelProps) {
  const cells = useMemo(() => buildP043QuestCells(), []);
  const [cellId, setCellId] = useState(initialCellId);
  const [runId, setRunId] = useState(initialRunId);
  const [batteryState, setBatteryState] = useState('unknown');
  const [thermalState, setThermalState] = useState('unknown');
  const [browserShell, setBrowserShell] = useState('Quest Browser / WebXR');
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<ProgressState>({ phase: 'idle', run: 0, samples: 0 });
  const [artifactPath, setArtifactPath] = useState('');

  useEffect(() => {
    setBrowserShell(`Quest Browser / WebXR / ${navigator.userAgent}`);
    const nav = navigator as unknown as QuestBrowserApis;
    nav
      .getBattery?.()
      .then((battery) => {
        setBatteryState(`${Math.round(battery.level * 100)}% ${battery.charging ? 'charging' : 'discharging'}`);
      })
      .catch(() => {});
  }, []);

  const selectedCell = parseP043QuestCellId(cellId);
  const busy = status === 'running' || status === 'saving';

  async function handleRun() {
    if (!selectedCell) {
      setStatus('error');
      setMessage('Unknown P043 Quest cell.');
      return;
    }
    setStatus('running');
    setArtifactPath('');
    setMessage('');
    try {
      const artifact = await runQuestCapture({
        shaderSource,
        cell: selectedCell,
        warmupSeconds: P043_WARMUP_SECONDS,
        sampleSeconds: P043_SAMPLE_SECONDS,
        requiredRuns: P043_REQUIRED_RUNS,
        browserShell,
        batteryState,
        thermalState,
        runId,
        onProgress: setProgress,
      });
      const validation = validateP043QuestArtifact(artifact);
      if (!validation.ok) throw new Error(validation.errors.join('; '));

      setStatus('saving');
      const response = await fetch(`${pathPrefix()}/api/p043-sku-matrix`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId, artifact }),
      });
      const result = (await response.json()) as { ok?: boolean; path?: string; artifactPath?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || 'Artifact write failed');
      setArtifactPath(result.artifactPath || result.path || '');
      setStatus('saved');
      setMessage('Artifact saved.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Quest capture failed');
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 20,
        background: '#07100d',
        color: '#f7faf8',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 16 }}>
        <header style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, color: '#7dd3fc', fontSize: 12, fontWeight: 700, letterSpacing: 0 }}>
            P043 Quest 3
          </p>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>SKU Matrix Capture</h1>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <label style={labelStyle}>
            Cell
            <select value={cellId} onChange={(event) => setCellId(event.target.value)} style={inputStyle}>
              {cells.map((cell) => (
                <option key={cell.id} value={cell.id}>
                  {cell.sceneId} n={cell.views}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Run id
            <input value={runId} onChange={(event) => setRunId(event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Battery
            <input
              value={batteryState}
              onChange={(event) => setBatteryState(event.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Thermal
            <input
              value={thermalState}
              onChange={(event) => setThermalState(event.target.value)}
              style={inputStyle}
            />
          </label>
        </section>

        <label style={labelStyle}>
          Browser shell
          <input
            value={browserShell}
            onChange={(event) => setBrowserShell(event.target.value)}
            style={inputStyle}
          />
        </label>

        <section
          style={{
            border: '1px solid rgba(148, 163, 184, 0.24)',
            borderRadius: 8,
            padding: 16,
            background: 'rgba(15, 23, 42, 0.64)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <Stat label="Warmup" value={`${P043_WARMUP_SECONDS}s`} />
            <Stat label="Sample" value={`${P043_SAMPLE_SECONDS}s`} />
            <Stat label="Runs" value={`${P043_REQUIRED_RUNS}`} />
          </div>
          <button onClick={handleRun} disabled={busy} style={buttonStyle}>
            {status === 'saving' ? <Save size={18} /> : <Play size={18} />}
            {busy ? 'Capturing' : 'Run Cell'}
          </button>
          <div style={{ minHeight: 72, display: 'grid', gap: 6 }}>
            <StatusLine status={status} message={message} />
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13 }}>
              {progress.phase} {progress.run > 0 ? `run ${progress.run}` : ''}{' '}
              {progress.samples > 0 ? `${progress.samples} samples` : ''}
            </p>
            {artifactPath && (
              <p style={{ margin: 0, color: '#86efac', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                {artifactPath}
              </p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minHeight: 64, border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 8, padding: 12 }}>
      <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ color: '#f8fafc', fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function StatusLine({ status, message }: { status: CaptureStatus; message: string }) {
  if (status === 'saved') {
    return (
      <p style={{ margin: 0, color: '#86efac', display: 'flex', alignItems: 'center', gap: 8 }}>
        <CheckCircle2 size={18} /> {message}
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p style={{ margin: 0, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={18} /> {message}
      </p>
    );
  }
  return <p style={{ margin: 0, color: '#e2e8f0' }}>{status}</p>;
}

const labelStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: '#cbd5e1',
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  minHeight: 44,
  border: '1px solid rgba(148, 163, 184, 0.34)',
  borderRadius: 8,
  background: '#020617',
  color: '#f8fafc',
  padding: '0 12px',
  font: 'inherit',
};

const buttonStyle: CSSProperties = {
  minHeight: 48,
  border: 0,
  borderRadius: 8,
  background: '#22c55e',
  color: '#03130a',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontWeight: 800,
  fontSize: 15,
};
