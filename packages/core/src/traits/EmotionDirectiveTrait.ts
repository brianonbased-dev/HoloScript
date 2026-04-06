/**
 * @holoscript/core Emotion Directive Trait
 *
 * Maps structured LLM responses to avatar animation states,
 * facial expressions, and body gestures. Implements a two-tier
 * directive system (SIGGRAPH Asia 2024 pattern):
 *
 * - Conditional directives: persistent states (idle, listening, thinking, speaking)
 * - Triggering directives: instant actions (nod, wave, shrug, point)
 *
 * @example
 * ```hsplus
 * object "AIAssistant" {
 *   @emotion_directive {
 *     expressionPresets: {
 *       happy: { smile: 1.0, browInnerUp: 0.2 },
 *       sad: { frown: 0.8, browDown: 0.3 },
 *       surprised: { browUp: 0.9, jawOpen: 0.4 }
 *     },
 *     animationMap: {
 *       idle: "IdleBreathing",
 *       talking: "TalkingOne",
 *       thinking: "ThinkingIdle"
 *     },
 *     maxSegmentsPerTurn: 3
 *   }
 * }
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Facial expression preset name
 */
export type ExpressionPresetName =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'disgusted'
  | 'fearful'
  | 'confused'
  | 'thinking'
  | 'excited'
  | 'empathetic'
  | 'skeptical'
  | 'amused'
  | string;

/**
 * Body animation preset name
 */
export type AnimationPresetName =
  | 'idle'
  | 'talking'
  | 'thinking'
  | 'listening'
  | 'nodding'
  | 'waving'
  | 'shrugging'
  | 'pointing'
  | 'celebrating'
  | 'saddened'
  | 'defeated'
  | 'angry_gesture'
  | string;

/**
 * Directive type
 */
export type DirectiveType = 'conditional' | 'triggering';

/**
 * A conditional directive defines a persistent behavioral state
 */
export interface ConditionalDirective {
  type: 'conditional';

  /** State name (e.g., 'listening', 'thinking', 'speaking') */
  state: string;

  /** Facial expression to hold */
  expression?: ExpressionPresetName;

  /** Body animation to loop */
  animation?: AnimationPresetName;

  /** Voice style modifier */
  voiceStyle?: string;

  /** Gaze behavior */
  gaze?: 'eye-contact' | 'look-away' | 'look-down' | 'scan';

  /** Posture modifier */
  posture?: 'upright' | 'leaning-forward' | 'leaning-back' | 'relaxed';
}

/**
 * A triggering directive is an instant one-shot action
 */
export interface TriggeringDirective {
  type: 'triggering';

  /** Action name (e.g., 'nod', 'wave', 'shrug') */
  action: string;

  /** Duration override (seconds) */
  duration?: number;

  /** Intensity (0-1) */
  intensity?: number;

  /** Which body part (for targeted gestures) */
  bodyPart?: 'head' | 'hands' | 'full-body';
}

/**
 * An LLM response segment with emotion and animation tags
 */
export interface EmotionTaggedSegment {
  /** Text content to speak */
  text: string;

  /** Facial expression for this segment */
  facialExpression?: ExpressionPresetName;

  /** Body animation for this segment */
  animation?: AnimationPresetName;

  /** Voice style for this segment */
  voiceStyle?: string;

  /** Emphasis level */
  emphasis?: 'low' | 'medium' | 'high';

  /** Triggering gestures during this segment */
  gestures?: string[];
}

/**
 * Structured AI response with emotion directives
 */
export interface EmotionTaggedResponse {
  /** Response segments (max 3-4 per turn for variety) */
  segments: EmotionTaggedSegment[];

  /** Overall mood for the turn */
  mood?: ExpressionPresetName;

  /** Conditional state to hold after speaking */
  postSpeechState?: string;
}

/**
 * Active emotion state
 */
export interface EmotionState {
  /** Current conditional directive */
  conditionalState: string;

  /** Current facial expression */
  expression: ExpressionPresetName;

  /** Current body animation */
  animation: AnimationPresetName;

  /** Morph target weights for current expression */
  expressionWeights: Record<string, number>;

  /** Expression blend progress (0-1) */
  blendProgress: number;

  /** Overall mood (longer-term than expression) */
  mood: ExpressionPresetName;

  /** Mood intensity (0-1) */
  moodIntensity: number;

  /** Queued triggering directives */
  pendingTriggers: TriggeringDirective[];
}

/**
 * Emotion directive event types
 */
export type EmotionDirectiveEventType =
  | 'expression-change'
  | 'animation-change'
  | 'state-change'
  | 'trigger-fire'
  | 'trigger-complete'
  | 'mood-shift'
  | 'segment-start'
  | 'segment-end'
  | 'response-start'
  | 'response-end';

/**
 * Emotion directive event
 */
export interface EmotionDirectiveEvent {
  type: EmotionDirectiveEventType;
  expression?: ExpressionPresetName;
  animation?: AnimationPresetName;
  state?: string;
  trigger?: string;
  segmentIndex?: number;
  mood?: ExpressionPresetName;
  timestamp: number;
}

/**
 * Configuration for the EmotionDirectiveTrait
 */
export interface EmotionDirectiveConfig {
  /** Expression preset → morph target weight mappings */
  expressionPresets?: Record<string, Record<string, number>>;

  /** Animation preset → animation clip name mappings */
  animationMap?: Record<string, string>;

  /** Gesture → animation clip name mappings */
  gestureMap?: Record<string, string>;

  /** Max segments per LLM response turn */
  maxSegmentsPerTurn?: number;

  /** Expression blend time (seconds) */
  expressionBlendTime?: number;

  /** Default conditional state */
  defaultState?: string;

  /** Default expression */
  defaultExpression?: ExpressionPresetName;

  /** Default animation */
  defaultAnimation?: AnimationPresetName;

  /** Mood decay rate (0-1, per second) */
  moodDecayRate?: number;

  /** Enable micro-expressions (subtle random variations) */
  microExpressions?: boolean;

  /** Micro-expression intensity (0-1) */
  microExpressionIntensity?: number;

  /** Enable idle animations when not speaking */
  idleAnimations?: boolean;

  /** Enable conversation fillers (nod, "hmm") while thinking */
  conversationFillers?: boolean;
}

/**
 * Emotion directive event callback
 */
type EmotionDirectiveEventCallback = (event: EmotionDirectiveEvent) => void;

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default expression presets using common ARKit/Oculus blend shape names
 */
export const DEFAULT_EXPRESSION_PRESETS: Record<string, Record<string, number>> = {
  neutral: {},
  happy: {
    mouthSmileLeft: 0.7,
    mouthSmileRight: 0.7,
    browInnerUp: 0.17,
    eyeSquintLeft: 0.4,
    eyeSquintRight: 0.4,
    cheekSquintLeft: 0.3,
    cheekSquintRight: 0.3,
  },
  sad: {
    mouthFrownLeft: 0.6,
    mouthFrownRight: 0.6,
    browDownLeft: 0.3,
    browDownRight: 0.3,
    browInnerUp: 0.5,
    mouthPucker: 0.15,
  },
  angry: {
    browDownLeft: 0.7,
    browDownRight: 0.7,
    eyeSquintLeft: 0.5,
    eyeSquintRight: 0.5,
    mouthFrownLeft: 0.3,
    mouthFrownRight: 0.3,
    jawForward: 0.2,
    noseSneerLeft: 0.4,
    noseSneerRight: 0.4,
  },
  surprised: {
    browInnerUp: 0.8,
    browOuterUpLeft: 0.7,
    browOuterUpRight: 0.7,
    eyeWideLeft: 0.7,
    eyeWideRight: 0.7,
    jawOpen: 0.4,
    mouthFunnel: 0.2,
  },
  disgusted: {
    noseSneerLeft: 0.6,
    noseSneerRight: 0.6,
    mouthUpperUpLeft: 0.3,
    mouthUpperUpRight: 0.3,
    browDownLeft: 0.3,
    browDownRight: 0.3,
  },
  fearful: {
    browInnerUp: 0.7,
    browOuterUpLeft: 0.5,
    browOuterUpRight: 0.5,
    eyeWideLeft: 0.8,
    eyeWideRight: 0.8,
    mouthStretchLeft: 0.3,
    mouthStretchRight: 0.3,
  },
  thinking: {
    browDownLeft: 0.2,
    browInnerUp: 0.3,
    eyeLookUpLeft: 0.3,
    eyeLookUpRight: 0.3,
    mouthPucker: 0.1,
  },
  excited: {
    mouthSmileLeft: 0.9,
    mouthSmileRight: 0.9,
    browInnerUp: 0.4,
    browOuterUpLeft: 0.3,
    browOuterUpRight: 0.3,
    eyeWideLeft: 0.3,
    eyeWideRight: 0.3,
    cheekSquintLeft: 0.4,
    cheekSquintRight: 0.4,
  },
  empathetic: {
    browInnerUp: 0.4,
    mouthSmileLeft: 0.3,
    mouthSmileRight: 0.3,
    eyeSquintLeft: 0.15,
    eyeSquintRight: 0.15,
  },
  skeptical: {
    browDownLeft: 0.5,
    browOuterUpRight: 0.6,
    mouthLeft: 0.2,
    mouthPucker: 0.1,
  },
  amused: {
    mouthSmileLeft: 0.5,
    mouthSmileRight: 0.5,
    browInnerUp: 0.1,
    eyeSquintLeft: 0.3,
    eyeSquintRight: 0.3,
  },
  confused: {
    browInnerUp: 0.5,
    browDownLeft: 0.3,
    mouthFrownLeft: 0.2,
    mouthFrownRight: 0.2,
    mouthPucker: 0.1,
  },
};

/**
 * Default animation mappings
 */
export const DEFAULT_ANIMATION_MAP: Record<string, string> = {
  idle: 'IdleBreathing',
  talking: 'TalkingOne',
  thinking: 'ThinkingIdle',
  listening: 'ListeningIdle',
  nodding: 'Nodding',
  waving: 'Waving',
  shrugging: 'Shrugging',
  pointing: 'Pointing',
  celebrating: 'Celebrating',
  saddened: 'SadIdle',
  defeated: 'Defeated',
  angry_gesture: 'AngryGesture',
};

// =============================================================================
// EMOTION DIRECTIVE TRAIT
// =============================================================================

/**
 * EmotionDirectiveTrait — Maps LLM responses to avatar behavior
 *
 * Consumes structured LLM output ({text, facialExpression, animation})
 * and drives the avatar's expression and animation systems.
 */
export class EmotionDirectiveTrait {
  private config: EmotionDirectiveConfig;
  private state: EmotionState;
  private expressionPresets: Map<string, Record<string, number>> = new Map();
  private animationMap: Map<string, string> = new Map();
  private gestureMap: Map<string, string> = new Map();
  private eventListeners: Map<EmotionDirectiveEventType, Set<EmotionDirectiveEventCallback>> =
    new Map();

  // Segment playback state
  private currentResponse: EmotionTaggedResponse | null = null;
  private currentSegmentIndex: number = -1;
  private segmentTimer: ReturnType<typeof setTimeout> | null = null;

  // Blend state
  private targetExpressionWeights: Record<string, number> = {};
  private blendDuration: number = 0;
  private blendElapsed: number = 0;
  private startExpressionWeights: Record<string, number> = {};

  // Micro-expression state
  private microExpressionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: EmotionDirectiveConfig = {}) {
    this.config = {
      maxSegmentsPerTurn: 3,
      expressionBlendTime: 0.4,
      defaultState: 'idle',
      defaultExpression: 'neutral',
      defaultAnimation: 'idle',
      moodDecayRate: 0.05,
      microExpressions: true,
      microExpressionIntensity: 0.15,
      idleAnimations: true,
      conversationFillers: true,
      ...config,
    };

    // Initialize expression presets
    const presets = { ...DEFAULT_EXPRESSION_PRESETS, ...config.expressionPresets };
    for (const [name, weights] of Object.entries(presets)) {
      this.expressionPresets.set(name, weights);
    }

    // Initialize animation map
    const anims = { ...DEFAULT_ANIMATION_MAP, ...config.animationMap };
    for (const [name, clipName] of Object.entries(anims)) {
      this.animationMap.set(name, clipName);
    }

    // Initialize gesture map
    if (config.gestureMap) {
      for (const [name, clipName] of Object.entries(config.gestureMap)) {
        this.gestureMap.set(name, clipName);
      }
    }

    // Initialize state
    this.state = {
      conditionalState: this.config.defaultState ?? 'idle',
      expression: this.config.defaultExpression ?? 'neutral',
      animation: this.config.defaultAnimation ?? 'idle',
      expressionWeights: {},
      blendProgress: 1,
      mood: 'neutral',
      moodIntensity: 0,
      pendingTriggers: [],
    };
  }

  // ============================================================================
  // Core API
  // ============================================================================

  /**
   * Get current emotion state
   */
  public getState(): EmotionState {
    return { ...this.state };
  }

  /**
   * Get current expression weights (for applying to morph targets)
   */
  public getExpressionWeights(): Record<string, number> {
    return { ...this.state.expressionWeights };
  }

  /**
   * Get the animation clip name for the current state
   */
  public getCurrentAnimationClip(): string | undefined {
    return this.animationMap.get(this.state.animation);
  }

  /**
   * Get configuration
   */
  public getConfig(): EmotionDirectiveConfig {
    return { ...this.config };
  }

  // ============================================================================
  // Conditional Directives (Persistent States)
  // ============================================================================

  /**
   * Set a conditional state (persistent behavioral mode)
   */
  public setConditionalState(directive: ConditionalDirective): void {
    const _prev = this.state.conditionalState;
    this.state.conditionalState = directive.state;

    if (directive.expression) {
      this.setExpression(directive.expression);
    }

    if (directive.animation) {
      this.setAnimation(directive.animation);
    }

    this.emit({
      type: 'state-change',
      state: directive.state,
      expression: directive.expression,
      animation: directive.animation,
      timestamp: Date.now(),
    });
  }

  /**
   * Set facial expression (with blend transition)
   */
  public setExpression(expression: ExpressionPresetName, blendTime?: number): void {
    const preset = this.expressionPresets.get(expression);
    if (!preset && expression !== 'neutral') return;

    const prevExpression = this.state.expression;
    this.state.expression = expression;

    // Start blend
    this.startExpressionWeights = { ...this.state.expressionWeights };
    this.targetExpressionWeights = preset ?? {};
    this.blendDuration = blendTime ?? this.config.expressionBlendTime ?? 0.4;
    this.blendElapsed = 0;

    if (prevExpression !== expression) {
      this.emit({
        type: 'expression-change',
        expression,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Set body animation
   */
  public setAnimation(animation: AnimationPresetName): void {
    const prev = this.state.animation;
    this.state.animation = animation;

    if (prev !== animation) {
      this.emit({
        type: 'animation-change',
        animation,
        timestamp: Date.now(),
      });
    }
  }

  // ============================================================================
  // Triggering Directives (Instant Actions)
  // ============================================================================

  /**
   * Fire a triggering directive (one-shot gesture/action)
   */
  public fireTrigger(directive: TriggeringDirective): void {
    this.state.pendingTriggers.push(directive);

    this.emit({
      type: 'trigger-fire',
      trigger: directive.action,
      timestamp: Date.now(),
    });
  }

  /**
   * Consume the next pending trigger (called by runtime)
   */
  public consumeTrigger(): TriggeringDirective | undefined {
    return this.state.pendingTriggers.shift();
  }

  /**
   * Get pending trigger count
   */
  public getPendingTriggerCount(): number {
    return this.state.pendingTriggers.length;
  }

  // ============================================================================
  // LLM Response Processing
  // ============================================================================

  /**
   * Process a structured LLM response with emotion tags
   */
  public processResponse(response: EmotionTaggedResponse): void {
    // Enforce max segments
    const maxSegments = this.config.maxSegmentsPerTurn ?? 3;
    const segments = response.segments.slice(0, maxSegments);

    this.currentResponse = { ...response, segments };
    this.currentSegmentIndex = -1;

    // Set overall mood
    if (response.mood) {
      this.setMood(response.mood);
    }

    this.emit({
      type: 'response-start',
      mood: response.mood,
      timestamp: Date.now(),
    });

    // Start first segment
    this.advanceSegment();
  }

  /**
   * Advance to the next segment in the response
   */
  public advanceSegment(): EmotionTaggedSegment | null {
    if (!this.currentResponse) return null;

    // Complete previous segment
    if (this.currentSegmentIndex >= 0) {
      this.emit({
        type: 'segment-end',
        segmentIndex: this.currentSegmentIndex,
        timestamp: Date.now(),
      });
    }

    this.currentSegmentIndex++;

    if (this.currentSegmentIndex >= this.currentResponse.segments.length) {
      // All segments complete
      this.completeResponse();
      return null;
    }

    const segment = this.currentResponse.segments[this.currentSegmentIndex];

    // Apply segment expression and animation
    if (segment.facialExpression) {
      this.setExpression(segment.facialExpression);
    }

    if (segment.animation) {
      this.setAnimation(segment.animation);
    }

    // Queue segment gestures as triggers
    if (segment.gestures) {
      for (const gesture of segment.gestures) {
        this.fireTrigger({
          type: 'triggering',
          action: gesture,
          bodyPart: 'full-body',
        });
      }
    }

    this.emit({
      type: 'segment-start',
      segmentIndex: this.currentSegmentIndex,
      expression: segment.facialExpression,
      animation: segment.animation,
      timestamp: Date.now(),
    });

    return segment;
  }

  /**
   * Get current segment
   */
  public getCurrentSegment(): EmotionTaggedSegment | null {
    if (!this.currentResponse || this.currentSegmentIndex < 0) return null;
    return this.currentResponse.segments[this.currentSegmentIndex] ?? null;
  }

  /**
   * Get current segment index
   */
  public getCurrentSegmentIndex(): number {
    return this.currentSegmentIndex;
  }

  /**
   * Complete the current response
   */
  private completeResponse(): void {
    const postState = this.currentResponse?.postSpeechState;

    this.currentResponse = null;
    this.currentSegmentIndex = -1;

    // Transition to post-speech state or default
    if (postState) {
      this.setConditionalState({
        type: 'conditional',
        state: postState,
      });
    } else {
      this.setExpression(this.config.defaultExpression ?? 'neutral');
      this.setAnimation(this.config.defaultAnimation ?? 'idle');
    }

    this.emit({
      type: 'response-end',
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // Mood System
  // ============================================================================

  /**
   * Set the overall mood (longer-term emotional baseline)
   */
  public setMood(mood: ExpressionPresetName, intensity: number = 0.5): void {
    this.state.mood = mood;
    this.state.moodIntensity = Math.max(0, Math.min(1, intensity));

    this.emit({
      type: 'mood-shift',
      mood,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current mood
   */
  public getMood(): { mood: ExpressionPresetName; intensity: number } {
    return { mood: this.state.mood, intensity: this.state.moodIntensity };
  }

  // ============================================================================
  // Expression Preset Management
  // ============================================================================

  /**
   * Add or update an expression preset
   */
  public addExpressionPreset(name: string, weights: Record<string, number>): void {
    this.expressionPresets.set(name, weights);
  }

  /**
   * Remove an expression preset
   */
  public removeExpressionPreset(name: string): void {
    this.expressionPresets.delete(name);
  }

  /**
   * Get all preset names
   */
  public getExpressionPresetNames(): string[] {
    return Array.from(this.expressionPresets.keys());
  }

  /**
   * Add or update an animation mapping
   */
  public addAnimationMapping(presetName: string, clipName: string): void {
    this.animationMap.set(presetName, clipName);
  }

  // ============================================================================
  // Frame Update
  // ============================================================================

  /**
   * Update emotion state (call each frame)
   * Returns the expression morph target weights to apply
   */
  public update(deltaTime: number): Record<string, number> {
    // Update expression blend
    if (this.blendElapsed < this.blendDuration) {
      this.blendElapsed += deltaTime;
      const t = Math.min(1, this.blendElapsed / this.blendDuration);
      const easedT = this.easeOutQuad(t);

      this.state.blendProgress = t;

      // Interpolate expression weights
      const allKeys = new Set([
        ...Object.keys(this.startExpressionWeights),
        ...Object.keys(this.targetExpressionWeights),
      ]);

      for (const key of allKeys) {
        const start = this.startExpressionWeights[key] ?? 0;
        const target = this.targetExpressionWeights[key] ?? 0;
        const current = start + (target - start) * easedT;

        if (current > 0.001) {
          this.state.expressionWeights[key] = current;
        } else {
          delete this.state.expressionWeights[key];
        }
      }
    }

    // Mood decay
    if (this.state.moodIntensity > 0) {
      this.state.moodIntensity = Math.max(
        0,
        this.state.moodIntensity - (this.config.moodDecayRate ?? 0.05) * deltaTime
      );
    }

    // Apply mood as a subtle baseline overlay
    const result = { ...this.state.expressionWeights };

    if (this.state.mood !== 'neutral' && this.state.moodIntensity > 0) {
      const moodPreset = this.expressionPresets.get(this.state.mood);
      if (moodPreset) {
        const moodFactor = this.state.moodIntensity * 0.3; // Mood is subtle
        for (const [key, weight] of Object.entries(moodPreset)) {
          const existing = result[key] ?? 0;
          result[key] = Math.min(1, existing + weight * moodFactor);
        }
      }
    }

    return result;
  }

  /**
   * Ease-out quadratic
   */
  private easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  // ============================================================================
  // Conversation Fillers
  // ============================================================================

  /**
   * Generate a conversation filler (nod, "hmm", idle gesture)
   * Call when LLM is processing and avatar should appear engaged
   */
  public generateFiller(): TriggeringDirective {
    const fillers: TriggeringDirective[] = [
      { type: 'triggering', action: 'nod', bodyPart: 'head', intensity: 0.5 },
      { type: 'triggering', action: 'slight_nod', bodyPart: 'head', intensity: 0.3 },
      { type: 'triggering', action: 'head_tilt', bodyPart: 'head', intensity: 0.4 },
    ];

    const filler = fillers[Math.floor(Math.random() * fillers.length)];
    this.fireTrigger(filler);
    return filler;
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Register event listener
   */
  public on(event: EmotionDirectiveEventType, callback: EmotionDirectiveEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  public off(event: EmotionDirectiveEventType, callback: EmotionDirectiveEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: EmotionDirectiveEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('EmotionDirective event listener error:', e);
        }
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this.segmentTimer) {
      clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }
    if (this.microExpressionTimer) {
      clearTimeout(this.microExpressionTimer);
      this.microExpressionTimer = null;
    }
    this.eventListeners.clear();
    this.currentResponse = null;
  }
}

/**
 * Create an emotion directive trait
 */
export function createEmotionDirectiveTrait(
  config?: EmotionDirectiveConfig
): EmotionDirectiveTrait {
  return new EmotionDirectiveTrait(config);
}

// ── Handler (delegates to EmotionDirectiveTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const emotionDirectiveHandler = {
  name: 'emotion_directive',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    const instance = new EmotionDirectiveTrait(config);
    node.__emotion_directive_instance = instance;
    ctx.emit('emotion_directive_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__emotion_directive_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('emotion_directive_detached', { node });
    delete node.__emotion_directive_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__emotion_directive_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'emotion_directive_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('emotion_directive_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__emotion_directive_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
