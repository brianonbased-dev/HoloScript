# Traits Reference

HoloScript v5.1.0 includes **2,000+ traits** organized into **75 specialized categories** across **40+ top-level domains**. Traits are declarative annotations that add behavior to objects without writing code.

> **How Traits Work**: The 2,000+ count represents semantic trait tags recognized by the HoloScript parser across domains including VR interaction (13), robotics (213), AI/XR (23), scientific computing (28), economics, security/ZK, AI generation, and 60+ specialized semantic categories. Core traits have full runtime implementations, while domain-specific traits provide semantic richness for compiler target generation.

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

| Category                                 | Traits                                                                 | Description                                        |
| ---------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- | --- | ------------------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| [Interaction](/traits/interaction)       | @grabbable, @throwable, @clickable, @hoverable, @draggable, @scalable  | Hand-based interaction in VR                       |
| [Physics](/traits/physics)               | @physics, @collidable, @cloth, @fluid, @soft_body, @rope               | Physics simulation                                 |
| [AI & Behavior](/traits/ai-behavior)     | @behavior_tree, @goal_oriented, @llm_agent, @perception, @emotion      | Intelligent agent behavior                         |
| [AI Autonomous](/traits/ai-autonomous)   | @autonomous, @swarm, @scheduler, @decision_tree                        | Autonomous system behaviors                        |
| [Audio](/traits/audio)                   | @spatial_audio, @music, @sfx, @voice                                   | Spatial and ambient audio                          |
| [Accessibility](/traits/accessibility)   | @screen_reader, @high_contrast, @motor_assist                          | Universal design traits                            |
| [AR/Spatial](/traits/spatial)            | @spatial_awareness, @anchor, @plane_detection, @billboard              | Augmented reality                                  |
| [Web3/Blockchain](/traits/web3)          | @token_gated, @wallet, @nft, @smart_contract, @zora_coins              | Blockchain integration                             |
| [Render Network](/traits/render-network) | @render_network                                                        | Decentralized GPU rendering via RNDR               |
| [OpenXR HAL](/traits/openxr-hal)         | @openxr_hal                                                            | XR device abstraction (haptics, hand/eye tracking) |
| [Media](/traits/media)                   | @video, @screen, @360_video, @live_stream                              | Media playback                                     |
| [Social/Multiplayer](/traits/social)     | @networked, @voice_chat, @presence, @avatar                            | Social and multiplayer                             |
| [IoT/Integration](/traits/iot)           | @sensor, @actuator, @mqtt, @rest_api                                   | IoT and external integrations                      |
| [Visual](/traits/visual)                 | @material, @lighting, @shader, @particle, @lod                         | Graphics and rendering                             |
| [Advanced](/traits/advanced)             | @animation, @ik, @ragdoll, @procedural, @hitl                          | Advanced animation, generation, and HITL gates     |     | [Economics / Web3](/traits/economics) | @wallet, @nft_asset, @token_gated, @marketplace, @zora_coins | On-chain economies, NFT minting, token gating |
| [Security / ZK](/traits/security)        | @zero_knowledge_proof, @zk_private, @rsa_encrypt, @audit_log           | Cryptographic privacy, ZK proofs, tamper logs      |
| [AI Generation](/traits/ai-generation)   | @stable_diffusion, @neural_forge, @ai_texture_gen, @diffusion_realtime | Generative AI: textures, meshes, shaders           |
| [Human-in-the-Loop](/traits/hitl)        | @hitl, @feedback_loop, @biofeedback                                    | Human oversight, biometric feedback, RLHF gates    |

## Wisdom/Gotcha Atoms Navigation

| Resource                  | Link                                                                                | Purpose                                                     |
| ------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Batch 1 RFC               | [WISDOM_GOTCHA_ATOMS_BATCH1_RFC](../../proposals/WISDOM_GOTCHA_ATOMS_BATCH1_RFC.md) | Full spec + semantics + compiler checks for substrate atoms |
| 20 Atom Reference Entries | [TRAITS_REFERENCE](../TRAITS_REFERENCE.md#wisdomgotcha-atom-extensions-proposed)    | Commit-ready signatures, gotchas, and validation rules      |
| Canonical Demo            | [canonical-atoms-demo.holo](../../examples/atoms/canonical-atoms-demo.holo)         | Cross-domain demo using 8 atoms together                    |
| Governance Companion Demo | [governance-atoms-demo.holo](../../examples/atoms/governance-atoms-demo.holo)       | Focused demo for governance atoms 11-15                     |

## Extending Traits

Build your own custom traits using the [Trait Extension Guide](/traits/extending).

## API Reference

- [TraitHandler interface](/api/)
- [VRTraitSystem class](/api/)
- [TraitContext interface](/api/)
