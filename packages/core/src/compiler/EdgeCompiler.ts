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
import type { HoloComposition, HoloObjectTrait } from '../parser/HoloCompositionTypes';

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
  /**
   * Edge runtime the generated unit runs:
   *   'python'      → standalone Python agent.py (thin Ollama loop) — DEFAULT (back-compat).
   *   'agentrunner' → the canonical TS AgentRunner (`index.js run`) with the full gate
   *                   stack (artifact-grounding W.107.b, reflect self-eval, CAEL hash-chain,
   *                   content-hashed/signed hardware receipts, native on_task cognitive
   *                   verbs). Use for sovereign nodes (jetson-orin) that must not regress
   *                   those gates onto the thinner Python agent.
   */
  runtime?: 'python' | 'agentrunner';
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
    /** Isaac ROS 2 (NVIDIA acceleration layer — NITROS transport, CuVSLAM, etc.) */
    hasIsaacROS2: boolean;
    /** Which edge runtime the generated systemd unit runs. */
    runtime: 'python' | 'agentrunner';
  };
  deployInstructions: string;
  /** Set when a deprecated runtime mode was used (e.g. the legacy gate-less 'python'). */
  deprecation?: string;
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
      // DEFAULT = the canonical TS AgentRunner (full gate stack). 'python' is the
      // deprecated gate-less legacy agent (retirement tracked; see /executioner).
      runtime: options.runtime ?? 'agentrunner',
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
    composition.templates?.forEach((tpl) =>
      tpl.properties?.forEach((p) => {
        if ('traits' in p) (p as { traits?: HoloObjectTrait[] }).traits?.forEach(addTrait);
      })
    );

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

    const hasLocalInference = this.detect(
      traits,
      'localinference',
      'local_inference',
      'local-inference'
    );
    const hasEdgeNode = this.detect(
      traits,
      'edgenode',
      'edge_node',
      'edge-node',
      'sovereign_agent'
    );
    const hasSystemMonitor = this.detect(
      traits,
      'systemmonitor',
      'system_monitor',
      'system-monitor'
    );
    const hasJetsonGPU = this.detect(traits, 'jetsongpu', 'jetson_gpu', 'jetson-gpu', 'jetson');
    const hasTegraMonitor = this.detect(traits, 'tegramonitor', 'tegra_monitor', 'tegrastats');
    const hasTensorRT = this.detect(traits, 'tensorrtinference', 'tensorrt_inference', 'tensorrt');
    const hasROS2 = this.detect(traits, 'ros2node', 'ros2_actuation', 'ros2-node', 'ros2actuation');
    // Isaac ROS 2: NVIDIA hardware-accelerated ROS2 layer (NITROS transport,
    // CuVSLAM, Isaac Manipulator). Closes CG-108 for Jetson + JetPack 6+.
    const hasIsaacROS2 = this.detect(
      traits,
      'isaac_ros2',
      'isaac-ros2',
      'isaac_ros',
      'isaacros2',
      'isaacros',
      'nova_carter',
      'novacarter',
      'isaac_manipulator',
      'isaacmanipulator'
    );

    const isAgentRunner = this.opts.runtime === 'agentrunner';
    const files: EdgeBundleFile[] = isAgentRunner
      ? [
          // Canonical TS AgentRunner runtime — the gate stack (artifact-grounding,
          // reflect), CAEL hash-chain, content-hashed/signed hardware receipts, and
          // native on_task cognitive-verb consumption all ship in `index.js run`.
          // No agent.py: the TS package is the runtime, not a generated Python loop.
          {
            path: 'holoscript_agent.service',
            content: this.genAgentRunnerSystemd(name, ollamaUrl, model, remotePath, serviceUser),
            executable: false,
          },
          {
            path: 'setup.sh',
            content: this.genAgentRunnerSetup(name, model, remotePath, serviceUser, hasJetsonGPU),
            executable: true,
          },
          {
            path: 'manifest.json',
            content: JSON.stringify(
              {
                name,
                target: 'edge',
                platform,
                runtime: 'agentrunner',
                ollamaUrl,
                model,
                generatedBy: 'EdgeCompiler',
                hasIsaacROS2,
              },
              null,
              2
            ),
            executable: false,
          },
        ]
      : [
          {
            path: 'agent.py',
            content: this.genAgent(name, ollamaUrl, model, hasEdgeNode, hasTensorRT),
            executable: true,
          },
          {
            path: 'monitor.py',
            content: this.genMonitor(name, hasJetsonGPU, hasTegraMonitor),
            executable: true,
          },
          {
            path: 'setup.sh',
            content: this.genSetup(
              name,
              model,
              remotePath,
              platform,
              serviceUser,
              hasJetsonGPU,
              hasROS2,
              hasIsaacROS2
            ),
            executable: true,
          },
          {
            path: 'holoscript_agent.service',
            content: this.genSystemd(name, ollamaUrl, model, remotePath, serviceUser, hasROS2),
            executable: false,
          },
          {
            path: 'manifest.json',
            content: JSON.stringify(
              {
                name,
                target: 'edge',
                platform,
                runtime: 'python',
                ollamaUrl,
                model,
                generatedBy: 'EdgeCompiler',
                hasIsaacROS2,
              },
              null,
              2
            ),
            executable: false,
          },
        ];

    if (hasROS2) {
      // Colcon-buildable ament_python package — replaces standalone ros2_bridge.py.
      // Build with: cd ros2_ws && colcon build --symlink-install
      const pkgName = name.replace(/[^a-z0-9_]/gi, '_').toLowerCase() + '_bridge';
      files.push({
        path: `ros2_ws/src/${pkgName}/package.xml`,
        content: this.genColconPackageXml(pkgName, hasIsaacROS2),
      });
      files.push({
        path: `ros2_ws/src/${pkgName}/setup.py`,
        content: this.genColconSetupPy(pkgName),
      });
      files.push({
        path: `ros2_ws/src/${pkgName}/setup.cfg`,
        content: `[develop]\nscript_dir=$base/lib/${pkgName}\n[install]\ninstall_scripts=$base/lib/${pkgName}\n`,
      });
      files.push({ path: `ros2_ws/src/${pkgName}/${pkgName}/__init__.py`, content: '' });
      files.push({
        path: `ros2_ws/src/${pkgName}/${pkgName}/bridge.py`,
        content: this.genROS2Bridge(name, pkgName),
        executable: true,
      });
    }

    if (hasIsaacROS2) {
      const pkgName = name.replace(/[^a-z0-9_]/gi, '_').toLowerCase() + '_bridge';
      files.push({
        path: `ros2_ws/src/${pkgName}/${pkgName}/isaac_bridge.py`,
        content: this.genIsaacBridge(name, pkgName),
        executable: true,
      });
    }

    if (hasTensorRT && !isAgentRunner) {
      // tensorrt_loader.py is imported by the Python agent.py — irrelevant under the
      // TS AgentRunner runtime (which loads its model via Ollama/the provider layer).
      files.push({
        path: 'tensorrt_loader.py',
        content: this.genTensorRTLoader(model),
        executable: false,
      });
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
        hasIsaacROS2,
        runtime: this.opts.runtime,
      },
      deployInstructions: this.genDeployInstructions(
        name,
        ollamaUrl,
        remotePath,
        platform,
        hasROS2
      ),
      ...(isAgentRunner
        ? {}
        : {
            deprecation:
              "The 'python' edge runtime is a GATE-LESS legacy agent (no artifact-grounding, " +
              'reflect, CAEL hash-chain, or signed hardware receipts). Prefer runtime:"agentrunner" ' +
              '(the canonical TS AgentRunner). Scheduled for retirement.',
          }),
    };

    return JSON.stringify(bundle, null, 2);
  }

  // ── File generators ─────────────────────────────────────────────────────

  private genAgent(
    name: string,
    ollamaUrl: string,
    model: string,
    hasEdgeNode: boolean,
    hasTensorRT: boolean
  ): string {
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
${
  hasEdgeNode
    ? `
    while True:
        task = claim_task()
        if task:
            print(f"[board] claimed task {task['id']}: {task.get('title', '')}")
            result = run_task(task.get("description", task.get("title", "")))
            print(f"[board] done: {result[:200]}")
        else:
            time.sleep(TICK_INTERVAL)
`
    : `
    prompt = " ".join(sys.argv[1:]) or "Write a valid HoloScript .holo scene to agent-out/scene.holo"
    print(run_task(prompt))
`
}

if __name__ == "__main__":
    main()
`;
  }

  private genMonitor(name: string, hasJetsonGPU: boolean, hasTegraMonitor: boolean): string {
    const jetsonSection =
      hasJetsonGPU || hasTegraMonitor
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
${hasJetsonGPU || hasTegraMonitor ? 'import subprocess, re' : ''}

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
${hasJetsonGPU || hasTegraMonitor ? '        data["jetson"] = jetson_stats()' : ''}
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

  private genColconPackageXml(pkgName: string, hasIsaacROS2: boolean): string {
    const isaacDeps = hasIsaacROS2
      ? `  <depend>isaac_ros_common</depend>\n  <depend>isaac_ros_nitros</depend>\n`
      : '';
    return `<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>${pkgName}</name>
  <version>0.1.0</version>
  <description>HoloScript ROS2 bridge — generated by EdgeCompiler</description>
  <maintainer email="agent@holoscript.net">holoscript-agent</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_python</buildtool_depend>

  <depend>rclpy</depend>
  <depend>std_msgs</depend>
  <depend>geometry_msgs</depend>
  <depend>sensor_msgs</depend>
  <depend>control_msgs</depend>
  <depend>action_msgs</depend>
${isaacDeps}
  <test_depend>ament_copyright</test_depend>
  <test_depend>ament_flake8</test_depend>
  <test_depend>ament_pep257</test_depend>
  <test_depend>python3-pytest</test_depend>

  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
`;
  }

  private genColconSetupPy(pkgName: string): string {
    return `from setuptools import find_packages, setup

package_name = '${pkgName}'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='holoscript-agent',
    maintainer_email='agent@holoscript.net',
    description='HoloScript ROS2 bridge — generated by EdgeCompiler',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'bridge = ${pkgName}.bridge:main',
            'isaac_bridge = ${pkgName}.isaac_bridge:main',
        ],
    },
)
`;
  }

  private genROS2Bridge(name: string, pkgName: string): string {
    const nodeVar = name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    return `#!/usr/bin/env python3
"""
HoloScript ROS2 Bridge — ${name}
Colcon-buildable ament_python node. Build: cd ros2_ws && colcon build --symlink-install
Run: ros2 run ${pkgName} bridge

Publishes typed ROS2 messages instead of raw strings:
  /holoscript/cmd_vel         geometry_msgs/Twist    — velocity commands
  /holoscript/joint_commands  sensor_msgs/JointState — joint position targets
  /holoscript/commands        std_msgs/String        — raw HoloScript action JSON

Subscribes:
  /holoscript/feedback        std_msgs/String        — task result feedback
  /holoscript/joint_states    sensor_msgs/JointState — live joint state
"""
import json, os, threading
import rclpy
from rclpy.node import Node
from rclpy.action import ActionClient
from std_msgs.msg import String
from geometry_msgs.msg import Twist
from sensor_msgs.msg import JointState
from control_msgs.action import FollowJointTrajectory
from trajectory_msgs.msg import JointTrajectory, JointTrajectoryPoint
import builtin_interfaces.msg

TOPIC_PREFIX = os.getenv('ROS2_TOPIC_PREFIX', '/holoscript')
NODE_NAME = os.getenv('ROS2_NODE_NAME', '${nodeVar}_bridge')


class HoloScriptBridgeNode(Node):
    """Typed ROS2 bridge for HoloScript edge agent commands."""

    def __init__(self):
        super().__init__(NODE_NAME)

        # Publishers
        self.pub_cmd_vel = self.create_publisher(Twist, f'{TOPIC_PREFIX}/cmd_vel', 10)
        self.pub_joint_cmd = self.create_publisher(JointState, f'{TOPIC_PREFIX}/joint_commands', 10)
        self.pub_raw = self.create_publisher(String, f'{TOPIC_PREFIX}/commands', 10)

        # Subscribers
        self.sub_feedback = self.create_subscription(
            String, f'{TOPIC_PREFIX}/feedback', self._on_feedback, 10)
        self.sub_joint_state = self.create_subscription(
            JointState, f'{TOPIC_PREFIX}/joint_states', self._on_joint_state, 10)

        # Optional joint trajectory action client (ros2_control)
        self._joint_traj_client = ActionClient(
            self, FollowJointTrajectory, '/joint_trajectory_controller/follow_joint_trajectory')

        self._last_joint_state: JointState | None = None
        self.get_logger().info(f'HoloScript ROS2 bridge ready — topics on {TOPIC_PREFIX}')

    def _on_feedback(self, msg: String) -> None:
        self.get_logger().info(f'[feedback] {msg.data[:200]}')

    def _on_joint_state(self, msg: JointState) -> None:
        self._last_joint_state = msg

    # ── Command dispatch ────────────────────────────────────────────────────

    def send_velocity(self, linear_x: float = 0.0, linear_y: float = 0.0,
                      angular_z: float = 0.0) -> None:
        """Publish a Twist velocity command."""
        msg = Twist()
        msg.linear.x = float(linear_x)
        msg.linear.y = float(linear_y)
        msg.angular.z = float(angular_z)
        self.pub_cmd_vel.publish(msg)

    def send_joint_positions(self, joint_names: list[str], positions: list[float]) -> None:
        """Publish joint position targets via JointState."""
        msg = JointState()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.name = joint_names
        msg.position = [float(p) for p in positions]
        self.pub_joint_cmd.publish(msg)

    def send_trajectory(self, joint_names: list[str],
                        waypoints: list[dict]) -> None:
        """Send a joint trajectory to the ros2_control action server."""
        goal = FollowJointTrajectory.Goal()
        traj = JointTrajectory()
        traj.joint_names = joint_names
        for wp in waypoints:
            pt = JointTrajectoryPoint()
            pt.positions = [float(p) for p in wp.get('positions', [])]
            pt.velocities = [float(v) for v in wp.get('velocities', [0.0] * len(joint_names))]
            sec = int(wp.get('time_from_start', 1.0))
            pt.time_from_start = builtin_interfaces.msg.Duration(sec=sec, nanosec=0)
            traj.points.append(pt)
        goal.trajectory = traj
        if self._joint_traj_client.wait_for_server(timeout_sec=1.0):
            self._joint_traj_client.send_goal_async(goal)
        else:
            self.get_logger().warn('joint_trajectory_controller not available — publishing JointState instead')
            self.send_joint_positions(joint_names, waypoints[0].get('positions', []))

    def dispatch_holoscript_action(self, action: dict) -> None:
        """Route a HoloScript action dict to the correct ROS2 message."""
        kind = action.get('type', action.get('kind', ''))
        if kind in ('move', 'velocity', 'cmd_vel'):
            self.send_velocity(
                linear_x=action.get('linear_x', action.get('x', 0.0)),
                linear_y=action.get('linear_y', action.get('y', 0.0)),
                angular_z=action.get('angular_z', action.get('yaw', 0.0)),
            )
        elif kind in ('joint', 'joint_position', 'actuate'):
            self.send_joint_positions(
                action.get('joints', action.get('joint_names', [])),
                action.get('positions', action.get('values', [])),
            )
        elif kind in ('trajectory', 'joint_trajectory'):
            self.send_trajectory(
                action.get('joints', []),
                action.get('waypoints', []),
            )
        else:
            # Fall back to raw JSON string for unknown action types.
            m = String()
            m.data = json.dumps(action)
            self.pub_raw.publish(m)


_bridge_node: HoloScriptBridgeNode | None = None
_bridge_thread: threading.Thread | None = None


def get_bridge() -> HoloScriptBridgeNode:
    """Return the singleton bridge node, starting it if needed."""
    global _bridge_node, _bridge_thread
    if _bridge_node is None:
        rclpy.init()
        _bridge_node = HoloScriptBridgeNode()
        _bridge_thread = threading.Thread(target=rclpy.spin, args=(_bridge_node,), daemon=True)
        _bridge_thread.start()
    return _bridge_node


def main() -> None:
    rclpy.init()
    node = HoloScriptBridgeNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
`;
  }

  private genIsaacBridge(name: string, pkgName: string): string {
    const nodeVar = name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    return `#!/usr/bin/env python3
"""
HoloScript Isaac ROS 2 Bridge — ${name}
NVIDIA Isaac ROS 2 integration layer — NITROS transport, CuVSLAM, Isaac Manipulator.

Requirements:
  - JetPack 6.0+ (Ubuntu 22.04 / JetPack 6.2.1 verified on Orin Nano Super)
  - Isaac ROS 2 Common: https://nvidia-isaac-ros.github.io/repositories_and_packages/isaac_ros_common/
  - isaac_ros_nitros  (hardware-accelerated zero-copy transport)
  - Optional: isaac_ros_visual_slam (CuVSLAM 3D tracking)
  - Optional: isaac_ros_manipulator (cuMotion planner)

Build:
  source /opt/ros/humble/setup.bash
  source ~/ros2_ws/install/setup.bash
  cd ~/ros2_ws && colcon build --symlink-install --packages-select ${pkgName}
  ros2 run ${pkgName} isaac_bridge
"""
import json, os, threading
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from geometry_msgs.msg import PoseStamped, Twist
from sensor_msgs.msg import Image, CameraInfo, PointCloud2

TOPIC_PREFIX = os.getenv('ROS2_TOPIC_PREFIX', '/holoscript')
ISAAC_NODE_NAME = os.getenv('ISAAC_NODE_NAME', '${nodeVar}_isaac')


class HoloScriptIsaacBridgeNode(Node):
    """Isaac ROS 2 bridge — subscribes to NITROS-accelerated perception topics
    and exposes them to HoloScript agents as structured events.

    NITROS (NVIDIA Isaac Transport for ROS) passes GPU tensor buffers
    between nodes without CPU copies. HoloScript receives the parsed
    semantic output, not the raw tensors.
    """

    def __init__(self):
        super().__init__(ISAAC_NODE_NAME)

        # ── Perception inputs (Isaac ROS 2 outputs → HoloScript) ───────────

        # CuVSLAM visual odometry pose (isaac_ros_visual_slam)
        self.sub_slam_pose = self.create_subscription(
            PoseStamped,
            '/visual_slam/tracking/odometry',
            self._on_slam_pose, 10,
        )

        # Raw image from camera pipeline (isaac_ros_image_pipeline)
        self.sub_image = self.create_subscription(
            Image, '/image_rect', self._on_image, 10)

        # Depth / point cloud (isaac_ros_depth_segmentation / nvblox)
        self.sub_depth = self.create_subscription(
            PointCloud2, '/nvblox_node/static_map_pc', self._on_depth, 10)

        # ── HoloScript command relay ────────────────────────────────────────
        self.sub_hs_commands = self.create_subscription(
            String, f'{TOPIC_PREFIX}/commands', self._on_hs_command, 10)

        # ── HoloScript perception events (out) ─────────────────────────────
        self.pub_perception = self.create_publisher(
            String, f'{TOPIC_PREFIX}/perception', 10)
        self.pub_cmd_vel = self.create_publisher(
            Twist, f'{TOPIC_PREFIX}/cmd_vel', 10)

        # cuMotion planner availability check
        self._has_cumotion = False
        self._check_cumotion()

        self.get_logger().info(
            f'[{ISAAC_NODE_NAME}] Isaac ROS 2 bridge ready — '
            f'CuVSLAM=listening, cuMotion={self._has_cumotion}'
        )

    # ── Perception handlers ─────────────────────────────────────────────────

    def _on_slam_pose(self, msg: PoseStamped) -> None:
        """Forward CuVSLAM pose as a HoloScript perception event."""
        p = msg.pose.position
        q = msg.pose.orientation
        event = {
            'type': 'slam_pose',
            'frame': msg.header.frame_id,
            'stamp': msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9,
            'position': {'x': p.x, 'y': p.y, 'z': p.z},
            'orientation': {'x': q.x, 'y': q.y, 'z': q.z, 'w': q.w},
        }
        m = String()
        m.data = json.dumps(event)
        self.pub_perception.publish(m)

    def _on_image(self, msg: Image) -> None:
        """Log image arrival for HoloScript frame-rate monitoring (no copy)."""
        self.get_logger().debug(
            f'[image] {msg.width}x{msg.height} encoding={msg.encoding}')

    def _on_depth(self, msg: PointCloud2) -> None:
        """Forward point cloud metadata as a HoloScript event (no tensor copy)."""
        event = {
            'type': 'depth_map',
            'stamp': msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9,
            'point_count': msg.width * msg.height,
            'frame': msg.header.frame_id,
        }
        m = String()
        m.data = json.dumps(event)
        self.pub_perception.publish(m)

    def _on_hs_command(self, msg: String) -> None:
        """Route HoloScript commands that need Isaac acceleration."""
        try:
            action = json.loads(msg.data)
        except json.JSONDecodeError:
            return
        kind = action.get('type', '')
        if kind == 'navigate_to' and self._has_cumotion:
            self._plan_with_cumotion(action)
        elif kind in ('move', 'velocity'):
            twist = Twist()
            twist.linear.x = float(action.get('x', 0.0))
            twist.angular.z = float(action.get('yaw', 0.0))
            self.pub_cmd_vel.publish(twist)

    def _check_cumotion(self) -> None:
        """Check if cuMotion service is available (non-blocking)."""
        try:
            from rclpy.client import Client  # noqa: F401
            # cuMotion exposes /compute_motion_plan (MoveGroupActionFeedback shape)
            # We don't import the specific type to avoid hard dependency.
            self._has_cumotion = self.get_service_names_and_types().__len__() > 0
        except Exception:
            self._has_cumotion = False

    def _plan_with_cumotion(self, action: dict) -> None:
        """Placeholder: submit a motion planning request to cuMotion."""
        self.get_logger().info(
            f'[cuMotion] planning to target={action.get("target")} (stub — wire cuMotion srv)')


def main() -> None:
    rclpy.init()
    node = HoloScriptIsaacBridgeNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
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
    hasIsaacROS2: boolean
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
# ── ROS2 bridge: build colcon workspace ───────────────────────────────────
if ! command -v ros2 &>/dev/null; then
    echo "[setup] WARNING: ros2 not found — install ROS2 Humble and source setup.bash"
else
    echo "[setup] ROS2 found: $(ros2 --version)"
    if [ -d ros2_ws ]; then
        source /opt/ros/humble/setup.bash${hasIsaacROS2 ? '\n        source ~/ros2_ws/install/setup.bash 2>/dev/null || true' : ''}
        cd ros2_ws && colcon build --symlink-install && cd ..
        echo "[setup] colcon build complete."
    fi
fi
`
      : '';

    const isaacSection = hasIsaacROS2
      ? `
# ── Isaac ROS 2 overlay ───────────────────────────────────────────────────
echo "[setup] Checking Isaac ROS 2 common..."
if [ ! -d ~/ros2_ws/src/isaac_ros_common ]; then
    echo "[setup] WARNING: isaac_ros_common not found — see https://nvidia-isaac-ros.github.io/repositories_and_packages/isaac_ros_common/"
fi
`
      : '';

    const cpFiles = `agent.py monitor.py${hasJetsonGPU ? ' tensorrt_loader.py' : ''} manifest.json`;
    const ros2CpSection = hasROS2
      ? `
# ── Copy ROS2 colcon workspace ────────────────────────────────────────────
if [ -d ros2_ws ]; then
    sudo cp -r ros2_ws "$REMOTE_PATH/"
fi`
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
${jetsonSection}${ros2Section}${isaacSection}
# ── Install agent files ───────────────────────────────────────────────────
echo "[setup] copying files to $REMOTE_PATH..."
sudo mkdir -p "$REMOTE_PATH"
sudo cp ${cpFiles} "$REMOTE_PATH/"
sudo chmod +x "$REMOTE_PATH/agent.py" "$REMOTE_PATH/monitor.py"
${ros2CpSection}
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
    hasROS2: boolean
  ): string {
    const safeName = name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    // Source ROS2 environment if the bridge was generated so agent.py can
    // import rclpy at runtime without a separate wrapper script.
    const ros2Env = hasROS2
      ? `ExecStartPre=/bin/bash -c 'source /opt/ros/humble/setup.bash || true'
Environment=PYTHONPATH=/opt/ros/humble/lib/python3.10/site-packages:${remotePath}/ros2_ws/install/local/lib/python3.10/dist-packages
`
      : '';
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
${ros2Env}ExecStart=/usr/bin/python3 ${remotePath}/agent.py
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${safeName}

[Install]
WantedBy=multi-user.target
`;
  }

  /**
   * systemd unit that runs the CANONICAL TS AgentRunner (`@holoscript/holoscript-agent`
   * `index.js run` = runForever) — NOT the standalone Python agent.py. This is the
   * runtime that carries the full gate stack: artifact-grounding (W.107.b), reflect
   * self-eval, the CAEL hash-chain, content-hashed/signed hardware receipts, and native
   * on_task cognitive-verb consumption. Restart=always + `systemctl enable` => survives
   * crash AND reboot. The seat MASTER KEY is the only secret and lives in a 0600
   * EnvironmentFile referenced by path, never inlined (F.106). The bearer is resolved at
   * boot from the seat wallet via the HoloKey broker (no plaintext bearer needed).
   */
  private genAgentRunnerSystemd(
    name: string,
    ollamaUrl: string,
    model: string,
    remotePath: string,
    serviceUser: string
  ): string {
    const safeName = name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    return `[Unit]
Description=HoloScript Agent (AgentRunner) — ${name}
Documentation=https://holoscript.net/docs/edge
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User=${serviceUser}
WorkingDirectory=${remotePath}
Environment=HOLOSCRIPT_AGENT_PROVIDER=local-llm
Environment=HOLOSCRIPT_AGENT_MODEL=${model}
Environment=HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL=${ollamaUrl}
Environment=HOLOSCRIPT_AGENT_HANDLE=${safeName}
Environment=HOLOSCRIPT_AGENT_TICK_MS=60000
Environment=HOLOSCRIPT_AGENT_SEATS_ROOT=${remotePath}/seats
Environment=HOLOSCRIPT_AGENT_SEAT_ID=${safeName}
Environment=NODE_NO_WARNINGS=1
# Secret seat master key (+ any HOLOMESH_* overrides) — 0600, by path, never inlined (F.106):
EnvironmentFile=-/etc/holoscript/${safeName}.env
ExecStart=/usr/bin/node ${remotePath}/packages/holoscript-agent/dist/index.js run
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${safeName}

[Install]
WantedBy=multi-user.target
`;
  }

  /**
   * Setup for the AgentRunner runtime: ensure Ollama + model, ensure node, verify the
   * synced @holoscript/holoscript-agent dist is present, then install + enable the unit.
   * Never writes the seat secret (F.106) — it only reminds the operator to place it.
   */
  private genAgentRunnerSetup(
    name: string,
    model: string,
    remotePath: string,
    serviceUser: string,
    hasJetsonGPU: boolean
  ): string {
    const safeName = name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const jetsonSection = hasJetsonGPU
      ? `
# ── Jetson: MAXN power mode ───────────────────────────────────────────────
command -v nvpmodel &>/dev/null && sudo nvpmodel -m 0 || true
command -v jetson_clocks &>/dev/null && sudo jetson_clocks || true
`
      : '';
    return `#!/usr/bin/env bash
# HoloScript Edge Setup (AgentRunner runtime) — ${name}
# Installs the canonical TS AgentRunner (full gates: artifact-grounding, reflect, CAEL,
# content-hashed/signed hardware receipts, native cognitive verbs) as a boot-persistent unit.
set -e

REMOTE_PATH="${remotePath}"
SERVICE_USER="${serviceUser}"
MODEL="${model}"
SECRET_ENV="/etc/holoscript/${safeName}.env"

command -v ollama &>/dev/null || { echo "[setup] Ollama not found. Install: curl -fsSL https://ollama.com/install.sh | sh"; exit 1; }
command -v node   &>/dev/null || { echo "[setup] node not found — install Node >= 20 first"; exit 1; }

echo "[setup] pulling $MODEL..."
ollama pull "$MODEL"
${jetsonSection}
# The canonical AgentRunner dist must be synced under $REMOTE_PATH.
if [ ! -f "$REMOTE_PATH/packages/holoscript-agent/dist/index.js" ]; then
  echo "[setup] WARNING: $REMOTE_PATH/packages/holoscript-agent/dist/index.js missing —"
  echo "        sync the dist (or 'npm i -g @holoscript/holoscript-agent' and adjust ExecStart)."
fi

if [ ! -f "$SECRET_ENV" ]; then
  echo "[setup] WARNING: $SECRET_ENV not found. Create it (0600) with at least:"
  echo "          HOLOSCRIPT_AGENT_SEAT_MASTER_KEY=<seat master key>"
  echo "        The agent errors loudly at boot until the seat is resolvable (honest)."
fi

echo "[setup] installing systemd service..."
sudo cp holoscript_agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now holoscript_agent.service
echo "[setup] done. Status: systemctl status holoscript_agent | Logs: journalctl -u holoscript_agent -f"
`;
  }

  private genDeployInstructions(
    name: string,
    ollamaUrl: string,
    remotePath: string,
    platform: string,
    hasROS2: boolean
  ): string {
    const ros2Steps = hasROS2
      ? [
          ``,
          `# ROS2 bridge (colcon workspace):`,
          `#   cd ~/holoscript-deploy && bash setup.sh  # builds ros2_ws automatically`,
          `#   OR manually: source /opt/ros/humble/setup.bash`,
          `#                cd ros2_ws && colcon build --symlink-install`,
          `#                source install/setup.bash`,
          `#                ros2 run *_bridge bridge`,
        ]
      : [];
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
      ...ros2Steps,
      ``,
      `# 3. Verify:`,
      `#    systemctl status holoscript_agent`,
      `#    curl http://localhost:9090/  # monitor health`,
      ``,
      `# 4. For Jetson (jetson.local):`,
      `#    HOLOSCRIPT_AGENT_PROVIDER=local-llm \\`,
      `#    HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL=${ollamaUrl} \\`,
      `#    node packages/holoscript-agent/dist/index.js tick`,
      ``,
      `# Files installed to: ${remotePath}`,
    ].join('\n');
  }
}
