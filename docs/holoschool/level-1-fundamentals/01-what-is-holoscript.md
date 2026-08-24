# Lesson 1.1: What is HoloScript?

Welcome to HoloSchool! In this first lesson, you'll learn why HoloScript is being built as a general-purpose semantic systems programming language. The worked example uses its spatial programming surface; VR/XR is a domain, not the language boundary.

## Learning Objectives

By the end of this lesson, you will:

- Understand what HoloScript is and its purpose
- Know the key features that make HoloScript unique
- Understand when to use HoloScript vs. traditional game engines

## What is HoloScript?

**HoloScript** is a general-purpose semantic systems programming language under active construction for applications, interfaces, services, runtimes, simulations, agents, devices, and spatial worlds. It includes parser and VM paths, its own AST, type system, standard library, LSP, package ecosystem, and registered compiler targets whose current set should be verified from `ExportTarget` before citing. Declarative composition is one language mechanism, not evidence that HoloScript is a DSL:

- **Compiler-visible semantics** - Express behavior and effects in forms the compiler can inspect
- **Built-in VR interactions** - Grabbing, pointing, and physics out of the box
- **Multiplayer-first** - Networking is a core feature, not an afterthought
- **AI-ready** - First-class support for AI behaviors and NPCs

## A Simple Example

Here's what HoloScript looks like. `composition "My First VR Room"` is historical / not the live example.

```hsplus
object Cube { @grabbable geometry: "x" }
```

Compare this to creating the same scene in a traditional game engine - you'd need hundreds of lines of code dealing with input systems, rendering, physics setup, and more.

## Key Concepts

### 1. Compositions

A **composition** is the root container for your VR scene. Think of it as a "world" that contains all your objects:

```hsplus
composition "Scene Name" {
  // Objects go here
}
```

### 2. Orbs (Objects)

**Orbs** are the building blocks of your scene - 3D objects with properties:

```hsplus
composition myObject {
  position: [x, y, z]
  scale: 1.0
  color: "#FF0000"
}
```

### 3. Traits

**Traits** are reusable behaviors you add with the `@` symbol:

```hsplus
composition button {
  @grabbable        // Can be picked up
  @physics          // Has physical properties
  @networked        // Syncs across multiplayer
}
```

### 4. Event Handlers

**Event handlers** respond to user interactions:

```hsplus
composition button {
  onClick: {
    // Do something when clicked
  }

  onGrab: {
    // Do something when grabbed
  }
}
```

## Why HoloScript?

### Before HoloScript

Creating a simple grabbable object in Unity or Unreal requires:

- Setting up the XR Interaction Toolkit
- Creating a C# script for grab behavior
- Configuring Rigidbody physics
- Setting up layers and interaction masks
- Writing networking code for multiplayer

### With HoloScript

```hsplus
composition cube {
  @grabbable
  @physics
  @networked
}
```

**That's it.** Three lines, fully functional.

## The HoloScript Ecosystem

HoloScript isn't just a language - it's an ecosystem:

| Component          | Description                                 |
| ------------------ | ------------------------------------------- |
| `@holoscript/core` | Parser, compiler, and runtime               |
| `@holoscript/cli`  | Command-line tools                          |
| `@holoscript/lsp`  | IDE support via Language Server Protocol    |
| VS Code Extension  | Syntax highlighting, completions, debugging |
| IntelliJ Plugin    | JetBrains IDE support                       |

## When to Use HoloScript

**Use HoloScript when:**

- Building services, runtimes, simulations, agents, tools, or device programs
- Building social VR experiences
- Creating multiplayer games
- Prototyping VR ideas quickly
- Building tools for non-programmers

**Consider alternatives when:**

- You need a systems primitive HoloScript has not yet closed, such as a specific ABI, memory-layout, native-debugger, or self-hosting path
- Building AAA game graphics
- Working with existing Unity/Unreal projects

## Exercise: Explore HoloScript

1. Visit the [HoloScript Playground](https://play.holoscript.net)
2. Try modifying the example scene
3. Change the orb's color and position
4. Add a second composition to the scene

## Summary

- HoloScript is a general-purpose semantic systems programming language under active construction
- VR/XR is one first-class domain, not the language boundary
- It uses **compositions**, **orbs**, **traits**, and **event handlers**
- The `@` symbol adds behaviors (traits) to objects
- HoloScript dramatically reduces code compared to traditional engines

## Next Lesson

In [Lesson 1.2: Installation & Setup](./02-installation.md), you'll install HoloScript and set up your development environment.

---

**Time to complete:** ~15 minutes
**Difficulty:** Beginner
**Prerequisites:** None
