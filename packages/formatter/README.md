# @holoscript/formatter

Code formatting tool for HoloScript (.holo) and HoloScript+ (.hsplus) files.

## Features

- **Indentation normalization** - Consistent indentation with spaces or tabs
- **Brace style enforcement** - Same-line, next-line, or Stroustrup brace style
- **Whitespace cleanup** - Remove trailing spaces, normalize blank lines
- **Trailing comma handling** - None, all, or multi-line only
- **Import sorting** - Alphabetically sorted imports
- **Check mode** - Verify files without modifying them
- **Configurable** - JSON config file support

## Installation

```bash
pnpm add @holoscript/formatter
```

## CLI Usage

```bash
# Format and print to stdout
holoscript-format src/scene.holo

# Format directory recursively
holoscript-format src/

# Format and write to file
holoscript-format --write src/

# Check if files are formatted (exit 1 if not)
holoscript-format --check src/

# Use custom config file
holoscript-format --config .holoscriptrc src/

# Quiet mode (suppress output)
holoscript-format --quiet --write src/
```

## Programmatic Usage

```typescript
import { HoloScriptFormatter, format, check, createFormatter } from '@holoscript/formatter';

// Create formatter with custom config
const formatter = new HoloScriptFormatter({
  indentSize: 2,
  useTabs: false,
  maxLineLength: 100,
  braceStyle: 'same-line',
  trailingComma: 'multi-line',
  bracketSpacing: true,
  sortImports: true,
});

// Format code
const result = formatter.format(code, 'holo');

console.log(result.formatted); // Formatted code
console.log(result.changed); // true if code was modified
console.log(result.errors); // Array of formatting errors

// Check if formatted (returns boolean)
const isFormatted = formatter.check(code, 'holo');

// Convenience functions (use default config)
const result2 = format(code, 'hsplus');
const isFormatted2 = check(code, 'holo');

// Create formatter with factory function
const customFormatter = createFormatter({ indentSize: 4 });
```

## Configuration

Create a `.holoscriptrc`, `.holoscriptrc.json`, or `holoscript.config.json`:

```json
{
  "indentSize": 2,
  "useTabs": false,
  "maxLineLength": 100,
  "braceStyle": "same-line",
  "trailingComma": "multi-line",
  "bracketSpacing": true,
  "semicolons": false,
  "singleQuote": false,
  "sortImports": true,
  "maxBlankLines": 1,
  "blankLineBeforeComposition": true
}
```

## Options

| Option                       | Default      | Description                                         |
| ---------------------------- | ------------ | --------------------------------------------------- |
| `indentSize`                 | 2            | Spaces per indent level                             |
| `useTabs`                    | false        | Use tabs instead of spaces                          |
| `maxLineLength`              | 100          | Maximum line length                                 |
| `braceStyle`                 | "same-line"  | Brace style: "same-line", "next-line", "stroustrup" |
| `trailingComma`              | "multi-line" | Trailing commas: "none", "multi-line", "all"        |
| `bracketSpacing`             | true         | Spaces inside brackets `[ 1, 2, 3 ]`                |
| `semicolons`                 | false        | Add semicolons (HSPlus)                             |
| `singleQuote`                | false        | Use single quotes                                   |
| `sortImports`                | true         | Sort import statements alphabetically               |
| `maxBlankLines`              | 1            | Maximum consecutive blank lines                     |
| `blankLineBeforeComposition` | true         | Blank line before composition blocks                |

## Examples

### Before

```holo
composition "Example"{
template "Enemy"{
state{health:100}
action attack(target){target.health-=10}
}
spatial_group "Main"{
object "Goblin" using "Enemy"{position:[0,0,5]}
}}
```

### After

```holo
composition "Example" {
  template "Enemy" {
    state { health: 100 }
    action attack(target) { target.health -= 10 }
  }

  spatial_group "Main" {
    object "Goblin" using "Enemy" { position: [ 0, 0, 5 ] }
  }
}
```

## VSCode Integration

The formatter integrates with the HoloScript VSCode extension:

1. Format on save: Enable `editor.formatOnSave`
2. Format selection: Select code and press `Shift+Alt+F`
3. Format document: Press `Shift+Alt+F` with no selection

## License

Elastic License 2.0 - See [LICENSE](../../LICENSE) for details.
