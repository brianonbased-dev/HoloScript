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
portable package directories. Unknown lineage remains a named gap; local source
paths are never emitted. `catalog` performs public GitHub, service, container,
MCP-health, and public-skill discovery, then joins those results with the
caller's package admission, lineage, proof-batch, and promotion receipts.

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
HoloSystem already replaces a hypervisor, measured boot, UEFI/device firmware,
an ISA backend, or physical hardware verification. Those require separate
target contracts and receipts rather than broader process execution in this API.
The adversary classes, attack specifications, test mapping, and residual trust
boundary are recorded in the [native-build threat model](./docs/native-build-threat-model.md).

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

# Pipeline input is supported.
npx holosystem create --stdout | npx holosystem inspect - --json
```

Creation never installs packages, connects to storage, acquires credentials, or
mutates services. Those actions belong to the selected public packages and the
operator's own adapters. The CLI only writes the requested configuration file;
inspection is read-only.

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
credentials, bootstrap databases, claim team work, or authorize publishing.
Public catalog and lineage discovery depend on caller network access and the
availability of the queried registries and endpoints. Roll back by pinning the
previous package version and retaining the consumer-owned config and receipts.
