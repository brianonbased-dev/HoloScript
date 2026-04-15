/**
 * @fileoverview VRR (Virtual Reality Reality) Runtime
 * @module @holoscript/runtime
 *
 * VRR Runtime for Real-Time Synchronization
 *
 * PURPOSE:
 * Provide runtime support for VRR (Virtual Reality Reality) digital twins,
 * enabling real-time synchronization of weather, events, inventory, and player
 * state across 1:1 real-world mirrors.
 *
 * VISION:
 * VRR twins mirror the real world in real-time. When it rains in Phoenix,
 * it rains in Phoenix VRR. When Phoenix Brew runs out of oat milk IRL, it
 * runs out in VRR. When a user completes a VRR quest, state persists to VR.
 *
 * REQUIREMENTS:
 * 1. Real-Time APIs: Weather, events, inventory, traffic
 * 2. WebSocket Sync: Player positions, quest progress, multiplayer state
 * 3. Pull-Based Sync: Weather/events poll every 5 minutes (low frequency)
 * 4. Push-Based Sync: Inventory/player state via WebSocket (high frequency)
 * 5. Geo-Location: Convert lat/lng to 3D scene coordinates
 * 6. State Persistence: IndexedDB (client) + Supabase (server)
 * 7. Multiplayer Support: 1000+ concurrent players per VRR twin
 *
 * EXAMPLE USAGE:
 * ```typescript
 * import { VRRRuntime } from '@holoscript/runtime';
 *
 * // Initialize VRR runtime
 * const vrr = new VRRRuntime({
 *   twin_id: 'phoenix_downtown',
 *   geo_center: { lat: 33.4484, lng: -112.0740 },
 *   apis: {
 *     weather: { provider: 'weather.gov', refresh: 300000 }, // 5 min
 *     events: { provider: 'eventbrite', refresh: 300000 },
 *     inventory: { provider: 'square_pos', websocket: true }
 *   },
 *   multiplayer: {
 *     max_players: 1000,
 *     tick_rate: 20 // 20 updates/second
 *   }
 * });
 *
 * // Sync weather
 * vrr.syncWeather((weather) => {
 *   scene.fog = new THREE.Fog(0xcccccc, 10, weather.visibility);
 *   if (weather.precipitation > 0) {
 *     rainSystem.start();
 *   }
 *   if (weather.temperature < 32) {
 *     snowSystem.start();
 *   }
 * });
 *
 * // Sync business inventory
 * vrr.syncInventory('phoenix_brew', (inventory) => {
 *   // Update quest availability based on inventory
 *   if (!inventory.has('oat_milk')) {
 *     disableQuest('latte_legend'); // Can't make oat milk latte
 *   }
 * });
 *
 * // Sync multiplayer state
 * vrr.syncPlayers((players) => {
 *   players.forEach((player) => {
 *     updatePlayerPosition(player.id, player.position);
 *   });
 * });
 * ```
 *
 * INTEGRATION POINTS:
 * - VRRCompiler.ts (generates VRRRuntime initialization code)
 * - VRRTraits.ts (@weather_sync, @event_sync, @inventory_sync traits)
 * - Supabase (state persistence, multiplayer sync)
 * - External APIs: weather.gov, Eventbrite, Square POS, Shopify
 *
 * RESEARCH REFERENCES:
 * - examples/hololand/README.md (VRR runtime pointers)
 * - VRRCompiler.ts (runtime initialization requirements)
 * - uAA2++_Protocol/5.GROW P.029: "Machine Customers for VR Platforms"
 *
 * ARCHITECTURE DECISIONS:
 * 1. Pull vs. Push for Real-Time Sync:
 *    - Pull (polling): Weather, events (change infrequently, poll every 5 min)
 *    - Push (WebSocket): Inventory, player state (change frequently, real-time)
 *    - Hybrid: Use both for optimal performance and cost
 *
 * 2. Client vs. Server State:
 *    - Client (IndexedDB): Player quest progress, AR scan data (offline-first)
 *    - Server (Supabase): Multiplayer state, business data (authoritative)
 *    - Sync: Client → Server on network available, Server → Client on connect
 *
 * 3. Geo-Location to Scene Coords:
 *    - Mercator Projection: Convert lat/lng to 2D map coordinates
 *    - Scene Mapping: Map 2D coords to 3D scene (1 meter = 1 Three.js unit)
 *    - Example: Phoenix Brew (33.4484, -112.0740) → scene position (100, 0, 50)
 *
 * 4. Multiplayer Scalability:
 *    - Spatial Partitioning: Divide VRR twin into grid (100m x 100m cells)
 *    - Interest Management: Only sync players within 500m radius
 *    - Server Authority: Server validates all player actions (prevent cheating)
 *
 * IMPLEMENTATION TASKS:
 * [x] Define VRRRuntimeOptions interface
 * [x] Implement syncWeather() - Poll weather API, update scene
 * [x] Implement syncEvents() - Poll event APIs (Eventbrite, Ticketmaster)
 * [x] Implement syncInventory() - WebSocket or poll POS APIs (Square, Shopify)
 * [x] Implement syncPlayers() - Multiplayer WebSocket (player positions, actions)
 * [x] Implement geoToSceneCoords() - Convert lat/lng to 3D scene coordinates
 * [x] Implement persistState() - IndexedDB client-side state persistence
 * [x] Implement syncToServer() - Upload client state to Supabase
 * [x] Implement syncIoTSensor() - IoT sensor sync (MQTT WebSocket + HTTP polling)
 * [x] Implement loadFromServer() - Download server state to client
 * [x] Implement createARPortal() - AR entry point to VRR (ARRuntime integration)
 * [x] Implement createBusinessHub() - Business quest hub with inventory sync
 * [ ] Add tests (VRRRuntime.test.ts)
 * [ ] Add E2E test (simulate weather change, inventory update, multiplayer sync)
 * [ ] Performance optimization (lazy loading, spatial partitioning)
 *
 * ESTIMATED COMPLEXITY: 9/10 (very high - real-time sync, multiplayer, geo-location)
 * ESTIMATED TIME: 2.5 weeks (includes testing, API integration, optimization)
 * PRIORITY: CRITICAL (blocks VRR twin functionality, business features)
 *
 * BLOCKED BY:
 * - VRRTraits.ts (trait definitions for @weather_sync, @event_sync, etc.)
 * - External API keys (weather.gov, Eventbrite, Square POS, Shopify)
 * - Supabase setup (multiplayer state, business data)
 *
 * UNBLOCKS:
 * - VRRCompiler.ts (can generate runtime initialization code)
 * - Business quest features (inventory-based quest availability)
 * - Multiplayer VRR twins (1000+ concurrent players)
 * - Real-world event integration (festivals trigger quests)
 *
 * API INTEGRATIONS:
 *
 * 1. Weather API (weather.gov - FREE, US only):
 *    - Endpoint: https://api.weather.gov/points/{lat},{lng}
 *    - Data: Temperature, precipitation, visibility, wind
 *    - Refresh: Every 5 minutes (low frequency)
 *
 * 2. Events API (Eventbrite - PAID, $0.59-$1.99/ticket):
 *    - Endpoint: https://www.eventbriteapi.com/v3/events/search/?location.latitude={lat}&location.longitude={lng}
 *    - Data: Festivals, concerts, conferences near VRR twin
 *    - Refresh: Every 5 minutes (low frequency)
 *
 * 3. Inventory API (Square POS - FREE for businesses):
 *    - Endpoint: https://connect.squareup.com/v2/inventory/counts
 *    - Data: Product availability, stock levels
 *    - Refresh: WebSocket (real-time) or poll every 1 minute
 *
 * 4. Traffic API (Google Maps - PAID, $0.005-0.01/request):
 *    - Endpoint: https://maps.googleapis.com/maps/api/directions/json?origin={lat},{lng}&destination={lat},{lng}
 *    - Data: Traffic congestion, road closures
 *    - Refresh: Every 10 minutes (optional, for NPC crowd density)
 *
 * EXAMPLE WEATHER SYNC:
 * ```typescript
 * export class VRRRuntime {
 *   async syncWeather(callback: (weather: WeatherData) => void) {
 *     // Fetch weather from weather.gov
 *     const response = await fetch(`https://api.weather.gov/points/${this.geo_center.lat},${this.geo_center.lng}`);
 *     const data = await response.json();
 *
 *     const forecastUrl = data.properties.forecast;
 *     const forecastResponse = await fetch(forecastUrl);
 *     const forecast = await forecastResponse.json();
 *
 *     const currentWeather = forecast.properties.periods[0];
 *
 *     // Extract weather data
 *     const weather: WeatherData = {
 *       temperature: currentWeather.temperature,
 *       precipitation: currentWeather.probabilityOfPrecipitation?.value || 0,
 *       visibility: 10000, // Default 10km if not provided
 *       wind_speed: currentWeather.windSpeed,
 *       short_forecast: currentWeather.shortForecast // "Sunny", "Rainy", etc.
 *     };
 *
 *     // Call callback to update scene
 *     callback(weather);
 *
 *     // Schedule next sync in 5 minutes
 *     setTimeout(() => this.syncWeather(callback), 300000);
 *   }
 * }
 * ```
 *
 * EXAMPLE INVENTORY SYNC (WebSocket):
 * ```typescript
 * export class VRRRuntime {
 *   syncInventory(business_id: string, callback: (inventory: InventoryData) => void) {
 *     // Connect to Square POS WebSocket
 *     const ws = new WebSocket(`wss://square-pos-api.com/inventory/${business_id}`);
 *
 *     ws.onmessage = (event) => {
 *       const inventory = JSON.parse(event.data);
 *       callback(inventory);
 *     };
 *
 *     ws.onerror = (error) => {
 *       console.error('Inventory sync error:', error);
 *       // Fallback to polling if WebSocket fails
 *       this.pollInventory(business_id, callback);
 *     };
 *   }
 * }
 * ```
 *
 * EXAMPLE MULTIPLAYER SYNC:
 * ```typescript
 * export class VRRRuntime {
 *   syncPlayers(callback: (players: PlayerData[]) => void) {
 *     // Connect to Hololand multiplayer WebSocket
 *     const ws = new WebSocket(`wss://multiplayer.hololand.io/${this.twin_id}`);
 *
 *     ws.onmessage = (event) => {
 *       const players = JSON.parse(event.data);
 *       callback(players);
 *     };
 *
 *     // Send local player position every tick
 *     setInterval(() => {
 *       ws.send(JSON.stringify({
 *         player_id: this.local_player_id,
 *         position: this.local_player_position,
 *         action: this.local_player_action
 *       }));
 *     }, 1000 / this.tick_rate); // 20 ticks/second
 *   }
 * }
 * ```
 *
 * STATE PERSISTENCE STRATEGY:
 * - AR Scan: IndexedDB (offline-first) → Supabase (on network)
 * - VRR Quest Progress: IndexedDB → Supabase (authoritative server)
 * - VR Completion: On-chain NFT mint (permanent record)
 * - Multiplayer State: Server-authoritative (Supabase → clients)
 */

import { ARRuntime, type ARRuntimeOptions } from './ARRuntime.js';

export interface VRRRuntimeOptions {
  twin_id: string;
  geo_center: { lat: number; lng: number };
  apis: {
    weather?: { provider: 'weather.gov' | 'openweathermap'; refresh: number };
    events?: { provider: 'eventbrite' | 'ticketmaster'; refresh: number; api_key?: string };
    inventory?: {
      provider: 'square' | 'shopify' | 'woocommerce';
      websocket?: boolean;
      api_key?: string;
    };
    traffic?: { provider: 'google_maps'; refresh: number; api_key?: string };
    iot?: { provider: 'mqtt' | 'http'; endpoint: string; api_key?: string };
  };
  multiplayer: {
    enabled: boolean;
    max_players: number;
    tick_rate: number; // updates/second
  };
  state_persistence: {
    client: 'indexeddb' | 'localstorage';
    server: string; // Supabase URL
  };
  ar_mode?: {
    enabled_by_default: boolean;
    ar_options: ARRuntimeOptions;
  };
}

export interface WeatherData {
  temperature: number; // Fahrenheit
  precipitation: number; // Percentage (0-100)
  visibility: number; // Meters
  wind_speed: string; // e.g., "10 mph"
  short_forecast: string; // e.g., "Sunny", "Rainy"
}

export interface InventoryData {
  business_id: string;
  items: Array<{
    id: string;
    name: string;
    stock: number;
    price: number;
  }>;
  has(item_name: string): boolean;
}

export interface EventData {
  id: string;
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  location: string;
  category: string;
}

export interface IoTSensorData {
  sensor_id: string;
  timestamp: number;
  values: Record<string, number>;
  unit: string;
  status: 'online' | 'offline' | 'error';
}

export interface PlayerData {
  id: string;
  position: [number, number, number];
  action: 'idle' | 'walking' | 'running' | 'interacting';
  quest_progress?: Record<string, number>; // quest_id → progress (0-100)
}

export class VRRRuntime {
  public options: VRRRuntimeOptions;
  private activeARRuntime: ARRuntime | null = null;
  public isARActive: boolean = false;

  // Multiplayer state
  private localPlayer: PlayerData | null = null;
  private playerBroadcastInterval: ReturnType<typeof setInterval> | null = null;
  private playerWs: WebSocket | null = null;
  private playerReconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY_MS = 1000;

  // Inventory state
  private inventoryWs: WebSocket | null = null;
  private inventoryReconnectAttempts: number = 0;
  private inventoryPollingInterval: ReturnType<typeof setInterval> | null = null;

  // Events state
  private eventsPollingTimeout: ReturnType<typeof setTimeout> | null = null;
  private eventsRetryCount: number = 0;
  private readonly MAX_EVENT_RETRIES = 3;
  private iotPollingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(options: VRRRuntimeOptions) {
    this.options = options;
    if (this.options.ar_mode?.enabled_by_default) {
      this.toggleARMode(true);
    }
  }

  // Shift to immersive AR pass-through mode
  async toggleARMode(enabled: boolean): Promise<void> {
    if (enabled && !this.activeARRuntime) {
      if (!this.options.ar_mode) throw new Error('AR options not configured for VRR twin.');
      this.activeARRuntime = new ARRuntime(this.options.ar_mode.ar_options);
      const supported = await this.activeARRuntime.initialize();
      if (supported) {
        await this.activeARRuntime.startSession();
        this.isARActive = true;
      } else {
        console.warn(`[VRR] AR not supported on this device. Retaining VRR/VR view.`);
        this.activeARRuntime = null;
      }
    } else if (!enabled && this.activeARRuntime) {
      await this.activeARRuntime.stopSession();
      this.activeARRuntime = null;
      this.isARActive = false;
    }
  }

  // Real-time weather synchronization
  async syncWeather(callback: (weather: WeatherData) => void): Promise<void> {
    if (!this.options.apis.weather) return;

    try {
      const response = await fetch(
        `https://api.weather.gov/points/${this.options.geo_center.lat},${this.options.geo_center.lng}`
      );
      const data = await response.json();

      const forecastUrl = data.properties?.forecast;
      if (!forecastUrl) throw new Error('No forecast URL returned from weather.gov');

      const forecastResponse = await fetch(forecastUrl);
      const forecast = await forecastResponse.json();
      const currentWeather = forecast.properties?.periods?.[0];

      if (currentWeather) {
        const weather: WeatherData = {
          temperature: currentWeather.temperature,
          precipitation: currentWeather.probabilityOfPrecipitation?.value || 0,
          visibility: 10000, // Default 10km if not provided by this endpoint
          wind_speed: currentWeather.windSpeed,
          short_forecast: currentWeather.shortForecast,
        };
        callback(weather);
      }
    } catch (e) {
      console.error('Failed to sync weather', e);
    }

    setTimeout(() => this.syncWeather(callback), this.options.apis.weather.refresh || 300000);
  }

  // Real-time event synchronization
  async syncEvents(callback: (events: EventData[]) => void): Promise<void> {
    if (!this.options.apis.events) return;

    const eventsConfig = this.options.apis.events;
    const { lat, lng } = this.options.geo_center;

    try {
      let url: string;
      const headers: Record<string, string> = {};

      if (eventsConfig.provider === 'eventbrite') {
        url = `https://www.eventbriteapi.com/v3/events/search/?location.latitude=${lat}&location.longitude=${lng}&location.within=10km`;
        if (eventsConfig.api_key) {
          headers['Authorization'] = `Bearer ${eventsConfig.api_key}`;
        }
      } else {
        // ticketmaster
        url = `https://app.ticketmaster.com/discovery/v2/events.json?latlong=${lat},${lng}&radius=10&unit=km`;
        if (eventsConfig.api_key) {
          url += `&apikey=${eventsConfig.api_key}`;
        }
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`Events API returned ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      let events: EventData[] = [];

      if (eventsConfig.provider === 'eventbrite') {
        const ebData = data as { events?: Array<Record<string, unknown>> };
        events = (ebData.events ?? []).map((evt) => ({
          id: String(evt.id ?? ''),
          title: String((evt.name as Record<string, unknown>)?.text ?? ''),
          start: String((evt.start as Record<string, unknown>)?.utc ?? ''),
          end: String((evt.end as Record<string, unknown>)?.utc ?? ''),
          location: String((evt.venue as Record<string, unknown>)?.name ?? 'Unknown'),
          category: String((evt.category as Record<string, unknown>)?.name ?? 'General'),
        }));
      } else {
        // Ticketmaster response shape
        const tmData = data as {
          _embedded?: { events?: Array<Record<string, unknown>> };
        };
        events = (tmData._embedded?.events ?? []).map((evt) => ({
          id: String(evt.id ?? ''),
          title: String(evt.name ?? ''),
          start: String(
            (evt.dates as Record<string, unknown>)?.start
              ? ((
                  (evt.dates as Record<string, Record<string, unknown>>).start as Record<
                    string,
                    unknown
                  >
                ).dateTime ?? '')
              : ''
          ),
          end: String(
            (evt.dates as Record<string, unknown>)?.end
              ? ((
                  (evt.dates as Record<string, Record<string, unknown>>).end as Record<
                    string,
                    unknown
                  >
                ).dateTime ?? '')
              : ''
          ),
          location: String(
            (evt._embedded as Record<string, unknown[]>)?.venues?.[0]
              ? ((
                  (evt._embedded as Record<string, Record<string, unknown>[]>).venues[0] as Record<
                    string,
                    unknown
                  >
                ).name ?? 'Unknown')
              : 'Unknown'
          ),
          category: String(
            (evt.classifications as Record<string, unknown>[])?.length
              ? ((
                  (evt.classifications as Record<string, Record<string, unknown>>[])[0]
                    .segment as Record<string, unknown>
                )?.name ?? 'General')
              : 'General'
          ),
        }));
      }

      this.eventsRetryCount = 0;
      callback(events);
    } catch (e) {
      console.error('Failed to sync events', e);

      // Retry with exponential backoff up to MAX_EVENT_RETRIES before falling back to empty
      if (this.eventsRetryCount < this.MAX_EVENT_RETRIES) {
        this.eventsRetryCount++;
        const retryDelay = Math.min(
          this.BASE_RECONNECT_DELAY_MS * Math.pow(2, this.eventsRetryCount),
          30000
        );

        this.eventsPollingTimeout = setTimeout(() => this.syncEvents(callback), retryDelay);
        return;
      }

      // After max retries, deliver empty and continue polling normally
      this.eventsRetryCount = 0;
      callback([]);
    }

    this.eventsPollingTimeout = setTimeout(
      () => this.syncEvents(callback),
      eventsConfig.refresh || 300000
    );
  }

  // Real-time inventory synchronization
  syncInventory(business_id: string, callback: (inventory: InventoryData) => void): void {
    if (this.options.apis.inventory?.websocket) {
      this.connectInventoryWebSocket(business_id, callback);
    } else {
      this.pollInventory(business_id, callback);
    }
  }

  private parseInventoryPayload(raw: unknown): InventoryData {
    const parsed = raw as {
      business_id?: string;
      items?: Array<{ id: string; name: string; stock: number; price: number }>;
    };
    return {
      business_id: String(parsed.business_id ?? ''),
      items: Array.isArray(parsed.items) ? parsed.items : [],
      has(name: string): boolean {
        return this.items.some((i) => i.name === name && i.stock > 0);
      },
    };
  }

  private connectInventoryWebSocket(
    business_id: string,
    callback: (inventory: InventoryData) => void
  ): void {
    const providerHost = this.getInventoryProviderHost();
    const ws = new WebSocket(`wss://${providerHost}/inventory/${business_id}`);
    this.inventoryWs = ws;

    ws.onopen = () => {
      this.inventoryReconnectAttempts = 0;
      // Stop polling fallback if it was running
      if (this.inventoryPollingInterval) {
        clearInterval(this.inventoryPollingInterval);
        this.inventoryPollingInterval = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const raw: unknown = JSON.parse(String(event.data));
        callback(this.parseInventoryPayload(raw));
      } catch (e) {
        console.error('Failed to parse inventory data', e);
      }
    };

    ws.onerror = (error) => {
      console.error('Inventory WebSocket error:', error);
    };

    ws.onclose = () => {
      console.warn(`[VRR] Inventory WebSocket closed for ${business_id}`);
      this.inventoryWs = null;

      if (this.inventoryReconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.inventoryReconnectAttempts++;
        const delay = Math.min(
          this.BASE_RECONNECT_DELAY_MS * Math.pow(2, this.inventoryReconnectAttempts),
          30000
        );

        setTimeout(() => this.connectInventoryWebSocket(business_id, callback), delay);
      } else {
        console.warn(
          '[VRR] Max inventory WebSocket reconnect attempts reached, falling back to polling'
        );
        this.inventoryReconnectAttempts = 0;
        this.pollInventory(business_id, callback);
      }
    };
  }

  private pollInventory(business_id: string, callback: (inventory: InventoryData) => void): void {
    const providerHost = this.getInventoryProviderHost();
    const apiKey = this.options.apis.inventory?.api_key;

    const poll = async (): Promise<void> => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const res = await fetch(`https://${providerHost}/inventory/${business_id}`, { headers });
        if (!res.ok) {
          throw new Error(`Inventory API returned ${res.status}`);
        }
        const raw: unknown = await res.json();
        callback(this.parseInventoryPayload(raw));
      } catch (e) {
        console.error(`Inventory polling failed for ${business_id}`, e);
      }
    };

    // Initial fetch
    void poll();
    // Poll every 60 seconds
    this.inventoryPollingInterval = setInterval(() => void poll(), 60000);
  }

  private getInventoryProviderHost(): string {
    const provider = this.options.apis.inventory?.provider ?? 'square';
    switch (provider) {
      case 'square':
        return 'connect.squareup.com/v2';
      case 'shopify':
        return 'api.shopify.com';
      case 'woocommerce':
        return 'api.woocommerce.com';
      default:
        return 'connect.squareup.com/v2';
    }
  }

  /**
   * Set the local player data for multiplayer broadcasting.
   * Must be called before syncPlayers() to enable state broadcasts.
   */
  setLocalPlayer(player: PlayerData): void {
    this.localPlayer = player;
  }

  /**
   * Update local player position and action for next broadcast tick.
   */
  updateLocalPlayer(
    position: [number, number, number],
    action: PlayerData['action']
  ): void {
    if (this.localPlayer) {
      this.localPlayer.position = position;
      this.localPlayer.action = action;
    }
  }

  // Multiplayer player synchronization
  syncPlayers(callback: (players: PlayerData[]) => void): void {
    if (!this.options.multiplayer.enabled) return;
    this.connectPlayerWebSocket(callback);
  }

  private connectPlayerWebSocket(callback: (players: PlayerData[]) => void): void {
    const ws = new WebSocket(`wss://multiplayer.hololand.io/${this.options.twin_id}`);
    this.playerWs = ws;

    ws.onopen = () => {
      this.playerReconnectAttempts = 0;

      // Send join event
      ws.send(
        JSON.stringify({
          type: 'player_join',
          player: this.localPlayer,
        })
      );

      // Start broadcasting local player state at configured tick rate
      if (this.playerBroadcastInterval) {
        clearInterval(this.playerBroadcastInterval);
      }
      const tickMs = 1000 / this.options.multiplayer.tick_rate;
      this.playerBroadcastInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && this.localPlayer) {
          ws.send(
            JSON.stringify({
              type: 'player_update',
              player: this.localPlayer,
            })
          );
        }
      }, tickMs);
    };

    ws.onmessage = (event) => {
      try {
        const message: unknown = JSON.parse(String(event.data));
        const msg = message as { type?: string; players?: PlayerData[]; player?: PlayerData };

        switch (msg.type) {
          case 'player_state':
            // Full player list update from server
            if (Array.isArray(msg.players)) {
              callback(msg.players);
            }
            break;
          case 'player_join':
            // Server will send updated player list; handled by player_state
            break;
          case 'player_leave':
            // Server will send updated player list; handled by player_state
            break;
          default:
            // Legacy format: direct player array
            if (Array.isArray(message)) {
              callback(message as PlayerData[]);
            }
        }
      } catch (e) {
        console.error('Failed to parse player data', e);
      }
    };

    ws.onerror = (error) => {
      console.error('Player sync WebSocket error:', error);
    };

    ws.onclose = () => {
      console.warn(`[VRR] Multiplayer WebSocket closed for ${this.options.twin_id}`);
      this.playerWs = null;

      // Stop broadcasting
      if (this.playerBroadcastInterval) {
        clearInterval(this.playerBroadcastInterval);
        this.playerBroadcastInterval = null;
      }

      // Reconnect with exponential backoff
      if (this.playerReconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.playerReconnectAttempts++;
        const delay = Math.min(
          this.BASE_RECONNECT_DELAY_MS * Math.pow(2, this.playerReconnectAttempts),
          30000
        );

        setTimeout(() => this.connectPlayerWebSocket(callback), delay);
      } else {
        console.error('[VRR] Max multiplayer reconnect attempts reached. Multiplayer offline.');
        this.playerReconnectAttempts = 0;
      }
    };
  }

  // Convert geo-location to scene coordinates
  geoToSceneCoords(lat: number, lng: number): { x: number; y: number; z: number } {
    // Basic Equirectangular map projection assuming a flat center point mappings
    const center = this.options.geo_center;
    const earthRadius = 6371000; // meters

    const x =
      (earthRadius * Math.cos((center.lat * Math.PI) / 180) * (lng - center.lng) * Math.PI) / 180;
    const z = (earthRadius * (lat - center.lat) * Math.PI) / 180;

    return { x, y: 0, z: -z };
  }

  // Persist state to IndexedDB (client-side)
  async persistState(key: string, value: unknown): Promise<void> {
    if (this.options.state_persistence.client !== 'indexeddb') return;
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('VRRStateDB', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('states');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const tx = db.transaction('states', 'readwrite');
      tx.objectStore('states').put(value, key);
    } catch (e) {
      console.warn('Failed to persist state locally', e);
    }
  }

  // Real-world sync hooks for IoT sensors
  syncIoTSensor(sensor_id: string, callback: (telemetry: IoTSensorData) => void): void {
    if (!this.options.apis.iot) return;

    if (this.options.apis.iot.provider === 'mqtt') {
      this.connectIoTWebSocket(sensor_id, callback);
    } else {
      this.pollIoTSensor(sensor_id, callback);
    }
  }

  private parseIoTPayload(sensor_id: string, raw: unknown): IoTSensorData {
    const parsed = raw as Partial<IoTSensorData>;
    return {
      sensor_id: parsed.sensor_id ?? sensor_id,
      timestamp: parsed.timestamp ?? Date.now(),
      values: parsed.values ?? {},
      unit: parsed.unit ?? '',
      status: parsed.status ?? 'online',
    };
  }

  private connectIoTWebSocket(
    sensor_id: string,
    callback: (telemetry: IoTSensorData) => void,
    reconnectAttempts: number = 0
  ): void {
    const iotConfig = this.options.apis.iot!;
    const ws = new WebSocket(`wss://${iotConfig.endpoint}/telemetry/${sensor_id}`);

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      try {
        const raw: unknown = JSON.parse(String(event.data));
        callback(this.parseIoTPayload(sensor_id, raw));
      } catch (e) {
        console.error(`Failed to parse telemetry for ${sensor_id}`, e);
      }
    };

    ws.onerror = (error) => {
      console.error(`IoT WebSocket error for ${sensor_id}:`, error);
    };

    ws.onclose = () => {
      console.warn(`[VRR] IoT WebSocket closed for ${sensor_id}`);
      if (reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          this.BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts + 1),
          30000
        );

        setTimeout(
          () => this.connectIoTWebSocket(sensor_id, callback, reconnectAttempts + 1),
          delay
        );
      } else {
        console.warn(
          `[VRR] Max IoT reconnect attempts reached for ${sensor_id}, falling back to HTTP polling`
        );
        this.pollIoTSensor(sensor_id, callback);
      }
    };
  }

  private pollIoTSensor(sensor_id: string, callback: (telemetry: IoTSensorData) => void): void {
    const iotConfig = this.options.apis.iot!;

    const poll = async (): Promise<void> => {
      try {
        const headers: Record<string, string> = {};
        if (iotConfig.api_key) {
          headers['Authorization'] = `Bearer ${iotConfig.api_key}`;
        }

        const res = await fetch(`https://${iotConfig.endpoint}/telemetry/${sensor_id}`, {
          headers,
        });
        if (!res.ok) {
          throw new Error(`IoT API returned ${res.status}`);
        }
        const raw: unknown = await res.json();
        callback(this.parseIoTPayload(sensor_id, raw));
      } catch (e) {
        console.error(`IoT polling failed for ${sensor_id}`, e);
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 1000); // 1Hz polling for IoT HTTP fallback
    this.iotPollingIntervals.set(sensor_id, interval);
  }

  // Real-world sync hooks for Hardware Actuators
  async actuateHardware(device_id: string, payload: unknown): Promise<boolean> {
    if (!this.options.apis.iot) return false;

    try {
      const res = await fetch(`https://${this.options.apis.iot.endpoint}/actuate/${device_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apis.iot.api_key}`,
        },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      console.error(`Hardware actuation failed for ${device_id}`, e);
      return false;
    }
  }

  // Sync state to Supabase (server-side)
  async syncToServer(data: Record<string, unknown>): Promise<void> {
    if (!this.options.state_persistence.server) return;
    try {
      await fetch(this.options.state_persistence.server + '/rest/v1/vrr_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.error('Failed to sync to server', e);
    }
  }

  // Load state from Supabase (server-side)
  async loadFromServer(sync_id?: string): Promise<Record<string, unknown> | null> {
    if (!this.options.state_persistence.server) return null;

    try {
      const query = sync_id
        ? `?id=eq.${encodeURIComponent(sync_id)}&select=*`
        : `?twin_id=eq.${encodeURIComponent(this.options.twin_id)}&order=created_at.desc&limit=1&select=*`;

      const response = await fetch(
        `${this.options.state_persistence.server}/rest/v1/vrr_sync${query}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      if (Array.isArray(payload)) {
        return (payload[0] as Record<string, unknown>) ?? null;
      }
      return (payload as Record<string, unknown>) ?? null;
    } catch (e) {
      console.error('Failed to load state from server', e);
      return null;
    }
  }

  // AR portal helper — explicit runtime entry/exit to AR mode
  createARPortal(portal_id: string): {
    portal_id: string;
    twin_id: string;
    enter: () => Promise<void>;
    exit: () => Promise<void>;
    status: () => { ar_active: boolean };
  } {
    return {
      portal_id,
      twin_id: this.options.twin_id,
      enter: async () => {
        await this.toggleARMode(true);
      },
      exit: async () => {
        await this.toggleARMode(false);
      },
      status: () => ({ ar_active: this.isARActive }),
    };
  }

  // Business hub helper — keeps latest inventory snapshot for quest/business logic
  createBusinessHub(
    business_id: string,
    onInventory?: (inventory: InventoryData) => void
  ): {
    business_id: string;
    getInventory: () => InventoryData | null;
    hasItem: (item_name: string) => boolean;
  } {
    let latestInventory: InventoryData | null = null;
    this.syncInventory(business_id, (inventory) => {
      latestInventory = inventory;
      onInventory?.(inventory);
    });

    return {
      business_id,
      getInventory: () => latestInventory,
      hasItem: (item_name: string) => latestInventory?.has(item_name) ?? false,
    };
  }

  // Runtime lifecycle cleanup
  dispose(): void {
    if (this.eventsPollingTimeout) {
      clearTimeout(this.eventsPollingTimeout);
      this.eventsPollingTimeout = null;
    }

    if (this.playerBroadcastInterval) {
      clearInterval(this.playerBroadcastInterval);
      this.playerBroadcastInterval = null;
    }

    if (this.inventoryPollingInterval) {
      clearInterval(this.inventoryPollingInterval);
      this.inventoryPollingInterval = null;
    }

    for (const interval of this.iotPollingIntervals.values()) {
      clearInterval(interval);
    }
    this.iotPollingIntervals.clear();

    if (this.playerWs) {
      this.playerWs.close();
      this.playerWs = null;
    }

    if (this.inventoryWs) {
      this.inventoryWs.close();
      this.inventoryWs = null;
    }
  }
}
