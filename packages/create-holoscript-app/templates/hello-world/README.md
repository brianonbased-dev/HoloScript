# My HoloScript App

Built with [HoloScript](https://github.com/brianonbased-dev/HoloScript) — the open AI-spatial reality protocol.

## Getting Started

```bash
# Start the dev server
npm run dev

# Validate your scene
npm run validate

# Build for production
npm run build
```

## Editing Your Scene

Open `src/scene.holo` in your editor. Save to see live changes in the browser.

### Quick Reference

```holo
// Objects
object "MyObject" {
  geometry: "cube"          // cube, sphere, plane, cylinder, cone, torus
  position: [0, 1, -3]     // [x, y, z]
  rotation: [0, 45, 0]     // degrees
  scale: [1, 1, 1]         // or single number for uniform scale
  color: "#ff4444"          // hex color
}

// Traits (add behavior)
@grabbable                  // User can grab this object
@throwable                  // User can throw this object
@physics(mass: 1.0)         // Physics simulation
@collidable                 // Collision detection
@glowing(intensity: 2.0)    // Emissive glow effect
@clickable                  // Responds to clicks
@hoverable                  // Responds to hover

// Event Hooks
on_click { ... }           // When clicked
on_grab { ... }            // When grabbed
```

## Learn More

- [HoloScript Documentation](https://github.com/brianonbased-dev/HoloScript)
- [Trait Reference](https://github.com/brianonbased-dev/HoloScript/tree/main/packages/traits)
- [Examples](https://github.com/brianonbased-dev/HoloScript/tree/main/examples)
