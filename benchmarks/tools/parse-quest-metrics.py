#!/usr/bin/env python3
"""
Quest 3 Metrics Parser

Parses VrApi and Unity/Unreal logs from Quest profiling
to extract runtime performance metrics.

Usage:
    python3 parse-quest-metrics.py <log_file>

Output:
    JSON with performance summary
"""

import json
import re
import sys
import statistics
from typing import List, Dict, Any


def parse_vrapi_metrics(log_file: str) -> Dict[str, Any]:
    """Parse VrApi performance logs from Quest device"""

    fps_values: List[float] = []
    frame_times: List[float] = []
    cpu_times: List[float] = []
    gpu_times: List[float] = []
    memory_values: List[float] = []

    with open(log_file, 'r') as f:
        for line in f:
            # Extract FPS
            # Example: "VrApi: FPS=72.0"
            fps_match = re.search(r'FPS[=\s]+(\d+\.?\d*)', line, re.IGNORECASE)
            if fps_match:
                fps_values.append(float(fps_match.group(1)))

            # Extract frame time (ms)
            # Example: "VrApi: FrameTime=13.89ms"
            ft_match = re.search(r'FrameTime[=\s]+(\d+\.?\d*)', line, re.IGNORECASE)
            if ft_match:
                frame_times.append(float(ft_match.group(1)))

            # Extract CPU time
            # Example: "VrApi: CPU=10.2ms"
            cpu_match = re.search(r'CPU[=\s]+(\d+\.?\d*)', line, re.IGNORECASE)
            if cpu_match:
                cpu_times.append(float(cpu_match.group(1)))

            # Extract GPU time
            # Example: "VrApi: GPU=8.5ms"
            gpu_match = re.search(r'GPU[=\s]+(\d+\.?\d*)', line, re.IGNORECASE)
            if gpu_match:
                gpu_times.append(float(gpu_match.group(1)))

            # Extract memory (MB)
            # Example: "VrApi: Memory=450MB"
            mem_match = re.search(r'Memory[=\s]+(\d+)', line, re.IGNORECASE)
            if mem_match:
                memory_values.append(float(mem_match.group(1)))

    if not fps_values:
        print("Warning: No FPS data found in log", file=sys.stderr)

    return {
        "fps": fps_values,
        "frameTime": frame_times,
        "cpu": cpu_times,
        "gpu": gpu_times,
        "memory": memory_values
    }


def calculate_statistics(values: List[float]) -> Dict[str, float]:
    """Calculate min, max, avg, median, p95 for a metric"""

    if not values:
        return {
            "min": 0.0,
            "max": 0.0,
            "avg": 0.0,
            "median": 0.0,
            "p95": 0.0,
            "stddev": 0.0
        }

    sorted_values = sorted(values)
    p95_index = int(len(sorted_values) * 0.95)

    return {
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        "avg": round(statistics.mean(values), 2),
        "median": round(statistics.median(values), 2),
        "p95": round(sorted_values[p95_index], 2) if p95_index < len(sorted_values) else 0.0,
        "stddev": round(statistics.stdev(values), 2) if len(values) > 1 else 0.0
    }


def generate_summary(metrics: Dict[str, List[float]]) -> Dict[str, Any]:
    """Generate JSON summary with statistics for all metrics"""

    summary = {
        "timestamp": "",  # Will be filled by shell script
        "platform": "Quest 3",
        "totalFrames": len(metrics.get("fps", [])),
        "metrics": {
            "fps": calculate_statistics(metrics.get("fps", [])),
            "frameTimeMs": calculate_statistics(metrics.get("frameTime", [])),
            "cpuTimeMs": calculate_statistics(metrics.get("cpu", [])),
            "gpuTimeMs": calculate_statistics(metrics.get("gpu", [])),
            "memoryMB": calculate_statistics(metrics.get("memory", []))
        },
        "status": "PASS"  # Default status
    }

    # Check if performance meets targets
    avg_fps = summary["metrics"]["fps"]["avg"]
    if avg_fps < 72:  # Quest 2/3 target
        summary["status"] = "FAIL"
        summary["warning"] = f"Average FPS ({avg_fps}) below target (72)"

    return summary


def main():
    """Main entry point"""

    if len(sys.argv) < 2:
        print("Usage: python3 parse-quest-metrics.py <log_file>", file=sys.stderr)
        sys.exit(1)

    log_file = sys.argv[1]

    try:
        # Parse raw metrics
        metrics = parse_vrapi_metrics(log_file)

        # Generate summary with statistics
        summary = generate_summary(metrics)

        # Output JSON
        print(json.dumps(summary, indent=2))

    except FileNotFoundError:
        print(f"Error: Log file not found: {log_file}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error parsing log: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
