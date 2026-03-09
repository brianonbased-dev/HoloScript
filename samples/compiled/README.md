# HoloScript Compiled Samples

This directory contains verified compilation outputs for all 25+ export targets supported by HoloScript.

## Purpose

These samples serve as:

- **Reference Implementations** - Expected output format for each target
- **Validation Tests** - Automated tests verify these outputs
- **Documentation** - Examples for users implementing custom exporters
- **Quality Assurance** - Ensures export consistency across versions

## Export Targets

### XR/VR Platforms (6)

1. **WebXR** (`webxr/`) - Web-based VR/AR experiences
   - Format: HTML + JavaScript
   - Use case: Browser-based VR

2. **Unity** (`unity/`) - Unity engine scenes
   - Format: Unity prefab JSON
   - Use case: Unity-based games and simulations

3. **Unreal** (`unreal/`) - Unreal Engine blueprints
   - Format: Unreal asset JSON
   - Use case: High-fidelity games

4. **Godot** (`godot/`) - Godot engine scenes
   - Format: .tscn (Godot scene format)
   - Use case: Open-source game development

5. **Three.js** (`threejs/`) - Three.js scenes
   - Format: JavaScript scene configuration
   - Use case: Web-based 3D graphics

6. **Babylon.js** (`babylonjs/`) - Babylon.js scenes
   - Format: JavaScript scene configuration
   - Use case: WebGL game engine

### Robotics Formats (2)

7. **URDF** (`urdf/`) - Unified Robot Description Format
   - Format: XML
   - Use case: ROS robotics simulation

8. **SDF** (`sdf/`) - Simulation Description Format
   - Format: XML
   - Use case: Gazebo robotics simulation

### 3D Interchange Formats (6)

9. **glTF** (`gltf/`) - GL Transmission Format
   - Format: JSON + binary buffers
   - Use case: 3D asset exchange

10. **FBX** (`fbx/`) - Autodesk FBX
    - Format: Binary or ASCII
    - Use case: 3D modeling software

11. **OBJ** (`obj/`) - Wavefront OBJ
    - Format: Plain text geometry
    - Use case: Universal 3D format

12. **Collada** (`collada/`) - Collaborative Design Activity
    - Format: XML (.dae)
    - Use case: 3D asset exchange

13. **STL** (`stl/`) - Stereolithography
    - Format: Binary or ASCII
    - Use case: 3D printing

14. **X3D** (`x3d/`) - Extensible 3D
    - Format: XML
    - Use case: Web-based 3D

### Data Formats (4)

15. **SVG** (`svg/`) - Scalable Vector Graphics
    - Format: XML
    - Use case: 2D projections

16. **HTML** (`html/`) - HTML5 + CSS
    - Format: HTML document
    - Use case: Web embedding

17. **JSON** (`json/`) - Pure JSON scene graph
    - Format: JSON
    - Use case: Data interchange

18. **XML** (`xml/`) - Generic XML scene
    - Format: XML
    - Use case: Data interchange

## Directory Structure

Each export target has:

```
samples/compiled/{target}/
├── README.md              # Target-specific documentation
├── simple-cube.{ext}      # Basic cube with 1 trait
├── complex-scene.{ext}    # 500 objects, 10 traits each
├── physics-demo.{ext}     # Physics simulation example
├── vr-interaction.{ext}   # VR interaction showcase
└── validation.json        # Expected output validation
```

## Sample Scenes

### 1. Simple Cube (`simple-cube.holo`)

```holoscript
cube {
  @color(red)
  @position(0, 1, 0)
  @grabbable
}
```

**Purpose:** Basic compilation test, trait support

### 2. Complex Scene (`complex-scene.holo`)

```holoscript
scene {
  sphere {
    @color(blue)
    @position(0, 2, 0)
    @physics
    @grabbable

    cube {
      @color(red)
      @position(0, 0.5, 0)
      @scale(0.5, 0.5, 0.5)
    }
  }

  plane {
    @color(green)
    @position(0, 0, 0)
    @scale(10, 1, 10)
  }
}
```

**Purpose:** Nested objects, multiple traits, scene graph

### 3. Physics Demo (`physics-demo.holo`)

```holoscript
scene {
  sphere {
    @color(red)
    @position(0, 5, 0)
    @physics
    @gravity
    @collidable
  }

  plane {
    @position(0, 0, 0)
    @collidable
    @static
  }
}
```

**Purpose:** Physics engine integration, collision detection

### 4. VR Interaction (`vr-interaction.holo`)

```holoscript
scene {
  cube {
    @color(blue)
    @position(-1, 1, 0)
    @grabbable
    @throwable
    @clickable
  }

  sphere {
    @color(yellow)
    @position(1, 1, 0)
    @hoverable
    @scalable
  }
}
```

**Purpose:** VR trait support, interaction testing

## Validation

Each compiled output includes a `validation.json` file:

```json
{
  "source": "simple-cube.holo",
  "target": "webxr",
  "compiler_version": "3.4.0",
  "compiled_at": "2026-02-16T18:00:00Z",
  "validation": {
    "syntax_valid": true,
    "objects_count": 1,
    "traits_count": 3,
    "file_size_bytes": 1234,
    "checksum": "sha256:abc123..."
  },
  "expected_behavior": {
    "renders": true,
    "interactive": true,
    "physics_enabled": false
  }
}
```

## Usage

### For Developers

```bash
# Compile HoloScript to specific target
holoscript compile input.holo --target webxr --output samples/compiled/webxr/

# Validate output against expected
holoscript validate samples/compiled/webxr/simple-cube.html
```

### For CI/CD

```bash
# Run validation tests
pnpm test:exports

# Compare outputs
diff samples/compiled/webxr/simple-cube.html expected/simple-cube.html
```

### For Custom Exporters

1. Study the target format in `samples/compiled/{target}/`
2. Implement your exporter following the pattern
3. Validate against these samples
4. Submit PR with your new export target

## Adding New Targets

To add a new export target:

1. Create directory: `samples/compiled/{new-target}/`
2. Add README.md with target documentation
3. Compile all 4 sample scenes
4. Add validation.json for each
5. Update this README
6. Add tests in `tests/exports/{new-target}.test.ts`
7. Submit PR

## Regenerating Samples

```bash
# Regenerate all samples
pnpm run generate:samples

# Regenerate specific target
pnpm run generate:samples --target webxr
```

## Quality Checks

All compiled samples must pass:

- ✅ Syntax validation (target-specific linters)
- ✅ Size checks (reasonable file sizes)
- ✅ Checksum verification
- ✅ Render tests (where applicable)
- ✅ Trait preservation (all traits exported)

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines on:

- Adding new export targets
- Improving existing exporters
- Reporting export bugs
- Submitting sample scenes

---

**Last updated:** 2026-02-16
**HoloScript version:** 3.4.0
**Maintainer:** Brian X Base Team
