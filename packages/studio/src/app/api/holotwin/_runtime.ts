import { createHash } from 'node:crypto';
import { parseHolo } from '@holoscript/core';
import { BrowserQuiltRenderer, QuiltCompiler, type QuiltConfig } from '@holoscript/engine/hologram';

export type LookingGlassDevice = 'go' | '16inch' | '27inch' | '65inch';
export type HoloTwinProtocol = 'mqtt' | 'http' | 'websocket';

export interface SensorMapping {
  sensor_key: string;
  scene_property: string;
  transform: 'scale' | 'color' | 'position' | 'emissive' | 'label';
  min: number;
  max: number;
  invert: boolean;
}

export interface ConnectionProbe {
  ok: boolean;
  mode: 'simulated' | 'http' | 'tcp';
  detail: string;
}

export interface HoloTwinSession {
  sessionId: string;
  physicalId: string;
  protocol: HoloTwinProtocol;
  connectionString: string;
  device: LookingGlassDevice;
  isConnected: boolean;
  connectionProbe: ConnectionProbe;
  createdAt: number;
  mappings: SensorMapping[];
  holoCode: string;
  quiltHash?: string;
  quiltUrl?: string;
  quiltBytes?: number;
  lastSyncTime: number;
}

interface HoloTwinStreamSession {
  sessionId: string;
  isStreaming: boolean;
  startedAt: number;
  recompileIntervalMs: number;
  autoStop: boolean | number;
  ticks: number;
  lastFrameHash?: string;
  lastError?: string;
  timer?: ReturnType<typeof setInterval>;
  stopTimer?: ReturnType<typeof setTimeout>;
}

type QuiltComposition = Parameters<QuiltCompiler['compileQuilt']>[0];

export const LOOKING_GLASS_PRESETS: Record<LookingGlassDevice, QuiltConfig> = {
  go: {
    views: 45,
    columns: 9,
    rows: 5,
    resolution: [1440, 1440],
    baseline: 0.04,
    device: 'go',
    focusDistance: 0.15,
  },
  '16inch': {
    views: 48,
    columns: 8,
    rows: 6,
    resolution: [3360, 3360],
    baseline: 0.06,
    device: '16inch',
    focusDistance: 0.2,
  },
  '27inch': {
    views: 60,
    columns: 10,
    rows: 6,
    resolution: [5120, 3840],
    baseline: 0.065,
    device: '27inch',
    focusDistance: 0.25,
  },
  '65inch': {
    views: 128,
    columns: 16,
    rows: 8,
    resolution: [7680, 4320],
    baseline: 0.08,
    device: '65inch',
    focusDistance: 0.5,
  },
};

const globalState = globalThis as typeof globalThis & {
  __studioHoloTwinSessions?: Map<string, HoloTwinSession>;
  __studioHoloTwinStreams?: Map<string, HoloTwinStreamSession>;
};

const sessions = (globalState.__studioHoloTwinSessions ??= new Map<string, HoloTwinSession>());
const streams = (globalState.__studioHoloTwinStreams ??= new Map<string, HoloTwinStreamSession>());

export function resetHoloTwinRuntimeForTests(): void {
  for (const stream of streams.values()) {
    stopStreamTimers(stream);
  }
  streams.clear();
  sessions.clear();
}

export function listHoloTwinSessions(now = Date.now()): Array<{
  sessionId: string;
  physicalId: string;
  protocol: HoloTwinProtocol;
  device: LookingGlassDevice;
  isConnected: boolean;
  connectionMode: ConnectionProbe['mode'];
  uptime: number;
  mappingsCount: number;
  streaming: boolean;
  quiltHash?: string;
}> {
  return Array.from(sessions.values()).map((session) => ({
    sessionId: session.sessionId,
    physicalId: session.physicalId,
    protocol: session.protocol,
    device: session.device,
    isConnected: session.isConnected,
    connectionMode: session.connectionProbe.mode,
    uptime: now - session.createdAt,
    mappingsCount: session.mappings.length,
    streaming: streams.get(session.sessionId)?.isStreaming ?? false,
    quiltHash: session.quiltHash,
  }));
}

export async function connectHoloTwin(input: {
  physicalId: unknown;
  protocol?: unknown;
  connectionString: unknown;
  displayDevice?: unknown;
}): Promise<HoloTwinSession> {
  const physicalId = readRequiredString(input.physicalId, 'physicalId');
  const connectionString = readRequiredString(input.connectionString, 'connectionString');
  const protocol = normalizeProtocol(input.protocol);
  const device = normalizeDevice(input.displayDevice);
  const connectionProbe = await probeHoloTwinConnection(protocol, connectionString);

  if (!connectionProbe.ok) {
    throw new Error(`HoloTwin connection failed: ${connectionProbe.detail}`);
  }

  const sessionId = `holotwin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session: HoloTwinSession = {
    sessionId,
    physicalId,
    protocol,
    connectionString,
    device,
    isConnected: true,
    connectionProbe,
    createdAt: Date.now(),
    mappings: [],
    holoCode: '',
    lastSyncTime: 0,
  };
  sessions.set(sessionId, session);
  return session;
}

export function mapHoloTwinSensors(input: { sessionId: unknown; mappings: unknown }): {
  sessionId: string;
  mappingsCount: number;
} {
  const sessionId = readRequiredString(input.sessionId, 'sessionId');
  const session = requireSession(sessionId);
  session.mappings = normalizeMappings(input.mappings);
  return { sessionId, mappingsCount: session.mappings.length };
}

export async function compileHoloTwinQuilt(input: {
  sessionId: unknown;
  holoCode: unknown;
  device?: unknown;
  quiltConfig?: unknown;
}): Promise<{
  sessionId: string;
  device: LookingGlassDevice;
  quilt: ReturnType<QuiltCompiler['compileQuilt']> & {
    receipt: {
      pngBase64: string;
      sha256: string;
      bytes: number;
      renderConfig: QuiltConfig;
    };
  };
  hash: string;
  url: string;
  stub: false;
}> {
  const sessionId = readRequiredString(input.sessionId, 'sessionId');
  const holoCode = readRequiredString(input.holoCode, 'holoCode');
  const session = requireSession(sessionId);
  const device = input.device === undefined ? session.device : normalizeDevice(input.device);
  const baseConfig = LOOKING_GLASS_PRESETS[device];
  const quiltConfig = {
    ...baseConfig,
    ...normalizeQuiltConfigOverride(input.quiltConfig),
  };
  const composition = parseHoloTwinComposition(holoCode);
  const compiler = new QuiltCompiler();
  const compiled = compiler.compileQuilt(composition, quiltConfig);
  const receipt = await renderQuiltReceipt(composition, quiltConfig, session);
  const hash = `sha256:${receipt.sha256}`;
  const url = `data:image/png;base64,${receipt.pngBase64}`;

  session.device = device;
  session.holoCode = holoCode;
  session.quiltHash = hash;
  session.quiltUrl = url;
  session.quiltBytes = receipt.bytes;
  session.lastSyncTime = Date.now();

  return {
    sessionId,
    device,
    quilt: {
      ...compiled,
      receipt,
    },
    hash,
    url,
    stub: false,
  };
}

export async function startHoloTwinStream(input: {
  sessionId: unknown;
  recompileIntervalMs?: unknown;
  autoStop?: unknown;
}): Promise<{
  sessionId: string;
  streaming: true;
  recompileIntervalMs: number;
  autoStop: boolean | number;
  ticks: number;
  lastFrameHash?: string;
}> {
  const sessionId = readRequiredString(input.sessionId, 'sessionId');
  const session = requireSession(sessionId);
  const recompileIntervalMs =
    typeof input.recompileIntervalMs === 'number' && Number.isFinite(input.recompileIntervalMs)
      ? Math.max(100, Math.floor(input.recompileIntervalMs))
      : 1000;
  const autoStop =
    typeof input.autoStop === 'number' && Number.isFinite(input.autoStop)
      ? Math.max(0, input.autoStop)
      : typeof input.autoStop === 'boolean'
        ? input.autoStop
        : false;

  stopHoloTwinStream(sessionId);
  const stream: HoloTwinStreamSession = {
    sessionId,
    isStreaming: true,
    startedAt: Date.now(),
    recompileIntervalMs,
    autoStop,
    ticks: 0,
  };
  streams.set(sessionId, stream);

  await runStreamTick(session, stream);
  stream.timer = setInterval(() => {
    void runStreamTick(session, stream);
  }, recompileIntervalMs);
  unrefTimer(stream.timer);

  const autoStopMs =
    typeof autoStop === 'number' ? autoStop * 1000 : autoStop ? recompileIntervalMs : 0;
  if (autoStopMs > 0) {
    stream.stopTimer = setTimeout(() => {
      stopHoloTwinStream(sessionId);
    }, autoStopMs);
    unrefTimer(stream.stopTimer);
  }

  return {
    sessionId,
    streaming: true,
    recompileIntervalMs,
    autoStop,
    ticks: stream.ticks,
    lastFrameHash: stream.lastFrameHash,
  };
}

export function stopHoloTwinStream(sessionId: string): boolean {
  const stream = streams.get(sessionId);
  if (!stream) return false;
  stopStreamTimers(stream);
  stream.isStreaming = false;
  streams.delete(sessionId);
  return true;
}

export function disconnectHoloTwin(sessionIdInput: unknown): { sessionId: string } {
  const sessionId = readRequiredString(sessionIdInput, 'sessionId');
  const session = requireSession(sessionId);
  session.isConnected = false;
  stopHoloTwinStream(sessionId);
  sessions.delete(sessionId);
  return { sessionId };
}

function requireSession(sessionId: string): HoloTwinSession {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`HoloTwin session ${sessionId} not found`);
  }
  return session;
}

function parseHoloTwinComposition(holoCode: string): QuiltComposition {
  const result = parseHolo(holoCode, { tolerant: false });
  if (!result.success || !result.ast) {
    const reason = result.errors?.[0]?.message ?? 'unknown parse failure';
    throw new Error(`holoCode parse failed: ${reason}`);
  }
  return result.ast as QuiltComposition;
}

async function renderQuiltReceipt(
  composition: QuiltComposition,
  quiltConfig: QuiltConfig,
  session: HoloTwinSession
): Promise<{
  pngBase64: string;
  sha256: string;
  bytes: number;
  renderConfig: QuiltConfig;
}> {
  const renderConfig = makeReceiptRenderConfig(quiltConfig);
  const fixture = makeTelemetryFixture(session);
  const renderer = new BrowserQuiltRenderer({
    path: 'cpu',
    composition,
    overrides: renderConfig,
    imageDecoder: async () => fixture.source,
  });
  const pngBytes = await renderer.render({
    depthMap: fixture.depthMap,
    normalMap: fixture.normalMap,
    width: fixture.width,
    height: fixture.height,
    frames: 1,
    media: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    sourceKind: 'image',
  });
  const sha256 = createHash('sha256').update(pngBytes).digest('hex');
  return {
    pngBase64: Buffer.from(pngBytes).toString('base64'),
    sha256,
    bytes: pngBytes.byteLength,
    renderConfig,
  };
}

function makeReceiptRenderConfig(config: QuiltConfig): QuiltConfig {
  const views = Math.max(1, Math.min(config.views, 6));
  const columns = Math.min(3, views);
  const rows = Math.ceil(views / columns);
  return {
    ...config,
    views,
    columns,
    rows,
    resolution: [columns * 64, rows * 64],
  };
}

function makeTelemetryFixture(session: HoloTwinSession): {
  width: number;
  height: number;
  source: { data: Uint8ClampedArray; width: number; height: number };
  depthMap: Float32Array;
  normalMap: Float32Array;
} {
  const width = 32;
  const height = 32;
  const source = new Uint8ClampedArray(width * height * 4);
  const depthMap = new Float32Array(width * height);
  const normalMap = new Float32Array(width * height * 3);
  const mappingBias = Math.max(1, session.mappings.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const pixel = i * 4;
      const nx = x / (width - 1);
      const ny = y / (height - 1);
      source[pixel] = Math.round(50 + nx * 170);
      source[pixel + 1] = Math.round(70 + ny * 120);
      source[pixel + 2] = Math.round(80 + ((mappingBias * 37) % 120));
      source[pixel + 3] = 255;
      depthMap[i] = Math.min(1, Math.max(0, Math.hypot(nx - 0.5, ny - 0.5) * 1.4));
      normalMap[i * 3] = 0;
      normalMap[i * 3 + 1] = 0;
      normalMap[i * 3 + 2] = 1;
    }
  }

  return {
    width,
    height,
    source: { data: source, width, height },
    depthMap,
    normalMap,
  };
}

async function runStreamTick(
  session: HoloTwinSession,
  stream: HoloTwinStreamSession
): Promise<void> {
  if (!stream.isStreaming) return;
  try {
    const holoCode = session.holoCode.trim() || defaultStreamHoloCode(session);
    const compiled = await compileHoloTwinQuilt({
      sessionId: session.sessionId,
      holoCode,
      device: session.device,
    });
    stream.ticks += 1;
    stream.lastFrameHash = compiled.hash;
    stream.lastError = undefined;
  } catch (error) {
    stream.lastError = error instanceof Error ? error.message : String(error);
  }
}

function defaultStreamHoloCode(session: HoloTwinSession): string {
  return `composition "HoloTwin ${session.physicalId}" {
  object "TelemetryProxy" {
    @quilt { device: "${session.device}" }
    geometry: "sphere"
    position: [0, 0, 0]
    scale: [1, 1, 1]
    color: "#4ECDC4"
  }
}`;
}

function stopStreamTimers(stream: HoloTwinStreamSession): void {
  if (stream.timer) clearInterval(stream.timer);
  if (stream.stopTimer) clearTimeout(stream.stopTimer);
  stream.timer = undefined;
  stream.stopTimer = undefined;
}

async function probeHoloTwinConnection(
  protocol: HoloTwinProtocol,
  connectionString: string
): Promise<ConnectionProbe> {
  if (/^(memory|mock|sim):\/\//i.test(connectionString)) {
    return { ok: true, mode: 'simulated', detail: 'in-process telemetry source' };
  }

  if (protocol === 'http') {
    return probeHttp(connectionString);
  }

  return probeTcp(protocol, connectionString);
}

async function probeHttp(connectionString: string): Promise<ConnectionProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  unrefTimer(timer);
  try {
    const response = await fetch(connectionString, {
      method: 'HEAD',
      signal: controller.signal,
    });
    return {
      ok: response.status < 500,
      mode: 'http',
      detail: `HTTP HEAD ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      mode: 'http',
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeTcp(
  protocol: Exclude<HoloTwinProtocol, 'http'>,
  connectionString: string
): Promise<ConnectionProbe> {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return { ok: false, mode: 'tcp', detail: 'invalid connection URL' };
  }
  const port =
    Number(url.port) || (protocol === 'mqtt' ? 1883 : url.protocol === 'wss:' ? 443 : 80);
  const host = url.hostname;
  const { createConnection } = await import('node:net');

  return new Promise<ConnectionProbe>((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (probe: ConnectionProbe) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(probe);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => {
      finish({ ok: true, mode: 'tcp', detail: `TCP ${host}:${port} reachable` });
    });
    socket.once('timeout', () => {
      finish({ ok: false, mode: 'tcp', detail: `TCP ${host}:${port} timed out` });
    });
    socket.once('error', (error: Error) => {
      finish({ ok: false, mode: 'tcp', detail: error.message });
    });
  });
}

function normalizeMappings(value: unknown): SensorMapping[] {
  if (!Array.isArray(value)) {
    throw new Error('mappings must be an array');
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`mapping ${index} must be an object`);
    }
    const record = item as Record<string, unknown>;
    const sensorKey = readRequiredString(record.sensor_key, `mappings[${index}].sensor_key`);
    const sceneProperty = readRequiredString(
      record.scene_property,
      `mappings[${index}].scene_property`
    );
    return {
      sensor_key: sensorKey,
      scene_property: sceneProperty,
      transform: normalizeTransform(record.transform),
      min: typeof record.min === 'number' ? record.min : 0,
      max: typeof record.max === 'number' ? record.max : 1,
      invert: typeof record.invert === 'boolean' ? record.invert : false,
    };
  });
}

function normalizeQuiltConfigOverride(value: unknown): Partial<QuiltConfig> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const out: Partial<QuiltConfig> = {};
  if (typeof record.views === 'number') out.views = record.views;
  if (typeof record.columns === 'number') out.columns = record.columns;
  if (typeof record.rows === 'number') out.rows = record.rows;
  if (
    Array.isArray(record.resolution) &&
    typeof record.resolution[0] === 'number' &&
    typeof record.resolution[1] === 'number'
  ) {
    out.resolution = [record.resolution[0], record.resolution[1]];
  }
  if (typeof record.baseline === 'number') out.baseline = record.baseline;
  if (typeof record.focusDistance === 'number') out.focusDistance = record.focusDistance;
  if (isDevice(record.device)) out.device = record.device;
  return out;
}

function normalizeProtocol(value: unknown): HoloTwinProtocol {
  return value === 'http' || value === 'websocket' || value === 'mqtt' ? value : 'mqtt';
}

function normalizeDevice(value: unknown): LookingGlassDevice {
  return isDevice(value) ? value : '16inch';
}

function normalizeTransform(value: unknown): SensorMapping['transform'] {
  return value === 'scale' ||
    value === 'color' ||
    value === 'position' ||
    value === 'emissive' ||
    value === 'label'
    ? value
    : 'scale';
}

function isDevice(value: unknown): value is LookingGlassDevice {
  return value === 'go' || value === '16inch' || value === '27inch' || value === '65inch';
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref(): void }).unref();
  }
}
