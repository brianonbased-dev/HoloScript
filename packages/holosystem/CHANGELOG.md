# @holoscript/holosystem

## 0.3.0

### Minor Changes

- 54d65f2: Import digest-anchored Debian status and multi-repository Packages evidence into deterministic operating-system substrate graphs while preserving exact version relations, alternatives, virtual providers, artifact hashes, per-archive custody, maintainer-script blockers, repository-authentication and native-build coverage gaps, and signed rebuild requirements.
- 0afbd83: Import npm package-lock v2 and v3 graphs into deterministic substrate inputs while preserving nested resolution, registry integrity, configured-registry indirection, lifecycle-script blockers, native and operating-system coverage gaps, external custody, and the requirement for signed rebuild attestations.
- a0a80fb: Add a closed, digest-pinned QEMU TCG machine-VM launch runner with immutable
  runtime and guest snapshots, deterministic two-launch receipts, CLI inspection,
  virtual-device minimization, and explicit host-process and hardware-acceleration
  gaps.
- 7adcd9e: Verify Debian InRelease or Release.gpg metadata with digest-pinned gpgv and keyrings, exact signer fingerprints, replay bounds, and a signed Packages-index hash chain before claiming repository-authentication coverage.
- 7fdc3d9: Add a declarative, digest-pinned Docker native-build runner with reproducibility,
  isolation, ELF-target, artifact-pin, CLI, and rebuild-attestation receipts.
- 5877128: Add a deterministic substrate-closure API and CLI receipt that exposes dependency edges, custody boundaries, pinned source and artifact identities, graph defects, and Ed25519 rebuild attestations evaluated under a caller-owned trust policy.

### Patch Changes

- Updated dependencies [7c22951]
- Updated dependencies [664f178]
- Updated dependencies [64f7022]
- Updated dependencies [d26629c]
  - @holoscript/core@8.7.0
