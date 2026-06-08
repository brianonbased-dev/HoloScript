# Competitive Scan - 2026-05-25

## Red / Amber alerts

- Amber: 8th Wall's product posture changed materially. Official docs now say the hosted platform retired on February 28, 2026, existing published experiences remain live through February 28, 2027, and the current surface is free/open Studio plus distributed engine tooling.
- Amber: The old `neos.com` / `Neos VR` source is no longer the right live product surface for HoloLand tracking. The active official surface is `resonite.com`, and the matrix now tracks the competitor as Resonite while keeping the existing `neos-vr` slug for continuity.
- Red alerts: none this week.

## Tier 1 signals

- Babylon / Three.js: no material official-source change captured in this pass; HoloScript matrix render completed cleanly.
- NVIDIA: OpenUSD, Omniverse, Isaac Sim, and Jetson official positioning remains consistent with the current matrix framing. No row-fact change beyond review-date refresh.
- LangGraph: official docs still center durable execution, deployment, observability, and long-running stateful agents. No row-fact change.
- OpenAI Agents SDK: official docs still center the lightweight primitive set, guardrails, tracing, and the broader MCP/session/realtime surfaces. No row-fact change.
- AutoGen: official docs still center AgentChat, Core, Extensions, and Studio. No row-fact change.
- Cursor: official surfaces still center the coding-agent/editor workflow. No row-fact change.
- Replit Agent: official docs still center describe -> build -> iterate/deploy with plan mode and multi-artifact output. No row-fact change.

## Tier 2 signals

- HoloLand / VR social set: VRChat, Horizon Worlds, Roblox, Spatial, Rec Room, and Decentraland official positioning remained directionally consistent. The only material product-surface change was the Neos -> Resonite reality update.
- Pricing / jobs / marketplace: not escalated into matrix changes this run.

## Matrix updates

- Updated `C:/Users/josep/.ai-ecosystem/docs/strategy/competitor-gap-matrix.json` for the 8th Wall posture change, refreshed official-source access dates, and rolled reviewed P1/P2 rows forward.
- Updated `C:/Users/josep/.ai-ecosystem/docs/strategy/hololand-competitor-gap-matrix.json` for the Resonite source-of-truth change, refreshed official-source access dates, and rolled reviewed HoloLand rows forward.
- Updated `C:/Users/josep/.ai-ecosystem/config/competitors.json` to match the canonical matrix refresh date.
- No source-fact change required in `C:/Users/josep/Documents/GitHub/HoloScript/docs/strategy/competitor-gap-matrix.json`; render was run and passed.

## Validation

- `pnpm run render:competitor-gap-matrix` in `C:/Users/josep/.ai-ecosystem` -> passed
- `pnpm run render:hololand-matrix` in `C:/Users/josep/.ai-ecosystem` -> passed
- `pnpm run render:competitor-gap-matrix` in `C:/Users/josep/Documents/GitHub/HoloScript` -> passed

## Action items

- No new board follow-ups filed in this pass.
- Next weekly scan should re-check 8th Wall's post-hosted migration surface and Resonite product momentum, then continue the broader pricing/jobs sweep.
