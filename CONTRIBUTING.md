# Contributing to HoloScript

HoloScript is open source under the MIT license. We welcome contributions from the community.

Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) before participating.

## Getting Started

```bash
git clone https://github.com/brianonbased-dev/Holoscript.git
cd HoloScript
pnpm install
pnpm build
pnpm test
```

**Requirements:** Node.js >= 18, pnpm 8+

## Repository Structure

```
packages/
  core/           # Parser, types, traits, compilers, LSP
  runtime/        # React Three Fiber execution engine
  cli/            # Command-line tools
  lsp/            # Language Server Protocol server
  formatter/      # Code formatter
  linter/         # Static analysis
  std/            # Standard library
  vscode-extension/ # VS Code extension
  ...             # 20+ additional packages
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

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make changes and add tests
4. Run checks: `pnpm build && pnpm test`
5. Submit a pull request

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

For VR development patterns, see the [Best Practices Guide](./docs/guides/best-practices.md).

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

Use conventional commits:

- `feat:` New feature or trait
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code restructuring
- `test:` Test additions
- `chore:` Build/tooling changes

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

## Questions?

- Open an [issue](https://github.com/brianonbased-dev/holoscript/issues)
- Visit [infinityassistant.io](https://infinityassistant.io) for AI-powered help
