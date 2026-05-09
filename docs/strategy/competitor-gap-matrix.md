# Competitor Gap Matrix

> Generated: 2026-05-09T00:00:00Z | Next review: 2026-05-21

| ID | Vertical | Competitor | Severity | Direction | Status | Title |
|---|---|---|---|---|---|---|
| CG-032 | Hardware, edge AI, and embedded development | NVIDIA Jetson | 🟠 P1 | differentiator | 👁️ Watch | HoloScript can become the cross-hardware semantic evidence layer competitors do not provide |
| CG-005 | Spatial computing platforms | Apple Vision Pro | 🟡 P2 | catch-up | 🚧 In Progress | VisionOS fidelity gaps in Swift/RealityKit output |
| CG-001 | Neuromorphic computing | Intel Loihi / SpiNNaker / SynSense | 🟠 P1 | differentiator | ✅ Shipped | NIR compiler ships for neuromorphic targets |

## Detailed Gap Descriptions

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

