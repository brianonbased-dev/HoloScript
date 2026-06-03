'use client';

// Bundle Monaco's stylesheet so the editor is styled even when the CDN copy of
// editor.main.css fails (jsdelivr 503 → unstyled white box; task_1780459294924_2too).
import 'monaco-editor/min/vs/editor/editor.main.css';
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
