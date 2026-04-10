// Login Form Example
// UI form elements

environment {
  skybox: "gradient"
  ambient_light: 0.6
}

object "form_background" {
  geometry: "cube"
  color: "#2d2d44"
  position: { x: 0, y: 1.5, z: -1 }
  scale: { x: 2, y: 2.5, z: 0.1 }
}

object "username_field" {
  geometry: "cube"
  color: "#ffffff"
  position: { x: 0, y: 2, z: -0.9 }
  scale: { x: 1.5, y: 0.3, z: 0.05 }
}

object "password_field" {
  geometry: "cube"
  color: "#ffffff"
  position: { x: 0, y: 1.5, z: -0.9 }
  scale: { x: 1.5, y: 0.3, z: 0.05 }
}

object "submit_button" {
  geometry: "cube"
  color: "#00aa55"
  position: { x: 0, y: 0.9, z: -0.9 }
  scale: { x: 1, y: 0.3, z: 0.05 }
}
