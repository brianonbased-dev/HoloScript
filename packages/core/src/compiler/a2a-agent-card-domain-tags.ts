/**
 * Domain keyword → tag expansions for A2A agent card skill metadata.
 * Kept out of A2AAgentCardCompiler so domain vocabulary is one importable surface.
 */

export const A2A_AGENT_CARD_DOMAIN_TAGS: Readonly<Record<string, readonly string[]>> = {
  iot: ['iot', 'sensor', 'telemetry', 'digital-twin'],
  robotics: ['robotics', 'control', 'actuator', 'simulation'],
  dataviz: ['data-visualization', 'analytics', 'dashboard'],
  education: ['education', 'learning', 'curriculum'],
  healthcare: ['healthcare', 'medical', 'monitoring'],
  music: ['music', 'audio', 'composition'],
  architecture: ['architecture', 'building', 'design'],
  web3: ['web3', 'blockchain', 'smart-contract'],
  physics: ['physics', 'simulation', 'collision'],
  material: ['material', 'rendering', 'pbr'],
  vfx: ['vfx', 'particles', 'visual-effects'],
  weather: ['weather', 'atmosphere', 'environmental'],
  navigation: ['navigation', 'pathfinding', 'ai'],
  procedural: ['procedural', 'generation', 'algorithms'],
} as const;
