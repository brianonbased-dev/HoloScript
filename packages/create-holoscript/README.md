# create-holoscript

**Create HoloScript apps with zero configuration.** Scaffold a working 3D scene and open it in your browser in **30 seconds**.

[HoloScript](https://github.com/brianonbased-dev/HoloScript) is the open AI-spatial reality protocol — a declarative language for building 3D worlds, VR/AR experiences, and spatial applications.

## 30-Second Quick Start (`--go`)

```bash
npx create-holoscript-app my-world --go
```

That's it. `--go` scaffolds the zero-install `instant` template, starts a dev server, and opens your browser automatically. No `cd`, no `npm install`, no second command.

### Package names

The public npm package currently recommended by the registry is [`create-holoscript-app`](https://www.npmjs.com/package/create-holoscript-app). The repo source still lives in `packages/create-holoscript`, and the workspace filter remains `create-holoscript`.

`create-holoscript` remains a historical npm entry point, but `create-holoscript@1.4.0` is deprecated on npm in favor of `create-holoscript-app@1.5.0`. Compare both registry versions before claiming they are release-synced.

### Published package surface

This package publishes three binaries:

| Binary              | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `create-holoscript` | Project scaffolder and `--go` local preview  |
| `agent-setup`       | Agent infrastructure generator               |
| `holoscript-agents` | Alias for the agent infrastructure generator |

The npm payload is build-first: `bin/` wrappers import `dist/` outputs, and the package publishes `bin/`, `dist/`, templates, README, and changelog.

## Full Quick Start (any template)

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
  --go, -g             30-second mode: scaffold `instant` + auto-serve + open browser
  --template <name>    Template to use (hello-world, instant, physics-playground, interactive-gallery, 2d-revolution)
  --yes, -y            Skip prompts, use defaults
  --port <n>           Override dev-server port in --go mode (default 3030)
```

### `--go` under the hood

`--go` is the fastest path to a working 3D scene. It:

1. Scaffolds the `instant` template (CDN-loaded Three.js, no `npm install` step)
2. Starts a stdlib HTTP server on port 3030 (steps up if busy)
3. Opens your default browser to the served URL

Total time (warm npx cache, typical broadband): ~15–25 seconds. Compare:

| Tool                           | Time-to-wow |
| ------------------------------ | ----------- |
| **create-holoscript-app --go** | **~15–25s** |
| A-Frame (HTML paste)           | 30–60s      |
| Babylon.js (playground + edit) | 1–2 min     |
| Three.js from scratch          | ~5 min      |
| Unity WebGL export             | multi-hour  |

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

## Validation

```bash
corepack pnpm --filter create-holoscript run build
corepack pnpm --filter create-holoscript run test
npm view create-holoscript version deprecated
npm view create-holoscript-app version deprecated
```

## Package boundary & release posture

`create-holoscript` targets the same external/public consumer as `npm create vite` or `create-react-app` — any developer, agent framework, or founder-operator running `npx create-holoscript-app` locally. The generator only writes into the target directory you name on the command line; it does not phone home, does not assume a founder-local environment, and does not ship credentials, secrets, or any private workspace config. Everything downstream — `npm install`, dev-server port, deployment target — is bring-your-own / caller-owned: you point the generated project at your own hosting, environment variables, and build pipeline.

This package's release boundary stops at the scaffold: it hands you a working local project and gets out of the way. Known limitations: the template set is fixed at publish time (`hello-world`, `instant`, `physics-playground`, `interactive-gallery`, `2d-revolution`), and there is no update/eject command. Treat the `create-holoscript` (deprecated) vs `create-holoscript-app` naming as v0-preview churn — verify the active registry name/version with `npm view` (see Validation above) before scripting around it, and roll back to a pinned version if a template regresses.

## License

MIT
