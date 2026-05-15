# Setup Validation

Initial setup run: `.bench-logs/format-stress/manual/humanoid-rock-throw-setup/`

## Current Status

| Surface | Command | Status |
| --- | --- | --- |
| Stage parse | `holoscript parse humanoid-rock-throw.holo --json` | pass |
| Behavior parse | `holoscript parse humanoid-rock-throw.hsplus --json` | pass |
| Pipeline parse | `holoscript parse humanoid-rock-throw.hs --json` | pass |
| Stage compile | `holoscript compile humanoid-rock-throw.holo --target threejs` | pass |
| Pipeline compile | `holoscript compile humanoid-rock-throw.hs --target node` | pass |
| Behavior compile | `holoscript compile humanoid-rock-throw.hsplus --target threejs` | pass |
| Reality lab compile | `holoscript compile hololand-holoshell-reality-lab.hsplus --target threejs` | pass |

## Current Gap

Segmented replay now captures dynamic stills through the engine screenshot path by injecting replay overlays into the authored HoloLand stage. The remaining realism ratchet is deeper runtime replay: avatar pose targets, rock constraints, camera rails, and panel state should be driven by first-class runtime replay state rather than overlay objects.

`task_1778808934664_l25l` tracked the first scene-native injection step. Future work should keep pressure on full constraint/pose replay instead of regressing to minimal receipt-only scenes.

Do not simplify the behavior files just to hide gaps. The point of this experiment is to keep pressure on the runtime/compiler boundary while the `.holo` stage and `.hs` orchestration remain runnable.
