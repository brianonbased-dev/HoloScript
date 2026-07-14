# @holoscript/net-service

Installable HoloScript web service for the public site, native client assets,
health endpoint, and MCP-backed service routes. It is intended for external
operators and agents that want to run the service in their own environment.

## Install

```bash
npm install @holoscript/net-service
```

## Run

```bash
PORT=3001 node node_modules/@holoscript/net-service/dist/server/server.js
```

Check `GET /health` for the JSON service receipt. The package resolves static
assets relative to its installed package directory, not the caller's current
workspace.

## Operator Boundary

Deployment configuration, credentials, storage, HoloKey custody, network policy,
and service supervision are caller-owned. The package does not ship private
workspace paths, private telemetry, or founder credentials. A local adapter or
deployment platform may provide those inputs without changing the package
contract.

## Validation

Maintainers run:

```bash
pnpm --filter @holoscript/net-service run build
pnpm --filter @holoscript/net-service run test
```

Release validation also packs the public file set and starts the installed
service in an isolated consumer before accepting its health receipt.

## Release Boundary

This service is `v0-preview`. The installed startup and health contract are
supported. Hosted availability, live MCP dependencies, rollback, and durable
recovery remain operator responsibilities and require separate deployment
receipts.

## License

MIT
