# Governance Artifact: NodeGraph Execution Sprint (Film3D Grounding)

**Date:** 2026-04-16  
**Owner:** github-copilot  
**Baseline branch:** `main`  
**Shipped anchor:** `1d21451c` (`feat(editor): add executable node graph panel runtime`)

---

## 1) Verified baseline (already shipped)

### Commit verification

```text
=== commit 1d21451c summary ===
1d21451c (HEAD -> main, origin/main, origin/HEAD) feat(editor): add executable node graph panel runtime
packages/core/src/editor/NodeGraphPanel.ts
packages/core/src/editor/__tests__/NodeGraphPanel.prod.test.ts
```

### Test verification (50/50)

```text
=== NodeGraphPanel focused verification (50/50 target) ===
 RUN  v4.1.0 C:/Users/josep/Documents/GitHub/HoloScript

 ✓  @holoscript/core  src/editor/__tests__/NodeGraphPanel.prod.test.ts (39 tests) 32ms
 ✓  @holoscript/core  src/editor/__tests__/NodeGraphPanel.test.ts (11 tests) 13ms

 Test Files  2 passed (2)
      Tests  50 passed (50)
```

---

## 2) Mandatory decision gate (forced choice)

For Film3D pre-viz in the next 7–10 days, we must choose where to spend risk budget:

- **Track A — UI Tangibility:** Surface `executeGraph()` in Studio via visible **Run Graph** control + results/debug panel.
- **Track B — Deeper XR Runtime:** Push hard on on-device verification and trait integration (`occlusion_mesh`, `environment_probe`, `gaze_interactable`) and runtime wiring first.

### Governance ruling (this sprint)

**Authorize Track A first (UI tangibility), with Track B as parallel PoC only.**

Rationale:

1. Lowest integration risk, highest immediate user value for directors.
2. Turns shipped runtime (`executeGraph`) into a visible workflow capability.
3. Creates concrete graph artifacts to validate against Quest 3 path next.

---

## 3) Proposed narrow sprint (7–10 days)

## 3.1 Branch

**Exact branch name (proposal):** `feat/film3d-run-graph-ui-execution-2026-04-16`

> Repo policy currently commits local agent work to `main`; this branch name is still provided as requested governance metadata and for optional review workflows.

## 3.2 Sprint objective

Add a visible **Run Graph** control in Studio/editor UI that calls `NodeGraphPanel.executeGraph()` and surfaces:

- `nodeOrder`
- `outputs`
- mutated `state`
- `emittedEvents`

## 3.3 Full proposed diffs (UI + integration)

### Diff A — New execution bridge (Studio graph → core executable graph)

```diff
+++ packages/studio/src/lib/nodeGraphExecutionBridge.ts
+import { NodeGraph } from '@holoscript/core/src/logic/NodeGraph';
+import { NodeGraphPanel } from '@holoscript/core/src/editor/NodeGraphPanel';
+import type { GraphNode, GraphEdge } from '@/hooks/useNodeGraph';
+
+export interface StudioGraphExecutionResult {
+  nodeOrder: string[];
+  outputs: Record<string, Record<string, unknown>>;
+  state: Record<string, unknown>;
+  emittedEvents: Record<string, unknown[]>;
+}
+
+const NODE_TYPE_MAP: Record<string, string> = {
+  add: 'MathAdd',
+  multiply: 'MathMultiply',
+  clamp: 'Clamp',
+  sine: 'Not', // placeholder until dedicated Sin logic node lands in core logic graph
+};
+
+export function executeStudioNodeGraph(nodes: GraphNode[], edges: GraphEdge[]): StudioGraphExecutionResult {
+  const graph = new NodeGraph('studio-runtime');
+  const idMap = new Map<string, string>();
+
+  for (const n of nodes) {
+    const mappedType = NODE_TYPE_MAP[n.type] ?? 'MathAdd';
+    const coreNode = graph.addNode(mappedType, { x: n.x, y: n.y });
+    idMap.set(n.id, coreNode.id);
+  }
+
+  for (const e of edges) {
+    const fromId = idMap.get(e.fromNodeId);
+    const toId = idMap.get(e.toNodeId);
+    if (!fromId || !toId) continue;
+    graph.connect(fromId, 'result', toId, 'a');
+  }
+
+  const panel = new NodeGraphPanel(graph);
+  const r = panel.executeGraph();
+
+  return {
+    nodeOrder: r.nodeOrder,
+    outputs: Object.fromEntries(r.outputs.entries()),
+    state: r.state,
+    emittedEvents: Object.fromEntries(r.emittedEvents.entries()),
+  };
+}
```

### Diff B — Add Run Graph control + results panel to Studio NodeGraphPanel

```diff
--- packages/studio/src/components/node-graph/NodeGraphPanel.tsx
+++ packages/studio/src/components/node-graph/NodeGraphPanel.tsx
@@
-import { Network, X, Search, Plus, _Trash2, RotateCcw } from 'lucide-react';
+import { Network, X, Search, Plus, _Trash2, RotateCcw, Play, AlertCircle } from 'lucide-react';
+import { executeStudioNodeGraph, type StudioGraphExecutionResult } from '@/lib/nodeGraphExecutionBridge';
@@
 export function NodeGraphPanel({ onClose }: NodeGraphPanelProps) {
@@
   const [showPicker, setShowPicker] = useState(false);
+  const [execResult, setExecResult] = useState<StudioGraphExecutionResult | null>(null);
+  const [execError, setExecError] = useState<string | null>(null);
@@
+  const handleRunGraph = () => {
+    try {
+      setExecError(null);
+      setExecResult(executeStudioNodeGraph(nodes, edges));
+    } catch (err) {
+      setExecResult(null);
+      setExecError(err instanceof Error ? err.message : String(err));
+    }
+  };
@@
           <button
+            onClick={handleRunGraph}
+            className="flex items-center gap-1 rounded-lg border border-studio-accent/40 px-2 py-1 text-[9px] text-studio-accent hover:bg-studio-accent/10"
+            title="Run executable node graph"
+            aria-label="Run executable node graph"
+          >
+            <Play className="h-2.5 w-2.5" /> Run Graph
+          </button>
+          <button
             onClick={() => setShowPicker((v) => !v)}
@@
       {/* Status bar */}
       <div className="shrink-0 border-t border-studio-border px-3 py-1 flex items-center gap-3 text-[8px] text-studio-muted">
@@
       </div>
+
+      {/* Execution results */}
+      {(execResult || execError) && (
+        <div className="shrink-0 border-t border-studio-border bg-studio-surface/60 p-2 text-[9px]">
+          {execError ? (
+            <div className="flex items-center gap-1 text-red-400">
+              <AlertCircle className="h-3 w-3" /> {execError}
+            </div>
+          ) : execResult ? (
+            <div className="space-y-1">
+              <div><strong>nodeOrder:</strong> {execResult.nodeOrder.join(' -> ')}</div>
+              <div><strong>outputs:</strong> <pre>{JSON.stringify(execResult.outputs, null, 2)}</pre></div>
+              <div><strong>state:</strong> <pre>{JSON.stringify(execResult.state, null, 2)}</pre></div>
+              <div><strong>emittedEvents:</strong> <pre>{JSON.stringify(execResult.emittedEvents, null, 2)}</pre></div>
+            </div>
+          ) : null}
+        </div>
+      )}
     </div>
   );
 }
```

### Diff C — Runtime-state-aware integration in create page

```diff
--- packages/studio/src/app/create/page.tsx
+++ packages/studio/src/app/create/page.tsx
@@
-                <NodeGraphPanel onClose={() => setNodeGraphOpen(false)} />
+                <NodeGraphPanel
+                  onClose={() => setNodeGraphOpen(false)}
+                />
```

> Minimal integration for this sprint keeps execution in-panel and uses existing global runtime state in `sceneStore` from prior sprint (`running|paused|stopped`).

---

## 3.4 Proposed new tests

### Focused editor test (mandatory)

```diff
+++ packages/studio/src/components/node-graph/__tests__/NodeGraphPanel.execution.test.tsx
+// @vitest-environment jsdom
+import { describe, it, expect } from 'vitest';
+import { executeStudioNodeGraph } from '@/lib/nodeGraphExecutionBridge';
+
+describe('NodeGraphPanel execution bridge', () => {
+  it('returns nodeOrder, outputs, state, emittedEvents shape', () => {
+    const result = executeStudioNodeGraph([], []);
+    expect(Array.isArray(result.nodeOrder)).toBe(true);
+    expect(result.outputs).toBeTypeOf('object');
+    expect(result.state).toBeTypeOf('object');
+    expect(result.emittedEvents).toBeTypeOf('object');
+  });
+});
```

### Optional E2E smoke (Playwright)

```diff
+++ packages/studio/e2e/node-graph-run.spec.ts
+test('director can run graph and see execution output panel', async ({ page }) => {
+  await page.goto('/create');
+  await page.getByTitle(/Node Graph Editor/i).click();
+  await page.getByRole('button', { name: /Run Graph/i }).click();
+  await expect(page.getByText(/nodeOrder:/i)).toBeVisible();
+  await expect(page.getByText(/outputs:/i)).toBeVisible();
+});
```

---

## 3.5 Success criteria

- **Primary Film3D criterion:** _“Director can build a simple hologram trigger graph, hit Run, and see real mutated state + events without leaving Studio.”_
- Run Graph action produces deterministic visible `nodeOrder` + output payloads.
- Execution errors are surfaced inline (not swallowed).
- Focused tests pass on CI.

---

## 4) Brutally honest Film3D impact

## 4.1 What improved today (already shipped)

With executable node graph runtime + recent CRDT/WebRTC + manifest fixes:

- We can execute graph semantics in-core (not only render graph UI shapes).
- Collaboration plumbing is stronger for shared editing sessions.
- Android XR manifest path is less brittle for AR camera feature declaration.

## 4.2 What directors gain after Run Graph UI lands

- Immediate behavior validation in Studio (no code export/recompile round-trip just to check logic).
- Faster blocking decisions in pre-viz sessions (event graph does/doesn’t trigger).
- Better cross-role communication: TD can show exact outputs/state transitions live.

## 4.3 What still blocks grounded soundstage pre-viz

Still depends on remaining XR trait work + on-device verification:

- **Quest 3 occlusion quality:** `occlusion_mesh` is still skeleton-level until on-device depth path is validated.
- **Environmental lighting grounding:** `environment_probe` still needs realistic probe-to-renderer path verification.
- **Interaction fidelity:** `gaze_interactable` needs hand/gaze behavior validated in hardware context.
- **OpenUSD with physical anchoring:** export must preserve anchor semantics and measured stage alignment.

Bottom line: Run Graph UI improves **authoring throughput** now; it does **not** replace hardware XR verification.

---

## 5) Alternative continuation (in parallel): bridge executeGraph() outputs into uAAL VM / runtime ops

### Minimal PoC diff (runtime-event bridge)

```diff
+++ packages/studio/src/lib/nodeGraphExecutionRuntimeBridge.ts
+import type { StudioGraphExecutionResult } from './nodeGraphExecutionBridge';
+
+export function emitRuntimeOpsFromGraph(result: StudioGraphExecutionResult): void {
+  const events = Object.entries(result.emittedEvents);
+  for (const [name, payloads] of events) {
+    window.dispatchEvent(
+      new CustomEvent('holoscript:runtime-op', {
+        detail: {
+          op: name === 'render_hologram' ? 'OP_RENDER_HOLOGRAM' : 'OP_EMIT_SIGNAL',
+          payload: payloads,
+          state: result.state,
+        },
+      })
+    );
+  }
+}
```

### Integration example

```diff
--- packages/studio/src/components/node-graph/NodeGraphPanel.tsx
+++ packages/studio/src/components/node-graph/NodeGraphPanel.tsx
@@
+import { emitRuntimeOpsFromGraph } from '@/lib/nodeGraphExecutionRuntimeBridge';
@@
 const handleRunGraph = () => {
   const r = executeStudioNodeGraph(nodes, edges);
   setExecResult(r);
+  emitRuntimeOpsFromGraph(r);
 };
```

## Effort / risk comparison

| Path | Effort | Risk | Film3D payoff now |
| --- | ---: | ---: | ---: |
| **UI polish (Run Graph + results panel)** | Low–Medium | Low | High immediate |
| **Runtime bridge to uAAL/R3F ops** | Medium | Medium–High (event ordering, op mapping, CRDT conflicts) | High but less deterministic |

Recommendation: **UI first**, runtime bridge as constrained PoC in same sprint only if tests stay green.

---

## 6) Fresh self-verification on main (literal outputs)

### AndroidXRTraitMap TODO count + lines

```text
=== TODO count: AndroidXRTraitMap.ts ===
Count             : 16

=== TODO lines (first 40) ===
57:| 'partial' // Generates some code with TODOs
2353:`// TODO: process depth frames to reconstruct scene mesh for ${varName}`,
2459:`// TODO: fuse gaze raycast with hand joint positions for ${varName}`,
2470:`// TODO: route to TensorFlow Lite or remote inference endpoint`,
2480:`// TODO: generate texture via TFLite or API, assign to ${varName} Filament material`,
2490:`// TODO: integrate Vulkan compute pipeline or TFLite diffusion model`,
2500:`// TODO: apply TFLite super-resolution model to texture`,
2510:`// TODO: apply mask-based inpainting via TFLite`,
2520:`// TODO: implement BCI signal processing pipeline`,
2530:`// TODO: integrate on-device TFLite model training / NNAPI`,
2540:`// TODO: implement local vector index (e.g. SQLite FTS5 + embeddings)`,
2584:`// TODO: integrate local or remote vector store (e.g. Chroma, Pinecone)`,
2595:`// TODO: configure ML Kit pipeline for ${String(config.task || 'classification')}`,
2620:`// TODO: integrate TFLite pose prediction with GltfModelEntity animation`,
2631:`// TODO: configure ML Kit object detection or custom TFLite model`,
2796:`// TODO: configure voice command recognition for ${varName}`,
```

### uAAL opcode inventory + test-reference count

```text
=== uAAL opcode inventory (enum entries in opcodes.ts) ===
...
141:HALT = 0xff,

=== uAAL opcode references in tests (uaal.test.ts) ===
Count             : 98
...
```

### Focused editor test run (fresh)

```text
=== Focused editor tests ===
 RUN  v4.1.0 C:/Users/josep/Documents/GitHub/HoloScript

 ✓  @holoscript/core  src/editor/__tests__/NodeGraphPanel.prod.test.ts (39 tests) 27ms
 ✓  @holoscript/core  src/editor/__tests__/CopilotPanel.prod.test.ts (28 tests) 32ms

 Test Files  2 passed (2)
      Tests  67 passed (67)
```

---

## 7) Cross-agent review snapshot (full pool + XR priority call)

### Broadcast sent to pool

```text
Cross-agent review requested: choose priority for next 7-10 days -> (A) Run Graph UI in Studio (NodeGraphPanel.executeGraph surfaced) vs (B) accelerate on-device XR trait verification for occlusion_mesh/environment_probe/gaze_interactable. Please include risks: node-graph perf on large spatial graphs and emitted-events vs CRDT batching conflicts.
```

### Observed telemetry (at capture time)

- `review_request` present in team messages (2026-04-16T18:53:53.771Z).
- `replies_after_request`: **null** (no explicit follow-up replies yet in sampled window).
- Board snapshot in compact query showed no open tasks/suggestions in that sample.

### Consensus (current, provisional)

Given no explicit post-request replies yet, consensus is inferred from current Film3D risk posture and recent shipped sequence:

1. **Run Graph UI next** for immediate director-facing value and lower implementation risk.
2. Keep XR on-device verification active but scoped as downstream acceptance gate.
3. Do not conflate graph-runtime iteration speed with hardware-grounded XR readiness.

### Explicit risks to track

- **Large spatial graph performance:** `executeGraph` per-click is fine; per-frame auto-run could degrade quickly without caching/incremental recompute.
- **Event emission vs CRDT batching:** runtime event bursts can conflict with batched collaborative updates unless event channels are isolated and ordered.

---

## 8) Governance close

Approved next narrow sprint: **Run Graph UI control + debug/results panel** (7–10 days), with strict verification gates and a bounded runtime-bridge PoC only if test health remains green.
