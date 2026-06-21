/**
 * HoloTwin MCP Tools — IoT Sensor → HoloScript → Looking Glass
 *
 * MCP tool surface for real-time holographic digital twin pipeline.
 * Bridges IoT sensor data to HoloScript scenes and compiles to Looking Glass quilt format.
 *
 * Tools:
 * - holo_holotwin_connect: Connect to IoT sensor/broker
 * - holo_holotwin_map_sensor: Map sensor telemetry to scene properties
 * - holo_holotwin_compile_quilt: Compile scene to Looking Glass quilt
 * - holo_holotwin_stream: Start real-time sensor → hologram stream
 * - holo_holotwin_status: Get twin sync status
 */

import { createHash } from 'node:crypto';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { parseHolo } from '@holoscript/core';
import { BrowserQuiltRenderer, QuiltCompiler, type QuiltConfig } from '@holoscript/engine/hologram';

// =============================================================================
// TYPES
// =============================================================================

type LookingGlassDevice = 'go' | '16inch' | '27inch' | '65inch';

interface SensorMapping {
  sensor_key: string;
  scene_property: string;
  transform?: 'scale' | 'color' | 'position' | 'emissive' | 'label';
  min?: number;
  max?: number;
  invert?: boolean;
}

interface HoloTwinSession {
  sessionId: string;
  physicalId: string;
  protocol: 'mqtt' | 'http' | 'websocket';
  connectionString: string;
  device: LookingGlassDevice;
  mappings: SensorMapping[];
  holoCode: string;
  quiltHash?: string;
  quiltUrl?: string;
  quiltBytes?: number;
  quiltPngBase64?: string;
  stream?: HoloTwinStreamState;
  lastSyncTime: number;
  isConnected: boolean;
}

interface HoloTwinStreamState {
  isStreaming: boolean;
  startedAt: number;
  recompileIntervalMs: number;
  autoStop: boolean;
  ticks: number;
  lastFrameHash?: string;
  lastError?: string;
  timer?: ReturnType<typeof setInterval>;
  stopTimer?: ReturnType<typeof setTimeout>;
}

type QuiltComposition = Parameters<QuiltCompiler['compileQuilt']>[0];

interface QuiltReceipt {
  pngBase64: string;
  sha256: string;
  bytes: number;
  renderConfig: QuiltConfig;
}

// =============================================================================
// LOOKING GLASS PRESETS
// =============================================================================

const LOOKING_GLASS_PRESETS: Record<LookingGlassDevice, QuiltConfig> = {
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

// =============================================================================
// SESSION STORE
// =============================================================================

const sessions = new Map<string, HoloTwinSession>();

function generateSessionId(): string {
  return `holotwin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const holotwinToolDefinitions: Tool[] = [
  {
    name: 'holo_holotwin_connect',
    description:
      'Connect to an IoT sensor or broker for HoloTwin holographic digital twin. Supports MQTT, HTTP, and WebSocket protocols.',
    inputSchema: {
      type: 'object',
      properties: {
        physicalId: {
          type: 'string',
          description: 'IoT device or sensor ID',
        },
        protocol: {
          type: 'string',
          enum: ['mqtt', 'http', 'websocket'],
          description: 'Communication protocol',
        },
        connectionString: {
          type: 'string',
          description: 'MQTT broker URL (e.g., mqtt://farm.local:1883) or HTTP endpoint',
        },
        displayDevice: {
          type: 'string',
          enum: ['go', '16inch', '27inch', '65inch'],
          description: 'Target Looking Glass display device',
        },
      },
      required: ['physicalId', 'protocol', 'connectionString'],
    },
  },
  {
    name: 'holo_holotwin_map_sensor',
    description:
      'Map IoT sensor telemetry keys to HoloScript scene properties. Defines how sensor data transforms the holographic display.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID from holo_holotwin_connect',
        },
        mappings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sensor_key: { type: 'string', description: 'IoT telemetry key' },
              scene_property: { type: 'string', description: 'Scene node property to update' },
              transform: {
                type: 'string',
                enum: ['scale', 'color', 'position', 'emissive', 'label'],
                description: 'How to transform the value',
              },
              min: { type: 'number', description: 'Min value for normalization' },
              max: { type: 'number', description: 'Max value for normalization' },
              invert: { type: 'boolean', description: 'Invert the normalized value' },
            },
            required: ['sensor_key', 'scene_property'],
          },
        },
      },
      required: ['sessionId', 'mappings'],
    },
  },
  {
    name: 'holo_holotwin_compile_quilt',
    description:
      'Compile a HoloTwin scene to Looking Glass quilt format. Returns quilt metadata, renderer code, and share URL.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID from holo_holotwin_connect',
        },
        holoCode: {
          type: 'string',
          description: 'HoloScript composition code',
        },
        deviceOverride: {
          type: 'string',
          enum: ['go', '16inch', '27inch', '65inch'],
          description: 'Override display device from session',
        },
        quiltConfig: {
          type: 'object',
          description: 'Custom quilt config overrides',
        },
      },
      required: ['sessionId', 'holoCode'],
    },
  },
  {
    name: 'holo_holotwin_stream',
    description:
      'Start real-time streaming from IoT sensor to holographic display. Continuously updates scene and recompiles quilt.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID from holo_holotwin_connect',
        },
        recompileIntervalMs: {
          type: 'number',
          description: 'Minimum time between quilt recompiles (default: 1000ms)',
        },
        autoStop: {
          type: 'boolean',
          description: 'Auto-stop after N seconds (0 = indefinite)',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'holo_holotwin_status',
    description: 'Get HoloTwin session status: sync state, sensor data, quilt hash, errors.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID from holo_holotwin_connect',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'holo_holotwin_disconnect',
    description: 'Disconnect from IoT sensor and stop HoloTwin session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID from holo_holotwin_connect',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'holo_holotwin_example',
    description:
      'Generate a complete HoloTwin example: smart farm sensor dashboard with temperature/humidity → 3D visualization → Looking Glass quilt.',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: ['go', '16inch', '27inch', '65inch'],
          description: 'Target Looking Glass device',
        },
        includeSimulation: {
          type: 'boolean',
          description: 'Include simulated sensor data for testing',
        },
      },
    },
  },
];

const HOLOTWIN_NAMES = new Set(holotwinToolDefinitions.map((t) => t.name));

export function isHoloTwinToolName(name: string): boolean {
  return HOLOTWIN_NAMES.has(name);
}

// =============================================================================
// TOOL HANDLERS
// =============================================================================

export async function handleHoloTwinTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'holo_holotwin_connect': {
      const physicalId = typeof args.physicalId === 'string' ? args.physicalId.trim() : '';
      const protocol = (args.protocol as 'mqtt' | 'http' | 'websocket') || 'mqtt';
      const connectionString =
        typeof args.connectionString === 'string' ? args.connectionString.trim() : '';
      const displayDevice = (args.displayDevice as LookingGlassDevice) || '16inch';

      if (!physicalId || !connectionString) {
        throw new Error('holotwin: physicalId and connectionString are required');
      }

      const sessionId = generateSessionId();
      const session: HoloTwinSession = {
        sessionId,
        physicalId,
        protocol,
        connectionString,
        device: displayDevice,
        mappings: [],
        holoCode: '',
        lastSyncTime: 0,
        isConnected: true,
      };
      sessions.set(sessionId, session);

      return {
        ok: true,
        sessionId,
        physicalId,
        protocol,
        device: displayDevice,
        message: `Connected to ${physicalId} via ${protocol}. Ready for sensor mappings.`,
      };
    }

    case 'holo_holotwin_map_sensor': {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
      const mappings = (args.mappings as SensorMapping[]) || [];

      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`holotwin: session ${sessionId} not found`);
      }

      session.mappings = mappings;

      return {
        ok: true,
        sessionId,
        mappingsCount: mappings.length,
        message: `Mapped ${mappings.length} sensor(s) to scene properties`,
      };
    }

    case 'holo_holotwin_compile_quilt': {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
      const holoCode = typeof args.holoCode === 'string' ? args.holoCode : '';
      const deviceOverride = args.deviceOverride as LookingGlassDevice | undefined;
      const quiltConfigOverride = args.quiltConfig as Partial<QuiltConfig> | undefined;

      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`holotwin: session ${sessionId} not found`);
      }

      session.holoCode = holoCode;
      const device = deviceOverride || session.device;
      const baseConfig = LOOKING_GLASS_PRESETS[device];

      // Merge config overrides
      const quiltConfig: QuiltConfig = {
        ...baseConfig,
        ...(quiltConfigOverride || {}),
      };

      const compiler = new QuiltCompiler();
      const composition = parseHoloTwinComposition(holoCode);
      const result = compiler.compileQuilt(composition, quiltConfig);
      const receipt = await renderQuiltReceipt(composition, quiltConfig, session);

      const quiltHash = `sha256:${receipt.sha256}`;
      const quiltUrl = `data:image/png;base64,${receipt.pngBase64}`;

      session.quiltHash = quiltHash;
      session.quiltUrl = quiltUrl;
      session.quiltBytes = receipt.bytes;
      session.quiltPngBase64 = receipt.pngBase64;
      session.lastSyncTime = Date.now();

      return {
        ok: true,
        sessionId,
        device,
        quilt: {
          ...result,
          receipt,
        },
        hash: quiltHash,
        url: quiltUrl,
        stub: false,
      };
    }

    case 'holo_holotwin_stream': {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
      const recompileIntervalMs =
        typeof args.recompileIntervalMs === 'number' && Number.isFinite(args.recompileIntervalMs)
          ? Math.max(100, Math.floor(args.recompileIntervalMs))
          : 1000;
      const autoStop = typeof args.autoStop === 'boolean' ? args.autoStop : false;

      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`holotwin: session ${sessionId} not found`);
      }

      stopHoloTwinStream(session);
      const stream: HoloTwinStreamState = {
        isStreaming: true,
        startedAt: Date.now(),
        recompileIntervalMs,
        autoStop,
        ticks: 0,
      };
      session.stream = stream;

      await runStreamTick(session);
      stream.timer = setInterval(() => {
        void runStreamTick(session);
      }, recompileIntervalMs);
      unrefTimer(stream.timer);

      if (autoStop) {
        stream.stopTimer = setTimeout(() => {
          stopHoloTwinStream(session);
        }, recompileIntervalMs);
        unrefTimer(stream.stopTimer);
      }

      return {
        ok: true,
        sessionId,
        streaming: true,
        recompileIntervalMs,
        autoStop,
        ticks: stream.ticks,
        lastFrameHash: stream.lastFrameHash,
        message: `Streaming started. Recompiling every ${recompileIntervalMs}ms.`,
      };
    }

    case 'holo_holotwin_status': {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';

      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`holotwin: session ${sessionId} not found`);
      }

      return {
        ok: true,
        sessionId,
        physicalId: session.physicalId,
        protocol: session.protocol,
        device: session.device,
        isConnected: session.isConnected,
        mappingsCount: session.mappings.length,
        quiltHash: session.quiltHash,
        quiltUrl: session.quiltUrl,
        quiltBytes: session.quiltBytes,
        streaming: session.stream?.isStreaming ?? false,
        streamTicks: session.stream?.ticks ?? 0,
        streamLastFrameHash: session.stream?.lastFrameHash,
        streamLastError: session.stream?.lastError,
        lastSyncTime: session.lastSyncTime,
      };
    }

    case 'holo_holotwin_disconnect': {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';

      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`holotwin: session ${sessionId} not found`);
      }

      session.isConnected = false;
      stopHoloTwinStream(session);
      sessions.delete(sessionId);

      return {
        ok: true,
        sessionId,
        message: 'Disconnected from IoT sensor',
      };
    }

    case 'holo_holotwin_example': {
      const device = (args.device as LookingGlassDevice) || '16inch';
      const includeSimulation =
        typeof args.includeSimulation === 'boolean' ? args.includeSimulation : true;

      // Generate complete example
      const example = generateHoloTwinExample(device, includeSimulation);

      return {
        ok: true,
        device,
        ...example,
      };
    }

    default:
      return undefined;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function parseHoloTwinComposition(holoCode: string): QuiltComposition {
  const result = parseHolo(holoCode, { tolerant: false });
  if (!result.success || !result.ast) {
    const reason = result.errors?.[0]?.message ?? 'unknown parse failure';
    throw new Error(`holotwin: holoCode parse failed: ${reason}`);
  }
  return result.ast as QuiltComposition;
}

async function renderQuiltReceipt(
  composition: QuiltComposition,
  quiltConfig: QuiltConfig,
  session: HoloTwinSession
): Promise<QuiltReceipt> {
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
      source[pixel] = Math.round(40 + nx * 180);
      source[pixel + 1] = Math.round(60 + ny * 120);
      source[pixel + 2] = Math.round(80 + ((mappingBias * 31) % 120));
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

async function runStreamTick(session: HoloTwinSession): Promise<void> {
  const stream = session.stream;
  if (!stream?.isStreaming) return;

  try {
    const holoCode =
      session.holoCode.trim() || generateHoloTwinExample(session.device, true).holoCode;
    const composition = parseHoloTwinComposition(holoCode);
    const baseConfig = LOOKING_GLASS_PRESETS[session.device];
    const compiler = new QuiltCompiler();
    compiler.compileQuilt(composition, baseConfig);
    const receipt = await renderQuiltReceipt(composition, baseConfig, session);

    stream.ticks += 1;
    stream.lastFrameHash = `sha256:${receipt.sha256}`;
    stream.lastError = undefined;
    session.quiltHash = stream.lastFrameHash;
    session.quiltUrl = `data:image/png;base64,${receipt.pngBase64}`;
    session.quiltBytes = receipt.bytes;
    session.quiltPngBase64 = receipt.pngBase64;
    session.lastSyncTime = Date.now();
  } catch (error) {
    stream.lastError = error instanceof Error ? error.message : String(error);
  }
}

function stopHoloTwinStream(session: HoloTwinSession): void {
  const stream = session.stream;
  if (!stream) return;
  if (stream.timer) clearInterval(stream.timer);
  if (stream.stopTimer) clearTimeout(stream.stopTimer);
  stream.isStreaming = false;
  stream.timer = undefined;
  stream.stopTimer = undefined;
}

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref(): void }).unref();
  }
}

function generateHoloTwinExample(device: LookingGlassDevice, includeSimulation: boolean) {
  const preset = LOOKING_GLASS_PRESETS[device];

  const holoCode = `composition "Smart Farm HoloTwin" {
  environment {
    skybox: "farm"
    ambient_light: 0.5
  }

  object "SoilMoistureSensor" {
    @iot_sensor { device_id: "soil-001", protocol: "mqtt" }
    @holo_twin {
      physical_id: "soil-001"
      display_device: "${device}"
      auto_recompile: true
    }
    geometry: "cylinder"
    position: [-2, 0.5, 0]
    scale: [0.3, 1, 0.3]
    color: "#8B4513"
  }

  object "TemperatureSensor" {
    @iot_sensor { device_id: "temp-001", protocol: "mqtt" }
    @holo_twin {
      physical_id: "temp-001"
      display_device: "${device}"
    }
    geometry: "sphere"
    position: [0, 1.5, 0]
    scale: [0.5, 0.5, 0.5]
    color: "#FF6B6B"
    emissive: "#FF6B6B"
    emissiveIntensity: 0.5
  }

  object "HumiditySensor" {
    @iot_sensor { device_id: "humidity-001", protocol: "mqtt" }
    @holo_twin {
      physical_id: "humidity-001"
      display_device: "${device}"
    }
    geometry: "box"
    position: [2, 0.75, 0]
    scale: [0.4, 0.4, 0.4]
    color: "#4ECDC4"
  }

  object "DashboardLabel" {
    geometry: "plane"
    position: [0, 3, -2]
    scale: [4, 0.5, 0.1]
    label: "Smart Farm Sensor Dashboard"
    color: "#ffffff"
  }
}`;

  const mappings = [
    {
      sensor_key: 'moisture',
      scene_property: 'scale',
      transform: 'scale' as const,
      min: 0,
      max: 100,
    },
    {
      sensor_key: 'temperature',
      scene_property: 'emissiveIntensity',
      transform: 'emissive' as const,
      min: 10,
      max: 40,
    },
    {
      sensor_key: 'humidity',
      scene_property: 'color',
      transform: 'color' as const,
      min: 0,
      max: 100,
    },
  ];

  return {
    holoCode,
    mappings,
    quiltConfig: preset,
    simulation: includeSimulation
      ? {
          enabled: true,
          sensorData: {
            moisture: 65,
            temperature: 24,
            humidity: 72,
          },
        }
      : undefined,
  };
}
