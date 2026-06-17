import { TraitHandler, TraitContext } from './TraitSystem';

// ============================================================================
// DataBinding Trait
// Polls a REST/WS/GraphQL/MQTT source and interpolates numeric bindings.
// ============================================================================

export const DataBindingTrait: TraitHandler = {
  name: 'data_binding',
  onApply: (context: TraitContext) => {
    context.data.isConnected = false;
    context.data.lastRefresh = 0;
    context.data.currentValue = null;
    context.data.targetValue = null;
    context.data.errorCount = 0;
    context.object.userData.dataBinding = {
      source: context.config.source,
      protocol: context.config.protocol ?? 'rest',
    };
    context.object.userData.dataBindingNeedsConnect = true;
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const refreshRate = (context.config.refresh_rate as number) ?? 0;
    if (refreshRate > 0 && (context.data.isConnected as boolean)) {
      const now = Date.now();
      if (now - (context.data.lastRefresh as number) > 1000 / refreshRate) {
        context.object.userData.dataBindingNeedsFetch = true;
        context.data.lastRefresh = now;
      }
    }

    // Smooth-interpolate numeric binding toward target
    const curr = context.data.currentValue as number | null;
    const target = context.data.targetValue as number | null;
    if (curr !== null && target !== null) {
      const speed = (context.config.interpolation_speed as number) ?? 5;
      context.data.currentValue = curr + (target - curr) * Math.min(speed * delta, 1);
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.dataBinding;
    delete context.object.userData.dataBindingNeedsConnect;
    delete context.object.userData.dataBindingNeedsFetch;
  },
};

// ============================================================================
// WorldState Trait
// CRDT sync at configurable interval with periodic autosave.
// ============================================================================

export const WorldStateTrait: TraitHandler = {
  name: 'world_state',
  onApply: (context: TraitContext) => {
    context.data.syncTimer = 0;
    context.data.autosaveTimer = 0;
    context.data.version = 0;
    context.object.userData.worldState = {
      syncInterval: context.config.sync_interval ?? 100,
      autosaveInterval: context.config.autosave_interval ?? 30000,
    };
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const syncInterval = (context.config.sync_interval as number) ?? 100;
    const autosaveInterval = (context.config.autosave_interval as number) ?? 30000;
    const ms = delta * 1000;

    context.data.syncTimer = (context.data.syncTimer as number) + ms;
    context.data.autosaveTimer = (context.data.autosaveTimer as number) + ms;

    if ((context.data.syncTimer as number) >= syncInterval) {
      context.data.syncTimer = 0;
      context.object.userData.worldStateNeedsSync = true;
    }

    if ((context.data.autosaveTimer as number) >= autosaveInterval) {
      context.data.autosaveTimer = 0;
      context.data.version = (context.data.version as number) + 1;
      context.object.userData.worldStateNeedsSave = true;
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.worldState;
    delete context.object.userData.worldStateNeedsSync;
    delete context.object.userData.worldStateNeedsSave;
  },
};

// ============================================================================
// SharedWorld Trait
// Batches peer update flushes at sync_rate Hz with conflict-aware ownership.
// ============================================================================

export const SharedWorldTrait: TraitHandler = {
  name: 'shared_world',
  onApply: (context: TraitContext) => {
    context.data.isSynced = false;
    context.data.isHost = false;
    context.data.syncAccumulator = 0;
    context.data.pendingUpdates = 0;
    context.data.connectedPeers = 0;
    context.object.userData.sharedWorld = {
      authorityModel: context.config.authority_model ?? 'first-write',
      syncRate: context.config.sync_rate ?? 20,
    };
    context.object.userData.sharedWorldNeedsConnect = true;
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const syncRate = (context.config.sync_rate as number) ?? 20;
    context.data.syncAccumulator = (context.data.syncAccumulator as number) + delta;

    if ((context.data.syncAccumulator as number) >= 1 / syncRate) {
      context.data.syncAccumulator = 0;
      if ((context.data.pendingUpdates as number) > 0) {
        context.object.userData.sharedWorldNeedsFlush = true;
        context.data.pendingUpdates = 0;
      }
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.sharedWorld;
    delete context.object.userData.sharedWorldNeedsConnect;
    delete context.object.userData.sharedWorldNeedsFlush;
  },
};
