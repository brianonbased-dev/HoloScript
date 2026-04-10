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
      resizable: true,
      minWidth: 280,
      maxWidth: 600,

      // Responsive layout for tablet/mobile editing
      responsive: {
        tablet: {
          layoutMode: 'drawer',
          position: 'right',
          width: '70%',
          swipeToDismiss: true,
        },
        mobile: {
          layoutMode: 'fullscreen',
          defaultCollapsed: true,
          swipeToDismiss: true,
        },
      },

      // Touch gesture support for tablet interaction
      touchGestures: [
        { gesture: 'swipe-right', action: 'dismiss' },
        { gesture: 'swipe-up', action: 'expand' },
        { gesture: 'swipe-down', action: 'collapse' },
      ],
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
import { useResponsiveLayout } from '@holoscript/studio-plugin-sdk/responsive';

interface {{panelComponentName}}Props {
  onClose?: () => void;
}

export function {{panelComponentName}}({ onClose }: {{panelComponentName}}Props) {
  const [data, setData] = useState<any>(null);
  const { isTouchDevice, isTablet, breakpoint } = useResponsiveLayout();

  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Content area - adapts padding for touch devices */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          padding: isTouchDevice ? '16px 20px' : '12px 16px',
          // Smooth scrolling for iOS
          WebkitOverflowScrolling: 'touch',
          // Prevent scroll chaining on mobile/tablet
          overscrollBehavior: 'contain',
        }}
      >
        <p
          className="text-sm text-studio-muted"
          style={{
            fontSize: isTouchDevice ? 15 : 13,
            lineHeight: 1.6,
          }}
        >
          Your panel content goes here!
        </p>

        {isTablet && (
          <p
            className="text-xs text-studio-muted mt-4"
            style={{ opacity: 0.5 }}
          >
            Swipe right to dismiss \u00B7 Swipe up to expand
          </p>
        )}
      </div>
    </div>
  );
}
`;
