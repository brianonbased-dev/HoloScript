# How to Use This Template

This directory contains a complete template for creating new HoloScript examples. Use it as a starting point for your own examples.

## Quick Start

### 1. Copy the Template

```bash
# Create a new example directory
mkdir -p examples/[category]/[your-example-name]

# Copy template files
cp examples/TEMPLATE/template.holo examples/[category]/[your-example-name]/[your-file].holo
cp examples/TEMPLATE/README.md examples/[category]/[your-example-name]/README.md
cp examples/TEMPLATE/TUTORIAL.md examples/[category]/[your-example-name]/TUTORIAL.md
```

**Categories:**

- `general/` - Universal VR/AR examples (Unity, Unreal, Godot, WebXR)
- `specialized/` - Platform-specific or industry-specific examples

### 2. Fill in the Metadata

Open `[your-file].holo` and update the metadata block:

```holoscript
metadata {
  name: "Your Actual Example Name"
  description: "A clear, one-sentence description"
  author: "Your Name"
  version: "1.0.0"
  created: "2025-02-20"  // Today's date

  category: "general"  // or "specialized"
  difficulty: "beginner"  // beginner, intermediate, or advanced

  platforms: [
    // List platforms this example targets
    "unity",
    "unreal",
    "godot",
    "webxr"
  ]

  tags: [
    // Searchable keywords
    "vr",
    "interactive",
    "physics"
  ]

  estimated_time: "2 hours"  // How long to complete
}
```

### 3. Replace Placeholders

Search and replace these placeholders throughout all files:

| Placeholder                   | Replace With         | Example                          |
| ----------------------------- | -------------------- | -------------------------------- |
| `[Your Example Name]`         | Your example's name  | "VR Physics Playground"          |
| `[YourExampleName]`           | CamelCase name       | "VRPhysicsPlayground"            |
| `[your-example-name]`         | kebab-case name      | "vr-physics-playground"          |
| `[Your Name or Organization]` | Your attribution     | "Jane Doe" or "ACME Corp"        |
| `[YYYY-MM-DD]`                | Today's date         | "2025-02-20"                     |
| `[Brief description]`         | One-sentence summary | "An interactive physics sandbox" |
| `[Detailed description]`      | Full explanation     | "This example demonstrates..."   |

**Find all placeholders:**

```bash
# Search for brackets in your example directory
grep -r "\[.*\]" examples/[category]/[your-example-name]/
```

### 4. Customize the Code

In `[your-file].holo`:

1. **Keep the structure** - The template provides a good organization
2. **Replace example objects** - Change the `interactive_cube` to your actual objects
3. **Add your logic** - Implement your specific features
4. **Configure platforms** - Adjust `export_config` for your target platforms

**Optional sections to remove:**

- `script#example_behavior` - If not using custom scripts
- `audio#background_music` - If not using audio
- `export_config` - If using default settings

### 5. Write the Documentation

**README.md:**

- Replace all `[placeholders]` with actual content
- Fill in the "Overview" section with your example's description
- List all features in the "Features" section
- Provide clear setup instructions
- Add troubleshooting for common issues
- Remove sections that don't apply (e.g., "Mobile/Quest" if desktop-only)

**TUTORIAL.md:**

- Explain 4-6 key concepts your example demonstrates
- Provide a step-by-step walkthrough
- Include code snippets with explanations
- Add common patterns and best practices
- Document troubleshooting steps

**Tips:**

- Write README for **users** (how to run the example)
- Write TUTORIAL for **learners** (how to understand and modify it)
- Use code snippets liberally
- Include platform-specific notes where relevant

### 6. Validate Your Example

```bash
# Run validation tests
npm test examples.validation.test.ts

# Compile to your target platforms
holoscript compile examples/[category]/[your-example-name]/[your-file].holo \
  --target unity --output ./test-build/

# Verify all files exist
ls -la examples/[category]/[your-example-name]/
# Should see: [your-file].holo, README.md, TUTORIAL.md
```

### 7. Add to Examples Catalog

**Update examples/INDEX.md:**

Add your example to the appropriate table:

```markdown
| #   | Example                                          | Category | Difficulty | Lines | Platforms     | Key Features       |
| --- | ------------------------------------------------ | -------- | ---------- | ----- | ------------- | ------------------ |
| X   | [Your Example Name](category/your-example-name/) | General  | Beginner   | ~XXX  | Unity, Unreal | Feature1, Feature2 |
```

**Update examples/README.md:**

Add to the use case section:

```markdown
### [Your Category]

- ✅ Your Example Name - [Use case description]
```

## Template File Structure

```
TEMPLATE/
├── template.holo          # Complete HoloScript example with all sections
├── README.md             # User-facing documentation template
├── TUTORIAL.md           # Tutorial/learning template
└── HOW_TO_USE.md        # This file
```

## What's Included in template.holo

### Essential Elements

1. **Metadata block** - Required for validation and cataloging
2. **Composition** - Main scene container
3. **Scene configuration** - Lighting, background
4. **Environment objects** - Ground plane example
5. **Interactive objects** - Grabbable cube with physics
6. **UI elements** - World-space info panel
7. **Player setup** - VR player with controllers and locomotion
8. **Custom scripts** - Behavior scripting example
9. **Audio** - Background music and spatial sound
10. **Export config** - Platform-specific settings

### Code Comments

The template includes:

- Section headers (e.g., `# Example object 1: Environment`)
- Inline comments explaining key properties
- Example values with units (e.g., `effort: 150 // Nm torque`)
- Alternative options in comments

## Common Customizations

### Remove VR/AR Features

If your example is desktop-only:

```holoscript
# DELETE or comment out:
player#vr_player @vr { ... }

# REPLACE with:
camera#main_camera {
  position: { x: 0, y: 1.6, z: 5 }
  rotation: { x: 0, y: 180, z: 0 }
}
```

### Add Networking

For multiplayer examples:

```holoscript
network_manager#multiplayer @photon {
  max_players_per_room: 16

  player#networked_player @networked {
    transform_sync {
      position: true
      rotation: true
      send_rate: 20
    }
  }
}
```

### Add AR Features

For AR examples:

```holoscript
ar_session#ar_config @mobile {
  plane_detection: "horizontal"

  on_plane_detected {
    spawn_object: interactive_content
    enable_gestures: ["pinch", "drag", "rotate"]
  }
}
```

### Add Platform-Specific Optimizations

For Quest/mobile:

```holoscript
platform_config#quest {
  graphics {
    texture_compression: "astc_6x6"
    shader_quality: "medium"
  }

  performance {
    target_framerate: 90
  }
}

object#ground {
  lod_group {
    lod_0: { distance: 0, mesh: "high.mesh" }
    lod_1: { distance: 20, mesh: "low.mesh" }
  }
}
```

## Validation Checklist

Before submitting your example, verify:

- [ ] All `[placeholder]` text replaced
- [ ] Metadata block filled in completely
- [ ] README.md has clear setup instructions
- [ ] TUTORIAL.md explains key concepts
- [ ] Code compiles without errors
- [ ] Works on at least 2 target platforms
- [ ] File naming follows conventions:
  - `.holo` file: lowercase-with-hyphens.holo
  - README.md and TUTORIAL.md present
- [ ] Added to examples/INDEX.md
- [ ] Added to examples/README.md
- [ ] Code follows HoloScript style guide
- [ ] No hardcoded paths or platform-specific assumptions

## Style Guidelines

### HoloScript Code

- **Indentation**: 2 spaces
- **Naming**:
  - Objects: `object#snake_case`
  - Variables: `camelCase`
  - Constants: `UPPER_CASE`
- **Comments**: Explain "why", not "what"
- **Organization**: Group related objects together

### Documentation

- **Tone**: Friendly, educational, encouraging
- **Structure**: Clear headings, short paragraphs
- **Code snippets**: Commented, self-contained
- **Examples**: Concrete, runnable
- **Links**: Relative paths for internal docs

## Getting Help

- **HoloScript Docs**: [docs/](../../docs/)
- **Other Examples**: Browse [examples/](../) for inspiration
- **Community**: [Discord](https://discord.gg/holoscript)
- **Issues**: [GitHub Issues](https://github.com/holoscript/holoscript/issues)

---

**Ready to create?** Copy the template, fill it in, and share your example with the community! 🚀
