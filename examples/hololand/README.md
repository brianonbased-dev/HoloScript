# Hololand Integration Examples

Sample `.holo` files demonstrating the new Hololand integration features including Asset Manifests, Semantic Annotations, World Definitions, and Runtime Integration.

## Examples

### 1. Asset Manifest (`1-asset-manifest.holo`)

Demonstrates the **Asset Manifest System** for organizing and loading game assets:

- Asset manifest declaration with metadata
- Asset type inference and MIME types
- Dependency graph for load ordering
- Asset preloading with progress callbacks
- Platform-specific asset variants
- Asset gallery browser UI

**Key concepts:**

- `@manifest("name")` - Declare asset manifests
- `@asset("id")` - Reference assets by ID
- `@manifest.preload_all()` - Batch loading

### 2. Semantic Annotations (`2-semantic-annotations.holo`)

Demonstrates the **Semantic Annotation Framework** for adding meaning to entities:

- Entity semantic annotations with categories and types
- Property annotations (position, rotation, health, etc.)
- Data bindings connecting state to UI
- Capability declarations
- Reactive UI updates based on state changes

**Key concepts:**

- `@semantic("id")` - Define semantic annotations
- `@annotate()` - Property-level annotations
- `@bindings` - Reactive data binding declarations
- `@semantic_ref()` - Reference semantic definitions

### 3. World Definition (`3-world-definition.holo`)

Demonstrates the **World Definition Schema** for complete VR/AR worlds:

- World metadata (id, name, platforms, age rating)
- World configuration (physics, rendering, networking)
- Environment settings (skybox, lighting, fog)
- Zones with triggers and boundaries
- Spawn points for teams/players
- LOD configuration

**Key concepts:**

- `@world_metadata` - World identification and platform support
- `@world_config` - Runtime configuration
- `@zones` - Spatial regions with behaviors
- `@spawn_points` - Player entry locations

### 4. Integrated Experience (`4-integrated-experience.holo`)

**Complete example** combining all systems into a Virtual Art Gallery:

- Full world metadata and configuration
- Comprehensive asset manifest with variants
- Multiple semantic annotations (artworks, visitors, NPCs)
- Zone-based audio and environment changes
- Data bindings for UI panels
- Hololand runtime integration events
- AI guide NPC with behaviors

**Key concepts:**

- All of the above, working together
- `@hololand.connect()` - Connect to runtime
- `@hololand.player_joined` - Multiplayer events
- `@npc_behavior` - AI character definitions

### 5. AR Bridge Contract (`5-ar-bridge-contract.holo`)

Demonstrates the **AR Bridge Contract** system for adapter capability negotiation:

- Adapter declaration (`bridge`) with feature manifest
- Capability bindings (`capability`) for hit-test, image tracking, depth sensing, light estimation
- Runtime hooks (`hook`) for session lifecycle events
- Contract validation (`contract`) with fallback policies
- Origin beacon and transparent ground plane

**Key concepts:**

- `bridge` - Declare AR runtime adapter contracts
- `capability` - Bind platform capabilities with limits
- `hook` - Register session lifecycle handlers
- `contract` - Declare compatibility requirements

### 6. WebXR Adapter (`6-ar-webxr-adapter.holo`)

Platform-specific bridge contract for **WebXR AR sessions**:

- WebXR session mode, required/optional features, reference spaces
- Input source bindings for XR controller and screen tap
- Hit-test configuration with plane filtering
- Anchor pool management with session lifecycle
- Spawnable prefabs for dynamic placement
- DOM overlay UI anchors

**Key concepts:**

- `bridge` with `session_mode` and `reference_space`
- `input` - Map XR/DOM events to actions
- `config` - Hit-test origin/direction tuning
- `pool` - Managed anchor/object pools
- `prefab` - Reusable spawnable templates
- `ui` - DOM overlay declarations

### 7. AR Portal + Overlay (`7-ar-portal-overlay.holo`)

Combines **QR beacon entry**, **camera overlays**, and **layer-shift transitions**:

- QR beacon targets with cooldown and action binding
- Portal geometry with stencil masking and walk-through trigger
- Camera overlays anchored to screen corners with conditional visibility
- Layer shift for reality blending opacity
- Spatial content inside the portal boundary

**Key concepts:**

- `beacon` - Image/QR marker definitions
- `portal` - Dimensional gateway with destination and transition
- `overlay` - Camera-facing UI panels
- `layer_shift` - Reality/virtual blend controls

### 8. AR Geo-Commerce (`8-ar-geo-commerce.holo`)

**Geo-anchored commerce** with x402 micropayments and business markers:

- Geo bridge contract with high-accuracy location services
- Business markers bound to real-world lat/lon coordinates
- Geo-anchored offers triggered by radius entry
- x402 payment walls for on-chain USDC purchases
- Offer overlays with embedded payment buttons
- 3D signage and navigation helpers at marker locations

**Key concepts:**

- `marker` - Business/geo point of interest
- `geo_anchor` - Radius-triggered spatial event
- `paywall` - x402 payment wall declaration
- `overlay` with `button` actions - Interactive commerce UI

## Running the Examples

These examples require the HoloScript compiler and Hololand runtime:

```bash
# Compile an example
holoscript compile examples/hololand/1-asset-manifest.holo

# Run in development mode
holoscript dev examples/hololand/4-integrated-experience.holo

# Build for production
holoscript build examples/hololand/3-world-definition.holo --platform quest
```

## Related Documentation

- [Hololand Integration Guide](../../docs/integration/HOLOLAND_INTEGRATION_GUIDE.md) - Complete API documentation
- [Graphics Integration](../../docs/integration/HOLOLAND_GRAPHICS_INTEGRATION.md) - Graphics pipeline details
- [Quick Reference Card](../../docs/QUICK_REFERENCE_CARD.md) - HoloScript syntax cheat sheet

## Feature Coverage

| Feature              | Ex 1 | Ex 2 | Ex 3 | Ex 4 | Ex 5 | Ex 6 | Ex 7 | Ex 8 |
| -------------------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Asset Manifest       | ✓    |      |      | ✓    |      |      |      |      |
| Asset Dependencies   | ✓    |      |      | ✓    |      |      |      |      |
| Semantic Annotations |      | ✓    |      | ✓    |      |      |      |      |
| Property Annotations |      | ✓    |      | ✓    |      |      |      |      |
| Data Bindings        |      | ✓    |      | ✓    |      |      |      |      |
| World Metadata       |      |      | ✓    | ✓    |      |      |      |      |
| World Config         |      |      | ✓    | ✓    |      |      |      |      |
| Zones                |      |      | ✓    | ✓    |      |      |      |      |
| Spawn Points         |      |      | ✓    | ✓    |      |      |      |      |
| Hololand Events      |      |      | ✓    | ✓    |      |      |      |      |
| NPC Behaviors        |      |      |      | ✓    |      |      |      |      |
| LOD System           |      |      | ✓    | ✓    |      |      |      |      |
| Accessibility        |      |      |      | ✓    |      |      |      |      |
| AR Bridge Contract   |      |      |      |      | ✓    | ✓    | ✓    | ✓    |
| AR Capability Bind   |      |      |      |      | ✓    | ✓    | ✓    | ✓    |
| WebXR Adapter        |      |      |      |      |      | ✓    |      |      |
| Hit-Test / Anchors   |      |      |      |      | ✓    | ✓    |      |      |
| QR / Image Beacons   |      |      |      |      |      |      | ✓    |      |
| Portal / Overlay     |      |      |      |      |      |      | ✓    |      |
| Geo Anchor           |      |      |      |      |      |      |      | ✓    |
| x402 Paywall         |      |      |      |      |      |      |      | ✓    |
| Business Marker      |      |      |      |      |      |      |      | ✓    |
