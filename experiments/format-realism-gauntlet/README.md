# Format Realism Gauntlet

This space is the flagship stress target for the format-realism automation.

The first gauntlet is `humanoid-rock-throw`: a humanoid avatar approaches a rock, grabs it, lifts it, winds up, throws it, records the arc, observes the impact, and captures segmented evidence.

The goal is not to pretend the whole stack is finished. The goal is to make every missing piece visible enough that HoloScript, HoloLand, and HoloShell can adopt improvements run after run.

## Files

- `manifest.json` - stable contract for segments, artifacts, quality metrics, and graduation criteria.
- `humanoid-rock-throw.holo` - spatial stage: avatar proxy, rock, target, capture markers, lighting, and evidence panels.
- `humanoid-rock-throw.hsplus` - behavior and capture contract: segment state, expected events, quality checks, and task-seed hooks.
- `humanoid-rock-throw.hs` - orchestration pipeline for future automation runs.
- `scorecard.schema.json` - machine-readable shape for per-run scorecards.
- `support-stack.md` and `support-stack.json` - what `.ts`, `.py`, `.rs`, assets, shaders, and legacy bridge support are needed to progress the experiment.
- `captures/README.md` - local notes for generated stills and receipts.
- `setup-validation.md` - current validation status and known first gap.

## First Commands

```powershell
node packages\cli\bin\holoscript.cjs parse experiments\format-realism-gauntlet\humanoid-rock-throw.holo --json
node packages\cli\bin\holoscript.cjs parse experiments\format-realism-gauntlet\humanoid-rock-throw.hsplus --json
node packages\cli\bin\holoscript.cjs parse experiments\format-realism-gauntlet\humanoid-rock-throw.hs --json
node packages\cli\bin\holoscript.cjs compile experiments\format-realism-gauntlet\humanoid-rock-throw.holo --target threejs -o .bench-logs\format-stress\manual\humanoid-rock-throw-threejs
```

## Iteration Rule

Every automation run should compare against the previous scorecard and improve the same gauntlet before inventing the next extreme. Graduate only when segment coverage, screenshots, runtime evidence, and visual/physics plausibility stop producing high-value gaps.
