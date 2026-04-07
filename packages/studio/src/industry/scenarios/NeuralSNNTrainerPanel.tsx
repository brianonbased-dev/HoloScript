import React, { useState, useEffect } from 'react';
import { Neuron, stepSNN } from '@/lib/v6PlatformServices';

const s = {
  panel: {
    background: '#1a1025', border: '1px solid #5a2e8c', borderRadius: 8, padding: 16,
    color: '#e6ccff', fontFamily: 'monospace', maxWidth: 600, minHeight: 400
  } as React.CSSProperties,
  header: { fontSize: 16, fontWeight: 800, marginBottom: 16, borderBottom: '1px solid #5a2e8c', paddingBottom: 8 } as React.CSSProperties,
};

export function NeuralSNNTrainerPanel() {
  const [neurons, setNeurons] = useState<Neuron[]>(
    Array.from({length: 12}).map((_, i) => ({ id: i, voltage: 0, threshold: 1.0, fired: false }))
  );

  useEffect(() => {
    const t = setInterval(() => setNeurons(prev => stepSNN(prev, 0.4)), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={s.panel} data-testid="snn-panel">
      <div style={s.header}>🧠 Spiking Neural Net (WebGPU)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {neurons.map(n => (
          <div key={n.id} style={{
            height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: n.fired ? '#b366ff' : `rgba(179, 102, 255, ${n.voltage})`,
            transition: 'background 0.2s'
          }}>
            {n.fired ? '⚡' : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default NeuralSNNTrainerPanel;
