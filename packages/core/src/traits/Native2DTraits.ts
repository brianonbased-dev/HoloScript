/**
 * @holoscript/core/traits — Native 2D UI Traits
 *
 * Implements flat, 2D screen-native interfaces inside HoloScript.
 * Allows compiling to HTML/CSS or React components.
 */

import type { TraitHandler } from './TraitTypes';

// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

export interface Native2DPanelConfig {
  tag?: string; // e.g., 'div', 'section', 'nav', 'header', 'footer', 'main'
}

export interface Native2DLayoutConfig {
  flex?: 'row' | 'column';
  grid?: boolean;
  columns?: number;
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  gap?: number | string;
  padding?: number | string;
  margin?: number | string;
}

export interface Native2DTextConfig {
  variant?: 'h1' | 'h2' | 'h3' | 'subtitle' | 'body' | 'caption' | 'emoji';
  content?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  weight?: 'normal' | 'bold' | 'light' | number;
  maxWidth?: number | string;
}

export interface Native2DButtonConfig {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'glow';
  content?: string;
  onClick?: string;
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
}

export interface Native2DImageConfig {
  src: string;
  alt?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  lazyLoad?: boolean;
}

export interface Native2DInputConfig {
  type?: 'text' | 'email' | 'password' | 'number' | 'textarea' | 'checkbox' | 'radio' | 'select';
  placeholder?: string;
  value?: string;
  required?: boolean;
  options?: string[]; // for select
}

export interface Native2DLinkConfig {
  href: string;
  target?: '_blank' | '_self' | '_parent' | '_top';
  content?: string;
  variant?: 'underline' | 'ghost' | 'button';
}

export interface Native2DIconConfig {
  name: string;
  size?: number | string;
  color?: string;
}

export interface Native2DCardConfig {
  hover?: 'glow' | 'lift' | 'none';
  shadow?: 'sm' | 'md' | 'lg' | 'none';
}

export interface Native2DListConfig {
  ordered?: boolean;
  style?: 'disc' | 'decimal' | 'none';
}

export interface Native2DFormConfig {
  onSubmit?: string;
  method?: 'get' | 'post';
  action?: string;
}

export interface Native2DResponsiveConfig {
  sm?: Partial<Native2DLayoutConfig & Native2DThemeConfig>;
  md?: Partial<Native2DLayoutConfig & Native2DThemeConfig>;
  lg?: Partial<Native2DLayoutConfig & Native2DThemeConfig>;
}

export interface Native2DThemeConfig {
  backgroundColor?: string;
  color?: string;
  padding?: number | string;
  margin?: number | string;
  border?: string;
  borderTop?: string;
  borderRadius?: number | string;
  boxShadow?: string;
  dark?: boolean;
  className?: string;
  style?: string;
  attributes?: string;
}

export interface Native2DTailwindConfig {
  classes: string;
}

// ============================================================================
// HANDLERS
// ============================================================================

export const native2DPanelHandler: TraitHandler<Native2DPanelConfig> = {
  name: 'panel',
  defaultConfig: { tag: 'div' },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DPanel = config;
  },
};

export const native2DLayoutHandler: TraitHandler<Native2DLayoutConfig> = {
  name: 'layout',
  defaultConfig: { flex: 'column', gap: 0 },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DLayout = config;
  },
};

export const native2DTextHandler: TraitHandler<Native2DTextConfig> = {
  name: 'text',
  defaultConfig: { variant: 'body', content: '' },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DText = config;
  },
};

export const native2DButtonHandler: TraitHandler<Native2DButtonConfig> = {
  name: 'button',
  defaultConfig: { variant: 'primary', content: '' },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DButton = config;
  },
};

export const native2DImageHandler: TraitHandler<Native2DImageConfig> = {
  name: 'image',
  defaultConfig: { src: '', lazyLoad: true },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DImage = config;
  },
};

export const native2DInputHandler: TraitHandler<Native2DInputConfig> = {
  name: 'input',
  defaultConfig: { type: 'text' },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DInput = config;
  },
};

export const native2DLinkHandler: TraitHandler<Native2DLinkConfig> = {
  name: 'link',
  defaultConfig: { href: '#' },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DLink = config;
  },
};

export const native2DIconHandler: TraitHandler<Native2DIconConfig> = {
  name: 'icon',
  defaultConfig: { name: 'star' },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DIcon = config;
  },
};

export const native2DCardHandler: TraitHandler<Native2DCardConfig> = {
  name: 'card',
  defaultConfig: { hover: 'none', shadow: 'sm' },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DCard = config;
  },
};

export const native2DListHandler: TraitHandler<Native2DListConfig> = {
  name: 'list',
  defaultConfig: { ordered: false },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DList = config;
  },
};

export const native2DFormHandler: TraitHandler<Native2DFormConfig> = {
  name: 'form',
  defaultConfig: {},
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DForm = config;
  },
};

export const native2DResponsiveHandler: TraitHandler<Native2DResponsiveConfig> = {
  name: 'responsive',
  defaultConfig: {},
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DResponsive = config;
  },
};

export const native2DThemeHandler: TraitHandler<Native2DThemeConfig> = {
  name: 'theme',
  defaultConfig: {},
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DTheme = config;
  },
};

export const native2DTailwindHandler: TraitHandler<Native2DTailwindConfig> = {
  name: 'tailwind',
  defaultConfig: { classes: '' },
  onAttach(node, config) {
    (node as unknown as Record<string, unknown>).__isNative2D = true;
    (node as unknown as Record<string, unknown>).__native2DTailwind = config;
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const NATIVE_2D_TRAIT_HANDLERS = [
  native2DPanelHandler,
  native2DLayoutHandler,
  native2DTextHandler,
  native2DButtonHandler,
  native2DImageHandler,
  native2DInputHandler,
  native2DLinkHandler,
  native2DIconHandler,
  native2DCardHandler,
  native2DListHandler,
  native2DFormHandler,
  native2DResponsiveHandler,
  native2DThemeHandler,
  native2DTailwindHandler,
];
