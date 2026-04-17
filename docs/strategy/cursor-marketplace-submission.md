# Cursor Marketplace — HoloScript MCP Submission Prep

**Last updated**: 2026-04-17
**Status**: Prep only — final submission requires user action in Cursor UI
**Target**: First listing in Cursor's MCP marketplace to establish "default spatial/simulation MCP" position before competitors (esp. Babylon.js community MCP)

---

## Why This Matters (from competitive brief)

Per `deep-dive-babylon-mcp.md`: Cursor's MCP marketplace is the distribution surface for agent-native tooling in 2026. The first-listed, most-downloaded, best-reviewed MCP server in a category becomes the default. For HoloScript:

- **Babylon.js community MCP**: ~20 tools, scene-manipulation only, community-maintained
- **HoloScript MCP**: 215+ tools, semantic IR + simulation + codebase intelligence + HoloMesh, first-party

If HoloScript lists first with a crisp description, we own "spatial / simulation MCP in Cursor" as the default answer when a Cursor user searches. Babylon's listing becomes "the other one."

---

## Submission Overview

### Pre-requisites (verify before submitting)

- [ ] HoloScript MCP server is publicly reachable at `mcp.holoscript.net` (✅ per `S.MCP` in MEMORY.md — 215 tools, v6.0.4, UP)
- [ ] Authentication documented (OAuth 2.1 supported per S.MCP)
- [ ] `/.well-known/mcp` discovery endpoint returns valid metadata (check: `curl https://mcp.holoscript.net/.well-known/mcp`)
- [ ] Server responds to `GET /health` with valid JSON + tool count
- [ ] Tool schemas are self-describing (tested from Claude Desktop or Cursor locally)

### Submission mechanism (as of April 2026)

Cursor submissions typically go through:
1. **GitHub PR to `cursor-ai/cursor-mcp` or equivalent marketplace repo** (verify current URL)
2. **In-app submission** via Cursor's Settings → MCP → Submit
3. **Direct outreach** to Cursor team if it's a strategic partnership tier

Check the current process at https://docs.cursor.com/mcp or https://cursor.com/mcp-marketplace before submission.

---

## Submission Materials (ready to copy-paste)

### Title

```
HoloScript — Spatial & Simulation MCP
```

### Short description (1 line, <80 chars)

```
Agent-native spatial, simulation, and codebase intelligence for Cursor.
```

### Long description (2-3 paragraphs)

```
HoloScript is a universal semantic platform for spatial computing and scientific
simulation. It compiles a single .holo source to 30+ targets (Three.js, React
Three Fiber, Unity, Unreal, USD, WebGPU, and more) and exposes all of its
capabilities as MCP tools — 215+ of them — so Cursor agents can author, compile,
simulate, and verify 3D scenes and physics simulations as first-class operations.
It now includes a bundled **bio-discovery skill** and plugin, allowing agents
to query ChEMBL and Open Targets and output hash-verified AlphaFold binding scenes.

Unlike scene-graph MCP plugins that expose a single runtime, HoloScript gives
agents a comprehensible semantic intermediate representation. Agents reason over
.holo AST, not serialized scene state. Includes built-in codebase intelligence
(Absorb, GraphRAG-powered), multi-agent coordination (HoloMesh), and hash-
verified simulation replay via the IEEE TVCG-submitted "Trust by Construction"
contract architecture.

Use HoloScript MCP in Cursor for: spatial scene authoring, physics simulation,
CAE / FEA work in the browser, cross-engine 3D compilation, scientific
visualization, agent-driven spatial apps, and any workflow where you need
verifiable reproducibility as evidence.
```

### Tags

```
spatial, 3d, simulation, physics, webgpu, cae, fea, compiler, semantic,
provenance, webxr, usd, three.js, react-three-fiber, agent-native,
codebase-intelligence, graphrag, multi-agent
```

### Configuration (for users to copy)

```json
{
  "mcpServers": {
    "holoscript": {
      "url": "https://mcp.holoscript.net/mcp",
      "headers": {
        "Authorization": "Bearer ${HOLOSCRIPT_API_KEY}"
      }
    }
  }
}
```

**Important per W.GOLD.041**: For Antigravity/Gemini users the above `${VAR}` syntax won't interpolate — they need to paste literal key values. Add this note to the submission description.

### OAuth / Auth note

```
HoloScript MCP supports OAuth 2.1 for production deployments. For getting
started, request an API key at https://mcp.holoscript.net/auth (or via the
HoloScript CLI) and set HOLOSCRIPT_API_KEY in your environment. Admin/founder
tier is free with no rate limits during the beta.
```

### Categories (select best fit)

- **Primary**: Graphics / 3D / Spatial
- **Secondary**: Simulation / Scientific Computing
- **Tertiary**: Codebase Intelligence

### Screenshots / media

Recommended visuals for the listing (create or reuse):

1. **Hero**: The drug-discovery flagship demo (AlphaFold + ChEMBL verifiable binding scene from `.claude/skills/bio-discovery/SKILL.md`)
2. **Tool list screenshot**: Cursor showing the 215+ HoloScript tools accessible in the MCP picker
3. **Workflow demo**: Short GIF of asking Cursor to "compile this .holo to USD" and seeing the file appear
4. **Codebase intel**: Cursor asking "what calls trainVAE" and getting HoloScript Absorb's GraphRAG answer

---

## Sample Listing Page Text

```markdown
# HoloScript — Spatial & Simulation MCP

**Agent-native spatial, simulation, and codebase intelligence for Cursor.**

## What is HoloScript?

HoloScript is a universal semantic platform. One `.holo` file compiles to 30+ targets
(Three.js, R3F, Unity, Unreal, USD, WebGPU). Every capability is exposed as an MCP tool.

## What the 215+ MCP tools do

- **Compile**: `.holo` → any supported target (parse, compile, codegen)
- **Simulate**: Run FEA/physics simulations with browser-native WebGPU, replay bit-identically
- **Absorb**: GraphRAG-powered codebase intelligence (map, query, impact analysis)
- **HoloMesh**: Multi-agent team coordination, knowledge store, task board
- **Render**: Preview scenes, capture screenshots, benchmark
- **Verify**: Run NAFEMS benchmarks, verify hash chains, audit provenance

## Example workflows

| Ask Cursor... | HoloScript MCP does |
|---|---|
| "Compile scene.holo to Unity" | `compile_to_unity` → Scene.cs |
| "Find EGFR inhibitors and simulate binding" | `mcp__plugin_bio-research_*` + `compile_holo` → verifiable scene |
| "Run FEA on this bracket" | `simulate_fea` → results + provenance |
| "Find everything that uses the Trait decorator" | `holo_query_codebase` → callers + impact |
| "Publish this composition to HoloMesh" | `mesh_publish_composition` → signed artifact |
| "Benchmark this solver" | `holo_benchmark_solver` → latency + accuracy metrics |

## Setup

Add to your Cursor MCP config:

[config JSON above]

Get your API key: https://mcp.holoscript.net/auth

## Links

- **Docs**: https://holoscript.net
- **GitHub**: https://github.com/brianonbased-dev/HoloScript
- **Paper**: "Trust by Construction" — IEEE TVCG 2026 (submitted)
- **Ecosystem**: https://mcp.holoscript.net/health (verify live tool count)
```

---

## Launch Checklist

- [ ] Verify mcp.holoscript.net is stable and tool count >= 215 (use as the lead number)
- [ ] Run `curl https://mcp.holoscript.net/.well-known/mcp` to confirm discovery metadata
- [ ] Record the multi-target demo GIF (from `examples/multi-target-demo/`)
- [ ] Capture the Cursor-with-HoloScript-tools screenshot
- [ ] Test the submission config in a fresh Cursor install to validate copy-paste works
- [ ] Check Cursor marketplace submission process (URL or in-app flow) — may have changed
- [ ] Submit
- [ ] Announce on X, LinkedIn, HN, Cursor Discord
- [ ] Add `cursor` tag to HoloScript GitHub topics

## Post-Submission Monitoring

Per `competitive-monitoring-plan.md`:

- Track listing position in Cursor marketplace weekly
- Track download / install counts monthly
- Monitor reviews; respond within 48h
- Watch for Babylon.js community MCP listing (red alert if it appears)
- Flag any competing "spatial MCP" or "simulation MCP" listings

## Follow-up Cursor Integrations

Once listed, build on it:

1. **Cursor-specific agent skill** that uses HoloScript MCP tools
2. **Cursor Composer 2 training data contribution** — if Cursor accepts structured `.holo` examples for their RL training
3. **Cursor Background Agents demo** — show HoloScript simulation running in Cursor's parallel VM
4. **Cursor + HoloScript co-marketing** — if the listing takes off, reach out for blog post or case study

---

## Action Items for the User

1. [ ] Verify MCP server state before submission (`curl /.well-known/mcp`)
2. [ ] Record multi-target demo video or GIF
3. [ ] Log into Cursor / check current marketplace submission process
4. [ ] Copy the Title / Short / Long descriptions above into submission form
5. [ ] Upload screenshots / media
6. [ ] Submit
7. [ ] Graduate this submission workflow to knowledge store for reuse

## Notes for future sessions

- Cursor's marketplace evolves fast — `releasebot.io/updates/cursor` had MCP GA on April 8, 2026. Check for submission process changes before each use.
- If Cursor adds paid/featured listing tiers, budget allocation becomes a separate decision.
- Track by "marketplace-first" strategy: when a new IDE/platform ships MCP marketplace, submit within 48h of availability.
