# HoloScript VR Traits Reference

Complete API reference for all **1,800+ VR traits** in HoloScript v3.42.0. Traits are now modularized into 74 specialized categories (Physics, AI, Magic, etc.).

---

## Table of Contents

1. [Trait Handler Pattern](#trait-handler-pattern)
2. [Interaction Traits](#interaction-traits)
3. [Physics Traits](#physics-traits)
4. [AI/Behavior Traits](#aibehavior-traits)
5. [Audio Traits](#audio-traits)
6. [Accessibility Traits](#accessibility-traits)
7. [AR/Spatial Traits](#arspatial-traits)
8. [Web3/Blockchain Traits](#web3blockchain-traits)
9. [Media Traits](#media-traits)
10. [Social/Multiplayer Traits](#socialmultiplayer-traits)
11. [IoT/Integration Traits](#iotintegration-traits)
12. [Visual Traits](#visual-traits)
13. [Advanced Traits](#advanced-traits)

---

## Trait Handler Pattern

All traits follow the `TraitHandler` pattern:

```typescript
interface TraitHandler<TConfig> {
  name: VRTraitName;
  defaultConfig: TConfig;
  onAttach?: (node, config, context) => void; // Called when trait is added
  onDetach?: (node, config, context) => void; // Called when trait is removed
  onUpdate?: (node, config, context, delta) => void; // Called each frame
  onEvent?: (node, config, context, event) => void; // Called on events
}
```

### TraitContext

```typescript
interface TraitContext {
  emit: (event: string, payload?: unknown) => void;
  getState: () => Record<string, unknown>;
  setState: (updates: Record<string, unknown>) => void;
  vr: VRContext; // Hand/headset tracking
  physics: PhysicsContext;
  audio: AudioContext;
  haptics: HapticsContext;
  accessibility?: AccessibilityContext;
}
```

---

## Interaction Traits

### @grabbable

**Category:** Interaction
**Tags:** physics, hands, grab, movement

Hand-based grab interactions for VR objects.

```hsplus
object Ball @grabbable {
  geometry: 'sphere'
}

object Ball @grabbable(grab_distance: 0.5, require_trigger: true) {
  geometry: 'sphere'
}
```

| Config               | Type    | Default   | Description                     |
| -------------------- | ------- | --------- | ------------------------------- |
| `grab_distance`      | number  | 0.3       | Maximum grab distance in meters |
| `require_trigger`    | boolean | true      | Require trigger press to grab   |
| `allow_remote_grab`  | boolean | false     | Allow grabbing from distance    |
| `highlight_on_hover` | boolean | true      | Visual feedback on hover        |
| `two_hand_mode`      | string  | 'average' | 'average', 'dominant', 'scale'  |

**Events:**

- `grab_start` - Object grabbed
- `grab_end` - Object released
- `grab_switch_hand` - Transferred between hands

---

### @throwable

**Category:** Interaction
**Tags:** physics, throw, velocity, ballistic

Physics-based throwing when released from grab.

```hsplus
object Ball @grabbable @throwable {
  geometry: 'sphere'
}

object Ball @throwable(velocity_multiplier: 1.5, spin_enabled: true) {
  geometry: 'sphere'
}
```

| Config                   | Type    | Default | Description           |
| ------------------------ | ------- | ------- | --------------------- |
| `velocity_multiplier`    | number  | 1.0     | Throw velocity scale  |
| `max_velocity`           | number  | 20.0    | Maximum throw speed   |
| `spin_enabled`           | boolean | true    | Allow spin on release |
| `angular_velocity_scale` | number  | 1.0     | Rotation speed scale  |

**Events:**

- `throw_start` - Object thrown with velocity data
- `throw_end` - Object stopped moving

---

### @pointable

Laser pointer/ray interaction.

```hsplus
object Button @pointable {
  geometry: 'cube'

  onPoint: {
    self.color = 'green'
  }
}
```

| Config             | Type   | Default   | Description            |
| ------------------ | ------ | --------- | ---------------------- |
| `pointer_distance` | number | 10.0      | Max raycast distance   |
| `highlight_color`  | string | '#00ff00' | Hover highlight color  |
| `cursor_type`      | string | 'dot'     | 'dot', 'ring', 'arrow' |

**Events:**

- `point_enter` - Pointer enters object
- `point_exit` - Pointer leaves object
- `point_click` - Pointer activated on object

---

### @hoverable

Hover state and visual feedback.

```hsplus
object MenuItem @hoverable {
  geometry: 'plane'

  onHoverEnter: { self.scale *= 1.1 }
  onHoverExit: { self.scale /= 1.1 }
}
```

| Config        | Type   | Default | Description            |
| ------------- | ------ | ------- | ---------------------- |
| `hover_scale` | number | 1.0     | Scale change on hover  |
| `hover_color` | string | null    | Color change on hover  |
| `hover_sound` | string | null    | Sound to play on hover |

**Events:**

- `hover_enter` - Pointer/hand enters
- `hover_exit` - Pointer/hand exits

---

### @draggable

Continuous drag movement on surfaces.

```hsplus
object Slider @draggable(constrain_axis: 'x') {
  geometry: 'cube'
}
```

| Config           | Type    | Default | Description                     |
| ---------------- | ------- | ------- | ------------------------------- |
| `constrain_axis` | string  | null    | 'x', 'y', 'z', or null for free |
| `surface_only`   | boolean | false   | Constrain to surface            |
| `snap_to_grid`   | number  | 0       | Grid snap size (0 = off)        |

**Events:**

- `drag_start` - Drag initiated
- `drag_move` - Position updated
- `drag_end` - Drag released

---

### @scalable

Two-handed scaling gestures.

```hsplus
object Model @grabbable @scalable {
  geometry: 'model/object.glb'
}

object Model @scalable(min_scale: 0.5, max_scale: 3.0) {
  geometry: 'model/object.glb'
}
```

| Config          | Type    | Default | Description            |
| --------------- | ------- | ------- | ---------------------- |
| `min_scale`     | number  | 0.1     | Minimum scale limit    |
| `max_scale`     | number  | 10.0    | Maximum scale limit    |
| `uniform_scale` | boolean | true    | Scale all axes equally |

**Events:**

- `scale_start` - Scaling gesture started
- `scale_change` - Scale value changed
- `scale_end` - Scaling gesture ended

---

## Physics Traits

### @cloth

Real-time cloth simulation with wind, gravity, and tearing.

```hsplus
object Cape @cloth(resolution: 32, stiffness: 0.8) {
  geometry: 'plane'
}
```

| Config           | Type    | Default | Description                    |
| ---------------- | ------- | ------- | ------------------------------ |
| `resolution`     | number  | 32      | Grid resolution (NxN vertices) |
| `stiffness`      | number  | 0.8     | Constraint stiffness (0-1)     |
| `damping`        | number  | 0.01    | Velocity damping               |
| `mass`           | number  | 1.0     | Total cloth mass               |
| `gravity_scale`  | number  | 1.0     | Gravity multiplier             |
| `wind_response`  | number  | 0.5     | Wind force multiplier          |
| `self_collision` | boolean | false   | Enable self-collision          |
| `tearable`       | boolean | false   | Allow tearing                  |
| `tear_threshold` | number  | 100     | Force required to tear         |
| `pin_vertices`   | Array   | []      | Pinned vertex coordinates      |

**Events:**

- `cloth_create` - Simulation initialized
- `cloth_destroy` - Simulation destroyed
- `cloth_pin_vertex` - Vertex pinned
- `cloth_unpin_vertex` - Vertex unpinned
- `cloth_tear` - Cloth torn (if tearable)

---

### @fluid

Particle-based fluid simulation.

```hsplus
object Water @fluid(particle_count: 10000, viscosity: 0.01) {
  geometry: 'cube'
}
```

| Config              | Type    | Default   | Description                 |
| ------------------- | ------- | --------- | --------------------------- |
| `particle_count`    | number  | 10000     | Maximum particles           |
| `viscosity`         | number  | 0.01      | Fluid thickness             |
| `surface_tension`   | number  | 0.1       | Surface tension force       |
| `color`             | string  | '#0088ff' | Fluid color                 |
| `spawn_rate`        | number  | 100       | Particles per second        |
| `lifetime`          | number  | 10        | Particle lifetime (seconds) |
| `gravity_scale`     | number  | 1.0       | Gravity multiplier          |
| `collision_enabled` | boolean | true      | Collide with objects        |

**Events:**

- `fluid_create` - Simulation started
- `fluid_destroy` - Simulation stopped
- `fluid_add_emitter` - Emitter added
- `fluid_remove_emitter` - Emitter removed

---

### @rope

Segment-based rope physics with tension and slack.

```hsplus
object SwingingRope @rope(segments: 20, length: 5) {
  start: [0, 5, 0]
  end: [0, 0, 0]
}
```

| Config              | Type    | Default   | Description                |
| ------------------- | ------- | --------- | -------------------------- |
| `segments`          | number  | 10        | Number of segments         |
| `length`            | number  | 1.0       | Total rope length (meters) |
| `stiffness`         | number  | 0.9       | Segment stiffness          |
| `damping`           | number  | 0.1       | Velocity damping           |
| `gravity`           | number  | 9.81      | Gravity force              |
| `thickness`         | number  | 0.02      | Visual thickness           |
| `color`             | string  | '#8B4513' | Rope color                 |
| `collision_enabled` | boolean | true      | Collide with objects       |

**State:**

- `points` - Array of `{x, y, z}` positions (segments + 1 points)
- `isSimulating` - Whether simulation is active
- `tension` - Current rope tension

**Events:**

- `rope_create` - Rope initialized
- `rope_destroy` - Rope destroyed
- `rope_break` - Rope broken (if breakable)

---

### @soft_body

Deformable soft body physics.

```hsplus
object JellyBlob @soft_body(pressure: 1.0, volume_conservation: 0.9) {
  geometry: 'sphere'
}
```

| Config                | Type   | Default | Description                  |
| --------------------- | ------ | ------- | ---------------------------- |
| `pressure`            | number | 1.0     | Internal pressure            |
| `volume_conservation` | number | 0.9     | How much volume is preserved |
| `stiffness`           | number | 0.5     | Edge stiffness               |
| `damping`             | number | 0.1     | Velocity damping             |
| `mass`                | number | 1.0     | Total mass                   |

**Events:**

- `soft_body_create` - Simulation initialized
- `soft_body_destroy` - Simulation destroyed
- `soft_body_deform` - Significant deformation occurred

---

### @buoyancy

Water buoyancy simulation.

```hsplus
object Boat @buoyancy(water_level: 0, density: 0.7) {
  geometry: 'model/boat.glb'
}
```

| Config         | Type   | Default | Description                 |
| -------------- | ------ | ------- | --------------------------- |
| `water_level`  | number | 0       | Y-position of water surface |
| `density`      | number | 1.0     | Object density (< 1 floats) |
| `drag`         | number | 0.5     | Water resistance            |
| `angular_drag` | number | 0.3     | Rotational resistance       |

---

### @destruction

Breakable objects with fracture simulation.

```hsplus
object Vase @destruction(fracture_count: 8, break_threshold: 50) {
  geometry: 'model/vase.glb'
}
```

| Config            | Type   | Default | Description            |
| ----------------- | ------ | ------- | ---------------------- |
| `fracture_count`  | number | 8       | Number of fragments    |
| `break_threshold` | number | 50      | Impact force to break  |
| `debris_lifetime` | number | 5       | Seconds before cleanup |
| `explosion_force` | number | 10      | Fragment scatter force |

**Events:**

- `destruction_break` - Object broken
- `destruction_fragment` - Fragment created

---

## AI/Behavior Traits

### @llm_agent

**Category:** AI
**Tags:** llm, agent, processing, autonomy, brain

LLM-powered decision-making with tool calling.

```hsplus
object NPC @llm_agent(model: 'gpt-4', temperature: 0.7) {
  system_prompt: "You are a helpful shopkeeper..."
  tools: ['get_inventory', 'sell_item', 'buy_item']
}
```

| Config                  | Type    | Default | Description                |
| ----------------------- | ------- | ------- | -------------------------- |
| `model`                 | string  | 'gpt-4' | LLM model identifier       |
| `system_prompt`         | string  | ''      | System message             |
| `temperature`           | number  | 0.7     | Creativity (0-1)           |
| `context_window`        | number  | 8192    | Max tokens                 |
| `tools`                 | Array   | []      | Available tool definitions |
| `max_actions_per_turn`  | number  | 3       | Action limit per turn      |
| `bounded_autonomy`      | boolean | true    | Limit autonomous actions   |
| `escalation_conditions` | Array   | []      | When to escalate           |
| `rate_limit_ms`         | number  | 1000    | Min time between requests  |

**State:**

- `conversationHistory` - Message history
- `isProcessing` - Currently processing
- `pendingToolCalls` - Pending tool invocations

**Events:**

- `llm_message` - Message received
- `llm_response` - Response generated
- `llm_tool_call` - Tool invoked
- `llm_escalate` - Escalation triggered

---

### @behavior_tree

**Category:** AI
**Tags:** bt, logic, decision, npc, state

Behavior tree AI with node-based logic.

```hsplus
object Guard @behavior_tree {
  root: sequence [
    condition 'can_see_player',
    action 'chase_player',
    action 'attack'
  ]
}
```

| Config                         | Type    | Default | Description         |
| ------------------------------ | ------- | ------- | ------------------- |
| `tick_rate`                    | number  | 10      | Updates per second  |
| `debug_mode`                   | boolean | false   | Show node execution |
| `interrupt_on_higher_priority` | boolean | true    | Priority interrupts |

**Events:**

- `bt_node_enter` - Node started
- `bt_node_success` - Node succeeded
- `bt_node_failure` - Node failed
- `bt_tree_complete` - Full tree evaluated

---

### @goal_oriented

Goal-oriented action planning (GOAP).

```hsplus
object Worker @goal_oriented {
  goals: ['gather_resources', 'build_shelter']
  actions: ['chop_wood', 'mine_stone', 'craft']
}
```

| Config            | Type   | Default | Description               |
| ----------------- | ------ | ------- | ------------------------- |
| `planning_depth`  | number | 5       | Max action chain length   |
| `replan_interval` | number | 1000    | Replanning frequency (ms) |

**Events:**

- `goal_selected` - New goal chosen
- `goal_achieved` - Goal completed
- `action_started` - Action begun
- `action_completed` - Action finished

---

### @perception

**Category:** AI
**Tags:** vision, hearing, sense, detection, npc

Sensory perception with line-of-sight and detection.

```hsplus
object Sentry @perception(view_angle: 90, view_distance: 20) {
  detect_tags: ['player', 'enemy']
}
```

| Config            | Type   | Default | Description               |
| ----------------- | ------ | ------- | ------------------------- |
| `view_angle`      | number | 120     | Field of view (degrees)   |
| `view_distance`   | number | 10      | Max sight distance        |
| `hearing_radius`  | number | 5       | Sound detection radius    |
| `memory_duration` | number | 5000    | How long to remember (ms) |

**State:**

- `visibleTargets` - Currently visible entities
- `heardSounds` - Recent sounds detected
- `memory` - Remembered but not visible

**Events:**

- `perception_spotted` - Target spotted
- `perception_lost` - Target lost
- `perception_heard` - Sound detected

---

### @emotion

Emotional state machine with expressions.

```hsplus
object Pet @emotion {
  emotions: ['happy', 'sad', 'angry', 'neutral']
  default_emotion: 'neutral'
}
```

| Config                  | Type   | Default | Description            |
| ----------------------- | ------ | ------- | ---------------------- |
| `decay_rate`            | number | 0.1     | How fast emotions fade |
| `expression_blend_time` | number | 500     | Blend duration (ms)    |

**State:**

- `currentEmotion` - Active emotion
- `emotionIntensity` - Intensity (0-1)
- `emotionHistory` - Recent emotions

**Events:**

- `emotion_changed` - Emotion transitioned
- `emotion_triggered` - Emotion stimulus received

---

### @memory

Long-term memory and recall for NPCs.

```hsplus
object Historian @memory(capacity: 100, consolidation_interval: 60000) {
  memory_types: ['events', 'conversations', 'locations']
}
```

| Config                   | Type   | Default | Description            |
| ------------------------ | ------ | ------- | ---------------------- |
| `capacity`               | number | 100     | Max memories stored    |
| `consolidation_interval` | number | 60000   | Memory cleanup (ms)    |
| `importance_threshold`   | number | 0.3     | Min importance to keep |

**Events:**

- `memory_store` - Memory saved
- `memory_recall` - Memory retrieved
- `memory_forget` - Memory discarded

---

## Audio Traits

### @spatial_audio

**Category:** Audio
**Tags:** 3d, sound, spatial, hrtf, immersion

3D spatial audio with HRTF.

```hsplus
object Radio @spatial_audio {
  audio_src: 'music.mp3'
  rolloff: 'logarithmic'
}
```

| Config         | Type   | Default  | Description                       |
| -------------- | ------ | -------- | --------------------------------- |
| `rolloff`      | string | 'linear' | 'linear', 'logarithmic', 'custom' |
| `min_distance` | number | 1.0      | Full volume distance              |
| `max_distance` | number | 100      | Zero volume distance              |
| `cone_inner`   | number | 360      | Inner cone (degrees)              |
| `cone_outer`   | number | 360      | Outer cone (degrees)              |

---

### @reverb_zone

Environmental reverb areas.

```hsplus
object CaveArea @reverb_zone(preset: 'cave', mix: 0.7) {
  geometry: 'cube'
  scale: [20, 10, 20]
}
```

| Config       | Type   | Default | Description                       |
| ------------ | ------ | ------- | --------------------------------- |
| `preset`     | string | 'room'  | 'room', 'hall', 'cave', 'outdoor' |
| `mix`        | number | 0.5     | Wet/dry mix (0-1)                 |
| `decay_time` | number | 1.5     | Reverb decay (seconds)            |

---

### @ambisonics

First-order ambisonic audio.

```hsplus
object Environment @ambisonics {
  source: 'forest_ambience.amb'
  format: 'FuMa'
}
```

| Config   | Type   | Default    | Description           |
| -------- | ------ | ---------- | --------------------- |
| `format` | string | 'ACN_SN3D' | 'FuMa', 'ACN_SN3D'    |
| `order`  | number | 1          | Ambisonic order (1-3) |

---

### @voice_proximity

Proximity-based voice chat.

```hsplus
zone VoiceArea @voice_proximity(falloff_start: 1, falloff_end: 10) {
  geometry: 'sphere'
  radius: 10
}
```

| Config          | Type    | Default | Description          |
| --------------- | ------- | ------- | -------------------- |
| `falloff_start` | number  | 1       | Full volume distance |
| `falloff_end`   | number  | 10      | Zero volume distance |
| `directional`   | boolean | false   | Face-to-face boost   |

---

## Accessibility Traits

### @alt_text

**Category:** Accessibility
**Tags:** screen-reader, vision-impairment, description, text

Alternative text for screen readers.

```hsplus
object Logo @alt_text("Company logo - blue square with letter H") {
  geometry: 'plane'
  texture: 'logo.png'
}
```

| Config     | Type   | Default  | Description           |
| ---------- | ------ | -------- | --------------------- |
| `text`     | string | ''       | Description text      |
| `priority` | string | 'polite' | 'polite', 'assertive' |

---

### @screen_reader

Screen reader focus and navigation.

```hsplus
object Menu @screen_reader(role: 'menu', label: 'Main navigation') {
  children: [...]
}
```

| Config        | Type    | Default   | Description      |
| ------------- | ------- | --------- | ---------------- |
| `role`        | string  | 'generic' | ARIA-like role   |
| `label`       | string  | ''        | Accessible name  |
| `live_region` | boolean | false     | Announce changes |

---

### @high_contrast

High contrast mode support.

```hsplus
object Button @high_contrast {
  normal_color: '#333'
  high_contrast_color: '#FFF'
}
```

| Config         | Type    | Default | Description       |
| -------------- | ------- | ------- | ----------------- |
| `border_width` | number  | 2       | Border in HC mode |
| `invert`       | boolean | false   | Invert colors     |

---

### @motion_reduced

Reduced motion accessibility.

```hsplus
object Spinner @motion_reduced {
  animation: 'spin'  // Disabled when preference set
}
```

| Config               | Type    | Default | Description             |
| -------------------- | ------- | ------- | ----------------------- |
| `fallback_animation` | string  | 'none'  | Alternative animation   |
| `reduce_parallax`    | boolean | true    | Reduce parallax effects |

---

### @subtitle

Subtitle/caption display.

```hsplus
object VideoPlayer @subtitle {
  subtitle_src: 'captions.vtt'
  language: 'en'
}
```

| Config               | Type   | Default  | Description      |
| -------------------- | ------ | -------- | ---------------- |
| `font_size`          | number | 24       | Text size        |
| `background_opacity` | number | 0.75     | Background alpha |
| `position`           | string | 'bottom' | 'top', 'bottom'  |

---

## AR/Spatial Traits

### @anchor

**Category:** AR/Spatial
**Tags:** anchor, persistence, world, tracking

AR world anchor.

```hsplus
object ARObject @anchor {
  persist: true
}
```

| Config          | Type    | Default | Description              |
| --------------- | ------- | ------- | ------------------------ |
| `persist`       | boolean | false   | Save across sessions     |
| `tracking_mode` | string  | 'world' | 'world', 'image', 'face' |

---

### @plane_detection

AR plane detection and placement.

```hsplus
object PlacementSystem @plane_detection {
  plane_types: ['horizontal', 'vertical']
  min_area: 0.5
}
```

| Config        | Type    | Default        | Description             |
| ------------- | ------- | -------------- | ----------------------- |
| `plane_types` | Array   | ['horizontal'] | Plane orientations      |
| `min_area`    | number  | 0.25           | Minimum plane area (m²) |
| `visualize`   | boolean | true           | Show plane visuals      |

**Events:**

- `plane_detected` - New plane found
- `plane_updated` - Plane boundaries changed
- `plane_lost` - Plane no longer tracked

---

### @mesh_detection

AR environment mesh reconstruction.

```hsplus
object MeshScanner @mesh_detection {
  classification: true
  lod: 'medium'
}
```

| Config            | Type    | Default  | Description             |
| ----------------- | ------- | -------- | ----------------------- |
| `classification`  | boolean | false    | Semantic labeling       |
| `lod`             | string  | 'medium' | 'low', 'medium', 'high' |
| `update_interval` | number  | 100      | Update rate (ms)        |

---

### @occlusion

AR occlusion for realistic rendering.

```hsplus
object ARCharacter @occlusion {
  people_occlusion: true
  environment_occlusion: true
}
```

| Config                  | Type    | Default | Description             |
| ----------------------- | ------- | ------- | ----------------------- |
| `people_occlusion`      | boolean | true    | Occlude behind people   |
| `environment_occlusion` | boolean | true    | Occlude behind surfaces |

---

### @light_estimation

AR lighting estimation.

```hsplus
object ARObject @light_estimation {
  apply_ambient: true
  apply_directional: true
}
```

| Config              | Type    | Default | Description             |
| ------------------- | ------- | ------- | ----------------------- |
| `apply_ambient`     | boolean | true    | Apply ambient light     |
| `apply_directional` | boolean | true    | Apply directional light |
| `apply_reflections` | boolean | false   | Apply environment map   |

---

### @vps

Visual Positioning System (Google VPS, Niantic).

```hsplus
location Museum @vps(location_id: 'museum_001') {
  position: [37.7749, -122.4194]
}
```

| Config               | Type   | Default | Description             |
| -------------------- | ------ | ------- | ----------------------- |
| `location_id`        | string | ''      | VPS location identifier |
| `accuracy_threshold` | number | 0.5     | Required accuracy (m)   |

---

### @geospatial_anchor

Geospatial positioning (GPS + VPS).

```hsplus
object Monument @geospatial_anchor {
  latitude: 37.7749
  longitude: -122.4194
  altitude: 10
}
```

| Config          | Type   | Default   | Description           |
| --------------- | ------ | --------- | --------------------- |
| `latitude`      | number | 0         | Latitude              |
| `longitude`     | number | 0         | Longitude             |
| `altitude`      | number | 0         | Altitude (meters)     |
| `altitude_mode` | string | 'terrain' | 'terrain', 'absolute' |

---

## Web3/Blockchain Traits

### @token_gated

Token-based access control.

```hsplus
object VIPRoom @token_gated(chain: 'ethereum', min_balance: 1) {
  contract_address: '0x...'
  token_type: 'erc721'
  fallback_behavior: 'blur'
}
```

| Config              | Type   | Default    | Description                           |
| ------------------- | ------ | ---------- | ------------------------------------- |
| `chain`             | string | 'ethereum' | 'ethereum', 'polygon', 'solana', etc. |
| `contract_address`  | string | ''         | Token contract address                |
| `token_id`          | string | ''         | Specific token ID (ERC1155)           |
| `min_balance`       | number | 1          | Required token balance                |
| `token_type`        | string | 'erc721'   | 'erc721', 'erc1155', 'erc20'          |
| `fallback_behavior` | string | 'hide'     | 'hide', 'blur', 'lock', 'message'     |
| `gate_message`      | string | ''         | Message for blocked users             |
| `verify_interval`   | number | 0          | Re-verify interval (ms)               |

**Events:**

- `token_gate_verify` - Verification requested
- `token_gate_balance_result` - Balance check complete
- `token_gate_access_granted` - Access granted
- `token_gate_access_denied` - Access denied

---

### @wallet

Web3 wallet connection.

```hsplus
object ConnectButton @wallet {
  supported_chains: ['ethereum', 'polygon']
  auto_connect: true
}
```

| Config             | Type    | Default      | Description           |
| ------------------ | ------- | ------------ | --------------------- |
| `supported_chains` | Array   | ['ethereum'] | Supported blockchains |
| `auto_connect`     | boolean | false        | Auto-connect on load  |
| `required_chain`   | string  | null         | Force specific chain  |

**State:**

- `isConnected` - Connection status
- `address` - Connected wallet address
- `chainId` - Current chain ID

**Events:**

- `wallet_connect` - Wallet connected
- `wallet_disconnect` - Wallet disconnected
- `wallet_chain_changed` - Chain switched
- `wallet_account_changed` - Account changed

---

### @nft

NFT display and metadata.

```hsplus
object Artwork @nft {
  contract: '0x...'
  token_id: '123'
  chain: 'ethereum'
}
```

| Config            | Type    | Default    | Description      |
| ----------------- | ------- | ---------- | ---------------- |
| `contract`        | string  | ''         | Contract address |
| `token_id`        | string  | ''         | Token ID         |
| `chain`           | string  | 'ethereum' | Blockchain       |
| `auto_load_media` | boolean | true       | Load NFT media   |

**Events:**

- `nft_loaded` - Metadata loaded
- `nft_media_loaded` - Media loaded

---

### @marketplace

In-world marketplace for digital assets.

```hsplus
object Shop @marketplace {
  currency: 'eth'
  fee_percentage: 2.5
}
```

| Config           | Type    | Default | Description      |
| ---------------- | ------- | ------- | ---------------- |
| `currency`       | string  | 'eth'   | Payment currency |
| `fee_percentage` | number  | 0       | Platform fee     |
| `escrow_enabled` | boolean | true    | Use escrow       |

**Events:**

- `marketplace_list` - Item listed
- `marketplace_purchase` - Item purchased
- `marketplace_transfer` - Item transferred

---

## Media Traits

### @gaussian_splat

Gaussian splatting for photorealistic 3D capture.

```hsplus
object ScannedRoom @gaussian_splat {
  source: 'room.ply'
  quality: 'high'
}
```

| Config       | Type   | Default    | Description             |
| ------------ | ------ | ---------- | ----------------------- |
| `source`     | string | ''         | PLY file path           |
| `quality`    | string | 'medium'   | 'low', 'medium', 'high' |
| `sort_mode`  | string | 'distance' | Render sort mode        |
| `max_splats` | number | 1000000    | Max splat count         |

**Events:**

- `splat_loaded` - Data loaded
- `splat_render_start` - Rendering started
- `splat_render_complete` - Frame complete
- `splat_error` - Load/render error

---

### @nerf

Neural Radiance Field rendering.

```hsplus
object CapturedScene @nerf {
  model_path: 'scene.nerf'
  resolution: 512
}
```

| Config       | Type   | Default | Description       |
| ------------ | ------ | ------- | ----------------- |
| `model_path` | string | ''      | NeRF model path   |
| `resolution` | number | 256     | Render resolution |
| `near_plane` | number | 0.1     | Near clipping     |
| `far_plane`  | number | 100     | Far clipping      |

---

### @volumetric_video

Volumetric video playback (8i, HoloStream).

```hsplus
object Performer @volumetric_video {
  source: 'performance.hvd'
  format: '8i'
}
```

| Config        | Type    | Default | Description       |
| ------------- | ------- | ------- | ----------------- |
| `source`      | string  | ''      | Video source path |
| `format`      | string  | 'hvd'   | Format type       |
| `loop`        | boolean | false   | Loop playback     |
| `autoplay`    | boolean | false   | Auto-start        |
| `buffer_size` | number  | 30      | Buffer frames     |

**State:**

- `playbackState` - 'idle', 'loading', 'playing', 'paused', 'error'
- `currentTime` - Current position
- `duration` - Total duration
- `bufferedPercent` - Buffer progress

**Events:**

- `volume_loaded` - Video loaded
- `volume_play` - Playback started
- `volume_pause` - Playback paused
- `volume_ended` - Playback ended
- `on_volume_playbackState_change` - State changed

---

### @photogrammetry

Photogrammetry asset with LOD.

```hsplus
object Statue @photogrammetry {
  base_path: 'statue/'
  lod_levels: 4
}
```

| Config               | Type   | Default | Description    |
| -------------------- | ------ | ------- | -------------- |
| `base_path`          | string | ''      | Asset path     |
| `lod_levels`         | number | 3       | Number of LODs |
| `texture_resolution` | number | 2048    | Texture size   |

---

### @point_cloud

Point cloud visualization.

```hsplus
object LidarScan @point_cloud {
  source: 'scan.las'
  point_size: 2
}
```

| Config       | Type   | Default  | Description                  |
| ------------ | ------ | -------- | ---------------------------- |
| `source`     | string | ''       | Point cloud file             |
| `point_size` | number | 1        | Point render size            |
| `max_points` | number | 10000000 | Max points to render         |
| `color_mode` | string | 'rgb'    | 'rgb', 'intensity', 'height' |

---

## Social/Multiplayer Traits

### @networked

Network synchronization.

```hsplus
object SharedCube @networked {
  sync_position: true
  sync_rotation: true
  sync_rate: 20
}
```

| Config            | Type    | Default | Description             |
| ----------------- | ------- | ------- | ----------------------- |
| `sync_position`   | boolean | true    | Sync position           |
| `sync_rotation`   | boolean | true    | Sync rotation           |
| `sync_scale`      | boolean | false   | Sync scale              |
| `sync_rate`       | number  | 20      | Updates per second      |
| `interpolation`   | boolean | true    | Smooth updates          |
| `ownership_model` | string  | 'host'  | 'host', 'any', 'sticky' |

**Events:**

- `network_spawn` - Object spawned
- `network_despawn` - Object despawned
- `network_owner_changed` - Ownership transferred

---

### @lobby

Lobby/room management.

```hsplus
system Lobby @lobby {
  max_players: 8
  matchmaking: true
}
```

| Config        | Type    | Default | Description       |
| ------------- | ------- | ------- | ----------------- |
| `max_players` | number  | 16      | Max room capacity |
| `matchmaking` | boolean | false   | Auto matchmaking  |
| `visible`     | boolean | true    | Publicly listed   |
| `password`    | string  | ''      | Room password     |

**Events:**

- `lobby_join` - Player joined
- `lobby_leave` - Player left
- `lobby_full` - Room at capacity

---

### @remote_presence

Avatar representation for remote users.

```hsplus
object RemotePlayer @remote_presence {
  avatar_type: 'humanoid'
  voice_enabled: true
}
```

| Config           | Type    | Default    | Description             |
| ---------------- | ------- | ---------- | ----------------------- |
| `avatar_type`    | string  | 'humanoid' | Avatar style            |
| `voice_enabled`  | boolean | true       | Enable voice            |
| `tracking_level` | string  | 'full'     | 'head', 'upper', 'full' |

---

### @spectator

Spectator mode for observers.

```hsplus
object SpectatorCam @spectator {
  can_fly: true
  follow_player: true
}
```

| Config               | Type    | Default | Description        |
| -------------------- | ------- | ------- | ------------------ |
| `can_fly`            | boolean | true    | Free movement      |
| `follow_player`      | boolean | false   | Auto-follow player |
| `visible_to_players` | boolean | false   | Show to players    |

---

## IoT/Integration Traits

### @twin_sync

**Category:** IoT/Industrial
**Tags:** iot, twin, synchronization, sensors, industry

Bidirectional synchronization between HoloScript objects and real-world industrial sensors or digital twins.

```hsplus
object IndustrialArm @twin_sync(topic: "factory/cell_01/arm", interval: 100) {
  geometry: "models/arm.glb"
}
```

| Config     | Type   | Default | Description                             |
| ---------- | ------ | ------- | --------------------------------------- |
| `topic`    | string | null    | MQTT/REST endpoint or topic name        |
| `interval` | number | 100     | Sync frequency in milliseconds          |
| `mode`     | string | 'push'  | 'push' (real → virtual), 'pull', 'both' |
| `protocol` | string | 'mqtt'  | 'mqtt', 'opc-ua', 'rest'                |

**State:**

- `lastUpdate` - Timestamp of last sync
- `sensorData` - Raw data from the twin
- `isConnected` - Connection status

**Events:**

- `twin_connect` - Connection established
- `twin_data` - New data received
- `twin_disconnect` - Connection lost
- `twin_error` - Synchronization error

### @twin_actuator

**Category:** IoT/Industrial
**Tags:** actuator, control, physical, bridge

Triggers physical actions from virtual interactions.

```hsplus
object FactorySwitch @twin_actuator(actuator_id: "arm_01_reset") {
  geometry: "models/switch.glb"
  onInteraction: {
    emit "twin_trigger" { action: "reset" }
  }
}
```

| Config        | Type   | Default | Description                        |
| ------------- | ------ | ------- | ---------------------------------- |
| `actuator_id` | string | null    | Unique ID of the physical hardware |
| `protocol`    | string | 'mqtt'  | 'mqtt', 'rest'                     |

**Events:**

- `twin_trigger` - Emitted to target physical hardware
- `twin_actuated` - Confirmed completion from physical hardware

### @mqtt_source

MQTT message subscription.

## AI/Autonomous Traits

### @mitosis

**Category:** AI/Sovereignty
**Tags:** mitosis, agent, spawn, delegation

Enables an object or agent to recursively spawn sub-compositions via specialized sub-agents.

```hsplus
object MasterBuilder @mitosis(strategy: "collaborative") {
  onInteraction: {
    mitotic_spawn "lighting" "Create a volumetric scene for this room"
  }
}
```

| Config     | Type   | Default         | Description                            |
| ---------- | ------ | --------------- | -------------------------------------- |
| `strategy` | string | 'collaborative' | 'collaborative', 'autonomous', 'gated' |
| `max_subs` | number | 5               | Maximum allowable sub-compositions     |

**Events:**

- `mitosis_spawned` - Sub-composition successfully loaded
- `mitosis_failed` - Delegation failure
- `mitosis_synced` - Child state merged with parent

```hsplus
object SensorDisplay @mqtt_source {
  broker: 'wss://mqtt.example.com'
  topic: 'sensors/temperature'
}
```

| Config     | Type   | Default | Description         |
| ---------- | ------ | ------- | ------------------- |
| `broker`   | string | ''      | MQTT broker URL     |
| `topic`    | string | ''      | Subscribe topic     |
| `qos`      | number | 0       | QoS level (0, 1, 2) |
| `username` | string | ''      | Auth username       |
| `password` | string | ''      | Auth password       |

**Events:**

- `mqtt_connected` - Connected to broker
- `mqtt_message` - Message received
- `mqtt_disconnected` - Disconnected

---

### @mqtt_sink

MQTT message publishing.

```hsplus
object ControlPanel @mqtt_sink {
  broker: 'wss://mqtt.example.com'
  topic: 'controls/light'
}
```

| Config   | Type    | Default | Description     |
| -------- | ------- | ------- | --------------- |
| `broker` | string  | ''      | MQTT broker URL |
| `topic`  | string  | ''      | Publish topic   |
| `qos`    | number  | 0       | QoS level       |
| `retain` | boolean | false   | Retain messages |

---

### @wot_thing

Web of Things thing description.

```hsplus
object SmartLight @wot_thing {
  thing_id: 'urn:dev:wot:light-001'
  actions: ['toggle', 'dim']
  properties: ['brightness', 'color']
}
```

| Config       | Type   | Default | Description           |
| ------------ | ------ | ------- | --------------------- |
| `thing_id`   | string | ''      | Thing identifier      |
| `td_url`     | string | ''      | Thing Description URL |
| `actions`    | Array  | []      | Available actions     |
| `properties` | Array  | []      | Observable properties |

---

### @digital_twin

Digital twin synchronization.

```hsplus
object FactoryMachine @digital_twin {
  twin_id: 'machine-001'
  sync_interval: 1000
}
```

| Config          | Type    | Default | Description     |
| --------------- | ------- | ------- | --------------- |
| `twin_id`       | string  | ''      | Twin identifier |
| `sync_interval` | number  | 1000    | Sync rate (ms)  |
| `bidirectional` | boolean | false   | Two-way sync    |

**Events:**

- `twin_sync` - State synchronized
- `twin_diverge` - State diverged

---

## Visual Traits

### @glowing

Adds emissive glow effect to objects.

```hsplus
object Crystal @glowing {
  geometry: 'crystal'
  color: '#00ffff'
}

object Crystal @glowing(intensity: 2.0, color: '#ff00ff') {
  geometry: 'crystal'
}
```

| Config      | Type    | Default      | Description                    |
| ----------- | ------- | ------------ | ------------------------------ |
| `intensity` | number  | 1.0          | Glow brightness (0-10)         |
| `color`     | string  | object color | Glow color (optional override) |
| `pulse`     | boolean | false        | Enable pulsing effect          |

---

### @transparent

Makes object semi-transparent with configurable opacity.

```hsplus
object GlassPane @transparent {
  geometry: 'plane'
  opacity: 0.5
}

object GlassPane @transparent(opacity: 0.3, refraction: true) {
  geometry: 'cube'
}
```

| Config       | Type    | Default | Description              |
| ------------ | ------- | ------- | ------------------------ |
| `opacity`    | number  | 0.5     | Transparency level (0-1) |
| `refraction` | boolean | false   | Enable light refraction  |

---

### @spinning

Continuous rotation animation on an axis.

```hsplus
object Fan @spinning {
  geometry: 'model/fan.glb'
}

object Fan @spinning(axis: 'y', speed: 2.0) {
  geometry: 'model/fan.glb'
}
```

| Config  | Type   | Default | Description                   |
| ------- | ------ | ------- | ----------------------------- |
| `axis`  | string | 'y'     | Rotation axis ('x', 'y', 'z') |
| `speed` | number | 1.0     | Rotations per second          |

---

### @floating

Gentle floating/bobbing animation effect.

```hsplus
object composition @floating {
  geometry: 'sphere'
}

object composition @floating(amplitude: 0.5, speed: 0.5) {
  geometry: 'sphere'
}
```

| Config      | Type   | Default | Description            |
| ----------- | ------ | ------- | ---------------------- |
| `amplitude` | number | 0.2     | Float height in meters |
| `speed`     | number | 1.0     | Float cycle speed      |

---

### @billboard

Always faces the camera/user.

```hsplus
object Label @billboard {
  geometry: 'plane'
  text: 'Hello'
}

object Label @billboard(lock_y: true) {
  geometry: 'plane'
}
```

| Config   | Type    | Default | Description           |
| -------- | ------- | ------- | --------------------- |
| `lock_y` | boolean | false   | Only rotate on Y axis |

---

### @pulse

Pulsing scale or color animation.

```hsplus
object Beacon @pulse {
  geometry: 'sphere'
  color: 'red'
}

object Beacon @pulse(property: 'scale', min: 0.8, max: 1.2) {
  geometry: 'sphere'
}
```

| Config     | Type   | Default | Description                                     |
| ---------- | ------ | ------- | ----------------------------------------------- |
| `property` | string | 'color' | Property to pulse ('scale', 'color', 'opacity') |
| `min`      | number | 0.5     | Minimum value                                   |
| `max`      | number | 1.0     | Maximum value                                   |
| `speed`    | number | 1.0     | Pulse cycles per second                         |

---

### @animated

Plays embedded animations from 3D model.

```hsplus
object Character @animated {
  geometry: 'model/character.glb'
  animation: 'idle'
}

object Character @animated(loop: true, blend: 0.3) {
  geometry: 'model/character.glb'
}
```

| Config      | Type    | Default | Description            |
| ----------- | ------- | ------- | ---------------------- |
| `animation` | string  | 'idle'  | Default animation name |
| `loop`      | boolean | true    | Loop animation         |
| `blend`     | number  | 0.2     | Blend time in seconds  |

**Events:**

- `animation_start` - Animation started
- `animation_end` - Animation completed (non-looping)

---

### @look_at

Object rotates to face a target.

```hsplus
object Turret @look_at {
  target: 'Player'
}

object Turret @look_at(target: 'Player', axis: 'y', speed: 2.0) {
  geometry: 'model/turret.glb'
}
```

| Config   | Type   | Default  | Description                  |
| -------- | ------ | -------- | ---------------------------- |
| `target` | string | 'camera' | Target object ID or 'camera' |
| `axis`   | string | 'all'    | Rotation constraint          |
| `speed`  | number | 5.0      | Rotation speed               |

---

### @outline

Adds outline/silhouette effect.

```hsplus
object Selected @outline {
  geometry: 'cube'
}

object Selected @outline(color: '#ff0', width: 3) {
  geometry: 'cube'
}
```

| Config  | Type   | Default | Description        |
| ------- | ------ | ------- | ------------------ |
| `color` | string | '#fff'  | Outline color      |
| `width` | number | 2       | Outline width (px) |

---

### @proximity

Triggers events when objects/players are nearby.

```hsplus
object Sensor @proximity {
  range: 5
}

object Sensor @proximity(range: 10, target: 'Player') {
  on_enter: { print('Player nearby') }
}
```

| Config   | Type   | Default | Description               |
| -------- | ------ | ------- | ------------------------- |
| `range`  | number | 5       | Detection radius (meters) |
| `target` | string | 'all'   | Target type to detect     |

**Events:**

- `proximity_enter` - Target entered range
- `proximity_exit` - Target left range

---

## Advanced Traits

### @teleport

Enables teleportation locomotion.

```hsplus
object TeleportPad @teleport {
  geometry: 'cylinder'
  destination: [10, 0, 10]
}

object TeleportPad @teleport(fade_duration: 0.5) {
  destination: 'SpawnPoint'
}
```

| Config          | Type         | Default | Description           |
| --------------- | ------------ | ------- | --------------------- |
| `destination`   | array/string | null    | Target position or ID |
| `fade_duration` | number       | 0.3     | Fade transition time  |

---

### @ui_panel

Creates an interactive 2D UI panel in 3D space.

```hsplus
object Menu @ui_panel {
  width: 400
  height: 300
}

object Menu @ui_panel(curved: true, follow_gaze: true) {
  content: 'ui/menu.html'
}
```

| Config        | Type    | Default | Description          |
| ------------- | ------- | ------- | -------------------- |
| `width`       | number  | 512     | Panel width (px)     |
| `height`      | number  | 512     | Panel height (px)    |
| `curved`      | boolean | false   | Curved panel surface |
| `follow_gaze` | boolean | false   | Panel follows user   |

---

### @particle_system

Attaches a particle emitter to the object.

```hsplus
object Fire @particle_system {
  preset: 'fire'
}

object Fire @particle_system(rate: 100, lifetime: 2.0) {
  texture: 'particles/spark.png'
}
```

| Config     | Type   | Default | Description             |
| ---------- | ------ | ------- | ----------------------- |
| `preset`   | string | null    | Built-in preset name    |
| `rate`     | number | 50      | Particles per second    |
| `lifetime` | number | 1.0     | Particle lifetime (sec) |

---

### @weather

Applies weather effects to a zone.

```hsplus
object WeatherZone @weather {
  type: 'rain'
}

object WeatherZone @weather(type: 'snow', intensity: 0.8) {
  radius: 50
}
```

| Config      | Type   | Default | Description                    |
| ----------- | ------ | ------- | ------------------------------ |
| `type`      | string | 'clear' | 'rain', 'snow', 'fog', 'clear' |
| `intensity` | number | 0.5     | Weather intensity (0-1)        |
| `radius`    | number | 100     | Effect radius (meters)         |

---

### @day_night

Day/night cycle controller.

```hsplus
object Sun @day_night {
  cycle_duration: 600
}

object Sun @day_night(start_time: 12, speed: 1.0) {
  geometry: 'sphere'
}
```

| Config           | Type   | Default | Description            |
| ---------------- | ------ | ------- | ---------------------- |
| `cycle_duration` | number | 1200    | Full cycle time (sec)  |
| `start_time`     | number | 6       | Starting hour (0-24)   |
| `speed`          | number | 1.0     | Cycle speed multiplier |

---

### @lod

Level of detail switching based on distance.

```hsplus
object Building @lod {
  levels: ['high.glb', 'med.glb', 'low.glb']
  distances: [10, 30, 60]
}
```

| Config      | Type  | Default      | Description               |
| ----------- | ----- | ------------ | ------------------------- |
| `levels`    | array | []           | Model paths per LOD       |
| `distances` | array | [10, 30, 60] | Switch distances (meters) |

---

### @hand_tracking

Enables hand tracking gesture interaction.

```hsplus
object Interactive @hand_tracking {
  gestures: ['pinch', 'grab', 'point']
}
```

| Config     | Type  | Default           | Description         |
| ---------- | ----- | ----------------- | ------------------- |
| `gestures` | array | ['pinch', 'grab'] | Recognized gestures |

**Events:**

- `gesture_detected` - Gesture recognized
- `hand_enter` - Hand entered object bounds
- `hand_exit` - Hand left object bounds

---

### @haptic

Triggers haptic feedback on controller.

```hsplus
object Button @haptic {
  intensity: 0.5
  duration: 100
}

object Button @haptic(pattern: 'pulse', intensity: 0.8) {
  on_click: { haptic.play() }
}
```

| Config      | Type   | Default  | Description               |
| ----------- | ------ | -------- | ------------------------- |
| `intensity` | number | 0.5      | Vibration strength (0-1)  |
| `duration`  | number | 100      | Duration in milliseconds  |
| `pattern`   | string | 'single' | 'single', 'pulse', 'buzz' |

---

### @portal

Creates a portal to another scene.

```hsplus
object Portal @portal {
  destination: 'LobbyScene'
}

object Portal @portal(preview: true, destination: 'GameWorld') {
  geometry: 'torus'
}
```

| Config        | Type    | Default | Description              |
| ------------- | ------- | ------- | ------------------------ |
| `destination` | string  | null    | Target scene name        |
| `preview`     | boolean | true    | Show destination preview |

---

### @mirror

Creates a real-time reflective surface.

```hsplus
object Mirror @mirror {
  geometry: 'plane'
}

object Mirror @mirror(quality: 0.5, blur: 0.1) {
  geometry: 'plane'
  scale: [2, 3, 1]
}
```

| Config    | Type   | Default | Description            |
| --------- | ------ | ------- | ---------------------- |
| `quality` | number | 1.0     | Reflection resolution  |
| `blur`    | number | 0       | Reflection blur amount |

---

## Quick Reference Card

### Most Common Traits

| Trait            | Use Case                    |
| ---------------- | --------------------------- |
| `@grabbable`     | Pickable VR objects         |
| `@pointable`     | UI buttons, raycast targets |
| `@networked`     | Multiplayer sync            |
| `@token_gated`   | NFT-gated access            |
| `@anchor`        | AR placement                |
| `@spatial_audio` | 3D sound                    |
| `@llm_agent`     | AI NPCs                     |
| `@cloth`         | Capes, flags, curtains      |

### Trait Combinations

```hsplus
// Throwable ball
object Ball @grabbable @throwable @networked {
  geometry: 'sphere'
  physics: { mass: 0.5 }
}

// Accessible button
object Button @pointable @hoverable @alt_text("Submit form") {
  geometry: 'plane'
}

// AI shopkeeper
object Merchant @llm_agent @emotion @lip_sync @avatar_embodiment {
  model: 'gpt-4'
  system_prompt: "You run a fantasy item shop..."
}

// AR furniture
object Chair @anchor @occlusion @light_estimation {
  geometry: 'model/chair.glb'
}
```

---

## Version History

| Version | Changes                                            |
| ------- | -------------------------------------------------- |
| 3.0.5   | Added Visual and Advanced traits (71 traits total) |
| 3.0.4   | All 38 trait handlers fully implemented            |
| 3.0.0   | Initial trait system with 12 handlers              |
| 2.0.0   | Parser support for all 49 traits (now 1,800+)      |
