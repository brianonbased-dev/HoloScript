# Introduction to Traits

Welcome to Lesson 1.6! In this lesson, you'll learn about **traits** - the powerful system that adds behaviors and capabilities to your objects.

## What are Traits?

Traits are HoloScript's way of adding reusable behaviors to objects. Instead of writing complex code, you simply add a trait with the `@` symbol:

```hs
composition box {
  @grabbable    // Now this object can be grabbed in VR!
  geometry: "cube"
}
```

## Core VR Traits

### @grabbable

Allows users to pick up and hold the object:

```hs
composition ball {
  @grabbable
  geometry: "sphere"
  position: [0, 1.5, -1]
}
```

### @throwable

Enables throwing with velocity based on hand movement:

```hs
composition throwingBall {
  @grabbable
  @throwable
  geometry: "sphere"

  onThrow: {
    // Called when released with velocity
  }
}
```

### @pointable

Makes the object respond to pointing/laser pointer:

```hs
composition button {
  @pointable
  geometry: "cube"
  scale: [0.3, 0.1, 0.3]

  onPoint: {
    this.color = "#00ff00"  // Highlight when pointed at
  }
}
```

### @hoverable

Detects when the user's hand or pointer is near:

```hs
composition hotspot {
  @hoverable
  geometry: "sphere"

  onHoverEnter: {
    this.scale = 1.2
  }

  onHoverExit: {
    this.scale = 1.0
  }
}
```

### @clickable

Responds to click/trigger actions:

```hs
composition clickableButton {
  @clickable
  geometry: "cube"

  onClick: {
    console.log("Clicked!")
  }
}
```

## Physics Traits

### @physics

Adds realistic physics simulation:

```hs
composition fallingCube {
  @physics
  geometry: "cube"
  position: [0, 5, 0]  // Will fall due to gravity
}
```

With parameters:

```hs
composition heavyBall {
  @physics {
    mass: 5.0
    restitution: 0.8    // Bouncy
    friction: 0.3
  }
  geometry: "sphere"
}
```

### @collidable

Enables collision detection:

```hs
composition wall {
  @collidable
  geometry: "cube"
  scale: [5, 3, 0.2]
}
```

### @trigger

Creates trigger zones (no physical collision):

```hs
composition doorTrigger {
  @trigger
  geometry: "cube"
  scale: [2, 2, 1]
  opacity: 0.3

  onTriggerEnter: {
    openDoor()
  }

  onTriggerExit: {
    closeDoor()
  }
}
```

### @gravity

Control gravity on individual objects:

```hs
composition floatingcomposition {
  @gravity { enabled: false }
  geometry: "sphere"
}
```

## Visual Traits

### @glowing

Makes the object emit light:

```hs
composition lamp {
  @glowing {
    color: "#ffffaa"
    intensity: 2.0
    distance: 10
  }
  geometry: "sphere"
  scale: 0.2
}
```

### @animated

Auto-animates the object:

```hs
composition spinner {
  @animated {
    property: "rotation.y"
    speed: 45    // degrees per second
    loop: true
  }
  geometry: "cube"
}
```

### @billboard

Always faces the camera:

```hs
composition label {
  @billboard
  geometry: "plane"
  material: { map: "textures/label.png" }
}
```

### @reflective

Creates mirror-like surfaces:

```hs
composition mirror {
  @reflective
  geometry: "plane"
  scale: [2, 3, 1]
}
```

## Networking Traits

### @networked

Syncs object across multiple users:

```hs
composition sharedBall {
  @networked
  @grabbable
  geometry: "sphere"

  // Position and rotation sync automatically
}
```

### @synced

Mark specific properties to sync:

```hs
composition scoreboard {
  @synced { properties: ["score", "playerName"] }
  score: 0
  playerName: ""
}
```

## Combining Traits

Traits work together seamlessly:

```hs
composition interactiveBall {
  @grabbable         // Can pick it up
  @throwable         // Can throw it
  @physics {         // Realistic physics
    mass: 0.5
    restitution: 0.9
  }
  @collidable        // Collides with environment
  @networked         // Synced in multiplayer

  geometry: "sphere"
  color: "#ff6600"
  position: [0, 1.5, -1]
}
```

## Trait Parameters

Many traits accept parameters:

```hs
// Simple trait (no parameters)
@grabbable

// Trait with parameters
@physics {
  mass: 2.0
  restitution: 0.5
}

// Short form for single parameter
@gravity false

// Alternative syntax
@animated(speed: 30)
```

## All Semantic Traits

Here's the complete list organized by category:

### Interaction (8)

- `@grabbable` - Can be grabbed
- `@throwable` - Can be thrown
- `@holdable` - Must be held (like a tool)
- `@clickable` - Responds to clicks
- `@hoverable` - Detects hover
- `@draggable` - Can be dragged on surfaces
- `@pointable` - Responds to pointing
- `@scalable` - Can be resized by user

### Physics (6)

- `@collidable` - Has collision
- `@physics` - Full physics simulation
- `@rigid` - Rigid body physics
- `@kinematic` - Animated physics body
- `@trigger` - Trigger zone
- `@gravity` - Gravity control

### Visual (6)

- `@glowing` - Emits light
- `@emissive` - Self-illuminated
- `@transparent` - See-through
- `@reflective` - Mirror surface
- `@animated` - Auto-animation
- `@billboard` - Faces camera

### Networking (5)

- `@networked` - Multiplayer sync
- `@synced` - Property sync
- `@persistent` - Saved state
- `@owned` - Ownership control
- `@host_only` - Host-only visibility

### Behavior (5)

- `@stackable` - Can be stacked
- `@attachable` - Attaches to other objects
- `@equippable` - Can be equipped
- `@consumable` - Single-use item
- `@destructible` - Can be destroyed

### Spatial (5)

- `@anchor` - AR world anchor
- `@tracked` - Tracked object
- `@world_locked` - Fixed in world space
- `@hand_tracked` - Follows hand
- `@eye_tracked` - Follows gaze

### Audio (3)

- `@spatial_audio` - 3D positioned sound
- `@ambient` - Background audio
- `@voice_activated` - Voice control

### State (4)

- `@state` - State machine
- `@reactive` - Reactive updates
- `@observable` - Observable pattern
- `@computed` - Computed properties

## Quiz

Test your understanding:

1. What trait makes an object grabbable in VR?
2. How do you add physics with custom mass?
3. What's the difference between `@collidable` and `@trigger`?
4. Which trait syncs an object across multiplayer?
5. Can you combine multiple traits on one object?

<details>
<summary>Answers</summary>

1. `@grabbable`
2. `@physics { mass: 2.0 }`
3. `@collidable` has physical collisions, `@trigger` only detects entry/exit
4. `@networked`
5. Yes, traits can be freely combined

</details>

## Hands-on Exercise

Create a basketball that can be grabbed, thrown, bounces on the floor, and makes a sound on collision:

```hs
composition basketball {
  // Add your traits here

  geometry: "sphere"
  color: "#ff6600"

  // Add event handlers
}
```

---

**Estimated time:** 35 minutes  
**Difficulty:** ⭐ Beginner  
**Next:** [Lesson 1.7 - Basic Interactivity](./07-interactivity.md)
