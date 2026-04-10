/**
 * @holoscript/runtime - Navigation
 *
 * Route handling and navigation for HoloScript applications.
 */

import { eventBus } from './events.js';

export type NavigateCallback = (path: string) => void;

let navigateCallback: NavigateCallback | null = null;
let currentPath = '/';
let history: string[] = [];
let historyIndex = -1;

/**
 * Set the navigation callback (usually provided by router)
 */
export function setNavigateCallback(callback: NavigateCallback): void {
  navigateCallback = callback;
}

/**
 * Navigate to a path
 */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  // Handle special paths
  if (path === 'back') {
    goBack();
    return;
  }

  if (path === 'forward') {
    goForward();
    return;
  }

  // Emit navigation event before navigating
  eventBus.emit('navigation:before', { from: currentPath, to: path });

  // Update history
  if (!options.replace) {
    // Remove forward history if navigating to new path
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }
    history.push(path);
    historyIndex = history.length - 1;
  } else {
    // Replace current entry
    if (history.length > 0) {
      history[historyIndex] = path;
    } else {
      history.push(path);
      historyIndex = 0;
    }
  }

  const previousPath = currentPath;
  currentPath = path;

  // Use callback if available, otherwise fallback to window.location
  if (navigateCallback) {
    navigateCallback(path);
  } else if (typeof window !== 'undefined') {
    if (options.replace) {
      window.history.replaceState({ path }, '', path);
    } else {
      window.history.pushState({ path }, '', path);
    }
  }

  // Emit navigation event after navigating
  eventBus.emit('navigation:after', { from: previousPath, to: path });
}

/**
 * Go back in history
 */
export function goBack(): void {
  if (historyIndex > 0) {
    historyIndex--;
    const path = history[historyIndex];
    const previousPath = currentPath;
    currentPath = path;

    eventBus.emit('navigation:before', { from: previousPath, to: path });

    if (navigateCallback) {
      navigateCallback(path);
    } else if (typeof window !== 'undefined') {
      window.history.back();
    }

    eventBus.emit('navigation:after', { from: previousPath, to: path });
  }
}

/**
 * Go forward in history
 */
export function goForward(): void {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    const path = history[historyIndex];
    const previousPath = currentPath;
    currentPath = path;

    eventBus.emit('navigation:before', { from: previousPath, to: path });

    if (navigateCallback) {
      navigateCallback(path);
    } else if (typeof window !== 'undefined') {
      window.history.forward();
    }

    eventBus.emit('navigation:after', { from: previousPath, to: path });
  }
}

/**
 * Get current path
 */
export function getCurrentPath(): string {
  return currentPath;
}

/**
 * Check if can go back
 */
export function canGoBack(): boolean {
  return historyIndex > 0;
}

/**
 * Check if can go forward
 */
export function canGoForward(): boolean {
  return historyIndex < history.length - 1;
}

/**
 * Get navigation history
 */
export function getHistory(): string[] {
  return [...history];
}

/**
 * Clear navigation history
 */
export function clearHistory(): void {
  history = [currentPath];
  historyIndex = 0;
}

/**
 * Parse route parameters from path
 */
export function parseParams(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      // Parameter
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      // Mismatch
      return null;
    }
  }

  return params;
}

/**
 * Check if path matches pattern
 */
export function matchRoute(pattern: string, path: string): boolean {
  return parseParams(pattern, path) !== null;
}

/**
 * Parse query string from URL
 */
export function parseQuery(search: string): Record<string, string> {
  const params: Record<string, string> = {};

  if (!search || search.length <= 1) return params;

  const queryString = search.startsWith('?') ? search.slice(1) : search;
  const pairs = queryString.split('&');

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
  }

  return params;
}

/**
 * Build query string from object
 */
export function buildQuery(params: Record<string, string | number | boolean>): string {
  const pairs: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

/**
 * Listen for navigation events
 */
export function onNavigate(callback: (event: { from: string; to: string }) => void): () => void {
  return eventBus.on('navigation:after', callback);
}

/**
 * Initialize browser history listener
 */
export function initBrowserHistory(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Set initial path
  currentPath = window.location.pathname;
  history = [currentPath];
  historyIndex = 0;

  const handler = (event: PopStateEvent) => {
    const path = event.state?.path || window.location.pathname;
    const previousPath = currentPath;
    currentPath = path;

    // Update history index
    const index = history.indexOf(path);
    if (index !== -1) {
      historyIndex = index;
    }

    eventBus.emit('navigation:popstate', { from: previousPath, to: path });
  };

  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}

export default {
  navigate,
  goBack,
  goForward,
  getCurrentPath,
  canGoBack,
  canGoForward,
  getHistory,
  clearHistory,
  parseParams,
  matchRoute,
  parseQuery,
  buildQuery,
  onNavigate,
  setNavigateCallback,
  initBrowserHistory,
};
