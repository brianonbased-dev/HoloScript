# Getting Started with HoloScript

Welcome! This guide will help you go from zero to a working VR scene in **under 5 minutes**.

## The Fastest Path: Scaffolded Project (Recommended)

```bash
# 1. Create a new HoloScript project
npx create-holoscript my-first-world
cd my-first-world

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev

# 4. Open http://localhost:3000 in your browser
```

That's it! You now have a live, editable HoloScript scene running.

### What you get:

- 📝 **Sample scene** in `src/main.holo`
- 🎨 **Live preview** in the browser
- 🔄 **Hot reload** — changes appear instantly
- 📦 **Pre-configured build** for all registered platforms

---

## 5-Minute First Scene

Edit `src/main.holo`:

```holo
composition "MyFirstScene" {
  object "PlayArea" {
    geometry: "plane"
    scale: [10, 1, 10]
    color: "#4a4a4a"
    position: [0, 0, 0]
  }

  object "BouncyBall" {
    @physics(mass: 1.0, bounciness: 0.8)
    @grabbable
    @throwable
    geometry: "sphere"
    color: "#ff4444"
    position: [0, 2, 0]
    scale: 0.5
  }

  object "HotPotato" {
    @label(text: "Pick me up!")
    @physics(mass: 0.2)
    @grabbable
    geometry: "cube"
    color: "#ffaa00"
    position: [5, 1, 5]
  }
}
```

Save. The preview updates in **<1 second**.

---

## compile Command: Your Weapon

Once your `.holo` is ready, compile it to any platform:

### Compile to Web (React Three Fiber)

```bash
npm run build -- --target r3f
```

Output: `dist/scene.jsx` — drop it into any React project.

### Compile to Unity

```bash
npm run build -- --target unity
```

Output: `dist/GeneratedScene.cs` — import into Unity Editor.

### Compile to Unreal Engine

```bash
npm run build -- --target unreal
```

Output: `dist/GeneratedScene.cpp` — ready for Unreal Editor.

### Compile to All Targets at Once

```bash
npm run build -- --target all
```

This creates a directory with compiled scenes for every supported platform.

---

## Using the Cloud API (No Installation Needed)

If you just want to try HoloScript without installing anything:

```bash
curl -s -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "code": "composition \"Test\" { object \"Cube\" { @physics geometry: \"box\" position: [0,1,0] } }",
    "target": "r3f"
  }' | jq .output
```

This returns ready-to-use React code.

---

## Next Steps

1. **[Lesson 1.3: Your First Composition](./03-first-scene.md)** — Deep dive into `.holo` syntax
2. **[Traits Reference](../../../traits/index.md)** — Explore the full trait catalog (see `docs/NUMBERS.md` for live counts)
3. **[Compiler Guide](../../../compilers/index.md)** — Deploy to your platform

---

## Stuck?

- 📖 Read [common troubleshooting](./troubleshooting.md)
- 💬 Ask the [community on Moltbook](https://moltbook.com/holoscript)
- 🐛 Report a bug on [GitHub Issues](https://github.com/brianonbased-dev/HoloScript/issues)

---

## Hardware Targets (If You Have Them)

Once you're comfortable with the browser preview, try your scene on actual hardware:

| Hardware             | Target       | How                                      |
| -------------------- | ------------ | ---------------------------------------- |
| **Meta Quest 3**     | `unity`      | Compile, build in Unity Editor           |
| **Apple Vision Pro** | `visionos`   | Compile, run in Xcode                    |
| **Android XR**       | `android-xr` | Compile, build with Android Studio       |
| **SteamVR**          | `unity`      | Compile, build in Unity + SteamVR plugin |
| **PlayStation VR2**  | `r3f` (web)  | Compile, serve over local network        |

**Tip:** Start with web (`r3f`). Once you know your scene works, deploy to hardware.
