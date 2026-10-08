# @holoscript/cli

## 8.9.0

### Minor Changes

- Core and CLI changes merged to main between the 8.7.0 release (2026-08-13) and
  this one. They were not recorded as changesets at the time; the git history of
  `packages/core` and `packages/cli` since 2026-08-13 is the full list.

  **Behavior change (security):** a pipeline no longer reads environment variables
  on its own. Each variable it reads must be allowed by the operator with
  `--allow-env <NAME>` (this includes `HOLOSCRIPT_MCP_URL`). A pipeline that read
  environment variables under 8.7.0 runs under 8.9.0 without them until they are
  allowed. A pipeline file can also no longer send `HOLOSCRIPT_API_KEY` to a
  server it chose, and gets no loopback server of its own.

  Other highlights:

  - Scene blocks: objects written inside a `scene` now reach WebGPU, Godot, Android,
    iOS, visionOS, Android XR, Quest and Studio's viewport, and a scene that reuses
    an object name no longer breaks WebGPU or Godot output.
  - Every export target carries a readiness tier its evidence earns.
  - Three.js output emits rotation in radians (HoloScript rotation is degrees);
    iOS and Android round parts and cylinders are sized like Quest and the web.
  - The `.hsplus` Rust checker loads from built output.
  - `query --dir` searches the directory it absorbed.
  - Traits can describe their own fields, and editor affordances are refused for a
    trait name two traits claim.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @holoscript/core@8.9.0
  - @holoscript/engine@6.1.9
  - @holoscript/uaal@8.9.0

## 8.7.0

### Minor Changes

- 2fe1fce: Execute verified static `.holo` physics declarations through the fixed-step CPU
  `PhysicsWorldImpl`, seal transform/contact/sleep state in a source-backed hash
  chain, and expose a fail-dark read-only HoloLand-targeted observer contract.
  This contract does not claim that a HoloLand adapter or renderer executed.
  The static projection profile also admits the canonical `@kinematic` trait.
- d26629c: Add source-run receipt v3 with deterministic `.holo` source re-projection,
  world-provenance verification, closed nested receipt contracts, and a durable
  three-format Model Village experiment fixture while preserving v2
  verification. Expose the canonical `.holo` tokenizer so the admitted world
  profile can fail closed on non-static token classes, properties, traits, and
  lifecycle syntax. Pose/physics output is declaration metadata, not solver
  execution.

### Patch Changes

- f2dc653: Add source-recomputed V4 receipts, a same-execution post-seal observer API, and subject-bound observation ledgers.
- 848f3bf: Add rotation-aware cylinder broadphase and exact sphere-cylinder contacts, and use native cylinder collision shapes in deterministic CPU physics receipts.
- 33cf7ea: Publish deterministic `.hs` compiler/UAAL execution provenance and an additive cross-format source-run receipt that explicitly distinguishes source re-execution from hash-anchored `.holo` and `.hsplus` evidence.
- Updated dependencies [7c22951]
- Updated dependencies [f2dc653]
- Updated dependencies [664f178]
- Updated dependencies [4047ea2]
- Updated dependencies [38156cd]
- Updated dependencies [64f7022]
- Updated dependencies [848f3bf]
- Updated dependencies [33cf7ea]
- Updated dependencies [2b399da]
- Updated dependencies [d26629c]
  - @holoscript/core@8.7.0
  - @holoscript/engine@6.1.7
  - @hololand/platform-services@6.2.0
  - @holoscript/wasm@6.2.0
  - @holoscript/core-types@6.2.0
  - @holoscript/uaal@8.7.0

## 8.0.13

### Patch Changes

- Track the Rust/WASM compiler's four-instruction constant plan kernel after
  explicit returns stopped emitting an unreachable trailing `RET`. The exact
  bytecode, provenance, source-backed verification, and public receipt types
  now agree on `[CALL, HALT, PUSH, RET]`.

## 8.0.11

### Patch Changes

- Re-publish the CLI after the formatter package repair so registry cold-start
  installs resolve `@holoscript/formatter` to a version with the CommonJS entry
  files required by the CLI.

## 8.0.10

### Patch Changes

- Rebuild and republish the CLI package so the npm tarball exposes all required
  fleet bins (`holo`, `holoscript`, `hs`) and the help banner reports the
  current package version under the registry cold-start canary.

## 8.0.6

### Patch Changes

- c64fc1a: Re-lockstep the changesets `fixed` group after W.669's emergency out-of-band publish-fix republishes desynced its members (core 6.1.3, cli 6.1.1, agent-protocol/snn-webgpu/uaal 6.1.0, holo-vm 6.1.1). On the next `changeset version` this realigns all six fixed-group packages to a single coordinated version (6.1.4), restoring the invariant the `fixed` config requires. No functional code change — version-hygiene reconciliation only.

  NOTE: holo-vm's npm `latest` is stranded on the abandoned 7.0.0 platform line (6.1.x was never published for it); a coordinated 6.1.4 publish does NOT reclaim its `latest` tag. That, plus the broader Class-B stranded-7.0.0 set (benchmark, formatter, linter, lsp, mcp-server, partner-sdk, r3f-renderer, std, visual, wasm), is tracked separately as a deliberate release/dist-tag operation — see the board task on npm publish drift reconciliation.

- Updated dependencies [c64fc1a]
- Updated dependencies [6dc9732]
  - @holoscript/core@8.0.6
  - @holoscript/engine@6.1.3
  - @holoscript/platform@6.1.2

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3

### Patch Changes

- @holoscript/core@6.0.3
- @holoscript/sdk@6.0.3
