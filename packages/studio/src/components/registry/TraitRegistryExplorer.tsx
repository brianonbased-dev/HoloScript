import React, { useState, useEffect } from 'react';

interface TraitDefinition {
  id: string;
  category: string;
  source: string;
  deprecated?: boolean;
}

export const TraitRegistryExplorer: React.FC = () => {
  const [traits, setTraits] = useState<TraitDefinition[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    // In a real implementation this would fetch from the API or import the JSON
    import('@holoscript/core/traits/trait-registry.json')
      .then((mod) => {
        // Dynamic JSON imports return `{ default: <content> }`.
        const registry = (mod as { default: Record<string, unknown> }).default;
        const traitsList = Object.values(registry) as TraitDefinition[];
        setTraits(traitsList);
      })
      .catch(() => {
        setTraits([{ id: 'mock_trait', category: 'interaction', source: 'holoscript' }]);
      });
  }, []);

  const filteredTraits = traits.filter((t) => filter === 'all' || t.source === filter);

  return (
    <div className="trait-registry-container p-6 bg-slate-900 border border-slate-700 text-white rounded-xl shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          Unified Trait Registry
        </h2>
        <div className="badges space-x-2">
          <span className="bg-blue-900 px-3 py-1 rounded text-sm">
            HoloScript: {traits.filter((t) => t.source === 'holoscript').length}
          </span>
          <span className="bg-emerald-900 px-3 py-1 rounded text-sm">
            TrainingMonkey: {traits.filter((t) => t.source === 'trainingmonkey').length}
          </span>
          <span className="bg-purple-900 px-3 py-1 rounded text-sm">
            Hololand: {traits.filter((t) => t.source === 'hololand').length}
          </span>
          <span className="bg-orange-900 px-3 py-1 rounded text-sm">
            Film VFX: {traits.filter((t) => t.source === 'film_vfx').length}
          </span>
        </div>
      </div>

      <div className="controls mb-4">
        <select
          className="bg-slate-800 border border-slate-600 rounded p-2 text-white"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Sources</option>
          <option value="holoscript">HoloScript Core</option>
          <option value="trainingmonkey">Training Monkey</option>
          <option value="hololand">Hololand</option>
          <option value="film_vfx">Film VFX</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTraits.map((t) => (
          <div
            key={t.id}
            className={`p-4 rounded border ${t.deprecated ? 'border-red-500 bg-red-900/20' : 'border-slate-700 bg-slate-800'}`}
          >
            <div className="flex justify-between">
              <span className="font-mono text-blue-300">@{t.id}</span>
              <span className="text-xs text-slate-400 uppercase tracking-widest">{t.category}</span>
            </div>
            {t.deprecated && <div className="text-red-400 text-xs font-bold mt-2">DEPRECATED</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
