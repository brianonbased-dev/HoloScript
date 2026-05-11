import type { HSPlusNode } from '@holoscript/core';
import {
  emergentSpacetimeHandler as coreEmergentSpacetimeHandler,
  type EmergentSpacetimeConfig,
} from '../../../../core/src/traits/EmergentSpacetimeTrait';

export type { EmergentSpacetimeConfig };

export const emergentSpacetimeHandler = {
  name: coreEmergentSpacetimeHandler.name,
  onAttach(node: HSPlusNode, config: EmergentSpacetimeConfig, context: unknown): void {
    coreEmergentSpacetimeHandler.onAttach?.(node as never, config, context as never);
  },
  onDetach(node: HSPlusNode, config?: EmergentSpacetimeConfig, context?: unknown): void {
    coreEmergentSpacetimeHandler.onDetach?.(node as never, config as never, context as never);
  },
  onUpdate(
    node: HSPlusNode,
    config: EmergentSpacetimeConfig,
    context: unknown,
    delta: number
  ): void {
    coreEmergentSpacetimeHandler.onUpdate?.(node as never, config, context as never, delta);
  },
};
