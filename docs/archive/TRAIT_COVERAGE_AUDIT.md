# HoloScript Trait Coverage Audit

**Generated**: 2026-03-06
**Files Scanned**: 98 .holo files across `examples/` and `packages/components/`
**Unique Traits Used in Examples**: 192

---

## Executive Summary

- **Total Defined Traits (audited)**: 867
- **Traits With Example Coverage**: 79
- **Traits Without Coverage**: 788
- **Overall Coverage**: 9.1%

## Coverage Summary by Category

| Category                       | Total | Covered | Uncovered | Coverage |
| ------------------------------ | ----- | ------- | --------- | -------- |
| Accessibility (Core 10)        | 10    | 7       | 3         | 70% +    |
| Accessibility (Extended 27)    | 27    | 1       | 26        | 4% ~     |
| Core VR Interaction (13)       | 13    | 8       | 5         | 62% +    |
| Object Interaction (25)        | 25    | 2       | 23        | 8% ~     |
| Physics Expansion (8)          | 8     | 2       | 6         | 25% ~    |
| Networking & AI (27)           | 27    | 2       | 25        | 7% ~     |
| Audio (10)                     | 10    | 4       | 6         | 40% ~    |
| Environment & Input (15)       | 15    | 4       | 11        | 27% ~    |
| Parser Core & UI (18)          | 18    | 5       | 13        | 28% ~    |
| XR Platform (35)               | 35    | 0       | 35        | 0% !     |
| Visual Effects (30)            | 30    | 6       | 24        | 20% ~    |
| Intelligence & Behavior (40)   | 40    | 1       | 39        | 2% ~     |
| IoT & Autonomous Agents (31)   | 31    | 12      | 19        | 39% ~    |
| Geospatial & Web3 (12)         | 12    | 4       | 8         | 33% ~    |
| Rendering (24)                 | 24    | 0       | 24        | 0% !     |
| Lighting (28)                  | 28    | 0       | 28        | 0% !     |
| Volumetric & WebGPU (13)       | 13    | 1       | 12        | 8% ~     |
| Interop & Co-Presence (15)     | 15    | 1       | 14        | 7% ~     |
| Simple Modifiers (8)           | 8     | 7       | 1         | 88% +    |
| Game Mechanics (31)            | 31    | 1       | 30        | 3% ~     |
| Safety & Boundaries (14)       | 14    | 2       | 12        | 14% ~    |
| Locomotion & Movement (14)     | 14    | 1       | 13        | 7% ~     |
| State & Persistence (17)       | 17    | 0       | 17        | 0% !     |
| Emotion & Mood (20)            | 20    | 0       | 20        | 0% !     |
| Multisensory & Haptic (16)     | 16    | 0       | 16        | 0% !     |
| Social & Commerce (12)         | 12    | 0       | 12        | 0% !     |
| Social & Effects (8)           | 8     | 0       | 8         | 0% !     |
| Weather Particles (12)         | 12    | 0       | 12        | 0% !     |
| Weather Phenomena (28)         | 28    | 0       | 28        | 0% !     |
| Procedural Generation (25)     | 25    | 0       | 25        | 0% !     |
| Narrative & Storytelling (12)  | 12    | 0       | 12        | 0% !     |
| Enterprise Multitenancy (19)   | 19    | 0       | 19        | 0% !     |
| Analytics & Observability (16) | 16    | 0       | 16        | 0% !     |
| Security & Crypto (Selected 7) | 7     | 0       | 7         | 0% !     |
| Physical Affordances (22)      | 22    | 0       | 22        | 0% !     |
| NPC Roles (63)                 | 62    | 0       | 62        | 0% !     |
| Healthcare & Medical (31)      | 31    | 2       | 29        | 6% ~     |
| Education & Learning (42)      | 39    | 4       | 35        | 10% ~    |
| Data Visualization (46)        | 45    | 2       | 43        | 4% ~     |
| Scientific Computing (28)      | 28    | 0       | 28        | 0% !     |

Legend: V = 100%, + = 50-99%, ~ = 1-49%, ! = 0%

---

## Detailed Trait Coverage by Category

### Accessibility (Core 10) -- 7/10 (70%)

| Trait               | Status        | Example File(s)                                    |
| ------------------- | ------------- | -------------------------------------------------- |
| `accessible`        | COVERED       | `examples\accessibility\wcag-compliant-scene.holo` |
| `alt_text`          | COVERED       | `examples\accessibility\wcag-compliant-scene.holo` |
| `spatial_audio_cue` | **UNCOVERED** | --                                                 |
| `sonification`      | **UNCOVERED** | --                                                 |
| `haptic_cue`        | COVERED       | `examples\accessibility\wcag-compliant-scene.holo` |
| `magnifiable`       | **UNCOVERED** | --                                                 |
| `high_contrast`     | COVERED       | `examples\accessibility\wcag-compliant-scene.holo` |
| `motion_reduced`    | COVERED       | `examples\accessibility\wcag-compliant-scene.holo` |
| `subtitle`          | COVERED       | `examples\accessibility\wcag-compliant-scene.holo` |
| `screen_reader`     | COVERED       | `examples\accessibility\wcag-compliant-scene.holo` |

### Accessibility (Extended 27) -- 1/27 (4%)

| Trait                   | Status        | Example File(s)                       |
| ----------------------- | ------------- | ------------------------------------- |
| `cognitive_assist`      | **UNCOVERED** | --                                    |
| `sensory_substitution`  | **UNCOVERED** | --                                    |
| `one_handed`            | **UNCOVERED** | --                                    |
| `seated_mode`           | **UNCOVERED** | --                                    |
| `standing_mode`         | **UNCOVERED** | --                                    |
| `voice_only`            | **UNCOVERED** | --                                    |
| `gaze_only`             | **UNCOVERED** | --                                    |
| `switch_access`         | **UNCOVERED** | --                                    |
| `large_text`            | **UNCOVERED** | --                                    |
| `dyslexia_friendly`     | **UNCOVERED** | --                                    |
| `color_blind_safe`      | **UNCOVERED** | --                                    |
| `photosensitive_safe`   | **UNCOVERED** | --                                    |
| `reduced_complexity`    | **UNCOVERED** | --                                    |
| `guided_mode`           | **UNCOVERED** | --                                    |
| `auto_narrate`          | **UNCOVERED** | --                                    |
| `sign_language`         | **UNCOVERED** | --                                    |
| `braille_output`        | **UNCOVERED** | --                                    |
| `audio_description`     | **UNCOVERED** | --                                    |
| `closed_caption`        | **UNCOVERED** | --                                    |
| `adjustable_speed`      | **UNCOVERED** | --                                    |
| `adjustable_difficulty` | **UNCOVERED** | --                                    |
| `comfort_mode`          | COVERED       | `examples\showcase\multi-domain.holo` |
| `teleport_only`         | **UNCOVERED** | --                                    |
| `snap_turning`          | **UNCOVERED** | --                                    |
| `continuous_turning`    | **UNCOVERED** | --                                    |
| `vignette`              | **UNCOVERED** | --                                    |
| `stable_horizon`        | **UNCOVERED** | --                                    |

### Core VR Interaction (13) -- 8/13 (62%)

| Trait          | Status        | Example File(s)                                                                                                                                                                                    |
| -------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grabbable`    | COVERED       | `examples\TEMPLATE\template.holo`, `examples\ai-generation\examples\enchanted-forest.holo`, `examples\brian-token.holo` (+35 more)                                                                 |
| `throwable`    | COVERED       | `examples\TEMPLATE\template.holo`, `examples\general\vr-game-demo\target-practice.holo`, `examples\perception-tests\06-integrated-perception-stack.holo` (+8 more)                                 |
| `pointable`    | COVERED       | `examples\TEMPLATE\template.holo`, `examples\ai-generation\examples\enchanted-forest.holo`, `examples\brittney-workspace.holo` (+15 more)                                                          |
| `hoverable`    | COVERED       | `examples\brittney-workspace.holo`, `examples\sample-projects\art-gallery.holo`, `examples\templates\sovereign-settlement.holo` (+7 more)                                                          |
| `scalable`     | COVERED       | `examples\domain-starters\healthcare\healthcare-starter.holo`, `examples\general\ar-furniture-preview\furniture-catalog.holo`, `examples\platforms\android-ar-app.holo` (+5 more)                  |
| `rotatable`    | COVERED       | `examples\domain-starters\healthcare\healthcare-starter.holo`, `examples\domain-starters\robotics\robotics-starter.holo`, `examples\general\ar-furniture-preview\furniture-catalog.holo` (+8 more) |
| `stackable`    | COVERED       | `examples\sample-projects\physics-playground.holo`                                                                                                                                                 |
| `snappable`    | **UNCOVERED** | --                                                                                                                                                                                                 |
| `breakable`    | COVERED       | `examples\sample-projects\physics-playground.holo`                                                                                                                                                 |
| `stretchable`  | **UNCOVERED** | --                                                                                                                                                                                                 |
| `moldable`     | **UNCOVERED** | --                                                                                                                                                                                                 |
| `timeline`     | **UNCOVERED** | --                                                                                                                                                                                                 |
| `choreography` | **UNCOVERED** | --                                                                                                                                                                                                 |

### Object Interaction (25) -- 2/25 (8%)

| Trait        | Status        | Example File(s)                                                                                                                       |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `openable`   | **UNCOVERED** | --                                                                                                                                    |
| `closable`   | **UNCOVERED** | --                                                                                                                                    |
| `lockable`   | **UNCOVERED** | --                                                                                                                                    |
| `unlockable` | **UNCOVERED** | --                                                                                                                                    |
| `pushable`   | COVERED       | `examples\platforms\godot-scene.holo`                                                                                                 |
| `pullable`   | **UNCOVERED** | --                                                                                                                                    |
| `liftable`   | **UNCOVERED** | --                                                                                                                                    |
| `carryable`  | **UNCOVERED** | --                                                                                                                                    |
| `wearable`   | **UNCOVERED** | --                                                                                                                                    |
| `equippable` | COVERED       | `packages\components\weapons\bow.holo`, `packages\components\weapons\hammer.holo`, `packages\components\weapons\spear.holo` (+2 more) |
| `consumable` | **UNCOVERED** | --                                                                                                                                    |
| `craftable`  | **UNCOVERED** | --                                                                                                                                    |
| `combinable` | **UNCOVERED** | --                                                                                                                                    |
| `splittable` | **UNCOVERED** | --                                                                                                                                    |
| `foldable`   | **UNCOVERED** | --                                                                                                                                    |
| `fillable`   | **UNCOVERED** | --                                                                                                                                    |
| `pourable`   | **UNCOVERED** | --                                                                                                                                    |
| `readable`   | **UNCOVERED** | --                                                                                                                                    |
| `writable`   | **UNCOVERED** | --                                                                                                                                    |
| `paintable`  | **UNCOVERED** | --                                                                                                                                    |
| `cuttable`   | **UNCOVERED** | --                                                                                                                                    |
| `toggleable` | **UNCOVERED** | --                                                                                                                                    |
| `tunable`    | **UNCOVERED** | --                                                                                                                                    |
| `insertable` | **UNCOVERED** | --                                                                                                                                    |
| `removable`  | **UNCOVERED** | --                                                                                                                                    |

### Physics Expansion (8) -- 2/8 (25%)

| Trait         | Status        | Example File(s)                                    |
| ------------- | ------------- | -------------------------------------------------- |
| `cloth`       | COVERED       | `examples\sample-projects\physics-playground.holo` |
| `fluid`       | **UNCOVERED** | --                                                 |
| `soft_body`   | **UNCOVERED** | --                                                 |
| `rope`        | **UNCOVERED** | --                                                 |
| `chain`       | **UNCOVERED** | --                                                 |
| `wind`        | COVERED       | `examples\sample-projects\physics-playground.holo` |
| `buoyancy`    | **UNCOVERED** | --                                                 |
| `destruction` | **UNCOVERED** | --                                                 |

### Networking & AI (27) -- 2/27 (7%)

| Trait                  | Status        | Example File(s)                                                                                                                             |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `networked`            | COVERED       | `examples\hololand\codebase-health-dashboard.holo`, `examples\hololand\hub_gallery.holo`, `examples\hololand\roadmap_center.holo` (+8 more) |
| `proactive`            | **UNCOVERED** | --                                                                                                                                          |
| `ai_driven`            | **UNCOVERED** | --                                                                                                                                          |
| `agent_protocol`       | **UNCOVERED** | --                                                                                                                                          |
| `narrator`             | **UNCOVERED** | --                                                                                                                                          |
| `responsive`           | **UNCOVERED** | --                                                                                                                                          |
| `procedural`           | **UNCOVERED** | --                                                                                                                                          |
| `captioned`            | **UNCOVERED** | --                                                                                                                                          |
| `collaborative_sculpt` | **UNCOVERED** | --                                                                                                                                          |
| `fabrication_queue`    | **UNCOVERED** | --                                                                                                                                          |
| `print_vote`           | **UNCOVERED** | --                                                                                                                                          |
| `design_fork`          | **UNCOVERED** | --                                                                                                                                          |
| `llm_agent`            | COVERED       | `examples\IndustrialExpansionPOC.holo`, `examples\SwarmMasteryDemo.holo`, `examples\templates\agentic-mitosis.holo`                         |
| `neural_link`          | **UNCOVERED** | --                                                                                                                                          |
| `neural_forge`         | **UNCOVERED** | --                                                                                                                                          |
| `vision`               | **UNCOVERED** | --                                                                                                                                          |
| `stable_diffusion`     | **UNCOVERED** | --                                                                                                                                          |
| `controlnet`           | **UNCOVERED** | --                                                                                                                                          |
| `ai_texture_gen`       | **UNCOVERED** | --                                                                                                                                          |
| `diffusion_realtime`   | **UNCOVERED** | --                                                                                                                                          |
| `ai_inpainting`        | **UNCOVERED** | --                                                                                                                                          |
| `ai_upscaling`         | **UNCOVERED** | --                                                                                                                                          |
| `memory`               | **UNCOVERED** | --                                                                                                                                          |
| `vector_db`            | **UNCOVERED** | --                                                                                                                                          |
| `rag_knowledge`        | **UNCOVERED** | --                                                                                                                                          |
| `embedding_search`     | **UNCOVERED** | --                                                                                                                                          |
| `ai_npc_brain`         | **UNCOVERED** | --                                                                                                                                          |

### Audio (10) -- 4/10 (40%)

| Trait                | Status        | Example File(s)                                                                                                                                              |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spatial_audio`      | COVERED       | `examples\brittney-avatar.holo`, `examples\platforms\androidxr-app.holo`, `examples\platforms\vrchat-world.holo` (+14 more)                                  |
| `voice`              | **UNCOVERED** | --                                                                                                                                                           |
| `reactive_audio`     | **UNCOVERED** | --                                                                                                                                                           |
| `ambisonics`         | COVERED       | `examples\showcase\multi-domain.holo`                                                                                                                        |
| `hrtf`               | COVERED       | `examples\perception-tests\05-audio-blocks.holo`, `examples\perception-tests\06-integrated-perception-stack.holo`, `examples\showcase\realistic-forest.holo` |
| `reverb_zone`        | COVERED       | `examples\sample-projects\multiplayer-room.holo`                                                                                                             |
| `audio_occlusion`    | **UNCOVERED** | --                                                                                                                                                           |
| `audio_portal`       | **UNCOVERED** | --                                                                                                                                                           |
| `audio_material`     | **UNCOVERED** | --                                                                                                                                                           |
| `head_tracked_audio` | **UNCOVERED** | --                                                                                                                                                           |

### Environment & Input (15) -- 4/15 (27%)

| Trait               | Status        | Example File(s)                                                                                                                                         |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plane_detection`   | **UNCOVERED** | --                                                                                                                                                      |
| `mesh_detection`    | **UNCOVERED** | --                                                                                                                                                      |
| `anchor`            | COVERED       | `examples\domain-starters\healthcare\healthcare-starter.holo`, `examples\platforms\android-ar-app.holo`, `examples\platforms\ios-ar-app.holo` (+1 more) |
| `persistent_anchor` | **UNCOVERED** | --                                                                                                                                                      |
| `shared_anchor`     | **UNCOVERED** | --                                                                                                                                                      |
| `geospatial`        | **UNCOVERED** | --                                                                                                                                                      |
| `occlusion`         | **UNCOVERED** | --                                                                                                                                                      |
| `light_estimation`  | **UNCOVERED** | --                                                                                                                                                      |
| `eye_tracking`      | **UNCOVERED** | --                                                                                                                                                      |
| `hand_tracking`     | COVERED       | `examples\perception-tests\07-cross-reality-agent-continuity.holo`, `examples\showcase\multi-domain.holo`                                               |
| `controller`        | COVERED       | `examples\platforms\openxr-app.holo`                                                                                                                    |
| `spatial_accessory` | **UNCOVERED** | --                                                                                                                                                      |
| `body_tracking`     | **UNCOVERED** | --                                                                                                                                                      |
| `face_tracking`     | **UNCOVERED** | --                                                                                                                                                      |
| `haptic`            | COVERED       | `examples\accessibility\wcag-compliant-scene.holo`, `examples\real-world\medical-training.holo`, `examples\showcase\multi-domain.holo`                  |

### Parser Core & UI (18) -- 5/18 (28%)

| Trait          | Status        | Example File(s)                                                                                                                                               |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `physics`      | COVERED       | `examples\TEMPLATE\template.holo`, `examples\domain-starters\robotics\robotics-starter.holo`, `examples\general\vr-game-demo\target-practice.holo` (+30 more) |
| `draggable`    | COVERED       | `examples\platforms\android-ar-app.holo`, `packages\components\ui\inventory.holo`                                                                             |
| `static`       | COVERED       | `examples\brittney-workspace.holo`, `examples\world-builder.holo`                                                                                             |
| `kinematic`    | COVERED       | `examples\perception-tests\02-physics-blocks.holo`                                                                                                            |
| `local_only`   | **UNCOVERED** | --                                                                                                                                                            |
| `visible`      | **UNCOVERED** | --                                                                                                                                                            |
| `invisible`    | **UNCOVERED** | --                                                                                                                                                            |
| `audio`        | **UNCOVERED** | --                                                                                                                                                            |
| `portal`       | COVERED       | `examples\hololand\hub_gallery.holo`, `examples\platforms\visionos-app.holo`, `examples\platforms\vrchat-world.holo` (+1 more)                                |
| `vr_only`      | **UNCOVERED** | --                                                                                                                                                            |
| `ar_only`      | **UNCOVERED** | --                                                                                                                                                            |
| `desktop_only` | **UNCOVERED** | --                                                                                                                                                            |
| `ui_floating`  | **UNCOVERED** | --                                                                                                                                                            |
| `ui_anchored`  | **UNCOVERED** | --                                                                                                                                                            |
| `ui_hand_menu` | **UNCOVERED** | --                                                                                                                                                            |
| `ui_billboard` | **UNCOVERED** | --                                                                                                                                                            |
| `ui_curved`    | **UNCOVERED** | --                                                                                                                                                            |
| `ui_docked`    | **UNCOVERED** | --                                                                                                                                                            |

### XR Platform (35) -- 0/35 (0%)

| Trait                  | Status        | Example File(s) |
| ---------------------- | ------------- | --------------- |
| `passthrough`          | **UNCOVERED** | --              |
| `room_scale`           | **UNCOVERED** | --              |
| `world_scale`          | **UNCOVERED** | --              |
| `tabletop_scale`       | **UNCOVERED** | --              |
| `shared_space`         | **UNCOVERED** | --              |
| `persistent_world`     | **UNCOVERED** | --              |
| `cross_platform`       | **UNCOVERED** | --              |
| `webxr`                | **UNCOVERED** | --              |
| `openxr`               | **UNCOVERED** | --              |
| `arkit`                | **UNCOVERED** | --              |
| `arcore`               | **UNCOVERED** | --              |
| `visionos`             | **UNCOVERED** | --              |
| `quest_native`         | **UNCOVERED** | --              |
| `pcvr`                 | **UNCOVERED** | --              |
| `mobile_ar`            | **UNCOVERED** | --              |
| `headset_only`         | **UNCOVERED** | --              |
| `controller_required`  | **UNCOVERED** | --              |
| `hands_only`           | **UNCOVERED** | --              |
| `seated_experience`    | **UNCOVERED** | --              |
| `standing_experience`  | **UNCOVERED** | --              |
| `room_boundary`        | **UNCOVERED** | --              |
| `guardian_system`      | **UNCOVERED** | --              |
| `mixed_reality`        | **UNCOVERED** | --              |
| `diminished_reality`   | **UNCOVERED** | --              |
| `augmented_virtuality` | **UNCOVERED** | --              |
| `spatial_awareness`    | **UNCOVERED** | --              |
| `shared_world`         | **UNCOVERED** | --              |
| `spatial_persona`      | **UNCOVERED** | --              |
| `shareplay`            | **UNCOVERED** | --              |
| `object_tracking`      | **UNCOVERED** | --              |
| `scene_reconstruction` | **UNCOVERED** | --              |
| `realitykit_mesh`      | **UNCOVERED** | --              |
| `room_mesh`            | **UNCOVERED** | --              |
| `volumetric_window`    | **UNCOVERED** | --              |
| `spatial_navigation`   | **UNCOVERED** | --              |

### Visual Effects (30) -- 6/30 (20%)

| Trait            | Status        | Example File(s)                                                                                                                                                      |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transparent`    | COVERED       | `examples\perception-tests\01-material-blocks.holo`, `examples\perception-tests\06-integrated-perception-stack.holo`, `packages\components\environmental\water.holo` |
| `reflective`     | COVERED       | `packages\components\environmental\water.holo`                                                                                                                       |
| `emissive`       | COVERED       | `examples\platforms\unreal-scene.holo`, `packages\components\environmental\fire.holo`, `packages\components\environmental\portal.holo` (+1 more)                     |
| `spinning`       | COVERED       | `examples\sample-projects\art-gallery.holo`                                                                                                                          |
| `floating`       | COVERED       | `examples\sample-projects\art-gallery.holo`                                                                                                                          |
| `pulsing`        | **UNCOVERED** | --                                                                                                                                                                   |
| `blinking`       | **UNCOVERED** | --                                                                                                                                                                   |
| `fading`         | **UNCOVERED** | --                                                                                                                                                                   |
| `color_shifting` | **UNCOVERED** | --                                                                                                                                                                   |
| `holographic`    | **UNCOVERED** | --                                                                                                                                                                   |
| `outlined`       | **UNCOVERED** | --                                                                                                                                                                   |
| `x_ray`          | **UNCOVERED** | --                                                                                                                                                                   |
| `neon_glow`      | **UNCOVERED** | --                                                                                                                                                                   |
| `iridescent`     | **UNCOVERED** | --                                                                                                                                                                   |
| `frosted`        | **UNCOVERED** | --                                                                                                                                                                   |
| `luminous`       | **UNCOVERED** | --                                                                                                                                                                   |
| `camouflaged`    | **UNCOVERED** | --                                                                                                                                                                   |
| `mirrored`       | **UNCOVERED** | --                                                                                                                                                                   |
| `pixelated`      | **UNCOVERED** | --                                                                                                                                                                   |
| `dissolving`     | **UNCOVERED** | --                                                                                                                                                                   |
| `crystalline`    | **UNCOVERED** | --                                                                                                                                                                   |
| `ethereal`       | **UNCOVERED** | --                                                                                                                                                                   |
| `smoky`          | **UNCOVERED** | --                                                                                                                                                                   |
| `fiery`          | **UNCOVERED** | --                                                                                                                                                                   |
| `electric_arc`   | **UNCOVERED** | --                                                                                                                                                                   |
| `ghostly`        | **UNCOVERED** | --                                                                                                                                                                   |
| `rainbow`        | **UNCOVERED** | --                                                                                                                                                                   |
| `metallic_sheen` | **UNCOVERED** | --                                                                                                                                                                   |
| `ink_wash`       | **UNCOVERED** | --                                                                                                                                                                   |
| `cel_shaded`     | COVERED       | `examples\perception-tests\01-material-blocks.holo`, `examples\perception-tests\06-integrated-perception-stack.holo`                                                 |

### Intelligence & Behavior (40) -- 1/40 (2%)

| Trait             | Status        | Example File(s)                           |
| ----------------- | ------------- | ----------------------------------------- |
| `autonomous`      | **UNCOVERED** | --                                        |
| `scripted`        | **UNCOVERED** | --                                        |
| `adaptive`        | **UNCOVERED** | --                                        |
| `pathfinding`     | **UNCOVERED** | --                                        |
| `flocking`        | **UNCOVERED** | --                                        |
| `swarming`        | **UNCOVERED** | --                                        |
| `conversational`  | **UNCOVERED** | --                                        |
| `teachable`       | **UNCOVERED** | --                                        |
| `tameable`        | **UNCOVERED** | --                                        |
| `friendly`        | **UNCOVERED** | --                                        |
| `hostile`         | **UNCOVERED** | --                                        |
| `neutral`         | **UNCOVERED** | --                                        |
| `territorial`     | **UNCOVERED** | --                                        |
| `nocturnal`       | **UNCOVERED** | --                                        |
| `migratory`       | **UNCOVERED** | --                                        |
| `predator`        | **UNCOVERED** | --                                        |
| `prey`            | **UNCOVERED** | --                                        |
| `pack_animal`     | **UNCOVERED** | --                                        |
| `solitary`        | **UNCOVERED** | --                                        |
| `curious`         | **UNCOVERED** | --                                        |
| `fearful`         | **UNCOVERED** | --                                        |
| `aggressive`      | **UNCOVERED** | --                                        |
| `passive`         | **UNCOVERED** | --                                        |
| `protective`      | **UNCOVERED** | --                                        |
| `playful`         | **UNCOVERED** | --                                        |
| `mischievous`     | **UNCOVERED** | --                                        |
| `wise`            | **UNCOVERED** | --                                        |
| `ancient`         | **UNCOVERED** | --                                        |
| `baby`            | **UNCOVERED** | --                                        |
| `elder`           | **UNCOVERED** | --                                        |
| `legendary`       | **UNCOVERED** | --                                        |
| `mythical`        | **UNCOVERED** | --                                        |
| `mechanical`      | **UNCOVERED** | --                                        |
| `organic`         | **UNCOVERED** | --                                        |
| `hybrid`          | **UNCOVERED** | --                                        |
| `shapeshifter`    | **UNCOVERED** | --                                        |
| `invisible_agent` | **UNCOVERED** | --                                        |
| `omniscient`      | **UNCOVERED** | --                                        |
| `behavior_tree`   | COVERED       | `examples\templates\agentic-mitosis.holo` |
| `goal_oriented`   | **UNCOVERED** | --                                        |

### IoT & Autonomous Agents (31) -- 12/31 (39%)

| Trait              | Status        | Example File(s)                                                                                                                  |
| ------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `sensor`           | COVERED       | `examples\specialized\robotics\robot-arm-simulation.holo`, `examples\templates\industrial-actuators.holo`                        |
| `digital_twin`     | COVERED       | `examples\IndustrialExpansionPOC.holo`, `examples\templates\industrial-actuators.holo`                                           |
| `twin_sync`        | COVERED       | `examples\IndustrialExpansionPOC.holo`, `examples\hololand\roadmap_center.holo`, `examples\showcase\multi-domain.holo` (+1 more) |
| `twin_actuator`    | COVERED       | `examples\templates\industrial-actuators.holo`                                                                                   |
| `data_binding`     | COVERED       | `examples\hololand\codebase-health-dashboard.holo`, `examples\showcase\multi-domain.holo`                                        |
| `alert`            | **UNCOVERED** | --                                                                                                                               |
| `heatmap_3d`       | **UNCOVERED** | --                                                                                                                               |
| `perception`       | COVERED       | `examples\IndustrialExpansionPOC.holo`, `examples\templates\agentic-mitosis.holo`                                                |
| `emotion`          | **UNCOVERED** | --                                                                                                                               |
| `dialogue`         | COVERED       | `examples\showcase\spatial-rpg.holo`                                                                                             |
| `faction`          | **UNCOVERED** | --                                                                                                                               |
| `patrol`           | **UNCOVERED** | --                                                                                                                               |
| `mitosis`          | COVERED       | `examples\SwarmMasteryDemo.holo`, `examples\templates\agentic-mitosis.holo`                                                      |
| `agent_spawner`    | **UNCOVERED** | --                                                                                                                               |
| `delegation`       | **UNCOVERED** | --                                                                                                                               |
| `command`          | **UNCOVERED** | --                                                                                                                               |
| `dtdl_interface`   | **UNCOVERED** | --                                                                                                                               |
| `telemetry`        | COVERED       | `examples\showcase\multi-domain.holo`                                                                                            |
| `iot_bridge`       | COVERED       | `examples\showcase\multi-domain.holo`                                                                                            |
| `matter_device`    | COVERED       | `examples\showcase\multi-domain.holo`                                                                                            |
| `bluetooth_device` | **UNCOVERED** | --                                                                                                                               |
| `usb_device`       | **UNCOVERED** | --                                                                                                                               |
| `octoprint_device` | **UNCOVERED** | --                                                                                                                               |
| `home_assistant`   | **UNCOVERED** | --                                                                                                                               |
| `device_registry`  | **UNCOVERED** | --                                                                                                                               |
| `smart_light`      | **UNCOVERED** | --                                                                                                                               |
| `smart_plug`       | **UNCOVERED** | --                                                                                                                               |
| `smart_speaker`    | **UNCOVERED** | --                                                                                                                               |
| `smart_display`    | **UNCOVERED** | --                                                                                                                               |
| `smart_lock`       | **UNCOVERED** | --                                                                                                                               |
| `climate_control`  | COVERED       | `examples\showcase\multi-domain.holo`                                                                                            |

### Geospatial & Web3 (12) -- 4/12 (33%)

| Trait               | Status        | Example File(s)                                |
| ------------------- | ------------- | ---------------------------------------------- |
| `geospatial_anchor` | **UNCOVERED** | --                                             |
| `terrain_anchor`    | **UNCOVERED** | --                                             |
| `rooftop_anchor`    | **UNCOVERED** | --                                             |
| `vps`               | **UNCOVERED** | --                                             |
| `poi`               | **UNCOVERED** | --                                             |
| `nft`               | COVERED       | `examples\templates\sovereign-settlement.holo` |
| `token_gated`       | COVERED       | `examples\templates\sovereign-settlement.holo` |
| `wallet`            | COVERED       | `examples\templates\sovereign-settlement.holo` |
| `marketplace`       | COVERED       | `examples\templates\sovereign-settlement.holo` |
| `portable`          | **UNCOVERED** | --                                             |
| `bonding_curve`     | **UNCOVERED** | --                                             |
| `zora_coins`        | **UNCOVERED** | --                                             |

### Rendering (24) -- 0/24 (0%)

| Trait                   | Status        | Example File(s) |
| ----------------------- | ------------- | --------------- |
| `advanced_pbr`          | **UNCOVERED** | --              |
| `clearcoat`             | **UNCOVERED** | --              |
| `anisotropy`            | **UNCOVERED** | --              |
| `sheen`                 | **UNCOVERED** | --              |
| `subsurface_scattering` | **UNCOVERED** | --              |
| `sss_burley`            | **UNCOVERED** | --              |
| `sss_christensen`       | **UNCOVERED** | --              |
| `sss_random_walk`       | **UNCOVERED** | --              |
| `iridescence`           | **UNCOVERED** | --              |
| `transmission`          | **UNCOVERED** | --              |
| `dispersion`            | **UNCOVERED** | --              |
| `screen_space_effects`  | **UNCOVERED** | --              |
| `ssao`                  | **UNCOVERED** | --              |
| `ssr`                   | **UNCOVERED** | --              |
| `ssgi`                  | **UNCOVERED** | --              |
| `ssdo`                  | **UNCOVERED** | --              |
| `taa`                   | **UNCOVERED** | --              |
| `motion_blur`           | **UNCOVERED** | --              |
| `depth_of_field`        | **UNCOVERED** | --              |
| `dof_bokeh`             | **UNCOVERED** | --              |
| `chromatic_aberration`  | **UNCOVERED** | --              |
| `lens_flare`            | **UNCOVERED** | --              |
| `film_grain`            | **UNCOVERED** | --              |
| `post_processing_stack` | **UNCOVERED** | --              |

### Lighting (28) -- 0/28 (0%)

| Trait               | Status        | Example File(s) |
| ------------------- | ------------- | --------------- |
| `shadow_caster`     | **UNCOVERED** | --              |
| `light_source`      | **UNCOVERED** | --              |
| `spotlight`         | **UNCOVERED** | --              |
| `point_light`       | **UNCOVERED** | --              |
| `area_light`        | **UNCOVERED** | --              |
| `backlit`           | **UNCOVERED** | --              |
| `candlelight`       | **UNCOVERED** | --              |
| `torchlight`        | **UNCOVERED** | --              |
| `lantern`           | **UNCOVERED** | --              |
| `neon_sign`         | **UNCOVERED** | --              |
| `fluorescent`       | **UNCOVERED** | --              |
| `incandescent`      | **UNCOVERED** | --              |
| `led`               | **UNCOVERED** | --              |
| `strobe`            | **UNCOVERED** | --              |
| `blacklight`        | **UNCOVERED** | --              |
| `floodlight`        | **UNCOVERED** | --              |
| `chandelier`        | **UNCOVERED** | --              |
| `lamp`              | **UNCOVERED** | --              |
| `sconce`            | **UNCOVERED** | --              |
| `light_strip`       | **UNCOVERED** | --              |
| `projection`        | **UNCOVERED** | --              |
| `volumetric_light`  | **UNCOVERED** | --              |
| `caustics`          | **UNCOVERED** | --              |
| `god_rays`          | **UNCOVERED** | --              |
| `ambient_glow`      | **UNCOVERED** | --              |
| `flickering`        | **UNCOVERED** | --              |
| `dimmable`          | **UNCOVERED** | --              |
| `color_temperature` | **UNCOVERED** | --              |

### Volumetric & WebGPU (13) -- 1/13 (8%)

| Trait                 | Status        | Example File(s)                       |
| --------------------- | ------------- | ------------------------------------- |
| `gaussian_splat`      | **UNCOVERED** | --                                    |
| `nerf`                | **UNCOVERED** | --                                    |
| `volumetric_video`    | **UNCOVERED** | --                                    |
| `point_cloud`         | **UNCOVERED** | --                                    |
| `photogrammetry`      | **UNCOVERED** | --                                    |
| `compute`             | COVERED       | `examples\platforms\webgpu-demo.holo` |
| `gpu_particle`        | **UNCOVERED** | --                                    |
| `gpu_physics`         | **UNCOVERED** | --                                    |
| `gpu_buffer`          | **UNCOVERED** | --                                    |
| `photogrammetry_scan` | **UNCOVERED** | --                                    |
| `lidar_scan`          | **UNCOVERED** | --                                    |
| `print_twin`          | **UNCOVERED** | --                                    |
| `scan_to_sculpt`      | **UNCOVERED** | --                                    |

### Interop & Co-Presence (15) -- 1/15 (7%)

| Trait               | Status        | Example File(s)                                                    |
| ------------------- | ------------- | ------------------------------------------------------------------ |
| `usd`               | **UNCOVERED** | --                                                                 |
| `gltf`              | **UNCOVERED** | --                                                                 |
| `fbx`               | **UNCOVERED** | --                                                                 |
| `material_x`        | **UNCOVERED** | --                                                                 |
| `scene_graph`       | **UNCOVERED** | --                                                                 |
| `co_located`        | **UNCOVERED** | --                                                                 |
| `remote_presence`   | **UNCOVERED** | --                                                                 |
| `voice_proximity`   | **UNCOVERED** | --                                                                 |
| `avatar_embodiment` | COVERED       | `examples\perception-tests\07-cross-reality-agent-continuity.holo` |
| `lip_sync`          | **UNCOVERED** | --                                                                 |
| `emotion_directive` | **UNCOVERED** | --                                                                 |
| `stt`               | **UNCOVERED** | --                                                                 |
| `tts`               | **UNCOVERED** | --                                                                 |
| `spectator`         | **UNCOVERED** | --                                                                 |
| `role`              | **UNCOVERED** | --                                                                 |

### Simple Modifiers (8) -- 7/8 (88%)

| Trait         | Status        | Example File(s)                                                                                                                                                                    |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `animated`    | COVERED       | `examples\ai-generation\examples\enchanted-forest.holo`, `examples\brian-token.holo`, `examples\brittney-avatar.holo` (+23 more)                                                   |
| `billboard`   | COVERED       | `examples\brittney-avatar.holo`, `examples\brittney-workspace.holo`, `examples\domain-starters\healthcare\healthcare-starter.holo` (+10 more)                                      |
| `rotating`    | **UNCOVERED** | --                                                                                                                                                                                 |
| `collidable`  | COVERED       | `examples\TEMPLATE\template.holo`, `examples\accessibility\wcag-compliant-scene.holo`, `examples\ai-generation\examples\enchanted-forest.holo` (+51 more)                          |
| `clickable`   | COVERED       | `examples\TEMPLATE\template.holo`, `examples\domain-starters\healthcare\healthcare-starter.holo`, `examples\domain-starters\industrial-iot\industrial-iot-starter.holo` (+28 more) |
| `glowing`     | COVERED       | `examples\TEMPLATE\template.holo`, `examples\ai-generation\examples\enchanted-forest.holo`, `examples\brian-token.holo` (+38 more)                                                 |
| `interactive` | COVERED       | `examples\perception-tests\07-cross-reality-agent-continuity.holo`, `examples\showcase\multi-domain.holo`, `examples\showcase\spatial-rpg.holo`                                    |
| `lod`         | COVERED       | `examples\showcase\realistic-forest.holo`                                                                                                                                          |

### Game Mechanics (31) -- 1/31 (3%)

| Trait           | Status        | Example File(s)                      |
| --------------- | ------------- | ------------------------------------ |
| `collectible`   | **UNCOVERED** | --                                   |
| `spawnable`     | **UNCOVERED** | --                                   |
| `destructible`  | **UNCOVERED** | --                                   |
| `healable`      | **UNCOVERED** | --                                   |
| `damageable`    | **UNCOVERED** | --                                   |
| `explosive`     | **UNCOVERED** | --                                   |
| `flammable`     | **UNCOVERED** | --                                   |
| `freezable`     | **UNCOVERED** | --                                   |
| `electrifiable` | **UNCOVERED** | --                                   |
| `magnetic`      | **UNCOVERED** | --                                   |
| `poisonous`     | **UNCOVERED** | --                                   |
| `radioactive`   | **UNCOVERED** | --                                   |
| `fragile`       | **UNCOVERED** | --                                   |
| `repairable`    | **UNCOVERED** | --                                   |
| `upgradeable`   | **UNCOVERED** | --                                   |
| `lootable`      | **UNCOVERED** | --                                   |
| `quest_item`    | **UNCOVERED** | --                                   |
| `currency`      | **UNCOVERED** | --                                   |
| `ammunition`    | **UNCOVERED** | --                                   |
| `fuel`          | **UNCOVERED** | --                                   |
| `key_item`      | **UNCOVERED** | --                                   |
| `power_up`      | **UNCOVERED** | --                                   |
| `debuff`        | **UNCOVERED** | --                                   |
| `shield`        | **UNCOVERED** | --                                   |
| `weapon`        | **UNCOVERED** | --                                   |
| `armor`         | **UNCOVERED** | --                                   |
| `tool`          | COVERED       | `examples\platforms\openxr-app.holo` |
| `vehicle`       | **UNCOVERED** | --                                   |
| `projectile`    | **UNCOVERED** | --                                   |
| `trap`          | **UNCOVERED** | --                                   |
| `puzzle_piece`  | **UNCOVERED** | --                                   |

### Safety & Boundaries (14) -- 2/14 (14%)

| Trait            | Status        | Example File(s)                                                                                                                                |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `safe_zone`      | **UNCOVERED** | --                                                                                                                                             |
| `hazard`         | **UNCOVERED** | --                                                                                                                                             |
| `boundary`       | **UNCOVERED** | --                                                                                                                                             |
| `trigger`        | COVERED       | `examples\real-world\escape-room.holo`, `packages\components\environmental\fire.holo`, `packages\components\environmental\trap.holo` (+1 more) |
| `checkpoint`     | **UNCOVERED** | --                                                                                                                                             |
| `respawn`        | **UNCOVERED** | --                                                                                                                                             |
| `no_build`       | **UNCOVERED** | --                                                                                                                                             |
| `no_fly`         | **UNCOVERED** | --                                                                                                                                             |
| `pvp_zone`       | **UNCOVERED** | --                                                                                                                                             |
| `pve_zone`       | **UNCOVERED** | --                                                                                                                                             |
| `spectator_zone` | **UNCOVERED** | --                                                                                                                                             |
| `tutorial_zone`  | **UNCOVERED** | --                                                                                                                                             |
| `boss_arena`     | **UNCOVERED** | --                                                                                                                                             |
| `spawn_point`    | COVERED       | `examples\platforms\unreal-scene.holo`                                                                                                         |

### Locomotion & Movement (14) -- 1/14 (7%)

| Trait          | Status        | Example File(s)                                                                                                                       |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `rideable`     | **UNCOVERED** | --                                                                                                                                    |
| `driveable`    | **UNCOVERED** | --                                                                                                                                    |
| `mountable`    | **UNCOVERED** | --                                                                                                                                    |
| `climbable`    | **UNCOVERED** | --                                                                                                                                    |
| `swimmable`    | **UNCOVERED** | --                                                                                                                                    |
| `flyable`      | **UNCOVERED** | --                                                                                                                                    |
| `teleportable` | **UNCOVERED** | --                                                                                                                                    |
| `walkable`     | **UNCOVERED** | --                                                                                                                                    |
| `jumpable`     | **UNCOVERED** | --                                                                                                                                    |
| `sittable`     | COVERED       | `examples\accessibility\wcag-compliant-scene.holo`, `examples\sample-projects\multiplayer-room.holo`, `examples\vr-meeting-room.holo` |
| `crawlable`    | **UNCOVERED** | --                                                                                                                                    |
| `slidable`     | **UNCOVERED** | --                                                                                                                                    |
| `grindable`    | **UNCOVERED** | --                                                                                                                                    |
| `surfable`     | **UNCOVERED** | --                                                                                                                                    |

### State & Persistence (17) -- 0/17 (0%)

| Trait         | Status        | Example File(s) |
| ------------- | ------------- | --------------- |
| `saveable`    | **UNCOVERED** | --              |
| `restorable`  | **UNCOVERED** | --              |
| `timer`       | **UNCOVERED** | --              |
| `triggered`   | **UNCOVERED** | --              |
| `ephemeral`   | **UNCOVERED** | --              |
| `synced`      | **UNCOVERED** | --              |
| `versioned`   | **UNCOVERED** | --              |
| `undo_redo`   | **UNCOVERED** | --              |
| `conditional` | **UNCOVERED** | --              |
| `staged`      | **UNCOVERED** | --              |
| `phased`      | **UNCOVERED** | --              |
| `dormant`     | **UNCOVERED** | --              |
| `active`      | **UNCOVERED** | --              |
| `cooldown`    | **UNCOVERED** | --              |
| `charged`     | **UNCOVERED** | --              |
| `depleted`    | **UNCOVERED** | --              |
| `overloaded`  | **UNCOVERED** | --              |

### Emotion & Mood (20) -- 0/20 (0%)

| Trait         | Status        | Example File(s) |
| ------------- | ------------- | --------------- |
| `happy`       | **UNCOVERED** | --              |
| `sad`         | **UNCOVERED** | --              |
| `angry`       | **UNCOVERED** | --              |
| `scared`      | **UNCOVERED** | --              |
| `surprised`   | **UNCOVERED** | --              |
| `disgusted`   | **UNCOVERED** | --              |
| `calm`        | **UNCOVERED** | --              |
| `excited`     | **UNCOVERED** | --              |
| `bored`       | **UNCOVERED** | --              |
| `nostalgic`   | **UNCOVERED** | --              |
| `eerie`       | **UNCOVERED** | --              |
| `serene`      | **UNCOVERED** | --              |
| `chaotic`     | **UNCOVERED** | --              |
| `melancholic` | **UNCOVERED** | --              |
| `triumphant`  | **UNCOVERED** | --              |
| `ominous`     | **UNCOVERED** | --              |
| `whimsical`   | **UNCOVERED** | --              |
| `cozy`        | **UNCOVERED** | --              |
| `desolate`    | **UNCOVERED** | --              |
| `majestic`    | **UNCOVERED** | --              |

### Multisensory & Haptic (16) -- 0/16 (0%)

| Trait                | Status        | Example File(s) |
| -------------------- | ------------- | --------------- |
| `scented`            | **UNCOVERED** | --              |
| `tasteable`          | **UNCOVERED** | --              |
| `temperature`        | **UNCOVERED** | --              |
| `pressure_sensitive` | **UNCOVERED** | --              |
| `wind_effect`        | **UNCOVERED** | --              |
| `wet`                | **UNCOVERED** | --              |
| `dry`                | **UNCOVERED** | --              |
| `rough`              | **UNCOVERED** | --              |
| `smooth`             | **UNCOVERED** | --              |
| `sticky`             | **UNCOVERED** | --              |
| `slippery`           | **UNCOVERED** | --              |
| `vibrating`          | **UNCOVERED** | --              |
| `warm`               | **UNCOVERED** | --              |
| `cold`               | **UNCOVERED** | --              |
| `electric_sensation` | **UNCOVERED** | --              |
| `tingling`           | **UNCOVERED** | --              |

### Social & Commerce (12) -- 0/12 (0%)

| Trait             | Status        | Example File(s) |
| ----------------- | ------------- | --------------- |
| `tradeable`       | **UNCOVERED** | --              |
| `giftable`        | **UNCOVERED** | --              |
| `rentable`        | **UNCOVERED** | --              |
| `auctionable`     | **UNCOVERED** | --              |
| `voteable`        | **UNCOVERED** | --              |
| `subscribable`    | **UNCOVERED** | --              |
| `tippable`        | **UNCOVERED** | --              |
| `reviewable`      | **UNCOVERED** | --              |
| `curated`         | **UNCOVERED** | --              |
| `featured`        | **UNCOVERED** | --              |
| `limited_edition` | **UNCOVERED** | --              |
| `seasonal_item`   | **UNCOVERED** | --              |

### Social & Effects (8) -- 0/8 (0%)

| Trait           | Status        | Example File(s) |
| --------------- | ------------- | --------------- |
| `shareable`     | **UNCOVERED** | --              |
| `embeddable`    | **UNCOVERED** | --              |
| `qr`            | **UNCOVERED** | --              |
| `collaborative` | **UNCOVERED** | --              |
| `particle`      | **UNCOVERED** | --              |
| `transition`    | **UNCOVERED** | --              |
| `filter`        | **UNCOVERED** | --              |
| `trail`         | **UNCOVERED** | --              |

### Weather Particles (12) -- 0/12 (0%)

| Trait              | Status        | Example File(s) |
| ------------------ | ------------- | --------------- |
| `rain_emitter`     | **UNCOVERED** | --              |
| `snow_emitter`     | **UNCOVERED** | --              |
| `fog_emitter`      | **UNCOVERED** | --              |
| `dust_emitter`     | **UNCOVERED** | --              |
| `spark_emitter`    | **UNCOVERED** | --              |
| `bubble_emitter`   | **UNCOVERED** | --              |
| `smoke_emitter`    | **UNCOVERED** | --              |
| `fire_emitter`     | **UNCOVERED** | --              |
| `magic_emitter`    | **UNCOVERED** | --              |
| `confetti_emitter` | **UNCOVERED** | --              |
| `pollen_emitter`   | **UNCOVERED** | --              |
| `firefly_emitter`  | **UNCOVERED** | --              |

### Weather Phenomena (28) -- 0/28 (0%)

| Trait               | Status        | Example File(s) |
| ------------------- | ------------- | --------------- |
| `lightning_bolt`    | **UNCOVERED** | --              |
| `tornado`           | **UNCOVERED** | --              |
| `earthquake`        | **UNCOVERED** | --              |
| `tsunami`           | **UNCOVERED** | --              |
| `aurora`            | **UNCOVERED** | --              |
| `meteor_shower`     | **UNCOVERED** | --              |
| `eclipse`           | **UNCOVERED** | --              |
| `rainbow_weather`   | **UNCOVERED** | --              |
| `blizzard`          | **UNCOVERED** | --              |
| `sandstorm`         | **UNCOVERED** | --              |
| `hailstorm`         | **UNCOVERED** | --              |
| `thunderstorm`      | **UNCOVERED** | --              |
| `hurricane`         | **UNCOVERED** | --              |
| `typhoon`           | **UNCOVERED** | --              |
| `flood`             | **UNCOVERED** | --              |
| `drought`           | **UNCOVERED** | --              |
| `avalanche`         | **UNCOVERED** | --              |
| `landslide`         | **UNCOVERED** | --              |
| `geyser`            | **UNCOVERED** | --              |
| `whirlpool`         | **UNCOVERED** | --              |
| `waterspout`        | **UNCOVERED** | --              |
| `volcanic_eruption` | **UNCOVERED** | --              |
| `sinkhole`          | **UNCOVERED** | --              |
| `wildfire`          | **UNCOVERED** | --              |
| `heatwave`          | **UNCOVERED** | --              |
| `cold_snap`         | **UNCOVERED** | --              |
| `monsoon`           | **UNCOVERED** | --              |
| `solar_flare`       | **UNCOVERED** | --              |

### Procedural Generation (25) -- 0/25 (0%)

| Trait                    | Status        | Example File(s) |
| ------------------------ | ------------- | --------------- |
| `procedural_terrain`     | **UNCOVERED** | --              |
| `procedural_city`        | **UNCOVERED** | --              |
| `procedural_dungeon`     | **UNCOVERED** | --              |
| `procedural_biome`       | **UNCOVERED** | --              |
| `procedural_npc`         | **UNCOVERED** | --              |
| `procedural_loot`        | **UNCOVERED** | --              |
| `procedural_quest`       | **UNCOVERED** | --              |
| `procedural_music`       | **UNCOVERED** | --              |
| `procedural_texture`     | **UNCOVERED** | --              |
| `procedural_vegetation`  | **UNCOVERED** | --              |
| `procedural_weather`     | **UNCOVERED** | --              |
| `procedural_dialogue`    | **UNCOVERED** | --              |
| `noise_generator`        | **UNCOVERED** | --              |
| `wave_function_collapse` | **UNCOVERED** | --              |
| `l_system`               | **UNCOVERED** | --              |
| `voronoi`                | **UNCOVERED** | --              |
| `fractal`                | **UNCOVERED** | --              |
| `cellular_automata`      | **UNCOVERED** | --              |
| `marching_cubes`         | **UNCOVERED** | --              |
| `heightmap`              | **UNCOVERED** | --              |
| `erosion`                | **UNCOVERED** | --              |
| `river_generator`        | **UNCOVERED** | --              |
| `road_generator`         | **UNCOVERED** | --              |
| `cave_generator`         | **UNCOVERED** | --              |
| `maze_generator`         | **UNCOVERED** | --              |

### Narrative & Storytelling (12) -- 0/12 (0%)

| Trait              | Status        | Example File(s) |
| ------------------ | ------------- | --------------- |
| `narrator_trigger` | **UNCOVERED** | --              |
| `cutscene`         | **UNCOVERED** | --              |
| `flashback`        | **UNCOVERED** | --              |
| `foreshadow`       | **UNCOVERED** | --              |
| `journal_entry`    | **UNCOVERED** | --              |
| `lore`             | **UNCOVERED** | --              |
| `clue`             | **UNCOVERED** | --              |
| `evidence`         | **UNCOVERED** | --              |
| `witness`          | **UNCOVERED** | --              |
| `suspect`          | **UNCOVERED** | --              |
| `alibi`            | **UNCOVERED** | --              |
| `testimony`        | **UNCOVERED** | --              |

### Enterprise Multitenancy (19) -- 0/19 (0%)

| Trait                  | Status        | Example File(s) |
| ---------------------- | ------------- | --------------- |
| `tenant`               | **UNCOVERED** | --              |
| `tenant_boundary`      | **UNCOVERED** | --              |
| `tenant_registry`      | **UNCOVERED** | --              |
| `tenant_config`        | **UNCOVERED** | --              |
| `tenant_isolation`     | **UNCOVERED** | --              |
| `rbac`                 | **UNCOVERED** | --              |
| `rbac_role`            | **UNCOVERED** | --              |
| `rbac_permission`      | **UNCOVERED** | --              |
| `rbac_policy`          | **UNCOVERED** | --              |
| `quota`                | **UNCOVERED** | --              |
| `quota_scene`          | **UNCOVERED** | --              |
| `quota_gaussian`       | **UNCOVERED** | --              |
| `quota_render_credits` | **UNCOVERED** | --              |
| `quota_storage`        | **UNCOVERED** | --              |
| `sso_saml`             | **UNCOVERED** | --              |
| `sso_oidc`             | **UNCOVERED** | --              |
| `sso_session`          | **UNCOVERED** | --              |
| `audit_log`            | **UNCOVERED** | --              |
| `audit_trail`          | **UNCOVERED** | --              |

### Analytics & Observability (16) -- 0/16 (0%)

| Trait                 | Status        | Example File(s) |
| --------------------- | ------------- | --------------- |
| `analytics`           | **UNCOVERED** | --              |
| `perf_monitor`        | **UNCOVERED** | --              |
| `frame_profiler`      | **UNCOVERED** | --              |
| `abtest`              | **UNCOVERED** | --              |
| `ab_variant`          | **UNCOVERED** | --              |
| `experiment`          | **UNCOVERED** | --              |
| `engagement_tracker`  | **UNCOVERED** | --              |
| `session_monitor`     | **UNCOVERED** | --              |
| `interaction_heatmap` | **UNCOVERED** | --              |
| `scene_completion`    | **UNCOVERED** | --              |
| `otel_trace`          | **UNCOVERED** | --              |
| `otel_span`           | **UNCOVERED** | --              |
| `otel_metric`         | **UNCOVERED** | --              |
| `metrics_dashboard`   | **UNCOVERED** | --              |
| `metrics_sink`        | **UNCOVERED** | --              |
| `metrics_aggregator`  | **UNCOVERED** | --              |

### Security & Crypto (Selected 7) -- 0/7 (0%)

| Trait                   | Status        | Example File(s) |
| ----------------------- | ------------- | --------------- |
| `encryption`            | **UNCOVERED** | --              |
| `rsa_encryption`        | **UNCOVERED** | --              |
| `package_signing`       | **UNCOVERED** | --              |
| `zero_knowledge_proof`  | **UNCOVERED** | --              |
| `hsm_integration`       | **UNCOVERED** | --              |
| `sandbox_execution`     | **UNCOVERED** | --              |
| `vulnerability_scanner` | **UNCOVERED** | --              |

### Physical Affordances (22) -- 0/22 (0%)

| Trait            | Status        | Example File(s) |
| ---------------- | ------------- | --------------- |
| `knob`           | **UNCOVERED** | --              |
| `dial`           | **UNCOVERED** | --              |
| `crank`          | **UNCOVERED** | --              |
| `handle`         | **UNCOVERED** | --              |
| `valve`          | **UNCOVERED** | --              |
| `joystick`       | **UNCOVERED** | --              |
| `steering_wheel` | **UNCOVERED** | --              |
| `pedal`          | **UNCOVERED** | --              |
| `throttle`       | **UNCOVERED** | --              |
| `slider_control` | **UNCOVERED** | --              |
| `wheel`          | **UNCOVERED** | --              |
| `pulley`         | **UNCOVERED** | --              |
| `hinge`          | **UNCOVERED** | --              |
| `latch`          | **UNCOVERED** | --              |
| `spring_loaded`  | **UNCOVERED** | --              |
| `ratchet`        | **UNCOVERED** | --              |
| `gear_mechanism` | **UNCOVERED** | --              |
| `pendulum`       | **UNCOVERED** | --              |
| `balance`        | **UNCOVERED** | --              |
| `fulcrum`        | **UNCOVERED** | --              |
| `piston`         | **UNCOVERED** | --              |
| `bellows`        | **UNCOVERED** | --              |

### NPC Roles (63) -- 0/62 (0%)

| Trait           | Status        | Example File(s) |
| --------------- | ------------- | --------------- |
| `relationship`  | **UNCOVERED** | --              |
| `reputation`    | **UNCOVERED** | --              |
| `schedule`      | **UNCOVERED** | --              |
| `routine`       | **UNCOVERED** | --              |
| `barter`        | **UNCOVERED** | --              |
| `negotiate`     | **UNCOVERED** | --              |
| `betray`        | **UNCOVERED** | --              |
| `ally`          | **UNCOVERED** | --              |
| `rival`         | **UNCOVERED** | --              |
| `mentor`        | **UNCOVERED** | --              |
| `apprentice`    | **UNCOVERED** | --              |
| `follower`      | **UNCOVERED** | --              |
| `leader`        | **UNCOVERED** | --              |
| `merchant`      | **UNCOVERED** | --              |
| `quest_giver`   | **UNCOVERED** | --              |
| `guard`         | **UNCOVERED** | --              |
| `healer_npc`    | **UNCOVERED** | --              |
| `blacksmith`    | **UNCOVERED** | --              |
| `innkeeper`     | **UNCOVERED** | --              |
| `scholar`       | **UNCOVERED** | --              |
| `thief`         | **UNCOVERED** | --              |
| `spy`           | **UNCOVERED** | --              |
| `diplomat`      | **UNCOVERED** | --              |
| `general`       | **UNCOVERED** | --              |
| `prophet`       | **UNCOVERED** | --              |
| `hermit`        | **UNCOVERED** | --              |
| `bard`          | **UNCOVERED** | --              |
| `jester`        | **UNCOVERED** | --              |
| `assassin`      | **UNCOVERED** | --              |
| `monk`          | **UNCOVERED** | --              |
| `pirate`        | **UNCOVERED** | --              |
| `ranger`        | **UNCOVERED** | --              |
| `necromancer`   | **UNCOVERED** | --              |
| `alchemist`     | **UNCOVERED** | --              |
| `enchanter`     | **UNCOVERED** | --              |
| `artificer`     | **UNCOVERED** | --              |
| `summoner_npc`  | **UNCOVERED** | --              |
| `warden`        | **UNCOVERED** | --              |
| `oracle`        | **UNCOVERED** | --              |
| `ferryman`      | **UNCOVERED** | --              |
| `shopkeeper`    | **UNCOVERED** | --              |
| `bartender`     | **UNCOVERED** | --              |
| `librarian`     | **UNCOVERED** | --              |
| `archaeologist` | **UNCOVERED** | --              |
| `pilot`         | **UNCOVERED** | --              |
| `engineer`      | **UNCOVERED** | --              |
| `scientist`     | **UNCOVERED** | --              |
| `doctor`        | **UNCOVERED** | --              |
| `farmer`        | **UNCOVERED** | --              |
| `miner_npc`     | **UNCOVERED** | --              |
| `fisher_npc`    | **UNCOVERED** | --              |
| `hunter`        | **UNCOVERED** | --              |
| `gatherer`      | **UNCOVERED** | --              |
| `nomad`         | **UNCOVERED** | --              |
| `refugee`       | **UNCOVERED** | --              |
| `prisoner`      | **UNCOVERED** | --              |
| `royalty`       | **UNCOVERED** | --              |
| `peasant`       | **UNCOVERED** | --              |
| `noble`         | **UNCOVERED** | --              |
| `outlaw`        | **UNCOVERED** | --              |
| `vigilante`     | **UNCOVERED** | --              |
| `companion`     | **UNCOVERED** | --              |

### Healthcare & Medical (31) -- 2/31 (6%)

| Trait                | Status        | Example File(s)                       |
| -------------------- | ------------- | ------------------------------------- |
| `patient`            | **UNCOVERED** | --                                    |
| `vital_signs`        | **UNCOVERED** | --                                    |
| `x_ray_scan`         | **UNCOVERED** | --                                    |
| `mri_scan`           | **UNCOVERED** | --                                    |
| `ct_scan`            | **UNCOVERED** | --                                    |
| `ultrasound`         | **UNCOVERED** | --                                    |
| `ecg`                | **UNCOVERED** | --                                    |
| `surgical_tool`      | COVERED       | `examples\showcase\multi-domain.holo` |
| `scalpel`            | **UNCOVERED** | --                                    |
| `forceps`            | **UNCOVERED** | --                                    |
| `syringe`            | **UNCOVERED** | --                                    |
| `iv_drip`            | **UNCOVERED** | --                                    |
| `defibrillator`      | **UNCOVERED** | --                                    |
| `stethoscope`        | **UNCOVERED** | --                                    |
| `bandage`            | **UNCOVERED** | --                                    |
| `splint`             | **UNCOVERED** | --                                    |
| `wheelchair`         | **UNCOVERED** | --                                    |
| `prosthetic`         | **UNCOVERED** | --                                    |
| `therapeutic`        | **UNCOVERED** | --                                    |
| `meditation`         | **UNCOVERED** | --                                    |
| `breathing_exercise` | **UNCOVERED** | --                                    |
| `biofeedback`        | COVERED       | `examples\showcase\multi-domain.holo` |
| `exposure_therapy`   | **UNCOVERED** | --                                    |
| `pain_management`    | **UNCOVERED** | --                                    |
| `rehabilitation`     | **UNCOVERED** | --                                    |
| `cognitive_therapy`  | **UNCOVERED** | --                                    |
| `phobia_treatment`   | **UNCOVERED** | --                                    |
| `ptsd_therapy`       | **UNCOVERED** | --                                    |
| `mindfulness`        | **UNCOVERED** | --                                    |
| `body_scan`          | **UNCOVERED** | --                                    |
| `guided_relaxation`  | **UNCOVERED** | --                                    |

### Education & Learning (42) -- 4/39 (10%)

| Trait                     | Status        | Example File(s)                       |
| ------------------------- | ------------- | ------------------------------------- |
| `lesson`                  | **UNCOVERED** | --                                    |
| `quiz`                    | **UNCOVERED** | --                                    |
| `flashcard`               | **UNCOVERED** | --                                    |
| `tutorial`                | **UNCOVERED** | --                                    |
| `demonstration`           | **UNCOVERED** | --                                    |
| `lab_experiment`          | **UNCOVERED** | --                                    |
| `dissectable`             | COVERED       | `examples\showcase\multi-domain.holo` |
| `microscopic`             | **UNCOVERED** | --                                    |
| `telescopic`              | **UNCOVERED** | --                                    |
| `zoomable`                | **UNCOVERED** | --                                    |
| `layered`                 | COVERED       | `examples\showcase\multi-domain.holo` |
| `cross_section`           | **UNCOVERED** | --                                    |
| `time_lapse`              | **UNCOVERED** | --                                    |
| `slow_motion`             | **UNCOVERED** | --                                    |
| `replayable`              | **UNCOVERED** | --                                    |
| `gradeable`               | COVERED       | `examples\showcase\multi-domain.holo` |
| `hint_system`             | **UNCOVERED** | --                                    |
| `achievement`             | **UNCOVERED** | --                                    |
| `badge`                   | **UNCOVERED** | --                                    |
| `certificate`             | **UNCOVERED** | --                                    |
| `leaderboard`             | **UNCOVERED** | --                                    |
| `progress_tracker`        | **UNCOVERED** | --                                    |
| `skill_tree`              | **UNCOVERED** | --                                    |
| `knowledge_check`         | **UNCOVERED** | --                                    |
| `vocabulary`              | **UNCOVERED** | --                                    |
| `pronunciation`           | **UNCOVERED** | --                                    |
| `translation`             | **UNCOVERED** | --                                    |
| `historical`              | **UNCOVERED** | --                                    |
| `scientific`              | **UNCOVERED** | --                                    |
| `mathematical`            | **UNCOVERED** | --                                    |
| `geographic`              | **UNCOVERED** | --                                    |
| `anatomical`              | COVERED       | `examples\showcase\multi-domain.holo` |
| `astronomical`            | **UNCOVERED** | --                                    |
| `chemical`                | **UNCOVERED** | --                                    |
| `biological`              | **UNCOVERED** | --                                    |
| `geological`              | **UNCOVERED** | --                                    |
| `archaeological_artifact` | **UNCOVERED** | --                                    |
| `museum_exhibit`          | **UNCOVERED** | --                                    |
| `gallery_piece`           | **UNCOVERED** | --                                    |

### Data Visualization (46) -- 2/45 (4%)

| Trait               | Status        | Example File(s)                          |
| ------------------- | ------------- | ---------------------------------------- |
| `chart`             | **UNCOVERED** | --                                       |
| `graph`             | **UNCOVERED** | --                                       |
| `dashboard`         | **UNCOVERED** | --                                       |
| `annotation`        | **UNCOVERED** | --                                       |
| `measurement_tool`  | COVERED       | `examples\platforms\android-ar-app.holo` |
| `overlay`           | **UNCOVERED** | --                                       |
| `x_ray_view`        | COVERED       | `examples\showcase\multi-domain.holo`    |
| `exploded_view`     | **UNCOVERED** | --                                       |
| `cutaway`           | **UNCOVERED** | --                                       |
| `training_mode`     | **UNCOVERED** | --                                       |
| `simulation_mode`   | **UNCOVERED** | --                                       |
| `presentation_mode` | **UNCOVERED** | --                                       |
| `whiteboard`        | **UNCOVERED** | --                                       |
| `sticky_note`       | **UNCOVERED** | --                                       |
| `kanban`            | **UNCOVERED** | --                                       |
| `timeline_view`     | **UNCOVERED** | --                                       |
| `gantt`             | **UNCOVERED** | --                                       |
| `org_chart`         | **UNCOVERED** | --                                       |
| `mind_map`          | **UNCOVERED** | --                                       |
| `flowchart`         | **UNCOVERED** | --                                       |
| `schematic`         | **UNCOVERED** | --                                       |
| `wireframe_view`    | **UNCOVERED** | --                                       |
| `heatmap_view`      | **UNCOVERED** | --                                       |
| `scatter_plot`      | **UNCOVERED** | --                                       |
| `bar_chart`         | **UNCOVERED** | --                                       |
| `pie_chart`         | **UNCOVERED** | --                                       |
| `line_graph`        | **UNCOVERED** | --                                       |
| `tree_map`          | **UNCOVERED** | --                                       |
| `network_graph`     | **UNCOVERED** | --                                       |
| `sankey`            | **UNCOVERED** | --                                       |
| `histogram`         | **UNCOVERED** | --                                       |
| `gauge`             | **UNCOVERED** | --                                       |
| `speedometer`       | **UNCOVERED** | --                                       |
| `progress_bar`      | **UNCOVERED** | --                                       |
| `status_indicator`  | **UNCOVERED** | --                                       |
| `data_table`        | **UNCOVERED** | --                                       |
| `spreadsheet`       | **UNCOVERED** | --                                       |
| `code_editor`       | **UNCOVERED** | --                                       |
| `terminal`          | **UNCOVERED** | --                                       |
| `file_browser`      | **UNCOVERED** | --                                       |
| `media_player`      | **UNCOVERED** | --                                       |
| `image_viewer`      | **UNCOVERED** | --                                       |
| `model_viewer`      | **UNCOVERED** | --                                       |
| `pdf_viewer`        | **UNCOVERED** | --                                       |
| `web_view`          | **UNCOVERED** | --                                       |

### Scientific Computing (28) -- 0/28 (0%)

| Trait                   | Status        | Example File(s) |
| ----------------------- | ------------- | --------------- |
| `narupa_integration`    | **UNCOVERED** | --              |
| `molecular_dynamics`    | **UNCOVERED** | --              |
| `energy_minimization`   | **UNCOVERED** | --              |
| `force_field`           | **UNCOVERED** | --              |
| `auto_dock`             | **UNCOVERED** | --              |
| `protein_visualization` | **UNCOVERED** | --              |
| `ligand_visualization`  | **UNCOVERED** | --              |
| `chemical_bond`         | **UNCOVERED** | --              |
| `hydrogen_bonds`        | **UNCOVERED** | --              |
| `hydrophobic_surface`   | **UNCOVERED** | --              |
| `electrostatic_surface` | **UNCOVERED** | --              |
| `pdb_loader`            | **UNCOVERED** | --              |
| `mol_loader`            | **UNCOVERED** | --              |
| `database_query`        | **UNCOVERED** | --              |
| `trajectory_analysis`   | **UNCOVERED** | --              |
| `trajectory_playback`   | **UNCOVERED** | --              |
| `binding_affinity`      | **UNCOVERED** | --              |
| `interactive_forces`    | **UNCOVERED** | --              |
| `atom_selection`        | **UNCOVERED** | --              |
| `atom_labels`           | **UNCOVERED** | --              |
| `residue_labels`        | **UNCOVERED** | --              |
| `alphafold_predict`     | **UNCOVERED** | --              |
| `structure_confidence`  | **UNCOVERED** | --              |
| `multimer_predict`      | **UNCOVERED** | --              |
| `pae_visualization`     | **UNCOVERED** | --              |
| `protein_structure`     | **UNCOVERED** | --              |
| `simulation_control`    | **UNCOVERED** | --              |
| `collaborative_science` | **UNCOVERED** | --              |

---

## Prioritized Uncovered Traits

Traits listed in priority order based on category importance for HoloScript adoption.

### Priority 1: Critical (Core functionality, accessibility, interaction)

**Accessibility (Core 10)**:

- `@spatial_audio_cue`
- `@sonification`
- `@magnifiable`

**Accessibility (Extended 27)**:

- `@cognitive_assist`
- `@sensory_substitution`
- `@one_handed`
- `@seated_mode`
- `@standing_mode`
- `@voice_only`
- `@gaze_only`
- `@switch_access`
- `@large_text`
- `@dyslexia_friendly`
- `@color_blind_safe`
- `@photosensitive_safe`
- `@reduced_complexity`
- `@guided_mode`
- `@auto_narrate`
- `@sign_language`
- `@braille_output`
- `@audio_description`
- `@closed_caption`
- `@adjustable_speed`
- `@adjustable_difficulty`
- `@teleport_only`
- `@snap_turning`
- `@continuous_turning`
- `@vignette`
- `@stable_horizon`

**Core VR Interaction (13)**:

- `@snappable`
- `@stretchable`
- `@moldable`
- `@timeline`
- `@choreography`

**Object Interaction (25)**:

- `@openable`
- `@closable`
- `@lockable`
- `@unlockable`
- `@pullable`
- `@liftable`
- `@carryable`
- `@wearable`
- `@consumable`
- `@craftable`
- `@combinable`
- `@splittable`
- `@foldable`
- `@fillable`
- `@pourable`
- `@readable`
- `@writable`
- `@paintable`
- `@cuttable`
- `@toggleable`
- `@tunable`
- `@insertable`
- `@removable`

**Physics Expansion (8)**:

- `@fluid`
- `@soft_body`
- `@rope`
- `@chain`
- `@buoyancy`
- `@destruction`

### Priority 2: High (Networking, AI, Audio, XR Platform)

**Networking & AI (27)**:

- `@proactive`
- `@ai_driven`
- `@agent_protocol`
- `@narrator`
- `@responsive`
- `@procedural`
- `@captioned`
- `@collaborative_sculpt`
- `@fabrication_queue`
- `@print_vote`
- `@design_fork`
- `@neural_link`
- `@neural_forge`
- `@vision`
- `@stable_diffusion`
- `@controlnet`
- `@ai_texture_gen`
- `@diffusion_realtime`
- `@ai_inpainting`
- `@ai_upscaling`
- `@memory`
- `@vector_db`
- `@rag_knowledge`
- `@embedding_search`
- `@ai_npc_brain`

**Audio (10)**:

- `@voice`
- `@reactive_audio`
- `@audio_occlusion`
- `@audio_portal`
- `@audio_material`
- `@head_tracked_audio`

**Environment & Input (15)**:

- `@plane_detection`
- `@mesh_detection`
- `@persistent_anchor`
- `@shared_anchor`
- `@geospatial`
- `@occlusion`
- `@light_estimation`
- `@eye_tracking`
- `@spatial_accessory`
- `@body_tracking`
- `@face_tracking`

**XR Platform (35)**:

- `@passthrough`
- `@room_scale`
- `@world_scale`
- `@tabletop_scale`
- `@shared_space`
- `@persistent_world`
- `@cross_platform`
- `@webxr`
- `@openxr`
- `@arkit`
- `@arcore`
- `@visionos`
- `@quest_native`
- `@pcvr`
- `@mobile_ar`
- `@headset_only`
- `@controller_required`
- `@hands_only`
- `@seated_experience`
- `@standing_experience`
- `@room_boundary`
- `@guardian_system`
- `@mixed_reality`
- `@diminished_reality`
- `@augmented_virtuality`
- `@spatial_awareness`
- `@shared_world`
- `@spatial_persona`
- `@shareplay`
- `@object_tracking`
- `@scene_reconstruction`
- `@realitykit_mesh`
- `@room_mesh`
- `@volumetric_window`
- `@spatial_navigation`

### Priority 3: Medium (Visual, Game Mechanics, Locomotion)

**Visual Effects (30)**:

- `@pulsing`
- `@blinking`
- `@fading`
- `@color_shifting`
- `@holographic`
- `@outlined`
- `@x_ray`
- `@neon_glow`
- `@iridescent`
- `@frosted`
- `@luminous`
- `@camouflaged`
- `@mirrored`
- `@pixelated`
- `@dissolving`
- `@crystalline`
- `@ethereal`
- `@smoky`
- `@fiery`
- `@electric_arc`
- `@ghostly`
- `@rainbow`
- `@metallic_sheen`
- `@ink_wash`

**Game Mechanics (31)**:

- `@collectible`
- `@spawnable`
- `@destructible`
- `@healable`
- `@damageable`
- `@explosive`
- `@flammable`
- `@freezable`
- `@electrifiable`
- `@magnetic`
- `@poisonous`
- `@radioactive`
- `@fragile`
- `@repairable`
- `@upgradeable`
- `@lootable`
- `@quest_item`
- `@currency`
- `@ammunition`
- `@fuel`
- `@key_item`
- `@power_up`
- `@debuff`
- `@shield`
- `@weapon`
- `@armor`
- `@vehicle`
- `@projectile`
- `@trap`
- `@puzzle_piece`

**Locomotion & Movement (14)**:

- `@rideable`
- `@driveable`
- `@mountable`
- `@climbable`
- `@swimmable`
- `@flyable`
- `@teleportable`
- `@walkable`
- `@jumpable`
- `@crawlable`
- `@slidable`
- `@grindable`
- `@surfable`

**Rendering (24)**:

- `@advanced_pbr`
- `@clearcoat`
- `@anisotropy`
- `@sheen`
- `@subsurface_scattering`
- `@sss_burley`
- `@sss_christensen`
- `@sss_random_walk`
- `@iridescence`
- `@transmission`
- `@dispersion`
- `@screen_space_effects`
- `@ssao`
- `@ssr`
- `@ssgi`
- `@ssdo`
- `@taa`
- `@motion_blur`
- `@depth_of_field`
- `@dof_bokeh`
- `@chromatic_aberration`
- `@lens_flare`
- `@film_grain`
- `@post_processing_stack`

**Lighting (28)**:

- `@shadow_caster`
- `@light_source`
- `@spotlight`
- `@point_light`
- `@area_light`
- `@backlit`
- `@candlelight`
- `@torchlight`
- `@lantern`
- `@neon_sign`
- `@fluorescent`
- `@incandescent`
- `@led`
- `@strobe`
- `@blacklight`
- `@floodlight`
- `@chandelier`
- `@lamp`
- `@sconce`
- `@light_strip`
- `@projection`
- `@volumetric_light`
- `@caustics`
- `@god_rays`
- `@ambient_glow`
- `@flickering`
- `@dimmable`
- `@color_temperature`

**Parser Core & UI (18)**:

- `@local_only`
- `@visible`
- `@invisible`
- `@audio`
- `@vr_only`
- `@ar_only`
- `@desktop_only`
- `@ui_floating`
- `@ui_anchored`
- `@ui_hand_menu`
- `@ui_billboard`
- `@ui_curved`
- `@ui_docked`

### Priority 4: Lower (Domain-specific, decorative, world-building)

**Intelligence & Behavior (40)** (39 uncovered):

- `@autonomous`
- `@scripted`
- `@adaptive`
- `@pathfinding`
- `@flocking`
- `@swarming`
- `@conversational`
- `@teachable`
- `@tameable`
- `@friendly`
- ... and 29 more

**IoT & Autonomous Agents (31)** (19 uncovered):

- `@alert`
- `@heatmap_3d`
- `@emotion`
- `@faction`
- `@patrol`
- `@agent_spawner`
- `@delegation`
- `@command`
- `@dtdl_interface`
- `@bluetooth_device`
- ... and 9 more

**Geospatial & Web3 (12)** (8 uncovered):

- `@geospatial_anchor`
- `@terrain_anchor`
- `@rooftop_anchor`
- `@vps`
- `@poi`
- `@portable`
- `@bonding_curve`
- `@zora_coins`

**Volumetric & WebGPU (13)** (12 uncovered):

- `@gaussian_splat`
- `@nerf`
- `@volumetric_video`
- `@point_cloud`
- `@photogrammetry`
- `@gpu_particle`
- `@gpu_physics`
- `@gpu_buffer`
- `@photogrammetry_scan`
- `@lidar_scan`
- ... and 2 more

**Interop & Co-Presence (15)** (14 uncovered):

- `@usd`
- `@gltf`
- `@fbx`
- `@material_x`
- `@scene_graph`
- `@co_located`
- `@remote_presence`
- `@voice_proximity`
- `@lip_sync`
- `@emotion_directive`
- ... and 4 more

**Simple Modifiers (8)** (1 uncovered):

- `@rotating`

**Safety & Boundaries (14)** (12 uncovered):

- `@safe_zone`
- `@hazard`
- `@boundary`
- `@checkpoint`
- `@respawn`
- `@no_build`
- `@no_fly`
- `@pvp_zone`
- `@pve_zone`
- `@spectator_zone`
- ... and 2 more

**State & Persistence (17)** (17 uncovered):

- `@saveable`
- `@restorable`
- `@timer`
- `@triggered`
- `@ephemeral`
- `@synced`
- `@versioned`
- `@undo_redo`
- `@conditional`
- `@staged`
- ... and 7 more

**Emotion & Mood (20)** (20 uncovered):

- `@happy`
- `@sad`
- `@angry`
- `@scared`
- `@surprised`
- `@disgusted`
- `@calm`
- `@excited`
- `@bored`
- `@nostalgic`
- ... and 10 more

**Multisensory & Haptic (16)** (16 uncovered):

- `@scented`
- `@tasteable`
- `@temperature`
- `@pressure_sensitive`
- `@wind_effect`
- `@wet`
- `@dry`
- `@rough`
- `@smooth`
- `@sticky`
- ... and 6 more

**Social & Commerce (12)** (12 uncovered):

- `@tradeable`
- `@giftable`
- `@rentable`
- `@auctionable`
- `@voteable`
- `@subscribable`
- `@tippable`
- `@reviewable`
- `@curated`
- `@featured`
- ... and 2 more

**Social & Effects (8)** (8 uncovered):

- `@shareable`
- `@embeddable`
- `@qr`
- `@collaborative`
- `@particle`
- `@transition`
- `@filter`
- `@trail`

**Weather Particles (12)** (12 uncovered):

- `@rain_emitter`
- `@snow_emitter`
- `@fog_emitter`
- `@dust_emitter`
- `@spark_emitter`
- `@bubble_emitter`
- `@smoke_emitter`
- `@fire_emitter`
- `@magic_emitter`
- `@confetti_emitter`
- ... and 2 more

**Weather Phenomena (28)** (28 uncovered):

- `@lightning_bolt`
- `@tornado`
- `@earthquake`
- `@tsunami`
- `@aurora`
- `@meteor_shower`
- `@eclipse`
- `@rainbow_weather`
- `@blizzard`
- `@sandstorm`
- ... and 18 more

**Procedural Generation (25)** (25 uncovered):

- `@procedural_terrain`
- `@procedural_city`
- `@procedural_dungeon`
- `@procedural_biome`
- `@procedural_npc`
- `@procedural_loot`
- `@procedural_quest`
- `@procedural_music`
- `@procedural_texture`
- `@procedural_vegetation`
- ... and 15 more

**Narrative & Storytelling (12)** (12 uncovered):

- `@narrator_trigger`
- `@cutscene`
- `@flashback`
- `@foreshadow`
- `@journal_entry`
- `@lore`
- `@clue`
- `@evidence`
- `@witness`
- `@suspect`
- ... and 2 more

**Enterprise Multitenancy (19)** (19 uncovered):

- `@tenant`
- `@tenant_boundary`
- `@tenant_registry`
- `@tenant_config`
- `@tenant_isolation`
- `@rbac`
- `@rbac_role`
- `@rbac_permission`
- `@rbac_policy`
- `@quota`
- ... and 9 more

**Analytics & Observability (16)** (16 uncovered):

- `@analytics`
- `@perf_monitor`
- `@frame_profiler`
- `@abtest`
- `@ab_variant`
- `@experiment`
- `@engagement_tracker`
- `@session_monitor`
- `@interaction_heatmap`
- `@scene_completion`
- ... and 6 more

**Security & Crypto (Selected 7)** (7 uncovered):

- `@encryption`
- `@rsa_encryption`
- `@package_signing`
- `@zero_knowledge_proof`
- `@hsm_integration`
- `@sandbox_execution`
- `@vulnerability_scanner`

**Physical Affordances (22)** (22 uncovered):

- `@knob`
- `@dial`
- `@crank`
- `@handle`
- `@valve`
- `@joystick`
- `@steering_wheel`
- `@pedal`
- `@throttle`
- `@slider_control`
- ... and 12 more

**NPC Roles (63)** (62 uncovered):

- `@relationship`
- `@reputation`
- `@schedule`
- `@routine`
- `@barter`
- `@negotiate`
- `@betray`
- `@ally`
- `@rival`
- `@mentor`
- ... and 52 more

**Healthcare & Medical (31)** (29 uncovered):

- `@patient`
- `@vital_signs`
- `@x_ray_scan`
- `@mri_scan`
- `@ct_scan`
- `@ultrasound`
- `@ecg`
- `@scalpel`
- `@forceps`
- `@syringe`
- ... and 19 more

**Education & Learning (42)** (35 uncovered):

- `@lesson`
- `@quiz`
- `@flashcard`
- `@tutorial`
- `@demonstration`
- `@lab_experiment`
- `@microscopic`
- `@telescopic`
- `@zoomable`
- `@cross_section`
- ... and 25 more

**Data Visualization (46)** (43 uncovered):

- `@chart`
- `@graph`
- `@dashboard`
- `@annotation`
- `@overlay`
- `@exploded_view`
- `@cutaway`
- `@training_mode`
- `@simulation_mode`
- `@presentation_mode`
- ... and 33 more

**Scientific Computing (28)** (28 uncovered):

- `@narupa_integration`
- `@molecular_dynamics`
- `@energy_minimization`
- `@force_field`
- `@auto_dock`
- `@protein_visualization`
- `@ligand_visualization`
- `@chemical_bond`
- `@hydrogen_bonds`
- `@hydrophobic_surface`
- ... and 18 more

---

## Recommendations

### Immediate Actions (High Impact)

1. **Accessibility Extended**: Create `examples/accessibility/extended-accessibility.holo` demonstrating `@cognitive_assist`, `@sensory_substitution`, `@voice_only`, `@gaze_only`, `@sign_language`, `@braille_output`, `@audio_description`, `@closed_caption`
2. **Core VR Interaction**: Add `@snappable`, `@stretchable`, `@moldable`, `@timeline`, `@choreography` to `examples/quickstart/` or `examples/sample-projects/physics-playground.holo`
3. **Object Interaction**: Create `examples/interaction/object-manipulation.holo` covering `@openable`, `@closable`, `@lockable`, `@pushable`, `@pullable`, `@liftable`, `@carryable`, `@wearable`, etc.
4. **Audio Expansion**: Create `examples/audio/spatial-audio-showcase.holo` covering `@audio_occlusion`, `@audio_portal`, `@audio_material`, `@head_tracked_audio`
5. **XR Platform**: Create `examples/platforms/xr-features.holo` covering `@passthrough`, `@room_scale`, `@webxr`, `@mixed_reality`, `@spatial_awareness`

### Medium-Term Actions

6. **Visual Effects**: Create `examples/visual-effects/effects-gallery.holo` covering `@pulsing`, `@blinking`, `@fading`, `@color_shifting`, `@holographic`, `@neon_glow`, etc.
7. **Game Mechanics**: Create `examples/game-mechanics/rpg-items.holo` covering `@collectible`, `@damageable`, `@healable`, `@lootable`, `@quest_item`, `@weapon`, `@armor`
8. **Lighting**: Create `examples/lighting/light-showcase.holo` covering the 28 uncovered lighting traits
9. **Procedural Generation**: Create `examples/procedural/procedural-world.holo` covering `@procedural_terrain`, `@procedural_city`, `@wave_function_collapse`, etc.
10. **Weather**: Create `examples/weather/weather-effects.holo` covering emitters and phenomena

### Long-Term Coverage Goals

11. Robotics domain examples (213 traits in robotics-industrial.ts, currently minimal coverage)
12. Scientific computing domain examples (28 traits, zero coverage)
13. NPC roles and social systems (63 traits, zero coverage)
14. Healthcare/medical domain examples (31 traits, minimal coverage)
15. Enterprise multitenancy examples (19 traits, zero coverage)
