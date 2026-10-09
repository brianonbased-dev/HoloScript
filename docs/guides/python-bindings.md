# Python Bindings Guide

The `holoscript` package on PyPI carries scientific tooling into HoloScript —
DICOM imaging, radio astronomy, ROS 2, molecular docking and Narupa molecular
dynamics — plus the decision surfaces under `holoscript.cognition`. The AlphaFold
bridge ships but is a stub: nothing in it predicts a structure yet.

**It does not parse HoloScript yet.** In 6.0.8, `parse()` and `validate()` raise
`NotImplementedError`. Through 6.0.7 they returned success for any non-empty
string, including text that is not HoloScript at all. Real parsing is planned for
6.1.0, on the same grammar the npm package uses. Until then, parse with
[`@holoscript/core`](https://www.npmjs.com/package/@holoscript/core) and check
the result: core is permissive and can return an empty composition for text that
is not HoloScript.

An earlier version of this guide documented `parse_holo`, `parse_hsplus`,
`explain_trait`, `suggest_traits`, `generate_object` and `generate_scene`. None of
those were ever in the Python package.

## Installation

Python 3.10 or newer. On 3.8 and 3.9, pip keeps installing 6.0.7.

```bash
pip install holoscript                    # bridges only, no heavy dependencies
pip install 'holoscript[medical]'         # DICOM imaging
pip install 'holoscript[alphafold]'       # AlphaFold bridge (a stub: predicts nothing yet)
pip install 'holoscript[astronomy]'       # radio astronomy
pip install 'holoscript[robotics]'        # ROS 2
pip install 'holoscript[scientific]'      # numpy only; docking also needs: pip install vina
pip install 'holoscript[all]'             # every extra above
```

No extra installs AutoDock Vina (`pip install vina`) or Narupa's `nanover-server`.

What happens when a dependency is missing:

- `medical` raises `ImportError` at import, naming the install line.
- `alphafold`, `robotics`, `scientific` and `narupa` import fine, then report the
  missing dependency in the result they return, naming what to install:
  `status: failed` (`narupa` says `status: error`).
- `radio_astronomy` needs no extra package.

None of them ends your process.

## Ask the package what it does

```python
import holoscript

print(holoscript.__version__)
print(holoscript.capabilities())
```

`capabilities()` is the machine-readable answer. Agents and scripts should branch
on it rather than on this page:

- `implemented` — what works: `list_traits`, five bridges (`medical`, `narupa`,
  `radio_astronomy`, `robotics`, `scientific`), the cognition surfaces.
- `limits` — implemented, with a stated gap: `medical` (`dicom_to_mesh` is not
  implemented; `extract_3d_volume` returns dimensions and value range, not
  voxels), `narupa` (needs `nanover-server`, which no extra installs),
  `scientific` (needs `pip install vina`, which the extra does not install), the
  synchrotron formula is a placeholder, and `cognition.render` needs the npm
  `holo-decision` program.
- `not_implemented` — top-level functions that do not exist yet, plus
  `bridges.alphafold` (it ships and imports, but no path returns a structure),
  with the release each is planned for (`None` means unscheduled).

Before a release is uploaded, every `implemented` entry is checked against the
installed wheel (`packages/python-bindings/scripts/preflight-release.py`) — at
least that it imports or exists; `record_decision` and `read_log` are also run
end to end. It also forces the AlphaFold local path with ColabFold "present" and
requires a failure, so `alphafold` cannot be listed as implemented while it is a
stub. Gaps that check cannot see are listed under `limits`.

## API

### `parse(code)` / `validate(code)`

Raise `NotImplementedError` with a message naming the planned release and where
to parse today.

```python
try:
    holoscript.parse(source)
except NotImplementedError as exc:
    print(exc)
```

### `list_traits()`

Returns a static five-name snapshot, not the trait registry. Of the five, only
`@grabbable` is in the core registry. For the real registry, use the npm package
or the MCP server.

## Domain bridges

### Medical — DICOM

```python
from holoscript.bridges.medical import DICOMBridge

bridge = DICOMBridge()
image = bridge.load_dicom("/path/to/scan.dcm")
volume = bridge.extract_3d_volume("/path/to/dicom/")
```

Requires `pydicom` and `numpy` (`pip install 'holoscript[medical]'`).
`extract_3d_volume` returns the volume's dimensions, spacing and value range, not
the voxels. `dicom_to_mesh` is not implemented: it always returns
`success: False`.

### AlphaFold — protein structure

```python
from holoscript.bridges.alphafold import AlphaFoldBridge

bridge = AlphaFoldBridge(api_key="your_key")
result = bridge.predict_structure({
    "sequence": "MKFLILLFNILCLFPVLAADNHGVS",
    "job_name": "demo",
})
```

**A stub.** No path in this bridge returns a structure: the AlphaFold API endpoint
it calls is a placeholder that does not resolve, and the local ColabFold path
(`mode: "local"`) returns "not yet implemented" even with ColabFold installed.
Every call, `predict_multimer()` included, fails closed with `status: failed`;
without an API key it fails before reaching the network. `capabilities()` lists
it under `not_implemented`.

### Astronomy — radio telescope data

```python
from holoscript.bridges.radio_astronomy import calculate_synchrotron

flux = calculate_synchrotron({"magnetic_field_gauss": 1e-4, "frequency_hz": 1.4e9})
```

The synchrotron calculation is a placeholder formula.

### Robotics — ROS 2

```python
from holoscript.bridges.robotics import ROS2Bridge

bridge = ROS2Bridge("ws://localhost:9090")
bridge.connect()
bridge.publish_joint_command("/joint_states", {"joint1": 0.0, "joint2": 0.5, "joint3": 1.0})
```

Requires `roslibpy`.

### Scientific — molecular docking

```python
from holoscript.bridges.scientific import AutoDockBridge

results = AutoDockBridge().run_docking({
    "protein_pdb": "receptor.pdb",
    "ligand_mol": "compound.mol",
    "box_center": [0.0, 0.0, 0.0],  # search box centre, angstroms
    "box_size": [20.0, 20.0, 20.0],  # search box size, angstroms
})
```

Needs AutoDock Vina: `pip install vina`. The `[scientific]` extra installs only
numpy. Without Vina this returns a `status: failed` dict rather than raising.

### Narupa — molecular dynamics servers

```python
from holoscript.bridges.narupa import NarupaBridge

bridge = NarupaBridge()
bridge.start_server({"pdb_path": "protein.pdb"})
```

Needs `nanover-server`, which no extra installs. Without it `start_server` returns
`status: error` naming the install line.

## Cognition

```python
from holoscript.cognition import record_decision, read_log, render
```

Records decisions with their causes to a shared log and renders the log as SVG.
`render` shells out to the npm `holo-decision` program and raises `RuntimeError`
when it is not installed.

## Related links

- [Package README on PyPI](https://pypi.org/project/holoscript/)
- [GitHub repository](https://github.com/brianonbased-dev/HoloScript)
- [MCP Server](./mcp-server) — compilation, rendering and deployment as tools
