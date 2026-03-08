# AR Foundation Examples

Complete working examples demonstrating AR Foundation capabilities in HoloScript, targeting iOS ARKit and Android ARCore.

## Overview

This directory contains 5 comprehensive AR Foundation examples showcasing core mobile AR features:

1. **Plane Detection** - Surface detection and object placement
2. **Mesh Scanning** - Environment mesh reconstruction
3. **Persistent Anchors** - Cloud-based cross-session anchors
4. **Geospatial AR** - GPS-based AR content placement
5. **Light Estimation** - Real-time lighting adaptation

## Examples

### 1. Plane Detection (`plane-detection.holo`)

**Features:**
- Horizontal and vertical plane detection
- Visual plane indicators (color-coded by orientation)
- Object placement with reticle
- Drag, scale, and rotate placed objects
- Surface-constrained movement

**AR Traits:**
- `@plane_detection` - Plane detection system
- `@anchor` - Surface anchoring
- `@draggable` - Constrained to detected planes
- `@light_estimation` - Environmental lighting

**Compile:**
```bash
holoscript compile plane-detection.holo --target ios
holoscript compile plane-detection.holo --target android
```

**Use Case:**
- Furniture placement apps
- AR interior design
- Product visualization
- Spatial games

---

### 2. Mesh Scanning (`mesh-scanning.holo`)

**Features:**
- Real-time environment mesh reconstruction
- Semantic classification (walls, floors, tables, etc.)
- Color-coded mesh visualization
- Mesh statistics (vertices, faces, coverage)
- Export reconstructed mesh (OBJ, PLY, GLB)
- Occlusion rendering

**AR Traits:**
- `@mesh_detection` - Environment mesh scanning
- `@occlusion` - Realistic AR occlusion
- `@dynamic_mesh` - Real-time mesh updates

**Compile:**
```bash
holoscript compile mesh-scanning.holo --target ios
holoscript compile mesh-scanning.holo --target android
```

**Use Case:**
- 3D scanning apps
- Spatial mapping
- Architecture visualization
- Robotics navigation

---

### 3. Persistent Anchors (`persistent-anchors.holo`)

**Features:**
- Cloud anchor hosting and resolving
- Cross-session persistence
- Multi-device shared anchors
- Progress indicators for upload/download
- Local storage integration
- Anchor deletion and management

**AR Traits:**
- `@persistent_anchor` - Cross-session anchors
- `@shared_anchor` - Multi-user anchors
- `@anchor` - Spatial anchoring

**Compile:**
```bash
holoscript compile persistent-anchors.holo --target ios
holoscript compile persistent-anchors.holo --target android
```

**Configuration:**
Set environment variable:
```bash
export AR_CLOUD_API_KEY="your-google-cloud-api-key"
```

**Use Case:**
- Persistent AR art installations
- Multi-user AR experiences
- AR wayfinding
- Location-based AR games

---

### 4. Geospatial AR (`geospatial-ar.holo`)

**Features:**
- GPS-based AR content placement
- ARCore Geospatial API integration
- Visual Positioning System (VPS) support
- POI (Point of Interest) markers
- Distance calculation and LOD
- Terrain and rooftop anchors
- Real-time sun position

**AR Traits:**
- `@geospatial` - GPS/VPS positioning
- `@geospatial_anchor` - Location-based anchors
- `@terrain_anchor` - Terrain-snapped anchors
- `@rooftop_anchor` - Rooftop placement
- `@vps` - Visual positioning

**Compile:**
```bash
holoscript compile geospatial-ar.holo --target android
# Limited iOS support - primarily Android ARCore
```

**Configuration:**
Set environment variable:
```bash
export GOOGLE_GEOSPATIAL_API_KEY="your-geospatial-api-key"
```

**Use Case:**
- Tourism and travel apps
- AR navigation
- Location-based storytelling
- Outdoor AR experiences
- City-scale AR

---

### 5. Light Estimation (`light-estimation.holo`)

**Features:**
- Real-time ambient light estimation
- HDR environment probes
- Adaptive material properties
- Shadow intensity adaptation
- Color temperature matching
- Spherical harmonics lighting
- PBR material adaptation

**AR Traits:**
- `@light_estimation` - Environmental lighting
- `@shadow_caster` - Dynamic shadows
- `@shadow_receiver` - Shadow planes

**Compile:**
```bash
holoscript compile light-estimation.holo --target ios
holoscript compile light-estimation.holo --target android
```

**Use Case:**
- Realistic product visualization
- AR try-on experiences
- Virtual photography
- Film pre-visualization

---

## Platform Support

| Feature | iOS ARKit | Android ARCore |
|---------|-----------|----------------|
| Plane Detection | ✅ | ✅ |
| Mesh Scanning | ✅ (LiDAR) | ✅ (Depth API) |
| Persistent Anchors | ✅ | ✅ (Cloud Anchors) |
| Geospatial AR | ⚠️ Limited | ✅ (Geospatial API) |
| Light Estimation | ✅ (HDR) | ✅ (HDR) |

## Device Requirements

### iOS
- iPhone XR or newer (ARKit 3.0+)
- iPhone 12 Pro or newer (LiDAR for mesh scanning)
- iOS 13.0+

### Android
- ARCore-supported devices
- Android 7.0+ (API level 24)
- Google Play Services for AR
- Depth API support for mesh scanning

## Common AR Traits Reference

All examples use these common AR traits:

- `@anchor` - Spatial anchoring to real-world surfaces
- `@plane_detection` - Detect horizontal/vertical planes
- `@mesh_detection` - Scan environment meshes
- `@persistent_anchor` - Cross-session anchors
- `@shared_anchor` - Multi-device shared anchors
- `@geospatial` - GPS/VPS positioning
- `@geospatial_anchor` - Location-based anchors
- `@terrain_anchor` - Terrain-snapped anchors
- `@rooftop_anchor` - Rooftop-based anchors
- `@vps` - Visual Positioning System
- `@light_estimation` - Environmental lighting
- `@occlusion` - AR occlusion rendering
- `@shadow_caster` - Cast shadows
- `@shadow_receiver` - Receive shadows

## Best Practices

### 1. Plane Detection
- Start with horizontal planes for easier user onboarding
- Show visual feedback during plane scanning
- Require minimum plane area (0.25m²+) for placement
- Use placement reticle for clear user intent

### 2. Mesh Scanning
- Update mesh at reasonable intervals (100-200ms)
- Use LOD (Level of Detail) for performance
- Enable semantic classification for advanced features
- Export mesh in standard formats (OBJ, PLY)

### 3. Persistent Anchors
- Host anchors in well-textured areas
- Show upload/download progress indicators
- Handle failure cases gracefully
- Set appropriate TTL (Time To Live)
- Store anchor IDs in local storage

### 4. Geospatial AR
- Check VPS availability before relying on it
- Fall back to GPS-only mode when VPS unavailable
- Use terrain anchors for outdoor experiences
- Calculate distance for LOD optimization
- Update POI markers based on user location

### 5. Light Estimation
- Use HDR mode for best results
- Apply spherical harmonics for ambient lighting
- Adapt material properties to environment
- Use environment probes for realistic reflections
- Match color temperature for realism

## API Keys & Configuration

### Google Cloud Anchors
1. Enable ARCore API in Google Cloud Console
2. Create API key with ARCore restrictions
3. Set environment variable: `AR_CLOUD_API_KEY`

### Geospatial API
1. Enable ARCore API and Maps SDK in Google Cloud Console
2. Create API key with ARCore + Maps restrictions
3. Set environment variable: `GOOGLE_GEOSPATIAL_API_KEY`

## Compilation Targets

All examples support these compilation targets:

```bash
# iOS (Swift + ARKit)
holoscript compile <example>.holo --target ios

# Android (Kotlin + ARCore + Sceneform)
holoscript compile <example>.holo --target android

# Unity (cross-platform)
holoscript compile <example>.holo --target unity

# Unreal Engine
holoscript compile <example>.holo --target unreal

# WebXR (AR Module)
holoscript compile <example>.holo --target webxr

# Three.js + WebXR
holoscript compile <example>.holo --target r3f
```

## Testing

### iOS Testing
```bash
# Compile for iOS
holoscript compile plane-detection.holo --target ios

# Open in Xcode
open plane-detection/plane-detection.xcodeproj

# Run on device (simulators don't support ARKit)
```

### Android Testing
```bash
# Compile for Android
holoscript compile plane-detection.holo --target android

# Open in Android Studio
studio plane-detection/

# Run on ARCore-supported device
adb install -r plane-detection.apk
```

## Resources

- [HoloScript AR Traits Reference](../../docs/TRAITS_REFERENCE.md#arspatial-traits)
- [ARKit Documentation](https://developer.apple.com/documentation/arkit)
- [ARCore Documentation](https://developers.google.com/ar)
- [AR Foundation Unity](https://docs.unity3d.com/Packages/com.unity.xr.arfoundation@latest)

## License

MIT License - See [../../LICENSE](../../LICENSE)

## Related Examples

- [iOS AR App](../platforms/ios-ar-app.holo) - Basic iOS ARKit example
- [Android AR App](../platforms/android-ar-app.holo) - Basic Android ARCore example
- [AndroidXR App](../platforms/androidxr-app.holo) - AndroidXR headset example
- [Cross-Reality Examples](../cross-reality/) - Cross-platform AR/VR/MR

---

**HoloScript AR Foundation Examples v1.0.0**
*Complete working examples for mobile AR development*
*iOS ARKit + Android ARCore + Cross-Platform Compilation*
