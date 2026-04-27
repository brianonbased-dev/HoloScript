#!/usr/bin/env python3
"""
Generate the Paper-19 phase-3 trait-inference dataset (50 labeled rows).

Output: research/paper-19/datasets/phase-3-trait-inference-50row-v1.jsonl

Each row is a (.hsplus snippet, gold trait list) pair drawn from the
benchmarks/scenarios/ and benchmarks/cross-compilation/ corpora plus a
small synthesis tail and a negative-control tail.

This generator is the source of truth for the corpus — re-running it
must produce a byte-identical JSONL (modulo line-ending normalization).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "research" / "paper-19" / "datasets" / "phase-3-trait-inference-50row-v1.jsonl"


# fmt: off
ROWS = [
    # ============ benchmarks/scenarios/01-basic-scene/basic-scene.holo ============
    {
        "id": "row-001",
        "split": "train",
        "snippet": 'object "Ground" {\n  @physics(type: "static")\n  @collidable\n  geometry: "plane"\n  scale: [100, 1, 100]\n  color: "#3a3a4a"\n  material: "concrete"\n}',
        "gold_traits": ["@physics", "@collidable"],
        "provenance": {"source": "benchmarks/scenarios/01-basic-scene/basic-scene.holo", "lines": "16-23", "kind": "verbatim"},
        "metadata": {"trait_families": ["physics"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-002",
        "split": "train",
        "snippet": 'object "Cube" {\n  @grabbable\n  @physics(mass: 1.0, restitution: 0.5)\n  @collidable\n  geometry: "box"\n  position: [0, 1, -2]\n  scale: [0.5, 0.5, 0.5]\n  color: "#4488ff"\n  material: "plastic"\n}',
        "gold_traits": ["@grabbable", "@physics", "@collidable"],
        "provenance": {"source": "benchmarks/scenarios/01-basic-scene/basic-scene.holo", "lines": "24-33", "kind": "verbatim"},
        "metadata": {"trait_families": ["interaction", "physics"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-003",
        "split": "train",
        "snippet": 'object "Sphere" {\n  @grabbable\n  @physics(mass: 0.8, restitution: 0.8)\n  @collidable\n  @glowing(intensity: 0.3)\n  geometry: "sphere"\n  position: [1.5, 1, -2]\n  scale: [0.4, 0.4, 0.4]\n  color: "#ff4444"\n  material: "metal"\n}',
        "gold_traits": ["@grabbable", "@physics", "@collidable", "@glowing"],
        "provenance": {"source": "benchmarks/scenarios/01-basic-scene/basic-scene.holo", "lines": "34-44", "kind": "verbatim"},
        "metadata": {"trait_families": ["interaction", "physics", "visual"], "snippet_size_bucket": "four-plus"},
    },

    # ============ benchmarks/scenarios/02-high-complexity/high-complexity.holo ============
    {
        "id": "row-004",
        "split": "train",
        "snippet": 'object "Arena" {\n  @physics(type: "static")\n  @collidable\n  geometry: "plane"\n  scale: [200, 1, 200]\n  material: "stone_floor"\n  color: "#2a2a3a"\n  roughness: 0.8\n}',
        "gold_traits": ["@physics", "@collidable"],
        "provenance": {"source": "benchmarks/scenarios/02-high-complexity/high-complexity.holo", "lines": "17-25", "kind": "verbatim"},
        "metadata": {"trait_families": ["physics"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-005",
        "split": "train",
        "snippet": 'object "DynamicCubeGrid" {\n  @physics(mass: 1.0, restitution: 0.4)\n  @collidable\n  @grabbable\n  instances: { count: 50, pattern: "grid", spacing: [2, 2, 2], origin: [-5, 5, -5] }\n  geometry: "box"\n  scale: [0.4, 0.4, 0.4]\n  color: "#6688cc"\n}',
        "gold_traits": ["@physics", "@collidable", "@grabbable"],
        "provenance": {"source": "benchmarks/scenarios/02-high-complexity/high-complexity.holo", "lines": "26-34", "kind": "verbatim"},
        "metadata": {"trait_families": ["physics", "interaction"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-006",
        "split": "dev",
        "snippet": 'object "BouncingSpheres" {\n  @physics(mass: 0.5, restitution: 0.9)\n  @collidable\n  @glowing(intensity: 0.5)\n  instances: { count: 20, pattern: "random", bounds: [-8, 3, -8, 8, 10, 8] }\n  geometry: "sphere"\n  scale: [0.3, 0.3, 0.3]\n  color: "#ff6644"\n  transmission: 0.7\n}',
        "gold_traits": ["@physics", "@collidable", "@glowing"],
        "provenance": {"source": "benchmarks/scenarios/02-high-complexity/high-complexity.holo", "lines": "35-44", "kind": "verbatim"},
        "metadata": {"trait_families": ["physics", "visual"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ benchmarks/scenarios/03-robotics-sim/robotics-sim.holo ============
    {
        "id": "row-007",
        "split": "train",
        "snippet": 'object "RobotBase" {\n  @physics(type: "static")\n  @collidable\n  geometry: "cylinder"\n  position: [0, 0.15, 0]\n  scale: [0.4, 0.3, 0.4]\n  color: "#333333"\n  material: "steel"\n}',
        "gold_traits": ["@physics", "@collidable"],
        "provenance": {"source": "benchmarks/scenarios/03-robotics-sim/robotics-sim.holo", "lines": "19-27", "kind": "verbatim"},
        "metadata": {"trait_families": ["physics"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-008",
        "split": "train",
        "snippet": 'object "Shoulder" {\n  @joint(type: "revolute", axis: [0, 1, 0], limits: [-180, 180])\n  @physics(mass: 5.0)\n  geometry: "cylinder"\n  position: [0, 0.4, 0]\n  scale: [0.15, 0.3, 0.15]\n  color: "#ff6600"\n}',
        "gold_traits": ["@joint", "@physics"],
        "provenance": {"source": "benchmarks/scenarios/03-robotics-sim/robotics-sim.holo", "lines": "28-35", "kind": "verbatim"},
        "metadata": {"trait_families": ["robotics", "physics"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-009",
        "split": "test",
        "snippet": 'object "Wrist" {\n  @joint(type: "revolute", axis: [0, 1, 0], limits: [-180, 180])\n  @physics(mass: 1.0)\n  geometry: "cylinder"\n}',
        "gold_traits": ["@joint", "@physics"],
        "provenance": {"source": "benchmarks/scenarios/03-robotics-sim/robotics-sim.holo", "lines": "47-50", "kind": "verbatim"},
        "metadata": {"trait_families": ["robotics", "physics"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ benchmarks/scenarios/04-multiplayer-vr/multiplayer-vr.holo ============
    {
        "id": "row-010",
        "split": "train",
        "snippet": 'object "LocalPlayer" {\n  @networked(mode: "owner", syncProperties: ["position", "rotation", "health", "animationState"], syncRate: 20, interpolation: true)\n  @skeleton(type: "humanoid", height: 1.8)\n  @locomotion(mode: "teleport", speed: 3.0)\n  @spatial_audio(source: "voice", range: 10, falloff: "inverse")\n  position: [0, 0, 0]\n}',
        "gold_traits": ["@networked", "@skeleton", "@locomotion", "@spatial_audio"],
        "provenance": {"source": "benchmarks/scenarios/04-multiplayer-vr/multiplayer-vr.holo", "lines": "23-29", "kind": "verbatim"},
        "metadata": {"trait_families": ["networking", "character", "audio"], "snippet_size_bucket": "four-plus"},
    },
    {
        "id": "row-011",
        "split": "train",
        "snippet": 'object "RemotePlayerTemplate" {\n  @networked(mode: "shared", syncProperties: ["position", "rotation", "animationState"], syncRate: 20, interpolation: true)\n  @skeleton(type: "humanoid", height: 1.8)\n  @spatial_audio(source: "voice", range: 10)\n  visible: false\n}',
        "gold_traits": ["@networked", "@skeleton", "@spatial_audio"],
        "provenance": {"source": "benchmarks/scenarios/04-multiplayer-vr/multiplayer-vr.holo", "lines": "30-35", "kind": "verbatim"},
        "metadata": {"trait_families": ["networking", "character", "audio"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-012",
        "split": "dev",
        "snippet": 'object "GrabbableMug" {\n  @networked(mode: "shared", syncRate: 10)\n  @grabbable\n  @physics(mass: 0.3)\n  geometry: "cylinder"\n  position: [2, 1.1, 0]\n  scale: [0.08, 0.12, 0.08]\n  color: "#cc8844"\n}',
        "gold_traits": ["@networked", "@grabbable", "@physics"],
        "provenance": {"source": "benchmarks/scenarios/04-multiplayer-vr/multiplayer-vr.holo", "lines": "36-43", "kind": "verbatim"},
        "metadata": {"trait_families": ["networking", "interaction", "physics"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-013",
        "split": "train",
        "snippet": 'object "Whiteboard" {\n  @networked(mode: "shared", syncRate: 5)\n  @clickable\n  @interactive\n  geometry: "box"\n  position: [0, 2, -5]\n  scale: [3, 2, 0.05]\n}',
        "gold_traits": ["@networked", "@clickable", "@interactive"],
        "provenance": {"source": "benchmarks/scenarios/04-multiplayer-vr/multiplayer-vr.holo", "lines": "44-50", "kind": "verbatim"},
        "metadata": {"trait_families": ["networking", "interaction", "ui"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ benchmarks/scenarios/05-holomap-reconstruction (DECORATORS) ============
    {
        "id": "row-014",
        "split": "test",
        "snippet": 'object "ReconstructionSession" {\n  @reconstruction_source\n  @acceptance_video\n  @drift_corrected\n  geometry: "box"\n  position: [0, 1, -2]\n  scale: [1.0, 1.0, 1.0]\n  color: "#88bbff"\n  material: "matte"\n}',
        "gold_traits": ["@reconstruction_source", "@acceptance_video", "@drift_corrected"],
        "provenance": {"source": "benchmarks/scenarios/05-holomap-reconstruction/holomap-reconstruction.holo", "lines": "33-42", "kind": "verbatim"},
        "metadata": {"trait_families": ["holomap-decorators"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-015",
        "split": "test",
        "snippet": 'object "DriftOnlyNode" {\n  @drift_corrected\n  geometry: "sphere"\n  position: [2.0, 1, -2]\n  scale: [0.4, 0.4, 0.4]\n  color: "#bbbbbb"\n  material: "metal"\n}',
        "gold_traits": ["@drift_corrected"],
        "provenance": {"source": "benchmarks/scenarios/05-holomap-reconstruction/holomap-reconstruction.holo", "lines": "43-50", "kind": "verbatim"},
        "metadata": {"trait_families": ["holomap-decorators"], "snippet_size_bucket": "solo"},
    },

    # ============ cross-compilation: healthcare ============
    {
        "id": "row-016",
        "split": "train",
        "snippet": 'template "VitalCard" {\n  @billboard\n  @anchor\n  geometry: "plane"\n  scale: [0.12, 0.06, 1]\n  state { value: "--", status: "normal" }\n}',
        "gold_traits": ["@billboard", "@anchor"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/01-healthcare.holo", "lines": "18-23", "kind": "verbatim"},
        "metadata": {"trait_families": ["ui", "spatial-xr"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-017",
        "split": "train",
        "snippet": 'object "AnatomyModel" {\n  @anchor\n  @hand_tracked\n  @scalable\n  @rotatable\n  geometry: "sphere"\n}',
        "gold_traits": ["@anchor", "@hand_tracked", "@scalable", "@rotatable"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/01-healthcare.holo", "lines": "37-43", "kind": "verbatim"},
        "metadata": {"trait_families": ["spatial-xr", "interaction"], "snippet_size_bucket": "four-plus"},
    },

    # ============ cross-compilation: gaming ============
    {
        "id": "row-018",
        "split": "train",
        "snippet": 'template "Enemy" {\n  @ai_agent\n  @collidable\n  @destructible\n  geometry: "sphere"\n  state { hp: 100, speed: 2.0, aggressive: true }\n}',
        "gold_traits": ["@ai_agent", "@collidable", "@destructible"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/04-gaming.holo", "lines": "18-24", "kind": "verbatim"},
        "metadata": {"trait_families": ["ai-npc", "physics", "health-combat"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-019",
        "split": "train",
        "snippet": 'template "Weapon" {\n  @grabbable\n  @throwable\n  @damage_dealer\n  geometry: "cube"\n  state { damage: 25, durability: 100 }\n}',
        "gold_traits": ["@grabbable", "@throwable", "@damage_dealer"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/04-gaming.holo", "lines": "26-32", "kind": "verbatim"},
        "metadata": {"trait_families": ["interaction", "health-combat"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-020",
        "split": "dev",
        "snippet": 'object "Player" {\n  @controllable\n  @physics\n  @health_system\n  geometry: "cube"\n  position: [0, 1, 0]\n  scale: [0.5, 1.8, 0.5]\n  state { hp: 100, mana: 50 }\n}',
        "gold_traits": ["@controllable", "@physics", "@health_system"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/04-gaming.holo", "lines": "34-42", "kind": "verbatim"},
        "metadata": {"trait_families": ["control", "physics", "health-combat"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: education (synthesized from category) ============
    {
        "id": "row-021",
        "split": "train",
        "snippet": 'template "ChalkBoard" {\n  @clickable\n  @hoverable\n  @interactive\n  geometry: "plane"\n  state { content: "" }\n}',
        "gold_traits": ["@clickable", "@hoverable", "@interactive"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/02-education.holo", "lines": "~16-22", "kind": "synth", "note": "structural shape mirrors education-domain interactive board pattern; trait set verified from cross-compilation conventions"},
        "metadata": {"trait_families": ["interaction", "ui"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: retail ============
    {
        "id": "row-022",
        "split": "train",
        "snippet": 'object "PriceTag" {\n  @billboard\n  @clickable\n  @metadata_display\n  geometry: "plane"\n}',
        "gold_traits": ["@billboard", "@clickable", "@metadata_display"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/03-retail.holo", "lines": "~20-25", "kind": "synth", "note": "price-tag pattern from retail benchmark; trait set follows the metadata-display + click convention used elsewhere"},
        "metadata": {"trait_families": ["ui", "interaction"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: architecture ============
    {
        "id": "row-023",
        "split": "train",
        "snippet": 'object "BlueprintWall" {\n  @anchor\n  @scalable\n  geometry: "plane"\n  scale: [4, 3, 1]\n}',
        "gold_traits": ["@anchor", "@scalable"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/05-architecture.holo", "lines": "~22-26", "kind": "synth"},
        "metadata": {"trait_families": ["spatial-xr", "interaction"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: manufacturing ============
    {
        "id": "row-024",
        "split": "train",
        "snippet": 'object "AssemblyLine" {\n  @physics(type: "static")\n  @collidable\n  @tracked\n  geometry: "box"\n  scale: [10, 0.5, 1]\n}',
        "gold_traits": ["@physics", "@collidable", "@tracked"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/06-manufacturing.holo", "lines": "~18-25", "kind": "synth"},
        "metadata": {"trait_families": ["physics", "tracking"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: entertainment ============
    {
        "id": "row-025",
        "split": "train",
        "snippet": 'object "Stage" {\n  @physics(type: "static")\n  @collidable\n  @spatial_audio(source: "music", range: 30)\n  geometry: "box"\n}',
        "gold_traits": ["@physics", "@collidable", "@spatial_audio"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/07-entertainment.holo", "lines": "~20-26", "kind": "synth"},
        "metadata": {"trait_families": ["physics", "audio"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: real-estate ============
    {
        "id": "row-026",
        "split": "train",
        "snippet": 'object "VirtualTour" {\n  @anchor\n  @hoverable\n  @metadata_display\n  geometry: "sphere"\n}',
        "gold_traits": ["@anchor", "@hoverable", "@metadata_display"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/08-real-estate.holo", "lines": "~22-28", "kind": "synth"},
        "metadata": {"trait_families": ["spatial-xr", "interaction", "ui"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: fitness ============
    {
        "id": "row-027",
        "split": "train",
        "snippet": 'template "ExerciseZone" {\n  @interactive\n  @tracked\n  @performance_monitored\n  state { reps: 0, calories: 0, form_score: 100 }\n}',
        "gold_traits": ["@interactive", "@tracked", "@performance_monitored"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/09-fitness.holo", "lines": "16-21", "kind": "verbatim"},
        "metadata": {"trait_families": ["ui", "tracking"], "snippet_size_bucket": "two-to-three"},
    },
    {
        "id": "row-028",
        "split": "dev",
        "snippet": 'object "VirtualTrainer" {\n  @ai_agent\n  @animated\n  @speech_enabled\n  geometry: "cube"\n  position: [0, 1.7, -2]\n  scale: [0.5, 1.8, 0.3]\n  color: "#00aaff"\n}',
        "gold_traits": ["@ai_agent", "@animated", "@speech_enabled"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/09-fitness.holo", "lines": "23-30", "kind": "verbatim"},
        "metadata": {"trait_families": ["ai-npc", "animation", "tracking"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: social ============
    {
        "id": "row-029",
        "split": "train",
        "snippet": 'object "ChatBubble" {\n  @billboard\n  @clickable\n  @metadata_display\n  geometry: "plane"\n}',
        "gold_traits": ["@billboard", "@clickable", "@metadata_display"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/10-social.holo", "lines": "~22-28", "kind": "synth"},
        "metadata": {"trait_families": ["ui", "interaction"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: art ============
    {
        "id": "row-030",
        "split": "train",
        "snippet": 'template "ArtPiece" {\n  @hoverable\n  @metadata_display\n  @gaussian_splat\n  state { title: "", artist: "", year: 0, medium: "" }\n}',
        "gold_traits": ["@hoverable", "@metadata_display", "@gaussian_splat"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/11-art.holo", "lines": "16-22", "kind": "verbatim"},
        "metadata": {"trait_families": ["interaction", "ui", "visual"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: automotive ============
    {
        "id": "row-031",
        "split": "train",
        "snippet": 'object "Steering" {\n  @grabbable\n  @rotatable\n  @physics(mass: 2.0)\n  geometry: "cylinder"\n}',
        "gold_traits": ["@grabbable", "@rotatable", "@physics"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/12-automotive.holo", "lines": "~20-26", "kind": "synth"},
        "metadata": {"trait_families": ["interaction", "physics"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ cross-compilation: aerospace ============
    {
        "id": "row-032",
        "split": "test",
        "snippet": 'object "ControlPanel" {\n  @clickable\n  @interactive\n  @metadata_display\n  @hand_tracked\n  geometry: "plane"\n}',
        "gold_traits": ["@clickable", "@interactive", "@metadata_display", "@hand_tracked"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/13-aerospace.holo", "lines": "~22-30", "kind": "synth"},
        "metadata": {"trait_families": ["interaction", "ui", "spatial-xr"], "snippet_size_bucket": "four-plus"},
    },

    # ============ cross-compilation: tourism ============
    {
        "id": "row-033",
        "split": "train",
        "snippet": 'template "Landmark" {\n  @hoverable\n  @eye_tracking\n  @metadata_display\n  @audio_guide\n  state { name: "", historical_period: "", description: "" }\n}',
        "gold_traits": ["@hoverable", "@eye_tracking", "@metadata_display", "@audio_guide"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/14-tourism.holo", "lines": "16-23", "kind": "verbatim"},
        "metadata": {"trait_families": ["interaction", "spatial-xr", "ui", "audio"], "snippet_size_bucket": "four-plus"},
    },

    # ============ cross-compilation: robotics ============
    {
        "id": "row-034",
        "split": "test",
        "snippet": 'object "ConveyorJoint" {\n  @joint(type: "prismatic", axis: [1, 0, 0])\n  @physics(mass: 50.0)\n  @collidable\n  geometry: "box"\n}',
        "gold_traits": ["@joint", "@physics", "@collidable"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/15-robotics.holo", "lines": "~25-32", "kind": "synth", "note": "prismatic-joint variant of robotics-sim revolute pattern; conveyor archetype is in the robotics benchmark"},
        "metadata": {"trait_families": ["robotics", "physics"], "snippet_size_bucket": "two-to-three"},
    },

    # ============ Solo-trait rows (one trait only) ============
    {
        "id": "row-035",
        "split": "train",
        "snippet": 'object "Indicator" {\n  @glowing(intensity: 1.2)\n  geometry: "sphere"\n  scale: [0.1, 0.1, 0.1]\n  color: "#00ff88"\n}',
        "gold_traits": ["@glowing"],
        "provenance": {"source": "benchmarks/scenarios/02-high-complexity/high-complexity.holo", "lines": "synth-from-glowing-pattern", "kind": "synth"},
        "metadata": {"trait_families": ["visual"], "snippet_size_bucket": "solo"},
    },
    {
        "id": "row-036",
        "split": "train",
        "snippet": 'object "DropZone" {\n  @collidable\n  geometry: "plane"\n  scale: [2, 0.01, 2]\n}',
        "gold_traits": ["@collidable"],
        "provenance": {"source": "benchmarks/scenarios/01-basic-scene/basic-scene.holo", "lines": "synth-from-collidable-pattern", "kind": "synth"},
        "metadata": {"trait_families": ["physics"], "snippet_size_bucket": "solo"},
    },
    {
        "id": "row-037",
        "split": "train",
        "snippet": 'object "FloatingMenu" {\n  @billboard\n  geometry: "plane"\n  position: [0, 1.6, -1]\n}',
        "gold_traits": ["@billboard"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/01-healthcare.holo", "lines": "synth-from-billboard-pattern", "kind": "synth"},
        "metadata": {"trait_families": ["ui"], "snippet_size_bucket": "solo"},
    },
    {
        "id": "row-038",
        "split": "dev",
        "snippet": 'object "Anchor" {\n  @anchor\n  geometry: "sphere"\n  scale: [0.05, 0.05, 0.05]\n}',
        "gold_traits": ["@anchor"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/01-healthcare.holo", "lines": "synth-from-anchor-pattern", "kind": "synth"},
        "metadata": {"trait_families": ["spatial-xr"], "snippet_size_bucket": "solo"},
    },
    {
        "id": "row-039",
        "split": "train",
        "snippet": 'object "AmbientSound" {\n  @spatial_audio(source: "ambient.ogg", range: 15)\n  position: [0, 2, 0]\n}',
        "gold_traits": ["@spatial_audio"],
        "provenance": {"source": "benchmarks/scenarios/04-multiplayer-vr/multiplayer-vr.holo", "lines": "synth-from-spatial-audio-pattern", "kind": "synth"},
        "metadata": {"trait_families": ["audio"], "snippet_size_bucket": "solo"},
    },
    {
        "id": "row-040",
        "split": "train",
        "snippet": 'object "EnemySpawner" {\n  @ai_agent\n  geometry: "cube"\n  state { spawn_rate: 1.0 }\n}',
        "gold_traits": ["@ai_agent"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/04-gaming.holo", "lines": "synth-from-ai_agent-pattern", "kind": "synth"},
        "metadata": {"trait_families": ["ai-npc"], "snippet_size_bucket": "solo"},
    },
    {
        "id": "row-041",
        "split": "test",
        "snippet": 'object "ResetButton" {\n  @clickable\n  geometry: "cylinder"\n  scale: [0.05, 0.02, 0.05]\n}',
        "gold_traits": ["@clickable"],
        "provenance": {"source": "benchmarks/scenarios/04-multiplayer-vr/multiplayer-vr.holo", "lines": "synth-from-clickable-pattern", "kind": "synth"},
        "metadata": {"trait_families": ["interaction"], "snippet_size_bucket": "solo"},
    },
    {
        "id": "row-042",
        "split": "train",
        "snippet": 'object "RotatingDial" {\n  @rotatable\n  geometry: "cylinder"\n  scale: [0.06, 0.01, 0.06]\n}',
        "gold_traits": ["@rotatable"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/01-healthcare.holo", "lines": "synth-from-rotatable-pattern", "kind": "synth"},
        "metadata": {"trait_families": ["interaction"], "snippet_size_bucket": "solo"},
    },

    # ============ Composite four-plus rows ============
    {
        "id": "row-043",
        "split": "dev",
        "snippet": 'object "TrainingDummy" {\n  @ai_agent\n  @physics\n  @collidable\n  @health_system\n  @destructible\n  geometry: "cube"\n  state { hp: 100 }\n}',
        "gold_traits": ["@ai_agent", "@physics", "@collidable", "@health_system", "@destructible"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/04-gaming.holo", "lines": "synth-composite-from-Player+Enemy", "kind": "synth", "note": "merges Player health-system + Enemy destructible to produce 5-trait composite for ablation coverage"},
        "metadata": {"trait_families": ["ai-npc", "physics", "health-combat"], "snippet_size_bucket": "four-plus"},
    },
    {
        "id": "row-044",
        "split": "train",
        "snippet": 'object "InteractiveSculpture" {\n  @grabbable\n  @rotatable\n  @scalable\n  @hoverable\n  @gaussian_splat\n  geometry: "model/sculpture.glb"\n}',
        "gold_traits": ["@grabbable", "@rotatable", "@scalable", "@hoverable", "@gaussian_splat"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/11-art.holo", "lines": "synth-composite-from-ArtPiece+gallery", "kind": "synth"},
        "metadata": {"trait_families": ["interaction", "visual"], "snippet_size_bucket": "four-plus"},
    },
    {
        "id": "row-045",
        "split": "train",
        "snippet": 'object "MultiplayerWeapon" {\n  @networked(mode: "shared", syncRate: 30)\n  @grabbable\n  @throwable\n  @damage_dealer\n  @physics(mass: 1.5)\n  @collidable\n  geometry: "model/sword.glb"\n}',
        "gold_traits": ["@networked", "@grabbable", "@throwable", "@damage_dealer", "@physics", "@collidable"],
        "provenance": {"source": "benchmarks/cross-compilation/compositions/04-gaming.holo + multiplayer-vr.holo", "lines": "synth-composite", "kind": "synth", "note": "merges Weapon (gaming) with networked (multiplayer-vr) for 6-trait stress test"},
        "metadata": {"trait_families": ["networking", "interaction", "health-combat", "physics"], "snippet_size_bucket": "four-plus"},
    },

    # ============ Negative-control rows (no traits — looks trait-bearing but isn't) ============
    {
        "id": "row-046",
        "split": "dev",
        "snippet": 'object "DecorativeCube" {\n  geometry: "box"\n  position: [0, 1, 0]\n  scale: [0.5, 0.5, 0.5]\n  color: "#888888"\n  material: "matte"\n}',
        "gold_traits": [],
        "provenance": {"source": "synth-negative", "lines": "n/a", "kind": "synth", "note": "decorative object with NO trait annotations — gold label is empty list. Tests classifier's ability to refuse to predict traits absent from the source."},
        "metadata": {"trait_families": [], "snippet_size_bucket": "solo", "negative_control": True},
    },
    {
        "id": "row-047",
        "split": "test",
        "snippet": 'object "PropMass" {\n  geometry: "sphere"\n  physics_props: { mass: 1.0, restitution: 0.5 }\n  color: "#aabbcc"\n}',
        "gold_traits": [],
        "provenance": {"source": "synth-negative", "lines": "n/a", "kind": "synth", "note": "ATTRACTOR: looks like @physics because it has a physics_props block, but no @physics annotation — gold label is empty. Catches keyword-shortcut classifiers."},
        "metadata": {"trait_families": [], "snippet_size_bucket": "solo", "negative_control": True},
    },
    {
        "id": "row-048",
        "split": "train",
        "snippet": 'object "PlainPlayer" {\n  geometry: "cube"\n  position: [0, 1, 0]\n  health: 100\n  speed: 5\n}',
        "gold_traits": [],
        "provenance": {"source": "synth-negative", "lines": "n/a", "kind": "synth", "note": "ATTRACTOR: has health/speed properties but no @health_system or @controllable trait — gold label is empty."},
        "metadata": {"trait_families": [], "snippet_size_bucket": "solo", "negative_control": True},
    },
    {
        "id": "row-049",
        "split": "train",
        "snippet": 'object "AmbientLightSource" {\n  geometry: "sphere"\n  emissive: "#ffffaa"\n  emissive_intensity: 2.0\n  scale: [0.05, 0.05, 0.05]\n}',
        "gold_traits": [],
        "provenance": {"source": "synth-negative", "lines": "n/a", "kind": "synth", "note": "ATTRACTOR: emissive material does not imply @glowing trait. Glowing is a runtime trait; emissive is a property. Catches classifiers that conflate styling with traits."},
        "metadata": {"trait_families": [], "snippet_size_bucket": "solo", "negative_control": True},
    },
    {
        "id": "row-050",
        "split": "dev",
        "snippet": 'template "BaseTemplate" {\n  geometry: "plane"\n  state { value: "" }\n  description: "trait-free base for testing"\n}',
        "gold_traits": [],
        "provenance": {"source": "synth-negative", "lines": "n/a", "kind": "synth", "note": "ATTRACTOR: a template with state{} but no traits — gold label is empty. Templates may or may not carry traits; absence-of-decorator is the only signal."},
        "metadata": {"trait_families": [], "snippet_size_bucket": "solo", "negative_control": True},
    },
]
# fmt: on


def snippet_hash(s: str) -> str:
    return hashlib.sha256(s.strip().encode("utf-8")).hexdigest()[:12]


def main() -> int:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Dedup check
    hashes_per_split: dict[str, set[str]] = {"train": set(), "dev": set(), "test": set()}
    all_hashes: dict[str, str] = {}  # hash -> id
    for row in ROWS:
        h = snippet_hash(row["snippet"])
        if h in all_hashes and all_hashes[h] != row["id"]:
            print(f"FATAL: snippet collision between {all_hashes[h]} and {row['id']}", file=sys.stderr)
            return 1
        all_hashes[h] = row["id"]
        hashes_per_split[row["split"]].add(h)

    # Cross-split leakage check
    for s1, s2 in [("train", "dev"), ("train", "test"), ("dev", "test")]:
        leaked = hashes_per_split[s1] & hashes_per_split[s2]
        if leaked:
            print(f"FATAL: snippet leakage between {s1} and {s2}: {leaked}", file=sys.stderr)
            return 1

    # Write JSONL
    with OUT_PATH.open("w", encoding="utf-8", newline="\n") as f:
        for row in ROWS:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Stats
    splits = {s: sum(1 for r in ROWS if r["split"] == s) for s in ("train", "dev", "test")}
    families: set[str] = set()
    for row in ROWS:
        for fam in row["metadata"].get("trait_families", []):
            families.add(fam)
    buckets = {b: sum(1 for r in ROWS if r["metadata"].get("snippet_size_bucket") == b) for b in ("solo", "two-to-three", "four-plus")}
    negative_controls = sum(1 for r in ROWS if r["metadata"].get("negative_control"))
    verbatim = sum(1 for r in ROWS if r["provenance"]["kind"] == "verbatim")
    synth = sum(1 for r in ROWS if r["provenance"]["kind"] == "synth")

    print(f"OK: wrote {len(ROWS)} rows to {OUT_PATH.relative_to(REPO_ROOT)}")
    print(f"  splits: train={splits['train']} dev={splits['dev']} test={splits['test']}")
    print(f"  trait families covered: {len(families)} -> {sorted(families)}")
    print(f"  size buckets: solo={buckets['solo']} two-to-three={buckets['two-to-three']} four-plus={buckets['four-plus']}")
    print(f"  negative controls: {negative_controls}")
    print(f"  provenance: verbatim={verbatim} synth={synth}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
