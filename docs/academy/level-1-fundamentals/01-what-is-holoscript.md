# Lesson 1.1: What is HoloScript?

Welcome to HoloScript Academy! In this first lesson, you'll learn what HoloScript is, why it was created, and what makes it unique for VR/XR development.

## Learning Objectives

By the end of this lesson, you will:

- Understand what HoloScript is and its purpose
- Know the key features that make HoloScript unique
- Understand when to use HoloScript vs. traditional game engines

## What is HoloScript?

**HoloScript** is a full programming language designed specifically for creating VR and XR (Extended Reality) experiences. Purpose-built for spatial computing, HoloScript features a dual parser (TypeScript + Rust/WASM), its own AST, type system, standard library, LSP, package ecosystem, and compiles to 18+ targets:

- **Declarative 3D scenes** - Describe what you want, not how to build it
- **Built-in VR interactions** - Grabbing, pointing, and physics out of the box
- **Multiplayer-first** - Networking is a core feature, not an afterthought
- **AI-ready** - First-class support for AI behaviors and NPCs

## A Simple Example

Here's what HoloScript looks like:

```hsplus
composition "My First VR Room" {
  // A glowing composition that users can grab
  composition welcomecomposition {
    @grabbable
    @glowing { color: "#4A90D9", intensity: 0.8 }

    position: [0, 1.5, -2]
    scale: 0.15
    color: "#4A90D9"

    onGrab: {
      console.log("You grabbed the orb!")
    }
  }
}
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

- Building social VR experiences
- Creating multiplayer games
- Prototyping VR ideas quickly
- Building tools for non-programmers

**Consider alternatives when:**

- You need extremely low-level control
- Building AAA game graphics
- Working with existing Unity/Unreal projects

## Exercise: Explore HoloScript

1. Visit the [HoloScript Playground](https://play.holoscript.net)
2. Try modifying the example scene
3. Change the orb's color and position
4. Add a second composition to the scene

## Summary

- HoloScript is a full programming language for VR/XR development
- It uses **compositions**, **orbs**, **traits**, and **event handlers**
- The `@` symbol adds behaviors (traits) to objects
- HoloScript dramatically reduces code compared to traditional engines

## Next Lesson

In [Lesson 1.2: Installation & Setup](./02-installation.md), you'll install HoloScript and set up your development environment.

---

**Time to complete:** ~15 minutes
**Difficulty:** Beginner
**Prerequisites:** None
