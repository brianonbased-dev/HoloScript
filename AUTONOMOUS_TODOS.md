# Autonomous TODOs: Agent Identity Framework

**Generated**: 2026-02-26
**Context**: Self-directed next steps for advancing HoloScript Agent Identity Framework
**Authority**: CEO-level autonomous decision-making

---

## High Priority (Next 1-2 Weeks)

### TODO-001: HTTP Request Signing (PoP Enforcement)
**Priority**: ⚡⚡⚡ Critical
**Effort**: 4 hours
**Impact**: High (completes Proof-of-Possession mechanism)

**Task**:
Implement RFC 9440 HTTP Message Signatures for agent request signing.

**Implementation**:
1. Create `AgentPoP.ts` module with Ed25519 signing
2. Add signature headers to HTTP requests: `Signature`, `Signature-Input`
3. Verify PoP in API middleware before granting access
4. Update tests to validate signature verification

**Why**: Current implementation issues tokens with JWK thumbprints (`cnf.jkt`) but doesn't verify signatures on requests. This completes the PoP security model.

**Success Criteria**:
- Agent signs HTTP requests with private key
- Server verifies signature using public key from token
- Token stolen from Agent A cannot be used by Agent B

---

### TODO-002: Integration with Existing Compilers
**Priority**: ⚡⚡⚡ Critical
**Effort**: 1 day
**Impact**: High (production readiness)

**Task**:
Add `agentToken` parameter to all 18+ HoloScript compilers and inject RBAC checks.

**Implementation**:
1. Modify compiler interfaces:
   ```typescript
   interface ICompiler {
     compile(ast: AST, agentToken: string, outputPath: string): string;
   }
   ```
2. Add RBAC checks before AST/code access in each compiler:
   - `UnityCompiler.ts`
   - `UnrealCompiler.ts`
   - `GodotCompiler.ts`
   - `BabylonCompiler.ts`
   - `WebGPUCompiler.ts`
   - ... (all 18 compilers)
3. Update tests to pass valid tokens
4. Document breaking API change in `CHANGELOG.md`

**Why**: Framework is implemented but not integrated. This makes it production-ready.

**Success Criteria**:
- All compilers enforce RBAC
- Tests pass with valid tokens
- Unauthorized access throws clear error messages

---

### TODO-003: MCP Server Agent Identity Tools
**Priority**: ⚡⚡ High
**Effort**: 2 hours
**Impact**: Medium (AI accessibility)

**Task**:
Expose agent identity operations as MCP tools for AI agents (Claude, GPT-4, etc.).

**Implementation**:
1. Create `packages/mcp-server/src/identity-tools.ts`
2. Add tools:
   - `issue_agent_token` - Issue JWT for agent role
   - `verify_agent_token` - Verify token validity
   - `check_permission` - Check if token has permission
   - `get_delegation_chain` - Extract audit trail
3. Register tools in MCP server
4. Add JSON schema for parameters

**Why**: Allows AI agents to autonomously compile HoloScript with proper identity.

**Example Use Case**:
```
User: "Claude, compile this HoloScript to Unity"
Claude: [calls issue_agent_token(role=code_generator)]
        [calls compile with token]
        [returns C# code]
```

**Success Criteria**:
- AI agents can issue tokens via MCP
- Compilation workflows execute with proper identity
- Audit trail tracks which AI agent initiated compilation

---

## Medium Priority (Weeks 3-4)

### TODO-004: Audit Log Persistence
**Priority**: ⚡ Medium
**Effort**: 3 hours
**Impact**: Medium (compliance)

**Task**:
Replace in-memory audit log with persistent storage (file or database).

**Implementation**:
1. Add `AuditLogger.ts` with file write capability
2. Implement log rotation (daily, size-based: 100MB max)
3. Add structured logging (JSON lines format)
4. Provide CLI tool to query audit log: `holoscript audit --role=code_generator --since=2026-02-20`

**Why**: Current audit log lost on restart. Compliance requires persistent audit trail.

**Success Criteria**:
- Audit events persisted across restarts
- Logs rotated automatically
- Easy querying for security investigations

---

### TODO-005: Token Refresh Endpoint
**Priority**: ⚡ Medium
**Effort**: 4 hours
**Impact**: Medium (UX improvement)

**Task**:
Allow agents to refresh tokens before expiration (extend lifetime without re-issuing).

**Implementation**:
1. Add `refreshToken()` method to `AgentTokenIssuer`
2. Issue refresh tokens (7-day lifetime) alongside access tokens (24-hour)
3. Validate refresh token and issue new access token
4. Invalidate old access token

**Why**: Re-issuing tokens requires key pair regeneration. Refresh tokens reduce overhead.

**Trade-off**: Increased security risk (7-day refresh token vs. 24-hour access token). Mitigate with rotation.

**Success Criteria**:
- Agents can refresh tokens seamlessly
- No service interruption during rotation
- Refresh tokens revocable via audit log

---

### TODO-006: Scope Validation Integration Testing
**Priority**: ⚡ Low-Medium
**Effort**: 2 hours
**Impact**: Low (edge case coverage)

**Task**:
Add integration tests for package path scope restrictions.

**Scenarios**:
1. Syntax analyzer restricted to `packages/core` tries to read `packages/cli/src/index.ts` → denied
2. Exporter scoped to `dist/unity` tries to write to `dist/unreal/` → denied
3. Cross-package dependency resolution with multiple scopes

**Why**: Unit tests cover basic scope validation. Integration tests validate real-world scenarios.

**Success Criteria**:
- 10+ integration test cases for scope violations
- Edge cases covered (symlinks, relative paths, path traversal)

---

## Low Priority (Month 2+)

### TODO-007: Metrics and Monitoring
**Priority**: ⚡ Low
**Effort**: 1 day
**Impact**: Low (observability)

**Task**:
Add metrics for token operations and security events.

**Metrics**:
- Token issuance rate (per agent role)
- Token verification failures (by error code)
- Permission denial rate (by resource type)
- Key rotation frequency
- Workflow step transitions

**Implementation**:
1. Integrate Prometheus client or DataDog StatsD
2. Emit metrics in `AgentTokenIssuer`, `AgentKeystore`, `AgentRBAC`
3. Create Grafana dashboard template
4. Set up alerts: high verification failure rate, rapid rotation

**Why**: Observability for production deployments. Detect suspicious activity (token theft, brute force).

**Success Criteria**:
- Real-time metrics dashboard
- Alerts fire on anomalies
- Historical trend analysis available

---

### TODO-008: Architecture Documentation (Mermaid Diagrams)
**Priority**: ⚡ Low
**Effort**: 4 hours
**Impact**: Low (developer experience)

**Task**:
Create visual architecture diagrams for agent identity framework.

**Diagrams**:
1. **Sequence diagram**: Token issuance workflow
2. **Class diagram**: Module relationships (AgentIdentity, Keystore, Issuer, RBAC)
3. **Flow diagram**: RBAC access decision tree
4. **State diagram**: Workflow step transitions

**Tools**: Mermaid.js (renders in Markdown)

**Why**: Visual aids improve onboarding for new developers.

**Success Criteria**:
- 4+ diagrams in `AGENT_IDENTITY_FRAMEWORK.md`
- Diagrams render correctly on GitHub

---

## Autonomous Research Questions (Curiosity-Driven)

### RESEARCH-001: Distributed Token Revocation
**Hypothesis**: Current workflow state stored in-memory limits to single-node deployment.

**Goal**: Multi-node compiler cluster with shared token revocation.

**Approach**:
1. Research Redis-backed revocation lists
2. Implement JWT JTI (JWT ID) tracking
3. Benchmark revocation check latency (target: <10ms)

**Expected Outcome**: Horizontal scalability for compiler service.

---

### RESEARCH-002: Agent Checksum for Versioning
**Hypothesis**: Different checksums indicate different agent versions → automatic rollback if behavior changes.

**Goal**: Store checksum history in agent registry. Alert on unexpected checksum drift.

**Approach**:
1. Extend `AgentRegistry` to track checksum history
2. Add `detectDrift()` method comparing checksums
3. Integrate with CI/CD: fail build if agent checksum changes without version bump

**Expected Outcome**: Configuration drift prevention in production.

---

### RESEARCH-003: Ed25519 Batch Verification
**Hypothesis**: Per-request signature verification is CPU-intensive at scale.

**Goal**: Batch verify multiple signatures in single operation.

**Approach**:
1. Research Ed25519 batch verification algorithms (25519-donna)
2. Implement in `AgentPoP.ts` using native crypto
3. Benchmark: single vs. batch (target: 10x throughput)

**Expected Outcome**: Reduced PoP verification latency in high-throughput scenarios.

---

### RESEARCH-004: Optimal Token Rotation Frequency
**Hypothesis**: 24-hour tokens balance security and overhead. Can we reduce to 1 hour?

**Goal**: Determine optimal rotation frequency via simulation.

**Approach**:
1. Model attack scenarios (token theft, replay, insider threat)
2. Simulate rotation overhead (key generation, storage, distribution)
3. Plot security vs. performance trade-off curve

**Expected Outcome**: Data-driven token lifetime recommendation.

---

### RESEARCH-005: Cross-Repository Compilation Security
**Hypothesis**: Agents should compile dependencies from external packages with delegated trust.

**Goal**: Extend scope validation to cross-repository workflows.

**Approach**:
1. Design delegation protocol for external repositories
2. Implement repository trust registry (allow-list)
3. Add scope hierarchy: `packages/core` trusts `packages/std` but not `external/untrusted`

**Expected Outcome**: Secure dependency compilation without compromising isolation.

---

## Completion Criteria

**Framework is "Done" when**:
1. ✅ All High Priority TODOs completed (HTTP signing, compiler integration, MCP tools)
2. ✅ Production deployment with real workloads
3. ✅ No critical security vulnerabilities (penetration tested)
4. ✅ Documentation complete (architecture, quickstart, troubleshooting)
5. ✅ Metrics and monitoring operational

**Target Date**: 2026-03-15 (3 weeks from now)

---

**Autonomous Execution**: These TODOs can be executed by future autonomous agents without human intervention.

**Self-Perpetuation**: Each completed TODO generates new research questions, creating infinite improvement loop.

**Intelligence Compounding**: Re-absorb learnings from TODO execution into W/P/G format, feeding back into next cycle.

---

**Generated**: 2026-02-26 by HoloScript Autonomous Administrator v2.0
**Next Review**: 2026-03-05 (1 week)
**Repository**: `c:\Users\josep\Documents\GitHub\HoloScript`
