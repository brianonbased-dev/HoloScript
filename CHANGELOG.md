# Changelog

## [4.2.0] — 2026-03-01 (Perception & Simulation Layer)

### tree-sitter-holoscript 2.0.0 (updated)
- **12 simulation grammar constructs**: material_block (PBR/unlit/shader + texture_map + shader_connection), collider_block, rigidbody_block, force_field_block, articulation_block (with joint_block), particle_block (with particle_module), post_processing_block (with post_effect), audio_source_block, weather_block (with weather_layer), procedural_block (with noise_function + biome_rule), lod_block (with lod_level), navigation_block (with behavior_node), input_block (with input_binding), render_hints, annotation

### @holoscript/core 4.2.0
- **29 simulation token types** + **55 simulation keywords** synced
- **10 new domain categories** in HoloDomainType: material, physics, vfx, postfx, audio, weather, procedural, rendering, navigation, input
- All simulation blocks route through unified `parseDomainBlock()`

### Examples
- `examples/showcase/realistic-forest.holo` — 400+ line realistic simulation showcase

---

## [4.0.0] — 2026-03-01 (Multi-Domain Expansion)

### tree-sitter-holoscript 2.0.0
- **20+ HSPlus constructs**: `module`, `struct`, `enum`, `interface`, `import/export`, `function`, `variable_declaration`, `for_of`, `try/catch`, `throw`, `switch/case`, `await`, `new`, `optional_chain`, `generic_type`, `trait_with_body`, `decorator_event_handler`
- **8 domain-specific blocks**: IoT, Robotics, DataViz, Education, Healthcare, Music, Architecture, Web3 (72 keywords total)
- **Extensible `custom_block`**: Any identifier as a block keyword via `prec(-1)` catch-all
- **Spatial primitives**: `spawn_group`, `waypoints`, `constraint`, `terrain`
- **Dialog system**: `dialog` blocks with `option` nodes

### @holoscript/core 4.0.0
- **Parser sync**: `HoloCompositionParser` now handles all new constructs
- **62 new token types**: HSPlus + domain blocks + spatial primitives
- **100+ keywords**: Full domain block keyword vocabulary
- **AST types**: `HoloDomainBlock` (unified: IoT/Robotics/DataViz/Education/Healthcare/Music/Architecture/Web3/custom), `HoloSpawnGroup`, `HoloWaypoints`, `HoloConstraintBlock`, `HoloTerrainBlock`
- **Parse methods**: `parseDomainBlock()`, `parseSpawnGroup()`, `parseWaypointsBlock()`, `parseConstraintBlock()`, `parseTerrainBlock()`

### Examples
- `examples/showcase/spatial-rpg.holo` — 456-line gaming/spatial showcase
- `examples/showcase/multi-domain.holo` — 300+ line multi-domain showcase

### TrainingMonkey
- 72 new domain block keywords in `holoscript-constants.ts`
- `.hsplus` file support in extractor
