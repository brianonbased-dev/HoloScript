# HoloScript Python Bindings

Python bindings for HoloScript - parse, validate, and generate HoloScript code from Python.

## Installation

```bash
pip install holoscript
```

## Quick Start

```python
from holoscript import HoloScript

# Initialize
hs = HoloScript()

# Parse HoloScript code
ast = hs.parse("""
composition "My Scene" {
  object "Crystal" @grabbable @glowing {
    geometry: "sphere"
    color: "#00ffff"
  }
}
""")

# Validate code
result = hs.validate(ast)
if result.valid:
    print("✅ Valid HoloScript!")
else:
    for error in result.errors:
        print(f"❌ Line {error.line}: {error.message}")

# Generate from natural language
scene = hs.generate("a floating island with glowing crystals")
print(scene.code)

# Create shareable link
share = hs.share(scene.code, title="My VR Scene", platform="x")
print(f"Playground: {share.playground_url}")
print(f"Tweet: {share.tweet_text}")
```

## Features

- **Parsing**: Parse `.hs`, `.hsplus`, and `.holo` files
- **Validation**: Validate syntax with AI-friendly error messages
- **Generation**: Generate HoloScript from natural language
- **Rendering**: Generate preview images/GIFs
- **Sharing**: Create X-optimized shareable links

## For AI Agents (Grok, etc.)

```python
# Grok integration example
from holoscript import HoloScript

hs = HoloScript(api_key="your-api-key")  # Optional for remote rendering

# Generate scene from user prompt
user_prompt = "Create a VR scene with a floating castle"
scene = hs.generate(user_prompt)

# Validate
if hs.validate(scene.code).valid:
    # Create shareable preview
    preview = hs.render(scene.code, format="gif", duration=3000)
    share = hs.share(scene.code, title="Floating Castle", platform="x")

    # Return to user
    print(f"Here's your VR scene: {share.playground_url}")
    print(f"Preview: {preview.url}")
```

## API Reference

See [full documentation](https://holoscript.net/python) for complete API reference.
