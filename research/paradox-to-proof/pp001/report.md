# PP-001 Living Artifact pilot

**Date:** 2026-07-17 (America/Phoenix)

**Card:** PP-001 - Living Artifact

**Scientific verdict:** `partial_support`

**Receipt:** `receipt.json`, SHA-256
`ac7808b394d5d5b4b3c28fbc0915031f48a2be2d48ff08e4e1fa5d14eacfa49c`

## Outcome

A real implementation-state change altered a canonical Paper 4 measurement
while the unchanged Paper 1 verifier probe remained semantically stable. The
effect was differential rather than universal:

| Canonical outcome | State A | State B | B/A | Preregistered result |
|---|---:|---:|---:|---|
| Paper 4 VM creation median | 0.69 ms | 0.65 ms | 0.9420 | control envelope pass |
| Paper 4 simple-expression median | 0.61 ms | 0.13 ms | 0.2131 | effect envelope pass |
| Paper 4 varying-code JIT median | 2.78 ms | 2.10 ms | 0.7554 | effect envelope miss (`max=0.75`) |
| Paper 1 chain verification | 2.9215 us/entry | 3.0506 us/entry | observational only | semantic pass |
| Paper 1 replay wall time | 623.37 ms | 670.00 ms | observational only | semantic pass |

All eight registered Vitest processes exited zero. The simple-expression path
was about 4.69 times faster in B, and all three B replicates were faster than
all three A replicates. The varying-code JIT path was about 1.32 times faster,
but its ratio missed the preregistered upper bound by 0.0054. Per the sealed
decision rule, this is `partial_support`, not a post-hoc full pass.

## Experimental object

The causal cut uses adjacent commits with identical probe sources, package
manifests, and dependency lock:

| Binding | State A - pre-change | State B - post-change |
|---|---|---|
| Commit | `c83c2d3c8857c88357bee226df826114ab87432e` | `d225d6572e455d38d28d7482a315b4390870fb1b` |
| Git tree OID | `cb55bebbfc99bedca1c5af5a92a303c3378edf5d` | `a681f98f80bd572dd8cac8ff21cc879a3ec2f198` |
| Probe/test manifest SHA-256 | `90b158c463924ebc48c55bc54e3ad3a3667d1d64885a4d9aefdb42c8c035a26f` | same |
| Dependency manifest SHA-256 | `0403f4b222137e6ed83099b9566b730e7025d59c2c0c964022460ac61fd5289d` | same |
| Implementation manifest SHA-256 | `ec57a8848374aeaabee3285171f36af7f39f24dd3668b634e905a03293c5d3c2` | `e7dba6e89793fb26aebbcbe5bd0e36943c8920547a41fc29df3d4f607653c860` |
| `PluginSandboxRunner.ts` SHA-256 | `21e0bb626f2361dadd73a6a6045a43b60c012c7d8e43a35a82718b05373fa27e` | `cb557f251eaa2088f26086bba3aac2ebf961fb63a498eabfd7ea356b6e4d36b4` |
| `CAELTrace.ts` verifier SHA-256 | `e0e021c9a0cbb53d8c567e70f7970b8d6909b4241cf1efec66ff72aebadb298f` | same |
| Tracked patch before/after | clean / clean | clean / clean |

State B adds a cached `node:vm` module handle, one reusable VM context per
runner, and a bounded compiled-script cache. The Paper 4 harness is identical
between states. The Paper 1 harness and its declared recorder/replayer/verifier
closure are also identical, making Paper 1 an unchanged semantic control.
Other files changed in the adjacent commit, but none belongs to the declared
dependency closure of these selected probes; the complete changed-path list is
preserved in the receipt.

## Runtime binding

Both detached worktrees used the same host and frozen dependency graph:

- Node `v24.15.0`; executable SHA-256
  `3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5`.
- pnpm `8.12.0`; Vitest `4.1.0`.
- Windows x64 on an Intel Core i7-11800H.
- `PAPER_BENCH_N=300` for each Paper 4 process.
- Paper 4 order: `A1, B1, B2, A2, A3, B3`.
- Paper 1 order: `A1, B1`; one 99,997-entry trace and ten verification
  samples per state.
- No IBM or other quantum hardware was used.

The receipt binds every Git blob in the declared test, implementation, and
dependency manifests; the runtime executable; raw stdout/stderr; parsed
metrics; commands; environment; and clean-worktree state. The experiment
driver is bound at SHA-256
`06d4bf24805a5a800558ae8d3a4b5313c0394576dedfd7960a6773427c773fe3`.

## Preregistration and protocol incident

The base preregistration was written before execution and is bound at SHA-256
`778b2292f6291ce735a65ce4d4aa879e61e6ecc9b1f5e962c7a105ace507d451`.
Its outcome envelope was not changed.

Vitest initially intercepted console output from successful tests. One driver
attempt and one state-A diagnostic therefore produced no visible metric values
and are excluded. Before any metric value was observed, amendment
`PP-001-A001` added only `--disableConsoleIntercept --no-color`, restarted the
registered order, and recorded both exclusions. The amendment is bound at
SHA-256
`4002f24d3fc2e40355fbf6a5e5d2d009efb505371a9ea1f81cbea8eb57878db1`.
The selected code, tests, assertions, sample count, order, states, dependencies,
and effect envelope remained unchanged.

## Interpretation

This pilot rejects silent transfer of Paper 4 performance evidence across
these two implementation states. A receipt from A cannot honestly be cited as
the measured overhead of B, even though the test source and dependency lock are
unchanged. The code state is therefore an experimental variable, not incidental
metadata.

The pilot does **not** show that every metric changes, that code evolution is
incompatible with reproducibility, or that the Paper 4 sandbox provides a hard
hostile-code boundary. The neutral VM-creation control and stable Paper 1
semantic outcome show why evidence should be attached at the outcome level,
not invalidated indiscriminately whenever a repository changes.

PP-001 should remain program-level `verdict=unresolved` until another deliberate
delta and host reproduce the method. This local result is enough to advance the
card from an untested seed to a falsifiable, receipt-backed pilot; it is not
enough for a paper-wide or cross-vendor claim.

## Reproduction and verification

From the repository root:

```powershell
node research/paradox-to-proof/pp001/pp001_living_artifact.mjs
node research/paradox-to-proof/pp001/pp001_living_artifact.mjs --verify
```

The first command refuses to overwrite an existing receipt unless the operator
explicitly supplies `--overwrite`. The second command is read-only and verifies
the receipt sidecar, preregistration and amendment hashes, commit adjacency,
Git-blob bindings, clean state claims, runtime identity, raw-output hashes,
metric reparsing, aggregate calculations, commands, environments, and the
preregistered adjudication.

## Source reconciliation

This pilot implements the discriminating probe requested by PP-001 in the
paper-program Paradox-to-Proof register and follows the code-state tuple from
the 2026-07-17 Paper 1 / Paper 4 sandbox-integrity audit. It deliberately keeps
the audit's honesty boundary: Paper 1 is a hash-chain verifier/replay probe;
Paper 4 is a `PluginSandboxRunner` overhead probe; neither is relabeled as a
full MCP, composed security architecture, or compiler-level lexical-firewall
experiment.
