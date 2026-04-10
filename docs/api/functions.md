# Built-in Functions

Reference for all built-in HoloScript functions.

## Object Functions

### show / hide

```hs
show objectName
hide objectName

show objectName with { duration: 500ms, easing: "ease-in" }
```

### destroy / spawn

```hs
destroy objectName
destroy objectName with { effect: "explode", delay: 1s }

spawn "TemplateName" at [x, y, z]
spawn "Enemy" at player.position with { count: 5 }
```

### clone

```hs
clone objectName as "newName"
clone objectName at [x, y, z]
```

---

## Animation Functions

### animate

```hs
animate object.property to value over duration

animate player.position to [10, 0, 0] over 2s
animate door.rotation to { y: 90 } over 1s with { easing: "ease-out" }
```

**Easing options:** `linear`, `ease-in`, `ease-out`, `ease-in-out`, `bounce`, `elastic`

### pulse

```hs
pulse objectName with { duration: 1000, scale: 1.2 }
```

### shake

```hs
shake objectName with { intensity: 0.5, duration: 500ms }
```

### play_animation

```hs
play_animation objectName "animationName"
play_animation character "walk" with { loop: true, speed: 1.5 }
```

### stop_animation

```hs
stop_animation objectName
stop_animation character "walk"
```

---

## Audio Functions

### play_sound

```hs
play_sound "sound.mp3"
play_sound "explosion.wav" at [x, y, z]
play_sound "music.mp3" with { volume: 0.5, loop: true }
```

### stop_sound

```hs
stop_sound "music.mp3"
stop_all_sounds
```

### set_volume

```hs
set_volume "music.mp3" to 0.5
set_master_volume 0.8
```

---

## Physics Functions

### apply_force

```hs
apply_force object with { x: 0, y: 10, z: 0 }
apply_force object direction [0, 1, 0] magnitude 100
```

### apply_impulse

```hs
apply_impulse object with { x: 0, y: 10, z: 0 }
```

### set_velocity

```hs
set_velocity object to [0, 5, 0]
```

### raycast

```hs
raycast from origin direction dir maxDistance 100

result = raycast from player.position direction player.forward
if result.hit {
  hit_object = result.object
  hit_point = result.point
}
```

---

## Math Functions

### distance

```hs
d = distance(objectA.position, objectB.position)
d = distance(objectA, objectB)  // Shorthand
```

### lerp

```hs
value = lerp(start, end, t)
position = lerp(startPos, endPos, 0.5)
```

### clamp

```hs
value = clamp(input, min, max)
health = clamp(health, 0, 100)
```

### random

```hs
value = random()           // 0 to 1
value = random(min, max)   // min to max
value = random_int(1, 10)  // Integer 1 to 10
```

### normalize

```hs
direction = normalize(vector)
```

### dot / cross

```hs
result = dot(vectorA, vectorB)
result = cross(vectorA, vectorB)
```

---

## State Functions

### get_state / set_state

```hs
value = get_state("key")
set_state("key", value)

// With object scope
value = get_state(object, "property")
set_state(object, "property", value)
```

### save_state / load_state

```hs
save_state("save_slot_1")
load_state("save_slot_1")
```

---

## Network Functions

### sync

```hs
sync object
sync object.property
```

### broadcast

```hs
broadcast "event_name" with { data: value }
```

### send_to

```hs
send_to player_id "message" with { content: "Hello" }
```

### is_host / is_local

```hs
if is_host() {
  // Host-only logic
}

if is_local(object) {
  // Local player owns this
}
```

---

## Input Functions

### haptic_feedback

```hs
haptic_feedback "left" 0.5         // Hand, intensity
haptic_feedback "right" 0.8 500ms  // Hand, intensity, duration
```

### get_controller_position

```hs
pos = get_controller_position("left")
pos = get_controller_position("right")
```

### get_hand_pose

```hs
pose = get_hand_pose("left")
// pose.fingers, pose.palm_position, etc.
```

---

## Utility Functions

### delay

```hs
delay 1000 then {
  do_something()
}

// Or as expression
await delay(1000)
```

### repeat

```hs
repeat 5 times {
  spawn_enemy()
}

repeat every 1s {
  update_timer()
}
```

### log

```hs
log "Debug message"
log "Value: " + value
log_error "Something went wrong"
log_warning "Check this"
```

### format

```hs
text = format("Score: {0}, Lives: {1}", score, lives)
```

---

## Scene Functions

### load_scene

```hs
load_scene "level_2.holo"
load_scene "boss_arena" with { transition: "fade", duration: 1s }
```

### teleport_player

```hs
teleport_player to [x, y, z]
teleport_player to spawn_point.position
```

### get_player

```hs
player = get_player()
local_player = get_local_player()
all_players = get_all_players()
```

---

## Type Checking

### typeof

```hs
type = typeof(value)
// Returns: "number", "string", "boolean", "object", "array", "null"
```

### is_type

```hs
if is_number(value) { }
if is_string(value) { }
if is_array(value) { }
if is_object(value) { }
```
