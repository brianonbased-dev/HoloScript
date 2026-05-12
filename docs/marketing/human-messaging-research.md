# Human Messaging Research

Purpose: make HoloScript legible to professional humans before asking them to accept the deeper architecture.

## What Successful Projects Do

Reviewed public positioning from [Next.js](https://nextjs.org/), [Supabase](https://supabase.com/), [Tailwind CSS](https://tailwindcss.com/), [Astro](https://astro.build/), [Tauri](https://tauri.app/), and [Bun](https://bun.sh/).

The recurring pattern:

- lead with a recognizable category
- state the practical outcome before the architecture
- show a one-command path to try it
- name concrete primitives, not internal theory
- postpone philosophy until the reader already understands what the tool does
- avoid large static counts on the first screen unless they are live, verified, and meaningful

## HoloScript Positioning

Primary line:

> Describe an interface, workflow, robot, or 3D scene. HoloScript turns it into something that runs.

Category:

> A semantic app platform for AI-assisted builders.

Plain explanation:

> Write intent in `.holo`, `.hsplus`, or `.hs`; the runtime can execute it directly, and compilers translate it for specific targets when native output is useful.

## Messaging Ladder

1. What is this?
   - A way to describe software intent in files that can run, compile, and be inspected by agents.
2. What can I build?
   - Interfaces, spatial scenes, agent workflows, robotics/simulation bridges, services, and internal tools.
3. How do I try it?
   - `npx create-holoscript@latest my-app`, Studio, playground, or MCP config.
4. Why should I trust it?
   - Runtime fallback, explicit files, live health checks, `docs/NUMBERS.md`, Absorb graph analysis, tests, and honest gaps.
5. Why does it matter?
   - The same intent can stay readable to humans, modifiable by agents, and portable across targets.

## Use Examples as Story Proof

HoloScript has enough example files to make the product concrete. Use them early:

- `.hs` tells process: `examples/pipelines/inventory-sync.hs` shows source -> transform -> validate -> sink.
- `.hsplus` tells behavior: `examples/three-format-showcase/smart-gallery.hsplus` shows templates, state, interactions, and audio.
- `.holo` tells full-world intent: `examples/iot/holotwin-smart-farm.holo` shows sensors driving a 3D digital twin.
- `.holo` can also carry ambitious use-case narratives: `examples/novel-use-cases/05-robot-training-metaverse.holo` ties simulation, agents, feedback, and robotics targets together.

Rule: start with what the example is trying to do, then show the format. Do not start with syntax theory.

## Codebase Inventory Anchors

Use these surfaces when validating public claims:

- Root workspace: `package.json`, workspace packages, repo scripts.
- Language core: `packages/core/src/parser`, `packages/core/src/compiler`, `packages/core/src/traits`.
- Runtime and CLI: `packages/runtime`, `packages/cli`.
- MCP surface: `packages/mcp-server`, live `https://mcp.holoscript.net/health`.
- Builder surface: `packages/studio`, `services/holoscript-net`.
- Codebase intelligence: `packages/absorb-service`, `holoscript graph-status`, `holoscript query --provider openai`.
- Simulation stack: `packages/engine/src/simulation`, with the gap caveat already documented in `AGENTS.md`.
- Current metrics: verify through `docs/NUMBERS.md` commands rather than copying counts into homepage copy.

## Words to Avoid on First Contact

Do not lead with:

- AI-native spatial operating system
- uAA2++
- swarm intelligence
- x402 settlement
- zero hallucinations
- no-code
- universal everything
- static ecosystem counts

These can appear later when the reader has context, but they are too abstract or too loaded for first-contact copy.

## README and Website Rule

The README and homepage should match on the first idea:

> Describe it once. Run it where it needs to.

Then immediately show how:

- source files: `.holo`, `.hsplus`, `.hs`
- runtime execution
- compilers
- MCP tools
- Studio/CLI quick start
