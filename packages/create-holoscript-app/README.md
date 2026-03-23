# 🌐 create-holoscript-app

**Create HoloScript apps with zero configuration.** Scaffold a working 3D/XR project and see it in your browser in under 2 minutes.

[HoloScript](https://github.com/brianonbased-dev/HoloScript) is the open AI-spatial reality protocol — a declarative language for building 3D worlds, VR/AR experiences, and spatial applications.

## Quick Start

```bash
npx create-holoscript-app my-world
cd my-world
npm install
npm run dev
```

Your 3D scene opens at `http://localhost:5173` 🚀

## Templates

### `hello-world` (default)

Interactive scene with a grabbable cube, glowing orb, and a button that spawns objects.

```holo
composition "Hello World" {
  object "MyCube" {
    @grabbable
    @physics(mass: 1.0)
    geometry: "cube"
    position: [0, 1.5, -3]
    color: "#ff4444"
  }
}
```

### `physics-playground`

Arena with throwable objects, bouncy balls, stacked cubes, and a spinning torus.

### `interactive-gallery`

Art gallery with clickable glowing panels, portal rings, and a floating sculpture.

## CLI Options

```bash
npx create-holoscript-app <project-name> [options]

Options:
  --template <name>    Template to use (hello-world, physics-playground, interactive-gallery)
  --yes, -y            Skip prompts, use defaults
```

## What You Get

```
my-world/
├── src/scene.holo          # Your scene — edit this!
├── index.html              # HTML shell with WebXR support
├── main.js                 # Three.js runtime with orbit controls
├── vite.config.js          # Dev server with .holo hot reload
├── holoscript.config.json  # Project config
├── package.json
└── README.md
```

The dev server uses a custom Vite plugin that parses `.holo` files and injects scene data into a Three.js renderer. Edit your `.holo` file and save — the browser reloads automatically.

## HoloScript Syntax at a Glance

```holo
// Create objects
object "MyObject" {
  geometry: "cube"              // cube, sphere, plane, cylinder, cone, torus
  position: [0, 1, -3]         // [x, y, z]
  rotation: [0, 45, 0]         // degrees
  scale: [1, 1, 1]             // or single number
  color: "#ff4444"              // hex color
}

// Add behavior with traits
@grabbable                      // User can grab
@throwable                      // User can throw
@physics(mass: 1.0)             // Physics sim
@collidable                     // Collision
@glowing(intensity: 2.0)        // Emissive glow
@clickable                      // Click events
@hoverable                      // Hover effects
```

## Learn More

- **GitHub**: [github.com/brianonbased-dev/HoloScript](https://github.com/brianonbased-dev/HoloScript)
- **Examples**: [/examples](https://github.com/brianonbased-dev/HoloScript/tree/main/examples) — 80+ `.holo` scenes
- **Traits**: [/packages/traits](https://github.com/brianonbased-dev/HoloScript/tree/main/packages/traits) — 1,500+ standard traits
- **Core**: [@holoscript/core](https://www.npmjs.com/package/@holoscript/core) — Parser, AST, compiler

## License

MIT
