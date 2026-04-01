'use client';

/**
 * TemplateBrowserPanel - Browse and load workflow/behavior tree templates
 *
 * Provides a gallery of pre-configured templates with search and filtering.
 */

import { useState, useMemo } from 'react';
import { X, Search, Download, Workflow, GitBranch, Tag } from 'lucide-react';
import {
  WORKFLOW_TEMPLATES,
  BEHAVIOR_TREE_TEMPLATES,
  searchWorkflowTemplates,
  searchBehaviorTreeTemplates,
  type WorkflowTemplate,
  type BehaviorTreeTemplate,
} from '@/lib/templates';
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import { logger } from '@/lib/logger';

type TemplateType = 'all' | 'workflow' | 'behavior-tree';

interface TemplateBrowserPanelProps {
  onClose: () => void;
  onLoadTemplate?: (templateId: string, type: 'workflow' | 'behavior-tree') => void;
}

export function TemplateBrowserPanel({ onClose, onLoadTemplate }: TemplateBrowserPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<TemplateType>('all');

  const createWorkflow = useOrchestrationStore((s) => s.createWorkflow);
  const updateWorkflow = useOrchestrationStore((s) => s.updateWorkflow);
  const createBehaviorTree = useOrchestrationStore((s) => s.createBehaviorTree);
  const addBTNode = useOrchestrationStore((s) => s.addBTNode);
  const addBTEdge = useOrchestrationStore((s) => s.addBTEdge);

  // Filter templates based on search and category
  const filteredWorkflows = useMemo(() => {
    if (filterType === 'behavior-tree') return [];
    const templates = searchQuery ? searchWorkflowTemplates(searchQuery) : WORKFLOW_TEMPLATES;
    return templates;
  }, [searchQuery, filterType]);

  const filteredBehaviorTrees = useMemo(() => {
    if (filterType === 'workflow') return [];
    const templates = searchQuery
      ? searchBehaviorTreeTemplates(searchQuery)
      : BEHAVIOR_TREE_TEMPLATES;
    return templates;
  }, [searchQuery, filterType]);

  const handleLoadWorkflow = (template: WorkflowTemplate) => {
    // Create new workflow from template
    const workflowId = createWorkflow(template.name, template.description);
    updateWorkflow(workflowId, {
      nodes: template.nodes,
      edges: template.edges,
    });

    // Notify parent
    onLoadTemplate?.(template.id, 'workflow');
    onClose();
  };

  const handleLoadBehaviorTree = (template: BehaviorTreeTemplate) => {
    // Create new behavior tree from template
    const treeId = `tree_${Date.now()}`;
    createBehaviorTree(treeId);

    // Add all nodes
    template.nodes.forEach((node) => {
      addBTNode(treeId, node);
    });

    // Add all edges
    template.edges.forEach((edge) => {
      addBTEdge(treeId, edge);
    });

    // Notify parent
    onLoadTemplate?.(template.id, 'behavior-tree');
    onClose();
  };

  const handleExportAsTemplate = () => {
    const data = JSON.stringify({ exportedAt: Date.now(), type: 'template' }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holoscript-template-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logger.debug('[TemplateBrowser] Export as template payload generated');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-studio-panel border border-studio-border rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-studio-border px-5 py-4">
          <Workflow className="h-5 w-5 text-studio-accent" />
          <h2 className="text-[14px] font-bold text-studio-text">Template Browser</h2>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-studio-muted hover:bg-studio-hover hover:text-studio-text transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex shrink-0 items-center gap-3 border-b border-studio-border px-5 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-muted" />
            <input
              type="text"
              placeholder="Search templates by name, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-studio-border bg-studio-bg px-9 py-2 text-[11px] text-studio-text placeholder-studio-muted focus:border-studio-accent focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-1.5 rounded-lg border border-studio-border bg-studio-bg p-1">
            <button
              onClick={() => setFilterType('all')}
              className={`rounded px-3 py-1.5 text-[10px] font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-studio-accent text-white'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('workflow')}
              className={`rounded px-3 py-1.5 text-[10px] font-medium transition-colors ${
                filterType === 'workflow'
                  ? 'bg-blue-500 text-white'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              Workflows
            </button>
            <button
              onClick={() => setFilterType('behavior-tree')}
              className={`rounded px-3 py-1.5 text-[10px] font-medium transition-colors ${
                filterType === 'behavior-tree'
                  ? 'bg-green-500 text-white'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              Behavior Trees
            </button>
          </div>
        </div>

        {/* Template Gallery */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Workflow Templates */}
          {filteredWorkflows.length > 0 && (
            <div className="mb-6">
              <div className="mb-3 flex items-center gap-2">
                <Workflow className="h-4 w-4 text-blue-400" />
                <h3 className="text-[12px] font-bold text-blue-400">Workflow Templates</h3>
                <span className="text-[10px] text-studio-muted">({filteredWorkflows.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWorkflows.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    type="workflow"
                    onLoad={() => handleLoadWorkflow(template)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Behavior Tree Templates */}
          {filteredBehaviorTrees.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-green-400" />
                <h3 className="text-[12px] font-bold text-green-400">Behavior Tree Templates</h3>
                <span className="text-[10px] text-studio-muted">
                  ({filteredBehaviorTrees.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBehaviorTrees.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    type="behavior-tree"
                    onLoad={() => handleLoadBehaviorTree(template)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {filteredWorkflows.length === 0 && filteredBehaviorTrees.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-12 w-12 text-studio-muted mb-4" />
              <p className="text-[13px] text-studio-muted">No templates found</p>
              <p className="text-[11px] text-studio-muted mt-1">
                Try adjusting your search or filter
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-studio-border px-5 py-3 flex items-center justify-between bg-studio-bg/50">
          <div className="text-[10px] text-studio-muted">
            {filteredWorkflows.length + filteredBehaviorTrees.length} templates available
          </div>
          <button
            onClick={handleExportAsTemplate}
            className="rounded-lg border border-studio-border px-3 py-1.5 text-[10px] font-medium text-studio-text hover:bg-studio-hover transition-colors"
          >
            <Download className="inline h-3 w-3 mr-1.5" />
            Save as Template
          </button>
        </div>
      </div>
    </div>
  );
}

// Template Card Component
interface TemplateCardProps {
  template: WorkflowTemplate | BehaviorTreeTemplate;
  type: 'workflow' | 'behavior-tree';
  onLoad: () => void;
}

function TemplateCard({ template, type, onLoad }: TemplateCardProps) {
  const Icon = type === 'workflow' ? Workflow : GitBranch;
  const color = type === 'workflow' ? 'blue' : 'green';

  return (
    <div className="group relative rounded-xl border border-studio-border bg-studio-panel hover:border-studio-accent transition-all duration-200 overflow-hidden">
      {/* Thumbnail/Preview Area */}
      <div
        className={`h-24 bg-gradient-to-br from-${color}-500/20 to-${color}-600/10 border-b border-studio-border flex items-center justify-center`}
      >
        <Icon className={`h-10 w-10 text-${color}-400 opacity-40`} />
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <Icon className={`h-4 w-4 text-${color}-400 shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <h4 className="text-[11px] font-bold text-studio-text truncate">{template.name}</h4>
            <p className="text-[10px] text-studio-muted mt-1 line-clamp-2">
              {template.description}
            </p>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {template.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded bg-studio-bg px-1.5 py-0.5 text-[9px] text-studio-muted"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
          {template.tags.length > 3 && (
            <span className="inline-flex items-center rounded bg-studio-bg px-1.5 py-0.5 text-[9px] text-studio-muted">
              +{template.tags.length - 3}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 mb-3 text-[9px] text-studio-muted">
          <span>{template.nodes.length} nodes</span>
          <span>•</span>
          <span>{template.edges.length} edges</span>
        </div>

        {/* Use Button */}
        <button
          onClick={onLoad}
          className={`w-full rounded-lg bg-${color}-500/20 px-3 py-2 text-[10px] font-medium text-${color}-400 hover:bg-${color}-500/30 transition-colors`}
        >
          Use Template
        </button>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-studio-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}
