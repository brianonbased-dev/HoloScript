# Battlecard — Cursor / Composer 2

**Last updated**: 2026-04-17
**Threat level**: 🟡 **MEDIUM** (different layer — partnership opportunity more than competition)
**Primary risk**: Cursor adds generic "domain compilers" via MCP-pluggable registry, eating the dev-facing wedge

**Strategic note**: Cursor is best treated as a distribution channel, not a competitor. HoloScript MCP should be *inside* Cursor, not against it.

---

## Quick Overview

| | |
|---|---|
| **Tagline** | "The best way to code with AI" — agent-native IDE |
| **Audience** | Professional developers (ICs → enterprise eng orgs) |
| **Pricing** | Hobby free · Pro $20/mo · Pro+/Ultra · Teams $40/user/mo · Enterprise |
| **Latest** | Cursor 3 (April 2026), Composer 2 RL-trained every ~5h on real usage |

## Their Pitch

- Agent-native IDE where the agent is the primary interface
- Composer 2 trained via RL on real user interactions every ~5 hours
- Background Agents — parallel agents in isolated VMs on Git branches
- Design Mode — agents manipulate DOM elements through MCP-mediated browser context
- Bugbot Learned Rules, Canvases, Tiled Layout, voice input
- **Best-in-class MCP client** — drove much of MCP's 200+ server adoption

## Strengths (Be Honest)

1. **Fastest dev time-to-wow for AI-assisted coding** — install, open repo, describe change, watch it happen
2. **RL-on-real-usage moat** — model gets smarter every 5 hours based on what users actually do
3. **MCP marketplace breadth** — 200+ servers available out of the box
4. **Multi-model support** — Claude, GPT, Gemini, custom
5. **Background Agents = parallelism** — multiple agents, multiple branches, same IDE
6. **Brand dominance among IC developers** — viral growth in 2025-26
7. **Fast release cadence** — major features weekly (Apr 8 MCP GA, Apr 13 Tiled, Apr 15 Canvases)

## Weaknesses

1. **IDE-bound** — no headless/API story for non-developer agents
2. **No simulation, 3D, or spatial primitives** — code editor is the scope
3. **Per-user silos** — each user's agents are isolated; no cross-team agent coordination
4. **Model-credit burn** — Pro tier users hit credit limits fast on real work
5. **No authored-content story** — great for code, not for spatial scenes / simulations / non-code domains
6. **Lock-in risk for users** — proprietary IDE; switching cost grows with Cursor-specific rules/agents
7. **Not an open protocol** — they consume MCP but aren't the protocol authors (Anthropic is)

## Our Differentiators (vs Cursor)

| Differentiator | Why it matters | Proof |
|---|---|---|
| **Domain coverage beyond code** | Spatial, simulation, molecular, agent-native content | `packages/core/src/compilers/` 30+ targets |
| **Platform, not IDE** | Absorb + HoloMesh work outside any editor | mcp.holoscript.net, absorb.holoscript.net |
| **Cross-agent coordination** | HoloMesh = multi-agent team infrastructure Cursor lacks | `packages/mesh/`, HoloMesh Teams API |
| **Verifiable artifacts** | Cursor outputs code; HoloScript outputs code + provenance + contracts | CAEL hash chain, W.GOLD.014 |
| **Zero IDE lock-in** | `.holo` files work in any editor including Cursor | — |
| **Built for agent-as-user** | MCP tools as core architecture, not marketplace bolt-on | 215 tools at mcp.holoscript.net |

## Strategic Posture: **Partnership, Not Competition**

Cursor is a distribution channel for HoloScript, not a rival. Actions:

- Ship HoloScript MCP to Cursor's marketplace
- Publish a "HoloScript + Cursor" integration guide
- Author Cursor-specific agent "skills" that use HoloScript MCP tools
- Accept that for "edit a TypeScript file" workflows, Cursor wins — and we benefit

## Objection Handling

| Prospect says... | Respond with... |
|---|---|
| "I already use Cursor — why HoloScript?" | "Cursor is where you write code. HoloScript is what that code compiles. They work together — you write `.holo` in Cursor, and Cursor's Composer uses HoloScript MCP to understand, compile, and deploy it." |
| "Cursor has MCP for everything" | "Cursor is a great MCP *client*. HoloScript is an MCP *server* that gives Cursor spatial, simulation, and provenance capabilities it doesn't have natively." |
| "Cursor agents run in VMs — why do I need HoloMesh?" | "Cursor Background Agents are per-user, per-repo. HoloMesh is cross-team, cross-session — the difference between agents that help *you* code and agents that coordinate *the team*." |
| "Cursor will add simulation eventually" | "They might add a simulation MCP plugin. That plugin will likely be HoloScript. We want to be the default when they do." |
| "I don't want another IDE lock-in" | "HoloScript doesn't lock you in — `.holo` files are plain text, work in any editor including Cursor. We're the IR; Cursor is the editor." |

## Landmines to Set

- **"Do you need to coordinate agents across your team, not just your own IDE?"** → Cursor: no
- **"Do your agents need to understand spatial scenes, simulations, or physical domains?"** → Cursor: no
- **"Do you need verifiable artifacts (PR chains with provenance, replayable builds)?"** → Cursor: no
- **"Do you need to deploy your agent output beyond a Git repo?"** → Cursor: no (they deploy code to Git, not interactive artifacts)

## Landmines to Defuse

- **"HoloScript is a competitor to Cursor"** → "No. HoloScript is a platform Cursor agents can use. They operate at different layers — Cursor is the IDE; HoloScript is the MCP + compile + coordination layer underneath."
- **"Why not just use Cursor + a simulation library?"** → "That's a workable path. If your simulation needs are shallow, it works. If you need verifiable replay, provenance semirings, or multi-target output, you're rebuilding HoloScript."

## Strategic Plays

1. **Ship HoloScript MCP server to Cursor marketplace** within 30 days
2. **Write "HoloScript inside Cursor" guide** — step-by-step: install MCP, use tools, compile `.holo`
3. **Target Cursor users via their own channels** — not "switch from Cursor" but "get more from Cursor"
4. **Build a Cursor-specific HoloScript skill** that demonstrates spatial compilation inside the IDE
5. **Monitor Cursor's "Agent Skills" marketplace** — get listed early; opposing another non-code domain compiler would be bad

## Where We Lose (and That's Fine)

- Pure code-editing workflows — we concede and integrate
- TypeScript/Python/Rust refactoring — we concede
- "Build a small app" time-to-wow — Cursor wins; we don't fight

## Where We Win (And Cursor Can't Follow)

- Multi-domain building (code + spatial + simulation)
- Cross-team agent coordination (HoloMesh)
- Verifiable artifacts (provenance, replay, contracts)
- Academic / regulated / medical / legal verticals
- Non-IDE workflows (agents running in the cloud, mobile, headset)

## Signals to Watch

- **Cursor agent skills marketplace** — track for "spatial", "simulation", "3D" domain plugins
- **Cursor changelog** for MCP server enhancements, new tool types
- **Composer RL training domains** — if they start training on spatial/3D tasks, the gap narrows
- **Cursor + Anthropic partnership depth** — they're cozy; watch for co-branded agent offerings
- **Background Agents feature evolution** — multi-agent coordination would overlap HoloMesh

## Sources

- [Cursor Release Notes April 2026](https://releasebot.io/updates/cursor)
- [Cursor Pricing 2026](https://www.nocode.mba/articles/cursor-pricing)
- [Cursor 3 vs Antigravity](https://www.buildfastwithai.com/blogs/cursor-3-vs-antigravity-ai-ide-2026)
