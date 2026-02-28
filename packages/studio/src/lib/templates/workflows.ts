/**
 * Built-in Workflow Templates for HoloScript Studio
 *
 * Pre-configured agent orchestration workflows for common use cases.
 */

import type { WorkflowNode, WorkflowEdge } from '../orchestrationStore';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'workflow';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  tags: string[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'scene-optimizer',
    name: 'Scene Optimizer',
    description: 'AI analyzes scene and suggests optimizations for performance and visual quality',
    category: 'workflow',
    tags: ['optimization', 'performance', 'ai', 'scene'],
    nodes: [
      {
        id: 'analyzer',
        type: 'agent',
        label: 'Scene Analyzer',
        position: { x: 100, y: 100 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'You are a 3D scene optimization expert. Analyze scenes for performance bottlenecks, draw call reduction opportunities, and visual quality improvements.',
          temperature: 0.3,
          tools: ['semantic_search', 'search_knowledge'],
          maxTokens: 2048,
        },
      },
      {
        id: 'search_patterns',
        type: 'tool',
        label: 'Search Optimization Patterns',
        position: { x: 350, y: 100 },
        data: {
          type: 'tool',
          server: 'semantic-search-hub',
          toolName: 'search_knowledge',
          args: { query: 'scene optimization patterns', limit: 5 },
          timeout: 5000,
        },
      },
      {
        id: 'apply_optimizations',
        type: 'agent',
        label: 'Apply Optimizations',
        position: { x: 600, y: 100 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Apply scene optimizations based on analysis. Focus on LOD, occlusion culling, texture compression, and draw call batching.',
          temperature: 0.2,
          tools: [],
          maxTokens: 4096,
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'analyzer', target: 'search_patterns' },
      { id: 'e2', source: 'search_patterns', target: 'apply_optimizations' },
    ],
  },
  {
    id: 'multi-agent-code-review',
    name: 'Multi-Agent Code Review',
    description: 'Multiple AI agents review code from different perspectives (security, performance, style)',
    category: 'workflow',
    tags: ['code-review', 'multi-agent', 'quality'],
    nodes: [
      {
        id: 'coordinator',
        type: 'agent',
        label: 'Review Coordinator',
        position: { x: 100, y: 100 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Coordinate code review by distributing code to specialized reviewers.',
          temperature: 0.5,
          tools: [],
          maxTokens: 1024,
        },
      },
      {
        id: 'parallel_reviews',
        type: 'parallel',
        label: 'Parallel Reviews',
        position: { x: 350, y: 100 },
        data: {
          type: 'parallel',
          policy: 'require-all',
          timeout: 30000,
        },
      },
      {
        id: 'security_reviewer',
        type: 'agent',
        label: 'Security Reviewer',
        position: { x: 200, y: 250 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Review code for security vulnerabilities, injection risks, and auth issues.',
          temperature: 0.2,
          tools: ['search_knowledge'],
          maxTokens: 2048,
        },
      },
      {
        id: 'performance_reviewer',
        type: 'agent',
        label: 'Performance Reviewer',
        position: { x: 400, y: 250 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Review code for performance issues, memory leaks, and optimization opportunities.',
          temperature: 0.2,
          tools: ['search_knowledge'],
          maxTokens: 2048,
        },
      },
      {
        id: 'style_reviewer',
        type: 'agent',
        label: 'Style Reviewer',
        position: { x: 600, y: 250 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Review code for style consistency, readability, and best practices.',
          temperature: 0.3,
          tools: [],
          maxTokens: 2048,
        },
      },
      {
        id: 'merge_results',
        type: 'merge',
        label: 'Merge Reviews',
        position: { x: 350, y: 400 },
        data: {
          type: 'merge',
          waitForAll: true,
          timeout: 5000,
        },
      },
      {
        id: 'synthesize',
        type: 'agent',
        label: 'Synthesize Report',
        position: { x: 350, y: 550 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Synthesize all review feedback into a comprehensive report with prioritized action items.',
          temperature: 0.4,
          tools: [],
          maxTokens: 4096,
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'coordinator', target: 'parallel_reviews' },
      { id: 'e2', source: 'parallel_reviews', target: 'security_reviewer' },
      { id: 'e3', source: 'parallel_reviews', target: 'performance_reviewer' },
      { id: 'e4', source: 'parallel_reviews', target: 'style_reviewer' },
      { id: 'e5', source: 'security_reviewer', target: 'merge_results' },
      { id: 'e6', source: 'performance_reviewer', target: 'merge_results' },
      { id: 'e7', source: 'style_reviewer', target: 'merge_results' },
      { id: 'e8', source: 'merge_results', target: 'synthesize' },
    ],
  },
  {
    id: 'data-pipeline',
    name: 'Data Processing Pipeline',
    description: 'Sequential data processing workflow with validation and transformation',
    category: 'workflow',
    tags: ['data', 'pipeline', 'sequential'],
    nodes: [
      {
        id: 'validate',
        type: 'agent',
        label: 'Validate Input',
        position: { x: 100, y: 100 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Validate input data format, completeness, and quality.',
          temperature: 0.1,
          tools: [],
          maxTokens: 1024,
        },
      },
      {
        id: 'decision',
        type: 'decision',
        label: 'Is Valid?',
        position: { x: 300, y: 100 },
        data: {
          type: 'decision',
          condition: 'result.isValid === true',
          trueOutput: 'transform',
          falseOutput: 'error_handler',
        },
      },
      {
        id: 'transform',
        type: 'sequential',
        label: 'Transform Data',
        position: { x: 500, y: 100 },
        data: {
          type: 'sequential',
          onError: 'retry',
        },
      },
      {
        id: 'normalize',
        type: 'agent',
        label: 'Normalize',
        position: { x: 400, y: 250 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Normalize data to standard format.',
          temperature: 0.1,
          tools: [],
          maxTokens: 2048,
        },
      },
      {
        id: 'enrich',
        type: 'agent',
        label: 'Enrich Data',
        position: { x: 600, y: 250 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Enrich data with additional context and metadata.',
          temperature: 0.2,
          tools: ['search_knowledge'],
          maxTokens: 2048,
        },
      },
      {
        id: 'error_handler',
        type: 'agent',
        label: 'Handle Error',
        position: { x: 300, y: 400 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Handle validation errors and provide feedback.',
          temperature: 0.3,
          tools: [],
          maxTokens: 1024,
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'validate', target: 'decision' },
      { id: 'e2', source: 'decision', target: 'transform', label: 'valid' },
      { id: 'e3', source: 'decision', target: 'error_handler', label: 'invalid' },
      { id: 'e4', source: 'transform', target: 'normalize' },
      { id: 'e5', source: 'normalize', target: 'enrich' },
    ],
  },
  {
    id: 'content-generation',
    name: 'Content Generation Pipeline',
    description: 'Generate and refine content with multiple AI agents working in sequence',
    category: 'workflow',
    tags: ['content', 'generation', 'creative'],
    nodes: [
      {
        id: 'ideate',
        type: 'agent',
        label: 'Ideation Agent',
        position: { x: 100, y: 100 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Generate creative ideas based on user requirements.',
          temperature: 0.9,
          tools: ['search_knowledge'],
          maxTokens: 2048,
        },
      },
      {
        id: 'draft',
        type: 'agent',
        label: 'Drafting Agent',
        position: { x: 300, y: 100 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Create initial draft based on selected ideas.',
          temperature: 0.7,
          tools: [],
          maxTokens: 4096,
        },
      },
      {
        id: 'refine',
        type: 'agent',
        label: 'Refinement Agent',
        position: { x: 500, y: 100 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Refine and polish the draft for clarity and impact.',
          temperature: 0.4,
          tools: [],
          maxTokens: 4096,
        },
      },
      {
        id: 'fact_check',
        type: 'agent',
        label: 'Fact Checker',
        position: { x: 700, y: 100 },
        data: {
          type: 'agent',
          agentId: 'brittney',
          systemPrompt: 'Verify factual accuracy and add citations.',
          temperature: 0.2,
          tools: ['search_knowledge'],
          maxTokens: 2048,
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'ideate', target: 'draft' },
      { id: 'e2', source: 'draft', target: 'refine' },
      { id: 'e3', source: 'refine', target: 'fact_check' },
    ],
  },
];

/**
 * Get a workflow template by ID
 */
export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

/**
 * Search workflow templates by name, description, or tags
 */
export function searchWorkflowTemplates(query: string): WorkflowTemplate[] {
  const lowerQuery = query.toLowerCase();
  return WORKFLOW_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}
