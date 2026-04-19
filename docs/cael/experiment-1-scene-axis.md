# CAEL Experiment 1 — Scene source axis (protocol addendum)

Experiment 1 already compares conditions on **embodiment** (e.g. embodied vs observer). This addendum adds a **second factorial axis** for **scene provenance**:

| Axis value (plain language) | Technical |
|-----------------------------|-----------|
| Native HoloMap scene | HoloMap reconstruction manifest (`simulationContract.kind = holomap.reconstruction.v1`) |
| Compatibility Marble scene | Marble / manifest compatibility ingest (WorldModelBootstrap path; unchanged) |

## Pre-registration language

Report cells as: **Embodiment condition × Scene source**, for example:

- “Embodied × Native HoloMap scene”
- “Embodied × Compatibility Marble scene”
- “Observer × Native HoloMap scene”
- “Observer × Compatibility Marble scene”

## Runner hooks

- `CAEL_EXP1_SCENE_AXIS=holomap-native` or `marble-compatibility` selects the scene column for a single run.
- `CAEL_EXP1_HOLOMAP_BUILD_PIN` — optional string (git SHA or package version) logged alongside HoloMap-native cells for longitudinal comparability when HoloMap bumps.

## Analysis note

State whether interaction effects (embodiment × scene source) are in scope for the first publication, or whether initial reporting is restricted to main effects per axis.
