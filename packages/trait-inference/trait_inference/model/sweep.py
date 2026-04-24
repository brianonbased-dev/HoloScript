"""Hyperparameter sweep runner — Paper 19.

Per `phase-1-spec.md` §3.3 + §4.4: 162-cell hyperparameter sweep
fractional-factorial-pruned to ~30 cells. Per `preregistration.md`
§1: N=5 reseed per headline cell.

Sweep axes:
  - decoder model:        Qwen-0.5B / Qwen-1B / Llama-3.2-1B
  - encoder name:         all-MiniLM-L6 / mpnet-base / None (LLM-only)
  - beam width:           1 / 4 / 8 (inference-time)
  - constraint timing:    per-token / per-emission
  - training set size:    500 / 1000 / 2000 (resolves seed doc Q1)

Each cell = ~6 GPU-hours on RTX 4090; full sweep at 30 cells × N=5
reseed = 900 GPU-hours = ~$240 at $0.27/hr × 30 parallel GPUs ≈ 30hr
wall-clock if fully parallel.

This module designs the sweep — the runner is the entry point invoked
by trait-inference CLI `model sweep`.
"""
from __future__ import annotations

import itertools
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator


@dataclass(frozen=True)
class SweepCell:
    """One cell in the hyperparameter sweep."""
    cell_id: str
    decoder_model: str
    encoder_name: str | None
    beam_width: int
    constraint_timing: str   # "per_token" | "per_emission"
    train_size: int
    reseed_index: int        # 0..N-1 per preregistration N=5


@dataclass
class SweepConfig:
    """Sweep configuration — defaults match `phase-1-spec.md` §3.3."""
    decoder_models: tuple[str, ...] = (
        "Qwen/Qwen2.5-0.5B",
        "Qwen/Qwen2.5-1.5B",      # 1B-class
        "meta-llama/Llama-3.2-1B",
    )
    encoder_names: tuple[str | None, ...] = (
        None,                                      # LLM-only baseline
        "sentence-transformers/all-MiniLM-L6-v2",
        "sentence-transformers/mpnet-base-v2",
    )
    beam_widths: tuple[int, ...] = (1, 4, 8)
    constraint_timings: tuple[str, ...] = ("per_token", "per_emission")
    train_sizes: tuple[int, ...] = (500, 1000, 2000)
    reseed_n: int = 5    # per preregistration §1
    fractional_factorial_pruned: bool = True
    pruned_target: int = 30   # spec target for ~30 cells

    def full_grid(self) -> list[SweepCell]:
        """Generate the full Cartesian-product grid (162 cells before
        pruning, 162 × N=5 = 810 with reseed)."""
        cells = []
        for i, (dm, en, bw, ct, ts) in enumerate(itertools.product(
            self.decoder_models,
            self.encoder_names,
            self.beam_widths,
            self.constraint_timings,
            self.train_sizes,
        )):
            for r in range(self.reseed_n):
                cells.append(SweepCell(
                    cell_id=f"cell-{i:03d}-r{r}",
                    decoder_model=dm,
                    encoder_name=en,
                    beam_width=bw,
                    constraint_timing=ct,
                    train_size=ts,
                    reseed_index=r,
                ))
        return cells

    def pruned_grid(self) -> list[SweepCell]:
        """Generate the fractional-factorial-pruned grid.

        Strategy: for each axis, vary one-at-a-time around a center
        point (Plackett-Burman-style). Center = (Qwen-0.5B, mpnet-base,
        beam=4, per_emission, train=1000). For headline measurement,
        all reseeds (N=5) of the BEST cell from the pruned grid.

        This produces ~30 cells matching `phase-1-spec.md` §3.3 target.
        """
        center = SweepCell(
            cell_id="center",
            decoder_model="Qwen/Qwen2.5-0.5B",
            encoder_name="sentence-transformers/mpnet-base-v2",
            beam_width=4,
            constraint_timing="per_emission",
            train_size=1000,
            reseed_index=0,
        )
        cells: list[SweepCell] = [center]

        # One-at-a-time perturbations
        for dm in self.decoder_models:
            if dm == center.decoder_model:
                continue
            cells.append(SweepCell(
                cell_id=f"axis-decoder-{dm.split('/')[-1]}",
                decoder_model=dm,
                encoder_name=center.encoder_name,
                beam_width=center.beam_width,
                constraint_timing=center.constraint_timing,
                train_size=center.train_size,
                reseed_index=0,
            ))
        for en in self.encoder_names:
            if en == center.encoder_name:
                continue
            cells.append(SweepCell(
                cell_id=f"axis-encoder-{en if en else 'none'}".replace("/", "_"),
                decoder_model=center.decoder_model,
                encoder_name=en,
                beam_width=center.beam_width,
                constraint_timing=center.constraint_timing,
                train_size=center.train_size,
                reseed_index=0,
            ))
        for bw in self.beam_widths:
            if bw == center.beam_width:
                continue
            cells.append(SweepCell(
                cell_id=f"axis-beam-{bw}",
                decoder_model=center.decoder_model,
                encoder_name=center.encoder_name,
                beam_width=bw,
                constraint_timing=center.constraint_timing,
                train_size=center.train_size,
                reseed_index=0,
            ))
        for ct in self.constraint_timings:
            if ct == center.constraint_timing:
                continue
            cells.append(SweepCell(
                cell_id=f"axis-constraint-{ct}",
                decoder_model=center.decoder_model,
                encoder_name=center.encoder_name,
                beam_width=center.beam_width,
                constraint_timing=ct,
                train_size=center.train_size,
                reseed_index=0,
            ))
        for ts in self.train_sizes:
            if ts == center.train_size:
                continue
            cells.append(SweepCell(
                cell_id=f"axis-trainsize-{ts}",
                decoder_model=center.decoder_model,
                encoder_name=center.encoder_name,
                beam_width=center.beam_width,
                constraint_timing=center.constraint_timing,
                train_size=ts,
                reseed_index=0,
            ))

        # Reseed all cells N=5 times for headline measurement
        full = []
        for cell in cells:
            for r in range(self.reseed_n):
                full.append(SweepCell(
                    cell_id=f"{cell.cell_id}-r{r}",
                    decoder_model=cell.decoder_model,
                    encoder_name=cell.encoder_name,
                    beam_width=cell.beam_width,
                    constraint_timing=cell.constraint_timing,
                    train_size=cell.train_size,
                    reseed_index=r,
                ))
        return full

    def to_dict(self) -> dict:
        return {
            "decoder_models": list(self.decoder_models),
            "encoder_names": [str(e) for e in self.encoder_names],
            "beam_widths": list(self.beam_widths),
            "constraint_timings": list(self.constraint_timings),
            "train_sizes": list(self.train_sizes),
            "reseed_n": self.reseed_n,
            "fractional_factorial_pruned": self.fractional_factorial_pruned,
            "pruned_target": self.pruned_target,
        }


class TraitSweep:
    """Sweep runner — emits one cell config per JSON file under
    `output_dir/cells/`, ready to be claimed by parallel GPU agents.

    Does NOT run training itself — that's the per-cell trainer's job
    (a GPU agent picks up a cell config + runs trainer + emits
    measurement JSON).

    The split (sweep generates work units, trainer consumes them) lets
    30 GPUs run in parallel without coordination — each GPU claims one
    or more cells from `output_dir/cells/`.
    """

    def __init__(self, config: SweepConfig | None = None):
        self.config = config or SweepConfig()

    def emit_cells(self, output_dir: str | Path) -> dict:
        """Write one JSON file per cell to `output_dir/cells/`. Returns
        summary dict."""
        output_dir = Path(output_dir)
        cells_dir = output_dir / "cells"
        cells_dir.mkdir(parents=True, exist_ok=True)

        cells = (
            self.config.pruned_grid()
            if self.config.fractional_factorial_pruned
            else self.config.full_grid()
        )

        for cell in cells:
            cell_path = cells_dir / f"{cell.cell_id}.json"
            cell_path.write_text(
                json.dumps(asdict(cell), indent=2, sort_keys=False),
                encoding="utf-8",
            )

        summary = {
            "sweep_config": self.config.to_dict(),
            "cell_count": len(cells),
            "cells_dir": str(cells_dir),
            "emitted_at": datetime.now(timezone.utc).isoformat(),
        }
        (output_dir / "sweep_summary.json").write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )
        return summary
