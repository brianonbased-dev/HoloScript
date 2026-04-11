/** @gcode_slicer Trait — Volumetric extraction to GCode for 3D printing. @trait gcode_slicer */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface GCodeSlicerConfig {
  layerHeightMm: number;
  infillPercent: number;
  extruderTempC: number;
  bedTempC: number;
  printSpeedMmS: number;
}

export interface GCodeSlicerState {
  isSlicing: boolean;
  progressPercent: number;
  estimatedPrintTimeMs: number;
  outputGCodePath?: string;
}

const defaultConfig: GCodeSlicerConfig = {
  layerHeightMm: 0.2,
  infillPercent: 20,
  extruderTempC: 210,
  bedTempC: 60,
  printSpeedMmS: 50
};

export function createGCodeSlicerHandler(): TraitHandler<GCodeSlicerConfig> {
  return {
    name: 'gcode_slicer',
    defaultConfig,
    onAttach(n: HSPlusNode, c: GCodeSlicerConfig, ctx: TraitContext) {
      n.__slicerState = {
        isSlicing: false,
        progressPercent: 0,
        estimatedPrintTimeMs: 0
      };
      ctx.emit?.('gcode_slicer:ready');
    },
    onDetach(n: HSPlusNode, _c: GCodeSlicerConfig, ctx: TraitContext) {
      delete n.__slicerState;
      ctx.emit?.('gcode_slicer:removed');
    },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: GCodeSlicerConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__slicerState as GCodeSlicerState | undefined;
      if (!s) return;
      
      if (e.type === 'gcode_slicer:slice' && !s.isSlicing) {
        s.isSlicing = true;
        s.progressPercent = 0;
        ctx.emit?.('gcode_slicer:started');
        
        // Mock async slice operation for the node's volumetric data
        const volumeEstimate = 500; // Mock volume
        s.estimatedPrintTimeMs = volumeEstimate / (c.printSpeedMmS * c.layerHeightMm) * 1000;
        
        // Simulating slicing completion
        setTimeout(() => {
          s.isSlicing = false;
          s.progressPercent = 100;
          s.outputGCodePath = '/tmp/holoscript_output.gcode';
          ctx.emit?.('gcode_slicer:completed', { path: s.outputGCodePath, estimatedTimeMs: s.estimatedPrintTimeMs });
        }, 1500); // Abstract fake timeout
      }
    },
  };
}
