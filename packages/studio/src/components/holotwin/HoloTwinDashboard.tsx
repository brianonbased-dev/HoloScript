/**
 * HoloTwinDashboard.tsx — IoT Sensor → HoloScript → Looking Glass UI
 *
 * React component for real-time holographic digital twin control.
 * Features:
 * - MQTT broker connection wizard
 * - Sensor mapping configuration
 * - Live telemetry visualization
 * - Quilt compilation preview
 * - Looking Glass device selector
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

type LookingGlassDevice = 'go' | '16inch' | '27inch' | '65inch';

interface SensorMapping {
  sensor_key: string;
  scene_property: string;
  transform: 'scale' | 'color' | 'position' | 'emissive' | 'label';
  min: number;
  max: number;
  invert: boolean;
}

interface TelemetryData {
  [key: string]: number;
}

interface HoloTwinStatus {
  isConnected: boolean;
  lastSyncTime: number;
  sensorData: TelemetryData;
  quiltHash?: string;
  quiltUrl?: string;
  error?: string;
}

// =============================================================================
// LOOKING GLASS PRESETS
// =============================================================================

const LOOKING_GLASS_DEVICES: { value: LookingGlassDevice; label: string; specs: string }[] = [
  { value: 'go', label: 'Looking Glass Go', specs: '1440×1440, 45 views' },
  { value: '16inch', label: 'Looking Glass 16"', specs: '3360×3360, 48 views' },
  { value: '27inch', label: 'Looking Glass 27"', specs: '5120×3840, 60 views' },
  { value: '65inch', label: 'Looking Glass 65"', specs: '7680×4320, 128 views' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export function HoloTwinDashboard() {
  // Connection state
  const [physicalId, setPhysicalId] = useState('');
  const [brokerUrl, setBrokerUrl] = useState('mqtt://localhost:1883');
  const [protocol, setProtocol] = useState<'mqtt' | 'http'>('mqtt');
  const [device, setDevice] = useState<LookingGlassDevice>('16inch');
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Sensor mappings
  const [mappings, setMappings] = useState<SensorMapping[]>([
    { sensor_key: 'temperature', scene_property: 'emissiveIntensity', transform: 'emissive', min: 10, max: 40, invert: false },
    { sensor_key: 'humidity', scene_property: 'scale', transform: 'scale', min: 0, max: 100, invert: false },
    { sensor_key: 'moisture', scene_property: 'color', transform: 'color', min: 0, max: 100, invert: false },
  ]);

  // Live data
  const [telemetry, setTelemetry] = useState<TelemetryData>({});
  const [status, setStatus] = useState<HoloTwinStatus | null>(null);
  const [quiltUrl, setQuiltUrl] = useState<string | null>(null);

  // UI state
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoRecompile, setAutoRecompile] = useState(true);
  const [showSimulation, setShowSimulation] = useState(true);

  // =============================================================================
  // CONNECTION HANDLERS
  // =============================================================================

  const handleConnect = useCallback(async () => {
    try {
      const response = await fetch('/api/holotwin/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          physicalId,
          protocol,
          connectionString: brokerUrl,
          displayDevice: device,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        setSessionId(data.sessionId);
        setIsConnected(true);
        setStatus({
          isConnected: true,
          lastSyncTime: Date.now(),
          sensorData: {},
        });
      } else {
        setStatus({ isConnected: false, lastSyncTime: 0, sensorData: {}, error: data.error });
      }
    } catch (error) {
      setStatus({
        isConnected: false,
        lastSyncTime: 0,
        sensorData: {},
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  }, [physicalId, brokerUrl, protocol, device]);

  const handleDisconnect = useCallback(async () => {
    if (!sessionId) return;

    try {
      await fetch('/api/holotwin/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      setIsConnected(false);
      setSessionId(null);
      setIsStreaming(false);
      setQuiltUrl(null);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }, [sessionId]);

  // =============================================================================
  // SENSOR MAPPING HANDLERS
  // =============================================================================

  const handleAddMapping = () => {
    setMappings([
      ...mappings,
      { sensor_key: '', scene_property: '', transform: 'scale', min: 0, max: 100, invert: false },
    ]);
  };

  const handleUpdateMapping = (index: number, updates: Partial<SensorMapping>) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    setMappings(newMappings);
  };

  const handleRemoveMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const handleSaveMappings = useCallback(async () => {
    if (!sessionId) return;

    try {
      await fetch('/api/holotwin/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, mappings }),
      });
    } catch (error) {
      console.error('Save mappings error:', error);
    }
  }, [sessionId, mappings]);

  // =============================================================================
  // QUILT COMPILATION
  // =============================================================================

  const handleCompileQuilt = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch('/api/holotwin/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, device }),
      });

      const data = await response.json();
      if (data.ok) {
        setQuiltUrl(data.url);
        setStatus((prev) =>
          prev ? { ...prev, quiltHash: data.hash, quiltUrl: data.url } : null
        );
      }
    } catch (error) {
      console.error('Compile error:', error);
    }
  }, [sessionId, device]);

  // =============================================================================
  // STREAMING
  // =============================================================================

  const handleStartStream = useCallback(async () => {
    if (!sessionId) return;

    try {
      await fetch('/api/holotwin/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          autoRecompile,
          recompileIntervalMs: 1000,
        }),
      });
      setIsStreaming(true);
    } catch (error) {
      console.error('Stream error:', error);
    }
  }, [sessionId, autoRecompile]);

  const handleStopStream = useCallback(async () => {
    setIsStreaming(false);
    // Stream stops automatically on disconnect
  }, []);

  // =============================================================================
  // SIMULATION MODE
  // =============================================================================

  useEffect(() => {
    if (!showSimulation || !isConnected) return;

    // Simulate sensor data updates
    const interval = setInterval(() => {
      setTelemetry((prev) => ({
        temperature: 20 + Math.random() * 15, // 20-35°C
        humidity: 40 + Math.random() * 40, // 40-80%
        moisture: 30 + Math.random() * 50, // 30-80%
        ...prev,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [showSimulation, isConnected]);

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="p-4 space-y-4 bg-gray-900 text-white rounded-lg">
      <h2 className="text-xl font-bold">🏭 HoloTwin Dashboard</h2>
      <p className="text-sm text-gray-400">
        IoT Sensor → HoloScript Scene → Looking Glass Quilt
      </p>

      {/* Connection Panel */}
      <div className="p-4 bg-gray-800 rounded-lg space-y-3">
        <h3 className="font-semibold">📡 Connection</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400">Physical Device ID</label>
            <input
              type="text"
              value={physicalId}
              onChange={(e) => setPhysicalId(e.target.value)}
              placeholder="sensor-001"
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400">Protocol</label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as 'mqtt' | 'http')}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600"
            >
              <option value="mqtt">MQTT</option>
              <option value="http">HTTP</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-gray-400">
              {protocol === 'mqtt' ? 'MQTT Broker URL' : 'HTTP Endpoint'}
            </label>
            <input
              type="text"
              value={brokerUrl}
              onChange={(e) => setBrokerUrl(e.target.value)}
              placeholder={protocol === 'mqtt' ? 'mqtt://localhost:1883' : 'http://localhost:3000/sensors'}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-gray-400">Looking Glass Device</label>
            <select
              value={device}
              onChange={(e) => setDevice(e.target.value as LookingGlassDevice)}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600"
            >
              {LOOKING_GLASS_DEVICES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label} ({d.specs})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={!physicalId || !brokerUrl}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
            >
              Disconnect
            </button>
          )}

          {isConnected && (
            <>
              <button
                onClick={handleSaveMappings}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Save Mappings
              </button>
              <button
                onClick={handleCompileQuilt}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
              >
                Compile Quilt
              </button>
              {!isStreaming ? (
                <button
                  onClick={handleStartStream}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded"
                >
                  Start Stream
                </button>
              ) : (
                <button
                  onClick={handleStopStream}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
                >
                  Stop Stream
                </button>
              )}
            </>
          )}
        </div>

        {status?.error && (
          <div className="p-2 bg-red-900/50 border border-red-700 rounded text-red-200">
            ⚠️ {status.error}
          </div>
        )}
      </div>

      {/* Sensor Mappings Panel */}
      {isConnected && (
        <div className="p-4 bg-gray-800 rounded-lg space-y-3">
          <h3 className="font-semibold">🔗 Sensor Mappings</h3>

          {mappings.map((mapping, index) => (
            <div key={index} className="grid grid-cols-6 gap-2 items-end">
              <div className="col-span-1">
                <label className="block text-xs text-gray-400">Sensor Key</label>
                <input
                  type="text"
                  value={mapping.sensor_key}
                  onChange={(e) =>
                    handleUpdateMapping(index, { sensor_key: e.target.value })
                  }
                  className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                  placeholder="temperature"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-xs text-gray-400">Scene Property</label>
                <input
                  type="text"
                  value={mapping.scene_property}
                  onChange={(e) =>
                    handleUpdateMapping(index, { scene_property: e.target.value })
                  }
                  className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                  placeholder="scale"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-xs text-gray-400">Transform</label>
                <select
                  value={mapping.transform}
                  onChange={(e) =>
                    handleUpdateMapping(index, {
                      transform: e.target.value as SensorMapping['transform'],
                    })
                  }
                  className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                >
                  <option value="scale">Scale</option>
                  <option value="color">Color</option>
                  <option value="position">Position</option>
                  <option value="emissive">Emissive</option>
                  <option value="label">Label</option>
                </select>
              </div>

              <div className="col-span-1">
                <label className="block text-xs text-gray-400">Min</label>
                <input
                  type="number"
                  value={mapping.min}
                  onChange={(e) =>
                    handleUpdateMapping(index, { min: Number(e.target.value) })
                  }
                  className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-xs text-gray-400">Max</label>
                <input
                  type="number"
                  value={mapping.max}
                  onChange={(e) =>
                    handleUpdateMapping(index, { max: Number(e.target.value) })
                  }
                  className="w-full px-2 py-1 bg-gray-700 rounded text-sm"
                />
              </div>

              <div className="col-span-1 flex items-center gap-2">
                <label className="text-xs text-gray-400 whitespace-nowrap">Invert</label>
                <input
                  type="checkbox"
                  checked={mapping.invert}
                  onChange={(e) =>
                    handleUpdateMapping(index, { invert: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <button
                  onClick={() => handleRemoveMapping(index)}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={handleAddMapping}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            + Add Mapping
          </button>
        </div>
      )}

      {/* Live Telemetry Panel */}
      {isConnected && (
        <div className="p-4 bg-gray-800 rounded-lg space-y-3">
          <h3 className="font-semibold">📊 Live Telemetry</h3>

          <div className="grid grid-cols-3 gap-4">
            {Object.entries(telemetry).map(([key, value]) => (
              <div key={key} className="p-3 bg-gray-700 rounded-lg">
                <div className="text-sm text-gray-400">{key}</div>
                <div className="text-2xl font-bold">{value.toFixed(1)}</div>
                {/* Progress bar */}
                <div className="mt-2 h-2 bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, ((value - 0) / 100) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showSimulation}
                onChange={(e) => setShowSimulation(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Simulate Sensor Data</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRecompile}
                onChange={(e) => setAutoRecompile(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Auto-Recompile Quilt</span>
            </label>
          </div>
        </div>
      )}

      {/* Quilt Preview Panel */}
      {quiltUrl && (
        <div className="p-4 bg-gray-800 rounded-lg space-y-3">
          <h3 className="font-semibold">🎬 Quilt Preview</h3>

          <div className="aspect-square bg-gray-700 rounded-lg overflow-hidden">
            <img
              src={quiltUrl}
              alt="Quilt preview"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex gap-2">
            <a
              href={quiltUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
            >
              Open in Viewer
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(quiltUrl)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
            >
              Copy URL
            </button>
          </div>
        </div>
      )}

      {/* Status Footer */}
      {status && (
        <div className="p-3 bg-gray-800 rounded-lg text-sm text-gray-400 flex justify-between">
          <span>
            {isConnected ? '✅ Connected' : '❌ Disconnected'}
            {isStreaming && ' • 📡 Streaming'}
          </span>
          <span>
            Last sync: {new Date(status.lastSyncTime).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}

export default HoloTwinDashboard;
