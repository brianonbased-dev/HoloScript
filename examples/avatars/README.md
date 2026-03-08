# Avatar System Examples

Comprehensive avatar system examples demonstrating HoloScript's avatar capabilities for VR/AR platforms.

## Examples

### 1. Ready Player Me Avatar (`readyplayerme-avatar.holo`)

Full Ready Player Me integration with VRM 1.0 export support.

**Features:**
- Humanoid skeleton with full bone mapping
- 52 VRM-standard blend shapes (eyes, mouth, expressions)
- Auto-blink and lip sync systems
- IK support for natural hand placement
- Avatar embodiment with full-body tracking
- Quest 3 performance optimizations (10K tri budget)
- VRM 1.0 metadata (licensing, first-person view, look-at)

**Traits Used:**
- `@skeleton` - Humanoid rig with animation blend trees
- `@morph` - Blend shapes for facial animation
- `@ik` - Inverse kinematics for arm chains
- `@avatar_embodiment` - Full avatar pipeline (tracking, lip sync, emotions)
- `@body_tracking` - Full-body skeleton tracking

**Usage:**
```bash
holoscript compile readyplayerme-avatar.holo --target vrm
holoscript compile readyplayerme-avatar.holo --target quest
```

**Performance:**
- **Triangles:** ~10,000 (Quest 3 budget)
- **Textures:** 1K (1024x1024)
- **Bone Influences:** 4
- **Material Slots:** 3
- **VRM Version:** 1.0

---

### 2. VRChat Avatar (`vrchat-avatar.holo`)

VRChat SDK3-compatible avatar with performance ranking system.

**Features:**
- VRChat standard humanoid rig
- 15 viseme blend shapes (VRChat lip sync)
- Clothing toggle system (hat, glasses, jacket, shoes)
- PhysBones physics (hair, tail)
- Gesture system (8 hand poses per hand)
- Expression menu controls
- Performance rank: "Good" for Quest

**Traits Used:**
- `@skeleton` - VRChat animation layers and parameters
- `@morph` - VRChat viseme blend shapes
- `@clothing` - Toggleable clothing meshes with physics
- `@vrc_station` - VRChat sitting station

**VRChat Parameters:**
- `VelocityX`, `VelocityZ` - Movement direction
- `Grounded`, `Seated`, `AFK` - State tracking
- `Viseme` (0-14) - Lip sync index
- `GestureLeft/Right` (0-7) - Hand gesture index
- `VRMode`, `TrackingType` - Platform detection

**Performance Ranking (Quest "Good"):**
- **Triangles:** 7,500 / 10,000
- **Materials:** 1 / 1
- **Meshes:** 1 / 1
- **Bones:** 75 / 75
- **PhysBones:** 8 / 8
- **Texture Memory:** 40 MB / 40 MB
- **Download Size:** 10 MB / 10 MB

**Usage:**
```bash
holoscript compile vrchat-avatar.holo --target vrchat
```

---

### 3. Locomotion Systems (`locomotion-systems.holo`)

Comprehensive locomotion examples with physics integration.

**Features:**
- **Walk/Run/Sprint** - Multi-speed locomotion with blend trees
- **Jump** - Variable-height jumping with air time
- **Crouch** - Crouching with reduced height and speed
- **Climb** - Wall climbing with 4-directional movement
- **Swim** - Swimming with buoyancy and water physics
- **Slide/Roll** - Special movement animations
- **Foot IK** - Ground adaptation with weight blending
- **Coyote Time** - Forgiving jump timing
- **Jump Buffering** - Pre-input jump queuing

**Traits Used:**
- `@skeleton` - Animation blend trees for all movement modes
- `@character` - Full character controller with physics
- `@ik` - Foot IK for ground adaptation
- `@physics` - Collision and ground detection
- `@water` - Water zone with buoyancy
- `@climbable` - Climbable surfaces

**Character Controller Config:**
- Walk Speed: 3.0 m/s
- Run Speed: 5.0 m/s
- Sprint Speed: 8.0 m/s
- Crouch Speed: 1.5 m/s
- Swim Speed: 3.5 m/s
- Jump Height: 1.2 m
- Coyote Time: 0.15s
- Jump Buffer: 0.1s

**Animation Blend Trees:**
- `GroundMovement` - 2D freeform (idle, walk, run, sprint, strafe)
- `CrouchMovement` - 1D (idle, walk)
- `ClimbMovement` - 2D simple (up, down, left, right)
- `SwimMovement` - 1D (idle, forward)

**Usage:**
```bash
holoscript compile locomotion-systems.holo --target unity
holoscript compile locomotion-systems.holo --target unreal
```

---

### 4. Avatar Customization (`avatar-customization.holo`)

Runtime avatar customization system with modular components.

**Features:**
- **Body Morphs** - Height, build, muscle mass, proportions
- **Face Morphs** - 10+ facial feature sliders
- **Skin Tones** - 4 presets + custom color picker
- **Hair System** - 6 hairstyles with color customization
- **Eye Colors** - 5 presets + custom
- **Facial Hair** - 5 styles (none, stubble, beard, goatee, mustache)
- **Clothing Sets** - 5 complete outfits (mesh swapping)
- **Material Customization** - PBR materials with presets
- **Export System** - VRM 1.0 export with custom settings
- **Randomization** - One-click random character generation

**Traits Used:**
- `@skeleton` - Humanoid base rig
- `@morph` - 30+ blend shapes for body/face customization
- `@customizable` - Customization category system
- `@ui_panel` - 3D spatial customization UI
- `@mirror` - Real-time preview mirror

**Customization Categories:**
1. **Body Type** - Athletic, Slim, Heavy, Tall, Short
2. **Skin Tone** - Fair, Medium, Tan, Dark, Custom
3. **Hair Style** - Short, Medium, Long, Bald, Ponytail, Braids
4. **Hair Color** - Black, Brown, Blonde, Red, Gray, Custom
5. **Eye Color** - Brown, Blue, Green, Hazel, Gray, Custom
6. **Facial Hair** - None, Stubble, Beard, Goatee, Mustache
7. **Clothing Set** - Casual, Formal, Athletic, Fantasy, SciFi

**Body Sliders:**
- Body Height (0-1)
- Body Build (0=thin, 1=muscular)
- Muscle Mass (0-1)
- Shoulder Width (0-1)
- Hip Width (0-1)

**Face Sliders:**
- Face Width, Jaw Width, Nose Size, Eye Size, Mouth Size

**Material Presets:**
- **Skin:** PBR with subsurface scattering (4 tone presets)
- **Hair:** Anisotropic shader (5 color presets)
- **Eyes:** Eye shader with iris/pupil control (5 color presets)

**Usage:**
```bash
holoscript compile avatar-customization.holo --target babylon
holoscript run avatar-customization.holo --dev
```

**API Example:**
```javascript
// Apply preset customization
avatar.applyBodyType("Athletic")
avatar.applySkinTone("Medium")
avatar.applyHairStyle("Ponytail")
avatar.applyHairColor("Brown")
avatar.applyEyeColor("Blue")

// Use sliders
avatar.setBodyHeight(0.7)  // Tall
avatar.setBodyBuild(0.6)   // Muscular
avatar.setMuscleMass(0.5)

// Export to VRM
avatar.emit("exportAvatar")

// Randomize
avatar.emit("randomize")
```

---

## Common Traits

All examples use these core HoloScript traits:

### `@skeleton`
Bone-based skeletal animation with blend trees and IK support.

**Config:**
- `rigType: "humanoid"` - VRM/Unity humanoid mapping
- `humanoidMap` - Bone name mapping
- `clips` - Animation clips (idle, walk, run, etc.)
- `blendTrees` - 1D/2D animation blending
- `layers` - Animation layers (base, additive, gesture, etc.)
- `parameters` - Runtime animation parameters
- `rootMotion` - Enable root motion for movement

### `@morph`
Blend shapes for facial animation and body morphing.

**Features:**
- Morph targets with weight ranges
- Presets for quick expression changes
- Auto-blink with randomization
- Lip sync with viseme mapping
- Animation clips for morph sequences

### `@ik`
Inverse kinematics for procedural animation.

**Solvers:**
- `fabrik` - Forward And Backward Reaching IK
- `ccd` - Cyclic Coordinate Descent
- `two-bone` - Optimized for arms/legs

**Config:**
- `chain` - Bone chain definition
- `target` - IK target position
- `poleTarget` - Elbow/knee hint
- `iterations` - Solver iterations (5-10)
- `tolerance` - Distance threshold (0.001-0.01)

### `@character`
Full character controller with physics.

**Features:**
- Walk, run, sprint, crouch speeds
- Jumping with coyote time and buffering
- Ground detection and slope handling
- Swimming and climbing modes
- Stamina system
- Physics interactions

### `@avatar_embodiment`
Full AI/user avatar pipeline.

**Pipeline Stages:**
1. `idle` - Waiting for input
2. `listening` - STT active (user speaking)
3. `processing` - LLM generating response
4. `speaking` - TTS playing with lip sync
5. `transitioning` - Between states

**Features:**
- Lip sync integration
- Emotion directives
- Mirror expressions
- Eye tracking
- Voice output configuration

---

## Export Targets

### VRM 1.0
```bash
holoscript compile [file].holo --target vrm
```

**Outputs:**
- `.vrm` file (VRM 1.0 spec)
- Humanoid bone mapping
- Blend shape mappings
- Material definitions
- First-person view annotations
- Metadata (license, author, usage rights)

### VRChat (Unity SDK3)
```bash
holoscript compile [file].holo --target vrchat
```

**Outputs:**
- Unity prefab with Animator
- VRChat Avatar Descriptor
- Expression Parameters asset
- Expressions Menu asset
- VRC PhysBones components
- Performance ranking metadata

### Ready Player Me
```bash
holoscript compile [file].holo --target rpm
```

**Outputs:**
- `.glb` file with RPM structure
- Ready Player Me JSON metadata
- Texture atlases (1K for mobile)
- Optimized mesh (10K tris)

### Quest 3
```bash
holoscript compile [file].holo --target quest
```

**Optimizations:**
- Triangle budget: 10K
- Texture size: 1K (1024x1024)
- Material slots: 1-3
- GPU skinning enabled
- Texture compression (ASTC)
- Mesh batching

---

## Performance Budgets

| Platform | Triangles | Materials | Textures | Bones | Draw Calls |
|----------|-----------|-----------|----------|-------|------------|
| **Quest 3** | 10,000 | 1-3 | 1K-2K | 75 | 1-2 |
| **VRChat Quest** | 7,500 | 1 | 512 | 75 | 1 |
| **PC VR** | 70,000 | 8 | 2K-4K | 256 | 4-8 |
| **Ready Player Me** | 10,000 | 3 | 1K | 75 | 1 |
| **VRM 1.0** | Flexible | Flexible | Flexible | Flexible | Flexible |

---

## Best Practices

### 1. Skeleton Setup
- Use consistent bone naming (VRM standard recommended)
- Keep bone count under 75 for mobile VR
- Enable root motion for realistic movement
- Use blend trees for smooth locomotion transitions

### 2. Blend Shapes
- Limit to 50-100 morph targets for performance
- Use categories to organize (eyes, mouth, body, expression)
- Enable auto-blink for realism (3-5s interval)
- Map visemes for lip sync (VRM or VRChat standard)

### 3. IK Optimization
- Use 2-bone IK for arms/legs (faster than FABRIK)
- Limit iterations to 5-10
- Disable IK during climbing/swimming if not needed
- Blend IK weight based on grounded state

### 4. Performance
- Combine meshes where possible (body + outfit)
- Atlas textures to reduce material slots
- Use GPU skinning for mobile VR
- Implement LOD system for distant avatars
- Compress textures (ASTC for Quest, BC7 for PC)

### 5. VRM Compatibility
- Follow VRM 1.0 spec for blend shape naming
- Set proper metadata (license, usage rights)
- Define first-person view annotations
- Configure look-at system for eye movement

### 6. VRChat Optimization
- Target "Good" rank for Quest (7.5K tris)
- Use 1 material slot maximum
- Limit PhysBones to 8
- Keep texture memory under 40 MB
- Use expressions menu for toggles/gestures

---

## Testing

Run examples in development mode:

```bash
# Browser preview
holoscript run readyplayerme-avatar.holo --dev

# Unity editor
holoscript compile vrchat-avatar.holo --target unity --dev

# Standalone test
holoscript test locomotion-systems.holo
```

---

## Additional Resources

- [HoloScript Trait Reference](../../docs/traits/index.md)
- [VRM 1.0 Specification](https://github.com/vrm-c/vrm-specification)
- [VRChat Performance Ranking](https://docs.vrchat.com/docs/avatar-performance-ranking-system)
- [Ready Player Me Docs](https://docs.readyplayer.me/)
- [Character Controller Guide](../../docs/guides/character-controller.md)
- [Animation Blend Trees](../../docs/guides/animation-blend-trees.md)

---

**Created:** 2026-03-07
**HoloScript Version:** 3.43+
**Targets:** VRM 1.0, VRChat SDK3, Ready Player Me, Quest 3
