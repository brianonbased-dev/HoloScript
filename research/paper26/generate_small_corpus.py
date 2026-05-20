#!/usr/bin/env python3
"""
Paper 26 — First Slice Data Generator Stub
Generates a tiny corpus of "episodes" from Gazebo/ROS 2 style trajectories
(or synthetic physics) and emits SimulationContract-style receipt metadata.

This is the minimal runnable starter for task_1779303018287_fjvh.
Replace the synthetic generator with real Gazebo + the ROS 2 bridge when ready.

Run:
    python research/paper26/generate_small_corpus.py --episodes 100 --out research/paper26/corpus/gazebos-100
"""

import argparse
import json
import random
import time
from pathlib import Path
from datetime import datetime

def synthetic_episode(robot: str, length: int = 50):
    """Fake but structured episode that looks like a real ROS 2 / Gazebo trajectory
    (rich observations + contacts + effort) as would come from the D.007 ROS 2 bridge."""
    actions = []
    observations = []
    ground_truth = []
    for t in range(length):
        # More realistic navigation-style action
        action = {
            "cmd_vel": {
                "linear": {"x": random.uniform(-0.8, 0.8), "y": 0.0},
                "angular": {"z": random.uniform(-1.2, 1.2)}
            }
        }

        # Richer observation (what a real robot would publish)
        obs = {
            "joint_states": {
                "position": [random.uniform(-3.14, 3.14) for _ in range(4)],
                "velocity": [random.uniform(-2.0, 2.0) for _ in range(4)],
                "effort": [random.uniform(-10.0, 10.0) for _ in range(4)]
            },
            "scan": [random.random() * 8.0 for _ in range(64)],   # 64-beam lidar (realistic)
            "odom": {
                "pose": {"x": t * 0.08 + random.uniform(-0.015, 0.015),
                         "y": random.uniform(-0.12, 0.12),
                         "theta": random.uniform(-0.3, 0.3)},
                "twist": {"vx": random.uniform(-0.7, 0.7), "vy": 0.0, "wz": random.uniform(-1.0, 1.0)}
            },
            "imu": {"linear_accel": [random.uniform(-0.2, 0.2), 9.81 + random.uniform(-0.3, 0.3), random.uniform(-0.2, 0.2)]},
            "contacts": [random.uniform(0, 120) for _ in range(random.randint(0, 3))]  # 0-3 contacts
        }

        # Richer ground truth (what Gazebo "knows")
        gt = {
            "pose": obs["odom"]["pose"],
            "twist": obs["odom"]["twist"],
            "joint_positions": obs["joint_states"]["position"],
            "joint_velocities": obs["joint_states"]["velocity"],
            "contact_forces": obs["contacts"]
        }

        actions.append(action)
        observations.append(obs)
        ground_truth.append(gt)

    return {
        "robot": robot,
        "length": length,
        "actions": actions,
        "observations": observations,
        "ground_truth": ground_truth,
        "timestamp": datetime.utcnow().isoformat()
    }

def make_receipt(episode_id: str, episode: dict):
    """Stub for WorldModelReceipt / SimulationContract anchoring."""
    return {
        "episode_id": episode_id,
        "solver": "gazebo-synthetic",
        "ground_truth_hash": "sha256:" + hex(hash(json.dumps(episode["ground_truth"]))) [2:],
        "signature": "sig:" + hex(random.getrandbits(128))[2:],
        "created": datetime.utcnow().isoformat(),
        "tolerance": "0.03"   # 3% position / joint error
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--episodes", type=int, default=100)
    parser.add_argument("--out", type=str, default="research/paper26/corpus/gazebos-100")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    robots = ["turtlebot3", "ur5_arm", "simple_leg"]

    manifest = []
    for i in range(args.episodes):
        robot = random.choice(robots)
        ep = synthetic_episode(robot, length=random.randint(30, 70))
        epid = f"ep_{i:04d}_{robot}"
        receipt = make_receipt(epid, ep)

        (out_dir / f"{epid}.json").write_text(json.dumps(ep, indent=2))
        (out_dir / f"{epid}.receipt.json").write_text(json.dumps(receipt, indent=2))
        manifest.append({"id": epid, "robot": robot, "receipt": receipt})

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Generated {args.episodes} synthetic episodes + receipts → {out_dir}")
    print("Next: wire real Gazebo/ROS 2 bridge + train JEPAPredictor on this corpus.")

if __name__ == "__main__":
    main()
