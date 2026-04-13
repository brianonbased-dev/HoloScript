# @holoscript/connector-core — Roadmap

## Current State
- Base abstractions: `ServiceConnector`, `McpRegistrar`, `CredentialVault`, `DeploymentPipeline`
- Every connector extends `ServiceConnector` for lifecycle and tool registration
- `McpRegistrar` registers tools on the orchestrator but uses placeholder URLs
- `CredentialVault` interface exists but zero connectors implement it (all use `process.env`)

## Next (v1.1)
- [ ] `EnvCredentialVault` — wraps `process.env` with typed key validation and missing-key errors
- [ ] `KeyringCredentialVault` — delegates to OS keychain (macOS Keychain, Windows Credential Manager, libsecret)
- [ ] Shared retry/backoff utility (`withRetry(fn, { maxAttempts: 3, backoffMs: 1000 })`)
- [ ] Standardized error types: `ConnectorAuthError`, `ConnectorTimeoutError`, `ConnectorRateLimitError`
- [ ] `HealthCheckMixin` — uniform `/health` response shape all connectors must implement
- [ ] `ConnectorTestHarness` — mock server, credential stub, tool registration assertions
- [ ] Fix `McpRegistrar` to resolve actual service URLs from orchestrator `/servers` endpoint

## Future (v2.0)
- [ ] `CloudKmsCredentialVault` — AWS KMS / GCP KMS / Azure Key Vault rotation support
- [ ] Circuit breaker pattern (`withCircuitBreaker(fn, { failureThreshold: 5, resetMs: 30000 })`)
- [ ] Structured logging interface with correlation IDs across connector calls
- [ ] OpenTelemetry tracing spans for every tool invocation
- [ ] Connector capability negotiation — connectors declare what they support, orchestrator routes accordingly
- [ ] Shared rate limiter (token bucket) that connectors configure per-service

## Integration Goals
- [ ] All 6 connectors migrate from raw `process.env` to `CredentialVault` by v1.1
- [ ] `ConnectorTestHarness` used in every connector's test suite — no more ad-hoc mocking
- [ ] Orchestrator registration uses live URLs verified via health check, not placeholders
- [ ] Error types flow through MCP tool responses so clients get structured failures, not strings
