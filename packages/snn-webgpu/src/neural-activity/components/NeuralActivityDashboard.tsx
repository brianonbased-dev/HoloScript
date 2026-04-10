/**
 * NeuralActivityDashboard
 *
 * Composite component that combines all three visualization views with
 * playback controls, layer selection, and time window configuration.
 *
 * Layout: Left panel (heatmap + controls), right panel (raster + 3D view).
 */

import React, { useCallback, useState } from 'react';
import type { SNNSnapshot, LayerActivation } from '../types';
import { useNeuralData } from '../hooks/useNeuralData';
import { MembranePotentialHeatmap } from './MembranePotentialHeatmap';
import { SpikeRasterPlot } from './SpikeRasterPlot';
import { LayerActivationView } from './LayerActivationView';

export interface NeuralActivityDashboardProps {
  /** Width of the entire dashboard. */
  width?: number;
  /** Height of the entire dashboard. */
  height?: number;
  /** Initial snapshots to pre-load. */
  initialSnapshots?: SNNSnapshot[];
  /** CSS class name. */
  className?: string;
  /** Maximum snapshots to buffer. */
  maxBufferSize?: number;
  /** External callback to receive new snapshot pushes (for data sources). */
  onSnapshotPush?: (pushFn: (snapshot: SNNSnapshot) => void) => void;
}

/** Predefined speed options for playback. */
const SPEED_OPTIONS = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0];

/** Predefined time window durations in ms. */
const TIME_WINDOW_OPTIONS = [
  { label: '100ms', value: 100 },
  { label: '500ms', value: 500 },
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
];

export const NeuralActivityDashboard: React.FC<NeuralActivityDashboardProps> = ({
  width = 1200,
  height = 800,
  initialSnapshots = [],
  className,
  maxBufferSize = 1000,
  onSnapshotPush,
}) => {
  const {
    currentSnapshot,
    visibleSpikes,
    timeWindow,
    playback,
    pushSnapshot,
    setPlaying,
    setSpeed,
    seekTo,
    setTimeWindowDuration,
    snapshotBuffer,
  } = useNeuralData({
    timeWindowDurationMs: 1000,
    initialSpeed: 1.0,
    maxBufferSize,
  });

  const [selectedLayer, setSelectedLayer] = useState(0);

  // Pre-load initial snapshots
  React.useEffect(() => {
    for (const snap of initialSnapshots) {
      pushSnapshot(snap);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose pushSnapshot to parent
  React.useEffect(() => {
    onSnapshotPush?.(pushSnapshot);
  }, [onSnapshotPush, pushSnapshot]);

  const handlePlayPause = useCallback(() => {
    setPlaying(!playback.isPlaying);
  }, [setPlaying, playback.isPlaying]);

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSpeed(parseFloat(e.target.value));
    },
    [setSpeed]
  );

  const handleTimeWindowChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setTimeWindowDuration(parseInt(e.target.value, 10));
    },
    [setTimeWindowDuration]
  );

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seekTo(parseFloat(e.target.value));
    },
    [seekTo]
  );

  const handleLayerSelect = useCallback((layerIndex: number) => {
    setSelectedLayer(layerIndex);
  }, []);

  // Layout calculations
  const panelGap = 16;
  const controlsHeight = 80;
  const leftWidth = Math.floor(width * 0.5 - panelGap);
  const rightWidth = Math.floor(width * 0.5 - panelGap);
  const vizHeight = Math.floor((height - controlsHeight - panelGap * 2) / 2);

  // Derive data for each view
  const heatmapVoltages = currentSnapshot?.membranePotentials ?? new Float32Array(0);
  const heatmapRows = currentSnapshot?.gridDimensions.rows ?? 1;
  const heatmapCols = currentSnapshot?.gridDimensions.cols ?? 1;
  const layers: LayerActivation[] = currentSnapshot?.layers ?? [];

  // Total neuron count for raster plot
  const totalNeurons =
    layers.reduce((sum, l) => sum + l.neuronCount, 0) || heatmapRows * heatmapCols;
  const populationIds = [...new Set(visibleSpikes.map((s) => s.populationId))];

  // Timeline range from buffered data
  const minTime = snapshotBuffer.length > 0 ? snapshotBuffer[0].timeMs : 0;
  const maxTime =
    snapshotBuffer.length > 0 ? snapshotBuffer[snapshotBuffer.length - 1].timeMs : 1000;

  return (
    <div
      className={className}
      role="region"
      aria-label="Neural activity dashboard"
      data-testid="neural-dashboard"
      style={{
        width,
        height,
        background: '#0d0d1a',
        color: '#e0e0e0',
        borderRadius: '8px',
        padding: panelGap,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: panelGap,
        fontFamily: "'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Control bar */}
      <div
        data-testid="dashboard-controls"
        role="toolbar"
        aria-label="Playback controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          height: controlsHeight,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '6px',
          padding: '0 16px',
          flexShrink: 0,
        }}
      >
        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          aria-label={playback.isPlaying ? 'Pause playback' : 'Start playback'}
          data-testid="play-pause-btn"
          style={{
            background: playback.isPlaying ? '#e74c3c' : '#2ecc71',
            border: 'none',
            color: '#fff',
            padding: '8px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            minWidth: 80,
          }}
        >
          {playback.isPlaying ? 'Pause' : 'Play'}
        </button>

        {/* Speed selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label htmlFor="speed-select" style={{ fontSize: '12px', color: '#aaa' }}>
            Speed:
          </label>
          <select
            id="speed-select"
            value={playback.speed}
            onChange={handleSpeedChange}
            data-testid="speed-select"
            style={{
              background: '#1a1a2e',
              color: '#e0e0e0',
              border: '1px solid #333',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
            }}
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </div>

        {/* Time window duration */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label htmlFor="timewindow-select" style={{ fontSize: '12px', color: '#aaa' }}>
            Window:
          </label>
          <select
            id="timewindow-select"
            value={timeWindow.durationMs}
            onChange={handleTimeWindowChange}
            data-testid="timewindow-select"
            style={{
              background: '#1a1a2e',
              color: '#e0e0e0',
              border: '1px solid #333',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px',
            }}
          >
            {TIME_WINDOW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Timeline scrubber */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>
            {playback.currentTimeMs.toFixed(0)}ms
          </span>
          <input
            type="range"
            min={minTime}
            max={maxTime}
            value={playback.currentTimeMs}
            onChange={handleSeek}
            aria-label="Timeline scrubber"
            data-testid="timeline-scrubber"
            style={{ flex: 1, accentColor: '#3498db' }}
          />
          <span style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>
            {maxTime.toFixed(0)}ms
          </span>
        </div>

        {/* Layer selector */}
        {layers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="layer-select" style={{ fontSize: '12px', color: '#aaa' }}>
              Layer:
            </label>
            <select
              id="layer-select"
              value={selectedLayer}
              onChange={(e) => handleLayerSelect(parseInt(e.target.value, 10))}
              data-testid="layer-select"
              style={{
                background: '#1a1a2e',
                color: '#e0e0e0',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
              }}
            >
              {layers.map((layer, i) => (
                <option key={layer.layerId} value={i}>
                  {layer.layerName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Stats */}
        <div
          data-testid="dashboard-stats"
          style={{ fontSize: '11px', color: '#888', textAlign: 'right', whiteSpace: 'nowrap' }}
        >
          <div>Snapshots: {snapshotBuffer.length}</div>
          <div>Spikes: {visibleSpikes.length}</div>
        </div>
      </div>

      {/* Visualization panels */}
      <div
        style={{
          display: 'flex',
          gap: panelGap,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left column: Heatmap + Raster */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: panelGap, flex: 1 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: 4 }}>
              Membrane Potentials
            </div>
            <MembranePotentialHeatmap
              width={leftWidth}
              height={vizHeight}
              voltages={heatmapVoltages}
              gridRows={heatmapRows}
              gridCols={heatmapCols}
              ariaLabel="Membrane potential heatmap for selected layer"
            />
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: 4 }}>
              Spike Raster Plot
            </div>
            <SpikeRasterPlot
              width={leftWidth}
              height={vizHeight}
              spikes={visibleSpikes}
              timeWindow={timeWindow}
              neuronCount={totalNeurons}
              populationIds={populationIds}
              ariaLabel="Spike raster plot showing spike timing across neuron populations"
            />
          </div>
        </div>

        {/* Right column: 3D Layer View */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: 4 }}>
            Layer Activations (3D)
          </div>
          <LayerActivationView
            width={rightWidth}
            height={vizHeight * 2 + panelGap}
            layers={layers}
            selectedLayer={selectedLayer}
            onLayerSelect={handleLayerSelect}
            ariaLabel="3D visualization of layer activations across the SNN"
          />
        </div>
      </div>

      {/* No data message */}
      {snapshotBuffer.length === 0 && (
        <div
          data-testid="no-data-message"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#666',
            fontSize: '16px',
            textAlign: 'center',
          }}
        >
          <div>No SNN data available</div>
          <div style={{ fontSize: '12px', marginTop: 8 }}>
            Push snapshots to begin visualization
          </div>
        </div>
      )}
    </div>
  );
};
