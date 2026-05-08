# OpenUSD Examples

## Industrial Factory Cell

`industrial-factory-cell.holo` is the HoloScript source companion for the
OpenUSD conformance fixture in `@holoscript/openusd-plugin`.

It models a small factory cell with conveyor, motor, sensor, safety, robot, and
inspection-light semantics. The OpenUSD fixture exports matching primitives with
`holo:*` custom attributes so Omniverse/OpenUSD ingestion can preserve:

- source object paths
- digital-twin IDs
- telemetry channel names
- simulation contract receipts
- a deterministic root semantic hash

Validation:

```bash
pnpm exec holoscript parse examples/openusd/industrial-factory-cell.holo
pnpm --filter @holoscript/openusd-plugin test
```
