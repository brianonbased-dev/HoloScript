# CRDT

**Authenticated conflict-free replicated data types for distributed agent and world state.**

## Overview

`@holoscript/crdt` provides signed replicated data structures for distributed synchronization, especially where multiple agents or sessions need to coordinate shared state safely.

## Installation

```bash
npm install @holoscript/crdt
```

## Use When

- Multiple users or agents edit shared state.
- You need mergeable distributed state.
- You want authentication and signing around synchronization flows.

## Key Capabilities

- CRDT primitives for concurrent updates.
- Authenticated synchronization workflows.
- Good foundation for collaboration and agent state exchange.

## See Also

- [CRDT Spatial](./crdt-spatial.md)
- [MVC Schema](./mvc-schema.md)
- [Collab Server](./collab-server.md)
