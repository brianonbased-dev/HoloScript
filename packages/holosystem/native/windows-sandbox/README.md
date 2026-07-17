# Windows low-integrity Job launcher

`Program.cs` is the auditable source for the Windows AMD64 launcher consumed by
`vm-launch-whpx-sandboxed`. `Canary.c` is the native zero-capability file and
loopback probe consumed only by `vm-launch-whpx-appcontainer`. `build.ps1`
compiles the launcher with the inbox .NET
Framework AMD64 compiler and writes the measured artifact to
`../windows-x64/holosystem-sandbox-launcher.exe`; it compiles the canary with
the installed Visual C++ AMD64 tools into
`../windows-x64/holosystem-appcontainer-canary.exe`.

The release contract pins the executable digest, not an unverified source-build
claim. The inbox compiler does not offer deterministic output, so a rebuild is
expected to change the binary digest even when the source is unchanged. Review
the source and binary delta, update the plan fixture, run the HoloSystem package
checks, and complete a real two-launch WHPX receipt before publishing a rebuilt
launcher.

The low-integrity adapter applies only the process controls it reports: maximum-privilege
filtering, low integrity, an explicit three-handle inheritance list, and a
pre-resume Job Object with kill, process-count, memory, and UI limits. It is not
an AppContainer and does not claim filesystem confidentiality or network
capability isolation.

The AppContainer adapter creates an ephemeral zero-capability identity, applies
fixed snapshot/temp grants, and runs the measured native canary under the same
restricted AppContainer token before starting QEMU. Both binaries are pinned by
the plan and remeasured around each launch. A successful canary is not enough:
the launcher requires exact file and Winsock access-denied evidence and verifies
the suspended QEMU token independently.
