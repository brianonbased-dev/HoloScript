# Lesson 2.11: Publishing to HoloHub

In this lesson, you'll learn how to package your HoloScript compositions for discovery in the HoloHub registry and how to use creator metadata.

## Learning Objectives

- Use the `@author`, `@license`, and `@version` metadata traits.
- Structure your `.holo` files for registry discovery.
- Understand the HoloHub ingestion process.
- Create a Creator Portfolio entry.

---

## Metadata Traits

To ensure your work is properly attributed and searchable, use the standard metadata traits at the top of your composition.

```hsplus
composition "Cyberpunk City" {
    @author("CreativeBuilder")
    @license("MIT")
    @version("1.0.0")
    @tags(["neon", "urban", "dynamic-lighting"])

    environment {
        // ...
    }
}
```

### Supported Metadata

| Trait        | Value    | Description                                            |
| :----------- | :------- | :----------------------------------------------------- |
| **@author**  | `string` | Your unique HoloHub username.                          |
| **@license** | `string` | The license for your scene (e.g., `MIT`, `CC-BY-4.0`). |
| **@version** | `string` | Semantic versioning for your composition.              |
| **@tags**    | `array`  | Keywords used for semantic search.                     |

---

## The Registry Ingest Flow

When you publish a file to the HoloHub registry (via the CLI or Web Portal), the following happens:

1.  **Validation**: The `HoloCompositionParser` checks for syntax errors.
2.  **Trait Extraction**: The `TraitRegistryService` indexes all traits used in your scene.
3.  **Metadata Mapping**: Your `@author` tag is linked to your **Creator Portfolio**.
4.  **Preview Generation**: A thumbnail is generated using the `BrowserRuntime`.

---

## Project: Creating Your Portfolio Scene

Every creator is encouraged to have a "Portfolio Scene"—a `.holo` file that showcases their best work.

### Step 1: Create `portfolio.holo`

```hsplus
composition "CreativeBuilder Portfolio" {
    @author("CreativeBuilder")
    @tags(["portfolio", "showcase"])

    // Add a signature object
    object "Signature" {
        @interaction
        geometry: "models/logo.glb"
        onInteraction: {
            emit "ui_overlay" "Welcome to my spatial portfolio!"
        }
    }

    // Reference your other scenes
    import_asset "NexusCity_v1" from "holohub://NexusCity"
}
```

---

## Best Practices for Visibility

1.  **Descriptive Names**: Use names like `AncientRuins_v2` instead of `TestScene1`.
2.  **Rich Tags**: Use at least 3-5 tags representing the theme and technical features (e.g., `@physics`, `@light-map`).
3.  **README**: Always include a README in your project folder to help the HoloHub search engine find you.

---

## Summary

In this lesson, you learned:

- How to add attribution via metadata traits.
- The requirements for HoloHub discovery.
- How your work is linked to the HoloHub ecosystem.

## 🎉 Level 2 Conclusion

You have finished the Intermediate track! You are now prepared to build, optimize, and publish complex spatial environments.

Stay tuned for **Level 3 (Advanced)**, where we dive into **Custom Shaders** and **Proximity Federation**.

## Next Lesson

In [Lesson 2.12: Spatial Discovery & Sub-Orbs](./12-spatial-discovery.md), you'll learn portals, hologram previews, and nested composition loading.

---

**Estimated time:** 30 minutes
**Difficulty:** ⭐⭐ Intermediate
