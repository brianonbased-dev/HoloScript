/**
 * Example Plugin: Analytics Dashboard
 * Adds analytics visualization panel to HoloScript Studio
 */

import type { HoloScriptPlugin } from '../types';
import { logger } from '@/lib/logger';

export const analyticsPlugin: HoloScriptPlugin = {
  metadata: {
    id: 'holoscript-analytics-dashboard',
    name: 'Analytics Dashboard',
    version: '1.0.0',
    description: 'Real-time analytics and metrics visualization for your HoloScript projects',
    author: {
      name: 'HoloScript Team',
      email: 'team@holoscript.net',
    },
    homepage: 'https://holoscript.net/plugins/analytics',
    license: 'MIT',
    keywords: ['analytics', 'metrics', 'dashboard', 'visualization'],
    icon: 'BarChart2',
  },

  // Lifecycle hooks
  onLoad: async () => {
    logger.debug('[Analytics Plugin] Loaded');
  },

  onUnload: async () => {
    logger.debug('[Analytics Plugin] Unloaded');
  },

  onInstall: async () => {
    logger.debug('[Analytics Plugin] Installed');
  },

  onUninstall: async () => {
    logger.debug('[Analytics Plugin] Uninstalled');
  },

  // Settings
  settings: {
    refreshInterval: 5000,
    showRealtime: true,
    trackDownloads: true,
  },

  settingsSchema: [
    {
      key: 'refreshInterval',
      label: 'Refresh Interval (ms)',
      type: 'number',
      defaultValue: 5000,
      description: 'How often to refresh analytics data',
      required: true,
    },
    {
      key: 'showRealtime',
      label: 'Show Realtime Data',
      type: 'boolean',
      defaultValue: true,
      description: 'Display realtime analytics updates',
    },
    {
      key: 'trackDownloads',
      label: 'Track Downloads',
      type: 'boolean',
      defaultValue: true,
      description: 'Track marketplace content downloads',
    },
  ],

  // Custom panels
  panels: [
    {
      id: 'analytics-dashboard',
      label: 'Analytics',
      icon: 'BarChart2',
      position: 'right',
      defaultOpen: false,
      component: () => null, // Will be replaced with actual component
    },
  ],

  // Custom toolbar buttons
  toolbarButtons: [
    {
      id: 'toggle-analytics',
      label: 'Analytics',
      icon: 'BarChart2',
      tooltip: 'Open Analytics Dashboard',
      position: 'right',
      onClick: async () => {
        logger.debug('[Analytics Plugin] Toolbar button clicked');
        // Toggle analytics panel
      },
    },
  ],

  // Custom keyboard shortcuts
  keyboardShortcuts: [
    {
      id: 'toggle-analytics-dashboard',
      key: 'ctrl+shift+a',
      description: 'Toggle Analytics Dashboard',
      handler: async () => {
        logger.debug('[Analytics Plugin] Keyboard shortcut triggered');
      },
    },
  ],
};
