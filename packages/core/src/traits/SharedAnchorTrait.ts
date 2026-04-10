/**
 * SharedAnchor Trait
 *
 * Multi-user anchor sharing for co-located MR experiences.
 * Enables synchronized AR content across devices.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AuthorityMode = 'creator' | 'host' | 'distributed';
type CloudProvider = 'arcore' | 'arkit' | 'azure' | 'custom';
type SharingState = 'local' | 'uploading' | 'shared' | 'resolving' | 'synchronized' | 'error';

interface SharedUser {
  userId: string;
  joinedAt: number;
  isResolved: boolean;
}

interface SharedAnchorState {
  state: SharingState;
  sharedUsers: SharedUser[];
  isShared: boolean;
  cloudAnchorId: string | null;
  isCreator: boolean;
  lastSyncTime: number;
  syncAccumulator: number;
  localAnchorHandle: unknown;
  quality: number;
}

interface SharedAnchorConfig {
  authority: AuthorityMode;
  resolution_timeout: number;
  max_users: number;
  sync_interval: number; // milliseconds
  cloud_provider: CloudProvider;
  auto_share: boolean;
  quality_threshold: number; // 0-1
}

// =============================================================================
// HANDLER
// =============================================================================

export const sharedAnchorHandler: TraitHandler<SharedAnchorConfig> = {
  name: 'shared_anchor',

  defaultConfig: {
    authority: 'creator',
    resolution_timeout: 10000,
    max_users: 10,
    sync_interval: 1000,
    cloud_provider: 'arcore',
    auto_share: false,
    quality_threshold: 0.5,
  },

  onAttach(node, config, context) {
    const state: SharedAnchorState = {
      state: 'local',
      sharedUsers: [],
      isShared: false,
      cloudAnchorId: null,
      isCreator: false,
      lastSyncTime: 0,
      syncAccumulator: 0,
      localAnchorHandle: null,
      quality: 0,
    };
    node.__sharedAnchorState = state;

    // Initialize cloud anchor provider
    context.emit?.('shared_anchor_init', {
      node,
      provider: config.cloud_provider,
    });

    if (config.auto_share) {
      state.state = 'uploading';
      context.emit?.('shared_anchor_upload', {
        node,
        provider: config.cloud_provider,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__sharedAnchorState as SharedAnchorState;

    if (state?.isShared) {
      context.emit?.('shared_anchor_leave', {
        node,
        cloudAnchorId: state.cloudAnchorId,
      });
    }

    delete node.__sharedAnchorState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__sharedAnchorState as SharedAnchorState;
    if (!state || !state.isShared) return;

    state.syncAccumulator += delta * 1000; // Convert to ms

    if (state.syncAccumulator >= config.sync_interval) {
      state.syncAccumulator = 0;
      state.lastSyncTime = Date.now();

      // Sync anchor pose with other users
      context.emit?.('shared_anchor_sync', {
        node,
        cloudAnchorId: state.cloudAnchorId,
        userCount: state.sharedUsers.length,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__sharedAnchorState as SharedAnchorState;
    if (!state) return;

    if (event.type === 'shared_anchor_upload_complete') {
      state.cloudAnchorId = event.cloudAnchorId as string;
      state.isShared = true;
      state.isCreator = true;
      state.state = 'shared';
      state.quality = (event.quality as number) || 1.0;

      context.emit?.('on_anchor_shared', {
        node,
        cloudAnchorId: state.cloudAnchorId,
        quality: state.quality,
      });
    } else if (event.type === 'shared_anchor_upload_failed') {
      state.state = 'error';

      context.emit?.('on_anchor_share_failed', {
        node,
        error: event.error,
      });
    } else if (event.type === 'shared_anchor_resolve') {
      const cloudAnchorId = event.cloudAnchorId as string;
      state.state = 'resolving';

      context.emit?.('shared_anchor_resolve_request', {
        node,
        cloudAnchorId,
        provider: config.cloud_provider,
        timeout: config.resolution_timeout,
      });
    } else if (event.type === 'shared_anchor_resolved') {
      state.cloudAnchorId = event.cloudAnchorId as string;
      state.isShared = true;
      state.isCreator = false;
      state.state = 'synchronized';
      state.localAnchorHandle = event.handle;

      context.emit?.('on_anchor_resolved', {
        node,
        cloudAnchorId: state.cloudAnchorId,
      });
    } else if (event.type === 'shared_anchor_user_joined') {
      const userId = event.userId as string;

      if (state.sharedUsers.length < config.max_users) {
        state.sharedUsers.push({
          userId,
          joinedAt: Date.now(),
          isResolved: false,
        });

        context.emit?.('on_user_joined', {
          node,
          userId,
          userCount: state.sharedUsers.length,
        });
      } else {
        context.emit?.('shared_anchor_user_rejected', {
          node,
          userId,
          reason: 'max_users_reached',
        });
      }
    } else if (event.type === 'shared_anchor_user_resolved') {
      const userId = event.userId as string;
      const user = state.sharedUsers.find((u) => u.userId === userId);
      if (user) {
        user.isResolved = true;
      }
    } else if (event.type === 'shared_anchor_user_left') {
      const userId = event.userId as string;
      state.sharedUsers = state.sharedUsers.filter((u) => u.userId !== userId);

      context.emit?.('on_user_left', {
        node,
        userId,
        userCount: state.sharedUsers.length,
      });
    } else if (event.type === 'shared_anchor_share') {
      // Manual share trigger
      if (!state.isShared) {
        state.state = 'uploading';
        context.emit?.('shared_anchor_upload', {
          node,
          provider: config.cloud_provider,
        });
      }
    } else if (event.type === 'shared_anchor_query') {
      context.emit?.('shared_anchor_info', {
        queryId: event.queryId,
        node,
        state: state.state,
        cloudAnchorId: state.cloudAnchorId,
        isCreator: state.isCreator,
        userCount: state.sharedUsers.length,
        users: state.sharedUsers,
        quality: state.quality,
      });
    }
  },
};

export default sharedAnchorHandler;
