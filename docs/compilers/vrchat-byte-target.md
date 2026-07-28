# VRChat Byte Target

Founder direction recorded on 2026-05-24 (D.064): the long-term VRChat compiler target is
Byte/Udon output, not UdonSharp C# source.

> **Naming note.** "Byte" is our internal name for the **Udon bytecode** target — there is no
> VRChat product called "Byte". The emitted artifact is **Udon Assembly (`.uasm`)**, which the
> VRChat SDK assembles into a runnable Udon program inside Unity. See
> `research/2026-06-22_holoscript-to-byte-vrchat-roadmap.md` for the full roadmap.

## Artifact Contract (SELECTED 2026-06-22)

The pending contract is resolved (roadmap Phase 0):

- **Canonical output = Udon Assembly text (`.uasm`)**, one per UdonBehaviour, surfaced on
  `VRChatCompileResult.udonAssembly` as a plain `Record<filename, uasm>` (serializable across
  the MCP seam; feeds the byte-diff `compileToFiles` contract).
- **Bundle wrapper** (scene graph + UdonBehaviour prefab graph + program-asset refs + SDK
  manifest) is the Phase-3 deliverable that makes the `.uasm` set uploadable with one Unity step.
- **`udon-bytecode`** remains gated: it is the Unity-side _serialized derivative_ of `.uasm`
  (Unity-version-coupled, opaque), produced inside the Phase-3 Unity CI from the `.uasm`, not an
  offline compiler artifact.

Rationale: `.uasm` is the true bytecode-adjacent artifact the Udon assembler consumes, drops the
UdonSharp third-party dependency, and is **offline-verifiable** — `validateUdonAssembly()` checks
section structure, the opcode set, symbol/label resolution, and that every `EXTERN` resolves
against the Udon node manifest. Gate-enforced, not asserted.

## Current State

`VRChatCompiler` now emits two formats:

```ts
// Legacy UdonSharp C# (default)
new VRChatCompiler({ outputFormat: 'udonsharp-csharp', useUdonSharp: true });

// Byte target — Udon Assembly (.uasm)
new VRChatCompiler({ outputFormat: 'udon-assembly' }); // result.udonAssembly: Record<file, uasm>
```

**Phase-2 vertical slice shipped (2026-06-22):** `@clickable`/`@pointable` objects lower to an
`_interact` toggle behaviour using only real, manifest-resolvable Udon nodes
(`get_activeSelf` + `SetActive`) plus control flow — no invented negation node. Every world emits
a trivial exported `_start`. Other traits (grabbable/networked/portal/mirror) are **not yet**
lowered to UASM; they intentionally produce no behaviour in assembly mode rather than a
silently-fake one.

`outputFormat: 'udon-bytecode'` and `useUdonSharp: false`-with-bytecode still fail fast so agents
cannot claim a runnable Byte artifact that does not exist.

## Offline ground truth (Phase 1)

- `packages/core/src/compiler/udon/udon-extern-manifest.ts` — the opcode set, the
  `UDON_RETURN_ADDRESS` sentinel, and a **seed** EXTERN manifest (`complete: false`). The full
  manifest — a snapshot of VRChat's complete Udon node registry keyed by SDK version — is the
  remaining Phase-1 deliverable.
- `packages/core/src/compiler/udon/udon-assembly.ts` — the program model, `renderUdonAssembly()`,
  and `validateUdonAssembly()`.

## Remaining (per roadmap)

- Phase 1: snapshot the full Udon node registry into a versioned manifest; CI drift gate.
- Phase 2 breadth: lower grabbable/networked/portal/mirror, zones, timelines to UASM.
- Phase 3: bundle wrapper + headless Unity-batch CI round-trip (assemble `.uasm`, build, upload).
- Phase 4: move VRChat trait mapping into `.hsplus` (D.104).

## Non-Goals

- Do not patch bounded gaps in the UdonSharp C# path as a substitute for the Byte target.
- Do not claim a `.uasm` is a runnable world — VRChat publish is a closed Unity loop (BRIDGE).
- Do not add an EXTERN signature to the manifest unless it exists in VRChat's node registry;
  validation is only as trustworthy as the manifest.
