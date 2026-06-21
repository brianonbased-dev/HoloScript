/**
 * VRRLiveDataSync
 *
 * Coordinates live weather, event, sensor, and inventory snapshots into the
 * existing StreamingProtocol world-update lane. Providers stay pluggable; this
 * class owns the VRR twin state projection and stream message shape.
 */

import type {
  EntityDelta,
  StreamProtocol,
  WorldEvent,
  WorldUpdateMessage,
} from './StreamingProtocol';
import type {
  IEventsProvider,
  IInventoryProvider,
  IWeatherProvider,
} from '../plugins/HololandExtensionPoint';
import type { EventData, InventoryData, WeatherData } from '../plugins/HololandTypes';

export type VRRLiveDataKind = 'weather' | 'events' | 'sensor' | 'inventory';

export interface SensorData {
  sensorId: string;
  value: number | string | boolean | Record<string, unknown>;
  unit?: string;
  quality?: 'good' | 'degraded' | 'estimated' | 'offline';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface VRRLiveDataSource {
  kind: VRRLiveDataKind;
  sourceId: string;
  providerId: string;
  locationId?: string;
  entityId?: string;
  staleAfterMs?: number;
}

export interface VRRLiveDataSnapshot<T = unknown> {
  source: VRRLiveDataSource;
  data: T;
  observedAt?: number;
}

export interface VRRLiveDataSyncOptions {
  twinId: string;
  worldId?: string;
  channel?: string;
  clock?: () => number;
}

export interface VRRLiveDataState {
  twinId: string;
  updatedAt: number;
  weather?: WeatherData;
  events: EventData[];
  inventory?: InventoryData;
  sensors: Record<string, SensorData>;
  sources: Record<string, VRRLiveDataSource>;
}

export interface VRRProviderSubscriptions {
  weather?: {
    provider: IWeatherProvider;
    location: string;
    sourceId?: string;
    entityId?: string;
    staleAfterMs?: number;
  };
  events?: {
    provider: IEventsProvider;
    location: string;
    sourceId?: string;
    entityId?: string;
    staleAfterMs?: number;
  };
  inventory?: {
    provider: IInventoryProvider;
    businessId: string;
    sourceId?: string;
    entityId?: string;
    staleAfterMs?: number;
  };
}

export type VRRLiveDataTransport = Pick<StreamProtocol, 'send'>;

type StreamWorldUpdate = Omit<WorldUpdateMessage, 'seq' | 'timestamp'>;

const PRIORITY_BY_KIND: Record<VRRLiveDataKind, number> = {
  weather: 144,
  events: 160,
  inventory: 176,
  sensor: 192,
};

export class VRRLiveDataSync {
  private transport: VRRLiveDataTransport;
  private readonly twinId: string;
  private readonly worldId?: string;
  private readonly channel: string;
  private readonly clock: () => number;
  private readonly unsubscribers: Array<() => void> = [];
  private state: VRRLiveDataState;
  private lastPublishAt: number;

  constructor(transport: VRRLiveDataTransport, options: VRRLiveDataSyncOptions) {
    this.transport = transport;
    this.twinId = options.twinId;
    this.worldId = options.worldId;
    this.channel = options.channel ?? `vrr:${options.twinId}:live-data`;
    this.clock = options.clock ?? Date.now;
    this.lastPublishAt = this.clock();
    this.state = {
      twinId: this.twinId,
      updatedAt: this.lastPublishAt,
      events: [],
      sensors: {},
      sources: {},
    };
  }

  getState(): VRRLiveDataState {
    return {
      ...this.state,
      events: [...this.state.events],
      sensors: { ...this.state.sensors },
      sources: { ...this.state.sources },
    };
  }

  publishWeather(
    weather: WeatherData,
    source: Omit<VRRLiveDataSource, 'kind'> = { sourceId: 'weather', providerId: 'manual' }
  ): StreamWorldUpdate {
    return this.applySnapshot({ source: { ...source, kind: 'weather' }, data: weather });
  }

  publishEvents(
    events: EventData[],
    source: Omit<VRRLiveDataSource, 'kind'> = { sourceId: 'events', providerId: 'manual' }
  ): StreamWorldUpdate {
    return this.applySnapshot({ source: { ...source, kind: 'events' }, data: events });
  }

  publishInventory(
    inventory: InventoryData,
    source: Omit<VRRLiveDataSource, 'kind'> = { sourceId: 'inventory', providerId: 'manual' }
  ): StreamWorldUpdate {
    return this.applySnapshot({ source: { ...source, kind: 'inventory' }, data: inventory });
  }

  publishSensor(
    sensor: SensorData,
    source: Omit<VRRLiveDataSource, 'kind'> = {
      sourceId: sensor.sensorId,
      providerId: 'manual',
    }
  ): StreamWorldUpdate {
    return this.applySnapshot({ source: { ...source, kind: 'sensor' }, data: sensor });
  }

  applySnapshot<T>(snapshot: VRRLiveDataSnapshot<T>): StreamWorldUpdate {
    const observedAt = snapshot.observedAt ?? this.clock();
    const sourceKey = this.sourceKey(snapshot.source);
    this.state.sources[sourceKey] = { ...snapshot.source };
    this.state.updatedAt = observedAt;

    if (snapshot.source.kind === 'weather') {
      this.state.weather = snapshot.data as WeatherData;
    } else if (snapshot.source.kind === 'events') {
      this.state.events = [...(snapshot.data as EventData[])];
    } else if (snapshot.source.kind === 'inventory') {
      this.state.inventory = snapshot.data as InventoryData;
    } else {
      const sensor = snapshot.data as SensorData;
      this.state.sensors[sensor.sensorId] = { ...sensor };
    }

    const delta = this.buildEntityDelta(snapshot, observedAt);
    const event = this.buildWorldEvent(snapshot, observedAt);
    const message: StreamWorldUpdate = {
      type: 'world_update',
      reliable: false,
      priority: PRIORITY_BY_KIND[snapshot.source.kind],
      channel: this.channel,
      payload: {
        deltaTime: Math.max(0, observedAt - this.lastPublishAt),
        entities: [delta],
        events: [event],
      },
    };

    this.lastPublishAt = observedAt;
    this.transport.send(message);
    return message;
  }

  async syncFromProviders(providers: VRRProviderSubscriptions): Promise<void> {
    if (providers.weather) {
      const { provider, location, sourceId, entityId, staleAfterMs } = providers.weather;
      const weather = await provider.fetchWeather(location);
      this.publishWeather(weather, {
        sourceId: sourceId ?? location,
        providerId: provider.id,
        locationId: location,
        entityId,
        staleAfterMs,
      });
      this.unsubscribers.push(
        provider.subscribeToWeather(location, (next) =>
          this.publishWeather(next, {
            sourceId: sourceId ?? location,
            providerId: provider.id,
            locationId: location,
            entityId,
            staleAfterMs,
          })
        )
      );
    }

    if (providers.events) {
      const { provider, location, sourceId, entityId, staleAfterMs } = providers.events;
      const events = await provider.fetchEvents(location);
      this.publishEvents(events, {
        sourceId: sourceId ?? location,
        providerId: provider.id,
        locationId: location,
        entityId,
        staleAfterMs,
      });
      this.unsubscribers.push(
        provider.subscribeToEvents(location, (next) =>
          this.publishEvents(next, {
            sourceId: sourceId ?? location,
            providerId: provider.id,
            locationId: location,
            entityId,
            staleAfterMs,
          })
        )
      );
    }

    if (providers.inventory) {
      const { provider, businessId, sourceId, entityId, staleAfterMs } = providers.inventory;
      const inventory = await provider.fetchInventory(businessId);
      this.publishInventory(inventory, {
        sourceId: sourceId ?? businessId,
        providerId: provider.id,
        locationId: businessId,
        entityId,
        staleAfterMs,
      });
      this.unsubscribers.push(
        provider.subscribeToInventory(businessId, (next) =>
          this.publishInventory(next, {
            sourceId: sourceId ?? businessId,
            providerId: provider.id,
            locationId: businessId,
            entityId,
            staleAfterMs,
          })
        )
      );
    }
  }

  dispose(): void {
    while (this.unsubscribers.length) {
      const unsubscribe = this.unsubscribers.pop();
      try {
        unsubscribe?.();
      } catch {
        // Provider cleanup must not prevent the remaining unsubscribe calls.
      }
    }
  }

  private sourceKey(source: VRRLiveDataSource): string {
    return `${source.kind}:${source.providerId}:${source.sourceId}`;
  }

  private entityIdFor(source: VRRLiveDataSource): string {
    return source.entityId ?? `vrr:${this.twinId}:${source.kind}:${source.sourceId}`;
  }

  private buildEntityDelta<T>(
    snapshot: VRRLiveDataSnapshot<T>,
    observedAt: number
  ): EntityDelta {
    const source = snapshot.source;
    return {
      id: this.entityIdFor(source),
      timestamp: observedAt,
      changes: {
        [`components.vrrLiveData.${source.kind}`]: snapshot.data,
        [`properties.vrrLiveData.${source.kind}.sourceId`]: source.sourceId,
        [`properties.vrrLiveData.${source.kind}.providerId`]: source.providerId,
        [`properties.vrrLiveData.${source.kind}.observedAt`]: observedAt,
        [`properties.vrrLiveData.${source.kind}.staleAfterMs`]: source.staleAfterMs,
      },
    };
  }

  private buildWorldEvent<T>(
    snapshot: VRRLiveDataSnapshot<T>,
    observedAt: number
  ): WorldEvent {
    const { source } = snapshot;
    return {
      id: `vrr_live_${source.kind}_${source.sourceId}_${observedAt}`,
      type: this.eventType(source.kind),
      source: 'system',
      sourceId: source.sourceId,
      timestamp: observedAt,
      data: {
        twinId: this.twinId,
        worldId: this.worldId,
        kind: source.kind,
        providerId: source.providerId,
        locationId: source.locationId,
        staleAfterMs: source.staleAfterMs,
        count: Array.isArray(snapshot.data) ? snapshot.data.length : undefined,
        data: snapshot.data,
      },
    };
  }

  private eventType(kind: VRRLiveDataKind): string {
    if (kind === 'events') return 'vrr.live_data.events.synced';
    return `vrr.live_data.${kind}.updated`;
  }
}

