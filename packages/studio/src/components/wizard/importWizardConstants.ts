export const KIND_META: Record<string, { emoji: string; label: string; color: string }> = {
  service: { emoji: '🔧', label: 'API / Service', color: 'text-blue-400' },
  frontend: { emoji: '🎨', label: 'Frontend App', color: 'text-purple-400' },
  data: { emoji: '📊', label: 'Data Pipeline', color: 'text-amber-400' },
  automation: { emoji: '🤖', label: 'Automation / Bot', color: 'text-orange-400' },
  'agent-backend': { emoji: '🧠', label: 'Agent / MCP Backend', color: 'text-cyan-400' },
  library: { emoji: '📦', label: 'Library / Package', color: 'text-green-400' },
  spatial: { emoji: '🌐', label: 'Spatial / XR', color: 'text-emerald-400' },
  storefront: { emoji: '🪟', label: 'Storefront / Retail', color: 'text-lime-400' },
  unknown: { emoji: '❓', label: 'Unknown', color: 'text-gray-400' },
};
