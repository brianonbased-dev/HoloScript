# Hello World

The simplest HoloScript program - a glowing greeting orb.

## .hs Version (Classic)

```hs
// hello-world.hs
// A simple greeting composition that displays a welcome message

composition greeting {
  message: "Hello, HoloScript World!"
  color: "#00ffff"
  glow: true
  position: { x: 0, y: 1.5, z: -2 }
}

function displayGreeting() {
  show greeting
  pulse greeting with duration 1000
}

// Execute on load
execute displayGreeting
```

## .holo Version (Composition)

```holo
// hello-world.holo
composition "Hello World" {
  environment {
    skybox: "gradient"
    ambient_light: 0.5
  }

  object "Greeting" {
    @glowing

    position: [0, 1.5, -2]
    color: "#00ffff"
    glow_intensity: 1.5

    text: "Hello, HoloScript World!"
  }

  logic {
    on_scene_load {
      pulse Greeting over 1s
    }
  }
}
```

## What This Does

1. **Creates an orb** at eye level, 2 meters in front of the user
2. **Makes it glow** with a cyan color
3. **Displays text** saying "Hello, HoloScript World!"
4. **Pulses** the composition when the scene loads

## Try It

1. Save as `hello-world.holo`
2. Open in VS Code with HoloScript extension
3. Run **HoloScript: Preview Scene**

## Compile Targets

```bash
# Three.js (Web)
holoscript compile hello-world.holo --target threejs

# Unity
holoscript compile hello-world.holo --target unity

# Output
# ├── dist/threejs/hello-world.js
# └── dist/unity/HelloWorld.cs
```

## Next Steps

- Add [@grabbable](/api/traits#grabbable) to make it interactive
- Add [@physics](/api/traits#physics) for realistic movement
- Browse [more examples](/examples/) for advanced patterns
