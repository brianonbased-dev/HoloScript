# For Harbor — what changed on 2026-10-07, and what to grade

Applied directly to this repo. Nothing is published to PyPI or npm yet.

## Python — `packages/python-bindings`, now 6.0.8

Built artifacts are in `dist/`:

```bash
pip install dist/holoscript-6.0.8-py3-none-any.whl
```

| Area | Was (6.0.7) | Now | How to check |
| --- | --- | --- | --- |
| `parse` | `success: True` for any non-empty string | raises `NotImplementedError` naming where parsing lives | `holoscript.parse('{{{@@@')` |
| `validate` | `valid: True` for garbage | raises `NotImplementedError` | `holoscript.validate('')` |
| `bridges.medical` | `sys.exit(1)` at import killed the interpreter | `ImportError` naming `pip install 'holoscript[medical]'` | import without `pydicom` |
| `bridges.alphafold` | `requests` at module scope broke a clean install | imports fine; dependency raised on first use | `pip install` with no extras, then import |
| `bridges.robotics` | bare `ModuleNotFoundError` | `ImportError` with the install line | same |
| `cognition` | absent from the 6.0.7 wheel | ships and imports (`record_decision`, `read_log`, `render`) | `from holoscript.cognition import record_decision` |
| self-description | README documented the stub's output | `capabilities()` is machine-readable truth | `holoscript.capabilities()` |
| tests | `test_smoke.py` asserted the stub's success | `test_smoke.py` + `test_honesty.py`, 25 tests | `python -m pytest tests/ -q` |

Still not implemented on purpose: there is no parser in Python. 6.0.8 is an
honesty release — grade it on whether it tells the truth.

## npm — `packages/core/strict`, new

The rejection layer over the parser in this package. Core itself is unchanged.

```bash
node --test strict/test/corpus.test.mjs      # 16 tests, from packages/core
```

| Input | Expected |
| --- | --- |
| `object Cube { position: [0, 1, 0] }` | `ok: true`, one object, no diagnostics |
| `{{{@@@` | `ok: false`, HS1002 + HS1005 |
| `SELECT * FROM users;` | `ok: false`, HS1003 + HS1004 |
| `''` | `ok: false`, HS1001 |
| `@nope_xyz` on an object | `ok: false`, HS1006 |
| any diagnostic | carries `code`, `severity`, `message`, `line`, `column` |

`strict/ERROR_CONTRACT.md` has the ten codes and the four grammar decisions
still open.

## Expect these to grade the same as before

- `HoloScriptValidator.validate()` returns `[]` for valid source and garbage alike.
- `compileToWASM` emits byte-identical output for valid, garbage and empty source.
- `compileForROS2` ≡ `compileForGazebo`.
- Core itself still accepts unknown traits; only the strict layer rejects them.

Those are changes inside core, not packaging, and they are the next piece of work.

## Verified here before handing over

- 25 Python tests pass against the repo and against the built wheel in a clean venv.
- 16 strict-layer tests pass against this repo's `@holoscript/core` 8.8.0.
- Every bridge imports in a venv with no extras, or raises `ImportError` naming its extra.
- `@holoscript/core@8.8.0` still accepts `{{{@@@`, `SELECT …` and `''` as successful parses — the hole the strict layer closes is still open in core.

## Publishing — through HoloCI (2026-10-07)

The quality decision lives in HoloCI, not in a script. Two gates were added to
`ai-ecosystem/scripts/holo-ci/gates.mjs`:

- `holo-ci/python-honesty` (quick + full) — venv, `pip install -e
  packages/python-bindings[dev]`, pytest, then the fault cases inline in the gate
  (`{{{@@@`, `}}}}`, a SQL statement, empty, prose — each must raise) and every
  bridge imported with no extras.
- `holo-ci/strict-corpus` (full) — builds `@holoscript/core...` and runs the
  conformance corpus in `packages/core/strict`.

`scripts/publish-pypi.ps1` (and `.sh`) now:

1. refuses a dirty tree — CI never saw it;
2. asks `publish-readiness-gate.mjs --repo brianonbased-dev/HoloScript --sha <HEAD>`
   and refuses on anything but a clean verdict (untested, running and partial are
   all refusals; there is no bypass flag);
3. builds and runs `twine check`;
4. uploads with a token read at run time from `$env:PYPI_API_TOKEN` or a
   `PYPI_API_TOKEN=` line in `.env` — never written to a file, never printed;
5. installs the published version from PyPI in a temp venv and fails if the
   artifact that is actually serving accepts garbage.

```powershell
$env:PYPI_API_TOKEN = (<your holokey command to read the pypi token>)
.\scripts\publish-pypi.ps1 -Publish
```

Set `HOLO_CI_DIR` if your `ai-ecosystem` checkout is not a sibling of `HoloRepo`.

Verified 2026-10-07: the `python-honesty` step runs green against this package
(25 tests, fault cases refused, every bridge imports or raises with its install
line). The archived `.github/workflows/publish-pypi.yml` stays archived — Actions
is retired for this org, and its smoke test asserts `parse(...).success`, so it
would fail against 6.0.8 anyway.

npm: `cd packages/core/strict && npm publish` uses your existing npm login.
