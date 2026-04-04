# 🚀 HoloScript Quickstart Guide

Get up and running with HoloScript v6.0.2 in less than 5 minutes.

## 1. Installation

Install the HoloScript CLI and core tools:

```bash
npm install -g @holoscript/cli
```

Verify your installation:

```bash
holoscript --version
# Output: v6.0.2
```

## 2. Your First Composition

Create a file named `hello.holo`:

```holo
composition "My First Scene" {
  @world_metadata(theme: "cyberpunk", mood: "vibrant")

  object "FloatingCube" {
    @physics(mass: 1.5)
    @grabbable
    @spinning(speed: 0.5)

    geometry: "box"
    position: [0, 2, 0]
    color: "#00d4ff"
  }
}
```

## 3. Preview in Browser

Launch the real-time previewer:

```bash
holoscript preview hello.holo
```

This starts the `BrowserRuntime` and opens your default browser at `http://localhost:3000`.

## 4. Multi-Platform Compilation

HoloScript allows you to compile the same code to multiple targets:

**Compile to VRChat (UdonSharp):**

```bash
holoscript compile hello.holo --target vrchat
```

**Compile to Unreal Engine (C++):**

```bash
holoscript compile hello.holo --target unreal
```

**Compile to iOS (ARKit):**

```bash
holoscript compile hello.holo --target ios
```

## 5. Next Steps

- 📖 **[Traits Reference](../traits/index.md)** - Explore 2,000+ traits by category.
- 🎓 **[Academy](../academy/README.md)** - Step-by-step interactive lessons.
- 🛠️ **[Platform Guides](../compilers/index.md)** - Target-specific guides for Unity, Unreal, VRChat, and more.
