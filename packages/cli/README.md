# @holoscript/cli

Command-line interface for HoloScript development.

## Installation

```bash
npm install -g @holoscript/cli
```

## Commands

### Build / Compile

Compile HoloScript files to target platforms:

```bash
holoscript build src/
holoscript build --target web --output dist/
holoscript compile scene.holo --target unity
```

### Parse & Validate

```bash
holoscript parse scene.holo
holoscript validate src/
holoscript ast scene.holo          # Show AST output
```

### Run & Dev

```bash
holoscript run scene.holo          # Execute headless
holoscript repl                    # Interactive shell
holoscript watch src/              # Watch for changes
holoscript headless scene.holo     # Headless runtime
```

### Package Management

```bash
holoscript add @holoscript/std
holoscript remove @holoscript/std
holoscript list                    # List installed packages
holoscript pack                    # Package assets
holoscript unpack bundle.hsa       # Unpack assets
```

### Registry & Publishing

```bash
holoscript publish                 # Publish package
holoscript login                   # Authenticate
holoscript logout                  # Sign out
holoscript whoami                  # Show identity
holoscript access grant user pkg   # Manage access
holoscript org create my-team      # Organization management
holoscript token create            # Token management
```

### HoloGram — 2D → 3D Bundle

Convert a still image, GIF, or video into a content-addressed HoloGram bundle (depth map + normal map + optional quilt/MV-HEVC/parallax render targets):

```bash
# Depth-only bundle (no render targets — Sprint 0a)
holoscript hologram photo.jpg --targets ''

# Full bundle with all render targets (requires HOLOGRAM_WORKER_URL)
holoscript hologram photo.png --targets quilt,mvhevc,parallax

# Custom output directory
holoscript hologram clip.mp4 --out ./my-bundle --targets quilt

# Named bundle (label stored in meta.json)
holoscript hologram avatar.webp --name "My Avatar"
```

The bundle is written to `./hologram-<hash>/` by default. Pass `--out <dir>` to override. The directory name encodes the full content hash so bundles are self-verifying. Node providers call the hologram-worker service; set `HOLOGRAM_WORKER_URL` before requesting render targets without injected providers.

### Code Tools

```bash
holoscript traits                  # List available traits
holoscript suggest scene.holo      # Get code suggestions
holoscript generate "a VR lobby"   # AI code generation
holoscript templates               # Show available templates
holoscript inspect output.js       # Inspect compiled output
holoscript diff a.holo b.holo      # Show differences
holo fmt src --check               # Check .hs/.hsplus/.holo formatting
holo fmt world.hs --write          # Write canonical formatting
```

### Deployment

```bash
holoscript deploy scene.holo       # Deploy to remote
holoscript monitor                 # Monitor runtime
holoscript wot-export scene.holo   # W3C Web of Things export
```

## Configuration

Create `holoscript.config.json`:

```json
{
  "$schema": "https://holoscript.net/schemas/config.v3.json",
  "version": 3,
  "compiler": {
    "target": "web",
    "strict": true
  }
}
```

## Package boundary & release posture

`@holoscript/cli` targets the external HoloScript developer/operator audience — anyone driving `.holo`/`.hs`/`.hsplus` builds from a terminal, CI job, or an agent framework that shells out to `holoscript` as a build step. The CLI does not assume a founder-owned deployment target: you bring your own project directory, `holoscript.config.json`, and environment variables (`HOLOSCRIPT_API_KEY`, registry credentials, `HOLOGRAM_WORKER_URL`, etc.) — point it at your own services rather than a private instance.

This package does not ship founder-local infrastructure. Commands that talk to a backend (`deploy`, `publish`, `org`, `token`, `hologram` render targets) call whatever endpoint you configure; there is no private workspace or founder-local default baked into the package boundary — filling that in is the caller's job.

Status: **v0-preview**. Core commands (`build`, `compile`, `parse`, `validate`, `run`, `watch`) are stable for day-to-day use; registry/publishing commands (`publish`, `org`, `token`) are newer and carry known limitations around auth-flow coverage and error reporting — treat those as preview-quality. Pin a version if you need reproducible behavior; rollback is a plain `npm install @holoscript/cli@<version>`.

## License

MIT
