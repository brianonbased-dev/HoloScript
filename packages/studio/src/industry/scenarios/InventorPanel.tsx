import React, { useState, useMemo } from 'react';
import {
  BlueprintComplexity,
  PrototypeComponent,
  calculateTotalCost,
  estimateBuildTimeDays,
  simulatePhysicsStressTest,
} from '@/lib/inventorScenario';

const s = {
  panel: {
    background: 'linear-gradient(180deg, #111827 0%, #1f2937 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#e5e7eb',
    fontFamily: "'Inter', sans-serif",
    minHeight: 500,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    border: '1px solid rgba(245, 158, 11, 0.1)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#fbbf24',
    marginBottom: 10,
  } as React.CSSProperties,
};

export function InventorPanel() {
  const [complexity] = useState<BlueprintComplexity>('experimental');
  const [maxLoad] = useState<number>(500); // kg
  
  const components: PrototypeComponent[] = useMemo(() => [
    { id: 'c1', name: 'Titanium Chassis', material: 'Titanium', weightKg: 45, cost: 1200 },
    { id: 'c2', name: 'Servo Motors', material: 'Copper/Steel', weightKg: 12, cost: 450 },
    { id: 'c3', name: 'IoT Control Unit', material: 'Silicon/Plastic', weightKg: 2, cost: 850 },
    { id: 'c4', name: 'Carbon Fiber Shell', material: 'Carbon Fiber', weightKg: 8, cost: 600 },
  ], []);

  const totalCost = useMemo(() => calculateTotalCost(components), [components]);
  const buildDays = useMemo(() => estimateBuildTimeDays(complexity, components.length), [complexity, components.length]);
  const stressTest = useMemo(() => simulatePhysicsStressTest(components, maxLoad), [components, maxLoad]);

  return (
    <div style={s.panel} data-testid="inventor-panel">
      <div style={s.header}>
        <span style={s.title}>🛠️ Inventor & Hardware Engineering</span>
        <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>
          COMPLEXITY: {complexity.toUpperCase()}
        </span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>⚙️ Blueprint Analysis</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={{ padding: 10, background: 'rgba(245, 158, 11, 0.05)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#fbbf24', fontWeight: 'bold' }}>{components.length}</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>Components</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(52, 211, 153, 0.05)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#34d399', fontWeight: 'bold' }}>${totalCost}</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>Estimated Cost</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(96, 165, 250, 0.05)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#60a5fa', fontWeight: 'bold' }}>{buildDays}d</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>Assembly Time</div>
          </div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📦 Bill of Materials (BOM)</div>
        {components.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', marginBottom: 4, borderRadius: 4, fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>{c.name}</span>
            <span style={{ color: '#9ca3af' }}>{c.material}</span>
            <span style={{ color: '#60a5fa' }}>{c.weightKg}kg</span>
            <span style={{ color: '#34d399' }}>${c.cost}</span>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🔬 Physics Stress Test (Max Load: {maxLoad}kg)</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Structural Integrity:</span>
          <span style={{ fontWeight: 'bold', color: stressTest.passed ? '#34d399' : '#ef4444' }}>
            {stressTest.passed ? 'PASSED ✅' : 'FAILED ❌'} (Stress: {stressTest.stressFactor.toFixed(2)})
          </span>
        </div>
      </div>
    </div>
  );
}

export default InventorPanel;
