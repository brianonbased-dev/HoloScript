# @holoscript/narupa-plugin

Narupa process, orchestration, database, and Unity-target helpers for external
drug-discovery simulations and agent-framework consumers.

## Install

```bash
npm install @holoscript/narupa-plugin @holoscript/core
```

## Use

```js
import { NarupaProcessManager, VERSION } from '@holoscript/narupa-plugin';

const manager = new NarupaProcessManager();
console.log(VERSION, manager.status);
```

Configuration, Narupa endpoints, processes, datasets, credentials, approval
policy, storage, and experiment receipts are caller-owned. The package does not
assume a private workspace, founder machine, database, or bundled local adapter.

## Validation

Run `npm run build` and `npm test` before deployment. Operators should capture
their own process and scientific-result receipts; an import is not evidence of
a completed molecular simulation.

## Release Boundary

This package is `v0-preview`. Process and orchestration helpers are supported;
scientific validity, remote process recovery, Unity runtime availability, and
production rollback remain caller responsibilities.

## License

MIT
