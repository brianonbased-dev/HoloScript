# Lesson 4: Templates

Templates let you define reusable object blueprints.

## Concept: Reusable definitions

```holoscript
template "Button" {
  color: "blue"
  scale: 0.2
  @highlight
  @grabbable
}

orb "OkButton" {
  ...Button
  color: "green"    # override just the color
  position: [0, 1, -2]
}

orb "CancelButton" {
  ...Button
  color: "red"
  position: [0.5, 1, -2]
}
```

The spread operator `...Template` copies all template properties.

## Try it:

```holoscript
template "Gem" {
  scale: 0.15
  @physics { mass: 0.01 }
  @grabbable
}

orb "RedGem"   { ...Gem  color: "red"    position: [-1, 1, -2] }
orb "BlueGem"  { ...Gem  color: "blue"   position: [0,  1, -2] }
orb "GreenGem" { ...Gem  color: "green"  position: [1,  1, -2] }
```

## Your turn:

Create a `"Furniture"` template with `@physics` and `mass: 5.0`, then create a `"Chair"` orb from it.

[Check Answer] [Hint] [Skip]

---

**Next:** [Lesson 5 – Logic Blocks](./05-logic-blocks.md)
