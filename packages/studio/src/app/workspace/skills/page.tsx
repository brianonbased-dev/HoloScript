'use client';

/**
 * Skill Builder — /workspace/skills
 *
 * Visual editor for building AI skills:
 * - SKILL.md editor with YAML frontmatter
 * - File tree for skill package management
 * - Live preview of how the skill renders
 * - Test harness: run skill against sample prompts
 * - Package + sign + publish to marketplace
 */

import { useState, useCallback } from 'react';
import {
  Brain,
  FileText,
  Play,
  Upload,
  Save,
  Plus,
  Trash2,
  Eye,
  Code,
  Terminal,
  ChevronRight,
  FolderOpen,
  File,
  Sparkles,
  Shield,
  Globe,
  Zap,
  Check,
  X,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { ANIM_NAVIGATE } from '@/lib/ui-timings';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SkillFile {
  path: string;
  content: string;
  mimeType: string;
}

type SkillCategory =
  | 'agent_framework'
  | 'workflow'
  | 'rbac_policy'
  | 'orchestration'
  | 'mcp_bundle'
  | 'ecosystem_script'
  | 'decision_template'
  | 'prompt_template'
  | 'code_generator';

type TargetPlatform = 'claude' | 'gemini' | 'openai' | 'universal';

interface SkillMeta {
  name: string;
  description: string;
  category: SkillCategory;
  targetPlatform: TargetPlatform;
  version: string;
  keywords: string[];
  pricingModel: 'free' | 'one_time' | 'subscription';
  price: number;
  permissions: string[];
}

interface TestResult {
  prompt: string;
  output: string;
  duration: number;
  status: 'success' | 'error';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: {
  value: SkillCategory;
  label: string;
  icon: typeof Brain;
  color: string;
}[] = [
  { value: 'workflow', label: 'Workflow', icon: Zap, color: 'text-amber-400' },
  { value: 'agent_framework', label: 'Agent Framework', icon: Brain, color: 'text-violet-400' },
  { value: 'rbac_policy', label: 'RBAC Policy', icon: Shield, color: 'text-blue-400' },
  { value: 'mcp_bundle', label: 'MCP Bundle', icon: Globe, color: 'text-emerald-400' },
  { value: 'prompt_template', label: 'Prompt Template', icon: Sparkles, color: 'text-rose-400' },
  { value: 'orchestration', label: 'Orchestration', icon: Terminal, color: 'text-cyan-400' },
  { value: 'ecosystem_script', label: 'Ecosystem Script', icon: Code, color: 'text-orange-400' },
  {
    value: 'decision_template',
    label: 'Decision Template',
    icon: FileText,
    color: 'text-teal-400',
  },
  { value: 'code_generator', label: 'Code Generator', icon: Code, color: 'text-indigo-400' },
];

const DEFAULT_SKILL_MD = `---
name: my-skill
description: A brief description of what this skill does
---

# My Skill

## Overview
Describe the purpose and capabilities of this skill.

## Instructions
Step-by-step instructions for the AI to follow:

1. First, understand the user's request
2. Then, analyze the context
3. Finally, generate the output

## Examples

### Example 1
**Input:** "Create a component"
**Expected Output:** Generated component code

## Notes
- Any additional notes or considerations
`;

// ─── File Tree Component ─────────────────────────────────────────────────────

function FileTree({
  files,
  selectedFile,
  onSelect,
  onAdd,
  onDelete,
}: {
  files: SkillFile[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onAdd: () => void;
  onDelete: (path: string) => void;
}) {
  return (
    <div className="flex flex-col border-r border-white/5 bg-white/[0.01]">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-white/40">Files</span>
        <button
          onClick={onAdd}
          className="rounded p-1 text-white/30 transition hover:bg-white/5 hover:text-white/60"
          title="Add file"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {files.map((file) => (
          <button
            key={file.path}
            onClick={() => onSelect(file.path)}
            className={`group flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
              selectedFile === file.path
                ? 'bg-white/5 text-white'
                : 'text-white/50 hover:bg-white/[0.03] hover:text-white/70'
            }`}
          >
            <File className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 truncate">{file.path}</span>
            {file.path !== 'SKILL.md' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(file.path);
                }}
                className="hidden rounded p-0.5 text-white/20 hover:text-red-400 group-hover:block"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Code Editor ─────────────────────────────────────────────────────────────

function SkillCodeEditor({
  content,
  onChange,
  language,
}: {
  content: string;
  onChange: (content: string) => void;
  language: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center border-b border-white/5 px-4 py-2">
        <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-white/40">{language}</span>
      </div>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-white/80 placeholder:text-white/20 focus:outline-none"
        spellCheck={false}
        placeholder="Start writing your skill..."
      />
    </div>
  );
}

// ─── Test Harness ────────────────────────────────────────────────────────────

function TestHarness({
  results,
  onRunTest,
  isRunning,
}: {
  results: TestResult[];
  onRunTest: (prompt: string) => void;
  isRunning: boolean;
}) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    if (prompt.trim()) {
      onRunTest(prompt.trim());
      setPrompt('');
    }
  };

  return (
    <div className="flex flex-col border-t border-white/5">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
        <Terminal className="h-4 w-4 text-white/40" />
        <span className="text-xs font-medium uppercase tracking-wider text-white/40">
          Test Harness
        </span>
      </div>

      {/* Test input */}
      <div className="flex gap-2 border-b border-white/5 p-3">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Enter a test prompt..."
          className="flex-1 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/10 focus:outline-none"
          disabled={isRunning}
        />
        <button
          onClick={handleSubmit}
          disabled={isRunning || !prompt.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 transition hover:bg-amber-500/30 disabled:opacity-50"
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run
        </button>
      </div>

      {/* Results */}
      <div className="max-h-60 overflow-y-auto">
        {results.length === 0 ? (
          <div className="p-6 text-center text-sm text-white/30">
            Run a test prompt to see results here
          </div>
        ) : (
          results.map((result, i) => (
            <div key={i} className="border-b border-white/5 p-3">
              <div className="mb-1 flex items-center gap-2">
                {result.status === 'success' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <X className="h-3.5 w-3.5 text-red-400" />
                )}
                <span className="text-xs text-white/40">{result.duration}ms</span>
              </div>
              <p className="mb-1 text-xs text-white/60">
                <span className="text-white/30">Prompt:</span> {result.prompt}
              </p>
              <pre className="rounded bg-white/[0.03] p-2 text-xs text-white/70">
                {result.output}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Metadata Panel ──────────────────────────────────────────────────────────

function MetadataPanel({
  meta,
  onChange,
}: {
  meta: SkillMeta;
  onChange: (meta: Partial<SkillMeta>) => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto border-l border-white/5 bg-white/[0.01] p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-white/40">Skill Settings</h3>

      {/* Name */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/40">Name</span>
        <input
          type="text"
          value={meta.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/10 focus:outline-none"
        />
      </label>

      {/* Description */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/40">Description</span>
        <textarea
          value={meta.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className="resize-none rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/10 focus:outline-none"
        />
      </label>

      {/* Category */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/40">Category</span>
        <select
          value={meta.category}
          onChange={(e) => onChange({ category: e.target.value as SkillCategory })}
          className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/10 focus:outline-none"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#0a0a12]">
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {/* Target Platform */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/40">Target Platform</span>
        <select
          value={meta.targetPlatform}
          onChange={(e) => onChange({ targetPlatform: e.target.value as TargetPlatform })}
          className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/10 focus:outline-none"
        >
          <option value="universal" className="bg-[#0a0a12]">
            Universal
          </option>
          <option value="claude" className="bg-[#0a0a12]">
            Claude
          </option>
          <option value="gemini" className="bg-[#0a0a12]">
            Gemini
          </option>
          <option value="openai" className="bg-[#0a0a12]">
            OpenAI
          </option>
        </select>
      </label>

      {/* Version */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/40">Version</span>
        <input
          type="text"
          value={meta.version}
          onChange={(e) => onChange({ version: e.target.value })}
          className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/10 focus:outline-none"
        />
      </label>

      {/* Pricing */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/40">Pricing</span>
        <select
          value={meta.pricingModel}
          onChange={(e) =>
            onChange({ pricingModel: e.target.value as 'free' | 'one_time' | 'subscription' })
          }
          className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/10 focus:outline-none"
        >
          <option value="free" className="bg-[#0a0a12]">
            Free
          </option>
          <option value="one_time" className="bg-[#0a0a12]">
            One-time Purchase
          </option>
          <option value="subscription" className="bg-[#0a0a12]">
            Subscription
          </option>
        </select>
      </label>

      {meta.pricingModel !== 'free' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/40">Price (USD)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={(meta.price / 100).toFixed(2)}
            onChange={(e) => onChange({ price: Math.round(parseFloat(e.target.value) * 100) })}
            className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/10 focus:outline-none"
          />
        </label>
      )}

      {/* Keywords */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/40">Keywords (comma-separated)</span>
        <input
          type="text"
          value={meta.keywords.join(', ')}
          onChange={(e) =>
            onChange({
              keywords: e.target.value
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean),
            })
          }
          className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-white/10 focus:outline-none"
        />
      </label>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SkillBuilderPage() {
  // File state
  const [files, setFiles] = useState<SkillFile[]>([
    { path: 'SKILL.md', content: DEFAULT_SKILL_MD, mimeType: 'text/markdown' },
  ]);
  const [selectedFile, setSelectedFile] = useState<string>('SKILL.md');

  // Metadata
  const [meta, setMeta] = useState<SkillMeta>({
    name: 'my-skill',
    description: '',
    category: 'workflow',
    targetPlatform: 'universal',
    version: '1.0.0',
    keywords: [],
    pricingModel: 'free',
    price: 0,
    permissions: [],
  });

  // UI state
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'done' | 'error'>(
    'idle'
  );

  // File operations
  const handleAddFile = useCallback(() => {
    const name = prompt('File name (e.g., scripts/helper.ts):');
    if (!name) return;
    setFiles((prev) => [...prev, { path: name, content: '', mimeType: 'text/plain' }]);
    setSelectedFile(name);
  }, []);

  const handleDeleteFile = useCallback((path: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
    setSelectedFile('SKILL.md');
  }, []);

  const handleFileContentChange = useCallback(
    (content: string) => {
      setFiles((prev) => prev.map((f) => (f.path === selectedFile ? { ...f, content } : f)));
    },
    [selectedFile]
  );

  // Meta updates
  const handleMetaChange = useCallback((partial: Partial<SkillMeta>) => {
    setMeta((prev) => ({ ...prev, ...partial }));
  }, []);

  // Test
  const handleRunTest = useCallback(
    async (testPrompt: string) => {
      setIsTestRunning(true);
      // Simulated test — in production this calls the API
      await new Promise((r) => setTimeout(r, ANIM_NAVIGATE));
      setTestResults((prev) => [
        {
          prompt: testPrompt,
          output: `[Simulated] Skill "${meta.name}" processed: "${testPrompt.slice(0, 80)}..."`,
          duration: Math.floor(Math.random() * 500) + 200,
          status: 'success',
        },
        ...prev,
      ]);
      setIsTestRunning(false);
    },
    [meta.name]
  );

  // Publish
  const handlePublish = useCallback(async () => {
    setPublishState('publishing');
    try {
      const res = await fetch('/api/skills/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: meta.name,
          version: meta.version,
          description: meta.description,
          category: meta.category,
          targetPlatform: meta.targetPlatform,
          entrypoint: 'SKILL.md',
          files: files.map((f) => ({
            ...f,
            sizeBytes: new Blob([f.content]).size,
          })),
          license: 'MIT',
          keywords: meta.keywords,
          pricingModel: meta.pricingModel,
          price: meta.price,
          permissions: meta.permissions,
          sandboxed: true,
        }),
      });
      if (!res.ok) throw new Error('Publish failed');
      setPublishState('done');
    } catch {
      setPublishState('error');
    }
  }, [meta, files]);

  const currentFile = files.find((f) => f.path === selectedFile);
  const fileLanguage = selectedFile.endsWith('.md')
    ? 'markdown'
    : selectedFile.endsWith('.ts') || selectedFile.endsWith('.tsx')
      ? 'typescript'
      : selectedFile.endsWith('.sh')
        ? 'bash'
        : selectedFile.endsWith('.json')
          ? 'json'
          : 'text';

  return (
    <div className="flex h-screen flex-col bg-[#0a0a12] text-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/workspace"
            className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white/60"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Brain className="h-5 w-5 text-amber-400" />
          <span className="font-semibold text-white/90">Skill Builder</span>
          <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-white/40">
            {meta.name} v{meta.version}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab switch */}
          <div className="flex rounded-lg border border-white/5 bg-white/[0.02]">
            <button
              onClick={() => setActiveTab('edit')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'edit'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Code className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeTab === 'preview'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
          </div>

          {/* Actions */}
          <button className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white">
            <Save className="h-3.5 w-3.5" /> Save
          </button>

          <button
            onClick={handlePublish}
            disabled={publishState === 'publishing'}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-4 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/30 disabled:opacity-50"
          >
            {publishState === 'publishing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : publishState === 'done' ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {publishState === 'done'
              ? 'Published!'
              : publishState === 'publishing'
                ? 'Publishing...'
                : 'Publish'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree (200px) */}
        <div className="w-48 flex-shrink-0">
          <FileTree
            files={files}
            selectedFile={selectedFile}
            onSelect={setSelectedFile}
            onAdd={handleAddFile}
            onDelete={handleDeleteFile}
          />
        </div>

        {/* Editor / Preview (flex-1) */}
        <div className="flex flex-1 flex-col">
          {activeTab === 'edit' ? (
            <SkillCodeEditor
              content={currentFile?.content || ''}
              onChange={handleFileContentChange}
              language={fileLanguage}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-invert max-w-3xl">
                <pre className="whitespace-pre-wrap text-sm text-white/70">
                  {currentFile?.content || ''}
                </pre>
              </div>
            </div>
          )}

          {/* Test Harness */}
          <TestHarness results={testResults} onRunTest={handleRunTest} isRunning={isTestRunning} />
        </div>

        {/* Metadata Panel (280px) */}
        <div className="w-72 flex-shrink-0">
          <MetadataPanel meta={meta} onChange={handleMetaChange} />
        </div>
      </div>
    </div>
  );
}
