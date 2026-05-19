# Traits Reference

HoloScript includes **built-in traits** across source-verified categories that cover VR/AR interaction, physics, networking, audio, AI, scripting, automation, robotics, IoT, and more. Add traits with the `@` prefix.

> **Note:** This page shows a curated selection of commonly used traits. The full trait set is organized in category modules in the HoloScript core package. Use `holoscript list-traits`, MCP `list_traits`, or `docs/NUMBERS.md` to browse and verify the live inventory.

## Trait Categories Overview

| Category       | Examples                                   |
| -------------- | ------------------------------------------ |
| Core VR        | @grabbable, @physics, @collidable          |
| Interaction    | @clickable, @hoverable, @draggable         |
| Visual/Effects | @glowing, @particle_system, @weather       |
| Physics        | @rigid, @kinematic, @cloth, @fluid         |
| Networking     | @networked, @synced, @persistent           |
| Audio          | @spatial_audio, @ambient, @voice_activated |
| AI/Agents      | @behavior_tree, @pathfinding, @npc         |
| Humanoid       | @avatar, @hand_tracked, @eye_tracked       |
| Locomotion     | @teleport, @flying, @climbing              |
| UI             | @billboard, @tooltip, @menu                |
| Platform       | @visionos, @quest, @webxr                  |
| Environment    | @skybox, @terrain, @water                  |
| Nature         | @flora, @fauna, @ecosystem                 |
| Game           | @inventory, @health, @scoreboard           |
| Magic/Sci-Fi   | @spell, @shield, @hologram                 |
| Building       | @snappable, @resizable, @blueprint         |
| Emotion/Mood   | @expression, @ambient_mood                 |
| Social         | @voice_chat, @emote, @presence             |
| Media          | @video_player, @screen_share               |
| Accessibility  | @screen_reader, @haptic_guide              |
| More categories | Browse live inventory with `list_traits`  |

## Interaction Traits

| Trait        | Description                                    |
| ------------ | ---------------------------------------------- |
| `@grabbable` | Object can be picked up with hands/controllers |
| `@throwable` | Object can be thrown after grabbing            |
| `@holdable`  | Object stays in hand until released            |
| `@clickable` | Object responds to click/tap events            |
| `@hoverable` | Object responds to hover/gaze events           |
| `@draggable` | Object can be dragged in 2D/3D space           |

### Example

```hsplus
composition "WeaponDemo" {
  template "Weapon" {
    @grabbable
    @throwable
    @holdable
    geometry: "sphere"

    on_grab: { play_sound("pickup") }
    on_throw: { damage_on_impact(50) }
  }

  object "Weapon" using "Weapon" {
    position: [0, 1, -2]
  }
}
```

## Physics Traits

| Trait         | Description                                      |
| ------------- | ------------------------------------------------ |
| `@collidable` | Object participates in collision detection       |
| `@physics`    | Object has full physics simulation               |
| `@rigid`      | Rigid body dynamics                              |
| `@kinematic`  | Scripted movement, affects other physics objects |
| `@trigger`    | Collision detection without physical response    |
| `@gravity`    | Object affected by gravity                       |

### Example

```hsplus
composition "PhysicsDemo" {
  template "Ball" {
    @physics
    @gravity
    @collidable
    geometry: "sphere"
    mass: 1.0
    bounciness: 0.8
    friction: 0.3
  }

  object "Ball" using "Ball" {
    position: [0, 2, 0]
  }
}
```

## Visual Traits

| Trait          | Description                 |
| -------------- | --------------------------- |
| `@glowing`     | Object emits light          |
| `@emissive`    | Self-illuminating material  |
| `@transparent` | Object has transparency     |
| `@reflective`  | Mirror-like surface         |
| `@animated`    | Object has animation states |
| `@billboard`   | Always faces the camera     |

### Example

```hsplus
composition "VisualDemo" {
  template "Powerup" {
    @glowing
    @animated
    @billboard
    geometry: "sphere"
    glow_color: "#ff00ff"
    glow_intensity: 1.5
    animation: "pulse"
  }

  object "Powerup" using "Powerup" {
    position: [0, 1, 0]
  }
}
```

## Networking Traits

| Trait         | Description                     |
| ------------- | ------------------------------- |
| `@networked`  | State syncs across network      |
| `@synced`     | Specific properties sync        |
| `@persistent` | State persists between sessions |
| `@owned`      | Has network ownership           |
| `@host_only`  | Only host can modify            |

### Example

```hsplus
composition "NetworkDemo" {
  template "SharedDisplay" {
    @networked
    @synced
    @persistent
    geometry: "sphere"
    sync_rate: 20hz
    sync_properties: [position, rotation, state]
  }

  object "SharedDisplay" using "SharedDisplay" {
    position: [0, 1, 0]
  }
}
```

## Behavior Traits

| Trait           | Description                        |
| --------------- | ---------------------------------- |
| `@stackable`    | Objects can stack on each other    |
| `@attachable`   | Object can attach to other objects |
| `@equippable`   | Can be equipped to avatar slots    |
| `@consumable`   | Object can be consumed/used up     |
| `@destructible` | Object can be destroyed            |

## Spatial Traits

| Trait           | Description                      |
| --------------- | -------------------------------- |
| `@anchor`       | Fixed position in world space    |
| `@tracked`      | Follows a tracked point          |
| `@world_locked` | Locked to world coordinates (AR) |
| `@hand_tracked` | Follows hand position            |
| `@eye_tracked`  | Responds to eye gaze             |

## Audio Traits

| Trait              | Description             |
| ------------------ | ----------------------- |
| `@spatial_audio`   | 3D positional audio     |
| `@ambient`         | Background audio source |
| `@voice_activated` | Responds to voice input |

## State Traits

| Trait         | Description                            |
| ------------- | -------------------------------------- |
| `@state`      | Has reactive state                     |
| `@reactive`   | Automatically updates on state change  |
| `@observable` | State can be observed by other objects |
| `@computed`   | Derived state from other values        |

## Combining Traits

Traits can be combined freely:

```holo
object "MagicSword" {
  @grabbable
  @throwable
  @glowing
  @physics
  @spatial_audio
  @networked

  position: [0, 1, -2]
  glow_color: "#00ffff"

  on_grab: {
    play_sound("sword_draw")
    this.glow_intensity = 2.0
  }
}
```

## Custom Trait Parameters

Some traits accept parameters:

```hsplus
composition "ParameterDemo" {
  template "CustomBall" {
    @physics(mass: 2.0, drag: 0.1)
    @glowing(color: "#ff0000", intensity: 1.5)
    @networked(sync_rate: 30hz)
    geometry: "sphere"
  }

  object "Ball" using "CustomBall" {
    position: [0, 1, 0]
  }
}
```
