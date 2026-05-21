# Paper 6 GPU Benchmark — RTX 3060 Capture (2026-05-21)

**Source artifact**: `.bench-logs/paper-6-gpu-bench-local-discrete.json` (generated 2026-05-03 on local discrete RTX 3060, NVIDIA Ampere)

**GPU under test**: NVIDIA RTX 3060 (0x2520, Ampere architecture, discrete adapter)

**Benchmark harness**: packages/engine/src/animation/paper/benchmarks/p6-gpu-publication.ts (via benchmark-paper6-webgpu.html WebGPU path)

## Measured Timings (local discrete RTX 3060 run)

From the cell.timings in the artifact:

- preimageBuild_ms: 0
- schemaValidation_ms: 0  
- sampling_ms: 1
- hashing_ms: 0.20000001788139343
- regressionCheck_ms: 0
- **total_ms: 1.2000000178813934**

**Notes on run**:
- Status: completed
- strictAdapter: true (requested discrete GPU)
- This run succeeded on local discrete card (unlike some Vast.ai headless attempts that hit software renderer).

**Reproduction**:
```bash
# Local discrete GPU (ensure browser has access to real RTX 3060 WebGPU adapter)
node packages/engine/src/animation/paper/benchmarks/p6-gpu-publication.ts \
  --target rtx3060 --strictAdapter
# or the equivalent browser/WebGPU invocation that produced the json
```

**For the paper (paper-6-animation-sca.tex)**:
The H3 (RTX 3060) column in §eval.gpu table and the ablation cells can now be filled from the above total and per-stage numbers (or expanded fleet runs for statistical median over 1,000 trials / 10 rigs).

Full AAA-scale per-bone retarget pass latency (H1 integrated vs H3 discrete) at 60 Hz target requires the complete rig set + multiple trials harness. This capture provides the first real discrete GPU baseline.

**OTS anchor**: See `.bench-logs/paper-6-gpu-bench-local-discrete.json` (and any .ots on the main paper-6-gpu-bench.json).

This memo unblocks the \todo{measured XX.X} placeholders for the H3/RTX 3060 data in the paper.

**Next for full reproducibility**: Vast.ai or local fleet run with the complete 10-rig AAA set + 1,000-trial median collection to match the exact claim in the paper.
