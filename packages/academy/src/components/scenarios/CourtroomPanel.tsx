'use client';

/**
 * CourtroomPanel — Digital courtroom evidence management and timeline.
 */

import { useState, useCallback } from 'react';
import {
  Scale,
  Plus,
  Trash2,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Eye,
  Tag,
  ChevronDown,
} from 'lucide-react';

export type EvidenceType = 'document' | 'photo' | 'video' | 'audio' | 'physical' | 'testimony';
export type EvidenceStatus = 'admitted' | 'objected' | 'pending' | 'excluded';

export interface Evidence {
  id: string;
  label: string;
  type: EvidenceType;
  description: string;
  status: EvidenceStatus;
  timestamp: number;
  tags: string[];
  exhibit: string; // e.g., "Exhibit A-1"
}

const STATUS_STYLES: Record<EvidenceStatus, { color: string; icon: typeof CheckCircle }> = {
  admitted: { color: 'text-emerald-400', icon: CheckCircle },
  objected: { color: 'text-red-400', icon: AlertTriangle },
  pending: { color: 'text-amber-400', icon: Clock },
  excluded: { color: 'text-studio-muted', icon: AlertTriangle },
};

const DEMO_EVIDENCE: Evidence[] = [
  {
    id: '1',
    label: 'Security Camera Footage',
    type: 'video',
    description: 'Parking lot footage from 11:32 PM',
    status: 'admitted',
    timestamp: Date.now() - 86400000,
    tags: ['surveillance', 'timeline'],
    exhibit: 'Exhibit A-1',
  },
  {
    id: '2',
    label: 'Fingerprint Analysis',
    type: 'document',
    description: 'Latent prints found on door handle',
    status: 'admitted',
    timestamp: Date.now() - 72000000,
    tags: ['forensic', 'physical'],
    exhibit: 'Exhibit B-1',
  },
  {
    id: '3',
    label: 'Witness Statement — J. Doe',
    type: 'testimony',
    description: 'Eyewitness account of suspect near scene',
    status: 'objected',
    timestamp: Date.now() - 43200000,
    tags: ['witness', 'testimony'],
    exhibit: 'Exhibit C-1',
  },
  {
    id: '4',
    label: 'Cell Tower Records',
    type: 'document',
    description: 'Location data placing defendant at scene',
    status: 'pending',
    timestamp: Date.now() - 14400000,
    tags: ['digital', 'timeline'],
    exhibit: 'Exhibit D-1',
  },
  {
    id: '5',
    label: 'Audio Recording',
    type: 'audio',
    description: '911 call from neighbor at 11:45 PM',
    status: 'admitted',
    timestamp: Date.now() - 7200000,
    tags: ['audio', 'timeline'],
    exhibit: 'Exhibit E-1',
  },
];

export function CourtroomPanel() {
  const [evidence, setEvidence] = useState<Evidence[]>(DEMO_EVIDENCE);
  const [selected, setSelected] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<EvidenceStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<EvidenceType | 'all'>('all');
  const [section, setSection] = useState<'evidence' | 'timeline'>('evidence');

  const updateStatus = useCallback((id: string, status: EvidenceStatus) => {
    setEvidence((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  }, []);

  const filtered = evidence.filter(
    (e) =>
      (filterStatus === 'all' || e.status === filterStatus) &&
      (filterType === 'all' || e.type === filterType)
  );

  const counts: Record<EvidenceStatus, number> = {
    admitted: 0,
    objected: 0,
    pending: 0,
    excluded: 0,
  };
  evidence.forEach((e) => counts[e.status]++);

  const selectedItem = evidence.find((e) => e.id === selected);

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Scale className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold text-studio-text">Courtroom Evidence</span>
        <span className="text-[10px] text-studio-muted">{evidence.length} items</span>
      </div>

      {/* Status Bar */}
      <div className="flex gap-2 border-b border-studio-border px-3 py-1.5">
        {(Object.entries(counts) as [EvidenceStatus, number][]).map(([status, count]) => {
          const S = STATUS_STYLES[status];
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
              className={`flex items-center gap-1 text-[10px] ${filterStatus === status ? S.color : 'text-studio-muted/50'}`}
            >
              <S.icon className="h-3 w-3" />
              {count}
            </button>
          );
        })}
      </div>

      {/* Type Filter */}
      <div className="flex gap-1 border-b border-studio-border px-2 py-1">
        {(['all', 'document', 'photo', 'video', 'audio', 'testimony'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t === 'all' ? 'all' : t)}
            className={`rounded px-1.5 py-0.5 text-[9px] ${filterType === t ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Evidence List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((e) => {
          const S = STATUS_STYLES[e.status];
          return (
            <div
              key={e.id}
              onClick={() => setSelected(e.id)}
              className={`flex items-start gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer transition ${selected === e.id ? 'bg-studio-accent/10' : 'hover:bg-studio-panel/50'}`}
            >
              <S.icon className={`h-3.5 w-3.5 mt-0.5 ${S.color}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-studio-text truncate">{e.label}</div>
                <div className="text-[10px] text-studio-muted truncate">{e.description}</div>
                <div className="flex gap-1 mt-0.5">
                  {e.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-studio-panel px-1 text-[8px] text-studio-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[9px] font-mono text-studio-muted/50">{e.exhibit}</span>
            </div>
          );
        })}
      </div>

      {/* Selected Detail */}
      {selectedItem && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="text-xs font-semibold text-studio-text">
            {selectedItem.exhibit}: {selectedItem.label}
          </div>
          <div className="text-[10px] text-studio-muted mt-1">{selectedItem.description}</div>
          <div className="flex gap-1 mt-2">
            {(['admitted', 'objected', 'pending', 'excluded'] as EvidenceStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(selectedItem.id, s)}
                className={`rounded px-2 py-0.5 text-[9px] ${selectedItem.status === s ? STATUS_STYLES[s].color + ' bg-studio-panel' : 'text-studio-muted/40'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CourtroomPanel;

