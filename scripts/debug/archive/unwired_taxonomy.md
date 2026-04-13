# Taxonomy of HoloScript Code Unwiring ("Ghost Code")

Following a systemic audit of the HoloScript mono-repo across the IDE workspace and backend services, I have classified the discrepancies between what is "Built" (exists, typed, tested) and what is "Wired" (actually loaded, registered, or active in the user/server loop). 

## 1. The Taxonomy of "Built vs Wired"

### A. The "Disconnected Plugs" (Imported but Uncalled)
Code that the compiler sees as connected, but never actually executes at runtime because the invocation was lost during a refactoring.
*   **Wired:** `authRoutes`, `engineRoutes` in `mcp-orchestrator/src/orchestrator.ts`.
*   **Built but Not Wired:** `knowledgeRoutes` (`mcp-orchestrator/src/routes/knowledgeRoutes.ts`). It is explicitly imported into `orchestrator.ts` via `import { registerKnowledgeRoutes }`, but the function is **never invoked** within the `orchestrator.ts` constructor or bootstrap methods. Thus, the entire `/knowledge` API is completely stranded.

### B. The "Phantom Ecosystems" (Unregistered Plugins/Traits)
Major subsystems that contain hundreds of lines of logic, handlers, and types, but their entry point is never given to the central registry.
*   **Wired:** Core interaction traits (`GrabbableTrait`, `PressableTrait`) are wired into the studio scene graphs.
*   **Built but Not Wired:** The entire `film-vfx-plugin` layer (including `TextToUniverseTrait`, `ShotListTrait`, etc.). The plugin is built and exported in `packages/plugins/film-vfx-plugin/src/index.ts`, but a search across `packages/studio` and `packages/core` reveals it is **never added** to the `PluginRegistry` or `SceneGraphStore`. It remains inaccessible to end-users.

### C. The "Hollow Tests" (Tests Without Implementations)
Test artifacts that define expected behavior for modules that either never got built, or were accidentally deleted/stashed.
*   **Wired:** `a2a.test.ts` matching `a2a-tools.ts`.
*   **Built but Not Wired:** `deploy-status-tools.test.ts` (`packages/mcp-server/src/__tests__`). The test file exists and expects `deploy-status-tools` MCP endpoints, but traversing `packages/mcp-server/src` reveals **no matching implementation** (`deploy-status-tools.ts` is missing). 

### D. The "Island Data Structures" (Unused Architectural Hooks)
Complex logic systems constructed to bridge two systems, which sit completely isolated.
*   **Wired:** `LoroWebSocketProvider` is hooked into `useSpatialSync`.
*   **Built but Not Wired:** `MeshNodeIntegrator` (`packages/crdt-spatial/src`). It handles CRDT to R3F synchronization but it is completely unreferenced by the rest of the workspace and never passed into a context or provider.

## Summary 
The missing wiring falls into four actionable technical debt categories:
1.  **API Stranding** (e.g., `knowledgeRoutes`)
2.  **Missing Registry Bindings** (e.g., `film-vfx-plugin` traits)
3.  **Missing Test Targets** (e.g., `deploy-status-tools`)
4.  **Isolated Bridges** (e.g., `MeshNodeIntegrator`)
