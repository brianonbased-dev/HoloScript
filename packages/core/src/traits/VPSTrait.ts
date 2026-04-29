import type { Vector3 } from '../types';
﻿/**
 * VPS Trait
 *
 * Visual Positioning System integration for high-accuracy localization.
 * Uses visual features to determine precise position in mapped areas.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type VPSProvider = 'arcore' | 'arkit' | 'niantic' | '6dai' | 'custom';
type LocalizationState =
  | 'idle'
  | 'checking_coverage'
  | 'localizing'
  | 'localized'
  | 'tracking'
  | 'limited'
  | 'unavailable';

interface VPSState {
  state: LocalizationState;
  isLocalized: boolean;
  confidence: number; // 0-1
  accuracy: number; // meters
  lastLocalizationTime: number;
  continuousTrackingActive: boolean;
  locationId: string | null;
  pose: {
    position: Vector3;
    // Quaternion as tuple [x, y, z, w] — consistent with HoloScriptPlus +
    // IKTrait + the post-Vec3-tuple-migration codebase trend. The rest of
    // this trait already uses tuple-style access (lines 122-131); this
    // type definition was the lone holdout in object form, producing
    // TS2739 + TS7053 errors at lines 82+127-131.
    rotation: [number, number, number, number];
  };
  localizationAttempts: number;
}

interface VPSConfig {
  provider: VPSProvider;
  coverage_check: boolean;
  localization_timeout: number; // ms
  continuous_tracking: boolean;
  quality_threshold: number; // 0-1
  auto_localize: boolean;
  max_attempts: number;
  retry_interval: number; // ms
}

// =============================================================================
// HANDLER
// =============================================================================

export const vpsHandler: TraitHandler<VPSConfig> = {
  name: 'vps',

  defaultConfig: {
    provider: 'arcore',
    coverage_check: true,
    localization_timeout: 30000,
    continuous_tracking: true,
    quality_threshold: 0.7,
    auto_localize: true,
    max_attempts: 5,
    retry_interval: 3000,
  },

  onAttach(node, config, context) {
    const state: VPSState = {
      state: 'idle',
      isLocalized: false,
      confidence: 0,
      accuracy: Infinity,
      lastLocalizationTime: 0,
      continuousTrackingActive: false,
      locationId: null,
      pose: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1 ],
      },
      localizationAttempts: 0,
    };
    node.__vpsState = state;

    // Initialize VPS provider
    context.emit?.('vps_init', {
      node,
      provider: config.provider,
    });

    if (config.coverage_check) {
      state.state = 'checking_coverage';
      context.emit?.('vps_check_coverage', { node });
    } else if (config.auto_localize) {
      state.state = 'localizing';
      context.emit?.('vps_localize', {
        node,
        timeout: config.localization_timeout,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__vpsState as VPSState;
    if (state?.continuousTrackingActive) {
      context.emit?.('vps_stop_tracking', { node });
    }
    context.emit?.('vps_shutdown', { node });
    delete node.__vpsState;
  },

  onUpdate(node, _config, _context, _delta) {
    const state = node.__vpsState as VPSState;
    if (!state) return;

    // Apply VPS pose to node
    if (state.state === 'tracking' || state.state === 'localized') {
      if (node.position) {
        node.position[0] = state.pose.position[0];
        node.position[1] = state.pose.position[1];
        node.position[2] = state.pose.position[2];
      }
      if (node.rotation) {
        node.rotation[0] = state.pose.rotation[0];
        node.rotation[1] = state.pose.rotation[1];
        node.rotation[2] = state.pose.rotation[2];
        if (node.rotation[3] !== undefined) {
          node.rotation[3] = state.pose.rotation[3];
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__vpsState as VPSState;
    if (!state) return;

    if (event.type === 'vps_coverage_result') {
      const hasCoverage = event.hasCoverage as boolean;

      if (hasCoverage) {
        if (config.auto_localize) {
          state.state = 'localizing';
          context.emit?.('vps_localize', {
            node,
            timeout: config.localization_timeout,
          });
        } else {
          state.state = 'idle';
        }

        context.emit?.('on_vps_coverage_available', { node });
      } else {
        state.state = 'unavailable';
        context.emit?.('on_vps_unavailable', {
          node,
          reason: 'no_coverage',
        });
      }
    } else if (event.type === 'vps_localized') {
      state.isLocalized = true;
      state.confidence = event.confidence as number;
      state.accuracy = event.accuracy as number;
      state.lastLocalizationTime = Date.now();
      state.locationId = (event.locationId as string) || null;
      state.pose = event.pose as typeof state.pose;

      if (state.confidence >= config.quality_threshold) {
        state.state = 'localized';

        if (config.continuous_tracking) {
          state.continuousTrackingActive = true;
          state.state = 'tracking';

          context.emit?.('vps_start_tracking', { node });
        }

        context.emit?.('on_vps_localized', {
          node,
          confidence: state.confidence,
          accuracy: state.accuracy,
          locationId: state.locationId,
        });
      } else {
        state.state = 'limited';

        context.emit?.('on_vps_limited', {
          node,
          confidence: state.confidence,
          requiredConfidence: config.quality_threshold,
        });
      }
    } else if (event.type === 'vps_localization_failed') {
      state.localizationAttempts++;

      if (state.localizationAttempts < config.max_attempts) {
        // Retry after interval
        setTimeout(() => {
          if (state.state !== 'localized' && state.state !== 'tracking') {
            context.emit?.('vps_localize', {
              node,
              timeout: config.localization_timeout,
            });
          }
        }, config.retry_interval);
      } else {
        state.state = 'unavailable';

        context.emit?.('on_vps_failed', {
          node,
          attempts: state.localizationAttempts,
          reason: event.reason,
        });
      }
    } else if (event.type === 'vps_pose_update') {
      state.pose = event.pose as typeof state.pose;
      state.confidence = (event.confidence as number) || state.confidence;
      state.accuracy = (event.accuracy as number) || state.accuracy;

      if (state.confidence < config.quality_threshold && state.state === 'tracking') {
        state.state = 'limited';
        context.emit?.('on_vps_tracking_degraded', {
          node,
          confidence: state.confidence,
        });
      } else if (state.confidence >= config.quality_threshold && state.state === 'limited') {
        state.state = 'tracking';
        context.emit?.('on_vps_tracking_restored', {
          node,
          confidence: state.confidence,
        });
      }
    } else if (event.type === 'vps_localize') {
      state.state = 'localizing';
      state.localizationAttempts = 0;

      context.emit?.('vps_localize', {
        node,
        timeout: config.localization_timeout,
      });
    } else if (event.type === 'vps_stop') {
      state.continuousTrackingActive = false;
      state.state = 'idle';

      context.emit?.('vps_stop_tracking', { node });
    } else if (event.type === 'vps_query') {
      context.emit?.('vps_info', {
        queryId: event.queryId,
        node,
        state: state.state,
        isLocalized: state.isLocalized,
        confidence: state.confidence,
        accuracy: state.accuracy,
        locationId: state.locationId,
        pose: state.pose,
        lastLocalizationTime: state.lastLocalizationTime,
      });
    }
  },
};

export default vpsHandler;
