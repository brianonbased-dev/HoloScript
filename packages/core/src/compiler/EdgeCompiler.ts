/**
 * HoloScript → Edge (ARM64 / Local-LLM) Compiler
 *
 * Emits a self-contained Python deployment bundle for any Ollama-capable edge
 * device: Jetson Orin, Raspberry Pi 5, The Unit, or any Linux ARM64 / x64 node.
 *
 * Trait-driven output:
 *   @LocalInference  → Ollama /api/chat inference loop (always included)
 *   @EdgeNode        → board task claiming + local-first dispatch config
 *   @SystemMonitor   → generic CPU/RAM/disk health poller
 *   @JetsonGPU       → CUDA power-mode config + NVIDIA-specific sections
 *   @TegraMonitor    → tegrastats reader (Jetson-only extension)
 *   @TensorRTInference → TensorRT quantized-model engine loader
 *   ros2_actuation / @ROS2Node → ROS2 bridge node
 *
 * Output: JSON manifest with inline file contents. Extract and write to device
 * with the CLI (`holoscript edge deploy`) or the mcp-server compile_to_edge tool.
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectTrait,
} from '../parser/HoloCompositionTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EdgeCompilerOptions {
  /** Ollama base URL on the target device (default: http://localhost:11434) */
  ollamaUrl?: string;
  /** Primary inference model (default: qwen3:4b) */
  model?: string;
  /** Target platform (default: linux-arm64) */
  platform?: 'linux-arm64' | 'linux-x64' | 'windows-x64';
  /** Remote deploy path on the device (default: /opt/holoscript) */
  remotePath?: string;
  /** systemd service user (default: root) */
  serviceUser?: string;
}

export interface EdgeBundleFile {
  path: string;
  content: string;
  executable?: boolean;
}

export interface EdgeBundle {
  name: string;
  target: 'edge';
  platform: string;
  files: EdgeBundleFile[];
  config: {
    ollamaUrl: string;
    model: string;
    hasLocalInference: boolean;
    hasEdgeNode: boolean;
    hasSystemMonitor: boolean;
    hasJetsonGPU: boolean;
    hasTegraMonitor: boolean;
    hasTensorRT: boolean;
    hasROS2: boolean;
  };
  deployInstructions: string;
}

// ---------------------------------------------------------------------------
// EdgeCompiler
// ---------------------------------------------------------------------------

export class EdgeCompiler extends CompilerBase {
  protected readonly compilerName = 'EdgeCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.EDGE;
  }

  private opts: Required<EdgeCompilerOptions>;

  constructor(options: EdgeCompilerOptions = {}) {
    super();
    this.opts = {
      ollamaUrl: options.ollamaUrl ?? 'http://localhost:11434',
      model: options.model ?? 'qwen3:4b',
      platform: options.platform ?? 'linux-arm64',
      remotePath: options.remotePath ?? '/opt/holoscript',
      serviceUser: options.serviceUser ?? 'root',
    };
  }

  // ── Trait detection ─────────────────────────────────────────────────────

  private collectTraitNames(composition: HoloComposition): Set<string> {
    const names = new Set<string>();

    const addTrait = (t: HoloObjectTrait | string) => {
      const n = typeof t === 'string' ? t : t.name;
      names.add(n.toLowerCase().replace(/@/g, ''));
    };

    // Composition-level traits
    composition.traits?.forEach(addTrait);

    // Object-level traits
    composition.objects?.forEach((obj) => obj.traits?.forEach(addTrait));

    // Template-level traits
    composition.templates?.forEach((tpl) => tpl.properties?.forEach((p) => {
      if ('traits' in p) (p as { traits?: HoloObjectTrait[] }).traits?.forEach(addTrait);
    }));

    return names;
  }

  private detect(names: Set<string>, ...keys: string[]): boolean {
    return keys.some((k) => names.has(k));
  }

  // ── Compile ─────────────────────────────────────────────────────────────

  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    const traits = this.collectTraitNames(composition);
    const name = composition.name ?? 'holoscript-edge-agent';
    const ollamaUrl = this.opts.ollamaUrl;
    const model = this.opts.model;
    const remotePath = this.opts.remotePath;
    const platform = this.opts.platform;
    const serviceUser = this.opts.serviceUser;

    const hasLocalInference = this.detect(traits, 'localinference', 'local_inference', 'local-inference');
    const hasEdgeNode = this.detect(traits, 'edgenode', 'edge_node', 'edge-node', 'sovereign_agent');
    const hasSystemMonitor = this.detect(traits, 'systemmonitor', 'system_monitor', 'system-monitor');
    const hasJetsonGPU = this.detect(traits, 'jetsongpu', 'jetson_gpu', 'jetson-gpu', 'jetson');
    const hasTegraMonitor = this.detect(traits, 'tegramonitor', 'tegra_monitor', 'tegrastats');
    const hasTensorRT = this.detect(traits, 'tensorrtinference', 'tensorrt_inference', 'tensorrt');
    const hasROS2 = this.detect(traits, 'ros2node', 'ros2_actuation', 'ros2-node', 'ros2actuation');

    const files: EdgeBundleFile[] = [
      { path: 'agent.py', content: this.genAgent(name, ollamaUrl, model, hasEdgeNode, hasTensorRT), executable: true },
      { path: 'monitor.py', content: this.genMonitor(name, hasJetsonGPU, hasTegraMonitor), executable: true },
      { path: 'setup.sh', content: this.genSetup(name, model, remotePath, platform, serviceUser, hasJetsonGPU, hasROS2), executable: true },
      { path: 'holoscript_agent.service', content: this.genSystemd(name, ollamaUrl, model, remotePath, serviceUser), executable: false },
      { path: 'manifest.json', content: JSON.stringify({ name, target: 'edge', platform, ollamaUrl, model, generatedBy: 'EdgeCompiler' }, null, 2), executable: false },
    ];

    if (hasROS2) {
      files.push({ path: 'ros2_bridge.py', content: this.genROS2Bridge(name), executable: true });
    }
    if (hasTensorRT) {
      files.push({ path: 'tensorrt_loader.py', content: this.genTensorRTLoader(model), executable: false });
    }

    const bundle: EdgeBundle = {
      name,
      target: 'edge',
      platform,
      files,
      config: {
        ollamaUrl,
        model,
        hasLocalInference,
        hasEdgeNode,
        hasSystemMonitor,
        hasJetsonGPU,
        hasTegraMonitor,
        hasTensorRT,
        hasROS2,
      },
      deployInstructions: this.genDeployInstructions(name, ollamaUrl, remotePath, platform),
    };

    return JSON.stringify(bundle, null, 2);
  }

  // ── File generators ─────────────────────────────────────────────────────

  private genAgent(name: string, ollamaUrl: string, model: string, hasEdgeNode: boolean, hasTensorRT: boolean): string {
    const boardSection = hasEdgeNode
      ? `
BOARD_URL = os.getenv("HOLOSCRIPT_BOARD_URL", "https://mcp-orchestrator-production-45f9.up.railway.app")
AGENT_TOKEN = os.getenv("HOLOMESH_API_KEY", "")

def claim_task() -> dict | None:
    """Claim a board task tagged for this node."""
    try:
        r = requests.get(f"{BOARD_URL}/api/holomesh/team/board", headers={"Authorization": f"Bearer {AGENT_TOKEN}"}, timeout=10)
        r.raise_for_status()
        tasks = r.json().get("tasks", [])
        claimable = [t for t in tasks if t.get("status") == "open" and "edge-node" in t.get("tags", [])]
        if not claimable:
            return None
        task = claimable[0]
        requests.patch(f"{BOARD_URL}/api/holomesh/team/board/{task['id']}/claim", headers={"Authorization": f"Bearer {AGENT_TOKEN}"}, timeout=10)
        return task
    except Exception as e:
        print(f"[board] claim error: {e}")
        return None
`
      : '';

    const tensorrtImport = hasTensorRT ? 'from tensorrt_loader import load_trt_engine\n' : '';

    return `#!/usr/bin/env python3
"""
HoloScript Edge Agent — ${name}
Generated by EdgeCompiler. Target: ${ollamaUrl}
"""
import json, os, sys, time, requests
${tensorrtImport}
OLLAMA_URL = os.getenv("OLLAMA_URL", "${ollamaUrl}")
MODEL = os.getenv("HOLOSCRIPT_MODEL", "${model}")
TICK_INTERVAL = int(os.getenv("TICK_INTERVAL_S", "10"))
${boardSection}
HOLOSCRIPT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file on the edge device",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"},
                    "content": {"type": "string", "description": "File content"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file from the edge device",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "Run a shell command",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                },
                "required": ["command"],
            },
        },
    },
]


def chat(messages: list, tools: list | None = None) -> dict:
    """Call Ollama /api/chat (native endpoint — correct tool_calls parsing)."""
    payload = {"model": MODEL, "messages": messages, "stream": False}
    if tools:
        payload["tools"] = tools
    resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=120)
    resp.raise_for_status()
    return resp.json()


def dispatch_tool(name: str, args: dict) -> str:
    """Execute a tool call and return the result string."""
    import subprocess
    from pathlib import Path

    if name == "write_file":
        path, content = args.get("path", ""), args.get("content", "")
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(content)
        return f"wrote {len(content)} bytes to {path}"

    if name == "read_file":
        try:
            return Path(args["path"]).read_text()
        except FileNotFoundError:
            return f"[error] file not found: {args['path']}"

    if name == "bash":
        result = subprocess.run(args["command"], shell=True, capture_output=True, text=True, timeout=30)
        return (result.stdout + result.stderr).strip() or "(no output)"

    return f"[error] unknown tool: {name}"


def run_task(prompt: str) -> str:
    """Run an agentic task to completion with tool-use loop."""
    messages = [{"role": "user", "content": prompt}]
    for _ in range(10):  # max 10 rounds
        resp = chat(messages, tools=HOLOSCRIPT_TOOLS)
        msg = resp.get("message", {})
        messages.append(msg)

        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return msg.get("content", "")

        for tc in tool_calls:
            fn = tc.get("function", {})
            result = dispatch_tool(fn.get("name", ""), fn.get("arguments", {}))
            messages.append({"role": "tool", "content": result})

    return "[agent] max rounds reached"


def _start_monitor():
    """Start the health monitor HTTP server as a daemon thread."""
    try:
        import sys as _sys, os as _os
        _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
        from monitor import main as _monitor_main
        import threading as _threading
        _threading.Thread(target=_monitor_main, daemon=True).start()
        print(f"[${name}] monitor thread started on :9090")
    except Exception as _e:
        print(f"[${name}] monitor start failed (non-fatal): {_e}")


def main():
    _start_monitor()
    print(f"[${name}] HoloScript edge agent online — {OLLAMA_URL} model={MODEL}")
${hasEdgeNode ? `
    while True:
        task = claim_task()
        if task:
            print(f"[board] claimed task {task['id']}: {task.get('title', '')}")
            result = run_task(task.get("description", task.get("title", "")))
            print(f"[board] done: {result[:200]}")
        else:
            time.sleep(TICK_INTERVAL)
` : `
    prompt = " ".join(sys.argv[1:]) or "Write a valid HoloScript .holo scene to agent-out/scene.holo"
    print(run_task(prompt))
`}

if __name__ == "__main__":
    main()
`;
  }

  private genMonitor(name: string, hasJetsonGPU: boolean, hasTegraMonitor: boolean): string {
    const jetsonSection = (hasJetsonGPU || hasTegraMonitor)
      ? `
def jetson_stats() -> dict:
    """Read NVIDIA Jetson hardware stats via tegrastats snapshot."""
    import subprocess, re
    try:
        raw = subprocess.run(
            ["tegrastats", "--interval", "1", "--stop"],
            capture_output=True, text=True, timeout=5
        ).stdout.strip()
        # Parse RAM: "RAM 1234/8096MB"
        ram_match = re.search(r"RAM (\\d+)/(\\d+)MB", raw)
        # Parse CPU: "CPU [35%@1510,18%@1510,...]"
        cpu_match = re.search(r"CPU \\[([^\\]]+)\\]", raw)
        # Parse power: "POM_5V_IN 3500/3500"
        pow_match = re.search(r"POM_5V_IN (\\d+)/(\\d+)", raw)
        return {
            "ram_used_mb": int(ram_match.group(1)) if ram_match else None,
            "ram_total_mb": int(ram_match.group(2)) if ram_match else None,
            "cpu_cores": cpu_match.group(1) if cpu_match else None,
            "power_mw": int(pow_match.group(1)) if pow_match else None,
            "raw": raw,
        }
    except Exception as e:
        return {"error": str(e)}
`
      : '';

    return `#!/usr/bin/env python3
"""
HoloScript Edge Monitor — ${name}
Polls system health and exposes a /health HTTP endpoint.
"""
import json, os, platform, time, threading
from http.server import HTTPServer, BaseHTTPRequestHandler
${(hasJetsonGPU || hasTegraMonitor) ? 'import subprocess, re' : ''}

MONITOR_PORT = int(os.getenv("MONITOR_PORT", "9090"))
POLL_INTERVAL_S = int(os.getenv("POLL_INTERVAL_S", "5"))

_stats: dict = {}
_lock = threading.Lock()
${jetsonSection}

def generic_stats() -> dict:
    """Read generic Linux system stats."""
    stats: dict = {"platform": platform.machine(), "node": platform.node(), "timestamp": time.time()}
    try:
        with open("/proc/loadavg") as f:
            parts = f.read().split()
            stats["load_1m"], stats["load_5m"], stats["load_15m"] = parts[0], parts[1], parts[2]
    except OSError:
        pass
    try:
        with open("/proc/meminfo") as f:
            lines = {l.split(":")[0]: int(l.split(":")[1].strip().split()[0]) for l in f if ":" in l}
            stats["mem_total_kb"] = lines.get("MemTotal")
            stats["mem_avail_kb"] = lines.get("MemAvailable")
    except OSError:
        pass
    return stats


def poll_loop():
    while True:
        data = generic_stats()
${(hasJetsonGPU || hasTegraMonitor) ? '        data["jetson"] = jetson_stats()' : ''}
        with _lock:
            _stats.update(data)
        time.sleep(POLL_INTERVAL_S)


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        with _lock:
            body = json.dumps(_stats, indent=2).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):  # silence access log
        pass


def main():
    threading.Thread(target=poll_loop, daemon=True).start()
    server = HTTPServer(("0.0.0.0", MONITOR_PORT), HealthHandler)
    print(f"[monitor] listening on :{MONITOR_PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
`;
  }

  private genROS2Bridge(name: string): string {
    return `#!/usr/bin/env python3
"""
ROS2 Bridge — ${name}
Connects HoloScript edge agent to a ROS2 node for robot actuation.
Requires: ros2 (Humble+), rclpy
"""
import json, os, threading, time

BRIDGE_TOPIC_PREFIX = os.getenv("ROS2_TOPIC_PREFIX", "/holoscript")
BRIDGE_NODE_NAME = os.getenv("ROS2_NODE_NAME", "${name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_bridge")

try:
    import rclpy
    from rclpy.node import Node
    from std_msgs.msg import String

    class HoloScriptBridgeNode(Node):
        def __init__(self):
            super().__init__(BRIDGE_NODE_NAME)
            self.pub = self.create_publisher(String, f"{BRIDGE_TOPIC_PREFIX}/commands", 10)
            self.sub = self.create_subscription(
                String, f"{BRIDGE_TOPIC_PREFIX}/feedback", self._on_feedback, 10
            )
            self.get_logger().info(f"HoloScript ROS2 bridge ready on {BRIDGE_TOPIC_PREFIX}")

        def _on_feedback(self, msg: String):
            self.get_logger().info(f"feedback: {msg.data[:120]}")

        def send_command(self, payload: dict):
            m = String()
            m.data = json.dumps(payload)
            self.pub.publish(m)

    def main():
        rclpy.init()
        node = HoloScriptBridgeNode()
        try:
            rclpy.spin(node)
        finally:
            node.destroy_node()
            rclpy.shutdown()

except ImportError:
    def main():
        print("[ros2_bridge] rclpy not found — install ROS2 and source setup.bash")

if __name__ == "__main__":
    main()
`;
  }

  private genTensorRTLoader(model: string): string {
    return `"""
TensorRT Model Loader — HoloScript Edge
Wraps TensorRT engine init for Jetson-specific quantized inference.
Requires: tensorrt, pycuda
"""
import os

TRT_ENGINE_PATH = os.getenv("TRT_ENGINE_PATH", f"/opt/holoscript/engines/${model.replace(/[^a-z0-9]/gi, '_')}.trt")
TRT_PRECISION = os.getenv("TRT_PRECISION", "fp16")  # fp16 | int8 | fp32


def load_trt_engine(engine_path: str = TRT_ENGINE_PATH):
    """Load (or build) a TensorRT engine from the given path."""
    try:
        import tensorrt as trt
        import pycuda.driver as cuda
        import pycuda.autoinit  # noqa: F401

        logger = trt.Logger(trt.Logger.WARNING)
        runtime = trt.Runtime(logger)

        if not os.path.exists(engine_path):
            raise FileNotFoundError(
                f"TRT engine not found: {engine_path}\\n"
                "Build it with: trtexec --onnx=model.onnx --saveEngine=engine.trt --fp16"
            )

        with open(engine_path, "rb") as f:
            engine = runtime.deserialize_cuda_engine(f.read())

        print(f"[tensorrt] engine loaded: {engine_path} ({TRT_PRECISION})")
        return engine

    except ImportError:
        raise RuntimeError(
            "TensorRT not available. Install JetPack SDK or TensorRT manually.\\n"
            "On Jetson: sudo apt install python3-libnvinfer-dev"
        )
`;
  }

  private genSetup(
    name: string,
    model: string,
    remotePath: string,
    platform: string,
    serviceUser: string,
    hasJetsonGPU: boolean,
    hasROS2: boolean,
  ): string {
    const jetsonSection = hasJetsonGPU
      ? `
# ── Jetson-specific: set MAXN power mode ──────────────────────────────────
if command -v nvpmodel &>/dev/null; then
    echo "[setup] setting MAXN power mode..."
    sudo nvpmodel -m 0 || true
fi
if command -v jetson_clocks &>/dev/null; then
    sudo jetson_clocks || true
fi
`
      : '';

    const ros2Section = hasROS2
      ? `
# ── ROS2 bridge dependencies ──────────────────────────────────────────────
if ! command -v ros2 &>/dev/null; then
    echo "[setup] WARNING: ros2 not found — install ROS2 Humble and source setup.bash"
else
    echo "[setup] ROS2 found: $(ros2 --version)"
fi
`
      : '';

    return `#!/usr/bin/env bash
# HoloScript Edge Setup — ${name}
# Pulls Ollama model, copies files to ${remotePath}, installs systemd service.
# Run with: bash setup.sh
set -e

REMOTE_PATH="${remotePath}"
SERVICE_USER="${serviceUser}"
MODEL="${model}"

echo "[setup] HoloScript Edge Agent — ${name}"
echo "[setup] Platform: ${platform}"

# ── Verify Ollama ─────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
    echo "[setup] Ollama not found. Install: curl -fsSL https://ollama.com/install.sh | sh"
    exit 1
fi

# ── Pull model ────────────────────────────────────────────────────────────
echo "[setup] pulling $MODEL..."
ollama pull "$MODEL"
${jetsonSection}${ros2Section}
# ── Install agent files ───────────────────────────────────────────────────
echo "[setup] copying files to $REMOTE_PATH..."
sudo mkdir -p "$REMOTE_PATH"
sudo cp agent.py monitor.py ${hasROS2 ? 'ros2_bridge.py ' : ''}${hasJetsonGPU ? 'tensorrt_loader.py ' : ''}manifest.json "$REMOTE_PATH/"
sudo chmod +x "$REMOTE_PATH/agent.py" "$REMOTE_PATH/monitor.py"

# ── Create service user (idempotent) ─────────────────────────────────────
sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER" 2>/dev/null || true

# ── Install systemd service ───────────────────────────────────────────────
echo "[setup] installing systemd service..."
sudo cp holoscript_agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable holoscript_agent.service
sudo systemctl start holoscript_agent.service

echo "[setup] done."
echo "[setup] Status: systemctl status holoscript_agent"
echo "[setup] Logs:   journalctl -u holoscript_agent -f"
`;
  }

  private genSystemd(
    name: string,
    ollamaUrl: string,
    model: string,
    remotePath: string,
    serviceUser: string,
  ): string {
    const safeName = name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    return `[Unit]
Description=HoloScript Edge Agent — ${name}
Documentation=https://holoscript.net/docs/edge
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User=${serviceUser}
WorkingDirectory=${remotePath}
Environment=OLLAMA_URL=${ollamaUrl}
Environment=HOLOSCRIPT_MODEL=${model}
Environment=TICK_INTERVAL_S=10
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 ${remotePath}/agent.py
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${safeName}

[Install]
WantedBy=multi-user.target
`;
  }

  private genDeployInstructions(name: string, ollamaUrl: string, remotePath: string, platform: string): string {
    return [
      `# HoloScript Edge Deploy — ${name}`,
      `# Platform: ${platform} | Ollama: ${ollamaUrl}`,
      ``,
      `# 1. Copy bundle to device (replace USER@HOST):`,
      `#    scp -r ./edge-bundle/ USER@HOST:~/holoscript-deploy/`,
      ``,
      `# 2. SSH to device and run setup:`,
      `#    ssh USER@HOST`,
      `#    cd ~/holoscript-deploy && bash setup.sh`,
      ``,
      `# 3. Verify:`,
      `#    systemctl status holoscript_agent`,
      `#    curl http://localhost:9090/  # monitor health`,
      ``,
      `# 4. For Jetson (holojetson.local):`,
      `#    HOLOSCRIPT_AGENT_PROVIDER=local-llm \\`,
      `#    HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL=${ollamaUrl} \\`,
      `#    node packages/holoscript-agent/dist/index.js tick`,
      ``,
      `# Files installed to: ${remotePath}`,
    ].join('\n');
  }
}
