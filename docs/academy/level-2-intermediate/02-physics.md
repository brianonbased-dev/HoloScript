# Physics Simulation

Welcome to Lesson 2.2! In this lesson, you'll master HoloScript's physics system to create realistic, interactive VR experiences.

## Physics Fundamentals

HoloScript's physics system is built on a high-performance engine optimized for VR. Enable physics on any object with the `@physics` trait:

```hs
composition ball {
  @physics
  geometry: "sphere"
  position: [0, 5, 0]  // Will fall due to gravity
}
```

## Physics Properties

### Mass

Mass determines how heavy an object is:

```hs
composition lightweight {
  @physics { mass: 0.1 }  // Light, easy to move
  geometry: "sphere"
}

composition heavyweight {
  @physics { mass: 10.0 }  // Heavy, hard to move
  geometry: "cube"
}
```

### Restitution (Bounciness)

Control how bouncy objects are:

```hs
// Super bouncy ball
composition bouncyBall {
  @physics {
    mass: 0.5
    restitution: 0.95  // 0 = no bounce, 1 = perfect bounce
  }
  geometry: "sphere"
}

// Heavy, non-bouncy rock
composition rock {
  @physics {
    mass: 5.0
    restitution: 0.1  // Barely bounces
  }
  geometry: "sphere"
}
```

### Friction

Control how slippery surfaces are:

```hs
// Ice block - very slippery
composition iceBlock {
  @physics {
    friction: 0.05
  }
  geometry: "cube"
}

// Rubber - high friction
composition rubber {
  @physics {
    friction: 0.9
  }
  geometry: "cube"
}
```

### Damping

Slow down movement and rotation over time:

```hs
composition dampedObject {
  @physics {
    linearDamping: 0.3   // Slow down movement
    angularDamping: 0.5  // Slow down rotation
  }
  geometry: "cube"
}
```

## Body Types

### Dynamic (Default)

Fully simulated, affected by forces:

```hs
composition dynamic {
  @physics { type: "dynamic" }
  geometry: "sphere"
}
```

### Static

Never moves, infinite mass:

```hs
composition floor {
  @physics { type: "static" }
  geometry: "plane"
  scale: [20, 20, 1]
  rotation: [-90, 0, 0]
}
```

### Kinematic

Controlled by animation, affects other objects:

```hs
composition platform {
  @physics { type: "kinematic" }
  geometry: "cube"
  scale: [3, 0.2, 3]

  animation move {
    property: "position.y"
    from: 0
    to: 3
    duration: 3000
    loop: true
    easing: "easeInOut"
  }
}
```

## Collision Shapes

### Auto-Generated

By default, collision matches geometry:

```hs
composition autoBox {
  @physics
  geometry: "cube"  // Uses box collider
}

composition autoSphere {
  @physics
  geometry: "sphere"  // Uses sphere collider
}
```

### Custom Colliders

Specify explicit collision shapes:

```hs
composition complex {
  @physics {
    collider: "box"           // Box
    collider: "sphere"        // Sphere
    collider: "capsule"       // Capsule
    collider: "mesh"          // Exact mesh (expensive)
    collider: "convex"        // Convex hull
  }
  geometry: "models/character.glb"
}
```

### Compound Colliders

Combine multiple simple shapes:

```hs
composition character {
  @physics {
    colliders: [
      { type: "capsule", height: 1.8, radius: 0.3, center: [0, 0.9, 0] },
      { type: "sphere", radius: 0.2, center: [0, 1.8, 0] }  // Head
    ]
  }
  geometry: "models/character.glb"
}
```

## Forces and Impulses

### Apply Force

Apply continuous force:

```hs
composition rocket {
  @physics { mass: 1.0 }
  geometry: "cylinder"

  onUpdate: {
    if (this.isBoosting) {
      physics.applyForce(this, [0, 50, 0])  // Upward thrust
    }
  }
}
```

### Apply Impulse

Apply instant velocity change:

```hs
composition ball {
  @physics
  @grabbable
  @throwable

  onRelease(event): {
    // Add extra kick when released
    physics.applyImpulse(this, event.velocity.multiply(1.5))
  }
}
```

### Apply Torque

Spin the object:

```hs
composition spinner {
  @physics

  onGrab: {
    physics.applyTorque(this, [0, 100, 0])  // Spin when grabbed
  }
}
```

## Collision Detection

### Collision Events

```hs
composition collider {
  @physics
  @collidable

  onCollisionEnter(event): {
    console.log("Hit:", event.other.name)
    console.log("Force:", event.impulse)
    console.log("Point:", event.contactPoint)
    console.log("Normal:", event.contactNormal)
  }

  onCollisionStay(event): {
    // Called every frame while colliding
  }

  onCollisionExit(event): {
    console.log("Stopped touching:", event.other.name)
  }
}
```

### Trigger Zones

Non-physical detection zones:

```hs
composition triggerZone {
  @trigger
  geometry: "cube"
  scale: [3, 3, 3]
  opacity: 0.2

  onTriggerEnter(event): {
    if (event.object.tag === "player") {
      this.activateEvent()
    }
  }
}
```

## Raycasting

Cast rays to detect objects:

```hs
composition laser {
  onUpdate: {
    const hit = physics.raycast(
      this.position,           // Origin
      this.forward,            // Direction
      100,                     // Max distance
      ["enemy", "environment"] // Layer mask
    )

    if (hit) {
      laserEnd.position = hit.point

      if (hit.object.tag === "enemy") {
        hit.object.damage(10)
      }
    }
  }
}
```

## Joints and Constraints

### Fixed Joint

Lock objects together:

```hs
composition handle {
  @physics
}

composition blade {
  @physics

  joint fixed {
    connectedTo: handle
    breakForce: 1000  // Breaks if force exceeds this
  }
}
```

### Hinge Joint

Rotational constraint (doors, wheels):

```hs
composition door {
  @physics { type: "dynamic" }

  joint hinge {
    connectedTo: doorFrame
    anchor: [-0.5, 0, 0]       // Pivot point
    axis: [0, 1, 0]            // Rotation axis
    limits: [-90, 90]          // Angle limits
    motor: { speed: 2, force: 10 }
  }
}
```

### Spring Joint

Elastic connection:

```hs
composition pendulum {
  @physics

  joint spring {
    connectedTo: anchor
    springConstant: 50
    damping: 0.5
    restLength: 2
  }
}
```

## Complete Physics Example

```holo
composition "Physics Playground" {

  environment {
    gravity: [0, -9.81, 0]
  }

  // Static ground
  composition ground {
    @physics { type: "static" }
    geometry: "plane"
    scale: [20, 20, 1]
    rotation: [-90, 0, 0]
    material: { color: "#3a3a3a" }
  }

  // Bouncy balls
  template BouncyBall {
    params {
      bounce: number = 0.8
      ballColor: string = "#ff0000"
    }

    @physics {
      mass: 0.5
      restitution: params.bounce
    }
    @grabbable
    @throwable

    geometry: "sphere"
    scale: 0.2
    color: params.ballColor

    onCollision(event): {
      if (event.impulse > 2) {
        audio.play("bounce.mp3", { volume: event.impulse / 10 })
      }
    }
  }

  object ball1 using BouncyBall {
    position: [0, 3, -2]
    bounce: 0.95
    ballColor: "#ff0000"
  }

  object ball2 using BouncyBall {
    position: [0.5, 4, -2]
    bounce: 0.7
    ballColor: "#00ff00"
  }

  // Dominoes
  group dominoes {
    for (let i = 0; i < 10; i++) {
      composition domino {
        @physics { mass: 0.1 }
        geometry: "cube"
        scale: [0.1, 0.5, 0.3]
        position: [i * 0.4 - 2, 0.25, -3]
      }
    }
  }

  // Swinging pendulum
  composition pendulumAnchor {
    @physics { type: "static" }
    position: [3, 4, -3]
    scale: 0.1
  }

  composition pendulumBall {
    @physics { mass: 2.0 }
    @grabbable
    geometry: "sphere"
    scale: 0.3
    position: [3, 2, -3]

    joint spring {
      connectedTo: pendulumAnchor
      springConstant: 20
      damping: 0.1
      restLength: 2
    }
  }
}
```

## Performance Tips

1. **Use simple colliders** - Box and sphere are fastest
2. **Limit active physics objects** - Disable far objects
3. **Use layers wisely** - Avoid unnecessary collision checks
4. **Sleep inactive objects** - Let static objects sleep

```hs
// Optimize with collision layers
composition enemy {
  @physics {
    layer: "enemies"
    collidesWith: ["player", "projectiles", "environment"]
  }
}
```

## Quiz

1. What property controls how bouncy an object is?
2. What's the difference between force and impulse?
3. How do you create a door hinge?
4. What's a kinematic body?
5. How do you detect collisions?

<details>
<summary>Answers</summary>

1. `restitution` (0-1)
2. Force is continuous, impulse is instant
3. Use a hinge joint with axis and limits
4. A physics body controlled by animation that affects other bodies
5. Use `onCollisionEnter`, `onCollisionStay`, `onCollisionExit` events

</details>

---

**Estimated time:** 45 minutes  
**Difficulty:** ⭐⭐ Intermediate  
**Next:** [Lesson 2.3 - Audio & Sound](./03-audio.md)
