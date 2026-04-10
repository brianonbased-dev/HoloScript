# @holoscript/linter

Static analysis tool for HoloScript (.holo) and HoloScript+ (.hsplus) files.

## Features

- **Syntax validation** - Catch duplicate IDs and structural issues
- **Naming conventions** - Enforce PascalCase for compositions and templates
- **Best practices** - Detect unused templates, duplicate definitions
- **Performance warnings** - Identify deep nesting issues
- **Trait validation** - Check for valid trait annotations
- **Pluggable rules** - Add custom rules for your project
- **Multiple output formats** - Stylish, JSON, or compact output

## Installation

```bash
pnpm add @holoscript/linter
```

## CLI Usage

```bash
# Lint files
holoscript-lint src/

# Lint specific files
holoscript-lint scene.holo world.hsplus

# Lint with auto-fix (when available)
holoscript-lint --fix src/

# Output as JSON
holoscript-lint --format json src/

# Compact output (one line per issue)
holoscript-lint --format compact src/

# Limit warnings (exit 1 if exceeded)
holoscript-lint --max-warnings 10 src/

# Quiet mode (errors only)
holoscript-lint --quiet src/

# Use custom config
holoscript-lint --config .holoscriptlintrc src/
```

## Programmatic Usage

```typescript
import { HoloScriptLinter, lint, createLinter } from '@holoscript/linter';

// Create linter with custom config
const linter = new HoloScriptLinter({
  rules: {
    'no-duplicate-ids': 'error',
    'composition-naming': 'warn',
    'no-deep-nesting': ['warn', { maxDepth: 5 }],
    'no-unused-templates': 'warn',
  },
  maxErrors: 100,
});

// Lint a file
const result = linter.lint(code, 'scene.holo');

console.log(`Errors: ${result.errorCount}`);
console.log(`Warnings: ${result.warningCount}`);
console.log(`Fixable: ${result.fixableCount}`);

for (const diagnostic of result.diagnostics) {
  console.log(
    `${diagnostic.line}:${diagnostic.column} [${diagnostic.severity}] ${diagnostic.message} (${diagnostic.ruleId})`
  );
}

// Convenience function (uses default config)
const result2 = lint(code, 'scene.holo');

// Create linter with factory
const customLinter = createLinter({ maxErrors: 50 });
```

## Configuration

Create a `.holoscriptlintrc`, `.holoscriptlintrc.json`, or `holoscript-lint.config.json`:

```json
{
  "rules": {
    "no-duplicate-ids": "error",
    "composition-naming": "warn",
    "no-deep-nesting": ["warn", { "maxDepth": 5 }],
    "valid-trait-syntax": "error",
    "no-unused-templates": "warn"
  },
  "ignorePatterns": ["node_modules/**", "dist/**"],
  "maxErrors": 100
}
```

## Built-in Rules

### Syntax

| Rule                 | Default | Description                                           |
| -------------------- | ------- | ----------------------------------------------------- |
| `no-duplicate-ids`   | error   | Ensure all object IDs are unique within a composition |
| `valid-trait-syntax` | error   | Ensure trait annotations use valid syntax             |

### Naming

| Rule                 | Default | Description                             |
| -------------------- | ------- | --------------------------------------- |
| `composition-naming` | warn    | Composition names should use PascalCase |
| `object-naming`      | warn    | Object names should follow conventions  |
| `template-naming`    | warn    | Template names should use PascalCase    |

### Best Practice

| Rule                  | Default | Description                            |
| --------------------- | ------- | -------------------------------------- |
| `no-unused-templates` | warn    | Templates should be used at least once |
| `prefer-templates`    | warn    | Prefer templates for repeated patterns |

### Performance

| Rule                      | Default | Description                                     |
| ------------------------- | ------- | ----------------------------------------------- |
| `no-deep-nesting`         | warn    | Avoid deeply nested structures (default max: 5) |
| `limit-objects-per-group` | warn    | Limit objects per spatial group                 |

### Style

| Rule                 | Default | Description                    |
| -------------------- | ------- | ------------------------------ |
| `consistent-spacing` | info    | Use consistent spacing         |
| `sorted-properties`  | info    | Sort properties alphabetically |

## Custom Rules

```typescript
import { HoloScriptLinter } from '@hololand/holoscript-linter';
import type { Rule, RuleContext, LintDiagnostic } from '@hololand/holoscript-linter';

const linter = new HoloScriptLinter();

// Register a custom rule
linter.registerRule({
  id: 'custom/no-magic-numbers',
  name: 'No Magic Numbers',
  description: 'Avoid magic numbers in code',
  category: 'best-practice',
  defaultSeverity: 'warning',
  check(context: RuleContext): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const pattern = /\b\d{3,}\b/g;

    for (let i = 0; i < context.lines.length; i++) {
      let match;
      while ((match = pattern.exec(context.lines[i])) !== null) {
        diagnostics.push({
          ruleId: 'custom/no-magic-numbers',
          message: `Magic number ${match[0]} - consider using a named constant`,
          severity: 'warning',
          line: i + 1,
          column: match.index + 1,
        });
      }
    }

    return diagnostics;
  },
});

// Get all registered rules
const rules = linter.getRules();
console.log(`${rules.length} rules registered`);
```

## Output Formats

### Stylish (default)

```
src/scene.holo
  5:1  error  Duplicate ID "player" (first defined on line 2)  no-duplicate-ids
  12:1  warning  Composition name "my scene" should use PascalCase  composition-naming

✖ 2 problems (1 error, 1 warning)
```

### JSON

```json
[{
  "filePath": "src/scene.holo",
  "diagnostics": [...],
  "errorCount": 1,
  "warningCount": 1,
  "fixableCount": 0
}]
```

### Compact

```
src/scene.holo:5:1: error - Duplicate ID "player" (no-duplicate-ids)
src/scene.holo:12:1: warning - Composition name should use PascalCase (composition-naming)
```

## VSCode Integration

The linter integrates with the HoloScript VSCode extension for real-time diagnostics.

## License

MIT
