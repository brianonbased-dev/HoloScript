'use client';

/**
 * PlatformPicker — Select compile target with capability highlights
 */

import React from 'react';
import { usePlatformTargets, type PlatformInfo } from '../../hooks/usePlatformTargets';

type XRPlatformCategory = string;
type XRPlatformTarget = string;

// ═══════════════════════════════════════════════════════════════════

interface PlatformPickerProps {
  onSelect?: (target: XRPlatformTarget) => void;
  initial?: XRPlatformTarget;
  /** Show only these categories */
  categories?: XRPlatformCategory[];
}

const CATEGORY_ICONS: Record<string, string> = {
  vr: '🥽',
  ar: '👓',
  mobile: '📱',
  desktop: '🖥️',
  automotive: '🚗',
  wearable: '⌚',
};

const COMPUTE_COLORS: Record<string, string> = {
  'edge-first': '#10b981',
  'cloud-first': '#6366f1',
  'safety-critical': '#ef4444',
};

function CapBadge({ has, label }: { has: boolean; label: string }) {
  return (
    <span
      style={{
        ...styles.capBadge,
        background: has ? '#10b98120' : '#ffffff08',
        color: has ? '#10b981' : '#555',
      }}
    >
      {has ? '✓' : '—'} {label}
    </span>
  );
}

export function PlatformPicker({
  onSelect,
  initial = 'quest3',
  categories: filterCats,
}: PlatformPickerProps) {
  const { selected, selectedInfo, select, grouped, categories } = usePlatformTargets(initial);

  const handleSelect = (target: XRPlatformTarget) => {
    select(target);
    onSelect?.(target);
  };

  const visibleCats = (filterCats || categories) as string[];
  const groupedByCat = grouped as Record<string, PlatformInfo[]>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>🎯 Platform Target</div>

      {/* Selected Info */}
      <div style={styles.selectedBox}>
        <div style={styles.selectedName}>
          {CATEGORY_ICONS[String(selectedInfo.category)]} {String(selected)}
        </div>
        <div style={styles.selectedMeta}>
          <span style={{ color: COMPUTE_COLORS[selectedInfo.capabilities.computeModel] || '#aaa' }}>
            {selectedInfo.capabilities.computeModel}
          </span>
          <span>· {selectedInfo.agentBudgetMs}ms agent budget</span>
          <span>· {selectedInfo.capabilities.frameBudgetMs}ms frame</span>
          <span>· {selectedInfo.embodiment}</span>
        </div>
        <div style={styles.capRow}>
          <CapBadge has={selectedInfo.capabilities.spatialTracking} label="Spatial" />
          <CapBadge has={selectedInfo.capabilities.handTracking} label="Hands" />
          <CapBadge has={selectedInfo.capabilities.eyeTracking} label="Eyes" />
          <CapBadge has={selectedInfo.capabilities.npu} label="NPU" />
          <CapBadge has={selectedInfo.capabilities.gps} label="GPS" />
          <CapBadge has={selectedInfo.capabilities.gpu3D} label="GPU" />
        </div>
      </div>

      {/* Category Groups */}
      {visibleCats.map((cat: string) => (
        <div key={String(cat)} style={styles.group}>
          <div style={styles.groupTitle}>
            {CATEGORY_ICONS[cat as XRPlatformCategory]} {String(cat).toUpperCase()}
          </div>
          <div style={styles.targetList}>
            {groupedByCat[cat]?.map((info: PlatformInfo) => (
              <button
                key={String(info.target)}
                style={String(info.target) === String(selected) ? styles.targetActive : styles.target}
                onClick={() => handleSelect(String(info.target) as XRPlatformTarget)}
              >
                {String(info.target)}
                <span style={styles.targetBudget}>{info.agentBudgetMs}ms</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 12,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    color: '#e0e0e0',
    background: '#1a1a2e',
    borderRadius: 8,
    border: '1px solid #2a2a4a',
  },
  header: { fontWeight: 700, fontSize: 14, marginBottom: 12 },
  selectedBox: {
    padding: 10,
    background: '#1e1e3a',
    borderRadius: 6,
    border: '1px solid #4040aa',
    marginBottom: 12,
  },
  selectedName: { fontWeight: 700, fontSize: 16, marginBottom: 4 },
  selectedMeta: {
    fontSize: 11,
    color: '#aaa',
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
    marginBottom: 8,
  },
  capRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  capBadge: { padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600 },
  group: { marginBottom: 10 },
  groupTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#8080cc',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  targetList: { display: 'flex', flexWrap: 'wrap' as const, gap: 4 },
  target: {
    padding: '4px 10px',
    background: '#2a2a4a',
    border: '1px solid #3a3a5a',
    borderRadius: 4,
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  targetActive: {
    padding: '4px 10px',
    background: '#4040aa',
    border: '1px solid #6060cc',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  targetBudget: { fontSize: 9, color: '#888' },
};
