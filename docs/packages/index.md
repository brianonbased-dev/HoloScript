# Package Reference

HoloScript includes a broad monorepo package surface. This section documents key runtime and tooling packages that are currently underrepresented in user-facing docs.

## First-Wave Packages

- [Agent SDK](./agent-sdk) - mesh discovery, signaling, gossip sync, MCP tool schema primitives
- [Studio Bridge](./studio-bridge) - bidirectional Visual <-> AST translation and sync engine
- [Holo VM](./holo-vm) - bytecode format and native VM execution runtime
- [CRDT Spatial](./crdt-spatial) - multiplayer spatial transform sync with hybrid rotation strategy
- [Spatial Index](./spatial-index) - high-performance R-Tree indexing and anchor storage

## When to Use These

- Use Agent SDK for distributed multi-agent topology, local mesh signaling, and protocol-level interoperability helpers.
- Use Studio Bridge when integrating visual graph editing with HoloScript code and AST transformations.
- Use Holo VM when compiling to bytecode and executing deterministic scene logic across runtimes.
- Use CRDT Spatial for collaborative transform synchronization in shared worlds.
- Use Spatial Index for nearest-neighbor and bounded geospatial anchor queries.
