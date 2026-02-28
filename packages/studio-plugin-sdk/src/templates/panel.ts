/**
 * Panel plugin template (adds a custom UI panel)
 */

export const panelPluginTemplate = `import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';
import { {{panelComponentName}} } from './components/{{panelComponentName}}';

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
    icon: '{{iconName}}',
  },

  panels: [
    {
      id: '{{panelId}}',
      label: '{{panelLabel}}',
      icon: '{{iconName}}',
      position: 'right',
      width: 400,
      component: {{panelComponentName}},
      shortcut: '{{keyboardShortcut}}',
    },
  ],

  onLoad: () => {
    console.log('{{pluginDisplayName}} loaded!');
  },
};

export default {{pluginName}}Plugin;
`;

export const panelComponentTemplate = `import { useState } from 'react';
import { X } from 'lucide-react';

interface {{panelComponentName}}Props {
  onClose?: () => void;
}

export function {{panelComponentName}}({ onClose }: {{panelComponentName}}Props) {
  const [data, setData] = useState<any>(null);

  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-3">
        <h2 className="text-sm font-semibold text-studio-text">{{panelLabel}}</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-studio-muted">
          Your panel content goes here!
        </p>
      </div>
    </div>
  );
}
`;
