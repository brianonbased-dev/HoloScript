# Format Realism Gauntlet

This space is the flagship stress target for the format-realism automation.

The first gauntlet is `humanoid-rock-throw`: a humanoid avatar approaches a rock, grabs it, lifts it, winds up, throws it, records the arc, observes the impact, and captures segmented evidence.

The goal is not to pretend the whole stack is finished. The goal is to make every missing piece visible enough that HoloScript, HoloLand, and HoloShell can adopt improvements run after run.

## Files

- `manifest.json` - stable contract for segments, artifacts, quality metrics, and graduation criteria.
- `humanoid-rock-throw.holo` - spatial stage: avatar proxy, rock, target, capture markers, lighting, and evidence panels.
- `humanoid-rock-throw.hsplus` - behavior and capture contract: segment state, expected events, quality checks, and task-seed hooks.
- `humanoid-rock-throw.hs` - orchestration pipeline for future automation runs.
- `hololand-holoshell-reality-lab.holo` - HoloLand inspection room for HoloShell command receipts, gap splash zones, WoT devices, physics receipt tokens, spatial audio cues, and agent/economy feedback.
- `hololand-holoshell-reality-lab.hsplus` - behavior contract that classifies command failures into parser, grammar, visual, and interop splash zones.
- `hololand-holoshell-reality-lab.hs` - pipeline that gathers command-output receipts, filters failures, writes a local digest, and emits HoloMesh task seeds when configured.
- `holoshell-command-output.sample.json` - stable sample receipt corpus for the reality lab pipeline.
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

## HoloLand/HoloShell Reality Lab

```powershell
node packages\cli\bin\holoscript.cjs parse experiments\format-realism-gauntlet\hololand-holoshell-reality-lab.holo --json
node packages\cli\bin\holoscript.cjs parse experiments\format-realism-gauntlet\hololand-holoshell-reality-lab.hsplus --json
$env:FORMAT_REALITY_LAB_OUT = ".bench-logs\format-stress\manual\hololand-holoshell-reality-lab"
$env:HOLOMESH_BOARD_SEED_URL = ""
node packages\cli\bin\holoscript.cjs run experiments\format-realism-gauntlet\hololand-holoshell-reality-lab.hs --json
node packages\cli\bin\holoscript.cjs wot-export experiments\format-realism-gauntlet\hololand-holoshell-reality-lab.holo --json
```

The reality lab is the adoption surface for this gauntlet: command output enters through `.hs`, gap classification lives in `.hsplus`, and HoloLand inspection happens in `.holo`. Failed commands land in explicit splash zones and can become HoloMesh task seeds instead of being buried in raw logs.

## Iteration Rule

Every automation run should compare against the previous scorecard and improve the same gauntlet before inventing the next extreme. Graduate only when segment coverage, screenshots, runtime evidence, and visual/physics plausibility stop producing high-value gaps.
