import { describe, expect, it, vi } from 'vitest';

import { VRRLiveDataSync, type SensorData } from '../VRRLiveDataSync';
import type { StreamMessage } from '../StreamingProtocol';
import type {
  IEventsProvider,
  IInventoryProvider,
  IWeatherProvider,
  VRRSyncProviderConfig,
} from '../../plugins/HololandExtensionPoint';
import type { EventData, InventoryData, WeatherData } from '../../plugins/HololandTypes';

type CapturedWorldUpdate = Omit<StreamMessage, 'seq' | 'timestamp'> & {
  payload: {
    deltaTime: number;
    entities: Array<{
      id: string;
      changes: Record<string, unknown>;
      timestamp: number;
    }>;
    events: Array<{
      id: string;
      type: string;
      source: string;
      sourceId?: string;
      data: Record<string, unknown>;
      timestamp: number;
    }>;
  };
};

function fakeTransport() {
  const sent: CapturedWorldUpdate[] = [];
  return {
    sent,
    send(message: Omit<StreamMessage, 'seq' | 'timestamp'>) {
      sent.push(message as CapturedWorldUpdate);
    },
  };
}

const weather: WeatherData = {
  temperature: 31,
  condition: 'sunny',
  humidity: 12,
  windSpeed: 8,
  windDirection: 220,
  precipitation: 0,
  visibility: 16,
  pressure: 1014,
  timestamp: 1000,
};

const events: EventData[] = [
  {
    id: 'event-1',
    name: 'Flood watch briefing',
    description: 'Emergency management update',
    startTime: 2000,
    endTime: 2600,
    location: 'phoenix',
    attendeeCount: 42,
    category: 'civic',
    tags: ['flood', 'briefing'],
  },
];

const inventory: InventoryData = {
  businessId: 'store-1',
  lastUpdated: 3000,
  items: [
    {
      id: 'water',
      name: 'Water',
      quantity: 20,
      price: 2,
      category: 'supply',
      inStock: true,
    },
  ],
};

describe('VRRLiveDataSync', () => {
  it('publishes weather snapshots as StreamingProtocol world updates', () => {
    let now = 1000;
    const transport = fakeTransport();
    const sync = new VRRLiveDataSync(transport, {
      twinId: 'phoenix-vrr',
      worldId: 'phoenix-world',
      clock: () => now,
    });

    now = 1250;
    const message = sync.publishWeather(weather, {
      sourceId: 'phx-weather',
      providerId: 'weather-gov',
      locationId: '33.4484,-112.074',
      staleAfterMs: 600000,
    });

    expect(transport.sent).toHaveLength(1);
    expect(message.type).toBe('world_update');
    expect(message.channel).toBe('vrr:phoenix-vrr:live-data');
    expect(message.payload.deltaTime).toBe(250);
    expect(message.payload.entities[0]).toMatchObject({
      id: 'vrr:phoenix-vrr:weather:phx-weather',
      changes: {
        'components.vrrLiveData.weather': weather,
        'properties.vrrLiveData.weather.providerId': 'weather-gov',
      },
    });
    expect(message.payload.events[0]).toMatchObject({
      type: 'vrr.live_data.weather.updated',
      source: 'system',
      data: {
        twinId: 'phoenix-vrr',
        worldId: 'phoenix-world',
        kind: 'weather',
        providerId: 'weather-gov',
      },
    });
    expect(sync.getState().weather).toEqual(weather);
  });

  it('publishes events, inventory, and sensor snapshots to distinct entity deltas', () => {
    const transport = fakeTransport();
    const sync = new VRRLiveDataSync(transport, {
      twinId: 'venue-vrr',
      clock: () => 5000,
    });
    const sensor: SensorData = {
      sensorId: 'gauge-7',
      value: 1.42,
      unit: 'm',
      quality: 'good',
      timestamp: 5000,
    };

    sync.publishEvents(events, { sourceId: 'civic-calendar', providerId: 'eventbrite' });
    sync.publishInventory(inventory, { sourceId: 'store-1', providerId: 'square' });
    sync.publishSensor(sensor, { sourceId: 'gauge-7', providerId: 'usgs' });

    expect(transport.sent.map((message) => message.priority)).toEqual([160, 176, 192]);
    expect(transport.sent[0].payload.events[0]).toMatchObject({
      type: 'vrr.live_data.events.synced',
      data: { count: 1 },
    });
    expect(transport.sent[1].payload.entities[0].changes).toMatchObject({
      'components.vrrLiveData.inventory': inventory,
    });
    expect(transport.sent[2].payload.entities[0]).toMatchObject({
      id: 'vrr:venue-vrr:sensor:gauge-7',
      changes: {
        'components.vrrLiveData.sensor': sensor,
        'properties.vrrLiveData.sensor.providerId': 'usgs',
      },
    });
    expect(sync.getState().events).toEqual(events);
    expect(sync.getState().inventory).toEqual(inventory);
    expect(sync.getState().sensors['gauge-7']).toEqual(sensor);
  });

  it('fetches initial provider data and streams subscription updates', async () => {
    const transport = fakeTransport();
    const weatherCallbacks: Array<(data: WeatherData) => void> = [];
    const eventCallbacks: Array<(data: EventData[]) => void> = [];
    const inventoryCallbacks: Array<(data: InventoryData) => void> = [];
    const unsubscribeWeather = vi.fn();
    const unsubscribeEvents = vi.fn();
    const unsubscribeInventory = vi.fn();

    const weatherProvider: IWeatherProvider = {
      id: 'weather-gov',
      initialize: async (_config: VRRSyncProviderConfig) => undefined,
      fetchWeather: vi.fn(async () => weather),
      subscribeToWeather: (_location, callback) => {
        weatherCallbacks.push(callback);
        return unsubscribeWeather;
      },
      dispose: vi.fn(),
    };
    const eventsProvider: IEventsProvider = {
      id: 'events-api',
      initialize: async (_config: VRRSyncProviderConfig) => undefined,
      fetchEvents: vi.fn(async () => events),
      subscribeToEvents: (_location, callback) => {
        eventCallbacks.push(callback);
        return unsubscribeEvents;
      },
      dispose: vi.fn(),
    };
    const inventoryProvider: IInventoryProvider = {
      id: 'square',
      initialize: async (_config: VRRSyncProviderConfig) => undefined,
      fetchInventory: vi.fn(async () => inventory),
      subscribeToInventory: (_businessId, callback) => {
        inventoryCallbacks.push(callback);
        return unsubscribeInventory;
      },
      dispose: vi.fn(),
    };

    const sync = new VRRLiveDataSync(transport, {
      twinId: 'provider-vrr',
      clock: () => 9000,
    });
    await sync.syncFromProviders({
      weather: { provider: weatherProvider, location: 'phoenix' },
      events: { provider: eventsProvider, location: 'phoenix' },
      inventory: { provider: inventoryProvider, businessId: 'store-1' },
    });

    expect(weatherProvider.fetchWeather).toHaveBeenCalledWith('phoenix');
    expect(eventsProvider.fetchEvents).toHaveBeenCalledWith('phoenix');
    expect(inventoryProvider.fetchInventory).toHaveBeenCalledWith('store-1');
    expect(transport.sent).toHaveLength(3);

    weatherCallbacks[0]?.({ ...weather, temperature: 32 });
    eventCallbacks[0]?.([{ ...events[0], id: 'event-2' }]);
    inventoryCallbacks[0]?.({ ...inventory, lastUpdated: 4000 });

    expect(transport.sent).toHaveLength(6);
    expect(sync.getState().weather?.temperature).toBe(32);
    expect(sync.getState().events[0].id).toBe('event-2');
    expect(sync.getState().inventory?.lastUpdated).toBe(4000);

    sync.dispose();
    expect(unsubscribeWeather).toHaveBeenCalledTimes(1);
    expect(unsubscribeEvents).toHaveBeenCalledTimes(1);
    expect(unsubscribeInventory).toHaveBeenCalledTimes(1);
  });
});
