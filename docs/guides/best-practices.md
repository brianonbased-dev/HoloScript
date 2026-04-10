# HoloScript Best Practices Guide

Mastering HoloScript requires more than just knowing simple syntax. To create compelling and comfortable VR experiences, follow these 10 core principles.

## 1. Master the Basics

Start small. Before building complex interactive worlds, ensure you understand the fundamental building blocks:

- **Geometry**: Use primitives like `sphere`, `cube`, and `plane` effectively.
- **Transformations**: Understand how `position`, `rotation`, and `scale` work in 3D space.
- **Colors**: Use hex codes (e.g., `#ff0000`) to define visual style.

## 2. Use Traits for Interaction

Static worlds are boring. Use HoloScript+ traits to bring objects to life:

- `@grabbable`: Allow users to pick up objects.
- `@pointable`: Enable laser-pointer interactions.
- `@hoverable`: Add visual feedback when users gaze at or point to objects.

## 3. Leverage Animations

Movement adds polish and guides user attention.

- Use `animate(node, { ... })` for smooth transitions.
- Simple effects like floating (bobbing up and down) or fading can make a scene feel "alive".

## 4. Optimize for Performance

VR demands high frame rates (90fps+).

- **Low Poly**: Stick to simple shapes where possible.
- **Network Efficient**: Use `@networked` only for objects that _must_ be synced between users. Unnecessary syncing kills bandwidth.

## 5. Consider Ergonomics (Critical)

VR is a physical medium. Respect the user's body:

- **The Sweet Spot**: Place interactive elements between **0.5m and 1.5m** from the user (`z: -0.5` to `z: -1.5`).
- **Comfort Zone**: Avoid placing UI too high (neck strain) or too low. Keep it near eye level (approx `y: 1.5` to `y: 1.7`).

## 6. Implement Physics

Physics adds weight and presence.

- **Dynamic**: Use `physics: "dynamic"` for objects that should fall, bounce, or be thrown.
- **Static**: Use `physics: "static"` for walls, floors, and heavy furniture.
- **Gravity**: Remember to enable gravity for realistic throwing (`@throwable`).

## 7. Design for Interaction

Don't hide important elements.

- **Visibility**: Ensure key interactables are sized appropriately (not too small to grab).
- **Affordance**: An object that looks grabbable (like a handle) should _be_ grabbable.

## 8. Experiment with Materials

Visual fidelity matters.

- **PBR**: Use Physically Based Rendering properties.
- **Roughness/Metallic**: Adjust these to differentiate between materials like plastic (`roughness: 0.5`, `metallic: 0`) and gold (`roughness: 0.1`, `metallic: 1`).

## 9. Use Events Wisely

Feedback loops are essential.

- **Responsiveness**: Always handle events like `on_grab`, `on_hover_enter`, and `on_click`.
- **Audio/Haptics**: Trigger sound or haptic pulses in your event handlers to confirm user actions.

## 10. Iterate and Test

VR development is iterative.

- **Test Frequently**: Code -> Deploy -> Put on Headset -> Repeat.
- **User Testing**: What feels intuitive to you might confuse a new user. Watch others play your scene.
