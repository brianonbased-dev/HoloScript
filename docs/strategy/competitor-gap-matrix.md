# Competitor Gap Matrix

> Generated: 2026-05-09T00:00:00Z | Next review: 2026-05-21

| ID | Vertical | Competitor | Severity | Direction | Status | Title |
|---|---|---|---|---|---|---|
| CG-036 | Game / 3D platform ecosystems | Unity | 🔴 P1 | catch-up | 🚧 In Progress | Unity editor, asset store, learning, profiling, collaboration, and LiveOps ecosystem maturity |
| CG-035 | AI runtime architecture | Unity / Unreal / PyTorch / JAX | 🟠 P1 | differentiator | 🚧 In Progress | NN-primary runtime with CPU-verifier backup — inverted stack ownership |
| CG-032 | Hardware, edge AI, and embedded development | NVIDIA Jetson | 🟠 P1 | differentiator | 👁️ Watch | HoloScript can become the cross-hardware semantic evidence layer competitors do not provide |
| CG-005 | Spatial computing platforms | Apple Vision Pro | 🟡 P2 | catch-up | 🚧 In Progress | VisionOS fidelity gaps in Swift/RealityKit output |
| CG-001 | Neuromorphic computing | Intel Loihi / SpiNNaker / SynSense | 🟠 P1 | differentiator | ✅ Shipped | NIR compiler ships for neuromorphic targets |

## Detailed Gap Descriptions

### CG-036 — Unity editor, asset store, learning, profiling, collaboration, and LiveOps ecosystem maturity

- **Vertical:** Game / 3D platform ecosystems
- **Competitor:** Unity
- **Severity:** P1
- **Direction:** catch-up
- **Status:** in-progress
- **Board Task:** task_1778222134389_0uxt

**Competitor Advantage:**
Unity has 20+ years of editor maturity, 70K Asset Store assets, Unity Learn certifications, integrated Profiler + Frame Debugger, Plastic SCM collaboration, and a full LiveOps SaaS stack (Analytics, Remote Config, Cloud Build, Multiplay). This ecosystem lock-in is the primary reason teams choose Unity even when the runtime is not optimal for their use case.

**HoloScript State:**
- **Editor:** Studio is beta; lacks Scene/Game/Inspector/Hierarchy/Project window parity; no terrain editor, animation window, or visual scripting node graph.
- **Asset Store:** No marketplace at scale. `packages/marketplace-api` and `packages/marketplace-web` exist but have minimal content and no network effect.
- **Learning:** Docs + `packages/video-tutorials` exist, but no structured certification, no university partnerships, no YouTube/tutorial ecosystem at scale.
- **Profiler:** `packages/benchmark` and `packages/comparative-benchmarks` provide synthetic benchmarks but no real-time in-editor CPU/GPU/memory/audio/network profiler.
- **Collaboration:** `packages/crdt` provides real-time multi-user editing, but no Plastic/Git LFS large-asset workflow, no cloud project sharing, no branch/merge for scenes.
- **LiveOps:** No Analytics, Remote Config, Cloud Build, Multiplay, or User Reporting equivalents.

**Needed Response:**
1. **Editor:** Prioritize Studio polish — terrain editor, animation timeline, visual scripting graph, shader graph equivalent. Target 12-18 months to close the "beta → viable" gap.
2. **Asset Store:** Seed marketplace with 500 high-quality simulation assets for verticals Unity ignores (medical, legal, climate, molecular). Don't compete with 70K game assets.
3. **Learning:** Launch HoloScript Academy with structured courses, certifications, and sample projects. Partner with 3 universities in year 1.
4. **Profiler:** Build real-time profiler into Studio (CPU, GPU, memory, network). Leverage `packages/benchmark` as the engine; add live data collection.
5. **Collaboration:** Extend CRDT collab with branch/merge for scenes, Git LFS integration, and cloud project hosting.
6. **LiveOps:** This is a 36+ month gap. Don't build it yet. Instead, document integration paths to existing LiveOps providers (PlayFab, GameAnalytics, AWS GameLift) so teams can bridge the gap without waiting for us.

**Evidence:**
- Unity battlecard: `docs/strategy/battlecards/unity.md`
- Studio reference: `docs/guides/studio-reference.md`
- Benchmark suite: `packages/benchmark/`
- CRDT collab: `packages/crdt/`
- Marketplace API: `packages/marketplace-api/`

**Sources:**
- `docs/strategy/battlecards/unity.md`
- `docs/guides/studio-reference.md`
- `packages/benchmark/`
- `packages/crdt/`
- `packages/marketplace-api/`
- `packages/video-tutorials/`

### CG-035 — NN-primary runtime with CPU-verifier backup — inverted stack ownership

- **Vertical:** AI runtime architecture
- **Competitor:** Unity, Unreal, PlayCanvas, Babylon.js (CPU-primary engines); PyTorch, JAX, MLX (NN frameworks without semantic source)
- **Severity:** P1
- **Direction:** differentiator
- **Status:** in-progress
- **Board Task:** task_1778320033509_xvkn

**Competitor Advantage:**
Game engines are CPU-primary stacks that bolt on AI as an add-on (Unity ML-Agents, Unreal Engine ML). NN frameworks are compute substrates with no semantic source language — the program lives in Python scripts and notebook cells, not in a portable, versioned, attestable composition format.

**HoloScript State:**
HoloScript inverts the stack: NN (spiking neural network on WebGPU/neuromorphic, plus LLM speculation) is the primary runtime; CPU AST/typecheck/CURE verification is the backup/referee. Tier 1: SNN hot path for spatial/perceptual/animation traits (sub-ms latency, single-digit mW on neuromorphic hardware). Tier 2: LLM speculative warm path for semantic/agentic/compositional traits (CPU verifies via SimulationContract). Tier 3: CPU cold path for safety-critical, low-confidence-NN, audit, or replay scenarios.

**Needed Response:**
Ship a three-tier `DispatchPolicy` in core that routes per-trait by (trait class × confidence × safety-criticality). Benchmark acceptance rate (α) the way speculative decoding literature does. Emit SimulationContract evidence packs on every dispatch. Add ZKML inference receipts on audit/replay paths. Publish energy-budget metadata so Tier 1 defaults to SNN, not LLM.

**Evidence:**
- `packages/snn-webgpu/` ships LIF simulator, prophetic-gi orchestrator, tropical activation, and paper-grade `LIFDeterminismProbe`.
- `packages/core/src/compiler/AgentInferenceExportTarget.ts` + `LLMProviderCapabilitiesCompiler.ts` + `ContextCompiler.ts` + `EffectInference.ts` give the compiler-side pieces.
- NIR export target is registered for neuromorphic compile targets.
- 2026 speculative-decoding literature (ICML Intel/Weizmann, Dovetail EMNLP) gives prior art and 2–3× speedup metrics for the verifier pattern.
- SpiNNaker digital event-driven SNN reproducibility ≤1% conversion loss; Yao et al. 2026 formal verification toolchain for probabilistic SNNs.
- ZKML survey 2026: DeepSeek-V3-scale proofs with constant proof size and constant verification time.

**Sources:**
- `packages/snn-webgpu/src/paper/LIFDeterminismProbe.ts`
- `packages/core/src/compiler/AgentInferenceExportTarget.ts`
- `packages/core/src/compiler/LLMProviderCapabilitiesCompiler.ts`
- `packages/core/src/compiler/ContextCompiler.ts`
- `packages/core/src/compiler/safety/EffectInference.ts`
- `packages/core/src/compiler/NIRCompiler.ts`
- `docs/strategy/simulation-contract-evidence-pack-template.md`
- `research/2026-05-09_nn-primary-cpu-backup-holoscript.md`

### CG-032 — HoloScript can become the cross-hardware semantic evidence layer competitors do not provide

- **Vertical:** Hardware, edge AI, and embedded development
- **Competitor:** NVIDIA Jetson
- **Severity:** P1
- **Direction:** differentiator
- **Status:** watch
- **Board Task:** task_1778222134390_8ixd

**Competitor Advantage:**
Hardware vendors optimize their own modules, devices, runtimes, and deployment funnels.

**HoloScript State:**
HoloScript can describe intent once across robotics, IoT, twins, spatial apps, agents, and service targets, then attach provenance and validation evidence across vendor-specific hardware lanes.

**Needed Response:**
Protect the differentiator by making hardware receipts portable: target, device, runtime, compiler version, constraints, measured results, replay inputs, provenance, and owner must be recorded consistently.

**Evidence:**
- Jetson and Qualcomm sources show strong vendor-specific edge AI lanes.
- HoloScript export target and definition sources show broader cross-domain semantic ambition.

**Sources:**
- https://developer.nvidia.com/embedded-computing
- https://workbench.aihub.qualcomm.com/docs/

### CG-005 — VisionOS fidelity gaps in Swift/RealityKit output

- **Vertical:** Spatial computing platforms
- **Competitor:** Apple Vision Pro
- **Severity:** P2
- **Direction:** catch-up
- **Status:** in-progress

**Competitor Advantage:**
Native SwiftUI + RealityKit + Reality Composer Pro integration with full platform feature surface.

**HoloScript State:**
VisionOSCompiler emits basic struct + RealityView + Entity tree. Many traits map to comments or stubs.

**Needed Response:**
Close fidelity gaps: environment.style, hand/eye tracking, window volumetrics, webview/AVPlayer, ornament attach_to, toolbar, portal transitions, palm_menu, visible_when, inline animations, gesture recognisers, SharePlay, audio head_tracking, .usdz geometry loading.

**Evidence:**
- VisionOSCompiler.smoke.test.ts records 14+ named fidelity gaps.

**Sources:**
- packages/core/src/compiler/__tests__/VisionOSCompiler.smoke.test.ts

### CG-001 — NIR compiler ships for neuromorphic targets

- **Vertical:** Neuromorphic computing
- **Competitor:** Intel Loihi / SpiNNaker / SynSense
- **Severity:** P1
- **Direction:** differentiator
- **Status:** shipped

**Competitor Advantage:**
Each neuromorphic platform has its own SDK, toolchain, and verification workflow.

**HoloScript State:**
NIRCompiler + NIRToWGSLCompiler provide a unified neuromorphic intermediate representation that targets Intel Loihi 2, SpiNNaker 2, and SynSense.

**Needed Response:**
Maintain parity as NIR spec evolves. Add receipt types for each neuromorphic runtime.

**Evidence:**
- NIRCompiler.ts exists and compiles .holo to NIR.
- QualcommNIRModelExportReceipt provides on-device metrics for Snapdragon NIR deployments.

**Sources:**
- packages/core/src/compiler/NIRCompiler.ts
- packages/core/src/compiler/NIRToWGSLCompiler.ts
- packages/framework/src/board/hololand-receipts.ts

