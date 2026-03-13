# Novel Use Cases — HoloScript v5.0 Autonomous Ecosystems

13 self-contained compositions demonstrating the full v5 stack:
migrating agents, in-scene economies, FeedbackLoop self-optimization,
cultural traits, TenantTrait compliance, post-quantum crypto, and
whitepaper-grounded executable semantics.

Each file ships to 18+ compile targets from a single source.

## Use Cases

| # | File | Domain | Key v5 Traits | Lines |
|---|------|--------|---------------|-------|
| 01 | [01-quantum-materials-arena.holo](./01-quantum-materials-arena.holo) | Materials Science | agent_portal, economy, feedback_loop, post_quantum_audit, digital_twin, ROS2Bridge | ~230 |
| 02 | [02-scifi-future-vision.holo](./02-scifi-future-vision.holo) | Film / Art | agent_portal, economy, cultural_profile, feedback_loop | ~210 |
| 03 | [03-water-scarcity-swarm.holo](./03-water-scarcity-swarm.holo) | Climate / Water | agent_portal, economy, cultural_profile, feedback_loop, post_quantum_audit, digital_twin, ROS2Bridge | ~260 |
| 04 | [04-ethical-ai-sandbox.holo](./04-ethical-ai-sandbox.holo) | AI Safety | cultural_profile, norm_compliant, cultural_memory, feedback_loop, tenant | ~260 |
| 05 | [05-robot-training-metaverse.holo](./05-robot-training-metaverse.holo) | Physical AI | agent_portal, economy, feedback_loop, digital_twin, ROS2Bridge | ~270 |
| 06 | [06-neurodiverse-therapy.holo](./06-neurodiverse-therapy.holo) | Healthcare | agent_portal, economy, cultural_profile, feedback_loop, tenant | ~250 |
| 07 | [07-wildfire-response-swarm.holo](./07-wildfire-response-swarm.holo) | Wildfire | agent_portal, economy, cultural_profile, feedback_loop, post_quantum_audit, digital_twin, ROS2Bridge | ~200 |
| 08 | [08-healthspan-twin.holo](./08-healthspan-twin.holo) | Longevity | agent_portal, economy, feedback_loop, tenant, cultural_profile | ~195 |
| 09 | [09-scifi-cocreation-metaverse.holo](./09-scifi-cocreation-metaverse.holo) | Co-Creation | agent_portal, economy, cultural_profile, cultural_memory, feedback_loop | ~220 |
| 10 | [10-urban-planning-governance.holo](./10-urban-planning-governance.holo) | Smart City | agent_portal, economy, norm_compliant, feedback_loop, tenant | ~210 |
| 11 | [11-sensory-therapy-worlds.holo](./11-sensory-therapy-worlds.holo) | Mental Health | agent_portal, economy, cultural_profile, feedback_loop, tenant | ~195 |
| 12 | [12-heritage-revival-museum.holo](./12-heritage-revival-museum.holo) | Cultural Heritage | agent_portal, economy, cultural_profile, cultural_memory, cultural_trace | ~220 |
| 13 | [13-disaster-robotics-swarm.holo](./13-disaster-robotics-swarm.holo) | Disaster Response | agent_portal, economy, feedback_loop, digital_twin, ROS2Bridge | ~230 |

## v5 Trait Coverage Matrix

| Trait | Files Using It |
|-------|----------------|
| `agent_portal` | 01, 02, 03, 05, 06, 07, 08, 09, 10, 11, 12, 13 |
| `economy` | All 13 |
| `feedback_loop` | All 13 |
| `cultural_profile` | 02, 03, 04, 06, 07, 08, 09, 11, 12 |
| `cultural_memory` | 04, 09, 12 |
| `cultural_trace` | 12 |
| `norm_compliant` | 04, 10 |
| `tenant` (RBAC) | 04, 06, 08, 10, 11 |
| `post_quantum_audit` | 01, 03, 07 |
| `digital_twin` | 01, 03, 05, 07, 13 |
| `ROS2Bridge` | 01, 03, 05, 07, 13 |

## Running an Example

```bash
holoc examples/novel-use-cases/01-quantum-materials-arena.holo --target r3f
```

## Studio Prompt

Every file includes a Studio English prompt in its JSDoc header.
Paste the prompt into HoloScript Studio to generate the scene from
natural language, then iterate on the generated `.holo`.
