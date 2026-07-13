import { createElement, type ReactElement } from 'react';
import type { R3FNode } from '@holoscript/core';
import { MeshNode } from './MeshNode';

export type SceneIRRenderableKind = 'mesh' | 'light' | 'group';

export interface HoloSceneIRRendererProps {
  node: R3FNode;
  onSelect?: (id: string | null) => void;
  onRemove?: (id: string) => void;
  onRef?: (id: string, ref: unknown) => void;
  selectedId?: string | null;
  isBreakMode?: boolean;
  draftMode?: boolean;
  draftColor?: string;
}

const LIGHT_NODE_TYPES = new Set([
  'ambientLight',
  'directionalLight',
  'pointLight',
  'spotLight',
  'hemisphereLight',
  'rectAreaLight',
]);

const RENDERABLE_PROP_KEYS = new Set([
  'position',
  'rotation',
  'scale',
  'color',
  'intensity',
  'distance',
  'decay',
  'angle',
  'penumbra',
  'groundColor',
  'width',
  'height',
  'castShadow',
  'receiveShadow',
  'visible',
  'userData',
]);

export function sceneIRRenderableKind(type: string): SceneIRRenderableKind {
  if (type === 'mesh') return 'mesh';
  if (LIGHT_NODE_TYPES.has(type)) return 'light';
  return 'group';
}

export function HoloSceneIRRenderer(props: HoloSceneIRRendererProps): ReactElement {
  return renderSceneIRNode(props.node, props);
}

export function renderSceneIRNode(
  node: R3FNode,
  options: Omit<HoloSceneIRRendererProps, 'node'>,
  keyIndex = 0
): ReactElement {
  const kind = sceneIRRenderableKind(node.type);
  const children = (node.children ?? []).map((child: R3FNode, index: number) =>
    renderSceneIRNode(child, options, index)
  );

  if (kind === 'mesh') {
    return createElement(MeshNode, {
      key: node.id ?? stableKey(node, keyIndex),
      node,
      onSelect: options.onSelect,
      onRemove: options.onRemove,
      onRef: options.onRef,
      isSelected: options.selectedId === node.id,
      isBreakMode: options.isBreakMode,
      draftMode: options.draftMode,
      draftColor: options.draftColor,
    });
  }

  const elementType = kind === 'light' ? node.type : 'group';
  return createElement(elementType, renderableProps(node, keyIndex), ...children);
}

function renderableProps(node: R3FNode, keyIndex: number): Record<string, unknown> {
  const props: Record<string, unknown> = { key: node.id ?? stableKey(node, keyIndex) };
  if (node.id) props.name = node.id;

  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (value === undefined || key.startsWith('__')) continue;
    if (RENDERABLE_PROP_KEYS.has(key)) props[key] = value;
  }

  if (node.assetMaturity) {
    props.userData = {
      ...(isRecord(props.userData) ? props.userData : {}),
      holoscriptAssetMaturity: node.assetMaturity,
    };
  }

  return props;
}

function stableKey(node: R3FNode, index: number): string {
  return `${node.type}:${node.id ?? index}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
