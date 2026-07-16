# Native-build threat model

This threat model covers `holoscript.holosystem.native-build-plan.v1` and the
Docker executor in `@holoscript/holosystem`. Its security objective is narrow:
compile a caller-pinned source snapshot into one reproducible Linux AMD64 ELF
artifact without giving the plan a general process-execution language.

It does not establish that a compiler image is benevolent, that Docker or the
host kernel is uncompromised, or that two runs under one image are independent
rebuilds. Those claims require separately governed trust roots and the existing
signed rebuild-attestation gate.

## Trust assumptions

- The caller establishes the expected source, Docker executable, compiler-image,
  and final artifact digests through a control plane outside the build plan.
- The host filesystem, Docker daemon, kernel, CPU, and cryptographic primitives
  are trusted to execute their documented behavior.
- An immutable OCI manifest digest identifies stable image bytes; it does not
  prove publisher identity or compiler correctness.
- The independent builder reviews the native receipt before signing the existing
  rebuild-attestation payload. A receipt hash is content integrity, not a
  signature or organizational-independence proof.

## Adversary classes

| Adversary                        | Capability                                                             | Goal                                                                                            | Measurable success                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Plan-language attacker           | Controls every JSON plan field                                         | Reach a shell, arbitrary executable, network, privilege, host mount, or free-form compiler flag | A supplied field changes process identity or weakens a fixed Docker policy                                   |
| Source-race attacker             | Mutates caller source while a build starts                             | Compile bytes different from the pinned source digest                                           | Mounted snapshot digest differs from the plan while the receipt is `verified`                                |
| Executor-substitution attacker   | Replaces or redirects the Docker executable                            | Run a different host program under an accepted plan                                             | Process launch occurs after executable type or digest mismatch                                               |
| Output-smuggling attacker        | Controls compiler behavior inside the container                        | Export undeclared files, links, oversized data, or the wrong machine format                     | A non-declared or non-AMD64-ELF artifact reaches the caller output directory                                 |
| Reproducibility attacker         | Makes clean builds diverge                                             | Obtain coverage for unstable or environment-dependent output                                    | The receipt includes `native-build` when two run digests differ                                              |
| Diagnostic-exfiltration attacker | Places secrets or host paths in compiler output                        | Copy sensitive diagnostics into a portable receipt                                              | Receipt JSON contains raw stdout, stderr, source contents, or operational paths                              |
| Compiler-image attacker          | Publishes a malicious but digest-pinned image                          | Exploit Docker/kernel or emit reproducible malware                                              | Outside the runner's prevention boundary; detected only by independent rebuild and image-governance controls |
| Host-control attacker            | Controls Docker daemon, host kernel, or same-user filesystem namespace | Forge all observations or race executable/output paths                                          | Explicitly out of scope for this receipt; requires measured host/boot custody                                |

## Attack specifications and defenses

### A1: shell and option injection

Precondition: the attacker can submit a plan. They add `command`, `args`, an
image tag, a traversal path, a compiler plugin flag, or a weaker network/user
policy. Success means any attacker text is forwarded as executable or shell
input.

Defense: the plan rejects unknown fields, exposes only GCC/C11 plus a small
optimization enum, and generates the complete Docker and compiler argv. The
production API binds directly to `spawnSync`; its test process adapter is not
exported from the package root. Docker receives `shell: false`, an overridden
`/usr/local/bin/gcc` entrypoint, no network, no IPC namespace sharing, a
read-only root and source, no capabilities, no-new-privileges, and a non-root
uid/gid.

Regression evidence: `inspects a closed declarative build vocabulary`, `does
not publish process-runner injection through the package API`.

### A2: source time-of-check/time-of-use swap

Precondition: the attacker can mutate the source directory during launch. They
replace a translation unit or introduce a link after the initial digest scan.
Success means different bytes reach GCC while the plan's source digest remains
accepted.

Defense: the runner rejects links and special files, copies only the inspected
manifest into a private temporary snapshot, re-hashes that snapshot, and mounts
the snapshot read-only for both builds. A mismatch blocks before Docker starts.

Regression evidence: source digest and snapshot validation are exercised by
every successful and source-mismatch build test.

### A3: executor replacement

Precondition: the attacker changes the host executable or points at a link.
Success means the supplied program starts before its identity is rejected.

Defense: the operational executor must be a regular non-link file and match the
plan's SHA-256 digest. The runner then copies it into its private custody
directory, re-hashes that copy, and launches only the copy. A later replacement
of the caller's executable path cannot change either rebuild. Operational paths
never enter the receipt.

Regression evidence: `blocks an executor substitution before process launch`,
`launches a private executor snapshot immune to later path substitution`.

### A4: artifact smuggling

Precondition: the compiler image is malicious or the translation unit triggers
unexpected compiler behavior. It creates extra files, a symbolic link, a large
artifact, or a binary for another architecture. Success means any such output
is retained as verified.

Defense: each run gets a fresh output directory. The runner accepts exactly the
declared relative path, rejects links and special files, caps artifact size,
parses the ELF class/endian/machine header, and copies output into a newly
created caller directory only after all checks pass.

Regression evidence: `blocks non-reproducible and unexpected build outputs`,
`blocks a reproducible artifact for the wrong machine target`, `requires a new
output directory and redacts compiler diagnostics`.

### A5: reproducible but unpinned output

Precondition: a compromised compiler emits the same malicious artifact twice.
Success means same-toolchain reproducibility is treated as published-artifact or
independent-rebuild trust.

Defense: the first reproducible build is only `artifact-pin-required` and does
not include the `native-build` layer. A second plan must carry an externally
selected `expectedArtifactDigest`. Even a verified native receipt is only input
to the existing signed rebuild payload; the substrate gate still demands
caller-owned independent trust roots.

Regression evidence: `requires an artifact pin before claiming native-build
coverage`, `turns a verified native result into the existing signed rebuild
payload`.

### A6: diagnostic exfiltration

Precondition: source or compiler emits secrets and absolute paths on stdout or
stderr. Success means those bytes appear in portable JSON.

Defense: logs are bounded and represented only by byte counts and SHA-256
digests. Errors use fixed messages and relative schema paths. Source content,
executor path, source path, artifact directory, stdout, and stderr are absent.

Regression evidence: `requires a new output directory and redacts compiler
diagnostics` plus the receipt path-redaction assertions in the successful build
test.

## Resource and isolation contract

The runner fixes `--pull never`, `--platform linux/amd64`, `--network none`,
`--ipc none`, `--read-only`, `--cap-drop ALL`, `no-new-privileges`, uid/gid
65534, read-only source, bounded tmpfs, PIDs, memory plus swap, CPU quota, log
buffer, and wall-clock timeout. These settings reduce container reach; they are
not a proof against a Docker, kernel, CPU, or compiler exploit.

## Residual work

The next trust layers are intentionally separate contracts:

1. independently governed compiler-image and builder signing roots;
2. VM/hypervisor isolation and measured launch receipts;
3. UEFI, Secure Boot, TPM, bootloader, firmware, and microcode measurements;
4. ISA-specific code generation and bare-metal runtime admission;
5. physical-device identity, hardware telemetry, and recovery receipts.

Combining those into a broader `command` field would erase the security model.
Each layer must add a typed target and a verifier that can fail closed.
