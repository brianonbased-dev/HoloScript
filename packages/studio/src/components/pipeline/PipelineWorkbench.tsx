'use client';

import { useState } from 'react';
import { DEFAULT_PIPELINE_SOURCE, PIPELINE_EXAMPLES } from './pipelineExamples';
import { PipelineMonacoEditor } from './PipelineMonacoEditor';

export interface PipelineMarker {
  message: string;
  line?: number;
}

type Action = 'parse' | 'compile';

interface ErrorItem {
  message: string;
  line?: number;
}

interface SuccessParse {
  success: true;
  action: 'parse';
  pipeline: unknown;
}

interface SuccessCompile {
  success: true;
  action: 'compile';
  code: string;
}

interface Failure {
  success: false;
  errors: ErrorItem[];
}

type PlaygroundResponse = SuccessParse | SuccessCompile | Failure;

export function PipelineWorkbench() {
  const [source, setSource] = useState(DEFAULT_PIPELINE_SOURCE);
  const [output, setOutput] = useState('// Parse or compile to see output');
  const [busy, setBusy] = useState<Action | null>(null);

  async function run(action: Action) {
    setBusy(action);
    try {
      const res = await fetch('/api/pipeline/playground', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, code: source }),
      });
      const json = (await res.json()) as PlaygroundResponse;
      if (!json.success) {
        setOutput(json.errors.map((e) => e.message).join('\n'));
        return;
      }

      if (json.action === 'parse') {
        setOutput(JSON.stringify(json.pipeline, null, 2));
      } else {
        setOutput(json.code);
      }
    } catch (error) {
      setOutput(error instanceof Error ? error.message : 'Unknown pipeline error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <aside className="w-72 shrink-0 border-r border-gray-800 p-4 space-y-2">
        <h1 className="text-xl font-semibold">Pipeline Editor</h1>
        <p className="text-sm text-gray-400">First Studio route generated from .holo.</p>
        {PIPELINE_EXAMPLES.map((example) => (
          <button
            key={example.name}
            type="button"
            onClick={() => setSource(example.source)}
            className="block w-full rounded border border-gray-700 px-3 py-2 text-left text-sm hover:bg-gray-900"
          >
            {example.name}
          </button>
        ))}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-gray-800 p-3 flex gap-2">
          <button
            type="button"
            onClick={() => void run('parse')}
            disabled={busy !== null}
            className="rounded border border-gray-700 px-3 py-2 text-sm hover:bg-gray-900 disabled:opacity-50"
          >
            {busy === 'parse' ? 'Parsing...' : 'Parse'}
          </button>
          <button
            type="button"
            onClick={() => void run('compile')}
            disabled={busy !== null}
            className="rounded bg-indigo-500 px-3 py-2 text-sm text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {busy === 'compile' ? 'Compiling...' : 'Compile to Node.js'}
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2">
          <div className="border-r border-gray-800 min-h-0">
            <PipelineMonacoEditor value={source} onChange={setSource} />
          </div>
          <pre className="p-4 text-xs font-mono overflow-auto min-h-0">{output}</pre>
        </div>
      </main>
    </div>
  );
}
