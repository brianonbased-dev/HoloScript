/**
 * generate-uaal-world-holo.mjs
 *
 * Generates the uAAL Collective HoloScript composition (.holo) for the
 * Paper 26 simulation world — 100 humanoid agents in concentric rings.
 *
 * Usage:
 *   node generate-uaal-world-holo.mjs > uaal-collective.generated.holo
 *   node generate-uaal-world-holo.mjs --print-openxr  (emit only the compile input)
 */

const RINGS = [
  { ring: 0, count: 12, radius: 4,  accent: '#22d3ee', accentName: 'cyan'   },
  { ring: 1, count: 24, radius: 8,  accent: '#a855f7', accentName: 'purple' },
  { ring: 2, count: 36, radius: 12, accent: '#6366f1', accentName: 'indigo' },
  { ring: 3, count: 28, radius: 16, accent: '#818cf8', accentName: 'slate'  },
];

function agentPositions() {
  const out = [];
  let idx = 0;
  for (const spec of RINGS) {
    const step   = (2 * Math.PI) / spec.count;
    const offset = spec.ring * (Math.PI / (spec.count * 2));
    for (let i = 0; i < spec.count; i++) {
      const angle = i * step + offset;
      const x = parseFloat((spec.radius * Math.cos(angle)).toFixed(3));
      const z = parseFloat((spec.radius * Math.sin(angle)).toFixed(3));
      out.push({ idx, ring: spec.ring, accent: spec.accent, x, y: 0, z,
                 id: `sim_agent_${String(idx).padStart(3,'0')}` });
      idx++;
    }
  }
  return out;
}

function objectBlock(agent) {
  return `    object "${agent.id}" using "P26HumanoidAvatar" {
      position: [${agent.x}, ${agent.y}, ${agent.z}]
      state.agent_id: "${agent.id}"
      state.ring: ${agent.ring}
      state.ring_accent: "${agent.accent}"
    }`;
}

function generateComposition() {
  const agents = agentPositions();
  const byRing = [0,1,2,3].map(r => agents.filter(a => a.ring === r));

  const objectBlocks = byRing.map((ring, r) => {
    const name = ['Inner Council','Primary Ring','Secondary Ring','Outer Ring'][r];
    return `  spatial_group "${name}" {\n${ring.map(objectBlock).join('\n')}\n  }`;
  }).join('\n\n');

  return `composition "uAAL Collective" {

  // ── Environment — neural chamber ────────────────────────────────────────

  environment {
    skybox: "neural_void"
    ambient_light: 0.3
    fog_color: "#06061a"
    fog_density: 0.04
    directional_light: 0.5
  }

  // ── Avatar template ──────────────────────────────────────────────────────

  template "P26HumanoidAvatar" {
    geometry: "model/humanoid_holoscript_v1.glb"

    state {
      agent_id: "sim_agent_000"
      ring: 0
      ring_accent: "#22d3ee"
      gamma: 0.0
      lifecycle: "init"
      totalLoss: 0.0
      diversity: 1.0
    }

    action updateMetrics(gamma, lifecycle, totalLoss, diversity) {
      state.gamma = gamma
      state.lifecycle = lifecycle
      state.totalLoss = totalLoss
      state.diversity = diversity
    }

    action onSSETick(tick) {
      emit("avatar:metrics-update", { agent_id: state.agent_id, tick: tick })
    }
  }

  // ── Central HUD pillar template ──────────────────────────────────────────

  template "PopulationHUD" {
    geometry: "primitive/cylinder"

    state {
      medianGamma: 0.0
      p90Gamma: 0.0
      meanTotalLoss: 0.0
      meanDiversity: 1.0
      tick: 0
      agents: 100
      targetTicks: 1000
    }

    action onSSETick(metrics) {
      state.medianGamma   = metrics.medianGamma
      state.p90Gamma      = metrics.p90Gamma
      state.meanTotalLoss = metrics.meanTotalLoss
      state.meanDiversity = metrics.meanDiversity
      state.tick          = metrics.tick
    }
  }

  // ── Central HUD ──────────────────────────────────────────────────────────

  spatial_group "Central" {
    object "HUD_Pillar" using "PopulationHUD" {
      position: [0, 0, 0]
    }
    object "Arena_Floor" {
      geometry: "primitive/cylinder"
      position: [0, -0.05, 0]
    }
  }

  // ── Agent avatars (100 total across 4 concentric rings) ──────────────────

${objectBlocks}

  // ── Observer platforms ───────────────────────────────────────────────────

  spatial_group "Observer Platforms" {
    object "Platform_N" { geometry: "primitive/cylinder" position: [0, 0, 14] }
    object "Platform_S" { geometry: "primitive/cylinder" position: [0, 0, -14] }
    object "Platform_E" { geometry: "primitive/cylinder" position: [14, 0, 0] }
    object "Platform_W" { geometry: "primitive/cylinder" position: [-14, 0, 0] }
  }

  // ── Logic — SSE bridge + avatar routing ─────────────────────────────────

  logic {
    on_ready() {
      sse.connect("https://sim.holoscript.studio/sim/paper26/api/stream")
    }

    on_sse_message(data) {
      // Update central HUD
      HUD_Pillar.onSSETick(data.metrics)

      // Derive per-agent updates and dispatch to each avatar
      var updates = paper26.derivePerAgentUpdates(data)
      for (var u of updates) {
        var avatar = scene.find(u.agent_id)
        if (avatar) {
          avatar.updateMetrics(u.gamma, u.lifecycle, u.totalLoss, u.diversity)
        }
      }
    }

    on_sse_disconnect() {
      schedule(5000, function() { sse.connect("https://sim.holoscript.studio/sim/paper26/api/stream") })
    }
  }
}`;
}

const composition = generateComposition();

if (process.argv.includes('--print-openxr')) {
  // Output just the composition for direct use with compile_to_openxr
  process.stdout.write(composition);
} else {
  // Pretty-print with header comment
  const header = `// uAAL Collective — generated HoloScript composition
// Auto-generated by generate-uaal-world-holo.mjs — DO NOT EDIT DIRECTLY
// Source: packages/core/src/traits/pillar/sim/
// Agents: 100 (12 + 24 + 36 + 28 in concentric rings)\n\n`;
  process.stdout.write(header + composition);
}
