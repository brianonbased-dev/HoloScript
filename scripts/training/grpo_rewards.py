"""
grpo_rewards.py

Python bridge module that wraps HoloScript's TypeScript GRPO reward functions
for direct use with TRL GRPOTrainer's reward_funcs parameter.

The bridge communicates with the TypeScript reward orchestrator via a
lightweight HTTP server (started via subprocess) or direct subprocess
invocation for simpler setups.

Usage with TRL GRPOTrainer:
    from grpo_rewards import (
        test_pass_reward,
        type_check_reward,
        lint_reward,
        coverage_reward,
        circuit_breaker_reward,
        create_composite_reward,
    )

    trainer = GRPOTrainer(
        model=model,
        reward_funcs=[
            test_pass_reward,
            type_check_reward,
            lint_reward,
            coverage_reward,
            circuit_breaker_reward,
        ],
        args=grpo_config,
    )

Or using the composite reward (single function):
    trainer = GRPOTrainer(
        model=model,
        reward_funcs=[create_composite_reward()],
        args=grpo_config,
    )
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Path to the HoloScript project root (auto-detected or set via env var)
HOLOSCRIPT_ROOT = os.environ.get(
    "HOLOSCRIPT_ROOT",
    str(Path(__file__).resolve().parent.parent.parent),
)

# Node.js executable (npx is used to run vitest/tsc/eslint)
NODE_BIN = os.environ.get("NODE_BIN", "node")
NPX_BIN = os.environ.get("NPX_BIN", "npx")

# Timeout for individual reward evaluations (seconds)
DEFAULT_TIMEOUT = int(os.environ.get("GRPO_REWARD_TIMEOUT", "30"))

# Maximum parallel workers for batch processing
MAX_WORKERS = int(os.environ.get("GRPO_MAX_WORKERS", "4"))

# GRPO reward weights (must match GRPORewardFunctions.ts)
REWARD_WEIGHTS = {
    "test_pass": 0.40,
    "type_check": 0.20,
    "lint": 0.15,
    "coverage": 0.15,
    "circuit_breaker": 0.10,
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class RewardResult:
    """Result from a single reward evaluation."""
    reward: float
    success: bool
    duration_ms: float
    error: Optional[str] = None
    raw_output: Optional[str] = None


@dataclass
class BatchResult:
    """Result from evaluating a batch of completions."""
    rewards: List[float]
    results: List[RewardResult]
    total_duration_ms: float
    cache_hits: int = 0


@dataclass
class RewardCache:
    """Simple LRU cache for reward evaluations."""
    max_size: int = 1000
    _cache: Dict[str, float] = field(default_factory=dict)
    _hits: int = 0
    _misses: int = 0

    def get(self, key: str) -> Optional[float]:
        if key in self._cache:
            self._hits += 1
            return self._cache[key]
        self._misses += 1
        return None

    def set(self, key: str, value: float) -> None:
        if len(self._cache) >= self.max_size:
            # Remove oldest entry (FIFO eviction)
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
        self._cache[key] = value

    @property
    def hit_rate(self) -> float:
        total = self._hits + self._misses
        return self._hits / total if total > 0 else 0.0


# =============================================================================
# TOOL RUNNERS (subprocess-based)
# =============================================================================

def _run_command(
    cmd: List[str],
    cwd: str = HOLOSCRIPT_ROOT,
    timeout: int = DEFAULT_TIMEOUT,
    input_text: Optional[str] = None,
) -> subprocess.CompletedProcess:
    """Run a command with timeout and capture output."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            timeout=timeout,
            capture_output=True,
            text=True,
            input=input_text,
        )
        return result
    except subprocess.TimeoutExpired:
        logger.warning(f"Command timed out after {timeout}s: {' '.join(cmd[:3])}")
        return subprocess.CompletedProcess(
            args=cmd,
            returncode=-1,
            stdout="",
            stderr=f"Timeout after {timeout}s",
        )
    except FileNotFoundError:
        logger.error(f"Command not found: {cmd[0]}")
        return subprocess.CompletedProcess(
            args=cmd,
            returncode=-1,
            stdout="",
            stderr=f"Command not found: {cmd[0]}",
        )


def _write_temp_file(content: str, extension: str = ".ts") -> str:
    """Write content to a temporary file and return its path."""
    fd, path = tempfile.mkstemp(suffix=extension, prefix="grpo_reward_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception:
        os.close(fd)
        raise
    return path


def _cleanup_temp_file(path: str) -> None:
    """Safely delete a temporary file."""
    try:
        if os.path.exists(path):
            os.unlink(path)
    except OSError:
        pass


# =============================================================================
# INDIVIDUAL REWARD FUNCTIONS
# =============================================================================

def _evaluate_test_pass(completion: str, timeout: int = DEFAULT_TIMEOUT) -> float:
    """
    Run vitest on the completion and return test pass rate [0, 1].
    Weight: 0.40
    """
    temp_path = _write_temp_file(completion, ".test.ts")
    try:
        result = _run_command(
            [NPX_BIN, "vitest", "run", temp_path, "--reporter=json"],
            timeout=timeout,
        )

        if result.returncode == -1:
            return 0.0

        # Parse JSON output from vitest
        try:
            output = json.loads(result.stdout)
            num_passed = output.get("numPassedTests", 0)
            num_total = output.get("numTotalTests", 0)
            if num_total == 0:
                return 0.0
            return min(1.0, max(0.0, num_passed / num_total))
        except (json.JSONDecodeError, KeyError):
            # Fallback: check exit code
            return 1.0 if result.returncode == 0 else 0.0
    finally:
        _cleanup_temp_file(temp_path)


def _evaluate_type_check(completion: str, timeout: int = DEFAULT_TIMEOUT) -> float:
    """
    Run tsc --noEmit on the completion. Returns 1.0 (pass) or 0.0 (fail).
    Weight: 0.20
    """
    temp_path = _write_temp_file(completion, ".ts")
    try:
        result = _run_command(
            [NPX_BIN, "tsc", "--noEmit", "--strict", temp_path],
            timeout=timeout,
        )
        return 1.0 if result.returncode == 0 else 0.0
    finally:
        _cleanup_temp_file(temp_path)


def _evaluate_lint(
    completion: str,
    max_issues: int = 20,
    timeout: int = DEFAULT_TIMEOUT,
) -> float:
    """
    Run eslint on the completion. Returns 1 - (issues / max_issues).
    Weight: 0.15
    """
    temp_path = _write_temp_file(completion, ".ts")
    try:
        result = _run_command(
            [NPX_BIN, "eslint", "--format=json", temp_path],
            timeout=timeout,
        )

        try:
            output = json.loads(result.stdout)
            if isinstance(output, list) and len(output) > 0:
                error_count = output[0].get("errorCount", 0)
                warning_count = output[0].get("warningCount", 0)
                total_issues = error_count + warning_count
            else:
                total_issues = 0
        except (json.JSONDecodeError, KeyError, IndexError):
            # If eslint fails to parse, count as maximum issues
            total_issues = max_issues if result.returncode != 0 else 0

        max_issues = max(1, max_issues)
        return min(1.0, max(0.0, 1 - total_issues / max_issues))
    finally:
        _cleanup_temp_file(temp_path)


def _evaluate_coverage(completion: str, timeout: int = DEFAULT_TIMEOUT) -> float:
    """
    Run vitest with coverage and return coverage percentage / 100.
    Weight: 0.15
    """
    temp_path = _write_temp_file(completion, ".test.ts")
    try:
        result = _run_command(
            [
                NPX_BIN, "vitest", "run", temp_path,
                "--reporter=json",
                "--coverage",
            ],
            timeout=timeout,
        )

        if result.returncode == -1:
            return 0.0

        try:
            output = json.loads(result.stdout)
            # Coverage is typically in a separate coverage summary
            coverage_map = output.get("coverageMap", {})
            if coverage_map:
                total_statements = 0
                covered_statements = 0
                for file_cov in coverage_map.values():
                    s = file_cov.get("s", {})
                    total_statements += len(s)
                    covered_statements += sum(1 for v in s.values() if v > 0)
                if total_statements > 0:
                    return min(1.0, covered_statements / total_statements)
            return 0.0
        except (json.JSONDecodeError, KeyError):
            return 0.0
    finally:
        _cleanup_temp_file(temp_path)


def _evaluate_circuit_breaker(timeout: int = DEFAULT_TIMEOUT) -> float:
    """
    Check circuit breaker health. Returns health/100.
    Weight: 0.10

    This calls the TypeScript CircuitBreakerMetrics via a Node.js script.
    Falls back to 1.0 (healthy) if the health check is unavailable.
    """
    script = """
    try {
        const { CircuitBreakerMetricsCollector } = require(
            '%s/packages/core/src/CircuitBreakerMetrics'
        );
        const collector = new CircuitBreakerMetricsCollector();
        const snapshot = collector.getSnapshot();
        console.log(JSON.stringify({ health: snapshot.health.score }));
    } catch (e) {
        console.log(JSON.stringify({ health: 100 }));
    }
    """ % HOLOSCRIPT_ROOT.replace("\\", "/")

    result = _run_command(
        [NODE_BIN, "-e", script],
        timeout=timeout,
    )

    try:
        output = json.loads(result.stdout)
        health = output.get("health", 100)
        return min(1.0, max(0.0, health / 100))
    except (json.JSONDecodeError, KeyError):
        return 1.0  # Fallback: assume healthy


# =============================================================================
# TRL-COMPATIBLE REWARD FUNCTIONS
# =============================================================================

# Global cache instance
_reward_cache = RewardCache()


def _make_batch_reward_fn(
    evaluator: Callable[..., float],
    cache_prefix: str,
    **eval_kwargs: Any,
) -> Callable[[List[str]], List[float]]:
    """
    Create a TRL-compatible batch reward function from a single-completion evaluator.

    TRL GRPOTrainer expects: reward_func(completions: list[str]) -> list[float]
    """
    def reward_fn(completions: List[str], **kwargs: Any) -> List[float]:
        timeout = kwargs.get("timeout", DEFAULT_TIMEOUT)
        results: List[float] = [0.0] * len(completions)

        # Check cache first
        uncached_indices: List[int] = []
        uncached_completions: List[str] = []

        for i, completion in enumerate(completions):
            cache_key = f"{cache_prefix}:{hash(completion)}"
            cached = _reward_cache.get(cache_key)
            if cached is not None:
                results[i] = cached
            else:
                uncached_indices.append(i)
                uncached_completions.append(completion)

        if not uncached_completions:
            return results

        # Process uncached completions in parallel
        max_workers = min(MAX_WORKERS, len(uncached_completions))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {}
            for idx, completion in zip(uncached_indices, uncached_completions):
                merged_kwargs = {**eval_kwargs, "timeout": timeout}
                future = executor.submit(evaluator, completion, **merged_kwargs)
                futures[future] = idx

            for future in as_completed(futures):
                idx = futures[future]
                try:
                    reward = future.result(timeout=timeout + 5)
                    results[idx] = reward
                    cache_key = f"{cache_prefix}:{hash(completions[idx])}"
                    _reward_cache.set(cache_key, reward)
                except Exception as e:
                    logger.warning(f"Reward evaluation failed for index {idx}: {e}")
                    results[idx] = 0.0

        return results

    return reward_fn


def _make_global_reward_fn(
    evaluator: Callable[..., float],
    **eval_kwargs: Any,
) -> Callable[[List[str]], List[float]]:
    """
    Create a batch reward function where all completions receive the same reward.
    Used for circuit breaker health which is a global system metric.
    """
    def reward_fn(completions: List[str], **kwargs: Any) -> List[float]:
        timeout = kwargs.get("timeout", DEFAULT_TIMEOUT)
        try:
            reward = evaluator(timeout=timeout, **eval_kwargs)
        except Exception as e:
            logger.warning(f"Global reward evaluation failed: {e}")
            reward = 1.0  # Fallback: assume healthy
        return [reward] * len(completions)

    return reward_fn


# ---- Exported TRL-compatible reward functions ----

test_pass_reward: Callable[[List[str]], List[float]] = _make_batch_reward_fn(
    _evaluate_test_pass, "test_pass"
)

type_check_reward: Callable[[List[str]], List[float]] = _make_batch_reward_fn(
    _evaluate_type_check, "type_check"
)

lint_reward: Callable[[List[str]], List[float]] = _make_batch_reward_fn(
    _evaluate_lint, "lint"
)

coverage_reward: Callable[[List[str]], List[float]] = _make_batch_reward_fn(
    _evaluate_coverage, "coverage"
)

circuit_breaker_reward: Callable[[List[str]], List[float]] = _make_global_reward_fn(
    _evaluate_circuit_breaker
)


# =============================================================================
# COMPOSITE REWARD FUNCTION
# =============================================================================

def create_composite_reward(
    weights: Optional[Dict[str, float]] = None,
) -> Callable[[List[str]], List[float]]:
    """
    Create a single composite reward function that combines all 5 dimensions.

    This is an alternative to passing 5 separate reward_funcs to GRPOTrainer.
    The composite function evaluates all 5 dimensions and returns the weighted
    sum as a single reward signal.

    Args:
        weights: Custom weights dict. Keys: test_pass, type_check, lint,
                 coverage, circuit_breaker. Must sum to 1.0.
                 Defaults to REWARD_WEIGHTS.

    Returns:
        A callable matching TRL's reward_funcs signature.

    Example:
        trainer = GRPOTrainer(
            model=model,
            reward_funcs=[create_composite_reward()],
            args=config,
        )
    """
    w = weights or REWARD_WEIGHTS
    weight_sum = sum(w.values())
    if abs(weight_sum - 1.0) > 1e-6:
        raise ValueError(f"Weights must sum to 1.0 but got {weight_sum}")

    reward_fns = [
        ("test_pass", test_pass_reward),
        ("type_check", type_check_reward),
        ("lint", lint_reward),
        ("coverage", coverage_reward),
        ("circuit_breaker", circuit_breaker_reward),
    ]

    def composite_reward(completions: List[str], **kwargs: Any) -> List[float]:
        """Compute weighted composite reward for a batch of completions."""
        all_rewards: Dict[str, List[float]] = {}

        for name, fn in reward_fns:
            try:
                all_rewards[name] = fn(completions, **kwargs)
            except Exception as e:
                logger.warning(f"Reward function '{name}' failed: {e}")
                all_rewards[name] = [0.0] * len(completions)

        # Compute weighted sum per completion
        composites: List[float] = []
        for i in range(len(completions)):
            composite = 0.0
            for name, _ in reward_fns:
                reward_val = all_rewards[name][i] if i < len(all_rewards[name]) else 0.0
                composite += reward_val * w.get(name, 0.0)
            composites.append(min(1.0, max(0.0, composite)))

        return composites

    return composite_reward


# =============================================================================
# STATISTICS
# =============================================================================

def get_cache_stats() -> Dict[str, Any]:
    """Get current cache statistics."""
    return {
        "hit_rate": _reward_cache.hit_rate,
        "hits": _reward_cache._hits,
        "misses": _reward_cache._misses,
        "size": len(_reward_cache._cache),
        "max_size": _reward_cache.max_size,
    }


def clear_cache() -> None:
    """Clear the reward cache."""
    _reward_cache._cache.clear()
    _reward_cache._hits = 0
    _reward_cache._misses = 0


# =============================================================================
# MAIN (for testing)
# =============================================================================

if __name__ == "__main__":
    # Quick self-test
    logging.basicConfig(level=logging.INFO)
    logger.info("Testing GRPO reward functions...")
    logger.info(f"HoloScript root: {HOLOSCRIPT_ROOT}")

    test_completion = """
import { describe, it, expect } from 'vitest';

describe('example', () => {
    it('should pass', () => {
        expect(1 + 1).toBe(2);
    });
});
"""

    completions = [test_completion]

    logger.info("Testing test_pass_reward...")
    result = test_pass_reward(completions)
    logger.info(f"  test_pass_reward: {result}")

    logger.info("Testing type_check_reward...")
    result = type_check_reward(completions)
    logger.info(f"  type_check_reward: {result}")

    logger.info("Testing lint_reward...")
    result = lint_reward(completions)
    logger.info(f"  lint_reward: {result}")

    logger.info("Testing circuit_breaker_reward...")
    result = circuit_breaker_reward(completions)
    logger.info(f"  circuit_breaker_reward: {result}")

    logger.info("Testing composite_reward...")
    composite = create_composite_reward()
    result = composite(completions)
    logger.info(f"  composite_reward: {result}")

    logger.info(f"Cache stats: {get_cache_stats()}")
    logger.info("All tests complete.")
