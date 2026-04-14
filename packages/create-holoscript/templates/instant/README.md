# My HoloScript App (Instant)

Built with [HoloScript](https://github.com/brianonbased-dev/HoloScript) — the open AI-spatial reality protocol.

## Getting Started

No install needed! Just serve the files:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# Then open http://localhost:8000
```

## Editing Your Scene

Open `src/scene.holo` in your editor. Refresh the browser to see changes.

Three.js loads from CDN via import maps — zero npm dependencies.

## Upgrading to Vite

Want hot reload and build tooling? Switch to the `hello-world` template:

```bash
npx create-holoscript-app my-app --template hello-world
```

## Learn More

- [HoloScript Documentation](https://github.com/brianonbased-dev/HoloScript)
- [Trait Reference](https://github.com/brianonbased-dev/HoloScript/tree/main/packages/core/src/traits)
