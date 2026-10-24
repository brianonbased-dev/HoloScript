# Brian identity spec (v0)

`brian.identity.json` is the machine-checkable identity record for Brian, the
Hololand mascot. Agents should read it before loading, rigging or describing Brian.
`brian.identity.test.mjs` checks its fields (run: `node --test compositions/characters/brian/brian.identity.test.mjs`).

What it states, and what it does not claim:

- **Origin.** Brian is Joseph Krzywoszyja's original character. Keep Brian separate
  from $BRIAN LLC, the $BRIAN token and Peridyn.
- **Canonical source.** Four GLBs in the creator's private pictures folder, named by
  filename and sha256 only (no personal paths in this repo): `Brian_Flexing_001.glb`,
  `Brian_Boxing.glb`, `Brian_Situps.glb`, `Bicycle Crunch.glb`. A copy counts as
  canonical only if its sha256 matches.
- **Geometry.** Static x4: each file is one frozen pose mesh. **Rig: unknown**
  (0 skins, 0 animations). Earlier notes calling these "rigged" were wrong.
- **Body map.** `Brian_Body_Map.jpg` is a guide for future rigging and texturing,
  not a rig.
- **Local filename aliases.** The sha256 is canon, not the filename. Some local
  copies use other names for the same bytes: `Brian_Flexing.glb` is an alias of
  `Brian_Flexing_001.glb`, and `Brian_BicycleCrunch.glb` is an alias of
  `Bicycle Crunch.glb`. Any copy counts only if its sha256 matches.
- **Export logs.** `Brian_Boxing.glb.log` and `Brian_Situps.glb.log` are listed by
  filename, size and sha256. They are evidence for the exporter, not geometry.
- **Provenance.** Exported from 3ds Max with the Autodesk glTF exporter (named in
  both export logs). Material channels were dropped and no rig was ever attempted;
  those two facts are per Idea's seed note, not proven by the logs.
- **Non-canonical reference.** `openart-d2c449cdef724e68bd71444cacd154fd_raw.png`
  is labelled "reference render, not canon sheet": it is AI-generated and has no
  turnaround. It is not part of the canonical set.
- **Likeness.** Synthetic: original character by Joseph; no real-person source.
  Ruled by Trust (A33), confirmed 2026-10-23.
- **Not Brian.** The quadruped/winged placeholder skeleton in
  `gltfpipeline-brian-generate.glb`.

No new syntax: this is a plain JSON data file. Claims here rise only as evidence
rises; when a rig is built and verified, update `geometry` with the receipt.
