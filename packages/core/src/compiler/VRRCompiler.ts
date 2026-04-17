/**
 * @fileoverview VRR (Virtual Reality Reality) Compiler
 * @module @holoscript/core/compiler
 * @status IMPLEMENTED — Working compiler with VRR trait extraction and code generation.
 *         Remaining work is focused on E2E/performance validation, not core implementation.
 *
 * PURPOSE:
 * Compile HoloScript compositions to Virtual Reality Reality (VRR) - 1:1 digital
 * twins of the real world, accessible via browser/WebXR without VR headset.
 *
 * VISION:
 * Phoenix downtown mirrored 1:1 in WebXR, syncing real-world events (weather, festivals,
 * inventory) to create persistent digital twins where businesses can host quests,
 * deal menus, and AI agents can autonomously create revenue-generating experiences.
 *
 * REQUIREMENTS:
 * 1. Target Output: Three.js/Babylon.js scenes (browser-renderable)
 * 2. Trait Support:
 *    - @vrr_twin (marks composition as 1:1 real-world mirror)
 *    - @reality_mirror (enables real-world sync: weather, events, inventory)
 *    - @geo_anchor (lat/lng positioning)
 *    - @geo_sync (geographic data synchronization)
 *    - @weather_sync (real-time weather API integration)
 *    - @event_sync (Eventbrite/Ticketmaster integration)
 *    - @inventory_sync (Square POS, Shopify, WooCommerce APIs)
 *    - @quest_hub (business quest starting point)
 *    - @layer_shift (AR → VRR → VR transitions with state persistence)
 *    - @x402_paywall (HTTP 402 payment requirement)
 * 3. Real-Time APIs: Weather, events, inventory, traffic
 * 4. Multiplayer Support: Shared VRR twins (1000+ concurrent players)
 * 5. State Persistence: AR scan data → VRR quest progress → VR completion
 * 6. Performance: 60 FPS on mobile browsers, 90+ FPS on desktop
 *
 * EXAMPLE INPUT (HoloScript):
 * ```holoscript
 * composition "PhoenixDowntownVRR" {
 *   zone#phoenix_downtown @vrr_twin @reality_mirror @geo_sync("phoenix_az_center") {
 *     base_geo: "phoenix_az_center"
 *     weather_sync: real_time_api { provider: "weather.gov" }
 *     event_sync: { provider: "eventbrite", refresh: 5_minutes }
 *
 *     business#phoenix_brew @quest_hub @inventory_sync {
 *       address: "123 Main St"
 *       geo_coords: { lat: 33.4484, lng: -112.0740 }
 *       inventory_api: "square_pos"
 *
 *       quest "LatteLegend" {
 *         steps: [ar_scan_window, vrr_hunt_ingredients, vr_taste_menu]
 *         rewards: @clanker_coupon { value: "Buy1Get1Free", redeem_irl: true }
 *       }
 *     }
 *
 *     on_event(phoenix_festival) {
 *       spawn_npc_crowd: true
 *       trigger_quest: "FestivalEgg"
 *     }
 *   }
 * }
 * ```
 *
 * EXPECTED OUTPUT (Three.js):
 * ```javascript
 * import * as THREE from 'three';
 * import { VRRRuntime } from '@holoscript/runtime';
 *
 * const scene = new THREE.Scene();
 *
 * // Geo-anchored Phoenix downtown
 * const phoenix_downtown = new THREE.Group();
 * phoenix_downtown.userData.geo_coords = { lat: 33.4484, lng: -112.0740 };
 *
 * // Real-time weather sync
 * const weatherSync = new VRRRuntime.WeatherSync({
 *   provider: 'weather.gov',
 *   location: 'phoenix_az_center',
 *   onUpdate: (weather) => {
 *     scene.fog = new THREE.Fog(0xcccccc, 10, weather.visibility);
 *     if (weather.precipitation > 0) {
 *       rainSystem.start();
 *     }
 *   }
 * });
 *
 * // Business quest hub
 * const phoenix_brew = createBusinessHub({
 *   position: geoToSceneCoords(33.4484, -112.0740),
 *   inventory: new SquarePOSSync('sq_placeholder'),
 *   quests: [latteQuest]
 * });
 *
 * scene.add(phoenix_downtown);
 * ```
 *
 * INTEGRATION POINTS:
 * - packages/std/src/traits/VRRTraits.ts (planned: trait definitions)
 * - packages/runtime/src/VRRRuntime.ts (planned: runtime for real-time sync)
 * - packages/marketplace-api (x402 payment endpoints)
 * - External APIs: weather.gov, Eventbrite, Square POS
 *
 * RESEARCH REFERENCES:
 * - Hololand integration backlog notes (VRRCompiler section)
 * - uAA2++_Protocol/5.GROW/research/2026-02-19_base-coinbase-ai-agent-wallets-growth.md (P.029)
 * - Grok conversation (VRR = Virtual Reality Reality, 1:1 digital twin concept)
 *
 * ARCHITECTURE DECISIONS:
 * 1. Why Three.js over Babylon.js?
 *    - Three.js: Lighter weight (600KB vs 2MB), better mobile performance
 *    - Babylon.js: More features, better VR support (use for VR layer, not VRR)
 *    - Decision: Three.js for VRR (browser-first), Babylon for VR (headset-first)
 *
 * 2. Real-Time Sync Strategy:
 *    - Pull-based (poll APIs every 5 minutes) for weather/events (low frequency changes)
 *    - WebSocket-based for inventory/player state (high frequency changes)
 *    - Hybrid: Pull for static data, push for dynamic data
 *
 * 3. State Persistence Between Layers:
 *    - AR layer: Scan QR → store in localStorage + IndexedDB
 *    - VRR layer: Quest progress → sync to Hololand backend API
 *    - VR layer: Completion → mint NFT, update on-chain state
 *
 * IMPLEMENTATION TASKS:
 * [x] Define VRRCompilerOptions interface
 * [x] Implement parseVRRComposition() - Extract VRR-specific traits
 * [x] Implement compileToThreeJS() - Generate Three.js scene code
 * [x] Implement generateWeatherSync() - Weather API integration code
 * [x] Implement generateEventSync() - Event API integration code
 * [x] Implement generateInventorySync() - Square/Shopify/WooCommerce integration
 * [x] Implement generateQuestLogic() - Business quest mechanics
 * [x] Implement generateLayerShift() - AR/VRR/VR transition handlers
 * [x] Implement generateX402Paywall() - Payment requirement checks
 * [x] Add tests (VRRCompiler.test.ts)
 * [ ] Add E2E compilation test (compile Phoenix downtown twin)
 * [ ] Performance optimization (lazy loading, asset streaming)
 *
 * ESTIMATED COMPLEXITY: 8/10 (high - requires multiple API integrations)
 * ESTIMATED TIME: 2 weeks (includes testing and documentation)
 * PRIORITY: CRITICAL (blocks Hololand business model)
 *
 * BLOCKED BY:
 * - packages/std/src/traits/VRRTraits.ts (trait definitions)
 * - packages/runtime/src/VRRRuntime.ts (runtime support)
 *
 * UNBLOCKS:
 * - Business partner SDK (VRR twin creation tools)
 * - AI agent quest generation (Story Weaver Protocol)
 * - Phoenix beta launch (10 businesses)
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes.js';
import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  compilePhysicsBlock,
  compileParticleBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
} from './DomainBlockCompilerMixin';

export interface VRRCompilerOptions {
  target: 'threejs' | 'babylonjs';
  minify: boolean;
  source_maps: boolean;
  api_integrations: {
    weather?: { provider: 'weather.gov' | 'openweathermap'; api_key?: string };
    events?: { provider: 'eventbrite' | 'ticketmaster'; api_key: string };
    inventory?: { provider: 'square' | 'shopify' | 'woocommerce'; api_key: string };
  };
  performance: {
    target_fps: number; // 60 for mobile, 90 for desktop
    max_players: number; // 1000+ for scalability
    lazy_loading: boolean;
  };
}

import type { VRRCompilationResult } from './CompilerTypes';
export type { VRRCompilationResult } from './CompilerTypes';

/**
 * Inline VRR trait validators — mirrors @holoscript/std VRRTraits definitions
 * without requiring a cross-package import from core → std.
 */
const VRRTraitDefs: Record<string, { validator?: (params: Record<string, unknown>) => boolean }> = {
  vrr_twin: { validator: (p) => !!p.mirror },
  reality_mirror: { validator: (p) => Array.isArray(p.sync) && (p.sync as unknown[]).length > 0 },
  geo_anchor: {
    validator: (p) =>
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      (p.lat as number) >= -90 &&
      (p.lat as number) <= 90 &&
      (p.lng as number) >= -180 &&
      (p.lng as number) <= 180,
  },
  weather_sync: {
    validator: (p) => ['weather.gov', 'openweathermap'].includes(String(p.provider)),
  },
  event_sync: { validator: (p) => ['eventbrite', 'ticketmaster'].includes(String(p.provider)) },
  inventory_sync: {
    validator: (p) => ['square_pos', 'shopify', 'woocommerce'].includes(String(p.provider)),
  },
  quest_hub: { validator: (p) => Array.isArray(p.quests) && (p.quests as unknown[]).length > 0 },
  layer_shift: {
    validator: (p) => {
      const valid = ['ar', 'vrr', 'vr'];
      return valid.includes(String(p.from)) && valid.includes(String(p.to));
    },
  },
  x402_paywall: {
    validator: (p) =>
      Number(p.price) > 0 &&
      ['USDC', 'ETH', 'SOL'].includes(String(p.asset || 'USDC')) &&
      ['base', 'ethereum', 'solana'].includes(String(p.network || 'base')),
  },
  geo_sync: { validator: (p) => !!p.center && Number(p.radius || 0) >= 0 },
};

/**
 * Internal representation of a VRR AST node with traits.
 * Used to avoid `any` throughout the compiler.
 */
interface VRRAstNode {
  name?: string;
  type?: string;
  traits?: Array<{ name: string; params: Record<string, unknown> }>;
  children?: VRRAstNode[];
  [key: string]: unknown;
}

/**
 * Parsed VRR composition result from parseVRRComposition().
 */
export interface VRRCompositionData {
  twinNodes: VRRAstNode[];
  weatherNodes: VRRAstNode[];
  eventNodes: VRRAstNode[];
  inventoryNodes: VRRAstNode[];
  questNodes: VRRAstNode[];
  layerShiftNodes: VRRAstNode[];
  paywallNodes: VRRAstNode[];
  geoAnchorNodes: VRRAstNode[];
}

export class VRRCompiler extends CompilerBase {
  protected readonly compilerName = 'VRRCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.VRR;
  }

  private options: VRRCompilerOptions;
  private errors: string[] = [];
  private warnings: string[] = [];
  private generatedCode: string[] = [];

  constructor(options: VRRCompilerOptions) {
    super();
    this.options = options;
  }

  // ─── 1. parseVRRComposition ───────────────────────────────────────────
  /**
   * Parse a HoloScript AST and extract VRR-specific traits.
   * Walks AST nodes, collects trait annotations, validates params against VRRTraits definitions.
   */
  parseVRRComposition(composition: HoloComposition): VRRCompositionData {
    const data: VRRCompositionData = {
      twinNodes: [],
      weatherNodes: [],
      eventNodes: [],
      inventoryNodes: [],
      questNodes: [],
      layerShiftNodes: [],
      paywallNodes: [],
      geoAnchorNodes: [],
    };

    const traitToField: Record<string, keyof VRRCompositionData> = {
      vrr_twin: 'twinNodes',
      weather_sync: 'weatherNodes',
      event_sync: 'eventNodes',
      inventory_sync: 'inventoryNodes',
      quest_hub: 'questNodes',
      layer_shift: 'layerShiftNodes',
      x402_paywall: 'paywallNodes',
      geo_anchor: 'geoAnchorNodes',
    };

    const traverse = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as VRRAstNode;

      if (n.traits && Array.isArray(n.traits)) {
        for (const trait of n.traits) {
          const field = traitToField[trait.name];
          if (field) {
            // Validate params against VRRTraits definitions
            const traitDef = VRRTraitDefs[trait.name];
            if (traitDef?.validator && !traitDef.validator(trait.params)) {
              this.warnings.push(`@${trait.name} on "${n.name || 'unnamed'}" has invalid params`);
            }
            data[field].push(n);
          }
        }
      }

      for (const key of Object.keys(n)) {
        const val = n[key];
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            for (const item of val) {
              traverse(item);
            }
          } else {
            traverse(val);
          }
        }
      }
    };

    traverse(composition);
    return data;
  }

  // ─── 2. compileToThreeJS ──────────────────────────────────────────────
  /**
   * Generate a complete Three.js scene from VRR composition data.
   * Places objects using geo_anchor coordinates, sets up materials/lighting/camera.
   */
  private compileToThreeJS(compositionData: VRRCompositionData, twinGroupName: string): void {
    this.generatedCode.push(`\n// === Three.js Scene Generation ===`);

    // Ambient + directional lighting
    this.generatedCode.push(`const ambientLight = new THREE.AmbientLight(0x404040, 0.6);`);
    this.generatedCode.push(`scene.add(ambientLight);`);
    this.generatedCode.push(`const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);`);
    this.generatedCode.push(`directionalLight.position.set(50, 200, 100);`);
    this.generatedCode.push(`directionalLight.castShadow = true;`);
    this.generatedCode.push(`scene.add(directionalLight);`);

    // Ground plane
    this.generatedCode.push(`const groundGeo = new THREE.PlaneGeometry(10000, 10000);`);
    this.generatedCode.push(
      `const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a7d3a, roughness: 0.9 });`
    );
    this.generatedCode.push(`const ground = new THREE.Mesh(groundGeo, groundMat);`);
    this.generatedCode.push(`ground.rotation[0] = -Math.PI / 2;`);
    this.generatedCode.push(`ground.receiveShadow = true;`);
    this.generatedCode.push(`scene.add(ground);`);

    // Camera positioning
    this.generatedCode.push(`camera.position.set(0, 50, 100);`);
    this.generatedCode.push(`camera.lookAt(0, 0, 0);`);

    // Place geo-anchored objects
    for (const node of compositionData.geoAnchorNodes) {
      const geoTrait = this.findTrait(node, 'geo_anchor');
      if (!geoTrait) continue;

      const lat = Number(geoTrait.params.lat) || 0;
      const lng = Number(geoTrait.params.lng) || 0;
      const safeName = this.escapeStringValue(String(node.name || 'geo_object'), 'TypeScript');

      this.generatedCode.push(`\n// Geo-anchored: ${safeName} (${lat}, ${lng})`);
      this.generatedCode.push(`const marker_${safeName} = new THREE.Group();`);
      this.generatedCode.push(
        `marker_${safeName}.position.copy(vrr.geoToSceneCoords(${lat}, ${lng}));`
      );
      this.generatedCode.push(`marker_${safeName}.userData.geo = { lat: ${lat}, lng: ${lng} };`);
      this.generatedCode.push(`${twinGroupName}.add(marker_${safeName});`);
    }

    // Skybox
    this.generatedCode.push(`\n// Skybox`);
    this.generatedCode.push(`scene.background = new THREE.Color(0x87ceeb);`);

    // Render loop
    this.generatedCode.push(`\n// Render loop`);
    this.generatedCode.push(`renderer.shadowMap.enabled = true;`);
    this.generatedCode.push(`renderer.shadowMap.type = THREE.PCFSoftShadowMap;`);
    this.generatedCode.push(`function animate() {`);
    this.generatedCode.push(`  requestAnimationFrame(animate);`);
    this.generatedCode.push(`  vrr.tick();`);
    this.generatedCode.push(`  renderer.render(scene, camera);`);
    this.generatedCode.push(`}`);
    this.generatedCode.push(`animate();`);
  }

  // ─── 3. generateWeatherSync ───────────────────────────────────────────
  /**
   * Generate code that connects to weather API and updates scene
   * lighting/particles/skybox based on real-time weather data.
   */
  private generateWeatherSync(nodes: VRRAstNode[]): void {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// === @weather_sync — Real-Time Weather Integration ===`);

    for (const node of nodes) {
      const trait = this.findTrait(node, 'weather_sync');
      if (!trait) continue;

      const provider = String(trait.params.provider || 'weather.gov');
      const refresh = String(trait.params.refresh || '5_minutes');
      const safeName = this.escapeStringValue(String(node.name || 'zone'), 'TypeScript');

      this.generatedCode.push(`// Weather sync for "${safeName}" via ${provider}`);
      this.generatedCode.push(`const weatherSync_${safeName} = vrr.createWeatherSync({`);
      this.generatedCode.push(`  provider: '${provider}',`);
      this.generatedCode.push(`  refresh: '${refresh}',`);
      this.generatedCode.push(`  location: vrr.getGeoCenter(),`);
      this.generatedCode.push(`});`);

      // Rain particle system
      this.generatedCode.push(`const rainGeometry = new THREE.BufferGeometry();`);
      this.generatedCode.push(`const rainPositions = new Float32Array(3000 * 3);`);
      this.generatedCode.push(`for (let i = 0; i < 3000; i++) {`);
      this.generatedCode.push(`  rainPositions[i * 3] = (Math.random() - 0.5) * 500;`);
      this.generatedCode.push(`  rainPositions[i * 3 + 1] = Math.random() * 200;`);
      this.generatedCode.push(`  rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 500;`);
      this.generatedCode.push(`}`);
      this.generatedCode.push(
        `rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));`
      );
      this.generatedCode.push(
        `const rainMaterial = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.1, transparent: true });`
      );
      this.generatedCode.push(`const rainSystem = new THREE.Points(rainGeometry, rainMaterial);`);
      this.generatedCode.push(`rainSystem.visible = false;`);
      this.generatedCode.push(`scene.add(rainSystem);`);

      // Weather update callback
      this.generatedCode.push(`weatherSync_${safeName}.onUpdate((weather) => {`);
      this.generatedCode.push(`  // Update fog based on visibility`);
      this.generatedCode.push(
        `  scene.fog = new THREE.Fog(0xcccccc, 10, Math.max(weather.visibility, 50));`
      );
      this.generatedCode.push(`  // Toggle rain particles`);
      this.generatedCode.push(`  rainSystem.visible = weather.precipitation > 0;`);
      this.generatedCode.push(`  // Adjust sun intensity based on cloud cover`);
      this.generatedCode.push(
        `  directionalLight.intensity = Math.max(0.2, 1.0 - (weather.cloud_cover || 0) / 100);`
      );
      this.generatedCode.push(`  // Update skybox color`);
      this.generatedCode.push(`  const skyHue = weather.precipitation > 50 ? 0x666680 : 0x87ceeb;`);
      this.generatedCode.push(`  scene.background = new THREE.Color(skyHue);`);
      this.generatedCode.push(`  // Temperature-based ambient tint`);
      this.generatedCode.push(
        `  const tempNorm = Math.max(0, Math.min(1, (weather.temperature_f || 70) / 120));`
      );
      this.generatedCode.push(`  ambientLight.color.setHSL(0.6 - tempNorm * 0.4, 0.3, 0.4);`);
      this.generatedCode.push(`});`);
    }
  }

  // ─── 4. generateEventSync ─────────────────────────────────────────────
  /**
   * Generate code that fetches events from providers (Eventbrite/Ticketmaster)
   * and creates event markers + UI overlays in the scene.
   */
  private generateEventSync(nodes: VRRAstNode[]): void {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// === @event_sync — Real-Time Event Integration ===`);

    for (const node of nodes) {
      const trait = this.findTrait(node, 'event_sync');
      if (!trait) continue;

      const provider = String(trait.params.provider || 'eventbrite');
      const refresh = String(trait.params.refresh || '5_minutes');
      const safeName = this.escapeStringValue(String(node.name || 'zone'), 'TypeScript');

      this.generatedCode.push(`// Event sync for "${safeName}" via ${provider}`);
      this.generatedCode.push(`const eventSync_${safeName} = vrr.createEventSync({`);
      this.generatedCode.push(`  provider: '${provider}',`);
      this.generatedCode.push(`  refresh: '${refresh}',`);
      this.generatedCode.push(`  location: vrr.getGeoCenter(),`);
      this.generatedCode.push(`});`);

      this.generatedCode.push(`const eventMarkers_${safeName} = new THREE.Group();`);
      this.generatedCode.push(`scene.add(eventMarkers_${safeName});`);

      this.generatedCode.push(`eventSync_${safeName}.onUpdate((events) => {`);
      this.generatedCode.push(`  // Clear previous markers`);
      this.generatedCode.push(`  while (eventMarkers_${safeName}.children.length > 0) {`);
      this.generatedCode.push(
        `    eventMarkers_${safeName}.remove(eventMarkers_${safeName}.children[0]);`
      );
      this.generatedCode.push(`  }`);
      this.generatedCode.push(`  for (const evt of events) {`);
      this.generatedCode.push(`    // Create event marker billboard`);
      this.generatedCode.push(`    const markerGeo = new THREE.CylinderGeometry(0.5, 0.5, 8, 8);`);
      this.generatedCode.push(
        `    const markerMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x331111 });`
      );
      this.generatedCode.push(`    const marker = new THREE.Mesh(markerGeo, markerMat);`);
      this.generatedCode.push(`    if (evt.geo) {`);
      this.generatedCode.push(
        `      marker.position.copy(vrr.geoToSceneCoords(evt.geo.lat, evt.geo.lng));`
      );
      this.generatedCode.push(`    }`);
      this.generatedCode.push(
        `    marker.userData.event = { name: evt.name, date: evt.date, url: evt.url };`
      );
      this.generatedCode.push(`    eventMarkers_${safeName}.add(marker);`);
      this.generatedCode.push(`    // Spawn NPC crowds for active events`);
      this.generatedCode.push(`    if (evt.status === 'active') {`);
      this.generatedCode.push(
        `      vrr.spawnNPCCrowd(marker.position, evt.expected_attendance || 20);`
      );
      this.generatedCode.push(`    }`);
      this.generatedCode.push(`  }`);
      this.generatedCode.push(`});`);
    }
  }

  // ─── 5. generateInventorySync ─────────────────────────────────────────
  /**
   * Generate code for real-time inventory display:
   * product counts, availability badges, stock-level indicators.
   */
  private generateInventorySync(nodes: VRRAstNode[], twinGroupName: string): void {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// === @inventory_sync — Real-Time Inventory Display ===`);

    for (const node of nodes) {
      const trait = this.findTrait(node, 'inventory_sync');
      if (!trait) continue;

      const provider = String(trait.params.provider || 'square_pos');
      const refresh = String(trait.params.refresh || '1_minute');
      const useWebSocket = Boolean(trait.params.websocket);
      const safeName = this.escapeStringValue(String(node.name || 'shop'), 'TypeScript');

      this.generatedCode.push(`// Inventory sync for "${safeName}" via ${provider}`);
      this.generatedCode.push(`const inventorySync_${safeName} = vrr.createInventorySync({`);
      this.generatedCode.push(`  provider: '${provider}',`);
      this.generatedCode.push(`  refresh: '${refresh}',`);
      this.generatedCode.push(`  websocket: ${useWebSocket},`);
      this.generatedCode.push(`  business_id: '${safeName}',`);
      this.generatedCode.push(`});`);

      this.generatedCode.push(`const inventoryUI_${safeName} = new THREE.Group();`);
      this.generatedCode.push(`${twinGroupName}.add(inventoryUI_${safeName});`);

      this.generatedCode.push(`inventorySync_${safeName}.onUpdate((inventory) => {`);
      this.generatedCode.push(`  // Clear previous inventory display`);
      this.generatedCode.push(`  while (inventoryUI_${safeName}.children.length > 0) {`);
      this.generatedCode.push(
        `    inventoryUI_${safeName}.remove(inventoryUI_${safeName}.children[0]);`
      );
      this.generatedCode.push(`  }`);
      this.generatedCode.push(`  for (const item of inventory.items) {`);
      this.generatedCode.push(
        `    // Availability badge color: green=in-stock, yellow=low, red=out`
      );
      this.generatedCode.push(
        `    const badgeColor = item.quantity > 10 ? 0x00ff00 : item.quantity > 0 ? 0xffaa00 : 0xff0000;`
      );
      this.generatedCode.push(`    const badgeGeo = new THREE.SphereGeometry(0.3, 8, 8);`);
      this.generatedCode.push(
        `    const badgeMat = new THREE.MeshStandardMaterial({ color: badgeColor, emissive: badgeColor, emissiveIntensity: 0.5 });`
      );
      this.generatedCode.push(`    const badge = new THREE.Mesh(badgeGeo, badgeMat);`);
      this.generatedCode.push(
        `    badge.userData.product = { name: item.name, quantity: item.quantity, price: item.price };`
      );
      this.generatedCode.push(`    inventoryUI_${safeName}.add(badge);`);
      this.generatedCode.push(`  }`);
      this.generatedCode.push(`});`);
    }
  }

  // ─── 6. generateQuestLogic ────────────────────────────────────────────
  /**
   * Generate quest/gamification code: visit locations, collect items,
   * earn rewards, track progress across AR/VRR/VR layers.
   */
  private generateQuestLogic(nodes: VRRAstNode[]): void {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// === @quest_hub — Business Quest Mechanics ===`);

    for (const node of nodes) {
      const trait = this.findTrait(node, 'quest_hub');
      if (!trait) continue;

      const quests = Array.isArray(trait.params.quests) ? trait.params.quests : [];
      const safeName = this.escapeStringValue(String(node.name || 'business'), 'TypeScript');

      this.generatedCode.push(`// Quest hub: "${safeName}" with ${quests.length} quest(s)`);
      this.generatedCode.push(`const questHub_${safeName} = vrr.createQuestHub({`);
      this.generatedCode.push(`  business_id: '${safeName}',`);
      this.generatedCode.push(`  quests: ${JSON.stringify(quests)},`);
      this.generatedCode.push(`});`);

      // Quest NPC marker
      this.generatedCode.push(`// Quest NPC beacon`);
      this.generatedCode.push(
        `const questBeacon_${safeName} = new THREE.PointLight(0xffdd00, 2, 30);`
      );
      this.generatedCode.push(`questBeacon_${safeName}.position.set(0, 5, 0);`);
      this.generatedCode.push(
        `if (marker_${safeName}) marker_${safeName}.add(questBeacon_${safeName});`
      );

      // Quest state machine
      this.generatedCode.push(`questHub_${safeName}.onQuestStart((quest) => {`);
      this.generatedCode.push(`  vrr.persistState('quest_progress_' + quest.id, {`);
      this.generatedCode.push(`    started_at: Date.now(),`);
      this.generatedCode.push(`    current_step: 0,`);
      this.generatedCode.push(`    steps_completed: [],`);
      this.generatedCode.push(`  });`);
      this.generatedCode.push(`});`);

      this.generatedCode.push(`questHub_${safeName}.onStepComplete((quest, stepIndex) => {`);
      this.generatedCode.push(`  const state = vrr.getState('quest_progress_' + quest.id);`);
      this.generatedCode.push(`  if (state) {`);
      this.generatedCode.push(`    state.steps_completed.push(stepIndex);`);
      this.generatedCode.push(`    state.current_step = stepIndex + 1;`);
      this.generatedCode.push(`    vrr.persistState('quest_progress_' + quest.id, state);`);
      this.generatedCode.push(`  }`);
      this.generatedCode.push(`});`);

      this.generatedCode.push(`questHub_${safeName}.onQuestComplete((quest, reward) => {`);
      this.generatedCode.push(`  vrr.persistState('quest_progress_' + quest.id, {`);
      this.generatedCode.push(`    completed_at: Date.now(),`);
      this.generatedCode.push(`    reward_claimed: false,`);
      this.generatedCode.push(`  });`);
      this.generatedCode.push(`  // Grant reward (coupon, NFT, etc.)`);
      this.generatedCode.push(`  vrr.grantReward(quest.id, reward);`);
      this.generatedCode.push(`  // Visual celebration`);
      this.generatedCode.push(`  questBeacon_${safeName}.color.setHex(0x00ff00);`);
      this.generatedCode.push(`});`);
    }
  }

  // ─── 7. generateLayerShift ────────────────────────────────────────────
  /**
   * Generate AR/VRR/VR transition handlers with state persistence.
   * Preserves quest progress, inventory state, and player position across layers.
   */
  private generateLayerShift(nodes: VRRAstNode[]): void {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// === @layer_shift — AR/VRR/VR Transition Handlers ===`);

    // Shared layer state manager
    this.generatedCode.push(`const layerState = {`);
    this.generatedCode.push(`  current: 'vrr',`);
    this.generatedCode.push(`  persist: async (data) => {`);
    this.generatedCode.push(`    // IndexedDB for client-side persistence`);
    this.generatedCode.push(`    const db = await vrr.getIndexedDB('hololand_layers');`);
    this.generatedCode.push(`    await db.put('layer_state', data);`);
    this.generatedCode.push(`    // Server-side sync`);
    this.generatedCode.push(`    await vrr.syncToServer('layer_state', data);`);
    this.generatedCode.push(`  },`);
    this.generatedCode.push(`  restore: async () => {`);
    this.generatedCode.push(`    const db = await vrr.getIndexedDB('hololand_layers');`);
    this.generatedCode.push(`    return await db.get('layer_state');`);
    this.generatedCode.push(`  },`);
    this.generatedCode.push(`};`);

    for (const node of nodes) {
      const trait = this.findTrait(node, 'layer_shift');
      if (!trait) continue;

      const from = String(trait.params.from || 'ar');
      const to = String(trait.params.to || 'vrr');
      const price = Number(trait.params.price) || 0;
      const persistState = trait.params.persist_state !== false;
      const safeName = this.escapeStringValue(String(node.name || 'portal'), 'TypeScript');

      this.generatedCode.push(`\n// Layer shift: ${from} -> ${to} (${safeName})`);
      this.generatedCode.push(`vrr.registerLayerShift({`);
      this.generatedCode.push(`  id: '${safeName}',`);
      this.generatedCode.push(`  from: '${from}',`);
      this.generatedCode.push(`  to: '${to}',`);
      this.generatedCode.push(`  price: ${price},`);
      this.generatedCode.push(`  persist_state: ${persistState},`);
      this.generatedCode.push(`  onTransition: async (player) => {`);

      if (persistState) {
        this.generatedCode.push(`    // Save current state before transition`);
        this.generatedCode.push(`    await layerState.persist({`);
        this.generatedCode.push(`      player_position: player.position,`);
        this.generatedCode.push(`      quest_progress: vrr.getAllQuestProgress(),`);
        this.generatedCode.push(`      inventory: vrr.getPlayerInventory(),`);
        this.generatedCode.push(`      layer_from: '${from}',`);
        this.generatedCode.push(`      timestamp: Date.now(),`);
        this.generatedCode.push(`    });`);
      }

      if (price > 0) {
        this.generatedCode.push(`    // Require payment before transition`);
        this.generatedCode.push(
          `    const paid = await vrr.requirePayment({ price: ${price}, asset: 'USDC', network: 'base' });`
        );
        this.generatedCode.push(`    if (!paid) return false;`);
      }

      this.generatedCode.push(`    // Execute layer transition`);
      this.generatedCode.push(`    layerState.current = '${to}';`);
      this.generatedCode.push(`    vrr.transitionToLayer('${to}');`);
      this.generatedCode.push(`    return true;`);
      this.generatedCode.push(`  },`);
      this.generatedCode.push(`  onArrive: async (player) => {`);

      if (persistState) {
        this.generatedCode.push(`    // Restore state after transition`);
        this.generatedCode.push(`    const saved = await layerState.restore();`);
        this.generatedCode.push(`    if (saved) {`);
        this.generatedCode.push(`      vrr.restoreQuestProgress(saved.quest_progress);`);
        this.generatedCode.push(`      vrr.restorePlayerInventory(saved.inventory);`);
        this.generatedCode.push(`    }`);
      }

      this.generatedCode.push(`  },`);
      this.generatedCode.push(`});`);
    }
  }

  // ─── 8. generateX402Paywall ───────────────────────────────────────────
  /**
   * Generate payment requirement checks using x402 protocol.
   * Blocks content access until on-chain payment is verified.
   */
  private generateX402Paywall(nodes: VRRAstNode[]): void {
    if (nodes.length === 0) return;

    this.generatedCode.push(`\n// === @x402_paywall — Payment Requirement Checks ===`);

    for (const node of nodes) {
      const trait = this.findTrait(node, 'x402_paywall');
      if (!trait) continue;

      const price = Number(trait.params.price) || 0;
      const asset = String(trait.params.asset || 'USDC');
      const network = String(trait.params.network || 'base');
      const safeName = this.escapeStringValue(String(node.name || 'content'), 'TypeScript');

      this.generatedCode.push(`// x402 paywall: "${safeName}" — ${price} ${asset} on ${network}`);
      this.generatedCode.push(`const paywall_${safeName} = vrr.createPaywall({`);
      this.generatedCode.push(`  content_id: '${safeName}',`);
      this.generatedCode.push(`  price: ${price},`);
      this.generatedCode.push(`  asset: '${asset}',`);
      this.generatedCode.push(`  network: '${network}',`);
      this.generatedCode.push(`  on402: async (req) => {`);
      this.generatedCode.push(`    // Return 402 Payment Required with payment details`);
      this.generatedCode.push(`    return {`);
      this.generatedCode.push(`      status: 402,`);
      this.generatedCode.push(`      headers: {`);
      this.generatedCode.push(`        'X-Payment-Required': 'true',`);
      this.generatedCode.push(`        'X-Payment-Amount': '${price}',`);
      this.generatedCode.push(`        'X-Payment-Asset': '${asset}',`);
      this.generatedCode.push(`        'X-Payment-Network': '${network}',`);
      this.generatedCode.push(`        'X-Payment-Address': vrr.getPaymentAddress('${safeName}'),`);
      this.generatedCode.push(`      },`);
      this.generatedCode.push(`    };`);
      this.generatedCode.push(`  },`);
      this.generatedCode.push(`  onPaymentVerified: (receipt) => {`);
      this.generatedCode.push(`    vrr.persistState('paywall_${safeName}', {`);
      this.generatedCode.push(`      paid: true,`);
      this.generatedCode.push(`      tx_hash: receipt.tx_hash,`);
      this.generatedCode.push(`      timestamp: Date.now(),`);
      this.generatedCode.push(`    });`);
      this.generatedCode.push(`    // Unlock content in scene`);
      this.generatedCode.push(`    vrr.unlockContent('${safeName}');`);
      this.generatedCode.push(`  },`);
      this.generatedCode.push(`  onPaymentFailed: (error) => {`);
      this.generatedCode.push(
        `    console.warn('Payment failed for ${safeName}:', error.message);`
      );
      this.generatedCode.push(
        `    vrr.showPaywallUI('${safeName}', { price: ${price}, asset: '${asset}', network: '${network}' });`
      );
      this.generatedCode.push(`  },`);
      this.generatedCode.push(`});`);
    }
  }

  // ─── Utility: find trait on node ──────────────────────────────────────
  private findTrait(
    node: VRRAstNode,
    traitName: string
  ): { name: string; params: Record<string, unknown> } | undefined {
    if (!node.traits) return undefined;
    return node.traits.find((t) => t.name === traitName);
  }

  // ─── Main compile() ──────────────────────────────────────────────────
  private normalizeToCompositionTree(input: unknown): HoloComposition | null {
    if (!input || typeof input !== 'object') return null;
    const node = input as Record<string, unknown>;
    const nodeType = String(node.type || '').toLowerCase();

    if (nodeType === 'composition') {
      return input as HoloComposition;
    }

    // Accept a top-level world node by wrapping it in a synthetic composition.
    if (nodeType === 'world') {
      return {
        type: 'Composition',
        name: String(node.name || 'WorldRoot'),
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
        children: [node],
        worlds: [node],
      } as unknown as HoloComposition;
    }

    return null;
  }

  private extractGlobalSimulationStateFromWorlds(comp: Record<string, unknown>): Record<string, unknown> {
    // Preferred source: v4+ `composition.worlds[]`
    const worlds = Array.isArray(comp.worlds) ? (comp.worlds as Array<Record<string, unknown>>) : [];
    if (worlds.length > 0 && worlds[0]) {
      const w = worlds[0];
      if (w.simulation_state && typeof w.simulation_state === 'object') {
        return w.simulation_state as Record<string, unknown>;
      }
      if (w.simulationState && typeof w.simulationState === 'object') {
        return w.simulationState as Record<string, unknown>;
      }
      if (w.state && typeof w.state === 'object') {
        return w.state as Record<string, unknown>;
      }
    }

    // Fallback source: `composition.children[]` world nodes (parser variants)
    const children = Array.isArray(comp.children)
      ? (comp.children as Array<Record<string, unknown>>)
      : [];
    const worldChild = children.find((c) => String(c?.type || '').toLowerCase() === 'world');
    if (worldChild) {
      if (worldChild.simulation_state && typeof worldChild.simulation_state === 'object') {
        return worldChild.simulation_state as Record<string, unknown>;
      }
      if (worldChild.simulationState && typeof worldChild.simulationState === 'object') {
        return worldChild.simulationState as Record<string, unknown>;
      }
      if (worldChild.state && typeof worldChild.state === 'object') {
        return worldChild.state as Record<string, unknown>;
      }
    }

    return {};
  }

  override compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): VRRCompilationResult {
    this.validateCompilerAccess(agentToken, outputPath);
    this.errors = [];
    this.warnings = [];
    this.generatedCode = [];

    // Analyze/normalize composition tree
    const normalizedComposition = this.normalizeToCompositionTree(composition);
    if (!normalizedComposition) {
      this.errors.push('Invalid composition tree');
      return this.buildResult();
    }

    // 1. Parse VRR composition — extract all trait-annotated nodes
    const compositionData = this.parseVRRComposition(normalizedComposition);

    const twinNodes = compositionData.twinNodes;
    if (twinNodes.length === 0) {
      this.warnings.push(
        'No @vrr_twin traits found. Compiling as standard 3D instead of reality mirror.'
      );
    }

    // Top-level worlds simulation state (from v4+ AST)
    // @ts-expect-error During migration
    const comp = normalizedComposition as unknown as Record<string, unknown>;
    const globalSimulationState = this.extractGlobalSimulationStateFromWorlds(comp);

    // Generate imports and scene setup
    this.generateImports();
    this.generateSceneSetup();
    
    // Pass global state to API hooks and get the twin group name
    const twinGroupName = this.generateAPIHooks(twinNodes as unknown[], globalSimulationState);

    // 2. Generate Three.js scene with geo-anchored objects, lighting, camera
    this.compileToThreeJS(compositionData, twinGroupName);

    // 3-8. Generate sync/logic for each VRR trait
    this.generateWeatherSync(compositionData.weatherNodes);
    this.generateEventSync(compositionData.eventNodes);
    this.generateInventorySync(compositionData.inventoryNodes, twinGroupName);
    this.generateQuestLogic(compositionData.questNodes);
    this.generateLayerShift(compositionData.layerShiftNodes);
    this.generateX402Paywall(compositionData.paywallNodes);

    // v4.2: Domain Blocks
    const domainBlocks = (Array.isArray(comp.domainBlocks) ? comp.domainBlocks : []) as Array<
      Record<string, unknown>
    >;
    if (domainBlocks.length > 0) {
      this.generatedCode.push('\n// === v4.2 Domain Blocks ===');
      const compiled = compileDomainBlocks(
        // @ts-expect-error During migration
        domainBlocks,
        {
          material: (block) => {
            const m = compileMaterialBlock(block);
            return `// VRR Material: "${this.escapeStringValue(m.name as string, 'TypeScript')}" type=${m.type} baseColor=${m.baseColor || 'none'}`;
          },
          physics: (block) => {
            const p = compilePhysicsBlock(block);
            return `// VRR Physics: ${p.keyword} "${p.name || ''}" colliders=${p.colliders?.length || 0}`;
          },
          vfx: (block) => {
            const ps = compileParticleBlock(block);
            return `// VRR Particles: "${this.escapeStringValue(ps.name as string, 'TypeScript')}" rate=${ps.properties.rate || 'default'}`;
          },
          audio: (block) => {
            const a = compileAudioSourceBlock(block);
            return `// VRR Audio: "${this.escapeStringValue(a.name as string, 'TypeScript')}" clip=${a.properties.clip || 'none'}`;
          },
          weather: (block) => {
            const w = compileWeatherBlock(block);
            return `// VRR Weather: ${w.keyword} layers=[${w.layers.map((l) => l.type).join(', ')}]`;
          },
        },
        (block) =>
          `// Domain block: ${block.domain}/${block.keyword} "${this.escapeStringValue(block.name as string, 'TypeScript')}"`
      );
      for (const line of compiled) {
        this.generatedCode.push(line);
      }
    }

    // Bind generic nodes
    this.generatedCode.push(`\n// --- End of VRR Bindings --- //\n`);
    this.generatedCode.push(`scene.add(${twinGroupName});`);

    return this.buildResult();
  }

  private extractNodesWithTrait(astNode: unknown, traitName: string): VRRAstNode[] {
    const matched: VRRAstNode[] = [];
    const cleanTraitName = traitName.startsWith('@') ? traitName.slice(1) : traitName;
    const traverse = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as VRRAstNode;
      if (n.traits && Array.isArray(n.traits) && n.traits.some((t) => t.name === cleanTraitName)) {
        matched.push(n);
      }
      for (const key of Object.keys(n)) {
        const val = (n as Record<string, unknown>)[key];
        if (typeof val === 'object' && val !== null) {
          traverse(val);
        }
      }
    };
    traverse(astNode);
    return matched;
  }

  private generateImports() {
    this.generatedCode.push(`import * as THREE from 'three';`);
    this.generatedCode.push(`import { VRRRuntime } from '@holoscript/runtime';`);
  }

  private generateSceneSetup() {
    this.generatedCode.push(`\n// Initialize Scene`);
    this.generatedCode.push(`const scene = new THREE.Scene();`);
    this.generatedCode.push(
      `const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);`
    );
    this.generatedCode.push(`const renderer = new THREE.WebGLRenderer({ antialias: true });`);
    this.generatedCode.push(`renderer.setSize(window.innerWidth, window.innerHeight);`);
    this.generatedCode.push(`document.body.appendChild(renderer.domElement);`);
  }

  private generateAPIHooks(twinNodes: unknown[], globalSimulationState: Record<string, unknown> = {}): string {
    this.generatedCode.push(`\n// Engine Initialization via @vrr_twin`);

    // Default config values
    let geoCenter = { lat: 0, lng: 0 };
    let twinId = `auto_gen_twin`;
    let twinName = 'globalWorldContext';
    let weatherProvider = '';
    let eventProvider = '';
    let inventoryProvider = '';

    for (const rawNode of twinNodes) {
      const node = rawNode as VRRAstNode;
      if (node.name) {
        twinName = this.escapeStringValue(String(node.name), 'TypeScript');
      }
      if (node.traits) {
        for (const trait of node.traits) {
          if (trait.name === 'geo_anchor')
            geoCenter = { lat: Number(trait.params.lat), lng: Number(trait.params.lng) };
          else if (trait.name === 'vrr_twin' && trait.params.mirror)
            twinId = String(trait.params.mirror);
          else if (trait.name === 'weather_sync') weatherProvider = String(trait.params.provider);
          else if (trait.name === 'event_sync') eventProvider = String(trait.params.provider);
          else if (trait.name === 'inventory_sync')
            inventoryProvider = String(trait.params.provider);
        }
      }
    }

    const apiConfig = JSON.parse(JSON.stringify(this.options.api_integrations || {}));
    if (weatherProvider && !apiConfig.weather) apiConfig.weather = { provider: weatherProvider };
    if (eventProvider && !apiConfig.events) apiConfig.events = { provider: eventProvider };
    if (inventoryProvider && !apiConfig.inventory)
      apiConfig.inventory = { provider: inventoryProvider };

    this.generatedCode.push(`const vrr = new VRRRuntime({`);
    this.generatedCode.push(`  twin_id: '${twinId}',`);
    this.generatedCode.push(`  geo_center: { lat: ${geoCenter.lat}, lng: ${geoCenter.lng} },`);
    this.generatedCode.push(`  apis: ${JSON.stringify(apiConfig, null, 2)},`);
    this.generatedCode.push(`  multiplayer: { enabled: true, max_players: 1000, tick_rate: 20 },`);
    this.generatedCode.push(`  simulation_state: ${JSON.stringify(globalSimulationState)},`);
    this.generatedCode.push(
      `  state_persistence: { client: 'indexeddb', server: 'https://supabase.hololand.io' }`
    );
    this.generatedCode.push(`});`);

    this.generatedCode.push(`\nconst ${twinName} = new THREE.Group();`);

    // Weather hooks
    if (weatherProvider) {
      this.generatedCode.push(`\n// Extracted @weather_sync hook`);
      this.generatedCode.push(`vrr.syncWeather((weather) => {`);
      this.generatedCode.push(`  scene.fog = new THREE.Fog(0xcccccc, 10, weather.visibility);`);
      this.generatedCode.push(
        `  if (weather.precipitation > 50) console.log("Heavy Rain Detected in Twin");`
      );
      this.generatedCode.push(`});`);
    }

    // Event hooks
    if (eventProvider) {
      this.generatedCode.push(`\n// Extracted @event_sync hook`);
      this.generatedCode.push(`vrr.syncEvents((events) => {`);
      this.generatedCode.push(
        `  events.forEach(evt => console.log('Spawning event NPCs for:', evt.name));`
      );
      this.generatedCode.push(`});`);
    }

    // Business Quest and Inventory scanning
    const questHubs = this.extractNodesWithTrait(twinNodes[0] || {}, '@quest_hub');
    for (const hub of questHubs) {
      const questTrait = hub.traits?.find((t) => t.name === 'quest_hub');
      const quests = questTrait
        ? Array.isArray(questTrait.params.quests)
          ? questTrait.params.quests
          : []
        : [];
      this.generatedCode.push(`\n// Configured @quest_hub for ${hub.name || 'Business'}`);
      this.generatedCode.push(`const hub_${Math.random().toString(36).substring(7)} = {`);
      this.generatedCode.push(`  quests: ${JSON.stringify(quests)}`);
      this.generatedCode.push(`};`);

      const inventory = hub.traits?.find((t) => t.name === 'inventory_sync');
      if (inventory) {
        this.generatedCode.push(`vrr.syncInventory('${hub.name || 'shop'}', (inv) => {`);
        this.generatedCode.push(`  console.log('Stock updated:', inv);`);
        this.generatedCode.push(`});`);
      }
    }

    // x402 Paywalls
    const paywalls = this.extractNodesWithTrait(twinNodes[0] || {}, '@x402_paywall');
    for (const pw of paywalls) {
      const trait = pw.traits?.find((t) => t.name === 'x402_paywall');
      if (!trait) continue;
      this.generatedCode.push(
        `\n// @x402_paywall requirement for ${this.escapeStringValue(String(pw.name || ''), 'TypeScript')}`
      );
      this.generatedCode.push(
        `vrr.persistState('paywall_${this.escapeStringValue(String(pw.name || ''), 'TypeScript')}', ${JSON.stringify(trait.params)});`
      );
    }

    // Multiplayer Hooks
    this.generatedCode.push(`\n// Extracted Multiplayer logic`);
    this.generatedCode.push(`vrr.syncPlayers((players) => {`);
    this.generatedCode.push(`  // Render avatars in scene mapped to players.position`);
    this.generatedCode.push(`});`);
    
    return twinName;
  }

  private buildResult(): VRRCompilationResult {
    return {
      success: this.errors.length === 0,
      target: this.options.target,
      code: this.generatedCode.join('\n'),
      assets: [],
      api_endpoints: [],
      warnings: this.warnings,
      errors: this.errors,
    };
  }
}

export default VRRCompiler;
