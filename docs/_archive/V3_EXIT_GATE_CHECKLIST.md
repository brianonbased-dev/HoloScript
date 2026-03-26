# v3.3.0 Stabilization Exit Gate Checklist

> This checklist defines the criteria that must be met before proceeding to v3.4 feature work.

## Core Stabilization ✅

### Priority 1: Complete Critical Trait Stubs

| Trait          | Status      | Notes                                                       |
| -------------- | ----------- | ----------------------------------------------------------- |
| NetworkedTrait | ✅ Complete | SyncProtocol integration, interpolation, connection pooling |
| OpenXRHALTrait | ✅ Complete | WebXR session management, haptics, device detection         |

### Priority 2: CI/CD & Test Coverage

| Item                | Status        | Notes                                            |
| ------------------- | ------------- | ------------------------------------------------ |
| CI Pipeline         | ✅ Complete   | GitHub Actions with lint, test, build, benchmark |
| Coverage Reporting  | ✅ Complete   | Codecov integration, lcov output                 |
| Coverage Threshold  | ⚠️ 20% target | Run `pnpm test:coverage` to verify               |
| @vitest/coverage-v8 | ✅ Installed  | v4.0.18                                          |

### Priority 3: Security Audit

| Item                   | Status         | Notes                          |
| ---------------------- | -------------- | ------------------------------ |
| PartnerSDK Crypto      | ✅ Complete    | HMAC-SHA256 via Web Crypto API |
| RegistryClient         | ✅ Updated     | Proper request signing         |
| WebhookHandler         | ✅ Updated     | Secure signature verification  |
| Timing-safe comparison | ✅ Implemented | Prevents timing attacks        |

### Priority 4: Remaining Stubs

| Trait              | Status      | Notes                                               |
| ------------------ | ----------- | --------------------------------------------------- |
| HITLTrait          | ✅ Complete | Approval gates, escalation, audit logging, rollback |
| RenderNetworkTrait | ✅ Complete | Job management, GPU rendering, RNDR integration     |
| ZoraCoinsTrait     | ✅ Complete | ERC-20 minting, creator rewards, Base L2            |

## Exit Gate Criteria

### Must Pass Before v3.4

- [x] All 6 critical trait stubs implemented
- [x] CI/CD pipeline running on all PRs
- [x] Test coverage reporting configured
- [x] Test coverage ≥ 20% ✅ (38.66% statements, 39.57% lines)
- [x] No placeholder crypto in PartnerSDK
- [x] HMAC-SHA256 signatures implemented
- [x] All linting errors resolved ✅ (0 errors, 1940 warnings)
- [ ] Documentation updated in ROADMAP.md

### Recommended Before v3.4

- [ ] Coverage ≥ 40% (stretch goal) - Currently at 39.57% lines
- [ ] E2E tests for NetworkedTrait
- [ ] WebXR device compatibility matrix tested
- [ ] PartnerSDK webhook verification tested with real payloads

## Verified Status (2026-02-08)

| Metric             | Result                 |
| ------------------ | ---------------------- |
| Lint Errors        | 0 ✅                   |
| Lint Warnings      | 1940 (all `any` types) |
| Test Files         | 114 passed             |
| Total Tests        | 2562 passed, 5 skipped |
| Statement Coverage | 38.66%                 |
| Branch Coverage    | 30.6%                  |
| Function Coverage  | 40.91%                 |
| Line Coverage      | 39.57%                 |

## Verification Commands

```bash
# Run full test suite with coverage
pnpm test:coverage

# Check for linting errors
pnpm lint

# Build all packages
pnpm build

# Run benchmarks
pnpm benchmark
```

## Files Changed in v3.3.0 Sprint

### Enhanced Traits

- `packages/core/src/traits/NetworkedTrait.ts` - SyncProtocol integration
- `packages/core/src/traits/OpenXRHALTrait.ts` - WebXR session, haptics

### CI/CD

- `.github/workflows/ci.yml` - Coverage reporting
- `packages/core/vitest.config.ts` - Coverage thresholds
- `package.json` - test:coverage script

### Security

- `packages/partner-sdk/src/utils/crypto.ts` - New HMAC-SHA256 utilities
- `packages/partner-sdk/src/api/RegistryClient.ts` - Secure signatures
- `packages/partner-sdk/src/webhooks/WebhookHandler.ts` - Crypto verification
- `packages/partner-sdk/tsconfig.json` - Node.js types

### Tests

- `packages/core/src/traits/NetworkedTrait.test.ts` - SyncProtocol tests

---

**Last Updated:** v3.3.0 Stabilization Sprint
**Next Milestone:** v3.4 (March 2026) - Agentic Choreography
