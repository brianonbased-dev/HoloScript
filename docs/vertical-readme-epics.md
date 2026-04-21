# Vertical README epics (optional backlog)

**Source:** gap analysis (2026-04) · **Board:** task `task_1776384389518_ui1q` — when a vertical is prioritized, open **one child task per row** (epic) and close it with README + smoke links.

This file does **not** duplicate `docs/NUMBERS.md` or `README.md` **Honest gaps** (product domains). It tracks **package / surface README depth** so contributors know where narrative and “how to run” coverage is thin.

| Vertical / surface | Primary location | README depth (snapshot) | Epic when prioritized |
| ------------------ | ---------------- | ------------------------ | ----------------------- |
| Core language & parser | `packages/core` | Strong — start here for traits/compiler | Tighten “first contribution” and bench links |
| Engine runtime | `packages/engine` | Strong — sub-READMEs in subpackages | Per-subsystem how-to (physics, runtime) as needed |
| Studio IDE | `packages/studio` | Moderate + moving fast | E2E screenshots + panel map |
| HoloMap / mesh | `packages/mesh` | Varies | Single “data flow” diagram epic |
| Framework (agents, skills) | `packages/framework` | Moderate | Agent lifecycle one-pager |
| MCP server | `packages/mcp-server` | Strong for tool users | Changelog + tool schema link discipline |
| Comparative benchmarks | `packages/comparative-benchmarks` | Paper hooks documented | Add CI badge + runbook |
| CLI | `packages/cli` | Check on ship | install + non-interactive examples |
| R3F renderer | `packages/r3f-renderer` | Varies | Cross-link Studio + engine |
| SNN / WebGPU | `packages/snn-webgpu` | Research-heavy | “When to use” vs core traits |
| Connectors (GitHub, Railway, …) | `packages/connector-*` | Per-connector | One epic per connector family |
| HoloLand / VR app | separate HoloLand repo | TBD | World + deployment story (track there) |

**How to use**

1. Pick a row when planning a release or onboarding push.
2. Add a **board** task: “docs: README epic for &lt;vertical&gt;” with acceptance: README sections (overview, install, run, test, key exports) + link from root or `AGENTS.md` if applicable.
3. Update **Depth** in this table in the same PR so the next audit does not re-file the same gap.

**Related**

- [`README.md`](../README.md) — product gaps (“Honest gaps” table)
- [`NUMBERS.md`](./NUMBERS.md) — SSOT commands for counts
- [`AGENTS.md`](../AGENTS.md) — agent and team coordination
