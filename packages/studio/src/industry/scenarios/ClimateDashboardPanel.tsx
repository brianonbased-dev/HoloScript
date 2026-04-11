/**
 * ClimateDashboardPanel.tsx — Climate Modeling Dashboard
 *
 * GHG tracker, temperature projections, ice sheet monitor,
 * carbon budget countdown — powered by climateModeling.ts engine.
 */

import React, { useState, useMemo } from 'react';
import {
  radiativeForcing,
  temperatureFromForcing,
  co2EquivalentPPM,
  seaLevelRiseFromIce,
  totalIceMassLoss,
  _yearsToMeltCompletely,
  carbonBudgetYears,
  scenarioWarming,
  GHG_DATA,
  ICE_SHEETS,
  type EmissionScenario,
} from '@/lib/climateModeling';

const SCENARIOS: EmissionScenario[] = ['SSP1-1.9', 'SSP1-2.6', 'SSP2-4.5', 'SSP3-7.0', 'SSP5-8.5'];
const SCENARIO_COLORS: Record<EmissionScenario, string> = {
  'SSP1-1.9': '#22c55e',
  'SSP1-2.6': '#84cc16',
  'SSP2-4.5': '#eab308',
  'SSP3-7.0': '#f97316',
  'SSP5-8.5': '#ef4444',
};

const s = {
  panel: {
    background: 'linear-gradient(180deg, #051015 0%, #0a1a25 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#c8e0f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: 600,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(34,197,94,0.15)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #22c55e, #eab308)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(34,197,94,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#22c55e',
    marginBottom: 10,
  } as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginTop: 10,
  } as React.CSSProperties,
  statCard: (c: string) =>
    ({
      padding: 12,
      background: `${c}10`,
      border: `1px solid ${c}30`,
      borderRadius: 6,
      textAlign: 'center' as const,
    }) as React.CSSProperties,
  statValue: { fontSize: 22, fontWeight: 700, color: '#fff' } as React.CSSProperties,
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase' as const,
    color: '#6a8899',
    marginTop: 2,
  } as React.CSSProperties,
  scenarioBtn: (active: boolean, c: string) =>
    ({
      padding: '6px 12px',
      background: active ? `${c}25` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? `${c}60` : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 6,
      color: active ? c : '#889',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
    }) as React.CSSProperties,
  iceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
    marginBottom: 6,
    fontSize: 12,
  } as React.CSSProperties,
  bar: {
    height: 10,
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 6,
  } as React.CSSProperties,
};

export function ClimateDashboardPanel() {
  const [scenario, setScenario] = useState<EmissionScenario>('SSP2-4.5');
  const [budgetGt, setBudgetGt] = useState(500);
  const [annualGt, setAnnualGt] = useState(40);

  const co2 = GHG_DATA.find((g) => g.gas === 'CO2')!;
  const rf = useMemo(() => radiativeForcing(co2.currentPPM, co2.preindustrialPPM), []);
  const tempAnomaly = useMemo(() => temperatureFromForcing(rf), [rf]);
  const co2eq = useMemo(() => co2EquivalentPPM(GHG_DATA), []);
  const totalMassLoss = useMemo(() => totalIceMassLoss(ICE_SHEETS), []);
  const slr = useMemo(() => seaLevelRiseFromIce(totalMassLoss), [totalMassLoss]);
  const budgetYears = useMemo(() => carbonBudgetYears(budgetGt, annualGt), [budgetGt, annualGt]);
  const sw = useMemo(() => scenarioWarming(scenario), [scenario]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🌡️ Climate Dashboard</span>
        <span style={{ fontSize: 12, color: '#22c55e' }}>IPCC AR6 Data</span>
      </div>

      {/* Current State */}
      <div style={s.section}>
        <div style={s.sectionTitle}>📊 Current Climate State</div>
        <div style={s.statsGrid}>
          <div style={s.statCard('#22c55e')}>
            <div style={s.statValue}>{co2.currentPPM}</div>
            <div style={s.statLabel}>CO₂ (ppm)</div>
          </div>
          <div style={s.statCard('#eab308')}>
            <div style={s.statValue}>+{tempAnomaly.toFixed(1)}°C</div>
            <div style={s.statLabel}>Warming</div>
          </div>
          <div style={s.statCard('#ef4444')}>
            <div style={s.statValue}>{rf.toFixed(1)}</div>
            <div style={s.statLabel}>Forcing (W/m²)</div>
          </div>
        </div>
      </div>

      {/* GHG Table */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🏭 Greenhouse Gases</div>
        {GHG_DATA.map((g) => (
          <div key={g.gas} style={s.iceRow}>
            <span style={{ fontWeight: 600, width: 60 }}>{g.gas}</span>
            <span style={{ flex: 1, color: '#889' }}>
              {g.currentPPM} ppm (pre: {g.preindustrialPPM})
            </span>
            <span style={{ color: '#f59e0b' }}>GWP: {g.gwp100}×</span>
            <span style={{ color: '#889', width: 70 }}>{g.atmosphericLifetimeYears}yr</span>
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 12, color: '#889' }}>
          CO₂-equivalent:{' '}
          <span style={{ color: '#fff', fontWeight: 600 }}>
            {Math.round(co2eq).toLocaleString()} ppm
          </span>
        </div>
      </div>

      {/* SSP Scenarios */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🔮 Emission Scenarios (SSP)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {SCENARIOS.map((sc) => (
            <button
              key={sc}
              style={s.scenarioBtn(sc === scenario, SCENARIO_COLORS[sc])}
              onClick={() => setScenario(sc)}
            >
              {sc}
            </button>
          ))}
        </div>
        <div
          style={{
            padding: 12,
            background: `${SCENARIO_COLORS[scenario]}08`,
            border: `1px solid ${SCENARIO_COLORS[scenario]}25`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: SCENARIO_COLORS[scenario] }}>
            +{sw.min}°C to +{sw.max}°C
          </div>
          <div style={{ fontSize: 12, color: '#889', marginTop: 4 }}>{sw.label}</div>
        </div>
      </div>

      {/* Ice Sheets */}
      <div style={s.section}>
        <div style={s.sectionTitle}>🧊 Ice Sheets</div>
        {ICE_SHEETS.map((ice) => (
          <div key={ice.id} style={s.iceRow}>
            <span style={{ fontWeight: 600, flex: 1 }}>{ice.name}</span>
            <span style={{ color: '#ef4444' }}>-{ice.massLossGtPerYear} Gt/yr</span>
            <span style={{ color: '#06b6d4', width: 80 }}>
              SLR:{' '}
              {ice.seaLevelContributionMm >= 1000
                ? `${(ice.seaLevelContributionMm / 1000).toFixed(1)}m`
                : `${ice.seaLevelContributionMm}mm`}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 12 }}>
          Total loss:{' '}
          <span style={{ color: '#ef4444', fontWeight: 600 }}>{totalMassLoss} Gt/yr</span>→{' '}
          <span style={{ color: '#06b6d4', fontWeight: 600 }}>{slr.toFixed(1)} mm/yr</span> sea
          level rise
        </div>
      </div>

      {/* Carbon Budget */}
      <div style={s.section}>
        <div style={s.sectionTitle}>⏱️ Carbon Budget Countdown</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 10 }}>
          <label>
            Budget (Gt):{' '}
            <input
              type="number"
              value={budgetGt}
              onChange={(e) => setBudgetGt(+e.target.value)}
              style={{
                width: 70,
                padding: '4px 6px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 4,
                color: '#c8e0f0',
                textAlign: 'right',
              }}
            />
          </label>
          <label>
            Annual (Gt):{' '}
            <input
              type="number"
              value={annualGt}
              onChange={(e) => setAnnualGt(+e.target.value)}
              style={{
                width: 70,
                padding: '4px 6px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 4,
                color: '#c8e0f0',
                textAlign: 'right',
              }}
            />
          </label>
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: budgetYears < 10 ? '#ef4444' : budgetYears < 20 ? '#eab308' : '#22c55e',
          }}
        >
          {budgetYears === Infinity ? '∞' : budgetYears.toFixed(1)} years
        </div>
        <div style={s.bar}>
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (budgetYears / 30) * 100)}%`,
              background: budgetYears < 10 ? '#ef4444' : budgetYears < 20 ? '#eab308' : '#22c55e',
              borderRadius: 5,
              transition: 'width 0.3s',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: '#889', marginTop: 4 }}>
          At {annualGt} Gt CO₂/year, {budgetGt} Gt budget exhausted by ~
          {2026 + Math.round(budgetYears)}
        </div>
      </div>
    </div>
  );
}

export default ClimateDashboardPanel;
