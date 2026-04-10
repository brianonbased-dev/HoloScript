# Revolutionizing 2D UI with HoloScript V6

HoloScript V6 introduces a dramatic shift in how we build flat interfaces (dashboards, forms, apps, mobile/web). Instead of settling for "rectangles and CSS" or managing complex native elements, the V6 framework bridges the gap by making 2D interfaces living, agent-native, physics-aware projections of the universal semantic platform.

We call this **HoloScript's Semantic2D Pipeline**.

> [!TIP]
> The Semantic2D Pipeline is a standalone package \`@holoscript/semantic-2d\` that integrates directly into React/R3F stacks, replacing traditional DOM mutations with declarative, 3D-aware semantic entities.

## The Concept

Traditionally, building an app involves mapping abstract data to HTML tags. HoloScript flips this: you declare the "Meaning" of a component via traits, and the runtime projects that meaning onto the screen. Under the engine, your app is a spatial simulation. It inherits:

- Physics and kinetic feedback
- Autonomous Agent interactions (e.g., bounties and economy)
- 3D procedural rendering for backgrounds, micro-interactions, and borders

## Scaffolding a new Semantic2D App

Start immediately using the CLI's dedicated \`2d-revolution\` template:

\`\`\`bash
npx create-holoscript-app@latest my-dashboard -t 2d-revolution
cd my-dashboard
pnpm install
pnpm dev
\`\`\`

## The 8 Semantic2D Traits

By leveraging traits natively in \`.holo\` or \`.hsplus\` files, you instruct the compiler how to map spatial entities to their 2D layout semantics. These traits are parsed by the \`FlatSemanticCompiler\`.

1. \`@2d_canvas\` - Configures the root hybrid immersive projection.
2. \`@semantic_entity\` - Upgrades a generic node into an interactive, typed UI component.
3. \`@semantic_layout\` - Replaces Flexbox/Grid with intent-based spacing algorithms.
4. \`@dynamic_visual\` - Assigns adaptive colors and distortions based on meaning.
5. \`@particle_feedback\` - Binds user interaction (hover/intent) to spatial particle bursts.
6. \`@agent_attention\` - Establishes X402 micro-economies and negotiation thresholds directly on buttons.
7. \`@intent_driven\` - Declares abstract actions rather than clicking event handlers.
8. \`@live_metric\` - Connects raw data streams to auto-formatting color-adaptive readouts.

## Example Composition

\`\`\`yaml
Composition MyAdminDashboard
environment:
theme "dark-void"

objects:

- id DashboardContainer
  traits: - @2d_canvas { projection: "flat-semantic", responsive: true } - @semantic_layout { flow: "cluster", wrap: true }
  children: - id ConversionMetric
  traits: - @semantic_entity { type: "metric-card" } - @live_metric { format: "percentage" } - @particle_feedback { on: "hover", type: "burst" }
  text: "84.5%" - id AssignAgentButton
  traits: - @semantic_entity { type: "button", meaning: "call-to-action", priority: 1 } - @agent_attention { swarm_size: 5, bounty_threshold: 15 } - @dynamic_visual { color: "purple" }
  text: "Deploy Swarm"
  \`\`\`
