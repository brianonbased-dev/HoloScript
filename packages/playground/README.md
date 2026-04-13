# HoloScript Playground 🌐

Interactive web-based editor for trying HoloScript in your browser - no installation required!

## Features

✨ **Live Code Editor**

- Monaco Editor with HoloScript syntax highlighting
- Auto-completion and error detection
- Real-time preview

🎮 **Multiple Runtime Engines**

- **Demolition**: Building collapse with realistic physics
- **Avalanche**: Snow avalanche simulation
- **Erosion**: Water erosion and terrain deformation
- **Earthquake**: Seismic wave propagation

📚 **Example Gallery**

- Pre-built examples for each runtime
- One-click loading
- Instant preview

🔗 **Share & Export**

- Share code via URL
- Download .holo files
- Export to various formats

📊 **Live Statistics**

- FPS counter
- Particle count
- Runtime status

## Quick Start

### Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Open http://localhost:3000
```

### Build for Production

```bash
# Build optimized bundle
pnpm build

# Preview production build
pnpm preview
```

### Deploy to GitHub Pages

```bash
# Deploy to gh-pages branch
pnpm deploy
```

## Usage

### Writing HoloScript Code

1. Select an example from the sidebar or write your own code
2. Choose a runtime engine (Demolition, Avalanche, Erosion, or Earthquake)
3. Click "Run" to execute (or enable auto-run for live updates)
4. Watch the live preview in the canvas

### Example Code

```holoscript
composition BuildingDemolition {
  traits {
    physics {
      gravity: [0, -9.8, 0],
      timeScale: 1.0
    }

    camera {
      position: [0, 20, 50],
      target: [0, 10, 0],
      fov: 60
    }
  }

  entities {
    structure Building {
      floors: 5,
      columnsPerFloor: 4
    }

    behavior ExplosionControl {
      trigger: "click",
      explosionForce: 3000
    }
  }
}
```

### Keyboard Shortcuts

- `Ctrl/Cmd + S` - Run code
- `Ctrl/Cmd + R` - Reset simulation
- `Ctrl/Cmd + /` - Toggle comment
- `F11` - Fullscreen

## Architecture

```
┌─────────────────────────────────────────────┐
│            HoloScript Playground            │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐      ┌─────────────────┐ │
│  │ Monaco Editor│─────▶│  HoloScript     │ │
│  │              │      │  Parser         │ │
│  └──────────────┘      └────────┬────────┘ │
│                                 │          │
│                                 ▼          │
│                        ┌─────────────────┐ │
│                        │  Runtime        │ │
│                        │  Executor       │ │
│                        └────────┬────────┘ │
│                                 │          │
│                                 ▼          │
│                        ┌─────────────────┐ │
│                        │  Canvas         │ │
│                        │  Renderer       │ │
│                        └─────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

## Features Roadmap

### ✅ Completed

- [x] Monaco Editor integration
- [x] HoloScript syntax highlighting
- [x] Example gallery
- [x] Multi-runtime support
- [x] Share via URL
- [x] Download code
- [x] Live statistics
- [x] Console output

### 🚧 In Progress

- [ ] Full runtime executor integration
- [ ] 3D preview with Three.js
- [ ] Real-time particle rendering
- [ ] Interactive canvas controls

### 🔮 Future

- [ ] Collaborative editing (multiplayer)
- [ ] Version history
- [ ] Community examples
- [ ] Export to video
- [ ] Mobile responsiveness
- [ ] VR preview mode
- [ ] AI code completion
- [ ] Performance profiling

## Technology Stack

- **Editor**: Monaco Editor (VS Code's editor)
- **Build**: Vite + TypeScript
- **Runtime**: HoloScript Core (@holoscript/core)
- **Rendering**: Three.js (planned)
- **Deployment**: GitHub Pages

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ⚠️ Mobile (limited support)

## Contributing

Contributions welcome! Please see the main [HoloScript repository](https://github.com/brianonbased-dev/HoloScript) for contribution guidelines.

### Development Tips

1. **Hot Reload**: Changes to `playground.ts` auto-reload
2. **Monaco Types**: Types are loaded from CDN at runtime
3. **Examples**: Add new examples to the `EXAMPLES` object
4. **Runtimes**: Add new runtimes to the `RUNTIMES` array

## License

MIT © Brian X Base Team

## Links

- [HoloScript Documentation](https://holoscript.net)
- [GitHub Repository](https://github.com/brianonbased-dev/HoloScript)
- [NPM Package](https://www.npmjs.com/package/@holoscript/core)
- [Discord Community](https://discord.gg/holoscript)

---

**Try it now**: [https://holoscript.net/playground](https://holoscript.net/playground)

Built with ❤️ by the HoloScript community
