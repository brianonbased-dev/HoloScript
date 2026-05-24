# GOLD Game Surface Roles: HoloGram and HoloMap

This is the role map for the GOLD game kitchen-sink plan. The point is to
consume HoloScript features in the game without letting feature names drift.

## HoloGram Role

HoloGram is the **2D media to 3D world / holographic artifact** path.

For the GOLD game, the founder art at
`examples/gold-game/assets/gold-vault-vista-wlNgg.jpg` is not just a poster or
menu background. It is the source image for the HoloGram ratchet:

1. ingest the 2D art as media,
2. infer depth / normals,
3. generate a 3D composition or playable world shell,
4. render holographic outputs when needed: quilt, MV-HEVC, and parallax,
5. feed the resulting world/artifact back into the GOLD game.

So the ratchet name should say **HoloGram image-to-world**. Delivery targets are
a later output of that same pipeline.

## HoloMap Role

HoloMap is the **space scanning / reconstruction** path.

For the GOLD game, HoloMap is not the system that turns the founder image into
the world. HoloMap is how real captured spaces enter the game:

1. ingest video or device capture,
2. advance the reconstruction pipeline,
3. anchor the reconstruction with spatial references,
4. export the scanned model or `.holo` scene,
5. let scanned rooms, Quest captures, or physical exhibit spaces become places
   the GOLD game can inhabit.

So the ratchet name should say **HoloMap scanned-space import**, not HoloMap
image-to-world.

## Kitchen-Sink Rule

The GOLD game should keep throwing the HoloScript kitchen sink at one artifact:

- HoloGraph: knowledge relationships become playable lineage navigation.
- HoloGram: the 2D founder art becomes a 3D/holographic GOLD world source.
- HoloMap: scanned physical spaces become anchored GOLD spaces.
- HoloGate: player intent gates mutation.
- HoloMesh / netcode: shared agents and players converge on world state.
- Simulation / solvers / economy / reputation / dialogue: make the loop real,
  balanced, and inspectable.

Names should describe the feature being consumed, not an implementation caveat.
