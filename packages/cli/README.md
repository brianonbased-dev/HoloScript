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

### Code Tools

```bash
holoscript traits                  # List available traits
holoscript suggest scene.holo      # Get code suggestions
holoscript generate "a VR lobby"   # AI code generation
holoscript templates               # Show available templates
holoscript inspect output.js       # Inspect compiled output
holoscript diff a.holo b.holo      # Show differences
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

## License

MIT
