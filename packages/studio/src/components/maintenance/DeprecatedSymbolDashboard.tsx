import React, { useState, useEffect } from 'react';

// Reflects the metadata exported from packages/core/scripts/deprecated-inventory.ts
export interface DeprecatedSymbol {
  symbolName: string;
  filePath: string;
  classification: 'DEAD' | 'REFERENCED' | 'DYNAMIC';
  importerCount: number;
}

export const DeprecatedSymbolDashboard: React.FC = () => {
    const [inventory, setInventory] = useState<DeprecatedSymbol[]>([]);
    
    useEffect(() => {
        // Hydrate from the offline generated JSON cache OR REST APi
        fetch('/api/admin/deprecated')
          .then(res => res.json())
          .then(data => setInventory(data.inventory || []))
          .catch(() => {
             // Mock offline data
             setInventory([
                 { symbolName: 'OldNetworkStrategy', filePath: 'core/src/network/_deprecated/v1.ts', classification: 'DEAD', importerCount: 0 },
                 { symbolName: 'HoloScriptTraitAnnotationParser', filePath: 'core/src/parser/HoloScriptPlusParser.ts', classification: 'REFERENCED', importerCount: 22 },
             ])
          });
    }, []);

    const totalDead = inventory.filter(i => i.classification === 'DEAD').length;
    const totalReferenced = inventory.filter(i => i.classification === 'REFERENCED').length;

    return (
        <div className="deprecated-dashboard p-6 bg-slate-900 border border-slate-700 text-white rounded-xl shadow-2xl">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-orange-400">
                    SCARF Deprecation Auditing Console
                </h2>
                <div className="flex space-x-2">
                    <span className="bg-red-900 px-3 py-1 rounded text-red-200">DEAD: {totalDead}</span>
                    <span className="bg-orange-900 px-3 py-1 rounded text-orange-200">REFERENCED: {totalReferenced}</span>
                </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-700 mb-6">
                <table className="min-w-full text-left bg-slate-800">
                    <thead className="bg-slate-900 text-slate-400 text-xs tracking-wider uppercase">
                        <tr>
                            <th className="px-6 py-3">Symbol</th>
                            <th className="px-6 py-3">File Path</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Importer Count</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {inventory.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 font-mono text-blue-300">{item.symbolName}</td>
                                <td className="px-6 py-4 text-sm text-slate-400 truncate max-w-sm">{item.filePath}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        item.classification === 'DEAD' ? 'bg-red-500/20 text-red-400' : 
                                        'bg-orange-500/20 text-orange-400'
                                    }`}>
                                        {item.classification}
                                    </span>
                                </td>
                                <td className="px-6 py-4">{item.importerCount}</td>
                                <td className="px-6 py-4 text-right">
                                    {item.classification === 'REFERENCED' ? (
                                        <button className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-sm transition-colors border border-slate-500">
                                            Generate Codemod
                                        </button>
                                    ) : (
                                        <button className="bg-red-900 hover:bg-red-800 px-3 py-1 rounded text-sm text-red-200 transition-colors border border-red-700">
                                            Purge Object
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="p-4 bg-slate-800 rounded border border-slate-700 text-sm">
                <h4 className="font-bold text-white mb-2">Notice:</h4>
                <p className="text-slate-400">Purging objects automatically rewrites the parent <code>index.ts</code> exports tree.</p>
            </div>
        </div>
    );
};
