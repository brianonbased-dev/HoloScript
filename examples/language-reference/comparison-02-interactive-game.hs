// Cross-Format Comparison: Interactive Game (.hs format)
// Same functionality in three formats: .hs, .hsplus, .holo
// This is the BASIC (.hs) version

// === GAME: Simple Target Practice ===
// Features: Clickable targets, score tracking, timer, UI

// Environment
environment {
  backgroundColor: "#1a1a2e"
  ambient: 0.5
  shadows: true
}

// Floor
object "Floor" {
  geometry: "plane"
  color: "#2a2a3a"
  width: 20
  height: 20
  position: { x: 0, y: 0, z: 0 }
}

// Target 1 (Red)
object "Target1" {
  geometry: "sphere"
  color: "#ff4444"
  radius: 0.4
  position: { x: -2, y: 1.5, z: -5 }

  // Basic click handling (limited in .hs)
  onClick: "incrementScore"
}

// Target 2 (Green)
object "Target2" {
  geometry: "sphere"
  color: "#44ff44"
  radius: 0.4
  position: { x: 0, y: 1.5, z: -5 }

  onClick: "incrementScore"
}

// Target 3 (Blue)
object "Target3" {
  geometry: "sphere"
  color: "#4444ff"
  radius: 0.4
  position: { x: 2, y: 1.5, z: -5 }

  onClick: "incrementScore"
}

// Lighting
object "MainLight" {
  type: "light"
  lightType: "point"
  color: "#ffffff"
  intensity: 1.0
  position: { x: 0, y: 4, z: 0 }
}

// UI Score Display (basic text)
object "ScoreText" {
  type: "ui"
  uiType: "text"
  text: "Score: 0"
  position: { x: 10, y: 10 }
  fontSize: 24
  color: "#ffffff"
}

// UI Timer Display
object "TimerText" {
  type: "ui"
  uiType: "text"
  text: "Time: 60"
  position: { x: 10, y: 50 }
  fontSize: 24
  color: "#ffffff"
}

// Start Button
object "StartButton" {
  type: "ui"
  uiType: "button"
  text: "Start Game"
  position: { x: 10, y: 100 }
  width: 120
  height: 40

  onClick: "startGame"
}

// === LIMITATIONS OF .hs FORMAT ===
// - No state management (can't track score, timer internally)
// - No action functions (incrementScore, startGame are just string references)
// - No complex event handlers (can't customize click behavior)
// - No computed values (can't calculate derived data)
// - No watchers (can't react to state changes)
// - No template reusability (must define each target separately)
// - Basic UI data binding (text is static, not reactive)
// - No game logic implementation (needs external system)
// - onClick only accepts function name strings, not actual code

// === WHAT .hs IS GOOD FOR ===
// - Quick prototyping of static scenes
// - Learning basic 3D concepts
// - Simple non-interactive visualizations
// - Declarative scene layout
// - Configuration-driven content

// === TO IMPLEMENT THIS GAME PROPERLY ===
// - Use .hsplus for state, actions, events, reactive UI
// - Use .holo for advanced traits, complex behaviors, VR features
