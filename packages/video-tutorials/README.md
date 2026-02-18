# @holoscript/video-tutorials

Programmatic instructional video generation for HoloScript and HoloLand using **Remotion** + **Code Hike**.

## Quick Start

```bash
# Install
cd packages/video-tutorials
npm install

# Install Remotion Agent Skills (teaches Claude the Remotion API)
npx skills add remotion-dev/skills

# Preview in browser
npm run dev
# → http://localhost:3000

# Render all videos
npm run render
# → out/syntax-introduction.mp4
# → out/unity-compiler-walkthrough.mp4
```

## Available Videos

| Composition ID | Output File | Duration |
|---------------|-------------|----------|
| `SyntaxIntroduction` | `syntax-introduction.mp4` | ~33s |
| `UnityCompilerWalkthrough` | `unity-compiler-walkthrough.mp4` | ~32s |

## Generate a New Video with Claude Code

1. Open Claude Code in the HoloScript repo root
2. The `holoscript-video` skill loads automatically
3. Prompt Claude:

```
"Create a Code Hike walkthrough for the Godot compiler.
 Show: a .holo scene, the GodotCompiler invocation, and the GDScript output.
 5 steps, 30 seconds each."
```

Claude will:
- Create `src/content/godot-compiler.md` (Code Hike markdown)
- Create `src/compositions/GodotCompilerWalkthrough.tsx`
- Register it in `src/Root.tsx`

Then run `npm run dev` to preview and `npm run render` to produce the MP4.

## Render a Specific Composition

```bash
# By composition ID
tsx scripts/render-all.ts --composition GodotCompilerWalkthrough

# By keyword filter
npm run render:unity
npm run render:godot
```

## Generate Narration (ElevenLabs)

Requires `ELEVENLABS_API_KEY` environment variable.

```bash
npm run narration -- --script unity-compiler
npm run narration -- --all
```

Audio saved to `public/narration/*.mp3`. Reference in Remotion:
```tsx
<Audio src={staticFile("narration/unity-compiler.mp3")} />
```

## Record CLI Demos (Asciinema)

```bash
# Record the Unity compile demo
npm run record:cli -- --demo unity-compile

# Record all demos
npm run record:cli -- --all

# List available demos
npm run record:cli -- --list
```

Output: `public/terminal-demos/*.gif`

## CI/CD

Videos are automatically rendered on every GitHub Release via `.github/workflows/render-videos.yml`.

Rendered MP4s are:
- Uploaded as GitHub Actions artifacts (90-day retention)
- Attached to the GitHub Release as downloadable assets

## Project Structure

```
src/
├── index.ts                     # Remotion entry point
├── Root.tsx                     # All composition registrations
├── compositions/
│   ├── SyntaxIntroduction.tsx   # .holo syntax beginner walkthrough
│   └── UnityCompilerWalkthrough.tsx  # Unity compiler demo
├── components/
│   ├── TitleCard.tsx            # Animated title slide
│   └── CodeStep.tsx             # Syntax-highlighted code walkthrough step
└── utils/theme.ts               # Brand colors and typography

scripts/
├── render-all.ts                # Headless renderMedia() runner
├── generate-narration.ts        # ElevenLabs TTS pipeline
└── record-cli-demo.py           # Asciinema CLI recording automation
```

## Adding a New Compiler Demo

1. Copy `src/compositions/UnityCompilerWalkthrough.tsx` → rename for target
2. Update the `HOLO_STEPS` and `OUTPUT_STEPS` arrays with accurate code
3. Register in `src/Root.tsx` with a unique `id`
4. Add to `COMPOSITION_MAP` in `scripts/render-all.ts`
5. Add narration script to `generate-narration.ts` `SCRIPTS` map
6. Run `npm run dev` to preview, `npm run render` to produce MP4

## Compiler Target Coverage

15 compiler demo videos planned:

- [x] Unity C# — `UnityCompilerWalkthrough`
- [ ] Godot GDScript
- [ ] Babylon.js TypeScript
- [ ] Vision Pro Swift
- [ ] URDF XML (Robotics)
- [ ] VRChat UdonSharp
- [ ] WebGPU TypeScript
- [ ] React Three Fiber
- [ ] iOS UIKit
- [ ] Android XML
- [ ] OpenXR C++
- [ ] DTDL JSON
- [ ] Unreal Engine C++
- [ ] WebAssembly
- [ ] USD (Universal Scene Description)
