# Basic Interactivity

Welcome to Lesson 1.7! In this lesson, you'll learn how to make your VR scenes interactive using event handlers.

## Event Handlers Overview

Event handlers respond to user actions and system events:

```hs
composition button {
  @clickable

  onClick: {
    // This code runs when clicked
    console.log("Button clicked!")
  }
}
```

## Mouse/Pointer Events

### onClick

Triggered when the user clicks or triggers:

```hs
composition clickable {
  @clickable
  geometry: "cube"
  color: "#0066ff"

  onClick: {
    this.color = "#00ff00"
  }
}
```

### onHoverEnter / onHoverExit

Triggered when pointer enters or leaves:

```hs
composition hoverable {
  @hoverable
  geometry: "sphere"
  scale: 1.0

  onHoverEnter: {
    this.scale = 1.2
    this.color = "#ffff00"
  }

  onHoverExit: {
    this.scale = 1.0
    this.color = "#ffffff"
  }
}
```

### onPoint

Triggered while being pointed at:

```hs
composition target {
  @pointable
  geometry: "sphere"

  onPoint: {
    // Called each frame while pointed at
    this.material.emissive = "#ff0000"
  }
}
```

## VR Grab Events

### onGrab / onRelease

Triggered when grabbed or released in VR:

```hs
composition grabbableItem {
  @grabbable
  geometry: "cube"

  onGrab: {
    console.log("Picked up!")
    this.color = "#00ff00"
  }

  onRelease: {
    console.log("Put down!")
    this.color = "#ff0000"
  }
}
```

### Event Data

Events provide context information:

```hs
composition detailed {
  @grabbable

  onGrab(event): {
    console.log("Hand:", event.hand)        // "left" or "right"
    console.log("Position:", event.position) // [x, y, z]
    console.log("Controller:", event.controller)
  }
}
```

## Physics Events

### onTriggerEnter / onTriggerExit

Triggered when objects enter/exit a trigger zone:

```hs
composition doorZone {
  @trigger
  geometry: "cube"
  scale: [2, 2, 1]
  opacity: 0.2

  onTriggerEnter(event): {
    if (event.object.name === "player") {
      door.open()
    }
  }

  onTriggerExit(event): {
    door.close()
  }
}
```

### onCollision

Triggered when physics objects collide:

```hs
composition ball {
  @physics
  @collidable
  geometry: "sphere"

  onCollision(event): {
    console.log("Hit:", event.other.name)
    console.log("Force:", event.force)
    console.log("Point:", event.contactPoint)

    // Play sound based on impact force
    if (event.force > 5) {
      audio.play("impact_hard.mp3")
    } else {
      audio.play("impact_soft.mp3")
    }
  }
}
```

## Animation Events

### onAnimationStart / onAnimationEnd

Track animation lifecycle:

```hs
composition animated {
  @animated

  animation fadeIn {
    property: "opacity"
    from: 0
    to: 1
    duration: 1000
  }

  onAnimationStart: {
    console.log("Animation started")
  }

  onAnimationEnd: {
    console.log("Animation complete")
  }
}
```

## Lifecycle Events

### onCreate

Called when object is created:

```hs
composition managed {
  onCreate: {
    console.log("Object created!")
    this.startTime = Date.now()
  }
}
```

### onUpdate

Called every frame:

```hs
composition rotating {
  geometry: "cube"
  rotationSpeed: 1

  onUpdate(deltaTime): {
    this.rotation.y += this.rotationSpeed * deltaTime
  }
}
```

### onDestroy

Called before object is removed:

```hs
composition cleanup {
  onDestroy: {
    console.log("Cleaning up...")
    this.saveState()
  }
}
```

## Modifying Properties

Event handlers can modify any property:

```hs
composition interactive {
  @clickable
  @hoverable

  geometry: "cube"
  color: "#ffffff"
  scale: 1.0
  isActive: false

  onHoverEnter: {
    this.scale = 1.1
    this.color = "#ffffaa"
  }

  onHoverExit: {
    this.scale = 1.0
    this.color = "#ffffff"
  }

  onClick: {
    this.isActive = !this.isActive
    this.color = this.isActive ? "#00ff00" : "#ffffff"
  }
}
```

## Accessing Other Objects

Reference other objects in the scene:

```hs
composition button {
  @clickable
  geometry: "cube"
  color: "#ff0000"

  onClick: {
    // Reference another object by name
    lamp.visible = !lamp.visible
    door.rotation.y = 90
  }
}

composition lamp {
  @glowing
  geometry: "sphere"
  visible: true
}

composition door {
  geometry: "cube"
  scale: [1, 2, 0.1]
}
```

## Playing Audio

Trigger sounds in event handlers:

```hs
composition button {
  @clickable
  geometry: "cube"

  onClick: {
    audio.play("click.mp3")
  }
}

composition enemy {
  @collidable

  onCollision: {
    audio.play("hit.mp3", {
      volume: 0.8,
      spatial: true,
      position: this.position
    })
  }
}
```

## Conditional Logic

Use if/else in handlers:

```hs
composition toggle {
  @clickable

  state: "off"

  onClick: {
    if (this.state === "off") {
      this.state = "on"
      this.color = "#00ff00"
      audio.play("on.mp3")
    } else {
      this.state = "off"
      this.color = "#ff0000"
      audio.play("off.mp3")
    }
  }
}
```

## Complete Example

Here's a complete interactive scene:

```hs
composition "Interactive Room" {

  // Light switch
  composition lightSwitch {
    @clickable
    @hoverable

    geometry: "cube"
    scale: [0.1, 0.15, 0.05]
    position: [2, 1.2, 0]
    color: "#cccccc"
    isOn: false

    onHoverEnter: {
      this.color = "#ffffff"
    }

    onHoverExit: {
      this.color = "#cccccc"
    }

    onClick: {
      this.isOn = !this.isOn
      roomLight.intensity = this.isOn ? 1.0 : 0.1
      audio.play("switch.mp3")
    }
  }

  // Room light
  composition roomLight {
    @glowing {
      color: "#ffffee"
      distance: 10
    }
    geometry: "sphere"
    scale: 0.1
    position: [0, 2.5, 0]
    intensity: 0.1
  }

  // Grabbable ball
  composition ball {
    @grabbable
    @throwable
    @physics { mass: 0.3, restitution: 0.9 }

    geometry: "sphere"
    scale: 0.15
    position: [0, 1, -1.5]
    color: "#ff6600"

    onGrab: {
      haptic.feedback("light")
    }

    onRelease: {
      haptic.feedback("medium")
    }

    onCollision(event): {
      if (event.force > 2) {
        audio.play("bounce.mp3", { volume: event.force / 10 })
      }
    }
  }

  // Target that reacts to ball
  composition target {
    @collidable
    @trigger

    geometry: "cylinder"
    scale: [0.3, 0.02, 0.3]
    position: [0, 0.01, -3]
    color: "#ff0000"

    onTriggerEnter(event): {
      if (event.object.name === "ball") {
        this.color = "#00ff00"
        audio.play("score.mp3")
        score.value += 10
      }
    }

    onTriggerExit: {
      this.color = "#ff0000"
    }
  }

  // Score display
  composition score {
    @billboard
    geometry: "plane"
    position: [0, 2, -3]
    value: 0
  }
}
```

## Quiz

1. What event fires when grabbing an object in VR?
2. How do you access another object in an event handler?
3. What's the difference between `onTriggerEnter` and `onCollision`?
4. How do you play a sound in an event handler?
5. What event is called every frame?

<details>
<summary>Answers</summary>

1. `onGrab`
2. Reference it by name: `otherObject.property`
3. `onTriggerEnter` is for trigger zones (no physics), `onCollision` is for physics collisions
4. `audio.play("filename.mp3")`
5. `onUpdate`

</details>

---

**Estimated time:** 30 minutes  
**Difficulty:** ⭐ Beginner  
**Next:** [Lesson 1.8 - Templates & Reuse](./08-templates.md)
