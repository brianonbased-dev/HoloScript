# @holoscript/cli

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
