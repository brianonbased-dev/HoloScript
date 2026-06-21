# Competitive Scan - 2026-06-21

## Red / Amber alerts

- Amber: Unreal Engine 5.8 is now official, is described by Epic as the final planned UE5 major release, and includes an Experimental MCP plugin that exposes engine context such as Blueprints, assets, levels, materials, and meshes to LLM systems. HoloScript's Unreal comparison row now treats MCP-assisted Unreal workflows as a direct agent-native threat.
- Amber: World Labs now has a dedicated official World API announcement for explorable 3D world generation from text, images, panoramas, multi-view inputs, and video, with web rendering plus export/integration language for interactive systems and simulation.
- Yellow: Vercel AI SDK official docs now include MCP tool transport guidance, strengthening Vercel's position as a lightweight agent-app orchestration layer.
- Yellow: Cursor's official pricing and security-hiring surfaces now package MCPs, skills, hooks, cloud agents, and enterprise safety controls as a commercial AI IDE surface.
- Red alerts: none this week.

## Tier 1 signals

- Unreal Engine: updated HoloScript and ai-ecosystem matrix evidence for UE 5.8, advanced worldbuilding/PCG, integrated LLM workflows, and the Experimental MCP plugin.
- Unity: official Unity 6.4 docs were rechecked and the canonical matrix source stamp was refreshed; no new HoloScript row beyond the review window refresh.
- NVIDIA: Omniverse and Isaac Sim official pages still center physical AI simulation, agentic workflows, and industrial digitalization; source claims were tightened but no new gap row was required.
- OpenAI Agents SDK, LangGraph, Pydantic AI, CrewAI, AutoGen, AWS Bedrock AgentCore, Google ADK, and Microsoft Foundry Agent Service were rechecked against official docs. The main factual correction was Microsoft Foundry: current docs center Prompt agents and Hosted agents preview, not the older stable three-agent framing.
- GitHub Copilot Cloud Agent official docs still describe autonomous branch and PR work in a GitHub Actions environment; no new row was needed.

## Tier 2 signals

- HoloLand / VR social set: VRChat 2026.2.1 Avatar Accessories, Rec Room's June 1, 2026 shutdown, and Spatial's creator-platform sunset were rechecked against official sources. The HoloLand matrix already reflected the material posture, so no HoloLand JSON row changed.
- Pricing / jobs / marketplace: Cursor pricing and security hiring escalated into the Cursor AI IDE row. LangSmith and SimScale pricing were checked and did not require matrix changes in this pass.

## Matrix updates

- Updated `C:/Users/josep/.ai-ecosystem/docs/strategy/competitor-gap-matrix.json` and generated shards for official Unreal 5.8, World Labs World API, Vercel MCP, Cursor pricing/security, Google ADK, NVIDIA, OpenAI Agents SDK, LangGraph, Pydantic AI, AWS Bedrock AgentCore, Microsoft Foundry, Isaac Sim, Azure Digital Twins, and Simulink source signals.
- Rolled stale P1/P2 canonical gap review windows in `C:/Users/josep/.ai-ecosystem/docs/strategy/competitor-gap-matrix.json` to `nextReviewBy: 2026-06-29` after review.
- Updated `C:/Users/josep/.ai-ecosystem/config/competitors.json` to match the canonical 2026-06-21 matrix refresh.
- Updated `C:/Users/josep/Documents/GitHub/HoloScript/docs/strategy/competitor-gap-matrix.json` and rendered markdown for the official Unreal 5.8 MCP signal in HoloScript's published competitor matrix.
- No HoloLand JSON row changed; `C:/Users/josep/.ai-ecosystem/docs/strategy/hololand-competitor-gap-matrix.json` was checked only.

## Validation

- `pnpm run render:competitor-gap-matrix` in `C:/Users/josep/.ai-ecosystem` -> passed
- `pnpm run check:hololand-matrix` in `C:/Users/josep/.ai-ecosystem` -> passed
- `pnpm run render:competitor-gap-matrix` in `C:/Users/josep/Documents/GitHub/HoloScript` -> passed
- `git diff --check` in `C:/Users/josep/.ai-ecosystem` -> passed
- `git diff --check` in `C:/Users/josep/Documents/GitHub/HoloScript` -> passed

## Action items

- No new board follow-ups filed. Existing HoloScript competitor rows now carry the Unreal MCP response and Cursor IDE packaging signals.
- Next weekly scan should recheck Unreal MCP plugin adoption, Cursor enterprise controls, World Labs World API exports, and HoloLand post-sunset activity for Rec Room and Spatial.
