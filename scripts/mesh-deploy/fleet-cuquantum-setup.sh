#!/usr/bin/env bash
# fleet-cuquantum-setup.sh -- Install cuQuantum on a vast.ai GPU worker (ecosystem tier).
#
# Complements (does NOT duplicate) scripts/cuquantum-fleet-probe.mjs:
#   - probe.mjs DETECTS readiness + emits a capability receipt.
#   - this script INSTALLS the matched cuQuantum stack and runs a smoke.
#
# Called by the canonical fleet onboarding script (gpu-worker-bootstrap.sh) as the
# default compute-lane install step. Other workloads (ML, solvers, rendering) supply
# their own setup script instead.
#
# Heterogeneous-fleet safe: detects the host CUDA major (12 or 13) from nvidia-smi and
# installs the matching cuda12/cuda13 wheels. Pins a version for reproducibility so the
# SimulationContract receipt can record exactly what ran (F.058). Prints resolved
# versions as KEY=VALUE for the receipt emitter to capture.
#
# Usage (on the worker):
#   CUQUANTUM_PIN=26.3.2 bash fleet-cuquantum-setup.sh
set -uo pipefail
LOG="[cuquantum-fleet]"
PIN="${CUQUANTUM_PIN:-}"   # empty = latest; set for reproducible fleet generation

# --- detect CUDA major from the driver banner ---
CUDA_FULL="$(nvidia-smi 2>/dev/null | sed -n 's/.*CUDA Version: \([0-9.]*\).*/\1/p' | head -1)"
CUDA_MAJOR="${CUDA_FULL%%.*}"
if [ -z "${CUDA_MAJOR:-}" ]; then
  echo "$LOG FATAL: no NVIDIA driver / CUDA detected; this worker cannot host the GPU sim tier."
  exit 2
fi
# CUDA 13 drivers run cuda12 wheels (back-compat); prefer the exact major, fall back to 12.
case "$CUDA_MAJOR" in
  13) SUFFIX="cu13" ;;
  12) SUFFIX="cu12" ;;
  *)  echo "$LOG WARN: unexpected CUDA major $CUDA_MAJOR; defaulting to cu12"; SUFFIX="cu12" ;;
esac
echo "$LOG host CUDA=$CUDA_FULL -> wheel suffix=$SUFFIX  pin=${PIN:-latest}"

PINSPEC=""; [ -n "$PIN" ] && PINSPEC="==$PIN"

python3 -m pip install --upgrade pip wheel >/dev/null 2>&1
# PROVEN RECIPE (verified locally 2026-05-21): qiskit-aer-gpu's published wheel (0.15.x) needs
# qiskit < 2 (qiskit 2.x removed convert_to_target). Pin qiskit 1.4.x or the GPU import fails.
echo "$LOG installing qiskit 1.4 + qiskit-aer-gpu + cuquantum-python-$SUFFIX + cupy-$SUFFIX ..."
python3 -m pip install -q "qiskit==1.4.4" || echo "$LOG WARN qiskit pin failed"
python3 -m pip install -q "qiskit-aer-gpu" || echo "$LOG WARN qiskit-aer-gpu failed"
python3 -m pip install -q "cuquantum-python-${SUFFIX}${PINSPEC}" || echo "$LOG WARN cuquantum-python-${SUFFIX} failed"
python3 -m pip install -q "cupy-${SUFFIX/cu/cuda}x" 2>/dev/null || python3 -m pip install -q "cupy-${SUFFIX}" || echo "$LOG WARN cupy failed"

# CUDA runtime libs. On a full CUDA toolkit image these are already on the system path. If not
# (e.g. a slim image, or CUDA-13 where the nvidia-*-cu13 pip wheels are unbuildable stubs), fetch
# the matching libs from NVIDIA's redist tarballs (sudo-free) and add them to the loader path.
CUDA_LIBS="$HOME/.cuda${CUDA_MAJOR}-libs"; mkdir -p "$CUDA_LIBS"
NVDIRS="$(python3 - <<'PY' 2>/dev/null || true
import glob
import os
import site

roots = []
for getter in (getattr(site, "getsitepackages", None), getattr(site, "getusersitepackages", None)):
    if not getter:
        continue
    try:
        value = getter()
        roots.extend(value if isinstance(value, list) else [value])
    except Exception:
        pass
dirs = {
    path
    for root in roots
    for path in glob.glob(os.path.join(root, "nvidia", "*", "lib"))
}
print(os.pathsep.join(sorted(dirs)))
PY
)"
CHECK_LD="$CUDA_LIBS${NVDIRS:+:$NVDIRS}:${LD_LIBRARY_PATH:-}"
if ! LD_LIBRARY_PATH="$CHECK_LD" python3 -c "from qiskit_aer import AerSimulator" >/dev/null 2>&1; then
  echo "$LOG aer import failed -> fetching CUDA-$CUDA_MAJOR runtime libs from redist ..."
  python3 - "$CUDA_LIBS" "$CUDA_MAJOR" <<'PY' || echo "$LOG WARN redist lib fetch failed"
import json, pathlib, subprocess, sys, urllib.request

libdir,major=sys.argv[1],sys.argv[2]
pathlib.Path(libdir).mkdir(parents=True, exist_ok=True)
base="https://developer.download.nvidia.com/compute/cuda/redist/"
man=None
last=None
for v in (f"{major}.1.0",f"{major}.0.1",f"{major}.0.0"):
    try:
        urllib.request.urlretrieve(base+f"redistrib_{v}.json","/tmp/_r.json")
        man=v
        break
    except Exception as exc:
        last=exc
if not man:
    print("  no manifest", last)
    sys.exit(1)
print(f"  manifest redistrib_{man}.json")
d=json.load(open("/tmp/_r.json"))
copied=0
for c in ("libcublas","libcusolver","libcusparse","libnvjitlink","cuda_nvrtc","cuda_cudart","libcufft","libcurand"):
    rel=d.get(c,{}).get("linux-x86_64",{}).get("relative_path")
    if not rel:
        print("  WARN missing", c)
        continue
    t=pathlib.Path("/tmp")/pathlib.Path(rel).name
    if not t.exists() or t.stat().st_size == 0:
        urllib.request.urlretrieve(base+rel,str(t))
    subprocess.run(["tar","-xf",str(t),"-C","/tmp"],check=True)
    root=pathlib.Path(str(t).replace("-archive.tar.xz","-archive"))
    libs=[p for p in root.rglob("*.so*")]
    for so in libs:
        subprocess.run(["cp","-a",str(so),libdir+"/"],check=True)
    copied += len(libs)
    print(f"  + {c} ({len(libs)} libs)")
if major == "13" and not (pathlib.Path(libdir)/"libcublas.so.13").exists():
    print("  missing required libcublas.so.13 after redist fetch")
    sys.exit(1)
if copied == 0:
    print("  no runtime libraries copied")
    sys.exit(1)
PY
fi
export LD_LIBRARY_PATH="$CUDA_LIBS${NVDIRS:+:$NVDIRS}:${LD_LIBRARY_PATH:-}"
echo "$LOG CUDA runtime library path: $CUDA_LIBS${NVDIRS:+:$NVDIRS}"
# PERSIST for subsequent job processes. The worker supervisor runs each job via `bash -lc`
# (a login shell that sources /etc/profile.d), so without this a separate smoke/job process
# can't find libcublas.so.13 even though the setup process could (verified failure 2026-05-22).
if [ -n "$CUDA_LIBS" ] && [ -d "$CUDA_LIBS" ]; then
  { echo "export LD_LIBRARY_PATH=\"$CUDA_LIBS${NVDIRS:+:$NVDIRS}:\${LD_LIBRARY_PATH:-}\"" \
      > /etc/profile.d/cuquantum-libs.sh; } 2>/dev/null \
    || echo "$LOG WARN: could not write /etc/profile.d/cuquantum-libs.sh (jobs must set LD_LIBRARY_PATH themselves)"
fi
if [ "$CUDA_MAJOR" = "13" ] && [ ! -e "$CUDA_LIBS/libcublas.so.13" ]; then
  echo "$LOG WARN: libcublas.so.13 still absent after setup; matching files:"
  find "$CUDA_LIBS" -maxdepth 1 -name 'libcublas*' -print 2>/dev/null || true
fi

# --- emit resolved versions for the receipt (KEY=VALUE, easy to capture) ---
python3 - <<'PY'
import importlib.metadata as m
def v(p):
    try: return m.version(p)
    except Exception: return "absent"
print(f"RECEIPT cuquantum={v('cuquantum-python-cu13') if v('cuquantum-python-cu13')!='absent' else v('cuquantum-python-cu12')}")
print(f"RECEIPT qiskit_aer={v('qiskit-aer')}")
print(f"RECEIPT qiskit={v('qiskit')}")
PY

# --- smoke: GPU state-vector run proves the worker can advertise the sim lane ---
python3 - <<'PY' || { echo "[cuquantum-fleet] SMOKE FAILED — do not advertise sim lane"; exit 3; }
from qiskit_aer import AerSimulator
devs = AerSimulator().available_devices()
assert "GPU" in devs, f"GPU device absent: {devs}"
from qiskit import QuantumCircuit, transpile
qc = QuantumCircuit(3); qc.h(0); qc.cx(0,1); qc.cx(1,2); qc.measure_all()
sim = AerSimulator(device="GPU")
counts = sim.run(transpile(qc, sim), shots=1024).result().get_counts()
print("[cuquantum-fleet] SMOKE OK — GPU GHZ counts:", counts)
PY
echo "$LOG ready: this worker can advertise the cuQuantum simulation lane."
