/**
 * Computer Vision Trait
 *
 * Simulates computer vision capabilities for HoloScript Agents.
 * Enables the @trait(vision) directive.
 *
 * Capabilities:
 * - Scan Scene (Mock)
 * - Object Detection (Mock)
 * - Classification (Mock)
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface VisionConfig {
  scan_interval: number; // ms
  fov: number;
  max_distance: number;
  auto_scan: boolean;
}

export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, w, h] (2D projection mock)
  distance: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const visionHandler: TraitHandler<VisionConfig> = {
  name: 'vision',

  defaultConfig: {
    scan_interval: 1000,
    fov: 90,
    max_distance: 10,
    auto_scan: false,
  },

  onAttach(node, config, context) {
    const state = {
      isScanning: config.auto_scan,
      lastScan: 0,
    };
    node.__visionState = state;
    context.emit?.('vision_system_online', { node });
  },

  onDetach(node) {
    delete node.__visionState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__visionState;
    if (!state || !state.isScanning) return;

    state.lastScan += delta * 1000;
    if (state.lastScan >= config.scan_interval) {
      this.performScan(node, config, context);
      state.lastScan = 0;
    }
  },

  onEvent(node, config, context, event) {
    if (event.type === 'vision_scan_request') {
      this.performScan(node, config, context);
    }
  },

  // Mock Scan Implementation
  performScan(node: HSPlusNode, config: VisionConfig, context: TraitContext) {
    // In a real engine, this would access the Scene Graph and perform frustum culling / raycasting.
    // Here, we mock detection of "nearby" entities.

    // Mock detected objects
    const detected: DetectedObject[] = [
      {
        id: 'obj_chair_1',
        label: 'chair',
        confidence: 0.95,
        bbox: [100, 100, 50, 80],
        distance: 2.5,
      },
      {
        id: 'obj_table_1',
        label: 'table',
        confidence: 0.88,
        bbox: [200, 150, 100, 50],
        distance: 3.0,
      },
    ];

    context.emit?.('vision_scan_complete', {
      node,
      detected,
      timestamp: Date.now(),
    });

    // Also emit individual detection events for reactive AI
    detected.forEach((obj) => {
      context.emit?.('vision_object_detected', { node, object: obj });
    });
  },
};

export default visionHandler;
