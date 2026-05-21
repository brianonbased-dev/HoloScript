# Isaac Lab Narrow Sim-to-Real Feed — Delivered (P1)

**Task**: `task_1779180755794_1iil` — Narrow sim-to-real transfer specifically (Door 8 from 2026-03-09 impossible-doors + 2026-05-12 interop memo)

**Scope (as claimed)**: "feed" direction only — produce a minimal, auditable consumable bundle (USD + physics metadata + domain randomization + actuator config + task stub) + `SimToRealFeedReceipt` with source hash + semantic match proof. Policy training & real-robot eval remain downstream.

**Delivered**:
- Public entrypoint: `generateIsaacLabFeed(ast: CompositionNode, opts?: { isaacLabVersion?: string }): IsaacLabFeedBundle`
- Bundle shape:
  ```ts
  interface IsaacLabFeedBundle {
    usd: string;                    // Full USD with PhysicsDriveAPI, PhysxJointAxisAPI, domain rand comments
    taskConfig: Record<string, unknown>;  // Minimal env stub (4096 envs, joint_pos/vel/imu obs, joint_torques actions, randomization, actuator_groups)
    randomization: DomainRandomizationConfig | undefined;
    actuators: ActuatorGroupConfig[];
    receipt: IsaacLabFeedReceipt;
  }
  ```
- Receipt:
  ```ts
  interface IsaacLabFeedReceipt {
    sourceHoloHash: string;
    usdHash: string;
    configHash: string;
    generatedAt: string;
    isaacLabVersion: string;
    readyForTraining: boolean;
    notes: string;  // "Narrow feed bundle — assets + randomization + actuator config. Policy training & real-robot eval are downstream."
  }
  ```
- Re-uses the already-shipped `USDCodeGen` (emits PhysicsDriveAPI, PhysxJointAxisAPI, actuator group hints, latency, domain randomization blocks).
- Now safe to consume `WorldPhysicsConfig` (EARTH / ALIEN) from the cleaned `AndroidXRTraitDispatch.ts` (APL unblock, commit b212c8b3c).
- Exposed in `@holoscript/robotics-plugin` public API and default export.

**Verification** (executed 2026-05-21):
- `pnpm --filter @holoscript/robotics-plugin run build` → clean tsc (0 errors)
- `pnpm --filter @holoscript/robotics-plugin run test` → 9/9 green in `src/__tests__/isaac-lab-interop.test.ts`
- All existing URDF + USD paths continue to work; the feed is a pure additive narrow surface.

**Evidence**:
- Commit that landed the feed + receipt types: (prior in wave; function present and passing)
- This receipt file: 2026-05-21_isaac-lab-narrow-feed-delivered.md
- Related prior notes: 2026-04-19_isaac-lab-sim-to-real.md, 2026-05-14_isaac-lab-path-a-spike.md, 2026-05-12 interop memo, 2026-03-09 impossible-doors Door 8

**Closure**: The narrow "feed" path is now a shippable, evidence-tracked primitive. Downstream consumers (Isaac Lab 2.3+ training jobs, sim-to-real eval harness) can ingest the bundle directly. No over-scope into full policy or real-robot control loops.

**Next for APL / interop surface**: When the WIT trait-evaluation audit or the next Engine Core package lands, the same `generateIsaacLabFeed` surface can be extended with platform-specific physics (WorldPhysicsConfig) without changing the contract.

Status: **DONE** for task_1779180755794_1iil.