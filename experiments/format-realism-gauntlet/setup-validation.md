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
| Behavior compile | `holoscript compile humanoid-rock-throw.hsplus --target threejs` | known gap |

## Known Gap

The `.hsplus` behavior contract validates, but the Three.js compile path rejects behavior/object syntax that the validator accepts. This intentionally reproduces the existing format-stress task:

`task_1778631512408_qua7` - align `.hsplus` parse and compile grammar contracts.

Do not simplify the behavior file just to hide this gap. The point of this experiment is to keep pressure on the runtime/compiler boundary while the `.holo` stage and `.hs` orchestration remain runnable.
