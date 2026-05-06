/**
 * HoloTwin Trait — IoT Sensor → HoloScript Scene → Quilt → Looking Glass
 *
 * Extends DigitalTwin with real-time holographic rendering pipeline.
 * Takes IoT sensor telemetry, updates a 3D scene, compiles to Looking Glass
 * quilt format, and displays on holographic hardware.
 *
 * Pipeline:
 *   IoT Sensor (MQTT/HTTP) → DigitalTwin sync → QuiltCompiler → Looking Glass
 *
 * @version 1.0.0
 * @see DigitalTwinTrait for base physical↔virtual sync
 * @see QuiltCompiler for holographic compilation
 */

import type { TraitHandler } from './TraitTypes';
import type { IotGateway } from '../services/GatewayAdapter';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Looking Glass device presets
 * Source: Looking Glass Factory SDK defaults
 */
type LookingGlassDevice = 'go' | '16inch' | '27inch' | '65inch';

interface LookingGlassPreset {
  views: number;
  columns: number;
  rows: number;
  resolution: [number, number];
  baseline: number; // Camera baseline in meters
  focusDistance: number; // Focus distance in meters
}

const LOOKING_GLASS_PRESETS: Record<LookingGlassDevice, LookingGlassPreset> = {
  go: {
    views: 45,
    columns: 9,
    rows: 5,
    resolution: [1440, 1440],
    baseline: 0.04,
    focusDistance: 0.15,
  },
  '16inch': {
    views: 48,
    columns: 8,
    rows: 6,
    resolution: [3360, 3360],
    baseline: 0.06,
    focusDistance: 0.2,
  },
  '27inch': {
    views: 60,
    columns: 10,
    rows: 6,
    resolution: [5120, 3840],
    baseline: 0.065,
    focusDistance: 0.25,
  },
  '65inch': {
    views: 128,
    columns: 16,
    rows: 8,
    resolution: [7680, 4320],
    baseline: 0.08,
    focusDistance: 0.5,
  },
};

/**
 * Sensor mapping: maps IoT telemetry keys to scene properties
 */
interface SensorMapping {
  sensor_key: string; // IoT telemetry key (e.g., "temperature")
  scene_property: string; // Scene node property to update
  transform?: 'scale' | 'color' | 'position' | 'emissive' | 'label';
  min?: number; // For scaling/color interpolation
  max?: number;
  invert?: boolean;
}

interface HoloTwinConfig {
  // Physical device config
  physical_id: string; // IoT device/sensor ID
  connection_string: string; // MQTT broker URL or HTTP endpoint
  protocol: 'mqtt' | 'http' | 'websocket';

  // Holographic display config
  display_device: LookingGlassDevice;
  auto_recompile: boolean; // Re-compile quilt on scene change
  recompile_interval_ms: number; // Min time between recompiles

  // Sensor mappings
  sensor_mappings: SensorMapping[];

  // Sync config
  poll_interval_ms: number;
  simulation_mode: boolean; // Run without physical device
}

interface HoloTwinState {
  isSynced: boolean;
  lastSyncTime: number;
  lastRecompileTime: number;
  sensorData: Record<string, number>;
  pendingRecompile: boolean;
  quiltHash?: string;
  quiltUrl?: string;
  connectionHandle: unknown;
  error?: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const holoTwinHandler: TraitHandler<HoloTwinConfig> = {
  name: 'holo_twin',

  defaultConfig: {
    physical_id: '',
    connection_string: '',
    protocol: 'mqtt',
    display_device: '16inch',
    auto_recompile: true,
    recompile_interval_ms: 1000,
    sensor_mappings: [],
    poll_interval_ms: 5000,
    simulation_mode: false,
  },

  onAttach(node, config, context) {
    const state: HoloTwinState = {
      isSynced: false,
      lastSyncTime: 0,
      lastRecompileTime: 0,
      sensorData: {},
      pendingRecompile: false,
      connectionHandle: null,
    };
    node.__holoTwinState = state;

    // Connect to physical device
    if (!config.simulation_mode && config.physical_id) {
      connectToSensor(node, state, config, context);
    } else if (config.simulation_mode) {
      state.isSynced = true;
      context.emit?.('on_holo_twin_connected', { node, mode: 'simulation' });
      // Start simulation loop
      startSimulation(node, state, config, context);
    }
  },

  onDetach(node, config, context) {
    const state = node.__holoTwinState as HoloTwinState;
    if (state?.connectionHandle) {
      disconnectFromSensor(node, state, config, context);
    }
    const simulationInterval = (state as unknown as Record<string, unknown>)?.simulationInterval;
    if (simulationInterval !== undefined) {
      clearInterval(simulationInterval as ReturnType<typeof setInterval>);
    }
    delete node.__holoTwinState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__holoTwinState as HoloTwinState;
    if (!state) return;

    // Poll for sensor updates
    if (config.protocol === 'http' && state.isSynced) {
      const now = Date.now();
      if (now - state.lastSyncTime >= config.poll_interval_ms) {
        fetchSensorData(node, state, config, context);
      }
    }

    // Auto-recompile quilt if scene changed
    if (config.auto_recompile && state.pendingRecompile) {
      const now = Date.now();
      if (now - state.lastRecompileTime >= config.recompile_interval_ms) {
        recompileQuilt(node, state, config, context);
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__holoTwinState as HoloTwinState;
    if (!state) return;

    if (event.type === 'holo_twin_sensor_data') {
      // Process incoming sensor data
      const sensorData = event.data as Record<string, number>;
      processSensorData(node, state, config, sensorData, context);
    } else if (event.type === 'holo_twin_connected') {
      state.isSynced = true;
      state.connectionHandle = event.handle;
      state.lastSyncTime = Date.now();
      context.emit?.('on_holo_twin_connected', {
        node,
        physicalId: config.physical_id,
        device: config.display_device,
      });
    } else if (event.type === 'holo_twin_disconnected') {
      state.isSynced = false;
      state.connectionHandle = null;
      context.emit?.('on_holo_twin_disconnected', { node });
    } else if (event.type === 'holo_twin_error') {
      state.error = event.error as string;
      context.emit?.('on_holo_twin_error', {
        node,
        error: state.error,
      });
    } else if (event.type === 'holo_twin_quilt_compiled') {
      state.quiltHash = event.hash as string;
      state.quiltUrl = event.url as string;
      state.lastRecompileTime = Date.now();
      state.pendingRecompile = false;
      context.emit?.('on_holo_twin_quilt_ready', {
        node,
        hash: state.quiltHash,
        url: state.quiltUrl,
      });
    } else if (event.type === 'holo_twin_recompile') {
      // Manual recompile trigger
      state.pendingRecompile = true;
    } else if (event.type === 'holo_twin_get_status') {
      context.emit?.('holo_twin_status_result', {
        node,
        isSynced: state.isSynced,
        lastSyncTime: state.lastSyncTime,
        sensorData: { ...state.sensorData },
        quiltHash: state.quiltHash,
        quiltUrl: state.quiltUrl,
        error: state.error,
      });
    }
  },
};

// =============================================================================
// SENSOR CONNECTION
// =============================================================================

function connectToSensor(
  node: unknown,
  state: HoloTwinState,
  config: HoloTwinConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  const handler = holoTwinHandler as Record<string, unknown>;
  const gateway = handler.gateway as IotGateway | undefined;

  if (!gateway && config.protocol === 'mqtt') {
    const msg = '[HoloTwinTrait] No IoT Gateway configured. Call setGateway() first.';
    console.warn(msg);
    context.emit?.('on_holo_twin_error', { node, error: msg });
    return;
  }

  if (config.protocol === 'mqtt' && gateway) {
    // MQTT: subscribe to telemetry topic
    gateway.on('telemetry', (data: unknown) => {
      const telemetry = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      if (telemetry.deviceId === config.physical_id) {
        context.emit?.('holo_twin_sensor_data', {
          node,
          data: (data as { readings?: Record<string, number> }).readings || data,
        });
      }
    });

    gateway.on('connected', (data: unknown) => {
      const connection = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      if (connection.deviceId === config.physical_id) {
        context.emit?.('holo_twin_connected', { handle: gateway, ...connection });
      }
    });

    gateway.on('error', (error: unknown) => {
      context.emit?.('holo_twin_error', { node, error });
    });

    // Connect to broker
    gateway.connect(config.physical_id, config.connection_string);
  }

  context.emit?.('holo_twin_connect', {
    node,
    physicalId: config.physical_id,
    protocol: config.protocol,
    connectionString: config.connection_string,
  });
}

function disconnectFromSensor(
  node: unknown,
  state: HoloTwinState,
  config: HoloTwinConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  const handler = holoTwinHandler as Record<string, unknown>;
  const gateway = handler.gateway as IotGateway | undefined;

  if (gateway) {
    gateway.disconnect(config.physical_id);
  }

  context.emit?.('holo_twin_disconnect', { node });
}

async function fetchSensorData(
  node: unknown,
  state: HoloTwinState,
  config: HoloTwinConfig,
  context: { emit?: (event: string, data: unknown) => void }
): Promise<void> {
  try {
    // HTTP polling: fetch from endpoint
    // In production, this would use node-fetch or similar
    // For now, emit event for external handler to process
    context.emit?.('holo_twin_fetch_http', {
      node,
      url: config.connection_string,
      physicalId: config.physical_id,
    });
    state.lastSyncTime = Date.now();
  } catch (error) {
    context.emit?.('holo_twin_error', {
      node,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// SENSOR DATA PROCESSING
// =============================================================================

function processSensorData(
  node: unknown,
  state: HoloTwinState,
  config: HoloTwinConfig,
  sensorData: Record<string, number>,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  state.sensorData = { ...state.sensorData, ...sensorData };
  state.lastSyncTime = Date.now();

  // Apply sensor mappings to scene properties
  const nodeObj = node as Record<string, unknown>;
  for (const mapping of config.sensor_mappings) {
    const value = sensorData[mapping.sensor_key];
    if (value === undefined) continue;

    const transformed = transformSensorValue(value, mapping);
    nodeObj[mapping.scene_property] = transformed;
  }

  // Trigger quilt recompile if auto-recompile enabled
  if (config.auto_recompile) {
    state.pendingRecompile = true;
  }

  context.emit?.('on_holo_twin_sensor_update', {
    node,
    sensorData: state.sensorData,
    appliedMappings: config.sensor_mappings.length,
  });
}

function transformSensorValue(value: number, mapping: SensorMapping): number | string | unknown {
  const { transform, min = 0, max = 100, invert = false } = mapping;

  // Normalize value to 0-1 range
  let normalized = (value - min) / (max - min);
  normalized = Math.max(0, Math.min(1, normalized)); // Clamp

  if (invert) {
    normalized = 1 - normalized;
  }

  switch (transform) {
    case 'scale':
      // Map to scale factor 0.5-2.0
      return 0.5 + normalized * 1.5;

    case 'position':
      // Map to position offset (context-dependent)
      return normalized;

    case 'color':
      // Map to color gradient (handled by scene)
      return normalized;

    case 'emissive':
      // Map to emissive intensity 0-2
      return normalized * 2;

    case 'label':
      // Return formatted string
      return value.toFixed(1);

    default:
      return value;
  }
}

// =============================================================================
// QUILT RECOMPILATION
// =============================================================================

async function recompileQuilt(
  node: unknown,
  state: HoloTwinState,
  config: HoloTwinConfig,
  context: { emit?: (event: string, data: unknown) => void }
): Promise<void> {
  // Emit event for external quilt compiler to handle
  // The actual compilation happens in the MCP server / engine
  const preset = LOOKING_GLASS_PRESETS[config.display_device];

  context.emit?.('holo_twin_compile_quilt', {
    node,
    device: config.display_device,
    preset,
    sensorData: state.sensorData,
  });

  // Simulate compilation result (in production, wait for callback)
  // This is a placeholder for the actual QuiltCompiler integration
  const mockHash = `holotwin_${config.physical_id}_${Date.now()}`;
  const mockUrl = `https://studio.holoscript.net/hologram/${mockHash}`;

  context.emit?.('holo_twin_quilt_compiled', {
    node,
    hash: mockHash,
    url: mockUrl,
    device: config.display_device,
  });
}

// =============================================================================
// SIMULATION MODE
// =============================================================================

function startSimulation(
  node: unknown,
  state: HoloTwinState,
  config: HoloTwinConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  // Generate simulated sensor data
  const simulateSensorData = (): Record<string, number> => {
    const data: Record<string, number> = {};
    for (const mapping of config.sensor_mappings) {
      // Random walk simulation
      const prev = state.sensorData[mapping.sensor_key] || mapping.min || 0;
      const delta = (Math.random() - 0.5) * ((mapping.max || 100) - (mapping.min || 0)) * 0.1;
      data[mapping.sensor_key] = Math.max(
        mapping.min || 0,
        Math.min(mapping.max || 100, prev + delta)
      );
    }
    return data;
  };

  // Simulation loop
  const simulationInterval = setInterval(() => {
    if (!state.isSynced) return;

    const data = simulateSensorData();
    processSensorData(node, state, config, data, context);
  }, config.poll_interval_ms);

  // Store interval handle for cleanup
  (state as unknown as Record<string, unknown>).simulationInterval = simulationInterval;
}

// =============================================================================
// LOOKING GLASS PRESETS
// =============================================================================

export function getLookingGlassPreset(device: LookingGlassDevice): LookingGlassPreset {
  return LOOKING_GLASS_PRESETS[device];
}

export function listLookingGlassDevices(): LookingGlassDevice[] {
  return Object.keys(LOOKING_GLASS_PRESETS) as LookingGlassDevice[];
}

export default holoTwinHandler;
