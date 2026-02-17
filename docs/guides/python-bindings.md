# Python Bindings Guide

HoloScript provides Python bindings for parsing, validating, and generating VR scenes from Python.

## Installation

```bash
pip install holoscript
```

**Requirements:**

- Python 3.8+
- Works on Windows, macOS, and Linux

## Quick Start

```python
from holoscript import parse, validate, suggest_traits

# Parse HoloScript code
result = parse('''
composition "My Scene" {
  object "Cube" @grabbable {
    geometry: "cube"
    color: "#ff0000"
  }
}
''')

print(f"Objects: {result.objects}")
print(f"Traits: {result.traits}")

# Validate
validation = validate(result.ast)
if validation.valid:
    print("✅ Code is valid!")
```

## API Reference

### Parsing

#### `parse(code: str, format: str = "auto") -> ParseResult`

Parse HoloScript source code into an AST.

**Parameters:**

- `code`: Source code string
- `format`: Format hint - `"hs"`, `"hsplus"`, `"holo"`, or `"auto"` (default)

**Returns:** `ParseResult` with:

- `success: bool` - Whether parsing succeeded
- `ast: dict` - Abstract syntax tree
- `errors: list[ParseError]` - Parse errors
- `warnings: list[ParseError]` - Parse warnings
- `format: str` - Detected format
- `objects: list[str]` - Object names found
- `traits: list[str]` - Traits used

```python
from holoscript import parse

# Auto-detect format
result = parse(code)

# Force specific format
result = parse(code, format="holo")
```

#### `parse_holo(code: str) -> ParseResult`

Parse `.holo` composition code specifically.

#### `parse_hsplus(code: str) -> ParseResult`

Parse `.hs` or `.hsplus` code specifically.

---

### Validation

#### `validate(code: str) -> ValidationResult`

Validate HoloScript code for syntax errors and issues.

**Returns:** `ValidationResult` with:

- `valid: bool` - Whether code is valid
- `errors: list[ValidationError]` - Validation errors
- `warnings: list[ValidationError]` - Warnings

```python
from holoscript import validate

result = validate(code)
if not result.valid:
    for error in result.errors:
        print(f"Line {error.line}: {error.message}")
        if error.suggestion:
            print(f"  💡 {error.suggestion}")
```

---

### Traits

#### `list_traits(category: str = "all") -> dict`

List available VR traits.

**Parameters:**

- `category`: Filter by category or `"all"` for all traits

**Categories:**

- `interaction` - @grabbable, @throwable, @clickable, etc.
- `physics` - @collidable, @physics, @rigid, etc.
- `visual` - @glowing, @emissive, @transparent, etc.
- `networking` - @networked, @synced, @persistent, etc.
- `behavior` - @stackable, @attachable, @equippable, etc.
- `spatial` - @anchor, @tracked, @world_locked, etc.
- `audio` - @spatial_audio, @ambient, @voice_activated
- `state` - @state, @reactive, @observable, @computed

```python
from holoscript import list_traits

# All traits
all_traits = list_traits()

# Only interaction traits
interaction = list_traits("interaction")
```

#### `explain_trait(trait: str) -> dict`

Get detailed documentation for a trait.

**Returns:** Dictionary with:

- `name`: Trait name
- `category`: Category
- `description`: What the trait does
- `example`: Code example

```python
from holoscript import explain_trait

info = explain_trait("grabbable")
print(info["description"])
print(info["example"])
```

#### `suggest_traits(description: str) -> list[dict]`

Get AI-powered trait suggestions based on a description.

**Returns:** List of suggestions with:

- `trait`: Trait name
- `confidence`: 0.0-1.0 confidence score
- `reason`: Why this trait is suggested

```python
from holoscript import suggest_traits

suggestions = suggest_traits("A ball that can be picked up and thrown")
for s in suggestions:
    print(f"{s['trait']} ({s['confidence']:.0%}): {s['reason']}")
```

---

### Generation

#### `generate_object(name: str, description: str, geometry: str = "cube") -> GeneratedObject`

Generate a HoloScript object from a description.

```python
from holoscript import generate_object

obj = generate_object(
    name="MagicOrb",
    description="A glowing composition that floats and can be grabbed",
    geometry="sphere"
)
print(obj.code)
```

#### `generate_scene(name: str, description: str, object_count: int = 3) -> GeneratedScene`

Generate a complete HoloScript scene.

```python
from holoscript import generate_scene

scene = generate_scene(
    name="Forest Clearing",
    description="A peaceful forest clearing with trees and a stream",
    object_count=5
)
print(scene.code)
```

---

## Jupyter Notebook

See `examples/holoscript_tutorial.ipynb` for an interactive tutorial.

## Error Handling

```python
from holoscript import parse, ParseError

try:
    result = parse(code)
    if not result.success:
        for error in result.errors:
            print(f"Error at line {error.line}: {error.message}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

## AI Agent Integration

For AI agents (Grok, Claude, ChatGPT), use this pattern:

````python
from holoscript import parse, validate, generate_scene

def handle_vr_request(user_prompt: str) -> str:
    """Generate VR scene from natural language."""

    # Generate scene
    scene = generate_scene(
        name="Generated Scene",
        description=user_prompt
    )

    # Validate
    result = validate(scene.code)

    if result.valid:
        return f"""Here's your VR scene:

\```holo
{scene.code}
\```

Objects: {', '.join(scene.objects)}
Traits: {', '.join(scene.traits)}
"""
    else:
        errors = '\n'.join(e.message for e in result.errors)
        return f"Generated code has issues:\n{errors}"
````

## Type Stubs

For full type checking support, install the type stubs:

```bash
pip install holoscript[types]
```

## Related Links

- [HoloScript Documentation](https://holoscript.dev/docs)
- [Playground](https://holoscript.dev/playground)
- [GitHub Repository](https://github.com/brianonbased-dev/HoloScript)
- [MCP Server](./mcp-server) - For tool-based AI integration
