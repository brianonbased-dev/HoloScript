# AR Furniture Preview - E-Commerce Application

**Universal HoloScript example demonstrating mobile AR for e-commerce.**

## Overview

This example showcases HoloScript's AR capabilities for creating "try before you buy" experiences. Users can preview furniture in their real spaces using their phone camera, with realistic lighting, scaling, and material options.

### Key Features

✓ **Real-World Placement**
- Markerless AR plane detection
- Horizontal surface tracking (floors, tables)
- Environmental lighting matching
- Realistic shadows on real surfaces

✓ **Product Configuration**
- Multiple color/material variants
- Real-time scaling and rotation
- Accurate dimension measurements
- Interactive product catalog

✓ **E-Commerce Integration**
- Shopping cart functionality
- Price calculations with material modifiers
- Save and share room layouts
- Checkout flow integration

✓ **Mobile-First Design**
- Touch gestures (tap, drag, pinch, swipe)
- Haptic feedback
- Optimized for iOS Safari and Android Chrome
- Works in WebXR AR (no app install required)

## 🎯 Learning Objectives

After completing this example, you'll learn how to:

1. **Implement AR plane detection** and surface tracking
2. **Match real-world lighting** for realistic rendering
3. **Handle mobile gestures** (tap, drag, pinch, rotate)
4. **Build product catalogs** with variants and pricing
5. **Create AR UI overlays** that follow 3D objects
6. **Export to mobile platforms** (WebXR AR, ARKit, ARCore)

## Quick Start

### Compile to Your Platform

```bash
# WebXR AR (recommended for web-based deployment)
holoscript compile furniture-catalog.holo --target webxr-ar --output ./output/webxr/

# ARKit (native iOS app)
holoscript compile furniture-catalog.holo --target arkit --output ./output/ios/

# ARCore (native Android app)
holoscript compile furniture-catalog.holo --target arcore --output ./output/android/
```

### Run the Experience

#### WebXR AR (Browser - Easiest)

1. Host compiled HTML/JS files on HTTPS web server (required for camera access)
2. Open URL on iPhone (iOS 15+) or Android phone (Chrome)
3. Tap "Start AR" button
4. Point camera at floor or flat surface
5. Tap to place furniture

**Platform Support:**
- **iOS**: Safari 15+, iOS 15+
- **Android**: Chrome 90+, Android 9+

#### ARKit (Native iOS)

1. Import compiled Swift files into Xcode project
2. Enable Camera and ARKit capabilities
3. Build for iOS device (AR requires physical device, not simulator)
4. Deploy via Xcode or TestFlight

**Requirements:**
- **iPhone**: iPhone 6s or newer with iOS 13+
- **iPad**: iPad Pro, iPad (5th gen+) with iOS 13+

#### ARCore (Native Android)

1. Import compiled Kotlin/Java files into Android Studio project
2. Add ARCore dependency to build.gradle
3. Enable camera permissions in AndroidManifest.xml
4. Build APK and deploy to ARCore-compatible device

**Requirements:**
- **Android**: ARCore-compatible device (see Google's list)
- **OS**: Android 7.0 (Nougat) or newer

## 📖 Code Walkthrough

### AR Session Setup (Lines 19-58)

```holoscript
ar_session#furniture_preview @mobile @markerless {
  mode: "world_tracking"
  plane_detection: "horizontal"
  light_estimation: true
  environmental_hdr: true

  features {
    occlusion: true  // Furniture goes behind real objects
    shadows: true   // Cast realistic shadows
  }
}
```

Configures the AR session for furniture placement with environmental understanding.

### Product Catalog (Lines 62-176)

```holoscript
catalog#furniture_items {
  category "Living Room" {
    product#modern_sofa @furniture @interactive {
      id: "SOFA-001"
      name: "Modern Sectional Sofa"
      price: 1299.99
      dimensions: { width: 2.4, depth: 1.6, height: 0.8 }

      materials: [
        { id: "gray_fabric", name: "Charcoal Gray", price_modifier: 0 },
        { id: "leather_black", name: "Black Leather", price_modifier: 300 }
      ]
    }
  }
}
```

Defines product data with variants and pricing.

### AR Placement (Lines 180-235)

```holoscript
ar_placement#furniture_placer {
  object#placement_reticle @ar_indicator {
    type: "circle"
    color: #00ff00
    align_to_surface: true
  }

  on_screen_tap {
    if (placement_valid && selected_product) {
      spawn_furniture: {
        product: selected_product,
        position: reticle.position,
        material: selected_material
      }
    }
  }
}
```

Handles placement validation and spawning furniture at tap location.

### Gesture Controls (Lines 239-298)

```holoscript
behavior#placed_furniture_controls {
  on_horizontal_swipe {
    rotate_furniture: { axis: "y", smooth: true }
  }

  on_pinch_gesture {
    scale_furniture: {
      min_scale: 0.5,
      max_scale: 1.5,
      maintain_aspect_ratio: true
    }
  }

  on_drag_gesture {
    move_furniture: {
      constraint: "horizontal_plane",
      collision_check: true
    }
  }
}
```

Implements intuitive touch gestures for manipulation.

### Product Configuration UI (Lines 357-467)

```holoscript
ui#config_panel @floating @contextual {
  position: "above_furniture"
  visible: furniture_selected

  section#materials {
    grid#material_swatches {
      for_each_material {
        swatch_button {
          background: material.texture
          on_tap {
            apply_material: { furniture: selected_furniture, material: this }
            update_price: material.price_modifier
          }
        }
      }
    }
  }
}
```

Floating UI panel for configuring placed furniture.

### Environmental Lighting (Lines 632-670)

```holoscript
ar_lighting#environment_match @auto {
  light_estimation: true

  on_light_update {
    scene.ambient_intensity = estimated_intensity
    scene.ambient_color = estimated_color

    for_each_placed_furniture {
      update_material_lighting: {
        furniture: this,
        ambient: scene.ambient_color
      }
    }
  }

  shadow_casting {
    enabled: true
    receive_on_planes: true
  }
}
```

Matches virtual furniture lighting to real-world environment.

## 🎓 Use Cases

### E-Commerce Retailers
- Furniture stores (IKEA, Wayfair, West Elm)
- Home decor and appliances
- Outdoor furniture and patio sets
- Office furniture suppliers

### Interior Design
- Design consultations
- Space planning
- Client presentations
- Virtual staging for real estate

### B2B Applications
- Trade show demos
- Sales presentations
- Showroom alternatives
- Remote product demonstrations

## ⚙️ Customization

### Adding New Products

```holoscript
product#new_item @furniture @interactive {
  id: "ITEM-XXX"
  name: "Product Name"
  price: 999.99
  dimensions: { width: X, depth: Y, height: Z }
  model: "model_file.glb"

  materials: [
    { id: "variant1", name: "Variant 1", texture: "texture1.png", price_modifier: 0 }
  ]
}
```

### Changing UI Branding

Update UI colors and fonts (lines 302-356):
```holoscript
ui#catalog_panel @bottom_sheet {
  background: #ffffff  // Your brand color
  border_radius: { top_left: 20, top_right: 20 }

  tab_bar#categories {
    active_color: #2196f3  // Your primary brand color
  }
}
```

### Customizing Gestures

Modify gesture handlers (lines 239-298):
```holoscript
on_pinch_gesture {
  scale_furniture: {
    min_scale: 0.3,  // Smaller minimum
    max_scale: 2.0,  // Larger maximum
  }
}
```

### Integration with E-Commerce Platform

```holoscript
button#add_to_cart {
  on_tap {
    // Call your e-commerce API
    api_call: {
      endpoint: "https://your-store.com/api/cart/add",
      method: "POST",
      body: {
        product_id: selected_furniture.id,
        variant: selected_furniture.selected_material,
        quantity: 1
      }
    }
  }
}
```

## 📊 Analytics & Tracking

Track user behavior:
- Products viewed in AR
- Placement attempts vs. completions
- Time spent configuring each product
- Material variant preferences
- Cart abandonment rates

```holoscript
on_furniture_placed {
  track_event: {
    event: "ar_placement",
    properties: {
      product_id: furniture.id,
      category: furniture.category,
      material: furniture.selected_material,
      session_duration: session_time
    }
  }
}
```

## 🔧 Technical Details

### Performance Targets
- **WebXR AR**: 30 FPS on iPhone 12/13, 60 FPS on iPhone 14+
- **ARKit**: 60 FPS on iPhone SE (2nd gen) or newer
- **ARCore**: 30-60 FPS on mid-range Android phones

### Model Optimization
- **Polygon Count**: <10,000 triangles per furniture item
- **Textures**: 1K-2K resolution (compress with Basis Universal)
- **File Size**: <5 MB per .glb model
- **LOD**: Use multiple detail levels for complex items

### Browser Requirements

**iOS (Safari/Chrome)**
- iOS 15.0+ for WebXR AR support
- HTTPS required (camera permissions)
- No installation needed

**Android (Chrome)**
- Chrome 90+ with WebXR support
- ARCore-compatible device
- HTTPS required

### Platform-Specific Features

**WebXR AR**
- ✅ Works in browser (no app install)
- ✅ Cross-platform (iOS + Android)
- ⚠️ Limited to horizontal plane detection
- ⚠️ No people occlusion

**ARKit (iOS)**
- ✅ People occlusion (iPhone 12+)
- ✅ LiDAR depth scanning (iPhone Pro models)
- ✅ Better plane detection
- ❌ Requires native app

**ARCore (Android)**
- ✅ Environmental HDR lighting
- ✅ Depth API (on supported devices)
- ✅ Cloud Anchors for persistent placement
- ❌ Requires native app

## 🎨 Design Best Practices

### AR UX Guidelines

1. **Clear Instructions**: Guide users through AR setup
2. **Visual Feedback**: Show plane detection and placement validation
3. **Realistic Scaling**: Ensure furniture appears life-size
4. **Lighting Match**: Match virtual and real-world lighting
5. **Shadow Realism**: Cast accurate shadows on real surfaces

### Mobile UI Patterns

- **Bottom Sheets**: Product catalogs, settings
- **Floating Panels**: Product configuration (follows furniture)
- **Top Toolbars**: Navigation, cart, menu
- **Toast Notifications**: Feedback for quick actions
- **Gesture Hints**: Show available gestures on first use

### Accessibility

```holoscript
settings {
  haptic_feedback: true  // Vibration for touch events
  audio_feedback: true   // Sounds for placement/removal
  high_contrast: false   // High contrast UI mode
}
```

## 📚 Further Reading

- [HoloScript AR Guide](../../../docs/AR_GUIDE.md)
- [Mobile Gesture Patterns](../../../docs/MOBILE_GESTURES.md)
- [WebXR AR Specification](https://www.w3.org/TR/webxr/)
- [ARKit Documentation](https://developer.apple.com/arkit/)
- [ARCore Documentation](https://developers.google.com/ar)

## 🤝 Contributing

Improvements welcome! Ideas:
- Multi-user AR (see furniture placed by friends)
- Room scanning and measurement
- AI-powered furniture recommendations
- Social sharing integration
- AR try-on for decor items

## 📄 License

This example is provided under the MIT License. Use freely in commercial projects.

---

**Built with HoloScript** - Write once, deploy everywhere. 🌐

**Perfect for**: Furniture retailers, interior designers, real estate staging, e-commerce AR experiences.
