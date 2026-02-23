# HoloScript Tutorial: Building an AR Furniture Preview App

This step-by-step tutorial breaks down the `furniture-catalog.holo` example, explaining AR concepts and mobile patterns for e-commerce applications.

## Table of Contents

1. [AR Session Setup](#ar-session-setup)
2. [Product Catalog Structure](#product-catalog-structure)
3. [Plane Detection & Placement](#plane-detection--placement)
4. [Mobile Gesture Controls](#mobile-gesture-controls)
5. [Product Configuration UI](#product-configuration-ui)
6. [Environmental Lighting](#environmental-lighting)
7. [Shopping Cart Integration](#shopping-cart-integration)
8. [Save & Share Features](#save--share-features)

---

## 1. AR Session Setup

### Understanding AR Sessions

In HoloScript, AR experiences start with an `ar_session` block:

```holoscript
ar_session#furniture_preview @mobile @markerless {
  mode: "world_tracking"
  plane_detection: "horizontal"
  light_estimation: true
  environmental_hdr: true
}
```

**Breaking it down:**
- `@mobile` - Optimized for phone/tablet AR
- `@markerless` - No QR codes or image markers required
- `mode: "world_tracking"` - Track real-world surfaces and camera movement
- `plane_detection: "horizontal"` - Detect floors, tables, counters (not walls)
- `light_estimation` - Match virtual lighting to real environment
- `environmental_hdr` - Use HDR for realistic reflections

### AR Features Configuration

```holoscript
features {
  plane_visualization: true  // Show detected surfaces (debug)
  feature_points: false      // Hide tracking points
  occlusion: true           // Furniture goes behind real objects
  shadows: true             // Cast shadows on real surfaces
}
```

**Occlusion**: Virtual furniture disappears when you walk behind it (requires depth sensing on iPhone 12+ or LiDAR).

**Shadows**: Furniture casts realistic shadows on detected planes, matching real-world lighting direction.

### Session Lifecycle Events

```holoscript
on_session_start {
  show_instruction: "Point camera at floor or flat surface"
  play_audio: "ar_start_chime.mp3"
}

on_plane_detected {
  show_placement_indicator: true
  vibrate: { intensity: 0.2, duration: 0.1 }
  update_instruction: "Tap to place furniture"
}
```

**User flow:**
1. User grants camera permission
2. AR session starts → show instruction
3. User points camera at floor → plane detected
4. Placement indicator appears → user can tap to place

---

## 2. Product Catalog Structure

### Defining Products

```holoscript
catalog#furniture_items {
  category "Living Room" {
    product#modern_sofa @furniture @interactive {
      id: "SOFA-001"
      name: "Modern Sectional Sofa"
      description: "Contemporary L-shaped sofa with modular design"
      price: 1299.99
      currency: "USD"
      dimensions: { width: 2.4, depth: 1.6, height: 0.8 }  // meters

      model: "modern_sofa.glb"
      scale_factor: 1.0

      materials: [
        { id: "gray_fabric", name: "Charcoal Gray Fabric", texture: "sofa_gray.png", price_modifier: 0 },
        { id: "leather_black", name: "Black Leather", texture: "sofa_leather_black.png", price_modifier: 300 }
      ]
      default_material: "gray_fabric"

      thumbnail: "sofa_thumb.jpg"
      gallery: ["sofa_1.jpg", "sofa_2.jpg", "sofa_3.jpg"]
    }
  }
}
```

**Key fields:**
- `id` - Unique identifier for database/API integration
- `dimensions` - Real-world size in meters (critical for AR accuracy)
- `model` - 3D model file (.glb format recommended)
- `materials` - Color/texture variants with price modifiers
- `thumbnail` - Image for product catalog UI

### Material Variants

```holoscript
materials: [
  { id: "gray_fabric", name: "Charcoal Gray", texture: "sofa_gray.png", price_modifier: 0 },
  { id: "navy_fabric", name: "Navy Blue", texture: "sofa_navy.png", price_modifier: 50 },
  { id: "leather_black", name: "Black Leather", texture: "sofa_leather_black.png", price_modifier: 300 }
]
```

**Price modifiers**: Add to base price when material selected.
- Gray fabric: $1,299.99 + $0 = $1,299.99
- Leather: $1,299.99 + $300 = $1,599.99

### Placement Settings

```holoscript
placement {
  surface_type: "floor"
  min_area: 4.0  // Minimum 4 square meters
  auto_rotate: true
  snap_to_grid: false
}
```

**Validation**: Prevents placing large furniture on tiny surfaces.

---

## 3. Plane Detection & Placement

### Placement Indicator (Reticle)

```holoscript
ar_placement#furniture_placer {
  object#placement_reticle @ar_indicator {
    type: "circle"
    size: 0.3
    material: "hologram_grid"
    color: #00ff00
    opacity: 0.6

    animate {
      property: "scale"
      from: 1.0
      to: 1.1
      duration: 0.8
      loop: true
      easing: "ease_in_out"
    }

    align_to_surface: true
    visible: plane_detected
  }
}
```

**Visual feedback:**
- Circle/crosshair shows where furniture will be placed
- Green color = valid placement
- Red color = invalid (surface too small)
- Pulsing animation = ready to tap
- `align_to_surface: true` = rotates to match detected plane

### Placement Validation

```holoscript
validate_placement {
  check_surface_area: true
  check_lighting: true
  check_stability: true

  on_invalid {
    reticle.color = #ff0000
    show_warning: "Surface too small or unstable"
  }

  on_valid {
    reticle.color = #00ff00
    enable_tap_to_place: true
  }
}
```

**Checks:**
1. **Surface area**: Is the detected plane large enough for this furniture?
2. **Lighting**: Is there enough light for good AR tracking?
3. **Stability**: Is the plane stable (not a moving object)?

### Tap to Place

```holoscript
on_screen_tap {
  if (placement_valid && selected_product) {
    spawn_furniture: {
      product: selected_product,
      position: reticle.position,
      rotation: reticle.rotation,
      material: selected_material
    }

    play_audio: "place_sound.mp3"
    vibrate: { intensity: 0.5, duration: 0.1 }

    show_controls: ["rotate", "scale", "delete", "configure"]
  }
}
```

**User flow:**
1. User selects product from catalog
2. Placement reticle appears when plane detected
3. User taps screen → furniture spawns at reticle position
4. Manipulation controls appear

---

## 4. Mobile Gesture Controls

### Tap to Select

```holoscript
on_furniture_tap {
  select_furniture: this
  show_bounding_box: true
  show_control_panel: true
}
```

**Visual feedback**: Bounding box highlights selected furniture.

### Swipe to Rotate

```holoscript
on_horizontal_swipe {
  rotate_furniture: {
    axis: "y"
    angle_per_pixel: 1.0
    smooth: true
  }
}
```

**Gesture**: Swipe left/right to rotate furniture around vertical axis.

### Pinch to Scale

```holoscript
on_pinch_gesture {
  scale_furniture: {
    min_scale: 0.5
    max_scale: 1.5
    maintain_aspect_ratio: true
    snap_to_original: true  // Snap back to 1.0 when close
  }

  update_ui: "dimensions"
}
```

**Gesture**: Two-finger pinch to shrink/enlarge.
**Snap behavior**: When scale gets close to 1.0 (original size), it snaps back for accuracy.

### Drag to Move

```holoscript
on_drag_gesture {
  move_furniture: {
    constraint: "horizontal_plane"  // Keep on detected surface
    collision_check: true           // Don't overlap other furniture
    snap_distance: 0.1             // Snap to grid if enabled
  }
}
```

**Constraint**: Furniture stays on the detected plane (can't float in air).

**Collision check**: Prevents furniture from overlapping.

### Swipe Up to Delete

```holoscript
on_vertical_swipe_up {
  show_confirmation: {
    message: "Remove {furniture.name}?"
    buttons: ["Remove", "Cancel"]
  }

  on_confirm {
    animate_out: {
      type: "fade_scale"
      duration: 0.3
    }
    remove_furniture: this
    play_audio: "delete_sound.mp3"
  }
}
```

**Gesture**: Swipe up to remove furniture (with confirmation).

---

## 5. Product Configuration UI

### Floating UI Panel

```holoscript
ui#config_panel @floating @contextual {
  position: "above_furniture"
  offset_y: 0.5
  size: { x: 300, y: 400 }
  background: #ffffffee
  border_radius: 15
  shadow: true

  visible: furniture_selected
}
```

**Key features:**
- `@floating` - Hovers in AR space (not screen-space)
- `@contextual` - Appears only when furniture selected
- `position: "above_furniture"` - Follows selected furniture
- `offset_y: 0.5` - Positioned 0.5m above furniture

### Material Selector

```holoscript
grid#material_swatches {
  columns: 3
  gap: 10
  padding: 10

  for_each_material {
    swatch_button {
      size: { x: 80, y: 80 }
      background: material.texture
      border: 2
      border_color: material.is_selected ? #2196f3 : #dddddd
      border_radius: 8

      on_tap {
        apply_material: {
          furniture: selected_furniture,
          material: this
        }
        update_price: material.price_modifier
        play_audio: "click.mp3"
      }
    }
  }
}
```

**Visual design:**
- Grid of color swatches (3 columns)
- Blue border on selected material
- Tap to apply new material instantly

### Scale Slider

```holoscript
slider#scale_control {
  position: { y: 30 }
  width: 280
  min: 0.5
  max: 1.5
  value: 1.0
  step: 0.1

  on_value_change {
    scale_furniture: this.value
    update_dimensions: true
  }
}
```

**UI pattern**: Alternative to pinch gesture for precise scaling.

### Add to Cart Button

```holoscript
button#add_to_cart {
  position: { y: 320 }
  size: { x: 280, y: 44 }
  background: #4caf50
  text: "Add to Cart - ${selected_furniture.total_price}"
  text_color: #ffffff
  border_radius: 8

  on_tap {
    add_to_shopping_cart: selected_furniture
    show_toast: "Added to cart!"
    play_audio: "success.mp3"
    vibrate: { intensity: 0.6, duration: 0.15 }
  }
}
```

**Dynamic text**: Shows current price including material modifiers.

---

## 6. Environmental Lighting

### Auto-Matching Real-World Light

```holoscript
ar_lighting#environment_match @auto {
  light_estimation: true

  on_light_update {
    scene.ambient_intensity = estimated_intensity
    scene.ambient_color = estimated_color
    scene.ambient_temperature = estimated_temperature

    for_each_placed_furniture {
      update_material_lighting: {
        furniture: this,
        ambient: scene.ambient_color,
        intensity: scene.ambient_intensity
      }
    }
  }
}
```

**How it works:**
1. Device camera estimates real-world lighting
2. Scene lighting updates to match
3. All furniture materials update their shading
4. Result: Virtual furniture looks like it belongs in the room

### Realistic Shadows

```holoscript
shadow_casting {
  enabled: true
  receive_on_planes: true  // Real surfaces receive shadows
  intensity: estimated_shadow_intensity
  softness: "medium"
}
```

**Shadow direction**: Automatically matches estimated light source direction.

**Shadow intensity**: Brighter rooms = lighter shadows, darker rooms = darker shadows.

---

## 7. Shopping Cart Integration

### Cart Data Structure

```holoscript
ui#cart_panel @modal {
  scrollable#cart_items {
    for_each_cart_item {
      cart_item_row {
        thumbnail: item.thumbnail
        name: item.name
        material: item.selected_material
        quantity: item.quantity
        price: item.total_price

        button#remove {
          icon: "trash.svg"
          on_tap {
            remove_from_cart: item
          }
        }
      }
    }
  }

  section#cart_summary {
    text#subtotal {
      content: "Subtotal: ${cart.subtotal}"
    }

    text#total {
      content: "Total: ${cart.total}"
      font_size: 20
      font_weight: "bold"
    }
  }
}
```

**Cart items store:**
- Product ID and name
- Selected material variant
- Quantity
- Total price (base + material modifier)

### E-Commerce API Integration

```holoscript
button#checkout {
  on_tap {
    api_call: {
      endpoint: "https://your-store.com/api/checkout",
      method: "POST",
      headers: {
        "Authorization": "Bearer {api_token}",
        "Content-Type": "application/json"
      },
      body: {
        cart_items: cart.items.map(item => ({
          product_id: item.id,
          variant_id: item.selected_material,
          quantity: item.quantity,
          price: item.total_price
        })),
        total: cart.total,
        session_id: ar_session.id
      }
    }

    on_success {
      navigate_to: "checkout_confirmation"
    }

    on_error {
      show_error: "Checkout failed. Please try again."
    }
  }
}
```

---

## 8. Save & Share Features

### Screenshot Capture

```holoscript
function#save_room_layout {
  on_trigger {
    screenshot: {
      resolution: { width: 1920, height: 1080 }
      include_ui: false  // Hide UI in saved image
      filename: "room_layout_{timestamp}.jpg"
    }
  }
}
```

**Result**: High-res image of AR scene without UI overlays.

### Export Furniture List

```holoscript
export_json: {
  filename: "furniture_list_{timestamp}.json"
  data: {
    date: current_date,
    items: placed_furniture.map(item => ({
      id: item.id,
      name: item.name,
      material: item.selected_material,
      position: item.position,
      rotation: item.rotation,
      scale: item.scale,
      price: item.total_price
    })),
    total_price: placed_furniture.sum(item => item.total_price)
  }
}
```

**Use cases:**
- Save for later (persistent AR sessions)
- Share with interior designer
- Compare multiple layout options

### Share Dialog

```holoscript
show_share_dialog: {
  title: "Share Room Layout"
  message: "Send to email, messaging, or social media"
  options: ["Email", "SMS", "WhatsApp", "Instagram", "Save to Photos"]
}
```

**Platform integration**: Uses native share sheet on iOS/Android.

---

## Performance Optimization

### Model Optimization

```holoscript
settings {
  model_quality: "high"  // "low", "medium", "high"
  shadow_quality: "medium"
  max_texture_size: 2048
}
```

**Guidelines:**
- Keep models under 10,000 triangles
- Use 1K-2K textures (compress with Basis Universal)
- Enable LOD (Level of Detail) for complex furniture

### Mobile-Specific Settings

```holoscript
settings {
  // Performance
  max_placed_items: 20  // Prevent performance issues
  auto_save_interval: 60  // Save state every 60 seconds

  // Battery optimization
  reduce_quality_on_low_battery: true
  frame_rate_limit: 30  // 30 FPS on mobile
}
```

---

## Next Steps

Now that you understand AR furniture preview, try:

1. **Add new furniture** - Expand the product catalog
2. **Implement room scanning** - Measure real spaces automatically
3. **Add AI recommendations** - Suggest furniture based on room style
4. **Multi-user AR** - See furniture placed by friends/designers
5. **Integrate with your e-commerce platform** - Real product data and checkout

### Additional Resources

- [HoloScript AR Guide](../../../docs/AR_GUIDE.md) - Complete AR features
- [WebXR Specification](https://www.w3.org/TR/webxr/) - Web AR standards
- [ARKit Documentation](https://developer.apple.com/arkit/) - iOS native AR
- [ARCore Documentation](https://developers.google.com/ar) - Android native AR
- [Mobile UX Patterns](../../../docs/MOBILE_UX.md) - Best practices for mobile AR

---

## Key Concepts

| Concept | Description |
|---|---|
| `ar_session` | Configures the AR tracking mode, plane detection, and lighting estimation |
| `catalog` | Organized collection of products with categories, variants, and pricing |
| `ar_placement` | Controls where and how virtual objects are placed in AR space |
| `placement_reticle` | Visual indicator showing the valid placement location |
| `on_screen_tap` | Event handler for mobile touch-to-place interactions |
| `on_pinch_gesture` | Event handler for two-finger scale gesture |
| `on_horizontal_swipe` | Event handler for single-finger rotation gesture |
| `ar_lighting` | Matches virtual object lighting to the real-world environment |
| `api_call` | Makes HTTP requests to external services (e-commerce APIs, etc.) |
| `materials` | Color and texture variants with optional price modifiers |

---

## Best Practices

### AR Performance
- Keep GLB model poly count below 10,000 triangles per item
- Use Basis Universal texture compression for mobile bandwidth
- Cap concurrent placed objects at 20 to avoid frame rate drops
- Enable `reduce_quality_on_low_battery: true` for sustained performance

### User Experience
- Always show a placement reticle with clear color feedback (green/red)
- Provide haptic feedback on successful placement
- Use bottom-sheet UI for catalogs — avoids occlusion of AR view
- Show surface detection progress before allowing placement

### E-Commerce Integration
- Pass `session_id` with checkout calls for analytics attribution
- Store `selected_material` persistently so users don't re-select after reload
- Validate prices client-side and server-side to prevent manipulation

### Cross-Platform
- Test on both iOS Safari (WebXR) and Android Chrome before shipping
- Provide a fallback 3D viewer for browsers without AR support
- Use `HTTPS` — camera access is blocked on insecure origins

---

**Questions?** Join the HoloScript community on Discord or open an issue on GitHub.

**Happy building!** 🚀
