# Deprecated Scripts

These scripts have been consolidated into a single unified tool.

## Migration Guide

Use `generate_synthetic_data_unified.py` instead:

| Old Script                      | New Command                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `generate_synthetic_data.py`    | `python generate_synthetic_data_unified.py --mode standard --validate --eager-attn` |
| `generate_synthetic_data_v2.py` | `python generate_synthetic_data_unified.py --mode standard --no-cache`              |
| `generate_synthetic_data_v3.py` | `python generate_synthetic_data_unified.py --mode standard`                         |
| `generate_synthetic_data_v4.py` | `python generate_synthetic_data_unified.py --mode one-shot`                         |

## Why Consolidated?

1. **Reduced Confusion** - 4 nearly identical scripts with subtle differences
2. **Easier Maintenance** - Single source of truth
3. **Better CLI** - Parameterized options instead of editing code
4. **OOM Prevention** - `--no-cache` flag for memory-constrained systems

## Archived On

2026-02-07
