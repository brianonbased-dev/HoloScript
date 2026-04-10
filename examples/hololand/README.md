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

| Feature              | Example 1 | Example 2 | Example 3 | Example 4 |
| -------------------- | --------- | --------- | --------- | --------- |
| Asset Manifest       | ✓         |           |           | ✓         |
| Asset Dependencies   | ✓         |           |           | ✓         |
| Semantic Annotations |           | ✓         |           | ✓         |
| Property Annotations |           | ✓         |           | ✓         |
| Data Bindings        |           | ✓         |           | ✓         |
| World Metadata       |           |           | ✓         | ✓         |
| World Config         |           |           | ✓         | ✓         |
| Zones                |           |           | ✓         | ✓         |
| Spawn Points         |           |           | ✓         | ✓         |
| Hololand Events      |           |           | ✓         | ✓         |
| NPC Behaviors        |           |           |           | ✓         |
| LOD System           |           |           | ✓         | ✓         |
| Accessibility        |           |           |           | ✓         |
