# Earthquake Demo - Visual Quality Checklist

**Purpose**: Manual testing guide for visual quality, user experience, and polish validation

---

## ✅ Pre-Flight Checklist

### Environment Setup
- [ ] WebGPU browser (Chrome/Edge 113+, Safari TP)
- [ ] GPU acceleration enabled
- [ ] 1920×1080 or higher resolution
- [ ] 60Hz+ display refresh rate
- [ ] Console open for FPS monitoring

---

## 🎮 Interactive Controls Testing

### UI Controls
- [ ] **Trigger Button**
  - Click triggers earthquake
  - Button state changes appropriately
  - Status message displays

- [ ] **Reset Button**
  - Restores building to intact state
  - Clears all debris
  - Resets statistics
  - Camera shake stops

- [ ] **Intensity Slider** (1-10)
  - Slider moves smoothly
  - Value updates in real-time
  - Higher intensity = stronger shaking
  - Building fails faster at high intensity

- [ ] **Duration Slider** (1-15s)
  - Slider moves smoothly
  - Value updates in real-time
  - Earthquake stops after duration
  - Collapse continues after earthquake ends

- [ ] **Camera Mode Selector**
  - All 5 modes selectable
  - Smooth transitions between modes
  - Names display correctly
  - Current mode highlighted

- [ ] **Slow Motion Toggle**
  - Checkbox toggles correctly
  - Playback speed changes (0.25×)
  - Animation remains smooth
  - Physics accuracy maintained

- [ ] **Debug Info Toggle**
  - Checkbox toggles stats panel
  - Panel shows/hides smoothly
  - Stats update in real-time
  - All metrics display correctly

### Keyboard Shortcuts
- [ ] **Space** - Trigger earthquake
- [ ] **R** - Reset simulation
- [ ] **S** - Toggle slow motion
- [ ] **1** - Overview camera (default)
- [ ] **2** - Street level camera
- [ ] **3** - Top-down camera
- [ ] **4** - Cinematic camera

### Stats Display
- [ ] FPS counter updates
- [ ] Structural integrity percentage (0-100%)
- [ ] Active debris count
- [ ] Total debris count
- [ ] Collapse event count
- [ ] Status indicator (Stable/Earthquake/Collapsing)

---

## 📹 Camera System Testing

### Camera Presets
- [ ] **Overview (Default)**
  - Position: [30, 20, 30]
  - Clear isometric view of building
  - All floors visible
  - Good vantage point for collapse

- [ ] **Street Level**
  - Position: [50, 2, 0]
  - Ground-level perspective
  - Dramatic during collapse
  - Debris falls toward camera

- [ ] **Top-Down**
  - Position: [0, 80, 0.1]
  - Architect view from above
  - Floor layout visible
  - Collapse pattern clear

- [ ] **Cinematic**
  - Position: [40, 15, 40]
  - Dramatic angle
  - Good for recording
  - Balanced composition

- [ ] **Free**
  - User-controlled
  - Manual orbit/pan/zoom works
  - Smooth movement
  - No jarring transitions

### Camera Transitions
- [ ] Smooth interpolation between presets
- [ ] Ease-in-out motion (not linear)
- [ ] FOV interpolates correctly
- [ ] No camera "snapping"
- [ ] 1.5s default transition feels natural

### Camera Shake
- [ ] **Shake Activation**
  - Starts immediately with earthquake
  - Intensity matches slider setting
  - Visible but not nauseating
  - Natural multi-frequency motion

- [ ] **Shake Quality**
  - Not purely sinusoidal (boring)
  - Multi-frequency composition visible
  - Horizontal > vertical (realistic)
  - Smoothly integrated with camera position

- [ ] **Shake Falloff**
  - Exponential decay feels natural
  - Fades out smoothly
  - Stops cleanly at end
  - No residual jitter

- [ ] **Shake During Transitions**
  - Works correctly during camera moves
  - No interference between systems
  - Smooth combined motion
  - Position offset applied correctly

---

## 🏗️ Building Appearance

### Structural Elements
- [ ] **Foundation**
  - Visible at ground level
  - Appropriate size (full footprint)
  - Distinct from other elements
  - Connected to columns

- [ ] **Columns**
  - Grid pattern visible
  - 4×4 = 16 columns per floor (default)
  - Vertical alignment correct
  - Appropriate thickness (0.4m)

- [ ] **Beams**
  - Horizontal spans between columns
  - 12 beams per floor (default)
  - Connected at column intersections
  - Appropriate thickness (0.3m)

- [ ] **Floors**
  - Full floor slabs visible
  - 3m spacing (default)
  - Covering full footprint
  - Appropriate thickness (0.2m)

### Building Composition
- [ ] **5-Floor Building** (Default)
  - Total height: ~15m
  - Proportions look realistic
  - Not too tall or squat
  - Stable appearance when intact

- [ ] **10-Floor Building** (Max)
  - Total height: ~30m
  - Taller but not ridiculous
  - Proportions still good
  - More dramatic collapse

- [ ] **Color/Material Differentiation**
  - Different materials distinguishable
  - Concrete vs steel visible
  - Foundation distinct
  - Floor slabs different from beams

### Visual Defects to Check
- [ ] No Z-fighting (flickering)
- [ ] No gaps between elements
- [ ] No overlapping geometry
- [ ] Proper depth sorting
- [ ] Shadows (if implemented)
- [ ] Anti-aliasing working

---

## 🌊 Earthquake Visual Effects

### Ground Motion
- [ ] **Initial Shake**
  - Starts immediately
  - Builds to full intensity quickly
  - Visible building sway
  - Appropriate frequency (2-3 Hz)

- [ ] **Sustained Shake**
  - Maintains intensity during duration
  - Multi-directional (X, Y, Z)
  - Not purely cyclic
  - Feels chaotic/natural

- [ ] **Shake Cessation**
  - Stops at end of duration
  - Building may continue to collapse
  - No sudden freeze
  - Smooth transition

### Building Response
- [ ] **Initial Stress**
  - Building begins to sway
  - No immediate failure (unless intensity 10)
  - Stress accumulation visible in stats
  - Weak points activate

- [ ] **First Failures**
  - Occur after stress buildup
  - Lower floors fail first (higher stress)
  - Visible element damage
  - Debris begins spawning

- [ ] **Progressive Collapse**
  - Spreads from failure point
  - Floor-by-floor progression visible
  - Cascade effect observable
  - Realistic fall pattern

- [ ] **Final Collapse**
  - Building settles to ground
  - Debris cloud forms
  - Particles scatter realistically
  - No floating elements

---

## 💥 Debris Particle Effects

### Debris Spawning
- [ ] **Spawn Location**
  - Originates from failed element
  - Spreads from failure point
  - Appropriate initial velocity
  - Ejection feels natural

- [ ] **Spawn Count**
  - More debris = larger elements
  - Crush mode = more particles
  - Snap mode = fewer particles
  - Capped at 500 per element

- [ ] **Spawn Timing**
  - Immediate on failure
  - No lag or delay
  - Synchronized with collapse
  - Frame rate maintained

### Debris Motion
- [ ] **Gravity**
  - Falls downward (9.8 m/s²)
  - Accelerates realistically
  - No floating particles
  - Terminal velocity looks right

- [ ] **Initial Velocity**
  - Ejected outward from failure
  - Randomized directions
  - Upward bias (explosion effect)
  - Speed 2-7 m/s range

- [ ] **Air Drag**
  - Particles slow over time
  - Not too fast (0.98 factor)
  - Visible deceleration
  - Settles realistically

- [ ] **Angular Velocity**
  - Particles rotate/tumble
  - Random rotation axes
  - Not all same speed
  - Natural chaotic motion

### Debris Collision
- [ ] **Ground Collision**
  - Bounces on impact
  - Energy loss visible (0.3 restitution)
  - Friction slows horizontal motion
  - Settles after bounces

- [ ] **Settling Behavior**
  - Particles come to rest
  - Deactivate when settled (< 0.05 m/s)
  - No perpetual motion
  - Ground contact maintained

### Debris Variety
- [ ] **Size Variation**
  - Different particle sizes
  - Crush mode = smaller
  - Snap mode = larger
  - Base radius: 0.1m

- [ ] **Material Types**
  - Concrete debris (gray)
  - Steel debris (metallic)
  - Visually distinguishable
  - Density affects motion (concrete: 2400, steel: 7850 kg/m³)

### Debris Performance
- [ ] **Active Particle Count**
  - Decreases as debris settles
  - Stats show active vs total
  - Performance maintained
  - No stuttering

- [ ] **Particle Pooling**
  - Inactive particles reused
  - No memory leaks
  - Reset works correctly
  - Multiple earthquakes work

---

## 🎨 Visual Quality Standards

### Frame Rate
- [ ] **60 FPS Target**
  - Maintains 60 FPS during earthquake
  - No drops below 30 FPS
  - Smooth animation throughout
  - Stats panel shows actual FPS

- [ ] **Frame Pacing**
  - Consistent frame times
  - No stuttering
  - No micro-freezes
  - Smooth camera motion

### Visual Smoothness
- [ ] **Camera Motion**
  - Buttery smooth transitions
  - No jitter or shake artifacts
  - Zoom feels natural
  - Pan/orbit responsive

- [ ] **Particle Animation**
  - Smooth trajectories
  - No teleporting
  - Rotation looks natural
  - Collision response instant

- [ ] **Building Deformation**
  - Elements disappear smoothly
  - No popping
  - Collapse progression smooth
  - Debris spawning seamless

### Visual Fidelity
- [ ] **Lighting**
  - Consistent illumination
  - Shadows (if implemented)
  - Depth perception clear
  - No over/under exposure

- [ ] **Depth**
  - Clear spatial relationships
  - 3D effect convincing
  - Foreground/background clear
  - Occlusion correct

- [ ] **Color**
  - Materials distinguishable
  - Not too dark or bright
  - Good contrast
  - Debris visible against background

---

## 🎯 User Experience

### First Impression
- [ ] **Loading**
  - Loads within 2 seconds
  - No blank screen
  - Progress indication (if needed)
  - Ready to use immediately

- [ ] **Initial State**
  - Building visible and intact
  - UI controls visible
  - Clear what to do first
  - Inviting to interact

### Interaction Flow
- [ ] **Discoverability**
  - Trigger button obvious
  - Sliders clearly labeled
  - Camera modes self-explanatory
  - Keyboard shortcuts documented

- [ ] **Responsiveness**
  - Clicks register immediately
  - Sliders update in real-time
  - Keyboard shortcuts instant
  - No input lag

- [ ] **Feedback**
  - Status messages on actions
  - Stats update visibly
  - Visual confirmation of settings
  - Clear cause-and-effect

### Educational Value
- [ ] **Structural Behavior**
  - Stress distribution visible in stats
  - Lower floors fail first (realistic)
  - Cascade effect observable
  - Failure modes distinguishable

- [ ] **Physics Accuracy**
  - Gravity looks correct
  - Collision behavior realistic
  - Material properties matter
  - Building proportions reasonable

---

## 🧪 Edge Cases & Stress Tests

### Extreme Settings
- [ ] **Intensity 1** (Minimal)
  - Building stays intact
  - Minor shaking visible
  - No failures expected
  - Smooth animation

- [ ] **Intensity 10** (Maximum)
  - Rapid failures
  - Heavy debris
  - Frame rate maintained
  - Spectacular collapse

- [ ] **Duration 1s** (Short)
  - Quick shake
  - Collapse may continue
  - Clean end
  - Reset works

- [ ] **Duration 15s** (Long)
  - Sustained shaking
  - Complete destruction
  - No performance degradation
  - Still smooth

### Rapid Actions
- [ ] Multiple quick triggers
- [ ] Spam reset button
- [ ] Rapid camera changes
- [ ] Toggle slow-mo repeatedly
- [ ] Slider thrashing

### Browser Compatibility
- [ ] **Chrome** (Recommended)
- [ ] **Edge** (Chromium)
- [ ] **Safari Technology Preview**
- [ ] **Firefox** (if WebGPU enabled)

---

## 📸 Recording & Documentation

### Screenshots to Capture
- [ ] Intact building (overview camera)
- [ ] Earthquake in progress (cinematic)
- [ ] Mid-collapse (street level)
- [ ] Full collapse (top-down)
- [ ] Debris settled (overview)
- [ ] UI panel visible
- [ ] Stats during collapse

### Video Recording Checklist
- [ ] 60 FPS recording
- [ ] Full HD (1920×1080) minimum
- [ ] Show full UI
- [ ] Demonstrate all camera modes
- [ ] Show keyboard shortcuts
- [ ] Multiple intensity levels
- [ ] Slow motion feature
- [ ] Reset and re-trigger

---

## 🐛 Known Issues to Document

### Expected Behaviors (Not Bugs)
- [ ] Aspect ratio NaN with zero-size canvas (edge case)
- [ ] No failures with very low intensity (realistic)
- [ ] Debris capped at 500 per element (performance)
- [ ] CPU-only physics (GPU integration separate)

### Potential Issues to Watch For
- [ ] Z-fighting on overlapping geometry
- [ ] WebGPU availability errors
- [ ] Performance on integrated GPUs
- [ ] Browser compatibility warnings
- [ ] Memory usage on long sessions

---

## ✅ Final Approval Checklist

### Visual Quality
- [ ] Building looks realistic
- [ ] Collapse is spectacular
- [ ] Debris motion convincing
- [ ] Camera effects smooth
- [ ] 60 FPS maintained
- [ ] No visual artifacts

### User Experience
- [ ] Controls intuitive
- [ ] Responsiveness excellent
- [ ] Feedback clear
- [ ] Educational value high
- [ ] Fun to interact with
- [ ] Worth sharing/demoing

### Technical Quality
- [ ] No console errors
- [ ] No memory leaks
- [ ] Performance excellent
- [ ] Code quality high
- [ ] Tests passing (159+)
- [ ] Documentation complete

---

## 🎉 Sign-Off

**Tested By**: _________________
**Date**: _________________
**Browser**: _________________
**GPU**: _________________

**Overall Rating**: ⭐⭐⭐⭐⭐

**Production Ready**: [ ] YES [ ] NO

**Notes**:
```
_____________________________________________
_____________________________________________
_____________________________________________
```

---

**Status**: Ready for Week 6 Avalanche Demo! 🏔️❄️
