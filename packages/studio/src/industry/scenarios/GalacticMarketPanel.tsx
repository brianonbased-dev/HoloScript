import React, { useState, useEffect } from 'react';
import { MarketTransaction, processMarketTick } from '@/lib/v6PlatformServices';

const s = {
  panel: {
    background: '#192019', border: '1px solid #2d452b', borderRadius: 8, padding: 16,
    color: '#a3d9a5', fontFamily: 'monospace', maxWidth: 600, minHeight: 400
  } as React.CSSProperties,
  header: { fontSize: 16, fontWeight: 800, marginBottom: 16, borderBottom: '1px solid #2d452b', paddingBottom: 8, color: '#4ade80' } as React.CSSProperties,
};

export function GalacticMarketPanel() {
  const [txs, setTxs] = useState<MarketTransaction[]>([
    { txId: '0x1a', amount: 50, type: 'compute_bounty', status: 'escrow' },
    { txId: '0x2b', amount: 120, type: 'asset_sale', status: 'cleared' },
    { txId: '0x3c', amount: 15, type: 'storage_rent', status: 'escrow' },
  ]);

  useEffect(() => {
    const t = setInterval(() => setTxs(prev => processMarketTick(prev)), 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={s.panel} data-testid="market-panel">
      <div style={s.header}>🏦 Galactic Trade Federation</div>
      <table style={{ width: '100%', textAlign: 'left', fontSize: 12 }}>
        <thead>
          <tr style={{ color: '#4ade80' }}><th>TX ID</th><th>TYPE</th><th>AMOUNT</th><th>STATUS</th></tr>
        </thead>
        <tbody>
          {txs.map(tx => (
            <tr key={tx.txId} style={{ background: 'rgba(255,255,255,0.02)' }}>
              <td>{tx.txId}</td>
              <td>{tx.type}</td>
              <td>{tx.amount} X402</td>
              <td style={{ color: tx.status === 'cleared' ? '#4ade80' : '#facc15' }}>{tx.status.toUpperCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default GalacticMarketPanel;
