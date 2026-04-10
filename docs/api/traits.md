## Quick Reference

### By Domain

> **Note:** This reference documents the full trait design space. Not all traits listed below have runtime implementations yet. For currently implemented traits (~57), see `packages/runtime/src/traits/`. For parser-validated traits (~37), see `packages/core/src/parser/ErrorRecovery.ts`.

| Domain                 | Traits                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core Interaction**   | `@grabbable` `@throwable` `@pointable` `@hoverable` `@scalable` `@rotatable` `@stackable` `@snappable` `@breakable` `@haptic` `@stretchable` `@moldable` `@interactive` `@clickable`                                       |
| **Humanoid/Avatar**    | `@skeleton` `@body` `@face` `@expressive` `@hair` `@clothing` `@hands` `@character_voice` `@locomotion` `@poseable` `@morph` `@avatar_embodiment` `@spectator` `@role`                                                     |
| **Environment**        | `@plane_detection` `@mesh_detection` `@anchor` `@persistent_anchor` `@shared_anchor` `@geospatial` `@occlusion` `@light_estimation` `@geospatial_anchor` `@terrain_anchor` `@rooftop_anchor` `@vps` `@poi` `@world_locked` |
| **Input Modality**     | `@eye_tracking` `@hand_tracking` `@controller` `@spatial_accessory` `@body_tracking` `@face_tracking`                                                                                                                      |
| **Accessibility**      | `@accessible` `@alt_text` `@spatial_audio_cue` `@sonification` `@haptic_cue` `@magnifiable` `@high_contrast` `@motion_reduced` `@subtitle` `@screen_reader`                                                                |
| **Volumetric**         | `@gaussian_splat` `@nerf` `@volumetric_video` `@point_cloud` `@photogrammetry`                                                                                                                                             |
| **WebGPU Compute**     | `@compute` `@gpu_particle` `@gpu_physics` `@gpu_buffer`                                                                                                                                                                    |
| **Digital Twin & IoT** | `@sensor` `@digital_twin` `@data_binding` `@alert` `@heatmap_3d`                                                                                                                                                           |
| **Auto-Agents**        | `@behavior_tree` `@goal_oriented` `@llm_agent` `@memory` `@perception` `@emotion` `@dialogue` `@faction` `@patrol` `@npc` `@dialog`                                                                                        |
| **Spatial Audio**      | `@ambisonics` `@hrtf` `@reverb_zone` `@audio_occlusion` `@audio_portal` `@audio_material` `@head_tracked_audio` `@spatial_audio` `@ambient` `@voice_activated`                                                             |
| **Interoperability**   | `@usd` `@gltf` `@fbx` `@material_x` `@scene_graph` `@portable`                                                                                                                                                             |
| **Web3 & Ownership**   | `@nft` `@token_gated` `@wallet` `@marketplace`                                                                                                                                                                             |
| **Physics**            | `@cloth` `@fluid` `@soft_body` `@rope` `@chain` `@wind` `@buoyancy` `@destruction` `@physics` `@collidable` `@rigidbody` `@joint` `@trigger`                                                                               |
| **State & Logic**      | `@state` `@reactive` `@observable` `@computed` `@synced` `@persistent` `@owned` `@host_only`                                                                                                                               |
| **Visual Effects**     | `@animation` `@timeline` `@choreography` `@particle` `@transition` `@filter` `@trail` `@glowing` `@emissive` `@transparent` `@reflective` `@animated` `@billboard` `@rotating` `@lod`                                      |
| **Behavioral**         | `@equippable` `@consumable` `@proactive` `@narrator`                                                                                                                                                                       |

---

## Interaction Traits

### @grabbable

Makes object pickable with hands/controllers.

```hsplus
template "Item" {
  @grabbable
  @grabbable(snap_to_hand: true)
  @grabbable(haptic_on_grab: 0.7, two_handed: false)
  geometry: "sphere"
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `snap_to_hand` | boolean | `false` | Object snaps to grip position |
| `haptic_on_grab` | number | `0` | Haptic intensity (0-1) |
| `two_handed` | boolean | `false` | Requires both hands |
| `throw_on_release` | boolean | `true` | Enable throwing |

**Events:** `on_grab`, `on_release`, `on_grab_start`, `on_grab_end`

---

### @throwable

Enables physics-based throwing.

```hsplus
template "Ball" {
  @grabbable
  @throwable
  @throwable(velocity_multiplier: 2.0, bounce: true)
  geometry: "sphere"
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `velocity_multiplier` | number | `1.0` | Throw force multiplier |
| `bounce` | boolean | `false` | Enable bouncing |
| `bounce_factor` | number | `0.5` | Bounce energy retention |
| `max_velocity` | number | `50` | Maximum throw speed |

**Events:** `on_throw`, `on_land`, `on_bounce`

---

### @holdable

Object stays in hand until button release.

```hsplus
template "Torch" {
  @grabbable
  @holdable(grip_button: "trigger")
  geometry: "cylinder"
}
```

---

### @clickable

Object responds to click/tap/trigger.

```hsplus
template "Button" {
  @clickable
  @clickable(hold_time: 500ms, double_click: true)
  geometry: "box"

  on_click: { activate_door() }
}
```

**Events:** `on_click`, `on_double_click`, `on_hold`, `on_release`

---

### @hoverable

Object responds to hover/gaze.

```hsplus
template "Indicator" {
  @hoverable
  @hoverable(scale_on_hover: 1.2, glow: true)
  geometry: "sphere"
}
```

**Events:** `on_hover_enter`, `on_hover_exit`, `on_hover`

---

### @draggable

Object can be dragged in 2D/3D space.

```hsplus
template "Slider" {
  @draggable(axis: "x", min: 0, max: 10)
  geometry: "box"
}
```

---

## Physics Traits

### @collidable

Participates in collision detection.

```hsplus
template "Wall" {
  @collidable
  @collidable(layer: "environment", continuous: true)
  geometry: "box"
}
```

**Events:** `on_collision_enter`, `on_collision_exit`, `on_collision_stay`

---

### @physics

Full rigid body physics simulation.

```hsplus
template "Crate" {
  @physics
  @physics(mass: 5.0, drag: 0.1, angular_drag: 0.05)
  geometry: "box"
}
```

**Parameters:**
| Parameter | Type | Default |
|-----------|------|---------|
| `mass` | number | `1.0` |
| `drag` | number | `0` |
| `angular_drag` | number | `0.05` |
| `use_gravity` | boolean | `true` |
| `is_kinematic` | boolean | `false` |
| `freeze_rotation` | boolean | `false` |

---

### @rigid

Rigid body without gravity.

```hsplus
template "FloatingPlatform" {
  @rigid
  @collidable
  geometry: "box"
}
```

---

### @kinematic

Scripted movement that affects physics objects.

```hsplus
template "Elevator" {
  @kinematic
  @collidable
  geometry: "box"

  function move_up() {
    animate position to [0, 10, 0] over 5s
  }
}
```

---

### @trigger

Collision detection without physical response.

```hsplus
template "Zone" {
  @trigger
  geometry: "box"

  on_trigger_enter: { start_battle() }
  on_trigger_exit: { end_battle() }
}
```

---

### @gravity

Object affected by gravity.

```hsplus
template "GravityBall" {
  @gravity
  @gravity(strength: 9.81, direction: [0, -1, 0])
  geometry: "sphere"
}
```

---

## Visual Traits

### @glowing

Object emits light.

```hsplus
template "Lamp" {
  @glowing
  @glowing(color: "#ff0000", intensity: 2.0, range: 10)
  geometry: "sphere"
}
```

---

### @emissive

Self-illuminating material (no light emission to scene).

```hsplus
template "Sign" {
  @emissive(color: "#00ffff", intensity: 1.5)
  geometry: "plane"
}
```

---

### @transparent

Transparency/opacity control.

```hsplus
template "Glass" {
  @transparent(opacity: 0.5, double_sided: true)
  geometry: "box"
}
```

---

### @reflective

Mirror-like surface.

```hsplus
template "Mirror" {
  @reflective(strength: 1.0, blur: 0)
  geometry: "plane"
}
```

---

### @animated

Object has animation states.

```hsplus
template "Character" {
  @animated
  geometry: "humanoid"

  animations: {
    idle: "idle.anim",
    walk: "walk.anim",
    run: "run.anim"
  }

  function start_walking() {
    play_animation("walk")
  }
}
```

---

### @billboard

Always faces the camera.

```hsplus
template "Label" {
  @billboard
  @billboard(lock_y: true)  // Only rotate on Y axis
  geometry: "plane"
}
```

---

### @rotating

Continuous rotation animation.

```hsplus
template "Spinner" {
  @rotating
  @rotating(speed: 45, axis: "y")
  @rotating(speed: 90, axis: [1, 0, 1])  // Custom axis
  geometry: "sphere"
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `speed` | number | `30` | Rotation speed (degrees/second) |
| `axis` | string/array | `"y"` | Rotation axis: "x", "y", "z", or [x,y,z] |
| `clockwise` | boolean | `true` | Rotation direction |
| `paused` | boolean | `false` | Start paused |

**Events:** `on_rotation_start`, `on_rotation_pause`, `on_rotation_cycle`

---

### @interactive

General interactivity marker (enables all input modes).

```hsplus
template "InteractiveButton" {
  @interactive
  @interactive(modes: ["click", "hover", "grab"])
  @interactive(cursor: "pointer", highlight: true)
  geometry: "box"
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `modes` | array | `["click", "hover"]` | Enabled interaction modes |
| `cursor` | string | `"default"` | Cursor style on hover |
| `highlight` | boolean | `true` | Highlight on interaction |
| `sound` | string | `null` | Interaction sound effect |

**Events:** `on_interact`, `on_focus`, `on_blur`

---

### @lod

Level of Detail switching for performance optimization.

```hsplus
template "ComplexModel" {
  @lod
  @lod(distances: [10, 30, 100])
  @lod(levels: ["high.glb", "medium.glb", "low.glb"])
  geometry: "mesh"
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `distances` | array | `[10, 25, 50]` | Switch distances in meters |
| `levels` | array | `null` | Model files for each LOD |
| `fade` | boolean | `true` | Fade between LOD levels |
| `fade_duration` | number | `200` | Fade duration in ms |
| `bias` | number | `0` | Distance bias adjustment |

**Events:** `on_lod_change`

---

## Networking Traits

### @networked

State syncs across network.

```hsplus
template "SharedObject" {
  @networked
  @networked(sync_rate: 30hz, interpolation: true)
  geometry: "sphere"
}
```

**Parameters:**
| Parameter | Type | Default |
|-----------|------|---------|
| `sync_rate` | frequency | `20hz` |
| `interpolation` | boolean | `true` |
| `authority` | string | `"server"` |

---

### @synced

Mark specific properties for sync.

```hsplus
template "SyncedPlayer" {
  @synced(properties: [position, rotation, health])
  geometry: "humanoid"
}
```

---

### @persistent

State persists between sessions.

```hsplus
template "SavePoint" {
  @persistent
  @persistent(key: "player_progress")
  geometry: "cylinder"
}
```

---

### @owned

Has network ownership (only owner can modify).

```hsplus
template "PlayerAvatar" {
  @networked
  @owned
  geometry: "humanoid"
}
```

---

### @host_only

Only host can modify.

```hsplus
template "GameManager" {
  @networked
  @host_only
  geometry: "box"
}
```

---

## Behavior Traits

### @stackable

Objects can stack on each other.

```hsplus
template "Block" {
  @stackable(axis: "y", max_stack: 10)
  geometry: "box"
}
```

---

### @attachable

Object can attach to other objects.

```hsplus
template "Scope" {
  @attachable(attach_points: ["weapon_rail"])
  geometry: "cylinder"
}
```

---

### @equippable

Can be equipped to avatar slots.

```hsplus
template "Helmet" {
  @equippable(slot: "head", auto_fit: true)
  geometry: "sphere"
}
```

---

### @consumable

Object can be consumed/used up.

```hsplus
template "Potion" {
  @consumable
  geometry: "cylinder"

  on_consume: {
    player.health += 50
    this.destroy()
  }
}
```

---

### @destructible

Object can be destroyed.

```hsplus
template "DestructibleCrate" {
  @destructible
  @destructible(health: 100, fragments: 8, explosion: true)
  geometry: "box"

  on_destroy: { spawn_loot() }
}
```

---

## Spatial Traits

### @anchor

Fixed position in world space.

```hsplus
template "Waypoint" {
  @anchor
  geometry: "sphere"
}
```

---

### @tracked

Follows a tracked point (controller, hand, etc).

```hsplus
template "Pointer" {
  @tracked(source: "right_controller")
  geometry: "cone"
}
```

---

### @world_locked

Locked to world coordinates (AR).

```hsplus
template "ARMarker" {
  @world_locked
  geometry: "plane"
}
```

---

### @hand_tracked

Follows hand skeleton.

```hsplus
template "Ring" {
  @hand_tracked(hand: "left", joint: "ring_finger_tip")
  geometry: "torus"
}
```

---

### @eye_tracked

Responds to eye gaze with dwell activation and highlighting.

```hsplus
template "GazeTarget" {
  @eye_tracked
  @eye_tracked(dwell_enabled: true, dwell_time: 1000ms)
  @eye_tracked(gaze_highlight: true, highlight_color: "#00ffff")
  geometry: "sphere"

  on_gaze_enter: { highlight() }
  on_gaze_exit: { unhighlight() }
  on_dwell_activate: { click() }
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dwell_enabled` | boolean | `true` | Enable dwell-to-activate |
| `dwell_time` | duration | `1000ms` | Time to dwell for activation |
| `dwell_feedback` | boolean | `true` | Show progress indicator |
| `gaze_highlight` | boolean | `true` | Highlight when gazed at |
| `highlight_color` | string | `"#00ffff"` | Highlight color |
| `gaze_scale` | number | `1.1` | Scale multiplier when gazed |
| `foveated_priority` | string | `"medium"` | Rendering priority (low/medium/high) |
| `smooth_pursuit` | boolean | `false` | Object follows gaze smoothly |

**Events:** `on_gaze_enter`, `on_gaze_exit`, `on_dwell_progress`, `on_dwell_activate`

---

### @seated

Optimizes object for seated VR users with comfort options.

```hsplus
template "SeatedPlayer" {
  @seated
  @seated(auto_calibrate: true, snap_turn_angle: 45)
  @seated(comfort_vignette: true, max_reach: 1.0)
  geometry: "humanoid"
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `height_offset` | number | `0` | Height adjustment (meters) |
| `max_reach` | number | `1.0` | Maximum forward reach |
| `auto_calibrate` | boolean | `true` | Auto-calibrate seated height |
| `comfort_vignette` | boolean | `true` | Vignette on rotation |
| `snap_turn_angle` | number | `45` | Snap turn degrees (0 = smooth) |
| `play_bounds` | array | `[1.5, 1.5]` | Play area [width, depth] |

**Events:** `on_seated_calibrated`, `on_turn_left`, `on_turn_right`

---

### @haptic

Advanced haptic feedback with patterns and proximity.

```hsplus
template "VibratingObject" {
  @haptic
  @haptic(intensity: 0.7, collision_pattern: "metal")
  @haptic(proximity_enabled: true, proximity_distance: 0.5)
  geometry: "sphere"
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `intensity` | number | `0.5` | Base haptic intensity (0-1) |
| `proximity_enabled` | boolean | `false` | Enable proximity-based haptics |
| `proximity_distance` | number | `0.5` | Distance for proximity haptics |
| `collision_pattern` | string | `"soft"` | Pattern: soft/hard/metal/glass/custom |
| `hands` | string | `"dominant"` | Which hands: both/left/right/dominant |
| `duration` | number | `100` | Haptic pulse duration (ms) |

**Built-in Patterns:**

- `soft` - Gentle tap
- `hard` - Strong impact
- `metal` - Metallic ring
- `glass` - Delicate break

**Events:** `on_haptic_start`, `on_haptic_end`

---

## Audio Traits

### @spatial_audio

3D positional audio.

```hsplus
template "Speaker" {
  @spatial_audio
  @spatial_audio(falloff: "linear", max_distance: 20)
  geometry: "box"
  audio_source: "music.mp3"
}
```

---

### @ambient

Background audio source.

```hsplus
template "EnvironmentSound" {
  @ambient(loop: true, volume: 0.5)
  geometry: "sphere"
  audio_source: "forest.mp3"
}
```

---

### @voice_activated

Responds to voice input.

```hsplus
template "VoiceController" {
  @voice_activated
  geometry: "sphere"

  commands: {
    "open door": { open_door() },
    "lights on": { toggle_lights(true) }
  }
}
```

---

## State Traits

### @state

Has reactive state.

```hsplus
template "Counter" {
  @state
  geometry: "box"

  state {
    count: 0
  }

  on_click: { state.count++ }
}
```

---

### @reactive

Automatically updates on state change.

```hsplus
template "Display" {
  @reactive
  geometry: "plane"

  text: "Count: ${state.count}"
}
```

---

### @observable

State can be observed by other objects.

```hsplus
template "HealthBar" {
  @observable
  geometry: "box"

  state {
    health: 100
  }
}

template "HealthDisplay" {
  @observe(target: "health_bar", property: "health")
  geometry: "plane"

  on_change: { update_display(value) }
}
```

---

### @computed

Derived state from other values.

```hsplus
template "Stats" {
  @state
  geometry: "box"

  state {
    attack: 10
    defense: 5
  }

  @computed power = attack * 2 + defense
}
```

---

## Autonomous Agent Traits

### @llm_agent

LLM-powered decision-making with bounded autonomy.

```hsplus
template "Assistant" {
  @llm_agent(model: "gemini-1.5-pro", context_window: 10)
  geometry: "humanoid"
  system_prompt: "You are a helpful museum guide."
  @on_llm_response: (text) -> { speak(text) }
}
```

### @behavior_tree

Declarative behavior tree for complex NPC logic.

```hsplus
template "Guard" {
  @behavior_tree
  geometry: "humanoid"
  root: {
    type: "selector",
    children: [
      { type: "action", action: "attack", condition: "player_visible" },
      { type: "action", action: "patrol" }
    ]
  }
}
```

---

## High-Performance Compute

### @compute

WebGPU-accelerated compute shaders.

```hsplus
template "Simulation" {
  @compute(shader_source: "fluid.wgsl", workgroup_size: [16, 16, 1])
  geometry: "mesh"
  @on_compute_complete: () -> { update_mesh() }
}
```

---

_Note: This is a living document. For a full list of all 165+ traits, see the [VRTraitSystem.ts](file:///c:/Users/josep/Documents/GitHub/HoloScript/packages/core/src/traits/VRTraitSystem.ts)._
