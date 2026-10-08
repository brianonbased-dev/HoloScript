# holoscript

Python bridges that carry scientific tooling into
[HoloScript](https://github.com/brianonbased-dev/HoloScript) — DICOM imaging,
protein structure, radio astronomy, ROS 2 and molecular docking — plus the
decision surfaces under `holoscript.cognition`.

**Parsing is not in this package yet.** `parse()` and `validate()` raise
`NotImplementedError` in 6.0.8. Through 6.0.7 they returned success for any
non-empty string, including text that is not HoloScript at all. Real parsing
is planned for 6.1.0, on the same grammar the npm package uses, so Python and
JavaScript cannot disagree about what valid HoloScript is. Until then, parse
with [`@holoscript/core`](https://www.npmjs.com/package/@holoscript/core) and
check the result: core is permissive and can return an empty composition for
text that is not HoloScript.

**Python 3.10 or newer.** 6.0.8 drops 3.8 and 3.9, which are past end of life
and were never tested here. On those versions pip keeps installing 6.0.7.

The README you see on [pypi.org/project/holoscript](https://pypi.org/project/holoscript/)
comes from this file in the published wheel and sdist.

## Install

```bash
pip install holoscript                    # bridges only, no heavy dependencies
pip install 'holoscript[medical]'         # DICOM imaging
pip install 'holoscript[alphafold]'       # protein structure prediction
pip install 'holoscript[astronomy]'       # radio astronomy
pip install 'holoscript[robotics]'        # ROS 2
pip install 'holoscript[scientific]'      # molecular docking (AutoDock)
pip install 'holoscript[all]'             # everything
```

Importing a bridge without its extra raises `ImportError` naming the install
line. It never ends your process.

## What this version implements

```python
import holoscript

print(holoscript.__version__)
print(holoscript.capabilities())
```

`capabilities()` is the machine-readable answer — agents and CI should branch on
it rather than on this README.

| Not here | Where it is | When |
| --- | --- | --- |
| `parse`, `validate` | `@holoscript/core` on npm (permissive) | planned for 6.1.0 |
| `generate`, scene rendering, `share` | not shipped anywhere yet | unscheduled |
| Full trait registry | `@holoscript/core` | with 6.1.0 |

`list_traits()` returns a static five-name snapshot, not the registry. Of those
five only `@grabbable` is in the core registry today; the registry's size changes
with every deploy, so verify it the way `docs/NUMBERS.md` prescribes rather than
trusting a number written here.

## Domain Bridges

### Medical — DICOM Bridge

```python
from holoscript.bridges.medical import DICOMBridge

bridge = DICOMBridge()
image = bridge.load_dicom("/path/to/scan.dcm")
volume = bridge.extract_3d_volume("/path/to/dicom/")
```

Requires: `pydicom`, `numpy` (`pip install 'holoscript[medical]'`)

### AlphaFold — Protein Structure

```python
from holoscript.bridges.alphafold import AlphaFoldBridge

bridge = AlphaFoldBridge(api_key="your_key")
result = bridge.predict_structure({
    "sequence": "MKFLILLFNILCLFPVLAADNHGVS",
    "job_name": "demo",
})
```

The method is `predict_structure()`; `predict_multimer()` handles complexes.
Without an API key the bridge fails closed with a clear error rather than
reaching the network. Requires: `requests`

### Astronomy — Radio Telescope Data

```python
from holoscript.bridges.radio_astronomy import calculate_synchrotron

flux = calculate_synchrotron({
    "magnetic_field_gauss": 1e-4,
    "frequency_hz": 1.4e9
})
```

The synchrotron calculation is a placeholder formula, as its own docstring says.

### Robotics — ROS2

```python
from holoscript.bridges.robotics import ROS2Bridge

bridge = ROS2Bridge("ws://localhost:9090")
bridge.connect()
bridge.publish_joint_command("/joint_states", {"position": [0, 0.5, 1.0]})
```

Requires: `roslibpy`

### Scientific — Molecular Docking

```python
from holoscript.bridges.scientific import AutoDockBridge

bridge = AutoDockBridge()
results = bridge.run_docking({
    "protein_pdb": "receptor.pdb",
    "ligand_mol": "compound.mol"
})
```

Without AutoDock Vina installed this returns a `status: failed` dict rather
than raising.

## Cognition

```python
from holoscript.cognition import record_decision, read_log, render
```

Feeds a shared decision stream that renders through the SVG compiler.

## MCP Server

HoloScript also runs as an MCP server. The Python package provides bridges —
the MCP server provides compilation, rendering, and deployment.

```bash
curl -X POST https://mcp.holoscript.net/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code": "object Cube { position: [0,1,0] }", "target": "r3f"}'
```

## npm Ecosystem

```bash
npx create-holoscript my-app     # scaffold a project
npm install @holoscript/core     # core library, including the parser
```

## Links

- [GitHub](https://github.com/brianonbased-dev/HoloScript)
- [MCP Server](https://mcp.holoscript.net)
- [Store](https://store.holoscript.net)
- [npm](https://www.npmjs.com/org/holoscript)
- [PyPI](https://pypi.org/project/holoscript/)

## License

MIT
