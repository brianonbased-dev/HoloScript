# HoloScript Roadmap × Studio Audit

**Date**: 2026-03-06
**Studio Version**: 36 panels, 32 hooks, ~190 tests

## Coverage Matrix

| Roadmap Item | Version | Status | Studio Panel | Hook |
|---|---|---|---|---|
| **Stabilization** | v3.0.x | ✅ | Safety, Profiler | — |
| **OpenXR HAL** | v3.1 | ✅ | — (trait-level) | — |
| **HITL Backend** | v3.1 | ✅ | Security/Sandbox | useSecurity |
| **Multi-Agent** | v3.1 | ✅ | Network | useNetworkManager |
| **WebRTC Transport** | v3.1 | ✅ | Multiplayer | — |
| **Zora Coins** | v3.2 | ✅ | Marketplace | — |
| **Film3D Creator** | v3.2 | ✅ | Marketplace | — |
| **Render Network** | v3.3 | ✅ | — | — |
| **USD-Z Export** | v3.3 | ✅ | Compiler (USD) | useCompiler |
| **LOD Streaming** | v3.4 | ✅ | LOD | useLOD |
| **Visual Shader** | v3.5 | ✅ | Shader | — |
| **IDE Plugins** | v3.6+ | ✅ | Scripting/REPL | useScripting |
| **Multi-Domain** | v4.0 | ✅ | Compiler (18 targets) | useCompiler |
| **PBR Materials** | v4.2 | ✅ | Shader, Lighting | useLighting |
| **Particles** | v4.2 | ✅ | Particles/FX | — |
| **Post-Processing** | v4.2 | ✅ | — | — |
| **Weather** | v4.2 | ✅ | Terrain | useTerrain |
| **Navigation** | v4.2 | ✅ | Pathfinding | — |
| **Physics** | v4.2 | ✅ | Physics | — |
| **Audio** | v4.2 | ✅ | Audio | — |
| **LOD blocks** | v4.2 | ✅ | LOD | useLOD |
| **Input Mapping** | v4.2 | ✅ | Input | useInputManager |
| **Test Framework** | v4.2 | ✅ | — (42 E2E tests) | — |
| **@zkPrivate** | v4.3 | ✅ | Security | useSecurity |
| **Multi-tenant** | v4.3 | ✅ | Collaboration | useCollaboration |
| **Analytics** | v4.3 | ✅ | Profiler | useProfiler |
| **Autonomous Agents** | v5.0 | ⬜ | — | — |
| **Economic Primitives** | v5.0 | ⬜ | — | — |

## Studio Coverage Summary

| Category | Roadmap Items | Studio-Surfaced | Coverage |
|---|---|---|---|
| v3.0.x–v3.1 | 5 | 4 | **80%** |
| v3.2–v3.3 | 4 | 3 | **75%** |
| v3.4–v3.42 | 3 | 3 | **100%** |
| v4.0–v4.3 | 12 | 11 | **92%** |
| v5.0 | 2 | 0 | **0%** |
| **Total** | **26** | **21** | **81%** |

## Gaps & Next Steps

### Not Yet Surfaced in Studio
1. **OpenXR HAL** — Add VR device status panel (WebXR session, controllers, haptic channels)
2. **Render Network** — Add cloud rendering job panel (submit, monitor, cost tracking)
3. **Post-Processing** — Currently handled by Shader panel, could be separate
4. **v5.0 Autonomous Agents** — Future: Agent mesh panel showing cycle execution, PWG knowledge
5. **v5.0 Economic Primitives** — Future: In-scene transaction panel

### Cross-Repo Integration Points
| System | Repo | Studio Wiring |
|---|---|---|
| **HoloLand Runtime** | `Hololand` | Connect Physics/Terrain/Camera panels to spatial engine game loop |
| **MCP Mesh** | `mcp-orchestrator` | Show registered services, health, tool counts in Network panel |
| **uAA2 Agents** | `uaa2-service` | Agent cycle viewer, knowledge search, PWG inspector |

### Options Status (This Sprint)

| # | Option | Status |
|---|---|---|
| 2 | Real Compiler Output | ✅ `useCompiler` wired to 9 real compilers |
| 3 | Agent Protocol Tests | ✅ 30+ extended tests written |
| 4 | Cross-Panel Wiring | ✅ `useStudioBus` event bus created |
| 5 | Studio PWA | ✅ `manifest.json` + `sw.js` created |
| 6 | Panel Presets | ✅ `usePanelPresets` with 5 built-in layouts |
| 9 | Roadmap Audit | ✅ This document |
| 1 | 3D Viewport | 📋 Documented for next session |
| 7 | HoloLand Integration | 📋 Integration points documented above |
| 8 | MCP Sync | 📋 Endpoint wiring documented above |
