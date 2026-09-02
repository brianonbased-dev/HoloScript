# Lesson 1.3: Your First Scene

Now that you have HoloScript installed, let's create your first scene. Every snippet in this lesson uses the authority form the live `compiler-wasm` parser accepts.

## Learning Objectives

By the end of this lesson, you will:

- Recognize the authority object form
- Write a scene as one or more objects
- Add the `@grabbable` trait and a `geometry` property
- Check the snippet with `packages/compiler-wasm` `validate`

## Authority form

The live parser accepts this form and rejects quoted names, pre-brace traits, `composition`-as-object, `group`, and event-handler dialect from older handbook drafts:

```hs
object Cube { @grabbable geometry: "x" }
```

That is the whole object: an unquoted identifier, a brace, the `@grabbable` trait, then `geometry: "x"`.

## Creating a New Project

Open your terminal and run:

```bash
# Create a new project
holoscript init my-vr-room

# Navigate to the project
cd my-vr-room

# Open in VS Code (optional)
code .
```

This creates a project folder with a main scene file under `src/`, plus `assets/`, `holoscript.config.ts`, and `package.json`.

## Your First Scene

Open the main scene file and replace the contents with one or more authority-form objects:

```hs
object Cube { @grabbable geometry: "x" }
```

A room with more than one object is still the same form, repeated:

```hs
object Cube { @grabbable geometry: "x" }

object Welcome { @grabbable geometry: "x" }

object PhysicsCube { @grabbable geometry: "x" }

object Button { @grabbable geometry: "x" }

object Floor { @grabbable geometry: "x" }
```

## Understanding the Code

### The object

```hs
object Cube { @grabbable geometry: "x" }
```

`object` introduces the scene node. The name must be an identifier (`Cube`), not a quoted string.

### The trait

`@grabbable` sits inside the braces. It is a trait, not a property.

### The geometry

`geometry: "x"` is the property the authority parser accepts on this form. Keep it inside the same braces as the trait.

## Running Your Scene

Start the development server:

```bash
holoscript dev
```

This opens a browser preview. Confirm the snippet itself with the live authority parser before you chase preview issues:

```bash
node -e "const w=require('./packages/compiler-wasm/pkg-node/holoscript_wasm.js'); const s='object Cube { @grabbable geometry: \"x\" }'; console.log(w.validate(s), w.validate_detailed(s));"
```

### Keyboard Controls (Desktop Preview)

| Key   | Action       |
| ----- | ------------ |
| WASD  | Move         |
| Mouse | Look around  |
| E     | Grab/Release |
| Click | Interact     |

## Adding More Objects

Add another authority-form object. Do not wrap it in `group` or `composition`:

```hs
object Table { @grabbable geometry: "x" }

object Vase { @grabbable geometry: "x" }
```

## Exercise: Customize Your Room

1. Add a third object next to `Cube` using the same form.
2. Keep the name an identifier.
3. Keep `@grabbable` and `geometry: "x"` inside the braces.

### Solution: another object

```hs
object LightSwitch { @grabbable geometry: "x" }
```

## Common Issues

### Quoted names

`object "Cube"` is rejected (`Expected identifier`). Use `object Cube`.

### Trait before the brace

`object Cube @grabbable { }` is rejected (`Expected LBrace, got Trait`). Put `@grabbable` inside the braces.

### Invented wrappers

`composition`, `group`, `onGrab`, and `@clickable` are handbook dialect, not this authority form.

### Objects not grabbable

The object needs `@grabbable` inside the braces:

```hs
object Floor { @grabbable geometry: "x" }
```

## Summary

In this lesson, you:

- Wrote a scene as `object` nodes
- Used the `@grabbable` trait
- Set `geometry: "x"`
- Stayed on the form `compiler-wasm` `validate` accepts

## Next Lesson

[Lesson 1.4: Understanding Compositions](./04-understanding-compositions.md) is the next page in this sequence. It still teaches the older `composition` handbook form, not this authority form. Read it as a separate dialect until that lesson is rewritten.

---

**Time to complete:** ~30 minutes
**Difficulty:** Beginner
**Prerequisites:** Lesson 1.2 (Installation)
