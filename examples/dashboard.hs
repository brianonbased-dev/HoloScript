// Real-Time Data Monitoring Dashboard
// A multi-panel dashboard with live metrics, color-coded status indicators,
// trend charts, and interactive drill-down. Demonstrates @data_binding,
// @clickable, grid layout patterns, and threshold-based styling.

// === ENVIRONMENT ===
// Dark environment to maximize contrast with dashboard panels.

environment {
  skybox: "night"
  ambient_light: 0.3
}

// === FLOOR ===

object "floor" {
  geometry: "cube"
  color: "#0a0a14"
  material: "matte"
  position: { x: 0, y: 0, z: 0 }
  scale: { x: 10, y: 0.1, z: 8 }
}

// === HEADER BAR ===
// Title and live timestamp at the top of the dashboard.

object "header_bar" {
  geometry: "cube"
  color: "#16213e"
  material: "standard"
  position: { x: 0, y: 3.4, z: -3 }
  scale: { x: 6.2, y: 0.35, z: 0.08 }
}

object "header_title" {
  text: "SYSTEM MONITOR"
  color: "#e0e0ff"
  material: "standard"
  position: { x: -1.8, y: 3.4, z: -2.92 }
  scale: { x: 0.18, y: 0.18, z: 0.18 }
}

object "header_timestamp" {
  text: "LIVE"
  color: "#00ff88"
  material: "neon"
  glow: true
  position: { x: 2.2, y: 3.4, z: -2.92 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
  animate: "pulse"
  animSpeed: 2
  @data_binding {
    source: "system.clock"
    field: "text"
    format: "HH:mm:ss"
    refresh_ms: 1000
  }
}

// === MAIN BACKPLANE ===
// Dark backing panel that all metric cards sit in front of.

object "backplane" {
  geometry: "cube"
  color: "#0f1629"
  material: "standard"
  position: { x: 0, y: 1.7, z: -3 }
  scale: { x: 6.2, y: 3, z: 0.06 }
}

// ============================================================
// METRIC PANELS — 2x2 grid layout
// Each panel has: background, label, value readout, status indicator.
// Status indicator colors follow thresholds:
//   Green  = nominal (< 60%)
//   Yellow = warning (60-85%)
//   Red    = critical (> 85%)
// ============================================================

// --- PANEL 1: CPU USAGE (top-left) ---

object "cpu_panel_bg" {
  geometry: "cube"
  color: "#1a2340"
  material: "standard"
  position: { x: -1.6, y: 2.5, z: -2.92 }
  scale: { x: 2.6, y: 1.1, z: 0.04 }
  @clickable {
    action: "drilldown"
    target: "cpu_detail_view"
    tooltip: "Click to view per-core CPU breakdown"
  }
}

object "cpu_label" {
  text: "CPU USAGE"
  color: "#8899bb"
  material: "standard"
  position: { x: -2.4, y: 2.85, z: -2.88 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
}

object "cpu_value" {
  text: "42%"
  color: "#ffffff"
  material: "standard"
  position: { x: -2.4, y: 2.45, z: -2.88 }
  scale: { x: 0.22, y: 0.22, z: 0.22 }
  @data_binding {
    source: "metrics.cpu.percent"
    field: "text"
    format: "{value}%"
    refresh_ms: 2000
  }
}

// Status indicator: a small circle that changes color based on threshold.
object "cpu_status_dot" {
  geometry: "sphere"
  color: "#00ff66"
  material: "neon"
  glow: true
  position: { x: -0.6, y: 2.85, z: -2.88 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
  @data_binding {
    source: "metrics.cpu.percent"
    field: "color"
    thresholds: [
      { max: 60, color: "#00ff66" },
      { max: 85, color: "#ffaa00" },
      { max: 100, color: "#ff3333" }
    ]
    refresh_ms: 2000
  }
}

// Mini sparkline chart — five bars showing recent CPU trend.
object "cpu_bar_1" {
  geometry: "cube"
  color: "#3366cc"
  material: "standard"
  position: { x: -1.1, y: 2.3, z: -2.88 }
  scale: { x: 0.08, y: 0.3, z: 0.02 }
  @data_binding { source: "metrics.cpu.history[0]", field: "scale.y", refresh_ms: 5000 }
}

object "cpu_bar_2" {
  geometry: "cube"
  color: "#3366cc"
  material: "standard"
  position: { x: -0.98, y: 2.3, z: -2.88 }
  scale: { x: 0.08, y: 0.45, z: 0.02 }
  @data_binding { source: "metrics.cpu.history[1]", field: "scale.y", refresh_ms: 5000 }
}

object "cpu_bar_3" {
  geometry: "cube"
  color: "#3366cc"
  material: "standard"
  position: { x: -0.86, y: 2.3, z: -2.88 }
  scale: { x: 0.08, y: 0.35, z: 0.02 }
  @data_binding { source: "metrics.cpu.history[2]", field: "scale.y", refresh_ms: 5000 }
}

object "cpu_bar_4" {
  geometry: "cube"
  color: "#3366cc"
  material: "standard"
  position: { x: -0.74, y: 2.3, z: -2.88 }
  scale: { x: 0.08, y: 0.5, z: 0.02 }
  @data_binding { source: "metrics.cpu.history[3]", field: "scale.y", refresh_ms: 5000 }
}

object "cpu_bar_5" {
  geometry: "cube"
  color: "#3366cc"
  material: "standard"
  position: { x: -0.62, y: 2.3, z: -2.88 }
  scale: { x: 0.08, y: 0.42, z: 0.02 }
  @data_binding { source: "metrics.cpu.history[4]", field: "scale.y", refresh_ms: 5000 }
}

// --- PANEL 2: MEMORY (top-right) ---

object "mem_panel_bg" {
  geometry: "cube"
  color: "#1a2340"
  material: "standard"
  position: { x: 1.6, y: 2.5, z: -2.92 }
  scale: { x: 2.6, y: 1.1, z: 0.04 }
  @clickable {
    action: "drilldown"
    target: "memory_detail_view"
    tooltip: "Click to view memory allocation breakdown"
  }
}

object "mem_label" {
  text: "MEMORY"
  color: "#8899bb"
  material: "standard"
  position: { x: 0.8, y: 2.85, z: -2.88 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
}

object "mem_value" {
  text: "6.2 / 16 GB"
  color: "#ffffff"
  material: "standard"
  position: { x: 0.8, y: 2.45, z: -2.88 }
  scale: { x: 0.14, y: 0.14, z: 0.14 }
  @data_binding {
    source: "metrics.memory"
    field: "text"
    format: "{used} / {total} GB"
    refresh_ms: 3000
  }
}

object "mem_status_dot" {
  geometry: "sphere"
  color: "#00ff66"
  material: "neon"
  glow: true
  position: { x: 2.6, y: 2.85, z: -2.88 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
  @data_binding {
    source: "metrics.memory.percent"
    field: "color"
    thresholds: [
      { max: 60, color: "#00ff66" },
      { max: 85, color: "#ffaa00" },
      { max: 100, color: "#ff3333" }
    ]
    refresh_ms: 3000
  }
}

// Memory usage bar — a horizontal fill bar.
object "mem_bar_track" {
  geometry: "cube"
  color: "#0a1225"
  material: "standard"
  position: { x: 1.6, y: 2.15, z: -2.88 }
  scale: { x: 2.2, y: 0.1, z: 0.02 }
}

object "mem_bar_fill" {
  geometry: "cube"
  color: "#22cc88"
  material: "neon"
  glow: true
  position: { x: 1.05, y: 2.15, z: -2.87 }
  scale: { x: 0.85, y: 0.08, z: 0.02 }
  @data_binding {
    source: "metrics.memory.percent"
    field: "scale.x"
    transform: "value / 100 * 2.2"
    refresh_ms: 3000
  }
}

// --- PANEL 3: NETWORK I/O (bottom-left) ---

object "net_panel_bg" {
  geometry: "cube"
  color: "#1a2340"
  material: "standard"
  position: { x: -1.6, y: 1.1, z: -2.92 }
  scale: { x: 2.6, y: 1.1, z: 0.04 }
  @clickable {
    action: "drilldown"
    target: "network_detail_view"
    tooltip: "Click to view per-interface network stats"
  }
}

object "net_label" {
  text: "NETWORK I/O"
  color: "#8899bb"
  material: "standard"
  position: { x: -2.4, y: 1.45, z: -2.88 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
}

object "net_down_label" {
  text: "DOWN"
  color: "#66aaff"
  material: "standard"
  position: { x: -2.4, y: 1.15, z: -2.88 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
}

object "net_down_value" {
  text: "124 Mbps"
  color: "#66aaff"
  material: "standard"
  position: { x: -1.8, y: 1.15, z: -2.88 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
  @data_binding {
    source: "metrics.network.download_mbps"
    field: "text"
    format: "{value} Mbps"
    refresh_ms: 2000
  }
}

object "net_up_label" {
  text: "UP"
  color: "#ff8866"
  material: "standard"
  position: { x: -2.4, y: 0.9, z: -2.88 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
}

object "net_up_value" {
  text: "38 Mbps"
  color: "#ff8866"
  material: "standard"
  position: { x: -1.8, y: 0.9, z: -2.88 }
  scale: { x: 0.12, y: 0.12, z: 0.12 }
  @data_binding {
    source: "metrics.network.upload_mbps"
    field: "text"
    format: "{value} Mbps"
    refresh_ms: 2000
  }
}

object "net_status_dot" {
  geometry: "sphere"
  color: "#00ff66"
  material: "neon"
  glow: true
  position: { x: -0.6, y: 1.45, z: -2.88 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
  @data_binding {
    source: "metrics.network.health"
    field: "color"
    thresholds: [
      { max: 0, color: "#ff3333" },
      { max: 1, color: "#ffaa00" },
      { max: 2, color: "#00ff66" }
    ]
    refresh_ms: 5000
  }
}

// --- PANEL 4: REQUESTS/SEC (bottom-right) ---

object "req_panel_bg" {
  geometry: "cube"
  color: "#1a2340"
  material: "standard"
  position: { x: 1.6, y: 1.1, z: -2.92 }
  scale: { x: 2.6, y: 1.1, z: 0.04 }
  @clickable {
    action: "drilldown"
    target: "requests_detail_view"
    tooltip: "Click to view request latency distribution"
  }
}

object "req_label" {
  text: "REQUESTS / SEC"
  color: "#8899bb"
  material: "standard"
  position: { x: 0.8, y: 1.45, z: -2.88 }
  scale: { x: 0.1, y: 0.1, z: 0.1 }
}

object "req_value" {
  text: "1,247"
  color: "#ffffff"
  material: "standard"
  position: { x: 0.8, y: 1.05, z: -2.88 }
  scale: { x: 0.25, y: 0.25, z: 0.25 }
  @data_binding {
    source: "metrics.http.requests_per_second"
    field: "text"
    format: "{value}"
    refresh_ms: 1000
  }
}

object "req_status_dot" {
  geometry: "sphere"
  color: "#00ff66"
  material: "neon"
  glow: true
  position: { x: 2.6, y: 1.45, z: -2.88 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
  @data_binding {
    source: "metrics.http.error_rate"
    field: "color"
    thresholds: [
      { max: 1, color: "#00ff66" },
      { max: 5, color: "#ffaa00" },
      { max: 100, color: "#ff3333" }
    ]
    refresh_ms: 2000
  }
}

// Latency indicator — p50/p99 readouts.
object "req_p50_label" {
  text: "p50: 12ms"
  color: "#66cc99"
  material: "standard"
  position: { x: 1.8, y: 0.85, z: -2.88 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
  @data_binding {
    source: "metrics.http.latency_p50"
    field: "text"
    format: "p50: {value}ms"
    refresh_ms: 5000
  }
}

object "req_p99_label" {
  text: "p99: 142ms"
  color: "#cc9966"
  material: "standard"
  position: { x: 1.8, y: 0.72, z: -2.88 }
  scale: { x: 0.08, y: 0.08, z: 0.08 }
  @data_binding {
    source: "metrics.http.latency_p99"
    field: "text"
    format: "p99: {value}ms"
    refresh_ms: 5000
  }
}

// ============================================================
// LINE CHART — Trend visualization across bottom
// Seven vertical bars represent the last 7 data points.
// Height is bound to historical request rate data.
// ============================================================

object "chart_bg" {
  geometry: "cube"
  color: "#111830"
  material: "standard"
  position: { x: 0, y: 0.35, z: -2.92 }
  scale: { x: 6.2, y: 0.45, z: 0.04 }
}

object "chart_label" {
  text: "7-POINT TREND"
  color: "#556688"
  material: "standard"
  position: { x: -2.7, y: 0.5, z: -2.88 }
  scale: { x: 0.07, y: 0.07, z: 0.07 }
}

object "trend_bar_1" {
  geometry: "cube"
  color: "#2255aa"
  material: "standard"
  position: { x: -1.8, y: 0.3, z: -2.88 }
  scale: { x: 0.12, y: 0.2, z: 0.02 }
  @data_binding { source: "metrics.trend[0]", field: "scale.y", refresh_ms: 10000 }
}

object "trend_bar_2" {
  geometry: "cube"
  color: "#2266bb"
  material: "standard"
  position: { x: -1.2, y: 0.3, z: -2.88 }
  scale: { x: 0.12, y: 0.28, z: 0.02 }
  @data_binding { source: "metrics.trend[1]", field: "scale.y", refresh_ms: 10000 }
}

object "trend_bar_3" {
  geometry: "cube"
  color: "#2277cc"
  material: "standard"
  position: { x: -0.6, y: 0.3, z: -2.88 }
  scale: { x: 0.12, y: 0.35, z: 0.02 }
  @data_binding { source: "metrics.trend[2]", field: "scale.y", refresh_ms: 10000 }
}

object "trend_bar_4" {
  geometry: "cube"
  color: "#2288dd"
  material: "standard"
  position: { x: 0, y: 0.3, z: -2.88 }
  scale: { x: 0.12, y: 0.25, z: 0.02 }
  @data_binding { source: "metrics.trend[3]", field: "scale.y", refresh_ms: 10000 }
}

object "trend_bar_5" {
  geometry: "cube"
  color: "#2299ee"
  material: "standard"
  position: { x: 0.6, y: 0.3, z: -2.88 }
  scale: { x: 0.12, y: 0.38, z: 0.02 }
  @data_binding { source: "metrics.trend[4]", field: "scale.y", refresh_ms: 10000 }
}

object "trend_bar_6" {
  geometry: "cube"
  color: "#33aaff"
  material: "standard"
  position: { x: 1.2, y: 0.3, z: -2.88 }
  scale: { x: 0.12, y: 0.32, z: 0.02 }
  @data_binding { source: "metrics.trend[5]", field: "scale.y", refresh_ms: 10000 }
}

object "trend_bar_7" {
  geometry: "cube"
  color: "#44bbff"
  material: "neon"
  glow: true
  position: { x: 1.8, y: 0.3, z: -2.88 }
  scale: { x: 0.12, y: 0.3, z: 0.02 }
  @data_binding { source: "metrics.trend[6]", field: "scale.y", refresh_ms: 10000 }
}
