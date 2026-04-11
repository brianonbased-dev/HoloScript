import React, { useState, useEffect, _useMemo } from 'react';
import {
  RadioSpectrumEvent,
  mapRadioToVolumetric,
  filterRFI
} from '@/lib/astrophysicsScenario';

const s = {
  panel: {
    background: 'linear-gradient(135deg, #0f172a 0%, #020617 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#e2e8f0',
    fontFamily: "'Space Mono', monospace",
    minHeight: 500,
    maxWidth: 720,
    border: '1px solid rgba(139, 92, 246, 0.3)',
    boxShadow: '0 0 20px rgba(139, 92, 246, 0.1)'
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(139, 92, 246, 0.4)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#a78bfa',
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
  } as React.CSSProperties,
  box: {
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  } as React.CSSProperties
};

export function AstrophysicsRadioLabPanel() {
  const [events, _setEvents] = useState<RadioSpectrumEvent[]>([
    { eventId: 'ev-alpha', rightAscension: 24.5, declination: 12.3, frequencyMHz: 1420.4, fluxDensityJy: 1.2 }, // Neutral Rest
    { eventId: 'ev-beta', rightAscension: 45.1, declination: -30.0, frequencyMHz: 1418.0, fluxDensityJy: 2.8 }, // Redshifted
    { eventId: 'ev-gamma', rightAscension: 110.4, declination: 45.2, frequencyMHz: 1423.5, fluxDensityJy: 4.5 }, // Blueshifted
    { eventId: 'ev-sat', rightAscension: 90.0, declination: 0.0, frequencyMHz: 1420.0, fluxDensityJy: 95.0 }, // RFI interference
  ]);

  const [filteredEvents, setFilteredEvents] = useState<RadioSpectrumEvent[]>([]);
  const [rfiThreshold, setRfiThreshold] = useState<number>(20);

  useEffect(() => {
    setFilteredEvents(filterRFI(events, rfiThreshold));
  }, [events, rfiThreshold]);

  return (
    <div style={s.panel} data-testid="astro-radio-panel">
      <div style={s.header}>
        <span style={s.title}>📡 Radio Interferometry Lab</span>
        <span style={{ fontSize: 12, color: '#34d399' }}>SNN GPU: ACTIVE</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12 }}>RFI WebGPU Filter Threshold: {rfiThreshold} Jy</span>
        <input 
          type="range" min="1" max="100" 
          value={rfiThreshold} 
          onChange={e => setRfiThreshold(Number(e.target.value))} 
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <div style={{...s.box, textAlign: 'center'}}>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#a78bfa' }}>{events.length}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>RAW FITS EVENTS</div>
        </div>
        <div style={{...s.box, textAlign: 'center'}}>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#10b981' }}>{filteredEvents.length}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>CLEAN EVENTS</div>
        </div>
        <div style={{...s.box, textAlign: 'center'}}>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#ef4444' }}>{events.length - filteredEvents.length}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>RFI REJECTED</div>
        </div>
      </div>

      <div style={s.box}>
        <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 10, color: '#a78bfa' }}>SPATIAL VOLUMETRIC MAPPING PREVIEW</div>
        {filteredEvents.map(ev => {
          const mapping = mapRadioToVolumetric(ev);
          return (
            <div key={ev.eventId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dotted rgba(255,255,255,0.1)' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 'bold' }}>Spectrum {ev.frequencyMHz} MHz</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>RA: {ev.rightAscension}° | DEC: {ev.declination}°</div>
              </div>
              <div style={{ 
                width: 20 * mapping.scaleX, height: 10, borderRadius: 5, 
                backgroundColor: mapping.colorHex, 
                boxShadow: `0 0 ${10 * mapping.bloomIntensity}px ${mapping.colorHex}` 
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AstrophysicsRadioLabPanel;
