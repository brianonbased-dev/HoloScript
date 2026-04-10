# @holoscript/formatter

**Code formatting and style consistency for HoloScript.** Automatically format `.hs`, `.hsplus`, and `.holo` files.

## Installation

```bash
npm install @holoscript/formatter
```

## Usage

### CLI

```bash
# Format file in place
holo format myfile.holo

# Format entire directory
holo format src/

# Check without modifying
holo format --check myfile.holo

# Show diff
holo format --diff myfile.holo
```

### Programmatic

```typescript
import { format, createFormatter } from '@holoscript/formatter';

const code = `object"Cube"{@grabbable geometry:"box"}`;
const formatted = format(code);
console.log(formatted);
// object "Cube" {
//   @grabbable
//   geometry: "box"
// }
```

## Configuration

Create `.holoscriptrc.json`:

```json
{
  "formatter": {
    "indent": 2,
    "indentTabs": false,
    "lineWidth": 100,
    "trailingComma": "es5",
    "semi": false,
    "singleQuote": false,
    "arrowParens": "always",
    "bracketSpacing": true,
    "printWidth": 100
  }
}
```

## EditorConfig Support

`.editorconfig`:

```ini
[*.{hs,hsplus,holo}]
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
```

## Built-in Rules

- 2-space indentation (configurable)
- Spaces around operators
- Newlines between blocks
- Consistent trait ordering
- Property alignment (optional)
