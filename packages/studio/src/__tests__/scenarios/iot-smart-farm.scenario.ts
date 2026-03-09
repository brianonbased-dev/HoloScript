/**
 * iot-smart-farm.scenario.ts — LIVING-SPEC: IoT Smart Farm
 *
 * Persona: Kai — farm manager connecting soil sensors, weather stations,
 * and drones via MQTT/BLE to a HoloScript digital twin dashboard.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  mqttConnect,
  mqttTopicMatch,
  parseTelemetryPayload,
  bleDiscover,
  bleSignalStrength,
  registerDevice,
  devicesByCapability,
  deviceStateCount,
  staleDevices,
  digitalTwinSync,
  twinHealthScore,
  otaUpdateCreate,
  otaProgressTick,
  otaFinalize,
  aggregateTelemetry,
  type IoTDevice,
  type MQTTConfig,
  type DigitalTwinState,
  type TelemetryPacket,
} from '@/lib/iot';

// ═══════════════════════════════════════════════════════════════════
// 1. MQTT Connection
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: IoT — MQTT Connection', () => {
  const config: MQTTConfig = {
    broker: 'mqtt://farm.local:1883',
    clientId: 'holoscript-dashboard',
    topics: ['farm/sensors/#', 'farm/weather/+'],
    qos: 1,
    keepAliveSeconds: 60,
  };

  it('mqttConnect() establishes connection and subscribes', () => {
    const conn = mqttConnect(config);
    expect(conn.connected).toBe(true);
    expect(conn.subscriptions).toHaveLength(2);
    expect(conn.messagesReceived).toBe(0);
  });

  it('mqttTopicMatch() — # matches multi-level', () => {
    expect(mqttTopicMatch('farm/sensors/#', 'farm/sensors/bed-a/moisture')).toBe(true);
    expect(mqttTopicMatch('farm/sensors/#', 'farm/weather/temp')).toBe(false);
  });

  it('mqttTopicMatch() — + matches single level', () => {
    expect(mqttTopicMatch('farm/+/status', 'farm/drone/status')).toBe(true);
    expect(mqttTopicMatch('farm/+/status', 'farm/drone/gps/status')).toBe(false);
  });

  it('parseTelemetryPayload() extracts numeric readings', () => {
    const packet = parseTelemetryPayload(
      'sensor-1',
      '{"temperature": 23.5, "humidity": 65, "label": "bed-a", "battery": 87}'
    );
    expect(packet).not.toBeNull();
    expect(packet!.readings.temperature).toBe(23.5);
    expect(packet!.readings.humidity).toBe(65);
    expect(packet!.readings.label).toBeUndefined(); // Non-numeric excluded
    expect(packet!.batteryPercent).toBe(87);
  });

  it('parseTelemetryPayload() returns null for invalid JSON', () => {
    expect(parseTelemetryPayload('sensor-1', 'not json')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. BLE Scanning
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: IoT — BLE Discovery', () => {
  const devices: IoTDevice[] = [
    {
      id: 'ble-1',
      name: 'Soil Probe A',
      protocol: 'ble',
      state: 'connected',
      firmwareVersion: '1.2.0',
      lastSeen: Date.now(),
      rssi: -45,
      capabilities: ['moisture', 'temperature'],
    },
    {
      id: 'ble-2',
      name: 'Gate Sensor',
      protocol: 'ble',
      state: 'disconnected',
      firmwareVersion: '1.0.0',
      lastSeen: Date.now() - 60000,
      rssi: -80,
      capabilities: ['motion'],
    },
    {
      id: 'mqtt-1',
      name: 'Weather Station',
      protocol: 'mqtt',
      state: 'connected',
      firmwareVersion: '2.0.0',
      lastSeen: Date.now(),
      capabilities: ['temperature', 'humidity', 'wind'],
    },
  ];

  it('bleDiscover() finds only BLE devices', () => {
    const results = bleDiscover(5000, devices);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.manufacturer === 'HoloScript IoT')).toBe(true);
  });

  it('bleSignalStrength() classifies RSSI', () => {
    expect(bleSignalStrength(-40)).toBe('strong');
    expect(bleSignalStrength(-60)).toBe('medium');
    expect(bleSignalStrength(-85)).toBe('weak');
    expect(bleSignalStrength(-95)).toBe('out-of-range');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Device Registry
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: IoT — Device Registry', () => {
  const now = Date.now();
  const registry: IoTDevice[] = [
    {
      id: 'd1',
      name: 'Sensor A',
      protocol: 'ble',
      state: 'connected',
      firmwareVersion: '1.0',
      lastSeen: now,
      capabilities: ['temperature', 'moisture'],
    },
    {
      id: 'd2',
      name: 'Sensor B',
      protocol: 'mqtt',
      state: 'disconnected',
      firmwareVersion: '1.0',
      lastSeen: now - 120000,
      capabilities: ['motion'],
    },
    {
      id: 'd3',
      name: 'Camera',
      protocol: 'http',
      state: 'error',
      firmwareVersion: '0.9',
      lastSeen: now - 300000,
      capabilities: ['video'],
    },
  ];

  it('registerDevice() adds new device', () => {
    const newDevice: IoTDevice = {
      id: 'd4',
      name: 'New',
      protocol: 'coap',
      state: 'pairing',
      firmwareVersion: '1.0',
      lastSeen: now,
      capabilities: ['pressure'],
    };
    const updated = registerDevice(registry, newDevice);
    expect(updated).toHaveLength(4);
  });

  it('registerDevice() updates existing device', () => {
    const updated = registerDevice(registry, { ...registry[0], state: 'disconnected' });
    expect(updated).toHaveLength(3);
    expect(updated[0].state).toBe('disconnected');
  });

  it('devicesByCapability() filters by capability', () => {
    expect(devicesByCapability(registry, 'temperature')).toHaveLength(1);
    expect(devicesByCapability(registry, 'video')).toHaveLength(1);
    expect(devicesByCapability(registry, 'gps')).toHaveLength(0);
  });

  it('deviceStateCount() tallies states', () => {
    const counts = deviceStateCount(registry);
    expect(counts.connected).toBe(1);
    expect(counts.disconnected).toBe(1);
    expect(counts.error).toBe(1);
    expect(counts.pairing).toBe(0);
  });

  it('staleDevices() finds devices past timeout', () => {
    const stale = staleDevices(registry, 60000, now); // 1 minute timeout
    expect(stale).toHaveLength(2); // d2 (2min ago) and d3 (5min ago)
    expect(stale.some((d) => d.id === 'd1')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Digital Twin Sync
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: IoT — Digital Twin Sync', () => {
  const now = Date.now();
  const twin: DigitalTwinState = {
    twinId: 'twin-bed-a',
    modelId: 'dtmi:holoscript:SmartPlanter;1',
    properties: { temperature: 20, moisture: 45 },
    telemetry: [],
    lastSync: now - 5000,
    driftMs: 5000,
  };

  it('digitalTwinSync() updates properties from telemetry', () => {
    const packet: TelemetryPacket = {
      deviceId: 'sensor-1',
      timestamp: now,
      readings: { temperature: 23.5, moisture: 52 },
      quality: 'good',
    };
    const updated = digitalTwinSync(twin, packet);
    expect(updated.properties.temperature).toBe(23.5);
    expect(updated.properties.moisture).toBe(52);
    expect(updated.telemetry).toHaveLength(1);
  });

  it('twinHealthScore() — fresh sync scores high', () => {
    const fresh = { ...twin, lastSync: now - 1000 };
    expect(twinHealthScore(fresh, now)).toBeGreaterThanOrEqual(90);
  });

  it('twinHealthScore() — stale sync scores low', () => {
    const stale = { ...twin, lastSync: now - 600000 }; // 10 min old
    expect(twinHealthScore(stale, now)).toBeLessThanOrEqual(60);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. OTA Firmware Updates
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: IoT — OTA Updates', () => {
  const device: IoTDevice = {
    id: 'sensor-1',
    name: 'Soil Probe',
    protocol: 'ble',
    state: 'connected',
    firmwareVersion: '1.0.0',
    lastSeen: Date.now(),
    capabilities: ['temperature', 'moisture'],
  };

  it('otaUpdateCreate() initializes pending update', () => {
    const ota = otaUpdateCreate(
      device,
      '1.1.0',
      'https://fw.holoscript.io/v1.1.0.bin',
      256000,
      'sha256:abc123'
    );
    expect(ota.status).toBe('pending');
    expect(ota.progress).toBe(0);
    expect(ota.currentVersion).toBe('1.0.0');
    expect(ota.targetVersion).toBe('1.1.0');
  });

  it('otaProgressTick() advances download progress', () => {
    let ota = otaUpdateCreate(device, '1.1.0', '', 100000, 'sha256:abc');
    ota = otaProgressTick(ota, 50000);
    expect(ota.status).toBe('downloading');
    expect(ota.progress).toBe(50);
    ota = otaProgressTick(ota, 50000);
    expect(ota.progress).toBe(100);
    expect(ota.status).toBe('installing');
  });

  it('otaFinalize() marks completion', () => {
    const ota = otaUpdateCreate(device, '1.1.0', '', 100000, 'sha256:abc');
    const success = otaFinalize(ota, true);
    expect(success.status).toBe('complete');
    const fail = otaFinalize(ota, false);
    expect(fail.status).toBe('failed');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Telemetry Aggregation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: IoT — Telemetry Aggregation', () => {
  const packets: TelemetryPacket[] = [
    { deviceId: 's1', timestamp: 1, readings: { temperature: 20, humidity: 40 }, quality: 'good' },
    { deviceId: 's1', timestamp: 2, readings: { temperature: 22, humidity: 45 }, quality: 'good' },
    { deviceId: 's1', timestamp: 3, readings: { temperature: 25, humidity: 55 }, quality: 'good' },
  ];

  it('aggregateTelemetry() computes min/max/avg', () => {
    const temp = aggregateTelemetry(packets, 'temperature');
    expect(temp.min).toBe(20);
    expect(temp.max).toBe(25);
    expect(temp.avg).toBeCloseTo(22.33, 1);
    expect(temp.count).toBe(3);
  });

  it('aggregateTelemetry() returns zeros for missing key', () => {
    const missing = aggregateTelemetry(packets, 'pressure');
    expect(missing.count).toBe(0);
    expect(missing.avg).toBe(0);
  });
});
