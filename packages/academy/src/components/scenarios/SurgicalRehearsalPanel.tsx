/**
 * SurgicalRehearsalPanel.tsx — Surgical Rehearsal Theater
 * Powered by surgicalRehearsal.ts
 */
import React, { useState, useMemo } from 'react';
import {
  estimateProcedureDuration,
  bloodLossRisk,
  toolsRequired,
  anesthesiaCheck,
  overallRiskLevel,
  type AnesthesiaConfig,
} from '@/lib/surgicalRehearsal';

const RISK_COLORS = { low: '#22c55e', moderate: '#f59e0b', high: '#ef4444', critical: '#dc2626' };

const s = {
  panel: {
    background: 'linear-gradient(180deg, #0a1218 0%, #0f1a22 100%)',
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
    borderBottom: '1px solid rgba(6,182,212,0.15)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #06b6d4, #22c55e)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    border: '1px solid rgba(6,182,212,0.08)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#06b6d4',
    marginBottom: 10,
  } as React.CSSProperties,
};

/** Display-level step shape used within this panel. */
interface DisplayStep {
  id: string;
  name: string;
  durationMin: number;
  tools: string[];
  critical: boolean;
  description: string;
}

interface DisplayProcedure {
  id: string;
  name: string;
  type: string;
  bodyRegion: string;
  steps: DisplayStep[];
  estimatedDurationMin: number;
  riskLevel: string;
}

interface DisplayPatient {
  id: string;
  age: number;
  weight: number;
  height: number;
  bmi: number;
  allergies: string[];
  bloodType: string;
  conditions: string[];
  asaScore: number;
}

export function SurgicalRehearsalPanel() {
  const procedure: DisplayProcedure = {
    id: 'proc1',
    name: 'Laparoscopic Cholecystectomy',
    type: 'laparoscopic',
    bodyRegion: 'abdomen',
    steps: [
      {
        id: 's1',
        name: 'Trocar Placement',
        durationMin: 10,
        tools: ['trocar', 'scalpel'],
        critical: false,
        description: 'Insert ports',
      },
      {
        id: 's2',
        name: 'Dissection',
        durationMin: 25,
        tools: ['grasper', 'electrocautery'],
        critical: true,
        description: "Calot's triangle",
      },
      {
        id: 's3',
        name: 'Clip & Cut',
        durationMin: 15,
        tools: ['clip-applier', 'scissors'],
        critical: true,
        description: 'Cystic duct and artery',
      },
      {
        id: 's4',
        name: 'Extraction',
        durationMin: 10,
        tools: ['retrieval-bag'],
        critical: false,
        description: 'Remove gallbladder',
      },
      {
        id: 's5',
        name: 'Closure',
        durationMin: 10,
        tools: ['suture'],
        critical: false,
        description: 'Close port sites',
      },
    ],
    estimatedDurationMin: 70,
    riskLevel: 'moderate',
  };

  const patient: DisplayPatient = {
    id: 'pat1',
    age: 55,
    weight: 82,
    height: 170,
    bmi: 28.4,
    allergies: ['Penicillin'],
    bloodType: 'A+',
    conditions: ['hypertension'],
    asaScore: 2,
  };
  const config: AnesthesiaConfig = {
    type: 'general',
    agentName: 'Sevoflurane',
    dosePerKg: 2.5,
    durationMin: 80,
    monitoringLevel: 'standard',
  };

  const procedureSteps = useMemo(
    () =>
      procedure.steps.map((s, i) => ({
        id: s.id,
        order: i + 1,
        name: s.name,
        description: s.description,
        instrumentRequired: (s.tools[0] ?? 'scalpel') as import('@/lib/surgicalRehearsal').InstrumentType,
        targetLandmark: '',
        durationMinutes: s.durationMin,
        riskLevel: (s.critical ? 'high' : 'low') as 'low' | 'moderate' | 'high' | 'critical',
        completed: false,
      })),
    [procedure.steps]
  );
  const duration = useMemo(() => estimateProcedureDuration(procedureSteps), [procedureSteps]);
  const risk = useMemo(() => overallRiskLevel(procedureSteps, patient), [procedureSteps, patient]);
  const bloodRisk = useMemo(() => bloodLossRisk(procedureSteps, patient), [procedureSteps, patient]);
  const tools = useMemo(() => toolsRequired(procedureSteps), [procedureSteps]);
  const anesOk = useMemo(() => anesthesiaCheck(config, patient), [config, patient]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🏥 Surgical Rehearsal</span>
        <span style={{ fontSize: 12, color: RISK_COLORS[risk], fontWeight: 700 }}>
          {risk.toUpperCase()} RISK
        </span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📋 Procedure: {procedure.name}</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 10,
          }}
        >
          {[
            ['Duration', `${duration} min`, '#06b6d4'],
            ['Blood Risk', bloodRisk.toUpperCase(), '#ef4444'],
            ['Tools', `${tools.length}`, '#a78bfa'],
          ].map(([l, v, c]) => (
            <div
              key={l as string}
              style={{
                padding: 10,
                textAlign: 'center',
                background: `${c}08`,
                border: `1px solid ${c}20`,
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#889' }}>{l as string}</div>
            </div>
          ))}
        </div>
        {procedure.steps.map((step: DisplayStep) => (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 6,
              marginBottom: 4,
              fontSize: 12,
              borderLeft: `3px solid ${step.critical ? '#ef4444' : '#22c55e'}`,
            }}
          >
            <span style={{ fontWeight: 600, width: 120 }}>{step.name}</span>
            <span style={{ flex: 1, color: '#667' }}>{step.description}</span>
            <span style={{ color: '#889' }}>{step.durationMin}min</span>
            {step.critical && (
              <span
                style={{
                  padding: '1px 6px',
                  background: 'rgba(239,68,68,0.15)',
                  borderRadius: 8,
                  fontSize: 10,
                  color: '#ef4444',
                }}
              >
                CRITICAL
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>👤 Patient</div>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 11 }}
        >
          {[
            ['Age', patient.age],
            ['BMI', patient.bmi.toFixed(1)],
            ['ASA', patient.asaScore],
            ['Blood', patient.bloodType],
          ].map(([l, v]) => (
            <div
              key={l as string}
              style={{
                textAlign: 'center',
                padding: 6,
                background: 'rgba(6,182,212,0.05)',
                borderRadius: 4,
              }}
            >
              <div style={{ fontWeight: 700, color: '#06b6d4' }}>{v}</div>
              <div style={{ color: '#667', fontSize: 10 }}>{l as string}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#889' }}>
          Allergies: <span style={{ color: '#ef4444' }}>{patient.allergies.join(', ')}</span> ·
          Conditions: {patient.conditions.join(', ')}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>💉 Anesthesia</div>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: '#06b6d4', fontWeight: 600 }}>{config.agentName}</span> ·{' '}
          {config.type} · {config.dosePerKg}mg/kg · {config.durationMin}min
          <div style={{ marginTop: 4, color: anesOk ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
            {anesOk ? '✅ Cleared' : '⚠️ Warning: Review protocol'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SurgicalRehearsalPanel;
