'use client';
/** StateMachinePanel — FSM visual editor */
import React from 'react';
import { useStateMachine } from '../../hooks/useStateMachine';

const EVENT_PRESETS = ['START', 'ENEMY_SPOTTED', 'IN_RANGE', 'OUT_OF_RANGE', 'LOW_HEALTH', 'SAFE', 'KILLED'];

export function StateMachinePanel() {
  const { currentState, states, transitions, history, send, buildDemo, reset } = useStateMachine();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🔄 State Machine</h3>
        <span className="text-[10px] text-studio-muted">{states.length} states · {transitions.length} transitions</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={buildDemo} className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition">🤖 Demo</button>
        <button onClick={reset} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">↺</button>
      </div>

      {/* States */}
      <div className="flex gap-1 flex-wrap">
        {states.map(s => (
          <span key={s.id} className={`px-2 py-0.5 rounded text-[10px] font-mono ${s.id === currentState ? 'bg-studio-accent text-black font-bold' : 'bg-studio-panel/30 text-studio-muted'}`}>
            {s.id === currentState && '▶ '}{s.id}
          </span>
        ))}
      </div>

      {/* Events */}
      <div className="flex gap-1 flex-wrap">
        {EVENT_PRESETS.map(e => (
          <button key={e} onClick={() => send(e)}
            className="px-1.5 py-0.5 bg-studio-panel/40 text-studio-muted rounded text-[10px] hover:text-studio-text hover:bg-studio-accent/20 transition font-mono">{e}</button>
        ))}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-black/30 rounded-lg p-2 font-mono text-[10px] max-h-[60px] overflow-y-auto">
          {history.map((h, i) => (
            <span key={i} className={`${i === history.length - 1 ? 'text-studio-accent' : 'text-studio-muted'}`}>
              {i > 0 && ' → '}{h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
