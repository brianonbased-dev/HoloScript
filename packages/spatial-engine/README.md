# spatial-engine

Native spatial engine for HoloScript built on Bevy. Provides the core 3D runtime with persistence (Postgres, Redis, Neo4j), networking (WebSockets), and formal verification (Z3).

## Usage

```bash
cargo build
```

Requires external services: PostgreSQL, Redis, and Neo4j for full functionality.

## Development

```bash
cargo build
cargo test
cargo run
```
