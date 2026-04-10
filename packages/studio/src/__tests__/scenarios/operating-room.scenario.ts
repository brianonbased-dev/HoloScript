/**
 * operating-room.scenario.ts
 *
 * ═══════════════════════════════════════════════════════════════════
 * LIVING-SPEC: Healthcare Operating Room VRR Overlay
 * ═══════════════════════════════════════════════════════════════════
 *
 * Persona: Dr. Aris, a surgeon performing remote augmented reality procedures.
 * He uses the Hololand Phase 27 'Operating Room' schema to:
 *   - Visualize real-time patient biometrics (Heart Rate, SpO2)
 *   - Monitor hardware telemetry bounds via IoT telemetry traits
 *   - Automatically trigger emergency fallbacks on disconnected sensors
 *
 * Run:  npx vitest run src/__tests__/scenarios/operating-room.scenario.ts
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We mock VRRRuntime to simulate real-world IoT sensor data streams
// bound to the @sensor_stream trait logic inside HoloScript arrays.
import { VRRRuntime } from '../../../../runtime/src/VRRRuntime';

describe('Scenario: Healthcare Operating Room Simulation', () => {
  let vrr: VRRRuntime;
  let mockFetch: any;

  beforeEach(() => {
    // Mock the global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    vrr = new VRRRuntime({
      twin_id: 'operating_room_alpha',
      geo_center: { lat: 34.0522, lng: -118.2437 },
      apis: {
        iot: {
          provider: 'http',
          endpoint: 'biometrics.hospital.local',
          api_key: 'test_token',
        },
      },
      multiplayer: { enabled: false, max_players: 5, tick_rate: 10 },
      state_persistence: { client: 'localstorage', server: '' },
    });
  });

  afterEach(() => {
    // Clean up VRRRuntime intervals to prevent timer leaks into other test files
    if (vrr && typeof (vrr as unknown as { destroy: () => void }).destroy === 'function') {
      (vrr as unknown as { destroy: () => void }).destroy();
    }
    vi.restoreAllMocks();
  });

  it('maps IoT Sensor Array telemetry bounds via @sensor_stream', async () => {
    // Surgeon binds the patient's heart rate monitor to a HoloScript overlay.
    // Ensure the syncIoTSensor hook accurately propagates the telemetry.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        values: { heart_rate: 85, spo2: 98, blood_pressure: '120/80' },
        status: 'online',
      }),
    });

    const telemetryReceived = new Promise<{ values: Record<string, number | string>; status?: string }>((resolve) => {
      vrr.syncIoTSensor('patient_monitor_1', (data) => {
        resolve(data);
      });
    });

    const data = await telemetryReceived;
    expect(data.values.heart_rate).toBe(85);
    expect(data.values.spo2).toBe(98);
  });

  it('triggers @hardware_fault behaviors on anomaly detection', async () => {
    // Simulate a hardware fault where the sensor goes completely offline
    mockFetch.mockRejectedValue(new Error('Network disconnected'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Try to sync from the broken sensor
    vrr.syncIoTSensor('broken_sensor_2', () => {});

    // Wait for the setInterval to fire at least once and catch the throw
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'IoT polling failed for broken_sensor_2',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('validates telemetry commands sent to @actuator mechanisms', async () => {
    // Sending a command to adjust the surgical lighting (actuator)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const success = await vrr.actuateHardware('surgical_light_rig', { brightness: 80, angle: 45 });

    expect(success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://biometrics.hospital.local/actuate/surgical_light_rig',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_token',
        },
        body: JSON.stringify({ brightness: 80, angle: 45 }),
      })
    );
  });
});
