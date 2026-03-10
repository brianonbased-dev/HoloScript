# Three-Format Showcase: Smart Gallery

This directory contains the **same scene** — an interactive art gallery — implemented in all three HoloScript file formats. Compare them side-by-side to understand when and why to use each format.

## The Three Formats

| Feature | `.hs` (Basic) | `.hsplus` (Extended) | `.holo` (Full World) |
|---|---|---|---|
| **Purpose** | Scene description | Interactive apps | Complete worlds |
| **Wrapper** | None (flat) | `composition { }` | `composition { }` |
| **Objects** | `object "Name" { }` | `object "Name" { }` | `object "Name" { }` |
| **Templates** | - | `template "Name" { }` | `template "Name" { }` |
| **Traits** | Inline properties | `@trait` decorators | `@trait` decorators |
| **State** | - | `state Name { }` | `state Name { }` |
| **Actions** | - | `action name() { }` | `action name() { }` |
| **Behaviors** | - | `behavior { }` | `behavior { }` |
| **Metadata** | - | - | `metadata { }` |
| **Systems** | - | - | `system "Name" { }` |
| **Lines** | ~120 | ~190 | ~290 |

## When to Use Each

- **`.hs`** — Quick prototypes, static scenes, learning the object model. No interactivity needed.
- **`.hsplus`** — Interactive applications with reusable components, state management, and user actions. Most apps live here.
- **`.holo`** — Production worlds with platform targets, integrations (analytics, audio engines, lighting systems), and deployment metadata.

## Compile Commands

```bash
# .hs — compiles to a static scene
holoscript compile smart-gallery.hs --target r3f

# .hsplus — compiles with interaction support
holoscript compile smart-gallery.hsplus --target unity

# .holo — compiles with full system wiring
holoscript compile smart-gallery.holo --target openxr
holoscript compile smart-gallery.holo --target godot
```

## What the Gallery Contains

- **4 paintings** on walls (plane geometry, each with artist metadata in .holo)
- **3 interactive sculptures** (sphere, cube, torus — grabbable and throwable)
- **Spotlights** over each painting
- **Visitor counter** panel (state-bound in .hsplus/.holo)
- **Background music** with spatial audio
- **Guided tour** waypoints (.holo only)
- **Lighting presets** — daylight, evening, spotlight (.holo only)
- **Analytics integration** — visitor tracking, artwork views (.holo only)

## Key Differences to Notice

1. **Templates eliminate repetition.** The `.hs` version duplicates material properties for each painting. The `.hsplus` version defines `PaintingFrame` once and reuses it.

2. **State enables reactivity.** The `.hs` version has a static visitor counter. The `.hsplus` version binds it to `GalleryState.visitorCount` and updates live.

3. **Systems add production capabilities.** The `.holo` version wires in analytics (PostHog), a lighting controller with presets, and a spatial audio engine — none of which exist in the simpler formats.

4. **Metadata enables deployment.** Only the `.holo` version specifies platform targets, version, author, and tags — essential for publishing to HoloLand or compiling to specific platforms.
