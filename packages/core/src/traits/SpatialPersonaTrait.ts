/**
 * Spatial Persona Trait (V43 Tier 2)
 *
 * Manages a user's persistent spatial persona in visionOS shared spaces.
 * Controls 3D avatar representation, expression sync, and spatial audio
 * presence across SharePlay and Immersive Space sessions.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type PersonaStyle = 'realistic' | 'stylized' | 'abstract' | 'minimalist';
export type PersonaVisibility = 'always' | 'when_speaking' | 'proximity' | 'never';

export interface SpatialPersonaConfig {
  persona_style: PersonaStyle;
  visibility: PersonaVisibility;
  spatial_audio: boolean;
  gesture_mirroring: boolean;
  expression_sync: boolean;
  proximity_radius: number; // meters — for 'proximity' visibility mode
  render_quality: 'low' | 'medium' | 'high';
}

export type ExpressionState = 'neutral' | 'talking' | 'listening' | 'reacting';

interface SpatialPersonaState {
  isActive: boolean;
  personaId: string | null;
  position: [number, number, number] | null;
  orientation: [number, number, number, number] | null; // quaternion
  expressionState: ExpressionState;
  isSpeaking: boolean;
  visibleTo: Set<string>; // participant IDs
}

// =============================================================================
// HANDLER
// =============================================================================

export const spatialPersonaHandler: TraitHandler<SpatialPersonaConfig> = {
  name: 'spatial_persona',

  defaultConfig: {
    persona_style: 'realistic',
    visibility: 'always',
    spatial_audio: true,
    gesture_mirroring: true,
    expression_sync: true,
    proximity_radius: 3.0,
    render_quality: 'high',
  },

  onAttach(node, config, context) {
    const state: SpatialPersonaState = {
      isActive: false,
      personaId: null,
      position: null,
      orientation: null,
      expressionState: 'neutral',
      isSpeaking: false,
      visibleTo: new Set(),
    };
    context.setState({ spatialPersona: state });
    context.emit('persona:init', {
      style: config.persona_style,
      visibility: config.visibility,
    });
  },

  onDetach(node, config, context) {
    const state = context.getState().spatialPersona as SpatialPersonaState | undefined;
    if (state?.isActive) {
      context.emit('persona:deactivated', { personaId: state.personaId });
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().spatialPersona as SpatialPersonaState | undefined;
    if (!state) return;

    if (event.type === 'persona:activate') {
      const payload = event.payload;
      state.isActive = true;
      state.personaId = (payload?.personaId as string) ?? `persona_${node.id}`;
      context.emit('persona:activated', { personaId: state.personaId });
    } else if (event.type === 'persona:deactivate') {
      state.isActive = false;
      context.emit('persona:deactivated', { personaId: state.personaId });
    } else if (event.type === 'persona:position_update') {
      const payload = event.payload;
      if (payload?.position) state.position = payload.position as typeof state.position;
      if (payload?.orientation) state.orientation = payload.orientation as typeof state.orientation;
      context.emit('persona:moved', {
        personaId: state.personaId,
        position: state.position,
      });
    } else if (event.type === 'persona:expression') {
      const expr = event.payload?.expression as ExpressionState;
      if (expr) {
        state.expressionState = expr;
        state.isSpeaking = expr === 'talking';
        context.emit('persona:expression_changed', {
          personaId: state.personaId,
          expression: expr,
        });
      }
    } else if (event.type === 'persona:participant_visible') {
      const participantId = event.payload?.participantId as string;
      if (participantId) state.visibleTo.add(participantId);
    } else if (event.type === 'persona:participant_hidden') {
      const participantId = event.payload?.participantId as string;
      if (participantId) state.visibleTo.delete(participantId);
    }
  },
};
