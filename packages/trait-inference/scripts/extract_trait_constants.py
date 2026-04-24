#!/usr/bin/env python3
"""Extract trait label space from packages/core/src/traits/constants/*.ts.

Per phase-1-spec §2 model architecture: the constrained decoder needs the
trait label space as a Python data structure. The source of truth is the
TypeScript constant files. This script regex-scrapes them into a single
JSON file consumed by trait_inference.dataset + trait_inference.model.

NOTE on F.014 (no regex .hs/.hsplus parsing): F.014 forbids regex parsing
of HoloScript SOURCE files. This script regex-extracts string ARRAY
literals from TS constant files at BUILD TIME — different operation, not
parsing program semantics. Safe per the F.014 distinguishing rule.

Output: trait_inference/data/trait_label_space.json with shape:
    {
      "version": "1",
      "extracted_at": "2026-04-24T...",
      "source_count": 113,
      "categories": {
        "animals": ["cat", "dog", ...],
        "physics": ["@physics", "@gravity", ...],
        ...
      },
      "all_traits": ["cat", "dog", ..., "@physics", ...],
      "trait_to_category": { "cat": "animals", "@physics": "physics", ... }
    }
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

CONSTANTS_DIR_DEFAULT = (
    Path(__file__).resolve().parent.parent.parent / "core" / "src" / "traits" / "constants"
)
OUTPUT_DEFAULT = (
    Path(__file__).resolve().parent.parent / "trait_inference" / "data" / "trait_label_space.json"
)

# Match: export const FOO_TRAITS = [ '...', '...', ... ]
# Tolerates: single/double quotes, trailing commas, comments, multiline,
# and tagged-string variants ('@trait_name' alongside bare names).
ARRAY_RE = re.compile(
    r"export\s+const\s+([A-Z][A-Z0-9_]*?)(?:_TRAITS|_LIST|_CATEGORIES)?\s*"
    r"(?::\s*[\w\[\]\s]+)?"
    r"\s*=\s*\[\s*(.*?)\s*\]\s*(?:as\s+const)?\s*;",
    re.DOTALL,
)
ITEM_RE = re.compile(r"['\"]([^'\"]+)['\"]")


def extract_one(ts_path: Path) -> dict[str, list[str]]:
    """Extract all string-array exports from one .ts file."""
    text = ts_path.read_text(encoding="utf-8", errors="replace")
    # Strip /* ... */ block comments to keep regex simple.
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    out: dict[str, list[str]] = {}
    for match in ARRAY_RE.finditer(text):
        const_name = match.group(1).lower()
        items = ITEM_RE.findall(match.group(2))
        # De-dup but preserve order.
        seen: set[str] = set()
        deduped = [i for i in items if not (i in seen or seen.add(i))]
        if deduped:
            out[const_name] = deduped
    return out


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--constants-dir", type=Path, default=CONSTANTS_DIR_DEFAULT,
        help="Path to packages/core/src/traits/constants/",
    )
    parser.add_argument(
        "--output", type=Path, default=OUTPUT_DEFAULT,
        help="Output JSON path",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    if not args.constants_dir.is_dir():
        print(f"ERROR: constants dir not found: {args.constants_dir}", file=sys.stderr)
        return 1

    ts_files = sorted(
        p for p in args.constants_dir.glob("*.ts")
        if not p.name.endswith(".d.ts") and not p.name.endswith(".ts.map")
    )

    categories: dict[str, list[str]] = {}
    trait_to_category: dict[str, str] = {}
    skipped: list[str] = []

    for ts_path in ts_files:
        category_name = ts_path.stem
        extracted = extract_one(ts_path)
        if not extracted:
            skipped.append(category_name)
            if args.verbose:
                print(f"  SKIP {category_name}: no exported arrays found")
            continue

        # If the file has a single dominant export, use the file stem as category;
        # if it has multiple, prefix-key by the file stem so we don't collide.
        if len(extracted) == 1:
            (_, traits), = extracted.items()
            categories[category_name] = traits
            for t in traits:
                if t not in trait_to_category:
                    trait_to_category[t] = category_name
        else:
            for export_name, traits in extracted.items():
                key = f"{category_name}.{export_name}"
                categories[key] = traits
                for t in traits:
                    if t not in trait_to_category:
                        trait_to_category[t] = key
        if args.verbose:
            counts = {k: len(v) for k, v in extracted.items()}
            print(f"  OK   {category_name}: {counts}")

    all_traits = sorted({t for traits in categories.values() for t in traits})

    output = {
        "version": "1",
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(ts_files),
        "category_count": len(categories),
        "trait_count": len(all_traits),
        "skipped_categories": skipped,
        "categories": categories,
        "all_traits": all_traits,
        "trait_to_category": trait_to_category,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=False), encoding="utf-8")
    print(f"Wrote {args.output}")
    print(f"  source files: {len(ts_files)}")
    print(f"  categories:   {len(categories)}")
    print(f"  total traits: {len(all_traits)}")
    print(f"  skipped:      {len(skipped)} ({', '.join(skipped[:5])}{'...' if len(skipped) > 5 else ''})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
