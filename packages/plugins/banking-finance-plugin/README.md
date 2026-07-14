# @holoscript/plugin-banking-finance

Deterministic banking and finance trait handlers for external HoloScript
simulations, founders, and policy-controlled agent workflows.

## Install

```bash
npm install @holoscript/plugin-banking-finance @holoscript/core
```

## Use

```js
import { createRiskModelHandler, pluginMeta } from '@holoscript/plugin-banking-finance';

const riskModel = createRiskModelHandler();
console.log(pluginMeta.version, riskModel);
```

Callers own account data, KYC evidence, transaction authorization, settlement,
credentials, storage, and audit receipts. The package does not connect to a bank,
move funds, or assume founder-local infrastructure.

## Validation

Run `npm run build` and `npm test` to check the compiled handlers. Financial
decisions require caller-owned policy, verification, and receipts beyond this
package's deterministic simulation contract.

## Release Boundary

This package is `v0-preview`. Trait state transitions and deterministic solvers
are supported; banking connectivity, regulatory compliance, custody, rollback,
and real settlement are unsupported and remain operator responsibilities.

## License

MIT
