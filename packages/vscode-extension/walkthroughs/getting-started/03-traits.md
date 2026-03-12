# VR Traits - Add Interactivity

Traits are the magic of HoloScript. Add `@trait` to any object to give it VR superpowers!

## Essential Traits

### Interaction

```holo
@grabbable    // User can grab the object in VR
@pointable    // User can point/click at it
@hoverable    // Reacts to gaze/pointer hover
```

### Physics

```holo
@physics      // Full physics simulation
@collidable   // Can collide with other objects
@gravity      // Affected by gravity
```

### Visual

```holo
@glowing      // Emits light
@transparent  // See-through material
@animated     // Has animations
```

### Multiplayer

```holo
@networked    // Synced across all players
@persistent   // Saved when scene exits
```

## Example: Interactive Button

```holo
object "BigRedButton" {
  @pointable
  @clickable
  @glowing

  position: [0, 1, -1]
  color: "red"

  on_click: {
    audio.play("button-click")
    this.color = "green"
  }
}
```

## Full Trait Library

HoloScript includes **2,000+ traits** organized across 73+ categories:

- **Core VR**: grabbable, throwable, pointable, hoverable, ...
- **Game Mechanics**: collectible, destructible, lootable, quest_item, ...
- **Magic & Fantasy**: enchantable, cursed, elemental_fire, telekinetic, ...
- **Nature & Life**: growable, bioluminescent, aquatic, metamorphic, ...
- **Sci-Fi**: hologram, cloaking, nanite, warp_drive, ...
- **Animals**: cat, dog, horse, dragon, phoenix, ...
- **Furniture**: chair, table, bookshelf, fireplace, ...

See the full list in `@holoscript/core` → `src/traits/constants/`.

---

Click **Next** to preview your scene!
