/**
 * Tracking Topology Trait
 *
 * Visualization metadata for multi-target tracking scenes. Tracks the
 * relationships between headsets (sensors), targets (people/objects/anchors),
 * the central hub, and the algorithm channels (Kalman / Hungarian / ReID)
 * driving the matches.
 *
 * Consumed by a renderer that draws the 3D topology: central hub, headset
 * ring, target spheres with status rings, Kalman prediction ghosts, Hungarian
 * association lines, ReID curved recovery lines, anchor markers, and a stats
 * billboard.
 *
 * Lifted from uaa2-service tracking-topology.hsplus.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';
import type { Vec3 } from './KalmanFilterTrait';

export type TargetType = 'headset' | 'person' | 'object' | 'anchor';
export type TrackStatus = 'tracking' | 'occluded' | 'reid_pending' | 'lost';

// =============================================================================
// TYPES
// =============================================================================

export interface TopologyHeadset {
  id: string;
  position: Vec3;
  active: boolean;
  fov_deg: number;
}

export interface TopologyTarget {
  id: string;
  type: TargetType;
  status: TrackStatus;
  position: Vec3;
  kalman_prediction?: Vec3;
  confidence: number;
  reid_pending: boolean;
}

export interface TopologyAssociation {
  kind: 'hungarian' | 'reid';
  from: Vec3;
  to: Vec3;
  cost_or_similarity: number;
  dashed: boolean;
  badge_text: string;
}

export interface TopologyAnchor {
  id: string;
  position: Vec3;
  has_projection_cone: boolean;
}

export interface TrackingTopologyConfig {
  hub_position: Vec3;
  radius: number;
  node_scale: number;
  refresh_rate_ms: number;
  show_labels: boolean;
  show_kalman_predictions: boolean;
  show_hungarian_associations: boolean;
  show_reid_matches: boolean;
  animate_data_flow: boolean;
}

interface TopologyInternalState {
  headsets: Map<string, TopologyHeadset>;
  targets: Map<string, TopologyTarget>;
  anchors: Map<string, TopologyAnchor>;
  associations: TopologyAssociation[];
  lastRefreshAt: number;
  stats: {
    active_targets: number;
    headset_count: number;
    avg_latency_ms: number;
    kalman_update_rate_hz: number;
    avg_reid_confidence: number;
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const trackingTopologyHandler: TraitHandler<TrackingTopologyConfig> = {
  name: 'tracking_topology',

  defaultConfig: {
    hub_position: { x: 0, y: 0, z: 0 },
    radius: 3,
    node_scale: 1.0,
    refresh_rate_ms: 100,
    show_labels: true,
    show_kalman_predictions: true,
    show_hungarian_associations: true,
    show_reid_matches: true,
    animate_data_flow: true,
  },

  onAttach(node, _config, _context) {
    const internal: TopologyInternalState = {
      headsets: new Map(),
      targets: new Map(),
      anchors: new Map(),
      associations: [],
      lastRefreshAt: 0,
      stats: {
        active_targets: 0,
        headset_count: 0,
        avg_latency_ms: 0,
        kalman_update_rate_hz: 0,
        avg_reid_confidence: 0,
      },
    };
    node.__topologyState = internal;
  },

  onDetach(node, _config, _context) {
    delete node.__topologyState;
  },

  onUpdate(node, config, context, _delta) {
    const internal = node.__topologyState as TopologyInternalState | undefined;
    if (!internal) return;

    const now = Date.now();
    if (now - internal.lastRefreshAt < config.refresh_rate_ms) return;
    internal.lastRefreshAt = now;

    internal.stats.active_targets = internal.targets.size;
    internal.stats.headset_count = Array.from(internal.headsets.values()).filter((h) => h.active).length;

    const reidConfidences: number[] = [];
    for (const target of Array.from(internal.targets.values())) {
      if (target.reid_pending) reidConfidences.push(target.confidence);
    }
    internal.stats.avg_reid_confidence = reidConfidences.length > 0
      ? reidConfidences.reduce((s, v) => s + v, 0) / reidConfidences.length
      : 0;

    // Decay transient associations so the renderer only draws current-frame edges.
    internal.associations = [];

    context.emit?.('tracking_topology_refreshed', {
      node,
      stats: internal.stats,
      headsets: Array.from(internal.headsets.values()),
      targets: Array.from(internal.targets.values()),
      anchors: Array.from(internal.anchors.values()),
    });
  },

  onEvent(node, _config, context, event) {
    const internal = node.__topologyState as TopologyInternalState | undefined;
    if (!internal) return;

    if (event.type === 'topology_upsert_headset') {
      const h = event.headset as TopologyHeadset;
      internal.headsets.set(h.id, h);
      return;
    }

    if (event.type === 'topology_remove_headset') {
      internal.headsets.delete(event.id as string);
      return;
    }

    if (event.type === 'topology_upsert_target') {
      const t = event.target as TopologyTarget;
      internal.targets.set(t.id, t);
      return;
    }

    if (event.type === 'topology_remove_target') {
      internal.targets.delete(event.id as string);
      return;
    }

    if (event.type === 'topology_upsert_anchor') {
      const a = event.anchor as TopologyAnchor;
      internal.anchors.set(a.id, a);
      return;
    }

    if (event.type === 'topology_association') {
      const assoc = event.association as TopologyAssociation;
      internal.associations.push(assoc);
      return;
    }

    if (event.type === 'topology_stats') {
      const incoming = event.stats as Partial<TopologyInternalState['stats']>;
      internal.stats = { ...internal.stats, ...incoming };
      return;
    }

    if (event.type === 'topology_query') {
      context.emit?.('topology_snapshot', {
        queryId: event.queryId,
        node,
        stats: internal.stats,
        headsets: Array.from(internal.headsets.values()),
        targets: Array.from(internal.targets.values()),
        anchors: Array.from(internal.anchors.values()),
        associations: internal.associations,
      });
      return;
    }
  },
};

export default trackingTopologyHandler;
