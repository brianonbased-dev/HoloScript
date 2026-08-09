# @holoscript/holosystem

Create and inspect a portable HoloSystem consumer configuration, discover a
multi-rail public consumption catalog, map registry artifacts to canonical
source repositories, and select bounded next work. The package is for external
founders, agent operators, and cold consumers who need the same evidence
contract without a private workspace or machine-specific defaults.

```bash
npm install @holoscript/holosystem
npx holosystem create --id acme-founder --workspace acme --json
npx holosystem inspect holosystem.config.json --json
```

## Consumption Catalog

The catalog keeps npm, PyPI, GitHub repositories, public services, containers,
and agent surfaces as separate rails. It never creates a misleading grand total.
Each rail reports publication, consumer readiness, dogfood evidence when known,
and gaps independently.

```bash
npx holosystem lineage \
  --portfolio portfolio-consumer.json \
  --output source-lineage.json \
  --json

npx holosystem catalog \
  --seeds public-surface-seeds.json \
  --portfolio portfolio-consumer.json \
  --manifest package-manifest.json \
  --lineage source-lineage.json \
  --output consumption-catalog.json \
  --json
```

`lineage` reads registry metadata and records canonical repository URLs and
portable package directories. When an exact npm version has no repository field,
the receipt may infer its repository from a revision cohort only when both the
target and its direct-metadata anchors have successful registry responses,
nonempty integrity values, the same full 40-hex `gitHead`, and exact matching
versions. Every anchor must resolve to one normalized repository; conflicts fail
closed. These entries use `lineageKind: "revision-cohort"`, keep
`sourceDirectory` null, and carry the exact sorted anchors in `lineageEvidence`.
They are evidence-backed inferences, not direct package metadata, and inferred
entries never become anchors. Unknown lineage remains a named gap; local source
paths are never emitted. `catalog` performs public GitHub, service, container,
MCP-health, and public-skill discovery, then joins those results with the
caller's package admission, lineage, proof-batch, and promotion receipts.

`holoscript.holosystem.source-lineage.v1` is an additive receipt contract.
Consumers must treat `lineageKind` as an open enum, preserve unfamiliar kinds
and their evidence, and use `mapped` for the broad mapped/unmapped decision.
New summary keys and new evidence-backed lineage kinds may be added within v1;
removing a field or changing an existing kind's meaning requires a new schema.

```js
import {
  buildConsumptionSurfaceCatalog,
  buildSourceLineageReceipt,
  discoverConsumptionSurfaceCatalog,
  discoverSourceLineage,
  selectNextConsumptionWork,
} from '@holoscript/holosystem';
```

The bounded selector excludes artifacts already present in active proof batches,
returns one highest-priority candidate, and carries authority, validation, lease,
and spend stop conditions. It selects work; it does not claim a board task,
publish a package, spend funds, or bypass caller authority.

## Proposal-only farm

`farm` turns an exact catalog, portfolio receipt, and lineage receipt into one
deterministic `holosystem.self-improvement-farm.v2` proposal. It is deliberately
proposal-only: it does not claim or execute a task, accept a proposal, apply a
change, publish a package, spend funds, or mutate any external system.

```bash
npx holosystem farm \
  --catalog consumption-catalog.json \
  --portfolio portfolio-consumer.json \
  --lineage source-lineage.json \
  --output farm-proposal.json \
  --json
```

The three files are required and schema-checked together. A detached catalog
decision that is inconsistent with the portfolio and lineage is blocked rather
than silently trusted. Existing output files require explicit `--force`.
`action-ready` and `idle` proposals exit `0`. Unreadable or malformed JSON
exits `1` because the command cannot conclude. Invalid arguments, schema or
decision inconsistencies, unsafe output writes, and named blocked proposals
exit `2`.

Every receipt keeps `accepted: false`, `changesApplied: []`, and marks proposed
work with `requiresAuthority: true`. Those fields are an authority boundary, not
an approval mechanism. A caller must independently authorize, claim, execute,
validate, and accept any downstream work. The proposal-only command cannot
grant wallet, custody, publication, governance, or external-mutation authority.

```js
import {
  HOLOSYSTEM_FARM_SCHEMA,
  buildFarmProposalReceipt,
} from '@holoscript/holosystem';
```

`buildFarmProposalReceipt` is pure and returns the same proposal content and
receipt hash for the same semantic inputs; only the informational `generatedAt`
may differ when callers do not provide `now`. It records the caller-supplied
source receipt references and a self-validating receipt hash; it never reads
files or performs side effects.

## HoloScript Source Canon

`source-canon` is the consumer-side language-sovereignty gate. Run it from the
root of a Git repository:

```bash
npx holosystem source-canon \
  --output runtime/visual-state/source-canon.hsplus \
  --json
```

The gate reads the fixed Git-tracked file inventory and accepts only `.holo`,
`.hs`, and `.hsplus` as canonical authored source. It then parses the actual
tracked bytes with the exact optional peer `@holoscript/core@8.0.16`; when that
parser is unavailable, the gate fails closed. This prevents JavaScript or another
language from becoming canonical merely by being renamed. Other HoloSystem
commands remain usable without the optional peer.

A caller cannot widen the registry with an extension allowlist. A future format
becomes canonical only when a HoloScript release owns its parser and adds it to
the package registry.

The command exits `0` only when at least one HoloScript source file exists and
every tracked file uses a canonical format. It exits `2` with every foreign
tracked path named otherwise. When `--output` is supplied, the durable
founder-visible projection must itself be a portable repository-relative
`.hsplus` path; JSON remains available only on standard output for transient
agent pipelines.

This gate audits Git-tracked canon. Dependency caches, runtime receipts, and
untracked generated artifacts are not silently promoted to source truth. They
remain non-canonical operational state and must stay untracked or move to an
external runtime store as the consumer migration proceeds.

```js
import {
  inspectGitTrackedSourceCanon,
  inspectSourceCanon,
  renderSourceCanonProjection,
} from '@holoscript/holosystem';
```

## Substrate Closure

The substrate closure replaces an implicit operating-system dependency tower
with a deterministic, caller-owned infrastructure graph. Every component names
an exact version, portable source revision, content digest, custody owner,
dependency edges, installation-script state, and a cryptographically
authenticated rebuild. External
components can remain during migration, but they are visible sovereignty
boundaries rather than hidden transitive dependencies.

```bash
npx holosystem substrate \
  --input substrate.json \
  --output substrate-lock.json \
  --json
```

```js
import { buildSubstrateClosure, createRebuildAttestationPayload } from '@holoscript/holosystem';

const component = {
  id: 'holosystem',
  kind: 'runtime',
  version: '1.0.0',
  custody: {
    mode: 'owned',
    owner: 'holoscript',
    trustDomain: 'holoscript-release',
  },
  source: { uri: 'holorepo://holoscript', revision: 'abc123' },
  artifact: { digest: 'sha256:<64 lowercase hex characters>' },
  execution: { installScripts: 'none' },
  requires: [],
  verification: {
    rebuilds: [
      {
        verifier: 'independent-builder',
        digest: 'sha256:<same 64 lowercase hex characters>',
        signature: '<Ed25519 signature in canonical base64>',
      },
    ],
  },
};

// The independent builder signs this exact UTF-8 payload with its private key.
const payload = createRebuildAttestationPayload({
  verifier: 'independent-builder',
  component,
});

const receipt = buildSubstrateClosure({
  root: 'holosystem',
  coverage: {
    includedLayers: ['kernel', 'runtime', 'toolchain'],
    missingLayers: [],
  },
  verificationPolicy: {
    minimumIndependentRebuilds: 1,
    trustRoots: [
      {
        verifier: 'independent-builder',
        trustDomain: 'independent-builders',
        publicKey: '<Ed25519 public key in PEM format>',
      },
    ],
  },
  components: [component],
});
```

The command exits with code `2` and still emits the blocked receipt when it
finds a missing or unreachable dependency, a cycle, a floating version, a local
source path, an invalid digest, an untrusted verifier, a forged signature, a
same-domain rebuild, a present installation script, or too few matching
rebuilds. The receipt exposes only public-key fingerprints, not the supplied
PEM text. Installation scripts remain blocked until a later execution layer can
prove they were forcibly disabled or sandboxed.

`coverage.includedLayers` declares what the graph represents, while any known
gap remains in `coverage.missingLayers` and blocks readiness. Coverage is still
a caller assertion rather than discovery proof; importers must carry their
known blind spots into this field.

Trust domains are assertions in the caller-owned policy. The signature proves
that the named key attested to the exact component tuple; it does not prove that
the builder is organizationally independent or that the component is safe.
Production trust roots therefore belong to independently governed rebuilders,
not keys created by the component custodian for the same release.

### Import an npm dependency graph

`substrate-import` derives the graph from an npm `package-lock.json` instead of
asking an operator to maintain the dependency edges manually. It supports lock
formats [v2 and v3](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/),
preserves nested Node resolution, converts canonical npm SRI
integrity into content digests, and marks every registry package as external
custody.

```json
{
  "root": {
    "id": "demo-app",
    "custody": {
      "mode": "owned",
      "owner": "demo",
      "trustDomain": "demo-release"
    },
    "source": {
      "uri": "https://github.com/example/demo",
      "revision": "demo-revision-1"
    }
  },
  "verificationPolicy": {
    "minimumIndependentRebuilds": 1,
    "trustRoots": [
      {
        "verifier": "rebuild-farm",
        "trustDomain": "independent-rebuild-farm",
        "publicKey": "<Ed25519 public key in PEM format>"
      }
    ]
  }
}
```

```bash
npx holosystem substrate-import \
  --lock package-lock.json \
  --config substrate-import.json \
  --output substrate-input.json \
  --json
```

The command writes the generated closure input to `--output` and emits an
import receipt on stdout. A valid import has status
`coverage-and-attestation-required`, or `execution-policy-required` when a
package declares an installation script; neither means `ready`. Lockfiles prove
resolution and registry integrity, but not a rebuild, safe lifecycle execution,
or complete operating-system coverage. After independent builders attach signed
attestations, run the existing
`holosystem substrate --input substrate-input.json --json` gate.

Production dependencies are imported by default. Set `"includeDev": true` in
the import configuration to include direct development dependencies. Optional
branches present in the lock are retained as a conservative superset; missing
optional dependencies are counted but do not block import. No package or
install script is executed. `registry.npmjs.org` lockfile indirection is
preserved as `npm://configured-registry/...` instead of pretending that the
configured registry endpoint is known. The root component's artifact digest
represents the canonical lockfile, not a compiled application artifact. Native
libraries and operating-system packages are not derived yet, so those gaps are
carried into the generated input and block the closure. Local links,
missing runtime entries, malformed or weak integrity, non-portable sources, and
private keys in the trust policy block import without echoing their values.

```js
import { importNpmPackageLock } from '@holoscript/holosystem';

const imported = importNpmPackageLock({
  lockfile,
  root,
  verificationPolicy,
});
```

### Import an installed Debian package graph

`substrate-import-debian` converts offline Debian evidence into an
operating-system substrate graph. It accepts one or more independently anchored
repository indexes, parses the standard control-stanza format,
resolves `Depends`, `Pre-Depends`, alternatives, exact version relations, and
installed virtual-package providers according to the
[Debian relationship rules](https://www.debian.org/doc/debian-policy/ch-relationships.html),
and binds each installed package to the SHA-256 or SHA-512 and `Filename` in a
caller-anchored `Packages` index.

The command does not run `dpkg`, `apt`, or any package script. Supply:

- the installed `dpkg` status text;
- each uncompressed repository `Packages` index and its expected digest;
- a JSON map for every installed `package:architecture`, containing hashes for
  any `preinst`, `postinst`, `prerm`, `postrm`, or `config` scripts;
- a config containing the repository base, system root, custody, and optional
  rebuild policy.

```json
{
  "repository": {
    "uri": "https://deb.debian.org/debian/",
    "packagesIndexDigest": "sha256:<digest of the exact Packages input>"
  },
  "root": {
    "id": "demo-linux",
    "version": "12.1-1",
    "custody": {
      "mode": "owned",
      "owner": "demo",
      "trustDomain": "demo-os-release"
    },
    "source": {
      "uri": "https://images.example.com/demo-linux",
      "revision": "snapshot-20260716"
    }
  }
}
```

```json
{
  "base-files:amd64": {},
  "demo-app:amd64": {
    "postinst": "sha256:<digest of the installed postinst file>"
  }
}
```

```bash
npx holosystem substrate-import-debian \
  --status status \
  --packages Packages \
  --maintainer-scripts maintainer-scripts.json \
  --config debian-substrate-import.json \
  --output debian-substrate-input.json \
  --json
```

Real installations usually span base, security, update, or third-party
archives. Use `--sources` instead of `--packages` for those systems. The source
manifest is a JSON array; local `packages` paths are read by the CLI but are not
copied into the receipt.

```json
[
  {
    "packages": "Packages.main",
    "uri": "https://deb.debian.org/debian/",
    "packagesIndexDigest": "sha256:<digest>",
    "authentication": {
      "inReleasePath": "InRelease",
      "verifier": {
        "path": "/usr/bin/gpgv",
        "digest": "sha256:<gpgv-binary-digest>"
      },
      "keyrings": [
        {
          "path": "/usr/share/keyrings/debian-archive-keyring.gpg",
          "digest": "sha256:<keyring-digest>"
        }
      ],
      "trustedFingerprints": ["<exact-primary-or-signing-key-fingerprint>"],
      "expected": {
        "suite": "stable",
        "codename": "trixie",
        "architecture": "amd64",
        "component": "main"
      },
      "packagesIndexPath": "main/binary-amd64/Packages",
      "maxReleaseAgeSeconds": 604800
    },
    "custody": {
      "owner": "debian-main",
      "trustDomain": "debian-main-archive"
    }
  },
  {
    "packages": "Packages.security",
    "uri": "https://security.debian.org/debian-security/",
    "packagesIndexDigest": "sha256:<digest>",
    "custody": {
      "owner": "debian-security",
      "trustDomain": "debian-security-archive"
    }
  }
]
```

```bash
npx holosystem substrate-import-debian \
  --status status \
  --sources debian-sources.json \
  --maintainer-scripts maintainer-scripts.json \
  --config debian-substrate-import.json \
  --output debian-substrate-input.json \
  --json
```

Authentication paths are operational inputs resolved from the current working
directory and are not copied into receipts. Use `releasePath` plus
`releaseSignaturePath` instead of `inReleasePath` for detached `Release.gpg`
signatures. A Git-for-Windows verifier can set `verifier.pathStyle` to `msys`;
other verifiers use the default `native` path style. The package never fetches
or imports keys, so establishing the verifier digest, keyring digest, and exact
fingerprint allowlist remains a caller-owned trust-bootstrap operation.
On the first import, omit `minimumReleaseDate`; on later imports, copy the
accepted `release.date` from the last receipt to reject rollback within the
freshness window. Multi-signed archives require every signature visible to
`gpgv` to resolve through the pinned keyring and fingerprint allowlist. Treat
archive key transitions as explicit configuration updates rather than weakening
verification. Signing-key compromise, key lifecycle, and the trusted clock
remain caller-owned boundaries.

Every fully installed package becomes an external-custody component and the
system root depends on all of them, including packages no longer reachable from
another package. The importer implements Debian's version ordering, including
epochs and the special tilde order. It fails closed on an index-digest mismatch,
missing package artifact, unsatisfied or ambiguous dependency, path traversal,
incomplete maintainer-script evidence, untrusted signature, stale Release,
distribution identity change, or signed index mismatch.

A source without authentication still uses its caller digest only; it does not
claim that a Debian `Release` or `InRelease` signature was verified and retains
the blocking `repository-authentication` coverage gap. When every source passes,
the receipt includes that layer and records the signed Release-to-Packages hash
chain, pinned verifier and keyring digests, exact signer fingerprints, and replay
window. Likewise, Debian
[maintainer scripts execute during package transitions](https://www.debian.org/doc/debian-policy/ch-maintainerscripts.html),
so any present script still blocks substrate readiness. The generated input
always marks operating-system coverage as included. Signed rebuild attestations,
native-build provenance, and the existing `substrate` gate remain required.

```js
import { importDebianPackageSnapshot } from '@holoscript/holosystem';

const imported = importDebianPackageSnapshot({
  status,
  sources: [{ packagesIndex, repository, custody }],
  maintainerScripts,
  root,
  verificationPolicy,
});
```

For a verification-only workflow, call `verifyDebianRepositoryRelease` with the
same authentication fields plus `packagesIndex` and `packagesIndexDigest`. It
returns `holoscript.holosystem.debian-release-auth.v1`; `verified` is true only
when OpenPGP verification, signer pinning, release identity and freshness, and
the signed Packages checksum and size all pass.

### Build a native artifact in a closed executor

`native-build` is the first executable bridge from the substrate graph to a
reproducible native artifact. The initial vocabulary deliberately supports one
small target: a C11 translation unit compiled by GCC into a Linux AMD64 GNU ELF
executable. It does not accept a shell command, arbitrary compiler executable,
free-form flags, lifecycle script, network mode, user id, or weaker isolation
policy from the plan.

Hash the caller-owned source tree first:

```bash
npx holosystem native-build-source --source ./native-source --json
```

Then create a plan using that source digest and a digest-pinned local Docker
binary plus an immutable OCI manifest reference:

```json
{
  "schema": "holoscript.holosystem.native-build-plan.v1",
  "id": "demo-native-build",
  "source": {
    "digest": "sha256:<source-manifest-digest>",
    "sourceDateEpoch": 1700000000
  },
  "target": {
    "os": "linux",
    "architecture": "amd64",
    "abi": "gnu"
  },
  "executor": {
    "kind": "docker",
    "digest": "sha256:<docker-binary-digest>",
    "image": "docker.io/library/gcc@sha256:<amd64-manifest-digest>"
  },
  "compiler": {
    "family": "gcc",
    "language": "c11",
    "source": "main.c",
    "optimization": "speed"
  },
  "output": {
    "path": "demo",
    "format": "elf-executable"
  },
  "limits": {
    "timeoutSeconds": 60,
    "memoryMiB": 512,
    "cpus": 1,
    "pids": 64,
    "tmpfsMiB": 64
  },
  "rebuilds": 2
}
```

```bash
npx holosystem native-build \
  --plan native-build.json \
  --source ./native-source \
  --executor /absolute/operational/path/to/docker \
  --artifact-dir ./native-output \
  --output native-build-receipt.json \
  --json
```

The first successful run is intentionally `artifact-pin-required` and exits
with code `2`. It performs two clean builds and reports their common digest but
does not claim `native-build` coverage. Copy that digest into
`expectedArtifactDigest`, use a new empty artifact directory, and rerun. Only a
matching reproducible result returns `verified`, exits `0`, and includes the
`native-build` layer.

The runner verifies an immutable source snapshot before mounting it, checks the
Docker executable digest, prohibits image pulls and networking, mounts both the
root filesystem and source read-only, drops all Linux capabilities, enables
`no-new-privileges`, runs as uid/gid 65534, bounds time, memory, CPU, PIDs and
temporary storage, and invokes `/usr/local/bin/gcc` directly with generated
deterministic arguments. It rejects undeclared files, symlink outputs,
non-AMD64 ELF results, mismatched artifact pins, and differing rebuild digests.
Compiler logs are represented only by byte counts and hashes; operational host
paths are not copied into the receipt.

```js
import {
  createNativeRebuildAttestationPayload,
  inspectNativeBuildPlan,
  inspectNativeBuildSource,
  runNativeBuild,
} from '@holoscript/holosystem';
```

`createNativeRebuildAttestationPayload` joins a verified native receipt to the
existing `holoscript.holosystem.rebuild-attestation.v1` payload. The independent
builder still signs that payload outside this package, and the substrate gate
still verifies the signature against caller-owned trust roots. The receipt
does not prove the Docker host, compiler-image supply chain, host kernel, CPU,
or organizational independence; those remain named boundaries.

This tracer commences the build/execution layer. It is not a claim that
HoloSystem already replaces measured boot, UEFI/device firmware, an ISA backend,
or physical hardware verification. Those require separate target contracts and
receipts rather than broader process execution in this API.
The adversary classes, attack specifications, test mapping, and residual trust
boundary are recorded in the [native-build threat model](./docs/native-build-threat-model.md).

### Launch a measured machine VM

`vm-launch` extends the executable tracer below the container boundary. It boots
an AMD64 Linux kernel and initramfs as a full-system q35 guest with QEMU TCG.
`vm-launch-whpx` is a separately named adapter for QEMU's Windows Hypervisor
Platform backend. The adapters do not share an accelerator switch and never
fall back to one another. Both vocabularies are deliberately closed: Windows
AMD64 host, `qemu-system-x86_64.exe`, q35, 128 MiB, one CPU, and exactly two
launches. Plans cannot provide a command, argument, environment variable,
device, network, firmware, monitor, display, or fallback setting.

`vm-launch-whpx-sandboxed` is a third, separately named vocabulary. It retains
the explicit WHPX contract and additionally launches QEMU through the measured
Windows helper shipped in this package. The helper creates a
`CreateRestrictedToken(DISABLE_MAX_PRIVILEGE)` filtered token, lowers it to low
integrity, admits at most the single Windows pass-through privilege, creates
the process suspended with an explicit three-handle allowlist, assigns it to a
kill-on-close Job Object with one-process, memory, and UI restrictions, and
only then resumes it. A private low-integrity temporary directory is the only
intended writable launch location.

`vm-launch-whpx-appcontainer` is a fourth, separately named vocabulary. It
retains those restricted-token and Job controls, gives an ephemeral Windows
AppContainer identity zero capabilities, grants that identity only read/execute
access to the measured launch snapshot and modify access to its private temp
directory, and requires file-read plus loopback-connect attack canaries to fail
before either WHPX launch begins. The plan cannot name a capability, path,
command, network mode, or fallback.

`vm-launch-appcontainer` uses the same zero-capability boundary with QEMU TCG.
It fixes the translation buffer at 64 MiB so the one-process 512 MiB Job limit
remains effective. This is the fully confined adapter proven on the validated
Windows host: it proves the machine VM and host file/network boundary, but sets
`hardwareBacked: false` and keeps hardware acceleration missing.

First measure the complete caller-owned QEMU runtime closure and both guest
artifacts:

```bash
npx holosystem vm-executor --runtime C:/absolute/path/to/qemu-runtime --json
npx holosystem vm-asset --kind kernel --file C:/absolute/path/to/vmlinuz --json
npx holosystem vm-asset --kind initrd --file C:/absolute/path/to/initramfs --json
```

Create a plan with those digests and the SHA-256 digest of the exact expected
serial success signal:

```json
{
  "schema": "holoscript.holosystem.vm-launch-plan.v1",
  "id": "demo-vm-proof",
  "host": { "os": "windows", "architecture": "amd64" },
  "executor": {
    "kind": "qemu-system",
    "binary": "qemu-system-x86_64.exe",
    "binaryDigest": "sha256:<qemu-executable-digest>",
    "runtimeDigest": "sha256:<complete-runtime-manifest-digest>"
  },
  "target": { "architecture": "amd64", "machine": "q35", "accelerator": "tcg" },
  "guest": {
    "kernelDigest": "sha256:<kernel-digest>",
    "initrdDigest": "sha256:<initrd-digest>",
    "expectedConsoleDigest": "sha256:<exact-serial-output-digest>"
  },
  "resources": { "memoryMiB": 128, "cpus": 1, "timeoutSeconds": 30 },
  "launches": 2
}
```

For WHPX, use schema `holoscript.holosystem.whpx-vm-launch-plan.v1`, set the
target accelerator to `whpx`, and add `guest.expectedDiagnosticsDigest`. That
digest pins the exact WHPX diagnostic bytes after removal of only the generated
private executor-path prefix. The WHPX adapter requires successful explicit
WHPX execution; feature labels or QEMU's compiled backend list are not treated
as proof that acceleration is usable.

```bash
npx holosystem vm-launch \
  --plan vm-launch.json \
  --runtime C:/absolute/path/to/qemu-runtime \
  --kernel C:/absolute/path/to/vmlinuz \
  --initrd C:/absolute/path/to/initramfs \
  --output vm-launch-receipt.json \
  --json
```

Use `npx holosystem vm-launch-whpx` with the same four caller-owned artifact
arguments for the WHPX schema. WHPX requires the Windows Hypervisor Platform
API exposed to QEMU; see the [QEMU WHPX documentation](https://www.qemu.org/docs/master/system/whpx.html)
and [Microsoft's Windows Hypervisor Platform API overview](https://learn.microsoft.com/en-us/virtualization/api/).

For the sandboxed adapter, use schema
`holoscript.holosystem.whpx-sandboxed-vm-launch-plan.v1`, add the following
closed field, and call `vm-launch-whpx-sandboxed`:

```json
{
  "sandbox": {
    "kind": "windows-low-integrity-job-v1",
    "launcherDigest": "sha256:<HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST>"
  }
}
```

The exported `HOLOSYSTEM_WINDOWS_SANDBOX_LAUNCHER_DIGEST` is the digest of the
package's audited launcher binary. A plan with another digest is blocked before
process creation. The launcher source and local rebuild recipe are shipped in
`native/windows-sandbox`; the measured binary is shipped in
`native/windows-x64`.

For the AppContainer adapter, use schema
`holoscript.holosystem.whpx-appcontainer-vm-launch-plan.v1`, use the same
launcher digest with sandbox kind `windows-appcontainer-deny-v1`, and call
`vm-launch-whpx-appcontainer`. The launcher creates and deletes a fresh profile
for each launch. Its closed receipt protocol must prove the child AppContainer
SID, zero capabilities, low-integrity filtered token, snapshot/temp grants,
access-denied (`5`) for a protected caller-readable file, plus either explicit
WSA access-denied (`10013`) or a bounded WFP-style packet-drop timeout (`10060`)
with no accepted live loopback connection. Any missing or changed observation
blocks the receipt.

Use schema `holoscript.holosystem.appcontainer-vm-launch-plan.v1`, target
accelerator `tcg`, the same two sandbox digests, and command
`vm-launch-appcontainer` for the software-emulated confined lane. On the
validated Windows 11 host, the WHPX AppContainer form fails closed because
Windows returns `0x80070005` when zero-capability QEMU initializes WHPX. The
package does not merge that result with the separately proven hardware-backed
low-integrity WHPX receipt.

The runner creates a private snapshot and remeasures the complete QEMU closure,
kernel, and initramfs before and after each launch. It then generates QEMU
arguments that disable user configuration, default devices, networking, USB,
display, monitor, and reboot;
passes only a minimal environment; bounds output and time; and requires both
launches to produce the pinned serial digest and fixed debug-exit code. TCG
requires no emulator diagnostics. WHPX requires the normalized diagnostic
digest pinned by its plan; unexpected bytes block the receipt. Receipts contain
only digests and byte counts, never raw console output or operational host
paths.

A verified TCG receipt includes `machine-vm-launch`,
`guest-artifact-measurement`, and `virtual-device-minimization`, reports
`hardwareBacked: false`, and leaves hardware acceleration missing. A verified
WHPX receipt additionally includes `hardware-hypervisor-acceleration` and sets
`hardwareBacked: true` only after two explicit WHPX launches succeed. Both
ambient adapters leave `host-process-isolation` missing: QEMU still has the ambient
rights of the Windows process. Receipts therefore expose
`isolation.hostProcess: "ambient-windows-process"` and
`isolation.verified: false` even when WHPX acceleration is verified. Neither
ambient adapter receipt proves an IOMMU, measured boot, firmware authenticity,
confidential memory, or side-channel resistance.

A verified `vm-launch-whpx-sandboxed` receipt includes
`host-process-isolation` only for the declared integrity, privilege,
inherited-handle, lifetime, process-count, memory, and UI scope. It deliberately
leaves `host-filesystem-confidentiality` and `host-network-isolation` missing:
low integrity prevents writes up to medium-integrity objects but does not
prevent reads, and the filtered token is not an AppContainer network capability
boundary. The sandboxed receipt also does not prove the broader hardware and
firmware properties named above. The
exact claims are in the [VM launch threat model](./docs/vm-launch-threat-model.md).

A verified `vm-launch-whpx-appcontainer` receipt additionally includes
`host-filesystem-confidentiality` and `host-network-isolation` for the tested
zero-capability AppContainer boundary. Those are scoped claims: they do not
establish QEMU provenance, host-kernel correctness, IOMMU separation, measured
boot, firmware authenticity, crash-dump custody, confidential memory, or
side-channel resistance.

A verified `vm-launch-appcontainer` receipt includes the same process,
filesystem, and network layers while leaving
`hardware-hypervisor-acceleration` missing. Receipts describe one executed
boundary, not the union of properties observed in different launches.

```js
import {
  inspectVmExecutor,
  inspectAppContainerVmLaunchPlan,
  inspectVmLaunchAsset,
  inspectVmLaunchPlan,
  inspectWindowsVmSandboxLauncher,
  inspectWhpxAppContainerVmLaunchPlan,
  inspectWhpxSandboxedVmLaunchPlan,
  inspectWhpxVmLaunchPlan,
  runVmLaunch,
  runAppContainerVmLaunch,
  runWhpxAppContainerVmLaunch,
  runWhpxSandboxedVmLaunch,
  runWhpxVmLaunch,
} from '@holoscript/holosystem';
```

## What It Creates

The default configuration pins public contracts for:

- `@holoscript/agent-runtime` for provider-neutral agent execution;
- `@holoscript/memory` for caller-owned memory;
- `@holoscript/holorepo` for JavaScript repository, database, and knowledge custody;
- `holoscript-holorepo` for the matching Python custody surface.

It also names caller-owned environment bindings for storage, memory, knowledge,
and authority. Only environment key names are stored. Credential values,
connection details, and private operator state are never configuration fields.

## API

```js
import { createHoloSystemConfig, inspectHoloSystemConfig } from '@holoscript/holosystem';

const config = createHoloSystemConfig({
  consumerId: 'acme-founder',
  workspace: 'acme',
});

const report = inspectHoloSystemConfig(config);
if (!report.ready) {
  console.error(report.errors);
  process.exitCode = 2;
}
```

`createHoloSystemConfig(options?)` returns deterministic JSON data. Callers may
supply their own exact public package contracts and caller-owned binding map.
The function fails closed when its result does not pass inspection.

`inspectHoloSystemConfig(config)` is pure and secret-safe. It reports named
checks for schema, identity, public contracts, caller bindings, portability,
bounded operations, and fresh receipt policy. Reports summarize package names,
versions, roles, and environment key names; they do not echo unknown config
values.

## CLI

```bash
# Write holosystem.config.json. Existing files require explicit --force.
npx holosystem create --id acme-founder --workspace acme

# Send the config to another agent without writing a file.
npx holosystem create --stdout

# Human-readable gate output.
npx holosystem inspect holosystem.config.json

# Machine-readable receipt. Exit code 2 means the config failed inspection.
npx holosystem inspect holosystem.config.json --json

# Produce a proposal-only next-work receipt. This does not execute or accept it.
npx holosystem farm --catalog catalog.json --portfolio portfolio.json --lineage lineage.json --json

# Pipeline input is supported.
npx holosystem create --stdout | npx holosystem inspect - --json

# Prove that Git-tracked authoring is HoloScript-only.
npx holosystem source-canon --output source-canon.hsplus --json
```

Creation never installs packages, connects to storage, acquires credentials, or
mutates services. Those actions belong to the selected public packages and the
operator's own adapters. The CLI only writes the requested configuration file;
inspection is read-only. `farm` is also proposal-only: writing its optional
receipt file is its sole mutation, and the proposal cannot claim, execute,
accept, publish, spend, or confer authority.

## Consumption Contract

Consumers bring their own configuration, credentials, Postgres storage,
knowledge and authority adapters, receipt sink, and runtime host. Environment
variables reference that caller-owned state. The package does not ship or
assume founder-local paths, private repositories, private process, a specific
machine, or a hosted provider.

The portability gate rejects:

- local, Git, URL, or floating package specs instead of pinned registry releases;
- missing npm or PyPI custody roles;
- absolute receipt paths or parent traversal;
- embedded password, secret, token, private-key, or connection-string fields;
- non-caller binding ownership;
- unbounded autonomy, missing stop conditions, or stale receipt policy.

Agent-operable evidence is the `inspect --json` receipt. Before release, run the
package check, an npm pack dry run, and the repository public-consumption gate.

## Release Boundary

Release lane: `v0-preview`. Supported behavior is deterministic config creation
and static, secret-safe portability inspection for the documented v1 schema.
Known limitations: this package does not install package dependencies, test live
credentials, bootstrap databases, claim or execute team work, accept farm
proposals, or authorize publishing. Farm output remains proposal-only and
requires independent caller authority before downstream action.
Public catalog and lineage discovery depend on caller network access and the
availability of the queried registries and endpoints. Roll back by pinning the
previous package version and retaining the consumer-owned config and receipts.
