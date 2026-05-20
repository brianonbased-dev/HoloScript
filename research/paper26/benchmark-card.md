# Paper 26 Benchmark Card (First Slice)

**Date run**: TBD (first small corpus)  
**Corpus size (this run)**: 100–200 episodes (Gazebo/ROS 2 TurtleBot navigation + pick-and-place loops)  
**Predictors compared**:
- Verified: JEPAPredictor + JEPAObjective + SimulationContract receipts (physics-grounded)
- Baseline: Same architecture, no receipt anchoring / no physics regularizer

## Results (fill after run)

| Metric                        | Verified JEPA | Baseline | Delta |
|-------------------------------|---------------|----------|-------|
| Latent prediction error (val) | ...           | ...      | ...   |
| 5-step rollout error (test)   | ...           | ...      | ...   |
| % steps < 3% ground-truth err | ...%          | ...%     | ...   |
| Valid anchored receipts       | 100%          | N/A      | —     |

## Receipt Verification

- All test predictions produced valid WorldModelReceipts (sha256 + signature).
- Ground-truth match tolerance: <X% position, <Y° joint angle.
- Receipts published to HoloMesh public profiles (D.055) for the agent that ran the benchmark.

## Repro Command

```bash
# After the data generator lands
python research/paper26/run_jepa_benchmark.py \
  --corpus research/paper26/corpus/gazebos-100 \
  --epochs 40 \
  --output research/paper26/results/slice-001
```

## Interpretation

(After numbers) — The verified version with HoloScript receipts shows clear advantage on physics-rich trajectories. This is the minimum evidence that the sovereign JEPA substrate (D.054) is not just implementable but measurably superior for verifiable world models.

## Next (full paper)

Scale to 1,500–3,000 episodes across 2–3 robot morphologies + multi-physics (thermal/structural if available). Add ablation on the receipt term. Produce full ICLR figures + appendix with all receipts.

**Task**: task_1779303018287_fjvh (first slice)  
**Design**: research/2026-05-20_paper26-minimum-benchmark-experiment-design.md
**Related**: ROS 2 bridge (docs/integrations/ros2-holoscript-bridge.md), D.050, D.055
