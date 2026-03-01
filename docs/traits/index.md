# Traits Reference

HoloScript v3.42.0 includes **1,800+ traits** organized into **74 specialized categories** across **13 top-level domains**. Traits are declarative annotations that add behavior to objects without writing code.

> **How Traits Work**: The 1,800+ count represents semantic trait tags recognized by the HoloScript parser across domains including VR interaction (13), robotics (213), AI/XR (23), scientific computing (28), and 60+ specialized semantic categories. Core traits have full runtime implementations, while domain-specific traits provide semantic richness for compiler target generation.

## How Traits Work

```holo
object "Ball" {
  @grabbable(grab_distance: 0.5)
  @physics(mass: 1.0, bounciness: 0.7)
  geometry: "sphere"
  position: [0, 2, 0]
}
```

All traits follow the `TraitHandler` pattern:

```typescript
interface TraitHandler<TConfig> {
  name: VRTraitName;
  defaultConfig: TConfig;
  onAttach?: (node, config, context) => void;
  onDetach?: (node, config, context) => void;
  onUpdate?: (node, config, context, delta) => void;
  onEvent?: (node, config, context, event) => void;
}
```

## Trait Categories

| Category | Traits | Description |
|----------|--------|-------------|
| [Interaction](/traits/interaction) | @grabbable, @throwable, @clickable, @hoverable, @draggable, @scalable | Hand-based interaction in VR |
| [Physics](/traits/physics) | @physics, @collidable, @cloth, @fluid, @soft_body, @rope | Physics simulation |
| [AI & Behavior](/traits/ai-behavior) | @behavior_tree, @goal_oriented, @llm_agent, @perception, @emotion | Intelligent agent behavior |
| [AI Autonomous](/traits/ai-autonomous) | @autonomous, @swarm, @scheduler, @decision_tree | Autonomous system behaviors |
| [Audio](/traits/audio) | @spatial_audio, @music, @sfx, @voice | Spatial and ambient audio |
| [Accessibility](/traits/accessibility) | @screen_reader, @high_contrast, @motor_assist | Universal design traits |
| [AR/Spatial](/traits/spatial) | @spatial_awareness, @anchor, @plane_detection, @billboard | Augmented reality |
| [Web3/Blockchain](/traits/web3) | @token_gated, @wallet, @nft, @smart_contract, @zora_coins | Blockchain integration |
| [Render Network](/traits/render-network) | @render_network | Decentralized GPU rendering via RNDR |
| [OpenXR HAL](/traits/openxr-hal) | @openxr_hal | XR device abstraction (haptics, hand/eye tracking) |
| [Media](/traits/media) | @video, @screen, @360_video, @live_stream | Media playback |
| [Social/Multiplayer](/traits/social) | @networked, @voice_chat, @presence, @avatar | Social and multiplayer |
| [IoT/Integration](/traits/iot) | @sensor, @actuator, @mqtt, @rest_api | IoT and external integrations |
| [Visual](/traits/visual) | @material, @lighting, @shader, @particle, @lod | Graphics and rendering |
| [Advanced](/traits/advanced) | @animation, @ik, @ragdoll, @procedural, @hitl | Advanced animation, generation, and HITL gates |

## Extending Traits

Build your own custom traits using the [Trait Extension Guide](/traits/extending).

## API Reference

- [TraitHandler interface](/api/)
- [VRTraitSystem class](/api/)
- [TraitContext interface](/api/)
