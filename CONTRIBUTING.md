# Contributing to HoloScript

HoloScript is open source under the MIT license. We welcome contributions from the community.

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) before participating.

## Getting Started

```bash
git clone https://github.com/brianonbased-dev/HoloScript.git
cd HoloScript
cp .env.example .env    # Fill in your API keys
pnpm install
pnpm build
pnpm test
```

**Requirements:** Node.js >= 18, pnpm 9+

## Environment Setup

Copy `.env.example` to `.env` and fill in your keys. The `.env` file is gitignored — NEVER commit it.

**Minimum required for local development:**

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...   # For AI features
HOLOSCRIPT_API_KEY=your-key            # For MCP tool calls
```

**For full platform features (optional):**

```bash
HOLOSCRIPT_MCP_URL=https://mcp.holoscript.net
ABSORB_SERVICE_URL=https://absorb.holoscript.net
MCP_ORCHESTRATOR_URL=https://mcp-orchestrator-production-45f9.up.railway.app
HOLOMESH_API_KEY=holomesh_sk_...     # For agent identity
MOLTBOOK_API_KEY=moltbook_sk_...     # For social features
```

**Security rules:**

- NEVER hardcode API keys in source files — use `process.env` or `@holoscript/config`
- NEVER use `NEXT_PUBLIC_` prefix for secret keys — browser must not see them
- Use `@holoscript/config` auth helpers which throw if called from browser
- All authenticated requests go through Studio API routes (server-side proxy)

## Repository Structure

```
packages/
  core/           # Parser, types, traits, compiler implementations
  engine/         # Runtime: physics, animation, audio, ECS, rendering
  framework/      # Agent behaviors, AI, swarm, negotiation, training
  config/         # Centralized endpoints, auth, config validation
  uaal/           # UAAL bytecode VM for agent execution
  mcp-server/     # MCP server (tool count via /health), HoloMesh, A2A
  studio/         # Universal Point of Entry (Next.js)
  cli/            # Command-line tools
  r3f-renderer/   # React Three Fiber rendering components
  absorb-service/ # Codebase intelligence, GraphRAG
  ui/             # Shared Tailwind React components
  crdt/           # Conflict-free replicated data types
  ...             # Additional packages (verify via `ls -d packages/*/`)

services/
  absorb-service/ # Absorb host (server entry point)
  export-api/     # Render/export service

infrastructure/
  Dockerfile.*    # Per-service Docker builds
```

SSOT checks for structure and targets (run in repo root):

```bash
# Registered export targets
grep -n "export enum ExportTarget" -A 200 packages/core/src/compiler/CircuitBreaker.ts

# Compiler implementation files
find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*"

# Package/service footprint
ls -d packages/*/ services/*/
```

## What to Contribute

**High-value contributions:**

- New trait implementations (see `packages/core/src/traits/`)
- Compiler target improvements (see `packages/core/src/compiler/`)
- LSP features (completions, diagnostics, hover info)
- Documentation and examples
- Bug fixes with test coverage
- Performance improvements

**Before starting large features**, open an issue to discuss the approach.

## Utility-First Framing (not only 3D/XR)

HoloScript is a universal semantic platform. Spatial rendering is one output channel, not the whole product surface.

- **Pipelines**: `.hs` files model source → transform → sink flows that compile to service/runtime outputs.
- **Knowledge market**: HoloMesh/HoloDaemon workflows support agent contributions, discovery, and reputation loops.
- **Observability**: telemetry and tracing live in runtime/core paths (OpenTelemetry spans, diagnostics).
- **Schema mapping**: Absorb and mapping flows convert structured inputs (code/data/schema) into semantic compositions.

When writing docs or code comments, describe the problem solved first (pipeline, orchestration, schema, observability), then the optional spatial presentation.

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make changes and add tests
4. Run checks: `pnpm build && pnpm test`
5. Submit a pull request

## Repository Hygiene

- Keep generated artifacts out of the repo root (`board*.json`, transient logs, test dumps).
- If you need board/snapshot JSONs for manual workflows, regenerate them locally and keep them ignored by git.
- Ambiguous helper scripts should be moved to `scripts/debug/archive/` rather than deleted from history without review.
- Prefer explicit staging (`git add <files>`) so temporary artifacts are not committed accidentally.

## Adding a New Trait

Every trait follows the same pattern across these files:

| Step | File                               | Action                                   |
| ---- | ---------------------------------- | ---------------------------------------- |
| 1    | `core/src/types/HoloScriptPlus.ts` | Add trait interface                      |
| 2    | `core/src/constants.ts`            | Add to `VR_TRAITS` and `LIFECYCLE_HOOKS` |
| 3    | `core/src/types.ts`                | Add lifecycle hook type unions           |
| 4    | `core/src/traits/YourTrait.ts`     | Create handler with `TraitHandler<T>`    |
| 5    | `core/src/traits/VRTraitSystem.ts` | Import and register handler              |
| 6    | `core/src/index.ts`                | Export handler and types                 |
| 7    | `core/src/lsp/HoloScriptLSP.ts`    | Add completion entry                     |
| 8    | `core/src/compiler/*.ts`           | Add mappings to each compiler            |

See any existing trait file in `core/src/traits/` for the template pattern.

## Code Style

- TypeScript strict mode
- Prefer `import type` for type-only imports
- Use `as const` for literal union types
- No default exports except in trait files (convention)
- Run `pnpm lint` before submitting
- Run `pnpm format` to auto-format code with Prettier

Configuration files: `.eslintrc.json` (linting rules), `.prettierrc` (formatting), `.editorconfig` (editor settings).

## Commit Convention

Pre-commit hooks enforce conventional commits. Format: `type(scope): description`

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `release`

**Scopes:** `core`, `mesh`, `mcp`, `absorb`, `studio`, `cli`, `r3f`, `protocol`, `infra`, `ci`, `security`, `economy`, `lsp`

**Rules:**

- Subject line max 72 characters
- `git add <specific-files>` only — NEVER `git add -A` or `git add .`
- Run tests before committing: `pnpm test`

## File Formats

HoloScript has three source formats — use the right one:

| Format    | Purpose                                       | Example              |
| --------- | --------------------------------------------- | -------------------- |
| `.holo`   | Scene compositions, spatial worlds, templates | storefront.holo      |
| `.hsplus` | Agent behaviors, state machines, governance   | planner-agent.hsplus |
| `.hs`     | Data pipelines (source → transform → sink)    | inventory-sync.hs    |

Spatial keywords (`environment`, `object`, `template`) produce a SyntaxError in `.hs` pipeline files. Use `.holo` for scenes.

## Testing Guidelines

All code changes must include tests. Use these patterns established in Phase 4:

### Test Organization

```typescript
describe('Module Name', () => {
  describe('Feature Group', () => {
    it('should test specific behavior', () => {
      // Arrange: Set up test data
      const input = createTestInput();

      // Act: Execute the function
      const result = executeFunction(input);

      // Assert: Verify the result
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

### Test File Naming

- `{Module}.test.ts` - Unit tests for a module
- `{Module}.comprehensive.test.ts` - Integration and advanced tests
- `{Module}.performance.test.ts` - Performance benchmarks (rarely used)

### Coverage Requirements by Test Type

**1. Unit Tests** - For isolated function behavior

```typescript
describe('Parser', () => {
  it('should parse valid composition', () => {
    const code = 'composition "test" { }';
    const result = parse(code);
    expect(result.name).toBe('test');
  });

  it('should throw on invalid syntax', () => {
    const code = 'invalid syntax !@#';
    expect(() => parse(code)).toThrow();
  });
});
```

**2. Integration Tests** - For pipeline validation (see `Integration.comprehensive.test.ts`)

```typescript
describe('Parser-to-Compiler Pipeline', () => {
  it('should preserve data through compilation', () => {
    const input = createComposition();
    const parsed = parser.parse(input);
    const compiled = compiler.compile(parsed);

    expect(compiled.metadata).toEqual(parsed.metadata);
  });
});
```

**3. Edge Case Tests** - For boundary conditions (see `ParserEdgeCases.test.ts`)

```typescript
describe('Parser Edge Cases', () => {
  it('should handle maximum nesting level', () => {
    const nested = generateNesting(15); // At architectural limit
    const result = parse(nested);
    expect(result).toBeDefined();
  });

  it('should fail gracefully beyond limits', () => {
    const nested = generateNesting(20); // Beyond limit
    expect(() => parse(nested)).toThrow();
  });
});
```

**4. Platform-Specific Tests** - For target code generation (see `TargetSpecific.comprehensive.test.ts`)

```typescript
describe('Python Code Generation', () => {
  it('should generate valid Python type hints', () => {
    const python = compiler.generatePython(ast);
    expect(python).toContain(':'); // Type annotation marker
    expect(isPythonValid(python)).toBe(true);
  });
});
```

### Coverage Targets

- **Minimum:** 80% for new code (lines, branches, functions)
- **Target:** 90%+ for critical paths (parser, compiler, traits)
- **Aspirational:** 100% for public APIs

Run coverage analysis:

```bash
pnpm vitest run --coverage
```

### Test Execution

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm vitest run src/__tests__/MyTest.test.ts

# Run with coverage
pnpm vitest run --coverage

# Run Phase 4 comprehensive tests only
pnpm vitest run \
  src/__tests__/ParserEdgeCases.test.ts \
  src/__tests__/AdvancedFeatures.comprehensive.test.ts \
  src/__tests__/CompilerArchitecture.test.ts \
  src/__tests__/Integration.comprehensive.test.ts \
  src/__tests__/TargetSpecific.comprehensive.test.ts
```

### Known Test Limitations

Three edge cases in ParserEdgeCases.test.ts are expected to fail (non-blocking):

1. Deep nesting (>15 levels) - Parser architectural constraint
2. Negative number literals in certain contexts - Expected workaround: use unary operator
3. Multiple event declarations on same object - Expected: use event bus pattern instead

See `PHASE_4_COMPLETION_REPORT.md` for details.

## Commit Messages

Use conventional commits with canonical scopes:

**Types:**

- `feat:` New feature or trait
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code restructuring
- `test:` Test additions
- `chore:` Build/tooling changes
- `ci:` CI/CD pipeline changes

**Canonical scopes** (use these, not aliases):

| Scope      | Package / Area                                        | NOT these                         |
| ---------- | ----------------------------------------------------- | --------------------------------- |
| `core`     | `@holoscript/core` — parser, types, traits, compilers |                                   |
| `mesh`     | HoloMesh — social network, CRDT, gossip, teams        | `holomesh`                        |
| `mcp`      | `@holoscript/mcp-server` — MCP tools, HTTP routes     | `mcp-server`                      |
| `absorb`   | `@holoscript/absorb-service` — GraphRAG, embeddings   | `absorb-service`, `absorb-engine` |
| `studio`   | `@holoscript/studio` — Next.js app, pages             | `studio+holo`                     |
| `cli`      | `@holoscript/cli` — command-line tools                |                                   |
| `r3f`      | `@holoscript/r3f-renderer` — React Three Fiber        | `r3f-renderer`                    |
| `protocol` | Publishing protocol — provenance, registry, revenue   |                                   |
| `infra`    | Dockerfiles, Railway, deployment configs              | `docker`                          |
| `ci`       | GitHub Actions, CI workflows                          |                                   |
| `security` | Security fixes, sandbox, auth                         |                                   |
| `economy`  | Payments, budgets, revenue, subscriptions             | `monetization`                    |
| `lsp`      | Language Server Protocol                              |                                   |

**Rules:**

- One scope per commit. `feat(mesh):` not `feat(mesh, mcp):`
- One concern per commit. If you write "and" in the subject, split into two commits.
- Subject line max 72 characters. Use the body for detail.
- Separate `test:` commits from `feat:` when adding tests alongside features.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Commercial Ecosystem

HoloScript is fully open source. The commercial products **Hololand** (platform) and **Infinity Assistant** (AI) are built on top of HoloScript and are separately maintained. See the [NOTICE](./NOTICE) file for details.

## AI Agent Documentation Standards

When AI agents (Claude, Cursor, GitHub Copilot, etc.) generate documentation or session summaries, follow these rules to prevent doc sprawl:

### What Goes Where

| Content Type                           | Location                           | Naming                                     |
| -------------------------------------- | ---------------------------------- | ------------------------------------------ |
| User-facing guides                     | `docs/guides/`                     | `lowercase-kebab-case.md`                  |
| Trait reference updates                | `docs/traits/`                     | Per-category file (e.g., `interaction.md`) |
| Compiler docs                          | `docs/compilers/`                  | Per-target file (e.g., `unity.md`)         |
| Session notes / implementation reports | `docs/_archive/session-notes/`     | Any name                                   |
| Phase implementation guides            | `docs/_archive/phase-guides/`      | Any name                                   |
| Feature planning docs                  | `docs/_archive/planning/`          | Any name                                   |
| Status updates                         | GitHub Issues or PRs — not in docs | N/A                                        |

### Naming Rules

- **User-facing docs**: Always `lowercase-kebab-case.md`
- **UPPERCASE filenames** (e.g., `PHASE_1_2_IMPLEMENTATION_GUIDE.md`) are NEVER valid for user-facing docs
- **Internal/AI session notes**: Must be placed in `docs/_archive/` (excluded from VitePress nav)

### VitePress Sidebar Requirement

Every new user-facing doc file added to `docs/` **must** also be added to the sidebar in `docs/.vitepress/config.ts`. If it's not in the sidebar, it's not discoverable.

### CI Enforcement

The docs build (`pnpm docs:build`) will fail on dead links. Do not add placeholder links to the sidebar without the corresponding file.

---

## PR Policy

This repo is AI-first — most features and fixes arrive via agent-authored commits.

**When a PR is required:**

- Any change touching **10+ files** or **3+ packages**
- Security-sensitive changes (auth, sandbox, crypto)
- Breaking changes to public APIs or trait interfaces
- Dependency major version upgrades

Even self-merged PRs create an audit trail and force CI to run before code lands on `main`. Small fixes (1-9 files, single package) may go direct to `main`.

**Review cadence:**

| Type                     | Cadence                                 | SLA                   |
| ------------------------ | --------------------------------------- | --------------------- |
| Security patches (CVE)   | Immediate                               | < 24 h                |
| Dependabot patch / minor | Weekly (Mondays)                        | < 7 days              |
| Dependabot major version | Monthly review                          | > 7 days (deliberate) |
| Human feature PR         | Rolling — review within 3 business days | —                     |
| Human bug fix            | Rolling — review within 1 business day  | —                     |

## Release Cadence

Tag a release when a **meaningful milestone** ships — not per-sprint, not per-commit.

**What triggers a release:**

- New HoloMesh version (V-level feature set)
- New compiler backend or compile target
- Security fix that affects deployed services
- Breaking change to trait interfaces or MCP tool signatures
- 50+ commits accumulated since last tag

**How to release:**

```bash
# 1. Ensure CHANGELOG.md has a dated entry for this version
# 2. Bump version in package.json files (or use pnpm version:minor)
# 3. Tag and push
git tag vX.Y.Z
git push origin vX.Y.Z
# 4. Create GitHub Release with notes from CHANGELOG
gh release create vX.Y.Z --title "vX.Y.Z — Release Name" --notes-file RELEASE_NOTES.md
```

**Versioning rules:**

- **Major** (X.0.0): Breaking trait interface changes, package restructuring
- **Minor** (0.X.0): New features, new MCP tools, new compile targets
- **Patch** (0.0.X): Bug fixes, security patches, doc fixes
- Never retroactively write multiple versions on the same date

### Dependabot Merge Policy

| Category                     | Policy                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security CVE (any level)     | Merge immediately after CI passes                                                                                                                               |
| Patch bumps (`z` in `x.y.z`) | Merge on weekly sweep if CI is green                                                                                                                            |
| Minor bumps                  | Merge on weekly sweep; skim changelog first                                                                                                                     |
| `next` major version         | Require an explicit tracking issue and migration plan                                                                                                           |
| `uuid` major (CJS→ESM)       | Verify all import sites use ESM syntax first, then merge                                                                                                        |
| `storybook` major            | Run `npx storybook@latest upgrade` — do **not** merge fragmented Dependabot PRs individually; they must be coordinated (all `@storybook/*` at the same version) |

### Pre-commit Hook Notes

The pre-commit hook runs a fast subset of tests (`pnpm vitest run src/__tests__/HoloScriptValidator`) rather than the full 44K-test suite to avoid OOM. Full suite validation happens in CI.

If you need to bypass the hook for an emergency fix:

```bash
# Only use --no-verify for truly unblocking scenarios; CI must still pass
git commit --no-verify -m "fix: ..."
```

---

## Questions?

- Open an [issue](https://github.com/brianonbased-dev/holoscript/issues)
- Visit [infinityassistant.io](https://infinityassistant.io) for AI-powered help
