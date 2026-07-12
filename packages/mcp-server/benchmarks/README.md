# Public consumer benchmark

`public-consumer-baseline.json` is the frozen npm-consumer observation for
`@holoscript/mcp-server@8.0.12`. It is intentionally red: root ESM and CJS
imports loaded, retained two cleanup timers, and failed to settle within the
bound. The packaged HTTP executable remained healthy.

The release gate creates a fresh project outside the workspace, installs the
packed package with npm, and independently checks:

- install wall time, package bytes, dependency nodes, and peer warnings;
- root and `./service` import settlement in ESM and CJS;
- persistent process resources after each import;
- packaged `holoscript-mcp-http` startup and `/health` response.

Run the comparison after building:

```bash
pnpm run test:public-consumer
```

Do not replace the baseline with a newer green release. Add a new named
baseline only when the benchmark environment or contract changes, and explain
the reason in this directory.
