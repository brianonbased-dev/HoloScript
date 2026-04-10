# @holoscript/linter

**Static analysis and error detection for HoloScript.** Catch bugs, style issues, and best practice violations before runtime.

## Installation

```bash
npm install @holoscript/linter
```

## Usage

### CLI

```bash
# Lint file
holo lint myfile.holo

# Lint directory
holo lint src/

# Fix auto-fixable issues
holo lint --fix myfile.holo

# Show detailed output
holo lint --format detailed myfile.holo
```

### Programmatic

```typescript
import { lint } from '@holoscript/linter';

const diagnostics = await lint(code);
diagnostics.forEach((diag) => {
  console.log(`${diag.rule}: ${diag.message} (line ${diag.line})`);
});
```

## Rules

| Rule                    | Level   | Description                      |
| ----------------------- | ------- | -------------------------------- |
| `no-unused-objects`     | warning | Warn on objects never referenced |
| `no-circular-refs`      | error   | Prevent circular dependencies    |
| `unknown-trait`         | warning | Trait doesn't exist              |
| `missing-geometry`      | error   | Object has no geometry           |
| `type-mismatch`         | error   | Property type doesn't match      |
| `redundant-trait`       | warning | Trait already implied by another |
| `missing-state-init`    | warning | State property never initialized |
| `unsafe-network-object` | warning | @networked without proper setup  |

## Configuration

`.holoscriptrc.json`:

```json
{
  "linter": {
    "rules": {
      "no-unused-objects": "warn",
      "no-circular-refs": "error",
      "unknown-trait": "off"
    }
  }
}
```

## Custom Rules

```typescript
import { defineRule, registerRule } from '@holoscript/linter';

const myRule = defineRule({
  name: 'no-console',
  description: 'Disallow console.log in production',
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.name === 'console.log') {
          context.report({
            node,
            message: 'console.log not allowed in production',
          });
        }
      },
    };
  },
});

registerRule(myRule);
```
