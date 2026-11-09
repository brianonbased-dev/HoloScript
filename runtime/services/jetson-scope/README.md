# jetson-scope — "Our Metal"

One tool, two faces. Four sections: the XPS 17 laptop, the Jetson Orin Nano
(`jetson.local`), the **Cloud fleet** (Vast rentals — shelled through the
CANONICAL `ai-ecosystem/scripts/fleet-status.mjs --json`, whose JSON shape is
stable for machine consumers; run from the checkout so vastai env resolution
works; 60s lazy cache so the paid API never blocks local ticks), and
**HoloMesh** (team layer — production board REST at
`mcp.holoscript.net/api/holomesh/team/<id>/board`, creds parsed from
`~/.ai-ecosystem/.env`, never logged; board shape is a FLAT `tasks[]` with a
`status` field plus top-level `done_count`/`mode`/`objective` — there are no
per-status arrays).

- **Machine face (agents/frontier models on the laptop):**
  `metal --json` — BOTH nodes in one structured snapshot (laptop via
  `laptop-probe.ps1`: CPU/RAM/GPU/battery/disks/holoserve health/nightly
  backup LastTaskResult; Jetson via ssh: tegrastats, disks, services,
  docker, arrivals; TCP-22 probed separately from ssh so box-off vs
  login-broken stay distinct). Single-node: `jetson status --json`.
  Also `jetson ls <path>`, `jetson files`, `jetson top`.
  Both `jetson` and `metal` are on the user PATH via the `bin` folder of the
  live runtime checkout (not this tree).
- **Human face (owner):** the **Metal** icon on the Desktop → local
  dashboard at `http://127.0.0.1:8477`: a Laptop section (gauges, battery,
  C: drive, holoserve + nightly-backup status, busiest processes) and a
  Jetson section (gauges, drives, space list, services, arrivals).
  Plain language throughout; auto-refreshes every 5s. One button writes:
  "hardware changed" (see below).

Design constraints (deliberate):

- `jetson-scope.mjs` imports **node: builtins only** — runs from any tree,
  no node_modules, survives forever (the exec-root lesson).
- Remote access is ssh (BatchMode, ConnectTimeout 6s). It is read-only
  except for one route: `POST /api/hardware-changed` on 8477 writes a
  hardware-change note to the rig over ssh.
- Listeners (two of the four are on the LAN, so keep them LAN-only and
  never port-forward them):

  | Port | Bind | Purpose |
  | ---- | ---- | ------- |
  | 8477 | 127.0.0.1 | laptop dashboard; every route requires a loopback Host (403 otherwise, DNS-rebinding guard), the write route also a loopback or absent Origin |
  | 8478 | `METAL_INGEST_HOST` or 0.0.0.0 | node ingest, join-token gated |
  | 8481 | 127.0.0.1 | phone dashboard over `adb reverse` (USB) |
  | 8482 | 0.0.0.0 | LAN phone view, view-token gated |

- Two token files are created next to the script on first run and are
  git-ignored: the **join token** (8478 ingest) and the **view token**
  (8482 LAN view). The 8477 page carries the join token, so treat it as
  local-only.
- `serve-hub.vbs` (the node path it launches) and the PATH `bin` shims
  still point at the live runtime checkout, not at this tree. Changes here
  take effect only once they land there.
- Miner tracking rides the same join path as any machine: the Jetson
  publisher attaches `~/cgminer-gekko/brain-status.json` as
  `metrics.miner`. The dashboard prefers a fresh publisher snapshot and
  falls back to SSH if that heartbeat is quiet.
- TCP port 22 is probed separately from ssh so "box is off" and "login
  broken" never read as the same failure (per the jetson memory).
- The dashboard server is started on demand by the icon (detached), cached
  4s per refresh; `du` space measurement is on-demand/cached, never on the
  hot path.

## The phone (S23) side — provisioning, so it has a git home

The phone runs three things under Termux: the ssh door (sshd), the brain
(llama-server, "Axiom"), and this directory's `axiom-app.mjs`. Since
2026-09-02 the brain and the app are **runit services** (termux-services),
so the phone restarts either the moment it exits; the app is the keeper for
the case runit cannot see (alive but hung — see the `keeper` block in
`axiom-app.mjs`). The phone's files, verbatim:

`~/.termux/boot/0-axiom.sh` (Termux:Boot runs it after the first unlock):

```sh
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sshd
export SVDIR=/data/data/com.termux/files/usr/var/service
export LOGDIR=/data/data/com.termux/files/usr/var/log
(service-daemon start >/dev/null 2>&1 &)
```

`$PREFIX/var/service/axiom-brain/run` — the ONE place the brain is launched
from. `KMP_AFFINITY=disabled` stops the OpenMP runtime pinning the birth CPU
mask for life (utility map §5o); `--no-mmap` keeps the weights resident;
`sleep 3` softens a crash loop. The `llama-server` arguments are exactly the
former boot-script line (model `~/holoscript/models/qwen3-4b-instruct.gguf`,
loopback only, port 18081, `-c 2048 -ngl 0 --fit on --parallel 1
--cache-ram 0 --metrics --no-mmap`):

```sh
#!/data/data/com.termux/files/usr/bin/sh
sleep 3
cd /data/data/com.termux/files/home/holoscript/holollama
export LLAMA_ARG_THREADS=4 KMP_AFFINITY=disabled
exec /data/data/com.termux/files/home/holoscript/llama.cpp/build-holo/bin/llama-server <the arguments above> 2>&1
```

`$PREFIX/var/service/axiom-app/run`:

```sh
#!/data/data/com.termux/files/usr/bin/sh
sleep 2
cd /data/data/com.termux/files/home/holoscript
exec /data/data/com.termux/files/usr/bin/node /data/data/com.termux/files/home/holoscript/axiom-app.mjs 2>&1
```

Each service has `log/run` → `exec svlogd -tt $LOGDIR/sv/<service>`; logs
live at `$PREFIX/var/log/sv/<service>/current`. Operate them with `sv`
(`export SVDIR=$PREFIX/var/service; sv status|restart|force-restart
axiom-brain axiom-app`). Never launch the brain by hand with setsid any more —
it would fight runsv for the port. Trap: runsv reads a service's `down` file
only when runsv itself starts; after removing it, `sv up` the service.

The laptop reaches the phone over USB only (`adb forward` to the loopback
ports; the ssh key lives in the session workspace, never here). The phone's
endpoints for the Axiom faces are in the git-ignored `axiom-endpoints.json`
beside this README.

## Local config

Site values (Jetson address, miner IPs, adb path, Studio URL, HoloMesh .env path, owner name) come from env vars (`JETSON_ADDR`, `KNOWN_AXES`, `ADB_PATH`, `STUDIO_URL`, `MESH_ENV_PATH`, `OWNER_NAME`, `SOVEREIGN_DEVICE_CONFIG`) or the git-ignored `jetson-scope.local.json`. Copy `jetson-scope.example.json` to start.
