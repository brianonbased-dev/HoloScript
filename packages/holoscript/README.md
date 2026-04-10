# @holoscript/sdk

HoloScript Smart Asset SDK and HoloHub client integration.

## Installation

```bash
npm install @holoscript/sdk
```

## Overview

This package provides the SDK for creating and managing HoloScript Smart Assets and interacting with the HoloHub platform. It is **not** a CLI toolkit — for CLI tools, see [`@holoscript/cli`](../cli/README.md).

## Usage

```typescript
import { HoloSmartAsset, HoloHubClient } from '@holoscript/sdk';
```

### Smart Assets

Create and manage smart assets with schema validation powered by Zod:

```typescript
import { HoloSmartAsset } from '@holoscript/sdk';

const asset = new HoloSmartAsset({
  name: 'Interactive Cube',
  traits: ['@grabbable', '@physics'],
  geometry: 'cube',
});
```

### HoloHub Client

Connect to the HoloHub platform for asset publishing and discovery:

```typescript
import { HoloHubClient } from '@holoscript/sdk';

const client = new HoloHubClient({
  apiKey: process.env.HOLOHUB_API_KEY,
});
```

## Related Packages

- [`@holoscript/core`](../core/README.md) - Parser, compiler, and runtime
- [`@holoscript/cli`](../cli/README.md) - Command-line tools (`holoscript build`, `holoscript run`, etc.)
- [`@holoscript/mcp-server`](../mcp-server/README.md) - MCP tools for AI agents

## License

MIT
