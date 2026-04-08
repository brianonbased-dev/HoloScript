'use client';

import MonacoEditor from '@monaco-editor/react';
import type { PipelineMarker } from './PipelineWorkbench';

interface PipelineMonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  markers?: PipelineMarker[];
}

export function PipelineMonacoEditor({ value, onChange }: PipelineMonacoEditorProps) {
  return (
    <MonacoEditor
      height="100%"
      language="javascript"
      value={value}
      onChange={(next) => onChange(next ?? '')}
      theme="vs-dark"
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        automaticLayout: true,
      }}
    />
  );
}
