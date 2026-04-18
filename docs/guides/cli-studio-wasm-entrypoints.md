# CLI, Studio, and WASM entry points

## Sovereign vs bridge (D.006)

- **Sovereign** paths compile through **`@holoscript/core`** compilers (subclasses of `CompilerBase`, export pipeline).
- **Bridge** paths generate glue or host-specific stubs without going through the full compiler graph.

## Current pattern

- **Studio / MCP** typically call **`ExportManager`** and MCP `compile_holoscript` / HTTP `/api/compile` (same handler path).
- **CLI** may contain **target-specific generators** (e.g. VRChat) for bootstrap or historical reasons.

## When to unify

If a CLI helper duplicates logic that already exists as a **`XYZCompiler`** in core, prefer **calling the compiler** from the CLI so behavior, RBAC, and provenance stay aligned. If the CLI must stay a thin scaffold for speed, document it explicitly as **bridge** with a pointer to the sovereign compiler type.

## See also

- `docs/architecture/core-engine-cycle.md` — package layering.
- MCP compile path: `packages/mcp-server/src/compiler-tools.ts` (`handleCompilerTool('compile_holoscript', …)`).
