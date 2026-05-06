# A-006 Bug-Hunt Artifacts

A-006 must leave one artifact in this directory on every run, even when it finds
no novel bug. This prevents routine-health from conflating "clean run" with
"routine did not produce output."

Canonical filename:

```text
docs/bugs/YYYY-MM-DD-a006-{bug|false-positive|quiet}.md
```

Use:

- `bug` when A-006 found a novel correctness bug. Link the fix commit when fixed,
  or explain the unfixable blocker.
- `false-positive` when a candidate was investigated and rejected, including
  "already fixed" cases.
- `quiet` when the commit window was scanned and no novel bug was found.

Recommended helper:

```bash
node scripts/a006-clean-exit.mjs --status=quiet --summary="Reviewed last 48h; no novel A-006 bug found."
```

Required fields in every artifact:

- scan window
- status
- candidate id or "none"
- commits reviewed or evidence source
- outcome summary
- follow-up owner or "none"

