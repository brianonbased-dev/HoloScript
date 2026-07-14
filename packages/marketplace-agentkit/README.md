# @holoscript/marketplace-agentkit

Fail-closed Coinbase CDP wallet primitives for HoloScript marketplace agents.
The package ships compiled ESM and TypeScript declarations for ordinary npm
consumers. It does not assume founder paths, private infrastructure, or bundled
credentials.

## Install

```bash
npm install @holoscript/marketplace-agentkit
```

## Live wallet

```js
import { CdpEvmWalletProvider } from '@holoscript/marketplace-agentkit';

const wallet = await CdpEvmWalletProvider.configureWithWallet({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET,
  networkId: 'base-sepolia',
});
```

`AgentWalletService` defaults to live mode and refuses to initialize without
all three CDP credentials. Its x402 convenience method and the higher-level
`AgentKitIntegration` transaction helpers are simulation-only until an audited
live settlement adapter is supplied.

## Explicit simulation

```js
import { AgentWalletService } from '@holoscript/marketplace-agentkit';

const wallet = new AgentWalletService('base-sepolia', { mode: 'simulation' });
await wallet.initialize();
```

Simulation results are labeled with `simulated: true`; they are not payment or
custody receipts. Never use simulation mode as evidence of a live transaction.

## Release boundary

This package is a `v0-preview` integration. The exported wallet primitives and
fail-closed credential checks are supported; live settlement, rollback, and
provider-specific recovery remain the caller's responsibility and require
external custody receipts.

## Custody boundary

- Credentials remain caller-owned options or environment variables.
- The package never returns or logs credential values.
- Live transfers should be authorized and verified by the caller's custody and
  receipt policy before they are treated as complete.
