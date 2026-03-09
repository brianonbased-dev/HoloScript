'use client';

/**
 * /playground — standalone embeddable HoloScript sandbox.
 *
 * No auth, no login required. Monaco editor on the left,
 * live parse output on the right. URL-shareable via ?code=<base64>.
 *
 * Embed anywhere:
 *   <iframe src="https://your-studio/playground" allow="clipboard-write" />
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Play, Copy, CheckCircle, ExternalLink, Globe, Code2, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const STARTER = `// HoloScript Playground
// Edit this code — the parse tree updates in real time.

scene "Hello World" {
  object "Cube" {
    @mesh(geometry: "box")
    @material(color: "#6366f1")
    @transform(position: [0, 0, 0])
    @physics(type: "rigid", mass: 1.0)
  }

  object "Sun Light" {
    @light(type: "directional", intensity: 2.0)
    @transform(position: [5, 10, 5])
  }
}
`;

interface ParseNode {
  type: string;
  name?: string;
  children?: ParseNode[];
  trait?: string;
  props?: Record<string, unknown>;
}

/** Ultra-lightweight client-side regex parser for display purposes */
function quickParse(code: string): { ok: boolean; nodes: ParseNode[]; error?: string } {
  try {
    const nodes: ParseNode[] = [];
    const lines = code.split('\n');
    const stack: ParseNode[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      const sceneMatch = trimmed.match(/^scene\s+"([^"]+)"/);
      const objectMatch = trimmed.match(/^object\s+"([^"]+)"/);
      const traitMatch = trimmed.match(/^@(\w+)\(([^)]*)\)/);

      if (sceneMatch) {
        const node: ParseNode = { type: 'scene', name: sceneMatch[1], children: [] };
        nodes.push(node);
        stack.push(node);
      } else if (objectMatch) {
        const node: ParseNode = { type: 'object', name: objectMatch[1], children: [] };
        const parent = stack[stack.length - 1];
        if (parent?.children) parent.children.push(node);
        else nodes.push(node);
        stack.push(node);
      } else if (traitMatch) {
        const trait: ParseNode = { type: 'trait', trait: traitMatch[1] };
        const parent = stack[stack.length - 1];
        if (parent?.children) parent.children.push(trait);
      } else if (trimmed === '}') {
        stack.pop();
      }
    }

    return { ok: true, nodes };
  } catch (e) {
    return { ok: false, nodes: [], error: String(e) };
  }
}

function ParseTreeNode({ node, depth = 0 }: { node: ParseNode; depth?: number }) {
  const indent = depth * 12;
  const icons: Record<string, string> = { scene: '🌐', object: '📦', trait: '⚙️' };

  return (
    <div style={{ paddingLeft: indent }}>
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="text-[11px]">{icons[node.type] ?? '·'}</span>
        <span
          className={`text-[11px] font-mono ${
            node.type === 'scene'
              ? 'text-studio-accent font-semibold'
              : node.type === 'object'
                ? 'text-blue-400'
                : 'text-green-400'
          }`}
        >
          {node.type === 'trait' ? `@${node.trait}` : (node.name ?? node.type)}
        </span>
        <span className="text-[9px] text-studio-muted">{node.type}</span>
      </div>
      {node.children?.map((child, i) => (
        <ParseTreeNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function PlaygroundPage() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => {
    const enc = searchParams.get('code');
    if (enc) {
      try {
        return atob(enc);
      } catch {
        return STARTER;
      }
    }
    return STARTER;
  });

  const [parseResult, setParseResult] = useState(() => quickParse(STARTER));
  const [copied, setCopied] = useState(false);

  // Re-parse on code change (debounced 300ms)
  useEffect(() => {
    const t = setTimeout(() => setParseResult(quickParse(code)), 300);
    return () => clearTimeout(t);
  }, [code]);

  const shareUrl = useCallback(() => {
    const encoded = btoa(code);
    return `${window.location.origin}/playground?code=${encoded}`;
  }, [code]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareUrl]);

  const lineCount = code.split('\n').length;
  const charCount = code.length;

  return (
    <div className="flex h-screen flex-col bg-[#0a0a12] text-studio-text">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-2 sm:gap-3 border-b border-studio-border bg-studio-panel/80 px-2 sm:px-4 py-2.5 backdrop-blur">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-studio-muted hover:text-studio-text transition"
        >
          <Globe className="h-4 w-4 text-studio-accent" />
          <span className="text-xs font-bold hidden sm:inline">HoloScript</span>
        </Link>
        <span className="text-studio-border hidden sm:inline">/</span>
        <div className="flex items-center gap-1.5">
          <Code2 className="h-3.5 w-3.5 text-studio-accent" />
          <span className="text-xs font-semibold">Playground</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="text-[10px] text-studio-muted hidden sm:inline">
            {lineCount} lines · {charCount} chars
          </span>
          <button
            onClick={copyLink}
            title="Copy shareable link"
            className="studio-header-btn flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] text-studio-muted transition hover:text-studio-text"
          >
            {copied ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied!' : 'Share'}
          </button>
          <Link
            href={`/create?scene=${encodeURIComponent(btoa(code))}`}
            className="studio-header-btn flex items-center gap-1.5 rounded-lg bg-studio-accent px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open in Studio</span>
            <span className="sm:hidden">Studio</span>
          </Link>
        </div>
      </header>

      {/* Editor + parse tree — stacks vertically on mobile */}
      <div className="flex flex-1 flex-col sm:flex-row overflow-hidden">
        {/* Monaco editor */}
        <div className="flex-1 min-h-0 overflow-hidden border-b sm:border-b-0 sm:border-r border-studio-border">
          <MonacoEditor
            height="100%"
            defaultLanguage="holo"
            value={code}
            onChange={(val) => setCode(val ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 13,
              lineHeight: 20,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
              fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
              wordWrap: 'on',
            }}
          />
        </div>

        {/* Parse tree panel — bottom on mobile, right column on desktop */}
        <div className="flex w-full sm:w-72 shrink-0 flex-col bg-studio-panel max-h-[40vh] sm:max-h-none">
          <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
            <Play className="h-3.5 w-3.5 text-studio-accent" />
            <span className="text-[11px] font-semibold">Parse Tree</span>
            <div
              className={`ml-auto h-2 w-2 rounded-full ${parseResult.ok ? 'bg-green-400' : 'bg-red-400'}`}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {parseResult.error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-2 text-[11px] text-red-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{parseResult.error}</span>
              </div>
            )}

            {parseResult.nodes.length === 0 && !parseResult.error && (
              <p className="text-center text-[11px] text-studio-muted py-6">
                Type some HoloScript to see the parse tree.
              </p>
            )}

            {parseResult.nodes.map((node, i) => (
              <ParseTreeNode key={i} node={node} />
            ))}
          </div>

          {/* Footer info */}
          <div className="shrink-0 border-t border-studio-border px-3 py-2 text-[10px] text-studio-muted">
            Lightweight preview parser — full parse in Studio
          </div>
        </div>
      </div>
    </div>
  );
}
