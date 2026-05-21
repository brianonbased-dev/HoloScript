# MNI152 Pial Surface (v1 shipped)

**Status**: v1 procedural approximation shipped (low-poly ellipsoid + gyri modulation, ~140 verts). Production anatomical surface (HCP FreeSurfer) documented for v2.

**v1 Generator**: `generate-mni152-pial.mjs` (self-contained, run anytime to refresh).

**Real source (when conversion env available)**:
- Human Connectome Project (HCP) ds000031 on OpenNeuro (CC0)
- FreeSurfer `lh.pial` / `rh.pial` in MNI152 space → glTF via freesurfer-to-gltf or Blender

**Usage**:
- GyriSulciPartitioner (barycentric classification → hot/cold storage for Pillar slices)
- CorticalDepthRouter enrichment
- HoloLand / Studio VR brain walk-through (PSF brain layer)
- Absorb HoloGraph Phase 2 symbol → brain coord visualization

**Validation**:
- Valid glTF 2.0
- Bounds match MNI152 brain envelope
- Sufficient topology for prototype barycentric + VR

Closes the PSF-brain asset task (task_1779336717743_3jzl). D.040 three-population Pillar brain surface now has usable geometry.

See BrainCoordMapper, GyriSulciPartitioner, and the Pillar index for consumers.
