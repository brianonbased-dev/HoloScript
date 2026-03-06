/**
 * Shared types for SNN (Spiking Neural Network) visualization.
 *
 * These types model the data structures produced by SNN inference
 * engines: membrane potentials, spike events, and layer activations.
 */

/** A single neuron's membrane potential at a point in time. */
export interface MembranePotential {
  /** Neuron index within the layer. */
  neuronIndex: number;
  /** Membrane voltage in millivolts (-80 to +40 typical range). */
  voltage: number;
}

/** A spike event emitted when a neuron's membrane potential crosses threshold. */
export interface SpikeEvent {
  /** Neuron index within the population. */
  neuronIndex: number;
  /** Timestamp in milliseconds relative to simulation start. */
  timestampMs: number;
  /** Population/layer identifier. */
  populationId: string;
}

/** Activation snapshot for a single SNN layer at one timestep. */
export interface LayerActivation {
  /** Layer identifier (e.g., "input", "hidden-0", "output"). */
  layerId: string;
  /** Human-readable layer name. */
  layerName: string;
  /** Number of neurons in this layer. */
  neuronCount: number;
  /** Activation values normalized to [0, 1]. */
  activations: Float32Array;
  /** Layer dimensions for spatial layout (rows x cols). */
  dimensions: { rows: number; cols: number };
}

/** Full SNN state snapshot at a single timestep. */
export interface SNNSnapshot {
  /** Simulation timestep index. */
  timestep: number;
  /** Simulation time in milliseconds. */
  timeMs: number;
  /** Membrane potentials for the focused layer. */
  membranePotentials: Float32Array;
  /** Dimensions of the focused layer grid. */
  gridDimensions: { rows: number; cols: number };
  /** Spike events that occurred in this timestep. */
  spikes: SpikeEvent[];
  /** Activation snapshots for all layers. */
  layers: LayerActivation[];
}

/** Time window configuration for scrolling visualizations. */
export interface TimeWindow {
  /** Start time in milliseconds. */
  startMs: number;
  /** End time in milliseconds. */
  endMs: number;
  /** Duration of the visible window in milliseconds. */
  durationMs: number;
}

/** Playback controls state. */
export interface PlaybackState {
  /** Whether the simulation is currently playing. */
  isPlaying: boolean;
  /** Playback speed multiplier (1.0 = real-time). */
  speed: number;
  /** Current simulation time in milliseconds. */
  currentTimeMs: number;
}

/** Color mapping configuration for heatmaps. */
export interface ColorMap {
  /** Name of the color map (e.g., "viridis", "plasma", "coolwarm"). */
  name: string;
  /** Minimum value for color mapping. */
  minValue: number;
  /** Maximum value for color mapping. */
  maxValue: number;
}

/** Props shared across all visualization components. */
export interface BaseVisualizationProps {
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
  /** CSS class name. */
  className?: string;
  /** Accessible label for screen readers. */
  ariaLabel?: string;
}

/** WebGPU device and context bundle. */
export interface WebGPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
}
