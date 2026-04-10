# HoloScript Installation & Deployment Guide

**Version**: 3.0+  
**Last Updated**: February 2026  
**Status**: Production Ready

---

## Quick Start

### For Developers (npm)

```bash
npm install @holoscript/core @holoscript/cli

# Verify installation
holoscript --version
```

### For End Users

Choose your platform below.

---

## Installation by Platform

### macOS (Homebrew)

```bash
brew tap brianonbased-dev/holoscript
brew install holoscript

# Verify
holoscript --version
```

**Uninstall**:

```bash
brew uninstall holoscript
brew untap brianonbased-dev/holoscript
```

---

### Windows (Chocolatey)

```powershell
# As Administrator
choco install holoscript

# Verify
holoscript --version
```

**Uninstall**:

```powershell
choco uninstall holoscript
```

---

### Linux (Snap)

```bash
snap install holoscript

# Verify
holoscript --version
```

**Uninstall**:

```bash
snap remove holoscript
```

---

### Docker

```bash
# Pull latest image
docker pull holoscript:latest

# Run
docker run -it holoscript:latest holoscript --version

# Mount project directory
docker run -it -v $(pwd):/workspace holoscript:latest holoscript build /workspace
```

**Docker Compose**:

```yaml
version: '3.9'
services:
  holoscript:
    image: holoscript:latest
    volumes:
      - ./projects:/workspace
    working_dir: /workspace
    command: holoscript build .
```

---

## Configuration

### Global Config

HoloScript reads config from (in order):

1. `~/.holoscript/config.json` (user)
2. `./.holoscriptrc.json` (project)
3. Environment variables (prefix: `HOLOSCRIPT_`)

**Sample config.json**:

```json
{
  "compiler": {
    "targetPlatforms": ["web", "vr"],
    "optimizationLevel": 2,
    "sourceMap": true
  },
  "compiler": {
    "targetPlatforms": ["web", "vr"],
    "optimizationLevel": 2,
    "sourceMap": true
  },
  "ai": {
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}",
    "model": "gpt-4-turbo"
  },
  "publishing": {
    "npmRegistry": "https://registry.npmjs.org",
    "autoPublish": false
  }
}
```

### Environment Variables

```bash
# Required for AI features
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=ant-...

# Optional
HOLOSCRIPT_DEBUG=true
HOLOSCRIPT_TIMEOUT=30000
HOLOSCRIPT_CACHE_DIR=/tmp/holoscript-cache
```

---

## Verification

### Test Compilation

```bash
# Create sample project
mkdir my-scene
cd my-scene

# Create scene file
cat > scene.holo << 'EOF'
composition "Hello World" {
  environment { skybox: "default" }

  object "Cube" {
    geometry: "cube"
    position: [0, 0, 0]
    color: "#0066ff"
  }
}
EOF

# Compile
holoscript build scene.holo

# Check output in ./build/
ls -la build/
```

### Verify Installation

```bash
# Check version
holoscript --version

#List installed compilers
holoscript list-compilers

# Show config
holoscript config show

# Test connection (with AI enabled)
holoscript test-connection
```

---

## Troubleshooting

### "Command not found: holoscript"

**macOS/Linux**:

```bash
# Add to PATH if needed
export PATH="$PATH:$(npm config get prefix)/bin"

# Or install globally with npm
npm install -g @holoscript/cli
```

**Windows**:

- Restart terminal after installing Chocolatey package
- Check `C:\Program Files\HoloScript\bin` is in PATH

### Build Fails with "Parser Error"

```bash
# Enable debug output
holoscript build --debug scene.holo

# Check syntax
holoscript validate scene.holo

# Show parser output
holoscript parse scene.holo
```

### Slow Performance

```bash
# Disable optimization for faster builds
holoscript build --no-optimize scene.holo

# Enable parallel compilation
HOLOSCRIPT_PARALLEL=4 holoscript build .

# Check cache
holoscript cache clean
```

### Memory Issues

```bash
# Increase Node heap
NODE_OPTIONS="--max-old-space-size=4096" holoscript build large-project.holo

# Or set per-user config
echo '{"compiler": {"maxMemoryMb": 4096}}' > ~/.holoscript/config.json
```

---

## Advanced Usage

### CI/CD Integration

**GitHub Actions**:

```yaml
name: Build HoloScript

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install -g @holoscript/cli

      - run: holoscript build .

      - uses: actions/upload-artifact@v3
        with:
          name: build
          path: ./build
```

**GitLab CI**:

```yaml
build:
  image: node:18
  script:
    - npm install -g @holoscript/cli
    - holoscript build .
  artifacts:
    paths:
      - build/
```

### Custom Compiler Integration

```bash
# Register custom compiler
holoscript register-compiler --name=custom-target \
  --builder="./my-builder.js" \
  --extension=.myholo

# Use it
holoscript build --target=custom-target scene.holo
```

### Publishing Packages

```bash
# Create package
holoscript package create my-scene

# Publish to registry
holoscript package publish

# Or publish to custom registry
holoscript package publish \
  --registry=https://my-registry.example.com \
  --token=$MY_TOKEN
```

---

## Updating

### Check for Updates

```bash
holoscript update-check

# View changelog
holoscript changelog
```

### Update to Latest

**npm**:

```bash
npm install -g @holoscript/cli@latest
```

**Homebrew**:

```bash
brew upgrade holoscript
```

**Chocolatey**:

```powershell
choco upgrade holoscript
```

**Snap**:

```bash
snap refresh holoscript
```

---

## Uninstallation

### Remove HoloScript

**npm**:

```bash
npm uninstall -g @holoscript/cli
```

**Homebrew**:

```bash
brew uninstall holoscript
```

**Chocolatey**:

```powershell
choco uninstall holoscript
```

**Snap**:

```bash
snap remove holoscript
```

### Clean Up

```bash
# Remove cache
rm -rf ~/.holoscript

# Remove config
rm -rf ~/.holoscriptrc.json

# Docker cleanup
docker rmi holoscript:latest
```

---

## Support

- **Documentation**: https://docs.holoscript.net
- **Issues**: https://github.com/brianonbased-dev/HoloScript/issues
- **Discord**: https://discord.gg/holoscript
- **Email**: support@holoscript.net

---

## Security

- **Package integrity**: All npm packages are signed with npm's semantic version signature
- **Updates**: Security patches are published as patch versions (e.g., 3.0.1)
- **Reporting**: Report security issues to security@holoscript.net

---

## License

HoloScript is open-source under the MIT License.
