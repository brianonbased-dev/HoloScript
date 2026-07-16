# Machine VM launch threat model

## Claim

`vm-launch` proves that two launches of the same measured QEMU runtime, Linux
kernel, and initramfs reached the same pinned serial success signal through a
generated, closed full-system QEMU invocation. Optional virtual devices are
minimized: there is no default device set, network, USB, display, or monitor. The
receipt binds the plan, complete runtime manifest, executable, guest artifacts,
and fixed launch policy.

This is a machine-VM execution receipt, not a hardware-backed isolation receipt.
The only accepted accelerator is QEMU TCG. A verified receipt therefore sets
`hardwareBacked` to `false` and leaves `hardware-hypervisor-acceleration` and
`host-process-isolation` missing. QEMU retains the ambient rights of its Windows
host process in this tracer.

## Protected assets and trust boundaries

The protected inputs are the declarative plan, the complete caller-owned QEMU
runtime directory, the guest kernel, and the guest initramfs. Operational paths
are not part of the plan or receipt. The receipt exposes digests, byte counts,
bounded launch summaries, coverage, and named residual boundaries.

The tracer does not prove:

- QEMU, the guest kernel, initramfs, or firmware were built from trusted source;
- Windows, the CPU, QEMU, or Node.js implemented the measurement correctly;
- hardware virtualization, IOMMU separation, measured boot, Secure Boot, TPM,
  confidential memory, or side-channel resistance;
- host crash dumps, swap, hibernation, debugger state, or physical custody are
  protected;
- the guest success program establishes a broader workload security property.

Those limitations are machine-readable in `boundaries` and `coverage` rather
than implied away by a successful boot.

## Adversary specifications

| Adversary action                                                                                     | Required result                                                            | Receipt or test evidence                                   |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Add a shell command, argument vector, environment field, device, network mode, or unknown plan field | Reject before process launch                                               | `vm-launch-field-unknown`; closed-vocabulary test          |
| Select WHPX or otherwise request an unsupported stronger claim                                       | Reject rather than downgrade or overclaim                                  | `vm-launch-accelerator-unsupported`                        |
| Replace any QEMU executable, DLL, firmware file, kernel, or initramfs before measurement             | Reject before process launch                                               | Runtime, binary, kernel, and initrd digest mismatch issues |
| Replace measured files while the launch snapshot is being created                                    | Reject the snapshot                                                        | Runtime, kernel, and initrd snapshot mismatch issues       |
| Replace caller-owned files after the first launch                                                    | Second launch still uses the same private snapshot                         | Private-snapshot substitution test                         |
| Persistently self-modify the private runtime or guest artifacts during a launch                      | Reject on post-launch remeasurement                                        | Private-snapshot drift test                                |
| Inject QEMU behavior through inherited environment variables or user configuration                   | Launch with a minimal environment and `-no-user-config`                    | Generated-argv test                                        |
| Obtain implicit host devices or a communication channel                                              | Start with `-nodefaults`, `-nic none`, USB off, no display, and no monitor | Generated-argv test                                        |
| Forge the guest signal, use the wrong exit path, or emit emulator diagnostics                        | Reject the receipt and retain no raw output                                | Console, exit-code, and diagnostics tests                  |
| Make clean launches observably disagree                                                              | Reject deterministic coverage                                              | `vm-launch-nondeterministic`                               |
| Inject a fake process runner through the public API                                                  | Ignore it and execute only the bound process implementation                | Public process-runner injection test                       |
| Put an operational path or guest output in the receipt                                               | Withhold it; report only digest and byte count                             | Receipt disclosure assertions                              |

## Fixed launch policy

The plan does not express QEMU arguments. The implementation generates a q35
TCG invocation with one CPU, 128 MiB, no user configuration, no default devices,
no network, no USB, no display, no monitor, no reboot, direct kernel boot, serial
stdio, and a fixed ISA debug-exit device. The guest command line is fixed and
disables trust in CPU random seeding. The process has a bounded timeout and
output buffer and receives only a small host/runtime environment.

Exactly two launches are required. The snapshot is remeasured immediately before
and after each launch. Each launch must exit with the fixed debug-exit status,
produce the plan-pinned serial digest, and emit zero stderr bytes. Raw stdout and
stderr are never included in the receipt.

## Residual risk and next layer

The QEMU runtime closure includes firmware data files and DLLs, so substitution
changes its digest. Hashing does not establish provenance or measured boot.
Windows QEMU also cannot disable host crash-dump capture through this contract;
`host-crash-dump-custody` remains an explicit boundary.

QEMU is not placed in an AppContainer, restricted token, job-object filesystem
sandbox, or separate host VM. `virtual-device-minimization` therefore describes
only the generated guest-facing virtual device surface; it must not be read as
host-process or physical-device isolation.

The next stronger adapters must use separately named receipts for a supported
hardware accelerator and for firmware/measured-boot evidence. They must not
reinterpret this TCG receipt as proof of either property.
