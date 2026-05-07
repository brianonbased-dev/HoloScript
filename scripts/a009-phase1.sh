#!/usr/bin/env bash
# A-009 Phase 1: parse all examples in batches of 20 to avoid heap OOM
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BATCH_SIZE=20
PASS=0
FAIL=0
declare -a FAILURES

mapfile -t ALL_FILES < <(find "$ROOT/examples" "$ROOT/docs/examples" "$ROOT/samples" \
  -name "*.hs" -o -name "*.hsplus" -o -name "*.holo" 2>/dev/null | sort)

# Also search packages/*/examples
for pkg_examples in "$ROOT"/packages/*/examples; do
  [ -d "$pkg_examples" ] || continue
  while IFS= read -r f; do ALL_FILES+=("$f"); done < <(
    find "$pkg_examples" -name "*.hs" -o -name "*.hsplus" -o -name "*.holo" 2>/dev/null
  )
done

TOTAL=${#ALL_FILES[@]}
echo "Found $TOTAL example files"

i=0
while [ $i -lt $TOTAL ]; do
  batch=("${ALL_FILES[@]:$i:$BATCH_SIZE}")
  results=$(printf '%s\n' "${batch[@]}" | node --max-old-space-size=512 \
    "$ROOT/scripts/a009-parse-worker.mjs" 2>/dev/null || true)
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    ok=$(node -e "const r=JSON.parse(process.argv[1]);process.stdout.write(String(r.ok))" "$line" 2>/dev/null || echo "false")
    if [ "$ok" = "true" ]; then
      PASS=$((PASS+1))
    else
      FAIL=$((FAIL+1))
      err=$(node -e "const r=JSON.parse(process.argv[1]);process.stdout.write(r.file+' :: '+(r.error||'unknown'))" "$line" 2>/dev/null || echo "$line")
      FAILURES+=("$err")
    fi
  done <<< "$results"
  i=$((i+BATCH_SIZE))
done

echo ""
echo "Parsed $TOTAL examples: $PASS pass, $FAIL fail"

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  for f in "${FAILURES[@]}"; do
    echo "  FAIL  $f"
  done
fi

echo "__PASS=$PASS __FAIL=$FAIL __TOTAL=$TOTAL"
[ "$FAIL" -eq 0 ]
