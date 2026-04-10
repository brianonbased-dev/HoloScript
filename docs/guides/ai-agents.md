# AI Agents & Brittney

HoloScript is designed for AI-native development. AI agents can generate, validate, and explain HoloScript code.

## Brittney AI

**Brittney** is the AI assistant built specifically for HoloScript development.

### Capabilities

- Generate `.holo` scenes from natural language
- Debug and fix HoloScript errors
- Suggest optimal VR traits
- Explain complex code
- Real-time scene analysis

### Access

Brittney is available through:

1. **MCP Server** - Connect to any AI client
2. **VS Code Extension** - Coming soon
3. **Web Interface** - At holoscript.studio

---

## Using AI to Generate HoloScript

### Natural Language Prompts

Good prompts are specific:

```
❌ "Make a game"
✅ "Create a VR escape room with 3 puzzle stations, a locked door
    that opens when all puzzles are solved, and ambient torch lighting"
```

### Example Workflow

**Prompt:**

> Create a VR meditation space with floating islands, glowing orbs that play
> calming sounds when touched, and a day/night cycle

**AI generates:**

```holo
composition "Meditation Space" {
  environment {
    skybox: "gradient"
    ambient_light: 0.4
    fog: { color: "#eeeeff", density: 0.01 }
  }

  @state {
    time_of_day: 0.5  // 0 = midnight, 0.5 = noon, 1 = midnight
    is_night: false
  }

  template "FloatingIsland" {
    @physics(gravity: false)
    model: "island.glb"

    action float() {
      animate this with {
        property: "position.y"
        from: this.position.y - 0.2
        to: this.position.y + 0.2
        duration: 4s
        loop: "pingpong"
      }
    }

    on_spawn: {
      this.float()
    }
  }

  template "CalmingOrb" {
    @grabbable
    @glowing(intensity: 1.5)
    @spatial_audio

    sounds: ["bowl_C.wav", "bowl_E.wav", "bowl_G.wav"]

    on_click: {
      let sound = random_choice(this.sounds)
      play_spatial_sound(sound, this.position)
      pulse this with {
        scale: 1.3,
        duration: 500ms
      }
    }

    on_grab: {
      this.glow_intensity = 2.5
    }

    on_release: {
      this.glow_intensity = 1.5
    }
  }

  spatial_group "MainIsland" {
    position: [0, 0, 0]

    object "Island_Main" using "FloatingIsland" {
      position: [0, 0, 0]
      scale: 3
    }

    object "Orb_1" using "CalmingOrb" {
      position: [-2, 2, 0]
      color: "#ff9999"
    }

    object "Orb_2" using "CalmingOrb" {
      position: [2, 2, 0]
      color: "#99ff99"
    }

    object "Orb_3" using "CalmingOrb" {
      position: [0, 2, 2]
      color: "#9999ff"
    }
  }

  spatial_group "FloatingIslands" {
    object "Island_2" using "FloatingIsland" {
      position: [-15, 5, 10]
    }
    object "Island_3" using "FloatingIsland" {
      position: [20, 3, -5]
    }
    object "Island_4" using "FloatingIsland" {
      position: [5, 8, 25]
    }
  }

  logic {
    // Day/night cycle - 5 minute full cycle
    every frame {
      @state.time_of_day += 0.00003
      if (@state.time_of_day >= 1) {
        @state.time_of_day = 0
      }

      // Update lighting
      environment.ambient_light = 0.2 + (sin(@state.time_of_day * PI) * 0.4)

      @state.is_night = @state.time_of_day < 0.25 || @state.time_of_day > 0.75
    }

    when @state.is_night {
      // Increase composition glow at night
      find_all("CalmingOrb").forEach(composition => {
        orb.glow_intensity = 2.5
      })
    }

    when !@state.is_night {
      find_all("CalmingOrb").forEach(composition => {
        orb.glow_intensity = 1.5
      })
    }
  }
}
```

---

## MCP Tools for AI

AI agents access HoloScript through MCP tools:

### Generation Tools

| Tool              | Purpose                        |
| ----------------- | ------------------------------ |
| `generate_object` | Single object from description |
| `generate_scene`  | Complete composition           |
| `suggest_traits`  | Recommend traits for use case  |

### Validation Tools

| Tool                  | Purpose                  |
| --------------------- | ------------------------ |
| `validate_holoscript` | Check for errors         |
| `parse_hs`            | Parse to AST             |
| `parse_holo`          | Parse composition to AST |

### Documentation Tools

| Tool                   | Purpose                   |
| ---------------------- | ------------------------- |
| `explain_code`         | Plain English explanation |
| `explain_trait`        | Trait documentation       |
| `list_traits`          | All available traits      |
| `get_syntax_reference` | Syntax help               |
| `get_examples`         | Code examples             |
| `analyze_code`         | Complexity metrics        |

---

## Prompt Engineering for HoloScript

### Scene Generation

```
Create a [genre] environment with:
- [key feature 1]
- [key feature 2]
- [interaction type]
- [atmosphere/mood]
```

**Example:**

```
Create a cyberpunk rooftop environment with:
- Neon signs that can be shot
- A hovering drone that follows the player
- Hackable terminals
- Rain and fog atmosphere
```

### Object Generation

```
Create a [object type] that:
- [visual property]
- [interaction behavior]
- [physics behavior]
- [special effect]
```

**Example:**

```
Create a magic sword that:
- Glows blue when held
- Can be thrown and returns
- Leaves a trail effect
- Makes impact sounds on collision
```

### Fix Generation

```
This HoloScript has an error:
[paste code]

The error is: [error message]

Please fix it and explain what was wrong.
```

---

## AI-Assisted Debugging

### Error Analysis

AI can analyze validation errors:

```
AI: I see two issues:
1. Line 15: '@grabbble' is misspelled, should be '@grabbable'
2. Line 23: Missing closing brace for the spatial_group
```

### Performance Suggestions

```
AI: Your scene has 500 physics objects. Consider:
1. Using @trigger instead of @collidable for non-essential collisions
2. Disabling physics on distant objects
3. Using LOD (level of detail) for models
```

---

## Integrating Custom AI

### Claude Desktop

1. Install MCP Server
2. Add to Claude config
3. Ask Claude about HoloScript

### GPT/Custom LLM

Use the MCP HTTP endpoint:

```python
import requests

response = requests.post("http://localhost:8080/tools/generate_scene", json={
    "description": "A simple room with a table and chairs"
})

holo_code = response.json()["code"]
```

### Cursor / VS Code AI

Add MCP server to workspace config for inline AI suggestions.

---

## Best Practices

### For Prompting

1. **Be specific** about interaction types
2. **Mention platform** if targeting specific hardware
3. **Describe scale** (room-sized, warehouse, outdoor)
4. **Include mood/atmosphere**

### For Reviewing AI Output

1. **Validate** with `validate_holoscript` tool
2. **Test** in preview mode
3. **Simplify** complex generated code
4. **Add comments** for maintainability

### For Iteration

1. Start with basic scene
2. Add features incrementally
3. Test after each addition
4. Ask AI to optimize/refactor
