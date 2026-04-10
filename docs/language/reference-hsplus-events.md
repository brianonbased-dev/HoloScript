# Event Handlers Reference (`.hsplus`)

Complete reference for all event types in `.hsplus` format.

## Lifecycle Events

```holoscript
template "LifecycleObject" {
  on_create() {
    console.log("Object created");
  }

  on_update(deltaTime) {
    // Called every frame
    this.rotation.y += deltaTime * 0.5;
  }

  on_destroy() {
    console.log("Object destroyed");
    // Cleanup resources
  }

  on_visible() {
    console.log("Object became visible");
  }

  on_hidden() {
    console.log("Object hidden from view");
  }

  geometry: "box"
}
```

## Collision Events

```holoscript
template "CollisionObject" {
  @collidable

  on_collision_enter(event) {
    console.log("Collision started with:", event.other.name);
    console.log("Impact velocity:", event.relativeVelocity);
    this.color = "#ff0000";
  }

  on_collision_stay(event) {
    // Called while colliding
  }

  on_collision_exit(event) {
    console.log("Collision ended");
    this.color = "#00ff00";
  }

  geometry: "sphere"
}
```

## Trigger Events

```holoscript
template "TriggerZone" {
  @collidable

  on_trigger_enter(event) {
    if (event.other.hasTag("player")) {
      console.log("Player entered zone");
    }
  }

  on_trigger_stay(event) {
    // Called while inside trigger
  }

  on_trigger_exit(event) {
    console.log("Exited trigger");
  }

  geometry: "box"
  isTrigger: true
}
```

## Input Events

```holoscript
template "ClickableButton" {
  @interactive

  on_pointer_enter(event) {
    this.color = "#ffff00";  // Highlight
  }

  on_pointer_exit(event) {
    this.color = "#ffffff";  // Unhighlight
  }

  on_pointer_down(event) {
    console.log("Pressed at:", event.position);
    this.scale = { x: 0.9, y: 0.9, z: 0.9 };
  }

  on_pointer_up(event) {
    this.scale = { x: 1, y: 1, z: 1 };
  }

  on_click(event) {
    console.log("Clicked!");
    console.log("Shift held:", event.shiftKey);
    console.log("Ctrl held:", event.ctrlKey);
  }

  on_double_click(event) {
    console.log("Double-clicked!");
  }

  geometry: "box"
}
```

## VR Interaction Events

```holoscript
template "VRGrabbable" {
  @grabbable {
    hand: "both"
    haptic: true
  }

  on_grab(event) {
    console.log("Grabbed by:", event.hand);  // "left" or "right"

    // Haptic feedback
    event.controller.pulse(0.5, 100);

    // Disable gravity
    this.physics.gravityEnabled = false;
  }

  on_grab_update(event) {
    // Called every frame while grabbed
  }

  on_release(event) {
    console.log("Released with velocity:", event.velocity);

    // Re-enable gravity
    this.physics.gravityEnabled = true;

    // Apply throw velocity
    this.applyVelocity(event.velocity);
  }

  on_grab_button_down(event) {
    if (event.button === "trigger") {
      this.useItem();
    }
  }

  geometry: "sphere"
}
```

## Proximity Events

```holoscript
template "ProximitySensor" {
  @proximity {
    radius: 3.0
    targets: ["player"]
  }

  on_proximity_enter(event) {
    console.log("Target within", event.distance, "meters");
  }

  on_proximity_stay(event) {
    // Adjust based on distance
    const volume = 1.0 - (event.distance / 3.0);
    this.setAudioVolume(volume);
  }

  on_proximity_exit(event) {
    console.log("Target left proximity");
  }

  geometry: "sphere"
  visible: false
}
```

## Gaze Events

```holoscript
template "GazeButton" {
  @gaze_interactive {
    dwell_time: 1.0
  }

  on_gaze_enter(event) {
    console.log("User looking at object");
  }

  on_gaze_stay(event) {
    console.log("Gaze duration:", event.duration);
  }

  on_gaze_exit(event) {
    console.log("User looked away");
  }

  on_dwell_complete(event) {
    console.log("Dwell time reached - gaze click!");
    this.activate();
  }

  geometry: "box"
}
```

## Animation Events

```holoscript
template "AnimatedCharacter" {
  animation: "idle"

  on_animation_start(event) {
    console.log("Animation started:", event.name);
  }

  on_animation_complete(event) {
    console.log("Animation completed:", event.name);

    // Chain animations
    if (event.name === "attack") {
      this.playAnimation("idle");
    }
  }

  on_animation_loop(event) {
    console.log("Animation looped:", event.loopCount);
  }

  // Keyframe events
  on_animation_event(event) {
    if (event.eventName === "footstep") {
      this.playSound("footstep");
    }
  }

  geometry: "box"
}
```

## Audio Events

```holoscript
template "AudioPlayer" {
  on_audio_start(event) {
    console.log("Audio started:", event.audioId);
  }

  on_audio_end(event) {
    console.log("Audio ended");
    this.playNextTrack();
  }

  on_audio_pause(event) {
    console.log("Audio paused");
  }

  on_audio_resume(event) {
    console.log("Audio resumed");
  }

  geometry: "sphere"
  visible: false
}
```

## Network Events

```holoscript
template "NetworkedObject" {
  @networked

  on_network_spawn(event) {
    console.log("Spawned on network, owner:", event.ownerId);
  }

  on_network_owner_change(event) {
    console.log("Ownership changed to:", event.newOwnerId);
  }

  on_remote_grab(event) {
    console.log("Grabbed by remote player:", event.playerId);
    this.outline = "#00ff00";
  }

  on_remote_release(event) {
    this.outline = "none";
  }

  geometry: "box"
}
```

## Event Object Properties

Most events provide:

- `event.target` - Object that triggered the event
- `event.timestamp` - Event time
- Event-specific properties (see examples above)

## Next Steps

- [Modules & Imports Reference](./reference-hsplus-modules)
- [State & Actions Reference](./reference-hsplus-state)
- [Templates & Decorators Reference](./reference-hsplus-templates)
