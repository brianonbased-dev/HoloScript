// VR Living Room Scene
// A fully interactive virtual reality living room with furniture, lighting,
// spatial audio, hand tracking, physics, and accessibility traits.
// Designed to demonstrate VR-specific HoloScript features.

// === ENVIRONMENT ===
// Warm indoor lighting with a cozy evening skybox visible through the window.

environment {
  skybox: "evening"
  ambient_light: 0.35
}

// === ROOM STRUCTURE ===
// The room is 8m x 3m x 6m. Floor, ceiling, and three walls.
// The fourth wall (negative Z) has a large window.

object "floor" {
  geometry: "cube"
  color: "#5c4033"
  material: "wood"
  position: { x: 0, y: 0, z: 0 }
  scale: { x: 8, y: 0.1, z: 6 }
  @accessible { role: "ground", label: "Wooden floor" }
}

object "ceiling" {
  geometry: "cube"
  color: "#f5f0e8"
  material: "matte"
  position: { x: 0, y: 3, z: 0 }
  scale: { x: 8, y: 0.1, z: 6 }
}

object "wall_back" {
  geometry: "cube"
  color: "#e8dcc8"
  material: "matte"
  position: { x: 0, y: 1.5, z: 3 }
  scale: { x: 8, y: 3, z: 0.1 }
}

object "wall_left" {
  geometry: "cube"
  color: "#e8dcc8"
  material: "matte"
  position: { x: -4, y: 1.5, z: 0 }
  scale: { x: 0.1, y: 3, z: 6 }
}

object "wall_right" {
  geometry: "cube"
  color: "#e8dcc8"
  material: "matte"
  position: { x: 4, y: 1.5, z: 0 }
  scale: { x: 0.1, y: 3, z: 6 }
}

// === WINDOW WITH OUTDOOR VIEW ===
// A large window on the front wall. The "outdoor_view" plane behind it
// displays a nature texture, simulating a garden scene beyond the glass.

object "window_frame" {
  geometry: "cube"
  color: "#f5f5f5"
  material: "matte"
  position: { x: 0, y: 1.6, z: -3 }
  scale: { x: 3.2, y: 2.2, z: 0.1 }
}

object "window_glass" {
  geometry: "cube"
  color: "#aaddff"
  material: "glass"
  opacity: 0.15
  position: { x: 0, y: 1.6, z: -2.95 }
  scale: { x: 3, y: 2, z: 0.02 }
  @accessible { role: "decoration", label: "Large window overlooking garden" }
}

object "outdoor_view" {
  geometry: "cube"
  color: "#4a8f3f"
  material: "standard"
  texture: "textures/garden_panorama.jpg"
  position: { x: 0, y: 1.6, z: -3.2 }
  scale: { x: 3, y: 2, z: 0.01 }
}

object "front_wall_upper" {
  geometry: "cube"
  color: "#e8dcc8"
  material: "matte"
  position: { x: 0, y: 2.85, z: -3 }
  scale: { x: 8, y: 0.3, z: 0.1 }
}

object "front_wall_left" {
  geometry: "cube"
  color: "#e8dcc8"
  material: "matte"
  position: { x: -2.6, y: 1.5, z: -3 }
  scale: { x: 2.8, y: 3, z: 0.1 }
}

object "front_wall_right" {
  geometry: "cube"
  color: "#e8dcc8"
  material: "matte"
  position: { x: 2.6, y: 1.5, z: -3 }
  scale: { x: 2.8, y: 3, z: 0.1 }
}

// === SOFA ===
// A three-seat sofa against the back wall. @accessible marks it as seatable.

object "sofa_base" {
  geometry: "cube"
  color: "#4a6741"
  material: "velvet"
  position: { x: 0, y: 0.35, z: 2.2 }
  scale: { x: 2.8, y: 0.5, z: 1 }
  @accessible { role: "seat", label: "Three-seat sofa" }
}

object "sofa_backrest" {
  geometry: "cube"
  color: "#4a6741"
  material: "velvet"
  position: { x: 0, y: 0.75, z: 2.65 }
  scale: { x: 2.8, y: 0.6, z: 0.15 }
}

object "sofa_arm_left" {
  geometry: "cube"
  color: "#3d5636"
  material: "velvet"
  position: { x: -1.45, y: 0.55, z: 2.2 }
  scale: { x: 0.15, y: 0.6, z: 1 }
}

object "sofa_arm_right" {
  geometry: "cube"
  color: "#3d5636"
  material: "velvet"
  position: { x: 1.45, y: 0.55, z: 2.2 }
  scale: { x: 0.15, y: 0.6, z: 1 }
}

// === COFFEE TABLE ===
// Low table in front of the sofa. Items on top are grabbable.

object "coffee_table_top" {
  geometry: "cube"
  color: "#6b4226"
  material: "wood"
  position: { x: 0, y: 0.4, z: 1 }
  scale: { x: 1.4, y: 0.06, z: 0.7 }
  @accessible { role: "surface", label: "Coffee table" }
}

object "coffee_table_leg_1" {
  geometry: "cylinder"
  color: "#6b4226"
  material: "wood"
  position: { x: -0.55, y: 0.2, z: 0.7 }
  scale: { x: 0.06, y: 0.38, z: 0.06 }
}

object "coffee_table_leg_2" {
  geometry: "cylinder"
  color: "#6b4226"
  material: "wood"
  position: { x: 0.55, y: 0.2, z: 0.7 }
  scale: { x: 0.06, y: 0.38, z: 0.06 }
}

object "coffee_table_leg_3" {
  geometry: "cylinder"
  color: "#6b4226"
  material: "wood"
  position: { x: -0.55, y: 0.2, z: 1.3 }
  scale: { x: 0.06, y: 0.38, z: 0.06 }
}

object "coffee_table_leg_4" {
  geometry: "cylinder"
  color: "#6b4226"
  material: "wood"
  position: { x: 0.55, y: 0.2, z: 1.3 }
  scale: { x: 0.06, y: 0.38, z: 0.06 }
}

// === THROWABLE OBJECTS ON TABLE ===
// These objects have @grabbable for hand tracking and @physics for realistic throwing.
// In VR, the user can pick these up and toss them around the room.

object "coffee_mug" {
  geometry: "cylinder"
  color: "#d4a574"
  material: "matte"
  position: { x: -0.3, y: 0.55, z: 1 }
  scale: { x: 0.08, y: 0.12, z: 0.08 }
  @hand_tracking { enabled: true }
  @grabbable { grip: "pinch", haptic_feedback: true }
  @physics { mass: 0.3, restitution: 0.2, friction: 0.6 }
  @accessible { role: "interactive", label: "Coffee mug, grabbable" }
}

object "remote_control" {
  geometry: "cube"
  color: "#2a2a2a"
  material: "standard"
  position: { x: 0.2, y: 0.5, z: 0.85 }
  scale: { x: 0.15, y: 0.03, z: 0.05 }
  @hand_tracking { enabled: true }
  @grabbable { grip: "palm", haptic_feedback: true }
  @physics { mass: 0.15, restitution: 0.1, friction: 0.5 }
  @accessible { role: "interactive", label: "TV remote control, grabbable" }
}

object "decorative_ball" {
  geometry: "sphere"
  color: "#cc3333"
  material: "shiny"
  position: { x: 0.5, y: 0.52, z: 1.1 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
  @hand_tracking { enabled: true }
  @grabbable { grip: "pinch", haptic_feedback: true }
  @physics { mass: 0.1, restitution: 0.8, friction: 0.3 }
}

// === BOOKSHELF ===
// Tall bookshelf against the left wall, filled with books.

object "bookshelf_frame" {
  geometry: "cube"
  color: "#5a3a1a"
  material: "wood"
  position: { x: -3.5, y: 1.1, z: 0 }
  scale: { x: 0.8, y: 2.2, z: 0.35 }
  @accessible { role: "furniture", label: "Bookshelf with four shelves" }
}

object "book_row_1" {
  geometry: "cube"
  color: "#8b2500"
  material: "matte"
  position: { x: -3.5, y: 0.4, z: 0 }
  scale: { x: 0.65, y: 0.25, z: 0.2 }
}

object "book_row_2" {
  geometry: "cube"
  color: "#1a4a6e"
  material: "matte"
  position: { x: -3.5, y: 0.9, z: 0 }
  scale: { x: 0.65, y: 0.25, z: 0.2 }
}

object "book_row_3" {
  geometry: "cube"
  color: "#2e5e2e"
  material: "matte"
  position: { x: -3.5, y: 1.4, z: 0 }
  scale: { x: 0.65, y: 0.25, z: 0.2 }
}

object "book_row_4" {
  geometry: "cube"
  color: "#6b3a6b"
  material: "matte"
  position: { x: -3.5, y: 1.9, z: 0 }
  scale: { x: 0.65, y: 0.25, z: 0.2 }
}

// === TV MOUNTED ON BACK WALL ===
// Flat screen TV. The screen is a separate plane for content rendering.

object "tv_frame" {
  geometry: "cube"
  color: "#1a1a1a"
  material: "standard"
  position: { x: 2.5, y: 1.8, z: 2.9 }
  scale: { x: 1.6, y: 0.95, z: 0.06 }
  @accessible { role: "media", label: "Wall-mounted television" }
}

object "tv_screen" {
  geometry: "cube"
  color: "#111122"
  material: "standard"
  emissive: "#222244"
  emissiveIntensity: 0.3
  position: { x: 2.5, y: 1.8, z: 2.84 }
  scale: { x: 1.45, y: 0.82, z: 0.01 }
}

// === FLOOR LAMP ===
// Tall standing lamp in the corner. Emits warm point light.

object "lamp_pole" {
  geometry: "cylinder"
  color: "#3a3a3a"
  material: "metal"
  position: { x: 3.3, y: 0.7, z: 2.5 }
  scale: { x: 0.04, y: 1.4, z: 0.04 }
}

object "lamp_shade" {
  geometry: "cone"
  color: "#f5e6c8"
  material: "matte"
  opacity: 0.85
  position: { x: 3.3, y: 1.55, z: 2.5 }
  scale: { x: 0.3, y: 0.35, z: 0.3 }
  @accessible { role: "interactive", label: "Floor lamp, tap to toggle" }
}

object "lamp_base" {
  geometry: "cylinder"
  color: "#3a3a3a"
  material: "metal"
  position: { x: 3.3, y: 0.05, z: 2.5 }
  scale: { x: 0.2, y: 0.08, z: 0.2 }
}

// === PLANT IN DECORATIVE POT ===
// Potted plant near the window for a natural touch.

object "plant_pot" {
  geometry: "cylinder"
  color: "#b5651d"
  material: "matte"
  position: { x: -2.8, y: 0.2, z: -2.2 }
  scale: { x: 0.25, y: 0.35, z: 0.25 }
  @accessible { role: "decoration", label: "Potted houseplant" }
}

object "plant_soil" {
  geometry: "cylinder"
  color: "#3d2b1f"
  material: "matte"
  position: { x: -2.8, y: 0.38, z: -2.2 }
  scale: { x: 0.22, y: 0.02, z: 0.22 }
}

object "plant_leaves_1" {
  geometry: "sphere"
  color: "#2d7a2d"
  material: "standard"
  position: { x: -2.8, y: 0.65, z: -2.2 }
  scale: { x: 0.3, y: 0.25, z: 0.3 }
}

object "plant_leaves_2" {
  geometry: "sphere"
  color: "#3a8f3a"
  material: "standard"
  position: { x: -2.7, y: 0.75, z: -2.15 }
  scale: { x: 0.2, y: 0.2, z: 0.2 }
}

// === AREA RUG ===
// A rectangular rug under the coffee table to define the seating area.

object "area_rug" {
  geometry: "cube"
  color: "#8b4f6e"
  material: "velvet"
  position: { x: 0, y: 0.06, z: 1.5 }
  scale: { x: 3, y: 0.02, z: 2.5 }
  @accessible { role: "decoration", label: "Area rug" }
}

// === LIGHTING ===
// VR scenes need careful lighting. We use a warm ambient base
// plus two point lights: one from the floor lamp and one overhead.

light "warm_overhead" {
  type: "point"
  color: "#ffe4b5"
  intensity: 0.7
  position: { x: 0, y: 2.8, z: 0.5 }
  range: 8
}

light "lamp_glow" {
  type: "point"
  color: "#ffd699"
  intensity: 0.5
  position: { x: 3.3, y: 1.5, z: 2.5 }
  range: 4
}

light "window_daylight" {
  type: "point"
  color: "#e0eeff"
  intensity: 0.3
  position: { x: 0, y: 1.8, z: -2.5 }
  range: 5
}

// === SPATIAL AUDIO ===
// A virtual speaker on the bookshelf plays ambient music.
// Spatial audio attenuates with distance so the music gets louder
// as the user walks toward the bookshelf.

object "speaker" {
  geometry: "cube"
  color: "#2a2a2a"
  material: "standard"
  position: { x: -3.5, y: 1.65, z: 0.05 }
  scale: { x: 0.2, y: 0.15, z: 0.12 }
  @spatial_audio {
    src: "audio/ambient_lofi.mp3"
    volume: 0.4
    loop: true
    refDistance: 1.5
    rolloffFactor: 2.0
    maxDistance: 10
  }
  @hand_tracking { enabled: true }
  @grabbable { grip: "palm", haptic_feedback: true }
  @accessible { role: "media", label: "Bluetooth speaker playing ambient music" }
}

// === CUSHION (THROWABLE) ===
// A throw pillow on the sofa. Pick it up and toss it across the room.

object "throw_pillow" {
  geometry: "cube"
  color: "#c4a35a"
  material: "velvet"
  position: { x: -0.8, y: 0.7, z: 2.2 }
  scale: { x: 0.3, y: 0.3, z: 0.08 }
  rotation: { x: 0, y: 15, z: 5 }
  @hand_tracking { enabled: true }
  @grabbable { grip: "palm", haptic_feedback: true }
  @physics { mass: 0.2, restitution: 0.3, friction: 0.8 }
  @accessible { role: "interactive", label: "Throw pillow, grabbable" }
}

// === WALL ART ===
// A framed picture on the right wall to add visual interest.

object "picture_frame" {
  geometry: "cube"
  color: "#8b7355"
  material: "wood"
  position: { x: 3.9, y: 1.7, z: 0 }
  scale: { x: 0.04, y: 0.7, z: 0.9 }
}

object "picture_canvas" {
  geometry: "cube"
  color: "#4a7a9b"
  material: "matte"
  texture: "textures/abstract_art.jpg"
  position: { x: 3.87, y: 1.7, z: 0 }
  scale: { x: 0.01, y: 0.55, z: 0.75 }
}

// === SIDE TABLE WITH LAMP ===
// Small table next to the sofa with a table lamp.

object "side_table" {
  geometry: "cylinder"
  color: "#6b4226"
  material: "wood"
  position: { x: -2, y: 0.3, z: 2.2 }
  scale: { x: 0.3, y: 0.55, z: 0.3 }
}

object "table_lamp_base" {
  geometry: "cylinder"
  color: "#c0c0c0"
  material: "metal"
  position: { x: -2, y: 0.62, z: 2.2 }
  scale: { x: 0.08, y: 0.05, z: 0.08 }
}

object "table_lamp_shade" {
  geometry: "cone"
  color: "#f0e0c0"
  material: "matte"
  opacity: 0.8
  position: { x: -2, y: 0.82, z: 2.2 }
  scale: { x: 0.18, y: 0.2, z: 0.18 }
}
