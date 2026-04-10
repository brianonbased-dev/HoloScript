# Building & Deploying

Welcome to Lesson 1.10! In this final lesson of Level 1, you'll learn how to build and deploy your HoloScript VR experiences to various platforms.

## Build Commands

### Development Build

```bash
# Start development server with hot reload
holoscript dev

# Output:
# ✓ Server running at http://localhost:3000
# ✓ Hot reload enabled
# ✓ WebXR available
```

### Production Build

```bash
# Build for production
holoscript build

# Output:
# Building for: web, oculus, steamvr
# ✓ Compiled 15 scenes
# ✓ Optimized assets (2.3 MB → 856 KB)
# ✓ Build complete in 12.4s
# Output: dist/
```

### Build for Specific Targets

```bash
# Single target
holoscript build --target web
holoscript build --target oculus
holoscript build --target steamvr

# Multiple targets
holoscript build --target web,oculus
```

## Build Targets

HoloScript compiles to multiple platforms:

| Target      | Description        | Output             |
| ----------- | ------------------ | ------------------ |
| `web`       | WebXR for browsers | `dist/web/`        |
| `oculus`    | Oculus Quest       | `dist/oculus/` APK |
| `steamvr`   | SteamVR/OpenVR     | `dist/steamvr/`    |
| `pico`      | Pico headsets      | `dist/pico/`       |
| `visionpro` | Apple Vision Pro   | `dist/visionpro/`  |
| `android`   | Android AR         | `dist/android/`    |
| `ios`       | iOS AR             | `dist/ios/`        |

## Configuration Options

### holoscript.config.json

```json
{
  "name": "my-vr-app",
  "version": "1.0.0",
  "entry": "src/main.holo",
  "targets": ["web", "oculus"],

  "build": {
    "outDir": "dist",
    "sourceMaps": true,
    "minify": true,

    "optimizations": {
      "treeShaking": true,
      "deadCodeElimination": true,
      "assetCompression": true
    }
  },

  "web": {
    "publicPath": "/",
    "pwa": true,
    "offline": true
  },

  "oculus": {
    "packageName": "com.mycompany.myvrapp",
    "versionCode": 1,
    "minSdkVersion": 29,
    "targetSdkVersion": 32
  }
}
```

## Optimization

### Asset Optimization

```bash
# Optimize assets before build
holoscript optimize

# Specific optimizations
holoscript optimize --textures    # Compress textures
holoscript optimize --models      # Optimize 3D models
holoscript optimize --audio       # Compress audio
```

### Bundle Analysis

```bash
# Analyze bundle size
holoscript analyze

# Output:
# Bundle Analysis
# ───────────────────────────────
# main.js          125 KB (gzip: 42 KB)
# vendor.js        312 KB (gzip: 98 KB)
# assets/
#   models/        1.2 MB
#   textures/      856 KB
#   audio/         234 KB
# Total:           2.7 MB
```

### Performance Tips

```hs
// Use lower-poly models for VR
composition character {
  geometry: "models/character_lod2.glb"  // Use LOD version
}

// Compress textures
material: {
  map: "textures/wall.etc2"  // Use compressed format
}

// Limit draw calls with instancing
@instanced { count: 100 }
composition tree {
  geometry: "models/tree.glb"
}
```

## Deployment

### Deploy to Web

```bash
# Build and deploy to your server
holoscript build --target web
holoscript deploy

# Or use a specific host
holoscript deploy --host netlify
holoscript deploy --host vercel
holoscript deploy --host github-pages
```

### Deploy to HoloScript Cloud

```bash
# Login to HoloScript Cloud
holoscript login

# Deploy to cloud
holoscript deploy --host holoscript-cloud

# Output:
# ✓ Uploaded build (2.3 MB)
# ✓ Deploying to edge nodes...
# ✓ Live at https://myapp.holo.page
```

### Deploy to Oculus/Meta Quest

```bash
# Build APK
holoscript build --target oculus

# Install on connected Quest
holoscript install --target oculus

# Or upload to App Lab
holoscript deploy --target oculus --store applab
```

### Deploy to Steam

```bash
# Build for SteamVR
holoscript build --target steamvr

# Package for Steam
holoscript package --target steam

# Upload to Steamworks
holoscript deploy --target steam --depot 12345
```

## Continuous Integration

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy VR App

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npx holoscript build --target web

      - name: Deploy to Netlify
        uses: netlify/actions/cli@master
        with:
          args: deploy --prod --dir=dist/web
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_TOKEN }}
```

## Testing Before Deploy

### Preview Mode

```bash
# Preview production build locally
holoscript preview

# Preview with specific device simulation
holoscript preview --device quest2
holoscript preview --device visionpro
```

### Test in VR

```bash
# Start local server
holoscript dev --https  # HTTPS required for WebXR

# Connect from Quest Browser:
# https://192.168.1.xxx:3000
```

## Environment Variables

### Local Development

```bash
# .env.local
HOLOSCRIPT_API_KEY=xxx
ANALYTICS_ID=UA-xxx
DEBUG=true
```

### Production

```bash
# .env.production
HOLOSCRIPT_API_KEY=yyy
ANALYTICS_ID=UA-yyy
DEBUG=false
```

### Usage

```hs
// Access in code
const apiKey = env.HOLOSCRIPT_API_KEY

if (env.DEBUG) {
  console.log("Debug mode enabled")
}
```

## Versioning

### Semantic Versioning

```bash
# Bump version
holoscript version patch  # 1.0.0 → 1.0.1
holoscript version minor  # 1.0.0 → 1.1.0
holoscript version major  # 1.0.0 → 2.0.0

# With changelog
holoscript version minor --message "Added multiplayer support"
```

### Release Notes

```bash
# Generate release notes
holoscript changelog

# Output CHANGELOG.md:
# ## 1.1.0 (2026-02-05)
# - Added multiplayer support
# - Fixed physics collision bug
# - Improved loading times
```

## Complete Deployment Workflow

```bash
# 1. Run tests
holoscript test

# 2. Lint and format
holoscript lint --fix
holoscript format

# 3. Build for all targets
holoscript build

# 4. Analyze bundle
holoscript analyze

# 5. Preview
holoscript preview

# 6. Deploy
holoscript deploy --env production

# Output:
# ✓ Deployed to web: https://myapp.holo.page
# ✓ Deployed to Quest: App Lab submission created
# ✓ Deployed to Steam: Build uploaded to depot
```

## Quiz

1. What command starts the development server?
2. How do you build for a specific platform?
3. What file contains deployment configuration?
4. How do you preview a production build locally?
5. What command deploys to HoloScript Cloud?

<details>
<summary>Answers</summary>

1. `holoscript dev`
2. `holoscript build --target <platform>`
3. `holoscript.config.json`
4. `holoscript preview`
5. `holoscript deploy --host holoscript-cloud`

</details>

## 🎉 Congratulations!

You've completed Level 1: Fundamentals! You now know how to:

- ✅ Set up a HoloScript development environment
- ✅ Create scenes with orbs and properties
- ✅ Add behaviors with traits
- ✅ Handle user interactions
- ✅ Create reusable templates
- ✅ Organize projects properly
- ✅ Build and deploy VR experiences

---

**Estimated time:** 25 minutes  
**Difficulty:** ⭐ Beginner  
**Next:** [Level 2: Intermediate](../level-2-intermediate/01-advanced-traits.md)
