/**
 * iot.ts — IoT Runtime Engine
 *
 * Runtime IoT trait bindings for HoloScript spatial scenes.
 * MQTT device communication, BLE scanning, telemetry processing,
 * digital twin state synchronization, and OTA firmware updates.
 *
 * Extends the DTDLCompiler (compile-time) with runtime device interactions.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type ConnectionProtocol = 'mqtt' | 'ble' | 'coap' | 'http' | 'websocket' | 'lorawan';
export type DeviceState = 'connected' | 'disconnected' | 'pairing' | 'error' | 'firmware-update';
export type TelemetryQuality = 'excellent' | 'good' | 'degraded' | 'lost';

export interface IoTDevice {
  id: string;
  name: string;
  protocol: ConnectionProtocol;
  state: DeviceState;
  firmwareVersion: string;
  lastSeen: number;
  rssi?: number;            // Signal strength (BLE/LoRaWAN)
  ipAddress?: string;       // Network devices
  capabilities: string[];   // e.g., ['temperature', 'humidity', 'motion']
}

export interface MQTTConfig {
  broker: string;           // e.g., 'mqtt://farm.local:1883'
  clientId: string;
  username?: string;
  password?: string;
  topics: string[];
  qos: 0 | 1 | 2;
  keepAliveSeconds: number;
}

export interface TelemetryPacket {
  deviceId: string;
  timestamp: number;
  readings: Record<string, number>;
  quality: TelemetryQuality;
  batteryPercent?: number;
}

export interface DigitalTwinState {
  twinId: string;
  modelId: string;           // DTDL model reference (e.g., 'dtmi:holoscript:SmartPlanter;1')
  properties: Record<string, unknown>;
  telemetry: TelemetryPacket[];
  lastSync: number;
  driftMs: number;           // Sync drift from physical device
}

export interface OTAUpdate {
  deviceId: string;
  currentVersion: string;
  targetVersion: string;
  firmwareUrl: string;
  sizeBytes: number;
  checksum: string;
  status: 'pending' | 'downloading' | 'installing' | 'complete' | 'failed';
  progress: number;          // 0-100
}

export interface BLEScanResult {
  deviceId: string;
  name: string | null;
  rssi: number;
  services: string[];
  connectable: boolean;
  manufacturer?: string;
}

// ═══════════════════════════════════════════════════════════════════
// MQTT Connection
// ═══════════════════════════════════════════════════════════════════

export interface MQTTConnection {
  config: MQTTConfig;
  connected: boolean;
  subscriptions: string[];
  messagesReceived: number;
  lastMessageTime: number;
}

/**
 * Simulate connecting to an MQTT broker.
 */
export function mqttConnect(config: MQTTConfig): MQTTConnection {
  return {
    config,
    connected: true,
    subscriptions: config.topics,
    messagesReceived: 0,
    lastMessageTime: Date.now(),
  };
}

/**
 * Validate MQTT topic pattern (supports wildcards + and #).
 */
export function mqttTopicMatch(pattern: string, topic: string): boolean {
  const patternParts = pattern.split('/');
  const topicParts = topic.split('/');

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '#') return true; // Multi-level wildcard
    if (patternParts[i] === '+') continue;    // Single-level wildcard
    if (i >= topicParts.length || patternParts[i] !== topicParts[i]) return false;
  }
  return patternParts.length === topicParts.length;
}

/**
 * Parse MQTT payload into a TelemetryPacket.
 */
export function parseTelemetryPayload(
  deviceId: string,
  payloadJson: string
): TelemetryPacket | null {
  try {
    const data = JSON.parse(payloadJson);
    const readings: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number') readings[key] = value;
    }
    return {
      deviceId,
      timestamp: Date.now(),
      readings,
      quality: Object.keys(readings).length > 0 ? 'good' : 'degraded',
      batteryPercent: typeof data.battery === 'number' ? data.battery : undefined,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// BLE Scanning
// ═══════════════════════════════════════════════════════════════════

/**
 * Simulate BLE device discovery scan.
 */
export function bleDiscover(
  scanDurationMs: number,
  knownDevices: IoTDevice[]
): BLEScanResult[] {
  return knownDevices
    .filter(d => d.protocol === 'ble')
    .map(d => ({
      deviceId: d.id,
      name: d.name,
      rssi: d.rssi ?? -65,
      services: d.capabilities.map(c => `0000${c.charCodeAt(0).toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`),
      connectable: d.state !== 'error',
      manufacturer: 'HoloScript IoT',
    }));
}

/**
 * Classify BLE signal strength.
 */
export function bleSignalStrength(rssi: number): 'strong' | 'medium' | 'weak' | 'out-of-range' {
  if (rssi >= -50) return 'strong';
  if (rssi >= -70) return 'medium';
  if (rssi >= -90) return 'weak';
  return 'out-of-range';
}

// ═══════════════════════════════════════════════════════════════════
// Device Registry
// ═══════════════════════════════════════════════════════════════════

/**
 * Register a new IoT device.
 */
export function registerDevice(
  registry: IoTDevice[],
  device: IoTDevice
): IoTDevice[] {
  const existing = registry.findIndex(d => d.id === device.id);
  if (existing >= 0) {
    const updated = [...registry];
    updated[existing] = device;
    return updated;
  }
  return [...registry, device];
}

/**
 * Find devices by capability.
 */
export function devicesByCapability(
  registry: IoTDevice[],
  capability: string
): IoTDevice[] {
  return registry.filter(d => d.capabilities.includes(capability));
}

/**
 * Count devices by state.
 */
export function deviceStateCount(registry: IoTDevice[]): Record<DeviceState, number> {
  const counts: Record<DeviceState, number> = {
    connected: 0, disconnected: 0, pairing: 0, error: 0, 'firmware-update': 0,
  };
  for (const d of registry) counts[d.state]++;
  return counts;
}

/**
 * Check which devices are stale (no communication within timeoutMs).
 */
export function staleDevices(registry: IoTDevice[], timeoutMs: number, now: number): IoTDevice[] {
  return registry.filter(d => now - d.lastSeen > timeoutMs);
}

// ═══════════════════════════════════════════════════════════════════
// Digital Twin Sync
// ═══════════════════════════════════════════════════════════════════

/**
 * Synchronize a digital twin with incoming telemetry.
 */
export function digitalTwinSync(
  twin: DigitalTwinState,
  packet: TelemetryPacket
): DigitalTwinState {
  const updatedProperties = { ...twin.properties };
  for (const [key, value] of Object.entries(packet.readings)) {
    updatedProperties[key] = value;
  }
  return {
    ...twin,
    properties: updatedProperties,
    telemetry: [...twin.telemetry.slice(-99), packet], // Keep last 100
    lastSync: packet.timestamp,
    driftMs: Math.abs(Date.now() - packet.timestamp),
  };
}

/**
 * Calculate twin health score based on sync freshness and telemetry quality.
 */
export function twinHealthScore(twin: DigitalTwinState, now: number): number {
  let score = 100;
  // Penalize for drift
  const ageSec = (now - twin.lastSync) / 1000;
  if (ageSec > 300) score -= 40;      // >5 min stale
  else if (ageSec > 60) score -= 20;  // >1 min stale
  else if (ageSec > 10) score -= 5;

  // Penalize for poor quality recent telemetry
  const recent = twin.telemetry.slice(-5);
  const degradedCount = recent.filter(t => t.quality === 'degraded' || t.quality === 'lost').length;
  score -= degradedCount * 10;

  return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════════════════════════
// OTA Firmware Updates
// ═══════════════════════════════════════════════════════════════════

/**
 * Create an OTA update plan for a device.
 */
export function otaUpdateCreate(
  device: IoTDevice,
  targetVersion: string,
  firmwareUrl: string,
  sizeBytes: number,
  checksum: string
): OTAUpdate {
  return {
    deviceId: device.id,
    currentVersion: device.firmwareVersion,
    targetVersion,
    firmwareUrl,
    sizeBytes,
    checksum,
    status: 'pending',
    progress: 0,
  };
}

/**
 * Simulate OTA progress tick (returns updated OTA state).
 */
export function otaProgressTick(update: OTAUpdate, chunkBytes: number): OTAUpdate {
  if (update.status === 'complete' || update.status === 'failed') return update;

  const downloaded = Math.round((update.progress / 100) * update.sizeBytes) + chunkBytes;
  const progress = Math.min(100, Math.round((downloaded / update.sizeBytes) * 100));

  let status = update.status;
  if (status === 'pending') status = 'downloading';
  if (progress >= 100) status = 'installing';

  return { ...update, progress, status };
}

/**
 * Finalize OTA update (marks as complete or failed).
 */
export function otaFinalize(update: OTAUpdate, success: boolean): OTAUpdate {
  return { ...update, status: success ? 'complete' : 'failed', progress: success ? 100 : update.progress };
}

// ═══════════════════════════════════════════════════════════════════
// Telemetry Aggregation
// ═══════════════════════════════════════════════════════════════════

/**
 * Aggregate telemetry readings across multiple packets.
 */
export function aggregateTelemetry(
  packets: TelemetryPacket[],
  key: string
): { min: number; max: number; avg: number; count: number } {
  const values = packets
    .map(p => p.readings[key])
    .filter((v): v is number => v !== undefined);

  if (values.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((s, v) => s + v, 0) / values.length,
    count: values.length,
  };
}
