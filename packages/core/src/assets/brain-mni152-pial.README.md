# MNI152 Pial Surface Placeholder (TASK-1 / run-16)

**Status**: Minimal placeholder (single-triangle mesh). Real anatomical pial surface required for production GyriSulciPartitioner barycentric classification and HoloLand VR brain walk-through.

**Real source (CC0 / open data)**:
- Human Connectome Project (HCP) ds000031 on OpenNeuro
- FreeSurfer `lh.pial` / `rh.pial` surfaces in MNI152 space
- Convert via freesurfer-to-gltf or Blender FreeSurfer importer + export glTF

**When real asset available**:
```
pip install nilearn nibabel
# or use HCP download + mesh processing
```

**Current use**:
- Validates GLTF ingest path (`@holoscript/cli` gltf-importer, three.js loader in studio/hololand)
- Allows GyriSulciPartitioner and CorticalDepthRouter prototyping with fallback coords
- VR viz can instance the placeholder until real ~2MB pial with gyral/sulcal topology lands

**License note**: This placeholder is generated in-repo (no external copyrighted mesh). Replace with HCP-derived when conversion pipeline is run in an env with FreeSurfer/Blender.

**Validation**:
- JSON parses
- Loads as glTF 2.0 (minimal valid)
- Target: packages/core/src/assets/brain-mni152-pial.gltf

Closes run-16 TASK-1 with explicit blocker + path for upgrade.
