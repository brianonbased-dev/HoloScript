# VR World with Physics

Build an interactive VR room with physics-driven objects,
hand interactions, and spatial UI.

## Full Scene

```hsplus
// ============================================================
// ROOM SHELL
// ============================================================

object "Room" {
  @physics { fixed: true, collider: "mesh" }

  object "Floor" {
    geometry: { type: "box", size: { x: 10, y: 0.1, z: 10 } }
    material: { color: "#2C3E50", roughness: 0.3 }
    position: { x: 0, y: -0.05, z: 0 }
  }

  object "Wall_North" {
    geometry: { type: "box", size: { x: 10, y: 3, z: 0.1 } }
    material: { color: "#34495E", opacity: 0.8 }
    position: { x: 0, y: 1.5, z: -5 }
  }

  object "Ceiling" {
    geometry: { type: "box", size: { x: 10, y: 0.1, z: 10 } }
    material: { color: "#1A242F" }
    position: { x: 0, y: 3, z: 0 }
  }
}

// ============================================================
// INTERACTIVE OBJECTS
// ============================================================

// Grabbable physics cube
object "PhysicsCube" {
  @physics { mass: 1.0, collider: "box", restitution: 0.5 }
  @grabbable { physics: true, throwable: true }
  @haptic_feedback { onGrab: 0.3, onRelease: 0.1 }
  
  geometry: { type: "box", size: { x: 0.15, y: 0.15, z: 0.15 } }
  material: { color: "#E74C3C", metalness: 0.6 }
  position: { x: 0, y: 1.2, z: -1.5 }
}

// Bowling pins (spawn 10 in triangle)
function spawnPins() {
  let rows = 4
  let spacing = 0.12
  let z = -3.0
  
  for (row in 0..rows) {
    for (col in 0..row+1) {
      let x = (col - row / 2) * spacing
      object "Pin_${row}_${col}" {
        @physics { mass: 0.5, collider: "cylinder" }
        @grabbable { physics: true }
        geometry: { type: "cylinder", radius: 0.03, height: 0.2 }
        material: { color: "#ECF0F1" }
        position: { x: x, y: 0.1, z: z - row * spacing }
      }
    }
  }
}

// Bowling ball
object "Ball" {
  @physics { mass: 5.0, collider: "sphere", friction: 0.8 }
  @grabbable { physics: true, throwable: true }
  @haptic_feedback { onGrab: 0.6, intensity: 0.4 }
  
  geometry: { type: "sphere", radius: 0.11 }
  material: { color: "#2980B9", metalness: 0.9 }
  position: { x: 0, y: 1.0, z: 0 }
}

// ============================================================
// SPATIAL UI
// ============================================================

object "ScoreBoard" {
  @spatial_ui { billboard: true }
  @pressable {}
  
  position: { x: 0, y: 2.5, z: -4.9 }
  
  panel {
    width: 1.2
    height: 0.6
    background: { color: "#000000", opacity: 0.8, cornerRadius: 0.02 }
    
    text "Score" {
      fontSize: 0.08
      color: "#FFFFFF"
      position: { x: 0, y: 0.2 }
    }
    
    text "0" {
      id: "scoreValue"
      fontSize: 0.15
      color: "#00FF88"
      position: { x: 0, y: -0.05 }
    }
    
    button "Reset" {
      @pressable { depth: 0.01 }
      @haptic_feedback { onClick: 0.2 }
      position: { x: 0, y: -0.2 }
      size: { width: 0.3, height: 0.08 }
      
      on press() {
        scene.find("scoreValue").text = "0"
        spawnPins()
      }
    }
  }
}

// ============================================================
// HAND MENU
// ============================================================

object "HandMenu" {
  @hand_menu { hand: "left", activationPose: "palm_up" }
  
  menuItems: [
    { label: "Spawn Cube", action: "spawnCube" },
    { label: "Reset Pins", action: "resetPins" },
    { label: "Toggle Gravity", action: "toggleGravity" }
  ]
}
```

## Key Patterns

| Pattern | Traits Used | Demo |
|---------|------------|------|
| Grab + throw | `@grabbable`, `@physics` | Bowl a ball at pins |
| Haptic feedback | `@haptic_feedback` | Feel weight on grab |
| Spatial UI | `@spatial_ui`, `@pressable` | Billboard scoreboard |
| Hand menu | `@hand_menu` | Palm-up activation |

## Running

```bash
holoscript run vr_room.hsplus --platform webxr --physics-engine rapier
```
