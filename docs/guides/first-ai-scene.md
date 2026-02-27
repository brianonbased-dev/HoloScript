# Your First AI Scene with Studio

**Duration:** 15 minutes
**Prerequisites:** None
**You'll Learn:** Natural language scene generation, Brittney AI assistant, real-time preview, publishing

---

## What You'll Build

A complete VR scene with AI-generated content in under 15 minutes:
- Procedurally generated environment
- Interactive objects
- Basic physics
- Shareable link

**No coding required** - Brittney AI handles everything.

---

## Step 1: Launch HoloScript Studio

### Option A: Web (Recommended for First Time)

Visit **[studio.holoscript.net](https://studio.holoscript.net)** in your browser.

### Option B: Local Development

```bash
# Clone repository
git clone https://github.com/brianonbased-dev/Holoscript.git
cd Holoscript/packages/studio

# Install dependencies
pnpm install

# Start Studio
pnpm dev
```

Open `http://localhost:3100` in your browser.

---

## Step 2: Meet Brittney AI

When Studio loads, you'll see **5 modes** at the top:

- 🎨 **Creator** (default) - AI-driven scene building
- 🖌️ **Artist** - Shader/material editor
- 🎬 **Filmmaker** - Cinematic camera paths
- ⚙️ **Expert** - Code editor
- 🦴 **Character** - Animation editor

**Stay in Creator mode** for this tutorial.

### The Brittney Chat Panel

Look for the **chat icon** (💬) on the right side. Click it to open Brittney AI.

**Brittney is your AI scene designer.** She:
- Generates scenes from natural language
- Suggests improvements
- Fixes errors
- Optimizes performance
- Explains HoloScript concepts

---

## Step 3: Generate Your First Scene

### Prompt Brittney

In the chat panel, type:

```
Create a peaceful forest clearing with a campfire in the center.
Add 3-4 trees around the edges, some rocks near the fire, and a log to sit on.
Make the fire glow orange and emit light. Add physics to the rocks so I can throw them.
```

Press **Enter** or click **Send**.

### Watch the Magic

Brittney will:
1. Analyze your prompt
2. Generate HoloScript code
3. Parse and validate it
4. Render the scene in 3D

**This takes 3-5 seconds.**

---

## Step 4: Explore Your Scene

### Viewport Controls

- **Left Mouse** + Drag: Orbit camera
- **Right Mouse** + Drag: Pan camera
- **Scroll Wheel**: Zoom in/out
- **Middle Mouse** + Drag: Pan (alternative)

### Object Selection

- **Left Click** on any object to select it
- **Properties panel** (right side) shows object details

### Transform Gizmos

With an object selected:
- **G**: Move (translate)
- **R**: Rotate
- **S**: Scale

Click and drag the colored arrows/circles to transform.

---

## Step 5: Refine with Brittney

### Ask for Changes

Don't like something? Ask Brittney to fix it:

```
Make the trees taller and add more rocks around the campfire
```

```
Change the sky to sunset colors - orange and purple
```

```
Add a wooden sign that says "Welcome Traveler"
```

Brittney will **incrementally update** the scene, preserving what you liked.

### Scene Critique

Ask Brittney for feedback:

```
Analyze this scene and suggest improvements
```

She'll provide:
- ✅ What works well
- ⚠️ Potential issues
- 💡 Optimization suggestions
- 🎨 Aesthetic improvements

---

## Step 6: Test Interactivity

### Grab and Throw

If you added physics to objects:

1. Click **VR Mode** button (top-right)
2. If you have a VR headset, enter VR
3. Use hand tracking or controllers to grab physics objects
4. Throw them around!

**No headset?** Desktop simulation works too - click and drag physics objects.

### Test Fire Light

Walk around the campfire - notice how the light affects nearby objects dynamically.

---

## Step 7: Add AI NPCs (Optional)

Want to add an AI character? Ask Brittney:

```
Add a friendly forest ranger NPC near the campfire.
They should greet visitors and tell them about the forest.
Use the @llm_agent trait for natural conversation.
```

Brittney will:
- Create the NPC object
- Configure the `@llm_agent` trait
- Set up conversation triggers
- Add appropriate dialog prompts

**Try talking to the NPC:** Click them and type in the chat.

---

## Step 8: Publish and Share

### One-Click Publishing

1. Click **Publish** button (top-right)
2. Studio generates a shareable URL
3. Copy the link

**That's it!** Anyone with the link can:
- View your scene in their browser
- Enter VR mode (if they have a headset)
- Interact with objects
- Chat with AI NPCs (if added)

**No installation required for viewers.**

---

## Step 9: Export to Other Platforms (Advanced)

Want to use this scene in Unity, Unreal, or Godot?

1. Switch to **Expert Mode** (⚙️)
2. Click **Export** button
3. Choose target platform:
   - Unity (C# MonoBehaviour)
   - Unreal (C++/Blueprint)
   - Godot (GDScript)
   - visionOS (Swift + RealityKit)
   - WebGPU (standalone HTML)
   - And 20+ more targets

4. Download the generated code
5. Import into your engine

**Your scene works everywhere** - that's the HoloScript promise.

---

## What You Just Learned

✅ How to use HoloScript Studio
✅ Natural language scene generation with Brittney AI
✅ Viewport navigation and object manipulation
✅ Iterative refinement with AI assistance
✅ Scene critique and optimization
✅ Adding AI NPCs with @llm_agent
✅ Publishing and sharing
✅ Cross-platform export

---

## Next Steps

### Learn More AI Features

- [Building Your First AI NPC](/guides/first-ai-npc) - Deep dive into @llm_agent
- [Multi-Agent Coordination](/academy/level-3-advanced/05-agent-choreography) - Multiple AI agents working together
- [AI Traits Reference](/guides/ai-agents) - All 6 core AI traits

### Explore Other Studio Modes

- [Shader Graph Editor](/guides/shader-editor) - Artist mode for materials (🖌️)
- [Cinematic Timeline](/guides/filmmaker-mode) - Camera paths and keyframes (🎬)
- [Character Animation](/guides/character-mode) - Import GLB models, animate (🦴)

### Advanced Workflows

- [Real-Time Collaboration](/guides/collaboration) - Multi-user editing
- [Performance Optimization](/guides/optimization) - Scaling to 1000+ objects
- [VR Hand Tracking](/guides/vr-features) - Quest 3 & Vision Pro support

---

## Troubleshooting

### Brittney Isn't Responding

1. Check your internet connection (AI requires API access)
2. Verify LLM provider settings (Studio → Settings → AI)
3. Check browser console for errors (F12)

### Scene Won't Load

1. Clear browser cache (Ctrl+Shift+Delete)
2. Refresh page (F5)
3. Check HoloScript syntax in Expert mode (look for red squiggles)

### VR Mode Not Working

1. Ensure WebXR supported browser (Chrome, Edge, Firefox Reality)
2. Connect VR headset before clicking VR button
3. Grant browser permission to access VR device

### Performance Issues

1. Click **Benchmark** button (top toolbar)
2. If FPS < 60, ask Brittney: "Optimize this scene for performance"
3. Consider reducing object count or enabling LOD

---

## Community & Support

- **Discord**: [discord.gg/holoscript](https://discord.gg/holoscript)
- **GitHub Issues**: [github.com/brianonbased-dev/Holoscript/issues](https://github.com/brianonbased-dev/Holoscript/issues)
- **Examples**: [github.com/brianonbased-dev/Holoscript/tree/main/examples](https://github.com/brianonbased-dev/Holoscript/tree/main/examples)

Happy building! 🎨✨
