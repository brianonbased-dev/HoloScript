/**
 * Neural Activity Visualization Suite
 *
 * WebGPU-accelerated React components for real-time monitoring
 * of Spiking Neural Network (SNN) inference.
 */

// Types
export type {
  MembranePotential,
  SpikeEvent,
  LayerActivation,
  SNNSnapshot,
  TimeWindow,
  PlaybackState,
  ColorMap,
  BaseVisualizationProps,
  WebGPUContext,
} from './types';

// Components
export {
  MembranePotentialHeatmap,
  SpikeRasterPlot,
  LayerActivationView,
  NeuralActivityDashboard,
} from './components';
export type {
  MembranePotentialHeatmapProps,
  SpikeRasterPlotProps,
  LayerActivationViewProps,
  NeuralActivityDashboardProps,
} from './components';

// Hooks
export { useWebGPU, useAnimationLoop, useNeuralData } from './hooks';
export type {
  UseWebGPUResult,
  AnimationFrameInfo,
  RenderCallback,
  UseAnimationLoopOptions,
  UseNeuralDataOptions,
  UseNeuralDataResult,
} from './hooks';

// Utilities
export {
  isWebGPUSupported,
  requestDevice,
  initWebGPU,
  createShaderModule,
  createBuffer,
  writeBuffer,
  generateColorMapData,
  colorMapLookup,
  normalizeVoltage,
  destroyWebGPUContext,
} from './webgpu-utils';
