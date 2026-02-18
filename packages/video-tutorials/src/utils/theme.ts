export const theme = {
  // Background layers
  bg: "#0d1117",
  surface: "#161b22",
  surfaceElevated: "#21262d",

  // Brand accent (HoloScript blue)
  accent: "#58a6ff",
  accentGlow: "#1f6feb",
  accentDim: "#388bfd33",

  // Semantic colors
  success: "#3fb950",
  warning: "#d29922",
  error: "#f85149",
  info: "#79c0ff",

  // Text
  text: "#e6edf3",
  textMuted: "#8b949e",
  textFaint: "#484f58",

  // Typography
  font: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  titleFont: "'Inter', 'Segoe UI', system-ui, sans-serif",

  // Layout
  borderRadius: 8,
  padding: 48,
  codePadding: 32,

  // Animation timings (in frames at 30fps)
  fps: 30,
  fadeIn: 20,
  slideIn: 18,
  stepTransition: 25,
} as const;

export type Theme = typeof theme;
