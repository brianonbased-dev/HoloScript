# @holoscript/cli

**Command-line interface for HoloScript.** Parse, validate, compile, and manage HoloScript projects from the terminal.

## Installation

```bash
npm install -g @holoscript/cli
# or
npx @holoscript/cli <command>
```

## Commands

### Parse & Validate

```bash
# Parse a file and show AST
holo parse myfile.hsplus

# Parse and pretty-print result
holo parse myfile.holo --format json

# Validate without parsing (quick check)
holo validate myfile.hs
```

### Compile

```bash
# Compile to a specific target
holo compile scene.holo --target unity

# Compile to multiple targets at once
holo compile scene.holo --targets unity,godot,webbpu

# Specify output directory
holo compile scene.holo --target visionos --output dist/

# List all available targets
holo targets
```

### Project Management

```bash
# Initialize a new project
holo init my-vr-world

# Build entire project
holo build

# Watch files and rebuild on change
holo build --watch

# Format all HoloScript files
holo format

# Lint and check for errors
holo lint

# Fix lint issues automatically
holo lint --fix
```

### Code Generation

```bash
# Generate object from description (requires AI model)
holo generate object "A red sphere that bounces"

# Generate a complete scene
holo generate scene "Medieval castle with NPCs"

# List available traits for a domain
holo traits list
holo traits list --category physics
```

### Analysis

```bash
# Analyze complexity of a scene
holo analyze myfile.holo

# Get statistics
holo stats myfile.holo --detailed

# Show object tree
holo tree myfile.holo

# List all traits used
holo traits used myfile.holo
```

### Documentation

```bash
# Generate documentation for a file
holo docs myfile.hsplus --output docs/

# Serve local documentation
holo docs --serve

# Generate trait reference
holo traits reference --output reference.md
```

### Marketplace & Registry

```bash
# Search for packages/compositions
holo search "vr world"

# Install from marketplace
holo install hololand/zombie-shooter

# Publish your work
holo publish mypackage --token YOUR_TOKEN

# List installed packages
holo list
```

## Options

### Global Options

```bash
# Verbose output
holo command --verbose

# Debug mode (very verbose)
holo command --debug

# JSON output format
holo command --json

# Suppress warnings
holo command --quiet

# Config file path
holo command --config custom.config.js
```

### Compile Options

```bash
# Optimization level
holo compile scene.holo --target unity --optimize aggressive

# Debug symbols
holo compile scene.holo --target webgpu --sourcemaps

# Platform-specific options
holo compile scene.holo --target androrid-xr --platform questpro

# Asset embedding
holo compile scene.holo --target webgpu --embed-assets

# Output module format
holo compile scene.holo --target nodejs --module esm  # or 'cjs'
```

## Configuration

Create `holoscript.config.js` in your project root:

```javascript
export default {
  // Default compilation target
  defaultTarget: 'webgpu',

  // Compiler options
  compiler: {
    optimize: 'balanced', // 'off' | 'balanced' | 'aggressive'
    parallel: true,
    cache: true,
  },

  // Linting rules
  lint: {
    enabled: true,
    rules: {
      'unknown-trait': 'warn',
      'unused-object': 'warn',
      'circular-ref': 'error',
    },
  },

  // Formatting
  format: {
    indent: 2,
    trailingNewline: true,
    semiColons: false,
  },

  // Build settings
  build: {
    outDir: 'dist',
    target: 'webgpu',
    version: '1.0.0',
  },

  // Dev server
  dev: {
    port: 5173,
    open: true,
    hmr: true,
  },
};
```

## Examples

### Quick Compilation

```bash
# Create a simple scene
cat > demo.holo << 'EOF'
composition "Demo" {
  object "Cube" {
    @grabbable
    geometry: "box"
    position: [0, 0, -2]
  }
}
EOF

# Compile to Unity
holo compile demo.holo --target unity --output ./unity-project/Assets/Generated

# Preview in browser (if webgpu target)
holo compile demo.holo --target webgpu --output dist
holo serve dist
```

### Batch Compilation

```bash
# Compile all .holo files to multiple targets
for file in scenes/*.holo; do
  holo compile "$file" \
    --targets unity,godot,webgpu \
    --output "dist/$(basename $file .holo)"
done
```

### Generate from AI

```bash
# Have AI generate a scene, compile, and launch
holo generate scene "Procedural dungeon with monsters" > dungeon.holo
holo compile dungeon.holo --targets unity,webgpu
holo serve dist
```

## See Also

- [Compiler targets](../compilers/) — Details on each output platform
- [Getting Started](../guides/quickstart.md) — First-time setup
- [Config Reference](#configuration) — All configuration options
