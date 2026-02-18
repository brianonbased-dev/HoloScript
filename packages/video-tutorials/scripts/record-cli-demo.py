#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
Asciinema-based CLI demo recorder for HoloScript.

Records real terminal sessions showing HoloScript CLI invocations,
then converts to GIF/MP4 for embedding in Remotion compositions
or documentation pages.

Prerequisites:
    pip install asciinema asciinema-automation
    npm install -g agg              # for .cast → GIF conversion
    brew install ffmpeg / apt-get install ffmpeg  # for GIF → MP4

Usage:
    python scripts/record-cli-demo.py --demo unity
    python scripts/record-cli-demo.py --demo all
    python scripts/record-cli-demo.py --list

Output:
    public/terminal-demos/{demo-name}.cast   # raw asciinema recording
    public/terminal-demos/{demo-name}.gif    # animated GIF
    public/terminal-demos/{demo-name}.mp4    # video (optional)

Remotion usage:
    import { Img, staticFile } from "remotion";
    <Img src={staticFile("terminal-demos/unity-compile.gif")} />
"""

import subprocess
import sys
import os
import time
import shutil
import json
import argparse
from pathlib import Path
from typing import Optional

# ─── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent  # packages/video-tutorials/../../..
OUTPUT_DIR = SCRIPT_DIR.parent / "public" / "terminal-demos"
HOLOSCRIPT_EXAMPLE = REPO_ROOT / "packages" / "core" / "src" / "parser" / "__tests__"

# ─── Demo definitions ─────────────────────────────────────────────────────────

DEMOS = {
    "unity-compile": {
        "description": "Compile a .holo scene to Unity C#",
        "duration": 12,
        "theme": "monokai",
        "width": 120,
        "height": 30,
        "commands": [
            ("# HoloScript → Unity compiler demo", 0.5),
            ("cat scene.holo", 1.0),
            ("", 1.5),
            ("npx holoscript compile scene.holo --target unity", 2.0),
            ("", 1.0),
            ("cat out/SpinningDemo.cs | head -40", 1.5),
        ],
    },
    "multi-target": {
        "description": "Compile one .holo file to multiple targets simultaneously",
        "duration": 18,
        "theme": "monokai",
        "width": 120,
        "height": 35,
        "commands": [
            ("# One scene. 18 compiler targets.", 0.5),
            ("ls *.holo", 1.0),
            ("", 0.5),
            ("npx holoscript compile VirtualGarden.holo --target unity", 2.5),
            ("npx holoscript compile VirtualGarden.holo --target godot", 2.5),
            ("npx holoscript compile VirtualGarden.holo --target babylon", 2.5),
            ("npx holoscript compile VirtualGarden.holo --target visionos", 2.5),
            ("", 0.5),
            ("ls out/", 1.0),
        ],
    },
    "parse-validate": {
        "description": "Parse and validate a .holo file with the CLI",
        "duration": 10,
        "theme": "monokai",
        "width": 100,
        "height": 28,
        "commands": [
            ("# Validate a .holo file", 0.5),
            ("npx holoscript validate scene.holo", 2.0),
            ("", 0.5),
            ("# Intentionally broken file", 0.5),
            ("npx holoscript validate broken.holo", 2.0),
        ],
    },
    "trait-search": {
        "description": "Search the 1,525+ trait library from the CLI",
        "duration": 12,
        "theme": "monokai",
        "width": 110,
        "height": 32,
        "commands": [
            ("# Search the trait library", 0.5),
            ("npx holoscript traits --search physics", 2.0),
            ("", 0.5),
            ("npx holoscript traits --search interactable --verbose", 2.5),
            ("", 0.5),
            ("npx holoscript traits --count", 1.0),
        ],
    },
    "project-init": {
        "description": "Initialize a new HoloScript project with CLI scaffolding",
        "duration": 15,
        "theme": "monokai",
        "width": 110,
        "height": 32,
        "commands": [
            ("# Scaffold a new HoloScript project", 0.5),
            ("npx holoscript init my-vr-world", 2.5),
            ("", 1.0),
            ("cd my-vr-world", 0.5),
            ("ls -la", 1.0),
            ("", 0.5),
            ("cat package.json | head -20", 1.5),
            ("", 0.5),
            ("npx holoscript dev", 2.0),
        ],
    },
    "npm-publish": {
        "description": "Build and publish a HoloScript package to npm",
        "duration": 20,
        "theme": "monokai",
        "width": 110,
        "height": 35,
        "commands": [
            ("# Build and publish @holoscript/my-traits", 0.5),
            ("pnpm run build", 2.0),
            ("", 0.5),
            ("pnpm run test", 2.5),
            ("", 0.5),
            ("npx changeset", 1.5),
            ("npx changeset version", 1.0),
            ("", 0.5),
            ("pnpm publish --access public", 2.5),
            ("", 1.0),
            ("npm info @holoscript/my-traits", 1.5),
        ],
    },
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def check_dependency(cmd: str, install_hint: str) -> bool:
    """Check if a CLI tool is available."""
    if shutil.which(cmd):
        return True
    print(f"  ⚠️  '{cmd}' not found. {install_hint}")
    return False


def run_with_asciinema_automation(
    demo_name: str,
    commands: list,
    output_cast: Path,
    width: int,
    height: int,
    delay_between: float = 0.3,
):
    """
    Use asciinema-automation to script a terminal recording.
    Falls back to a manually-crafted .cast file if not available.
    """
    try:
        from asciinema_automation import Script, AutomatedRecording

        script = Script()
        for cmd, pause in commands:
            if cmd:
                script.send_line(cmd)
            script.wait(pause)

        recording = AutomatedRecording(
            script=script,
            cast_path=str(output_cast),
            cols=width,
            rows=height,
        )
        recording.run()
        print(f"  ✅ Recorded → {output_cast}")

    except ImportError:
        print("  ℹ️  asciinema-automation not installed.")
        print("     pip install asciinema-automation")
        print("     Generating mock .cast file instead...")
        _generate_mock_cast(demo_name, commands, output_cast, width, height)


def _generate_mock_cast(
    demo_name: str,
    commands: list,
    output_cast: Path,
    width: int,
    height: int,
):
    """
    Generate a valid .cast v2 file with simulated terminal output.
    Useful for CI environments where asciinema cannot run interactively.
    """
    events = []
    t = 0.5

    header = {
        "version": 2,
        "width": width,
        "height": height,
        "timestamp": int(time.time()),
        "title": f"HoloScript CLI — {demo_name}",
        "env": {"SHELL": "/bin/bash", "TERM": "xterm-256color"},
    }

    # Simulate a prompt
    prompt = "\r\n\033[1;32m$\033[0m "

    events.append([t, "o", prompt])

    for cmd, pause in commands:
        if not cmd:
            t += pause
            continue

        # Type the command character by character
        for char in cmd:
            t += 0.05
            events.append([t, "o", char])

        # Press enter
        t += 0.1
        events.append([t, "o", "\r\n"])
        t += 0.2

        # Simulate output (simplified)
        if cmd.startswith("npx holoscript compile"):
            output_lines = [
                "\033[36m⚙\033[0m  Parsing scene.holo...",
                "\033[36m⚙\033[0m  Compiling with UnityCompiler...",
                "\033[32m✓\033[0m  out/SpinningDemo.cs (142 lines)",
            ]
        elif cmd.startswith("cat") and "holo" in cmd:
            output_lines = [
                "scene SpinningDemo {",
                "  object Cube {",
                "    mesh: Cube { size: 1 }",
                "    material: StandardMaterial { color: #4488ff }",
                "    position: [0, 0, 0]",
                "  }",
                "}",
            ]
        elif cmd.startswith("ls"):
            output_lines = ["\033[34mout/\033[0m  scene.holo  README.md"]
        elif cmd.startswith("npx holoscript init"):
            output_lines = [
                "[32m✓[0m  Created my-vr-world/",
                "[32m✓[0m  Installed dependencies",
                "[32m✓[0m  Ready to develop",
            ]
        elif cmd.startswith("npx holoscript dev"):
            output_lines = [
                "[36m→[0m  Dev server running at http://localhost:3000",
                "[36m→[0m  Watching .holo files...",
            ]
        elif cmd.startswith("pnpm run build"):
            output_lines = [
                "[32m✓[0m  Built 3 targets in 1.2s",
            ]
        elif cmd.startswith("pnpm run test"):
            output_lines = [
                "[32m✓[0m  48 tests passed",
            ]
        elif cmd.startswith("pnpm publish"):
            output_lines = [
                "[32m✓[0m  Published @holoscript/my-traits@1.0.0",
            ]
        else:
            output_lines = []

        for line in output_lines:
            t += 0.08
            events.append([t, "o", line + "\r\n"])

        # Next prompt
        t += pause
        events.append([t, "o", prompt])

    # Write the .cast file
    output_cast.parent.mkdir(parents=True, exist_ok=True)
    with open(output_cast, "w") as f:
        f.write(json.dumps(header) + "\n")
        for event in events:
            f.write(json.dumps(event) + "\n")

    print(f"  ✅ Mock .cast file generated → {output_cast}")


def cast_to_gif(cast_path: Path, gif_path: Path, theme: str = "monokai") -> bool:
    """Convert .cast to GIF using agg."""
    if not check_dependency("agg", "npm install -g agg  OR  cargo install agg"):
        return False

    result = subprocess.run(
        ["agg", str(cast_path), str(gif_path), "--theme", theme, "--fps-cap", "20"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        size_kb = gif_path.stat().st_size / 1024
        print(f"  ✅ GIF generated ({size_kb:.0f} KB) → {gif_path}")
        return True
    else:
        print(f"  ❌ agg failed: {result.stderr}")
        return False


def gif_to_mp4(gif_path: Path, mp4_path: Path) -> bool:
    """Convert GIF to MP4 using ffmpeg (optional)."""
    if not check_dependency("ffmpeg", "brew install ffmpeg  OR  apt-get install ffmpeg"):
        return False

    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(gif_path),
            "-movflags", "faststart",
            "-pix_fmt", "yuv420p",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            str(mp4_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        size_kb = mp4_path.stat().st_size / 1024
        print(f"  ✅ MP4 generated ({size_kb:.0f} KB) → {mp4_path}")
        return True
    else:
        print(f"  ❌ ffmpeg failed: {result.stderr}")
        return False


# ─── Main ─────────────────────────────────────────────────────────────────────

def record_demo(name: str, to_mp4: bool = False):
    demo = DEMOS.get(name)
    if not demo:
        print(f"❌ Unknown demo '{name}'. Use --list to see available demos.")
        sys.exit(1)

    print(f"\n🎬 Recording: {name}")
    print(f"   {demo['description']}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    cast_path = OUTPUT_DIR / f"{name}.cast"
    gif_path = OUTPUT_DIR / f"{name}.gif"
    mp4_path = OUTPUT_DIR / f"{name}.mp4"

    # Step 1: Record
    run_with_asciinema_automation(
        demo_name=name,
        commands=demo["commands"],
        output_cast=cast_path,
        width=demo["width"],
        height=demo["height"],
    )

    # Step 2: Cast → GIF
    cast_to_gif(cast_path, gif_path, theme=demo.get("theme", "monokai"))

    # Step 3: GIF → MP4 (optional)
    if to_mp4 and gif_path.exists():
        gif_to_mp4(gif_path, mp4_path)


def main():
    parser = argparse.ArgumentParser(
        description="Record HoloScript CLI demos using asciinema"
    )
    parser.add_argument("--demo", help="Demo name to record")
    parser.add_argument("--all", action="store_true", help="Record all demos")
    parser.add_argument("--list", action="store_true", help="List available demos")
    parser.add_argument("--mp4", action="store_true", help="Also convert to MP4")
    args = parser.parse_args()

    if args.list:
        print("Available demos:")
        for name, demo in DEMOS.items():
            print(f"  • {name:<25} {demo['description']}")
        return

    if not args.demo and not args.all:
        parser.print_help()
        return

    demos_to_run = list(DEMOS.keys()) if args.all else [args.demo]
    for demo_name in demos_to_run:
        record_demo(demo_name, to_mp4=args.mp4)

    print(f"\n✅ Complete. Files in: {OUTPUT_DIR}")
    print("   Embed in Remotion: <Img src={staticFile('terminal-demos/<name>.gif')} />")


if __name__ == "__main__":
    main()
