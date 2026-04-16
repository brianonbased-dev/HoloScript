/**
 * CoLocated Trait
 *
 * Shared experience in same physical space with spatial alignment.
 * Enables multiple users to see the same virtual content in the same location.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AlignmentMethod = 'cloud_anchor' | 'image_marker' | 'qr_code' | 'manual' | 'vps';
type AlignmentState = 'unaligned' | 'aligning' | 'aligned' | 'lost';

interface Participant {
  userId: string;
  isAligned: boolean;
  alignedAt: number;
  lastSeen: number;
  position: [number, number, number];
}

interface CoLocatedState {
  state: AlignmentState;
  isAligned: boolean;
  participants: Map<string, Participant>;
  sharedAnchorId: string | null;
  alignmentTransform: {
    position: [number, number, number];
    rotation: { x: number; y: number; z: number; w: number };
  };
  alignmentQuality: number;
  lastAlignmentTime: number;
}

interface CoLocatedConfig {
  shared_anchor_id: string;
  alignment_method: AlignmentMethod;
  alignment_timeout: number; // ms
  visual_indicator: boolean;
  max_participants: number;
  auto_align: boolean;
  realignment_threshold: number; // meters
}

// =============================================================================
// HANDLER
// =============================================================================

export const coLocatedHandler: TraitHandler<CoLocatedConfig> = {
  name: 'co_located',

  defaultConfig: {
    shared_anchor_id: '',
    alignment_method: 'cloud_anchor',
    alignment_timeout: 30000,
    visual_indicator: true,
    max_participants: 10,
    auto_align: true,
    realignment_threshold: 0.5,
  },

  onAttach(node, config, context) {
    const state: CoLocatedState = {
      state: 'unaligned',
      isAligned: false,
      participants: new Map(),
      sharedAnchorId: config.shared_anchor_id || null,
      alignmentTransform: {
        position: [0, 0, 0],
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      alignmentQuality: 0,
      lastAlignmentTime: 0,
    };
    node.__coLocatedState = state;

    // Show visual indicator
    if (config.visual_indicator) {
      context.emit?.('co_located_show_indicator', {
        node,
        state: 'searching',
      });
    }

    // Start alignment process
    if (config.auto_align) {
      state.state = 'aligning';

      context.emit?.('co_located_start_alignment', {
        node,
        method: config.alignment_method,
        anchorId: config.shared_anchor_id,
        timeout: config.alignment_timeout,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__coLocatedState as CoLocatedState;

    // Leave session
    if (state?.isAligned) {
      context.emit?.('co_located_leave', {
        node,
        anchorId: state.sharedAnchorId,
      });
    }

    if (config.visual_indicator) {
      context.emit?.('co_located_hide_indicator', { node });
    }

    delete node.__coLocatedState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__coLocatedState as CoLocatedState;
    if (!state || !state.isAligned) return;

    // Check for realignment need
    if (state.alignmentQuality < config.realignment_threshold && state.state === 'aligned') {
      state.state = 'aligning';

      context.emit?.('co_located_realign', {
        node,
        method: config.alignment_method,
        anchorId: state.sharedAnchorId,
      });
    }

    // Update visual indicator
    if (config.visual_indicator) {
      context.emit?.('co_located_update_indicator', {
        node,
        participantCount: state.participants.size,
        quality: state.alignmentQuality,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__coLocatedState as CoLocatedState;
    if (!state) return;

    if (event.type === 'co_located_aligned') {
      state.state = 'aligned';
      state.isAligned = true;
      state.sharedAnchorId = event.anchorId as string;
      state.alignmentTransform = event.transform as typeof state.alignmentTransform;
      state.alignmentQuality = (event.quality as number) || 1.0;
      state.lastAlignmentTime = Date.now();

      if (config.visual_indicator) {
        context.emit?.('co_located_indicator_aligned', { node });
      }

      context.emit?.('on_co_presence_aligned', {
        node,
        anchorId: state.sharedAnchorId,
        quality: state.alignmentQuality,
      });
    } else if (event.type === 'co_located_alignment_failed') {
      state.state = 'lost';

      context.emit?.('on_co_located_failed', {
        node,
        reason: event.reason,
      });
    } else if (event.type === 'co_located_participant_joined') {
      const userId = event.userId as string;

      if (state.participants.size < config.max_participants) {
        state.participants.set(userId, {
          userId,
          isAligned: false,
          alignedAt: 0,
          lastSeen: Date.now(),
          position: [0, 0, 0],
        });

        context.emit?.('on_co_presence_joined', {
          node,
          userId,
          participantCount: state.participants.size,
        });
      }
    } else if (event.type === 'co_located_participant_aligned') {
      const userId = event.userId as string;
      const participant = state.participants.get(userId);

      if (participant) {
        participant.isAligned = true;
        participant.alignedAt = Date.now();
        participant.position = event.position as typeof participant.position;

        context.emit?.('on_participant_aligned', {
          node,
          userId,
          position: participant.position,
        });
      }
    } else if (event.type === 'co_located_participant_left') {
      const userId = event.userId as string;
      state.participants.delete(userId);

      context.emit?.('on_co_presence_left', {
        node,
        userId,
        participantCount: state.participants.size,
      });
    } else if (event.type === 'co_located_participant_moved') {
      const userId = event.userId as string;
      const participant = state.participants.get(userId);

      if (participant) {
        participant.position = event.position as typeof participant.position;
        participant.lastSeen = Date.now();
      }
    } else if (event.type === 'co_located_quality_update') {
      state.alignmentQuality = event.quality as number;

      if (state.alignmentQuality < 0.3 && state.state === 'aligned') {
        state.state = 'lost';
        context.emit?.('on_co_located_lost', { node });
      }
    } else if (event.type === 'co_located_create_anchor') {
      // Create new shared anchor
      context.emit?.('co_located_create_anchor_request', {
        node,
        method: config.alignment_method,
      });
    } else if (event.type === 'co_located_anchor_created') {
      state.sharedAnchorId = event.anchorId as string;
      state.isAligned = true;
      state.state = 'aligned';

      context.emit?.('on_anchor_created', {
        node,
        anchorId: state.sharedAnchorId,
      });
    } else if (event.type === 'co_located_query') {
      context.emit?.('co_located_info', {
        queryId: event.queryId,
        node,
        state: state.state,
        isAligned: state.isAligned,
        anchorId: state.sharedAnchorId,
        participantCount: state.participants.size,
        participants: Array.from(state.participants.values()),
        quality: state.alignmentQuality,
      });
    }
  },
};

export default coLocatedHandler;
