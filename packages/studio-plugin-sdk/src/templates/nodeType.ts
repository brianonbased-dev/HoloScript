/**
 * Node type plugin template (adds custom workflow/behavior tree nodes)
 */

export const nodeTypePluginTemplate = `import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';

export const {{pluginName}}Plugin: HoloScriptPlugin = {
  metadata: {
    id: '{{pluginId}}',
    name: '{{pluginDisplayName}}',
    version: '1.0.0',
    description: '{{pluginDescription}}',
    author: {
      name: '{{authorName}}',
      email: '{{authorEmail}}',
    },
    license: 'MIT',
    icon: 'GitBranch',
  },

  nodeTypes: {
    workflow: [
      {
        type: '{{nodeType}}',
        label: '{{nodeLabel}}',
        category: '{{nodeCategory}}',
        icon: '{{nodeIcon}}',
        color: '#8b5cf6',
        description: '{{nodeDescription}}',
        inputs: [
          { id: 'input', label: 'Input', type: 'any' },
        ],
        outputs: [
          { id: 'output', label: 'Output', type: 'any' },
        ],
        defaultConfig: {
          // Node configuration defaults
        },
      },
    ],

    behaviorTree: [
      {
        type: '{{btNodeType}}',
        label: '{{btNodeLabel}}',
        category: '{{nodeCategory}}',
        icon: 'Zap',
        color: '#10b981',
        description: '{{btNodeDescription}}',
      },
    ],
  },

  onLoad: () => {
    console.log('{{pluginDisplayName}} loaded!');
  },
};

export default {{pluginName}}Plugin;
`;
