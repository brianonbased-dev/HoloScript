# @holoscript/holosystem

Create and inspect a portable HoloSystem consumer configuration from public npm
and PyPI package contracts. The package is for external founders, agent
operators, and cold consumers who need a small bootstrap contract without a
private workspace or machine-specific defaults.

```bash
npm install @holoscript/holosystem
npx holosystem create --id acme-founder --workspace acme --json
npx holosystem inspect holosystem.config.json --json
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
Known limitations: this package does not verify registry availability, install
dependencies, test live credentials, bootstrap databases, or authorize agent
work. Roll back by pinning the previous package version and retaining the
consumer-owned config and receipts.
