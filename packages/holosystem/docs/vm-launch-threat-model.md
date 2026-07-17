# Machine VM launch threat model

## Claim

`vm-launch` and `vm-launch-whpx` prove that two launches of the same measured
QEMU runtime, Linux kernel, and initramfs reached the same pinned serial success
signal through generated, closed full-system QEMU invocations. Optional virtual
devices are minimized: there is no default device set, network, USB, display, or
monitor. Each receipt binds the plan, complete runtime manifest, executable,
guest artifacts, and adapter-specific fixed launch policy.

The TCG adapter is a machine-VM execution receipt and sets `hardwareBacked` to
`false`. The separately named WHPX adapter selects only `accel=whpx`, has no TCG
fallback, and sets `hardwareBacked` to `true` only when two explicit WHPX boots
succeed with matching observations. This proves use of QEMU's hardware-backed
Windows Hypervisor Platform adapter for those launches; it does not prove host
process isolation. QEMU retains the ambient rights of its Windows process in
both adapters.

`vm-launch-whpx-sandboxed` is a separate schema and receipt. It runs the same
measured WHPX launch behind a measured native Windows launcher that creates a
filtered token with `DISABLE_MAX_PRIVILEGE`, sets low mandatory integrity,
verifies at most the single pass-through privilege remains enabled, creates
QEMU suspended with only NUL/stdout/stderr handles inherited, assigns QEMU to a
Job Object before resume, and applies kill-on-close, one-process, 512 MiB, and
full Job UI restrictions. Its `host-process-isolation` claim is limited to
those controls. It is not an AppContainer and does not claim host filesystem
confidentiality or host network isolation.

`vm-launch-whpx-appcontainer` is another separate schema and receipt. It adds
an ephemeral zero-capability AppContainer identity to the same filtered,
low-integrity token and pre-resume Job boundary. The identity receives inherited
read/execute access to the private measured snapshot and modify access only to
the private temp directory. Before QEMU starts, the launcher runs an
AppContainer child under the same token and verifies that it cannot read a
caller-readable protected sentinel or connect to a live loopback listener. The
receipt claims filesystem confidentiality and network isolation only when the
token identity, zero capability count, exact denial errors, and both WHPX boots
all verify.

`vm-launch-appcontainer` applies the same boundary to TCG with a fixed 64 MiB
translation buffer. It can claim process, filesystem, and network isolation
after two deterministic boots, but it cannot claim hardware acceleration. On
the validated Windows 11 host, zero-capability QEMU receives access denied
(`0x80070005`) while initializing WHPX. That negative result is preserved as a
blocked WHPX AppContainer receipt; it is never combined with the verified TCG
AppContainer receipt or the separately verified low-integrity WHPX receipt.

## Protected assets and trust boundaries

The protected inputs are the declarative plan, the complete caller-owned QEMU
runtime directory, the guest kernel, and the guest initramfs. Operational paths
are not part of the plan or receipt. The receipt exposes digests, byte counts,
bounded launch summaries, coverage, and named residual boundaries.

The tracer does not prove:

- QEMU, the guest kernel, initramfs, or firmware were built from trusted source;
- Windows, the CPU, QEMU, or Node.js implemented the measurement correctly;
- TCG hardware virtualization, or WHPX IOMMU separation, measured boot, Secure
  Boot, TPM, confidential memory, or side-channel resistance;
- host crash dumps, swap, hibernation, debugger state, or physical custody are
  protected;
- the guest success program establishes a broader workload security property.

Those limitations are machine-readable in `boundaries` and `coverage` rather
than implied away by a successful boot.

## Adversary specifications

| Adversary action                                                                                     | Required result                                                             | Receipt or test evidence                                   |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Add a shell command, argument vector, environment field, device, network mode, or unknown plan field | Reject before process launch                                                | `vm-launch-field-unknown`; closed-vocabulary test          |
| Put WHPX in a TCG plan, TCG in a WHPX plan, or request a fallback                                    | Reject rather than downgrade, cross-route, or overclaim                     | Separate schemas; accelerator/unknown-field tests          |
| Replace any QEMU executable, DLL, firmware file, kernel, or initramfs before measurement             | Reject before process launch                                                | Runtime, binary, kernel, and initrd digest mismatch issues |
| Replace measured files while the launch snapshot is being created                                    | Reject the snapshot                                                         | Runtime, kernel, and initrd snapshot mismatch issues       |
| Replace caller-owned files after the first launch                                                    | Second launch still uses the same private snapshot                          | Private-snapshot substitution test                         |
| Persistently self-modify the private runtime or guest artifacts during a launch                      | Reject on post-launch remeasurement                                         | Private-snapshot drift test                                |
| Inject QEMU behavior through inherited environment variables or user configuration                   | Launch with a minimal environment and `-no-user-config`                     | Generated-argv test                                        |
| Obtain implicit host devices or a communication channel                                              | Start with `-nodefaults`, `-nic none`, USB off, no display, and no monitor  | Generated-argv test                                        |
| Forge the guest signal, use the wrong exit path, or change adapter diagnostics                       | Reject the receipt and retain no raw output                                 | Console, exit-code, and diagnostic-digest tests            |
| Make clean launches observably disagree                                                              | Reject deterministic coverage                                               | `vm-launch-nondeterministic`                               |
| Inject a fake process runner through the public API                                                  | Ignore it and execute only the bound process implementation                 | Public process-runner injection test                       |
| Select ambient execution, weaken a sandbox control, change the launcher, or forge its protocol       | Reject the distinct sandbox schema, launcher digest, or incomplete evidence | Closed sandbox vocabulary and protocol-forgery tests       |
| Pass inherited parent handles into sandboxed QEMU                                                    | Admit only NUL input and the two bounded output pipes                       | Native handle-list evidence and receipt assertion          |
| Spawn another process or escape launcher lifetime/resource bounds                                    | Assign suspended QEMU before resume to a one-process, kill-on-close Job     | Native Job evidence and adversarial receipt tests          |
| Add an AppContainer capability, path grant, network mode, command, or fallback                        | Reject the distinct closed plan vocabulary before launch                    | AppContainer closed-vocabulary test                        |
| Forge the AppContainer SID, capability count, profile cleanup, or grant evidence                      | Reject the closed native protocol                                            | AppContainer protocol-forgery test                         |
| Read a caller-readable file outside the measured snapshot                                             | Require exact access-denied evidence from a zero-capability AppContainer     | Protected-sentinel canary and receipt assertion            |
| Connect to the host loopback listener from compromised QEMU                                           | Require bounded WSA deny/drop evidence and no accepted connection            | Loopback canary and receipt assertion                      |
| Put an operational path or guest output in the receipt                                               | Withhold it; report only digest and byte count                              | Receipt disclosure assertions                              |

## Fixed launch policy

The plan does not express QEMU arguments. Each implementation generates a q35
invocation for exactly one bound accelerator (`tcg` or `whpx`) with one CPU,
128 MiB, no user configuration, no default devices, no network, no USB, no
display, no monitor, no reboot, direct kernel boot, serial stdio, and a fixed
ISA debug-exit device. The TCG adapter pins QEMU's `max` CPU model; the WHPX
adapter leaves CPU selection to that hardware backend because the TCG model is
not a valid substitute. The guest command line is fixed and disables trust in
CPU random seeding. The process has a bounded timeout and output buffer and
receives only a small host/runtime environment.

Exactly two launches are required. The snapshot is remeasured immediately before
and after each launch. Each launch must exit with the fixed debug-exit status and
produce the plan-pinned serial digest. TCG must emit zero stderr bytes. WHPX must
produce the plan-pinned diagnostic digest after removal of only the exact,
randomized private-executor prefix that QEMU repeats at diagnostic line starts. Raw
stdout and stderr are never included in the receipt.

The sandboxed adapter additionally copies the package-pinned launcher into the
private measured snapshot. The launcher protocol is closed and binary-safe: it
returns base64 child streams plus derived control evidence, and HoloSystem
rejects unknown fields, non-canonical base64, an unbounded enabled-privilege
count, a missing control, or launcher stderr. Launcher and QEMU snapshots are
remeasured before and after both launches.

The AppContainer adapter uses the same measured launcher but a distinct plan,
protocol, and control vocabulary. It never accepts caller-specified capabilities
or ACL paths. Each native invocation creates a fresh AppContainer profile,
applies the fixed grants, runs both canaries, creates QEMU with the same zero
capability `SECURITY_CAPABILITIES`, checks the suspended child token, and deletes
the profile during cleanup. HoloSystem rejects a nonzero capability count,
unexpected bounded denial code, accepted loopback connection, incomplete cleanup, or
any unknown protocol field.

The TCG AppContainer plan also fixes `tcg,tb-size=64`; a caller cannot enlarge
the JIT translation buffer or relax the 512 MiB process limit. Its receipt keeps
`hardware-hypervisor-acceleration` missing even when every confinement canary
passes.

## Residual risk and next layer

The QEMU runtime closure includes firmware data files and DLLs, so substitution
changes its digest. Hashing does not establish provenance or measured boot.
Windows QEMU also cannot disable host crash-dump capture through this contract;
`host-crash-dump-custody` remains an explicit boundary.

The ambient adapters do not place QEMU behind an OS process sandbox.
`virtual-device-minimization` therefore describes only their generated
guest-facing virtual device surface.

The sandboxed adapter is narrower than AppContainer or a separate host VM. Its
filtered token retains normal read access allowed to the caller and does not
create an OS network capability boundary. The QEMU command still contains no
guest network device, but a compromised host QEMU process could use host
network APIs. `host-filesystem-confidentiality` and `host-network-isolation`
therefore remain explicit missing layers even when the declared process
isolation controls verify. The launcher binary is measured, but source-to-binary
reproducibility and code signing remain part of `qemu-runtime-supply-chain` and
host correctness trust.

The TCG AppContainer tracer implements capability-scoped filesystem and network
denial without hardware acceleration; the WHPX form remains blocked on the
validated host. It does not turn the Windows kernel into a separate trust
domain. The next layers are a WHPX broker or independent host boundary and
firmware/measured-boot evidence. IOMMU, device-assignment, crash-dump custody,
host correctness, and side-channel boundaries remain separate.
