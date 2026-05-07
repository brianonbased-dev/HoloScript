# March 2026 Stale Build Artifacts

This folder holds local March 2026 build and TypeScript error captures that used
to sit in `services/holoscript-net/`.

Archived files:

- `build_error.log`
- `build_error_2.log`
- `tsc_errors.txt`
- `build_log.txt`
- `build.log`
- `error.log`
- `out.log`
- `ts_error.txt`
- `tsc_errors_cmd.txt`
- `vite_error.txt`

These are not current validation results. For current holoscript.net service
health, run:

```bash
pnpm --filter @holoscript/net-service run build
```
