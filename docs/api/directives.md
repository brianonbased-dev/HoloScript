# HoloScript+ Structural Directives

Structural directives are scene-level metadata and configuration blocks that define the overall behavior, appearance, and capabilities of a HoloScript scene.

## Quick Reference

| Directive            | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `@manifest`          | Scene metadata (title, version, author)  |
| `@semantic`          | Semantic description blocks              |
| `@world_metadata`    | World-level settings (theme, mood, time) |
| `@zones`             | Named spatial zones                      |
| `@spawn_points`      | Player spawn locations                   |
| `@skybox`            | Skybox configuration                     |
| `@ambient_light`     | Global ambient lighting                  |
| `@directional_light` | Sun/moon directional lights              |
| `@fog`               | Volumetric fog settings                  |
| `@post_processing`   | Post-process effects                     |
| `@audio_zones`       | 3D audio regions                         |
| `@navigation`        | NavMesh configuration                    |
| `@physics_world`     | Physics simulation settings              |
| `@network_config`    | Multiplayer networking                   |
| `@performance`       | LOD and culling hints                    |
| `@accessibility`     | Accessibility configuration              |

---

## Scene Metadata

### @manifest

Defines scene metadata for packaging and discovery.

```hsplus
@manifest {
  title: "Forest Sanctuary"
  version: "1.0.0"
  author: "Studio Name"
  description: "A peaceful forest environment"
  tags: ["nature", "relaxation", "meditation"]
  thumbnail: "thumbnail.png"
  license: "CC-BY-4.0"
}
```

**Properties:**
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | string | Yes | Scene display name |
| `version` | string | Yes | Semantic version |
| `author` | string | No | Creator name |
| `description` | string | No | Scene description |
| `tags` | array | No | Discovery tags |
| `thumbnail` | string | No | Preview image path |
| `license` | string | No | License identifier |

---

### @semantic

Provides semantic annotations for AI understanding and accessibility.

```hsplus
@semantic {
  scene_type: "interactive_environment"
  primary_purpose: "education"
  audience: "general"
  content_rating: "E"
  language: "en-US"
}
```

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `scene_type` | string | Category: game, simulation, visualization, etc. |
| `primary_purpose` | string | Main use case |
| `audience` | string | Target audience |
| `content_rating` | string | Age rating (E, T, M) |
| `language` | string | Primary language code |

---

### @world_metadata

Global world settings and atmosphere.

```hsplus
@world_metadata {
  theme: "fantasy"
  mood: "mysterious"
  time_of_day: "twilight"
  weather: "clear"
  season: "autumn"
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `theme` | string | `"default"` | Visual theme |
| `mood` | string | `"neutral"` | Atmosphere mood |
| `time_of_day` | string | `"noon"` | Time: dawn, noon, dusk, night, etc. |
| `weather` | string | `"clear"` | Weather condition |
| `season` | string | `"summer"` | Season for environmental effects |

---

## Spatial Configuration

### @zones

Defines named spatial zones with specific purposes.

```hsplus
@zones {
  main_hall {
    bounds: [[0, 0, 0], [20, 10, 30]]
    purpose: "gathering"
    max_occupancy: 50
    audio_profile: "reverb_large"
  }

  quiet_room {
    bounds: [[25, 0, 0], [35, 5, 10]]
    purpose: "meditation"
    max_occupancy: 5
    ambient_volume: 0.2
  }
}
```

**Zone Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `bounds` | array | [[min_x, min_y, min_z], [max_x, max_y, max_z]] |
| `purpose` | string | Zone function |
| `max_occupancy` | number | Player limit |
| `audio_profile` | string | Zone audio preset |
| `ambient_volume` | number | Volume multiplier (0-1) |

**Events:** `on_zone_enter`, `on_zone_exit`, `on_zone_occupancy_change`

---

### @spawn_points

Defines player spawn locations.

```hsplus
@spawn_points {
  default {
    position: [0, 0, 5]
    rotation: [0, 180, 0]
    priority: 1
  }

  vip_entrance {
    position: [10, 0, 0]
    rotation: [0, 90, 0]
    condition: "has_vip_pass"
    priority: 2
  }
}
```

**Spawn Point Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `position` | array | [x, y, z] world position |
| `rotation` | array | [x, y, z] euler angles |
| `priority` | number | Selection priority (higher = preferred) |
| `condition` | string | Spawn condition expression |
| `capacity` | number | Max simultaneous spawns |

---

## Lighting & Atmosphere

### @skybox

Configures the scene skybox.

```hsplus
@skybox {
  preset: "sunset"
  time: 18.5
  clouds: true
  cloud_density: 0.4
  sun_size: 1.2
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `preset` | string | `"day"` | Preset: day, night, sunset, space, custom |
| `time` | number | `12.0` | Time of day (0-24) |
| `clouds` | boolean | `true` | Enable clouds |
| `cloud_density` | number | `0.5` | Cloud coverage (0-1) |
| `sun_size` | number | `1.0` | Sun disc size multiplier |
| `cubemap` | string | `null` | Custom cubemap path |

---

### @ambient_light

Global ambient lighting settings.

```hsplus
@ambient_light {
  color: "#404060"
  intensity: 0.3
  ground_color: "#202030"
  sky_color: "#606080"
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | string | `"#ffffff"` | Ambient light color |
| `intensity` | number | `0.5` | Light intensity |
| `ground_color` | string | `null` | Ground hemisphere color |
| `sky_color` | string | `null` | Sky hemisphere color |

---

### @directional_light

Sun/moon directional light configuration.

```hsplus
@directional_light {
  color: "#fff5e0"
  intensity: 1.2
  direction: [-0.5, -1, -0.3]
  cast_shadows: true
  shadow_resolution: 2048
  shadow_distance: 100
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `color` | string | `"#ffffff"` | Light color |
| `intensity` | number | `1.0` | Light intensity |
| `direction` | array | `[0, -1, 0]` | Light direction vector |
| `cast_shadows` | boolean | `true` | Enable shadow casting |
| `shadow_resolution` | number | `1024` | Shadow map resolution |
| `shadow_distance` | number | `50` | Maximum shadow distance |
| `shadow_bias` | number | `0.0001` | Shadow bias to prevent artifacts |

---

### @fog

Volumetric fog settings.

```hsplus
@fog {
  enabled: true
  color: "#c0d0e0"
  density: 0.02
  near: 10
  far: 100
  height_falloff: 0.5
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable fog |
| `color` | string | `"#ffffff"` | Fog color |
| `density` | number | `0.01` | Fog density |
| `near` | number | `1` | Fog start distance |
| `far` | number | `100` | Full fog distance |
| `height_falloff` | number | `0` | Vertical fog falloff |

---

### @post_processing

Post-processing effect stack.

```hsplus
@post_processing {
  bloom: {
    enabled: true
    intensity: 0.5
    threshold: 0.8
  }

  vignette: {
    enabled: true
    intensity: 0.3
  }

  color_grading: {
    enabled: true
    saturation: 1.1
    contrast: 1.05
    temperature: 0.1
  }
}
```

**Effect Properties:**
| Effect | Properties |
|--------|------------|
| `bloom` | `enabled`, `intensity`, `threshold`, `radius` |
| `vignette` | `enabled`, `intensity`, `smoothness`, `color` |
| `color_grading` | `enabled`, `saturation`, `contrast`, `temperature`, `tint` |
| `depth_of_field` | `enabled`, `focus_distance`, `aperture`, `blur_amount` |
| `motion_blur` | `enabled`, `intensity`, `samples` |
| `ambient_occlusion` | `enabled`, `intensity`, `radius` |

---

## Audio Configuration

### @audio_zones

3D audio region configuration.

```hsplus
@audio_zones {
  concert_hall {
    bounds: [[0, 0, 0], [50, 20, 30]]
    reverb: "large_hall"
    reverb_amount: 0.8
    lowpass: 0
  }

  outdoor {
    bounds: [[50, 0, 0], [200, 50, 200]]
    reverb: "outdoor"
    reverb_amount: 0.2
  }
}
```

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `bounds` | array | Zone bounding box |
| `reverb` | string | Reverb preset |
| `reverb_amount` | number | Reverb intensity (0-1) |
| `lowpass` | number | Low-pass filter frequency (0 = off) |
| `volume_multiplier` | number | Zone volume scale |

---

## System Configuration

### @navigation

NavMesh and pathfinding configuration.

```hsplus
@navigation {
  enabled: true
  agent_radius: 0.5
  agent_height: 1.8
  step_height: 0.4
  slope_limit: 45
  auto_generate: true
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable navigation |
| `agent_radius` | number | `0.5` | Agent collision radius |
| `agent_height` | number | `2.0` | Agent height |
| `step_height` | number | `0.3` | Max step height |
| `slope_limit` | number | `45` | Max walkable slope (degrees) |
| `auto_generate` | boolean | `true` | Auto-generate NavMesh |

---

### @physics_world

Physics simulation settings.

```hsplus
@physics_world {
  gravity: [0, -9.81, 0]
  time_step: 0.016
  substeps: 4
  solver_iterations: 10
  enable_ccd: true
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `gravity` | array | `[0, -9.81, 0]` | Gravity vector |
| `time_step` | number | `0.016` | Physics timestep |
| `substeps` | number | `4` | Substeps per frame |
| `solver_iterations` | number | `10` | Constraint solver iterations |
| `enable_ccd` | boolean | `true` | Continuous collision detection |
| `broadphase` | string | `"dbvt"` | Broadphase algorithm |

---

### @network_config

Multiplayer networking settings.

```hsplus
@network_config {
  max_players: 16
  tick_rate: 30
  interpolation: true
  client_prediction: true
  authority: "server"
  voice_chat: true
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `max_players` | number | `8` | Maximum concurrent players |
| `tick_rate` | number | `20` | Network tick rate (Hz) |
| `interpolation` | boolean | `true` | Enable position interpolation |
| `client_prediction` | boolean | `true` | Enable client-side prediction |
| `authority` | string | `"server"` | Authority model: server, owner, hybrid |
| `voice_chat` | boolean | `false` | Enable voice chat |

---

### @performance

Performance optimization hints.

```hsplus
@performance {
  lod_bias: 1.0
  culling_distance: 500
  shadow_distance: 100
  max_lights: 8
  texture_quality: "high"
  target_fps: 90
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `lod_bias` | number | `1.0` | LOD distance multiplier |
| `culling_distance` | number | `500` | Object culling distance |
| `shadow_distance` | number | `100` | Shadow rendering distance |
| `max_lights` | number | `8` | Maximum dynamic lights |
| `texture_quality` | string | `"high"` | Texture quality: low, medium, high |
| `target_fps` | number | `60` | Target frame rate |

---

### @accessibility

Accessibility configuration.

```hsplus
@accessibility {
  subtitles: true
  subtitle_size: "large"
  high_contrast: false
  motion_sensitivity: "normal"
  colorblind_mode: "none"
  screen_reader: true
}
```

**Properties:**
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `subtitles` | boolean | `true` | Enable subtitles |
| `subtitle_size` | string | `"medium"` | Size: small, medium, large |
| `high_contrast` | boolean | `false` | High contrast mode |
| `motion_sensitivity` | string | `"normal"` | Motion: reduced, normal, full |
| `colorblind_mode` | string | `"none"` | Mode: none, deuteranopia, protanopia, tritanopia |
| `screen_reader` | boolean | `false` | Screen reader support |

---

## Logic Blocks

### Function Definitions

Define reusable functions within objects.

```hsplus
composition controller {
  function toggle_lights(state: boolean) {
    lights.forEach(light => light.enabled = state)
  }

  function play_sound(name: string, volume: number = 1.0) {
    audio.play(name, { volume: volume })
  }
}
```

### Event Handlers

Built-in lifecycle and interaction handlers.

```hsplus
composition game_manager {
  on_scene_load: {
    initialize_game()
    spawn_players()
  }

  on_tick: {
    update_timer()
    check_win_condition()
  }

  on_player_join: (player) {
    assign_team(player)
    spawn_at_base(player)
  }
}
```

**Built-in Events:**
| Event | Trigger |
|-------|---------|
| `on_scene_load` | Scene initialization complete |
| `on_tick` | Every frame update |
| `on_player_join` | Player connects |
| `on_player_leave` | Player disconnects |

---

## Templates

### Template Definitions

Create reusable object templates.

```hsplus
template "Interactable Button" {
  @clickable
  @hoverable(scale_on_hover: 1.1)
  @haptic(intensity: 0.3)

  color: "#3080ff"

  on_click: { this.activate() }
}
```

### Template Instantiation

Use templates with the `using` keyword.

```hsplus
composition start_button using "Interactable Button" {
  position: [0, 1, -2]
  label: "Start Game"

  on_click: { start_game() }  // Override
}

composition settings_button using "Interactable Button" {
  position: [2, 1, -2]
  label: "Settings"
  color: "#808080"  // Override default color
}
```

---

## Environment Block

### Combined Lighting Setup

Use environment blocks for scene-wide lighting configuration.

```hsplus
environment {
  @skybox(preset: "sunset", clouds: true)
  @ambient_light(color: "#604040", intensity: 0.4)
  @directional_light(
    color: "#ffc080"
    intensity: 1.5
    direction: [-0.3, -0.8, -0.5]
    cast_shadows: true
  )
  @fog(color: "#d0a080", density: 0.01)
}
```

---

_Last updated: 2026-01-28_
