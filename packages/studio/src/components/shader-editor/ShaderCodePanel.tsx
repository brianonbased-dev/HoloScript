/**
 * Shader Code Panel Component
 *
 * Bottom panel showing generated WGSL code with syntax highlighting
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-rust'; // Closest to WGSL
import { useShaderCompilation } from '../../hooks/useShaderCompilation';
import { Copy, Check, Code, AlertTriangle } from 'lucide-react';

export function ShaderCodePanel() {
  const { compiled, isCompiling, lastCompileTime } = useShaderCompilation();
  const [activeTab, setActiveTab] = useState<'vertex' | 'fragment'>('fragment');
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const code = activeTab === 'vertex' ? compiled?.vertexCode : compiled?.fragmentCode;

  // Syntax highlighting
  useEffect(() => {
    if (codeRef.current && code) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, activeTab]);

  const handleCopy = async () => {
    if (code) {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="shader-code-panel bg-gray-900 border-t border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Code size={16} className="text-blue-500" />
            <span className="text-sm font-medium text-white">Generated Code</span>
          </div>

          <div className="flex gap-1">
            <button
              className={`px-3 py-1 text-xs rounded transition-colors ${
                activeTab === 'vertex'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              onClick={() => setActiveTab('vertex')}
            >
              Vertex
            </button>
            <button
              className={`px-3 py-1 text-xs rounded transition-colors ${
                activeTab === 'fragment'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              onClick={() => setActiveTab('fragment')}
            >
              Fragment
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Compilation Status */}
          <div className="flex items-center gap-2 text-xs">
            {isCompiling ? (
              <span className="text-yellow-500">Compiling...</span>
            ) : compiled?.errors.length ? (
              <span className="flex items-center gap-1 text-red-500">
                <AlertTriangle size={14} />
                {compiled.errors.length} error(s)
              </span>
            ) : (
              <span className="text-green-500">
                Compiled in {lastCompileTime.toFixed(1)}ms
              </span>
            )}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} />
                Copied
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Display */}
      <div className="flex-1 overflow-auto">
        {compiled?.errors.length ? (
          <div className="p-4">
            <div className="bg-red-900/20 border border-red-800 rounded p-3">
              <div className="font-medium text-red-400 mb-2">Compilation Errors:</div>
              {compiled.errors.map((error, i) => (
                <div key={i} className="text-sm text-red-300 mb-1">
                  {error}
                </div>
              ))}
            </div>
          </div>
        ) : code ? (
          <pre className="m-0 p-4 text-xs">
            <code ref={codeRef} className="language-rust">
              {code}
            </code>
          </pre>
        ) : (
          <div className="p-4 text-center text-gray-500">
            <p className="text-sm">No code generated yet</p>
            <p className="text-xs mt-2">Add nodes to your shader graph to see the compiled code</p>
          </div>
        )}

        {/* Warnings */}
        {compiled?.warnings.length ? (
          <div className="mx-4 mb-4 bg-yellow-900/20 border border-yellow-800 rounded p-3">
            <div className="font-medium text-yellow-400 mb-2">Warnings:</div>
            {compiled.warnings.map((warning, i) => (
              <div key={i} className="text-sm text-yellow-300 mb-1">
                {warning}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Footer with Stats */}
      {code && (
        <div className="px-4 py-2 border-t border-gray-700 bg-gray-800 text-xs text-gray-400 flex items-center justify-between">
          <div>
            Lines: {code.split('\n').length} | Characters: {code.length}
          </div>
          {compiled && (
            <div>
              Uniforms: {compiled.uniforms.length} | Textures: {compiled.textures.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
