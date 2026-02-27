/**
 * emojiReactionTrait.ts — Emoji Particle System for Viral Reactions
 *
 * MEME-003: Emoji reaction trait (💀, 🔥, 😂, 💎)
 * Priority: High | Estimate: 5 hours
 *
 * Features:
 * - Event-driven emoji spawning
 * - Float-up animation with physics
 * - Random positioning around character
 * - Configurable emojis and spawn rates
 * - Fade out and cleanup
 */

import * as THREE from 'three';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmojiReactionConfig {
  /**
   * Available emojis to spawn
   * Default: ['💀', '🔥', '😂', '💎', '🚀', '💯', '❤️', '👀']
   */
  emojis?: string[];

  /**
   * Spawn rate (emojis per second)
   * Default: 3
   */
  spawnRate?: number;

  /**
   * Float speed (units per second)
   * Default: 2.0
   */
  floatSpeed?: number;

  /**
   * Horizontal spread radius
   * Default: 1.5
   */
  spreadRadius?: number;

  /**
   * Lifetime in seconds before fade
   * Default: 3.0
   */
  lifetime?: number;

  /**
   * Emoji size in world units
   * Default: 0.3
   */
  emojiSize?: number;

  /**
   * Enable random rotation
   * Default: true
   */
  randomRotation?: boolean;

  /**
   * Enable physics simulation (wobble, wind)
   * Default: true
   */
  enablePhysics?: boolean;

  /**
   * Trigger events to react to
   * Default: ['interaction', 'achievement', 'hype']
   */
  triggerEvents?: string[];
}

interface EmojiParticle {
  mesh: THREE.Sprite;
  velocity: THREE.Vector3;
  lifetime: number;
  age: number;
  rotationSpeed: number;
}

// ─── Emoji Reaction Trait ────────────────────────────────────────────────────

export class EmojiReactionTrait {
  private config: Required<EmojiReactionConfig>;
  private particles: EmojiParticle[] = [];
  private spawnTimer = 0;
  private isActive = false;
  private parentObject: THREE.Object3D;
  private canvas: HTMLCanvasElement;
  private eventListeners: Map<string, () => void> = new Map();

  constructor(parentObject: THREE.Object3D, config: EmojiReactionConfig = {}) {
    this.parentObject = parentObject;

    // Default configuration
    this.config = {
      emojis: config.emojis || ['💀', '🔥', '😂', '💎', '🚀', '💯', '❤️', '👀'],
      spawnRate: config.spawnRate ?? 3,
      floatSpeed: config.floatSpeed ?? 2.0,
      spreadRadius: config.spreadRadius ?? 1.5,
      lifetime: config.lifetime ?? 3.0,
      emojiSize: config.emojiSize ?? 0.3,
      randomRotation: config.randomRotation ?? true,
      enablePhysics: config.enablePhysics ?? true,
      triggerEvents: config.triggerEvents || ['interaction', 'achievement', 'hype'],
    };

    // Create canvas for emoji textures
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 128;
  }

  /**
   * Start continuous emoji spawning
   */
  start(): void {
    this.isActive = true;
    console.log('[EmojiReaction] Started continuous spawning');
  }

  /**
   * Stop continuous emoji spawning
   */
  stop(): void {
    this.isActive = false;
    console.log('[EmojiReaction] Stopped continuous spawning');
  }

  /**
   * Spawn a single emoji immediately
   */
  spawnEmoji(emoji?: string): void {
    const selectedEmoji = emoji || this.getRandomEmoji();
    const particle = this.createEmojiParticle(selectedEmoji);
    this.particles.push(particle);
    this.parentObject.add(particle.mesh);
  }

  /**
   * Trigger a burst of emojis
   */
  burst(count: number = 5, emoji?: string): void {
    for (let i = 0; i < count; i++) {
      // Stagger spawn slightly
      setTimeout(() => this.spawnEmoji(emoji), i * 50);
    }
  }

  /**
   * React to specific event with themed emojis
   */
  reactToEvent(eventType: string): void {
    const eventEmojis: Record<string, string[]> = {
      interaction: ['👋', '👍', '✨', '💫'],
      achievement: ['🎉', '🏆', '⭐', '💎'],
      hype: ['🔥', '🚀', '💯', '⚡'],
      sad: ['😭', '💔', '😢'],
      love: ['❤️', '💕', '😍', '💖'],
      death: ['💀', '☠️', '👻'],
      money: ['💰', '💵', '💎', '🤑'],
    };

    const emojis = eventEmojis[eventType] || this.config.emojis;
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    this.burst(3, emoji);
  }

  /**
   * Update particles (call in animation loop)
   */
  update(deltaTime: number): void {
    // Spawn new particles if active
    if (this.isActive) {
      this.spawnTimer += deltaTime;
      const spawnInterval = 1 / this.config.spawnRate;

      while (this.spawnTimer >= spawnInterval) {
        this.spawnEmoji();
        this.spawnTimer -= spawnInterval;
      }
    }

    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += deltaTime;

      // Remove expired particles
      if (particle.age >= this.config.lifetime) {
        this.parentObject.remove(particle.mesh);
        particle.mesh.material.dispose();
        (particle.mesh.material as THREE.SpriteMaterial).map?.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // Update position
      particle.mesh.position.add(
        particle.velocity.clone().multiplyScalar(deltaTime)
      );

      // Apply physics
      if (this.config.enablePhysics) {
        // Wobble effect
        const wobble = Math.sin(particle.age * 5) * 0.05;
        particle.mesh.position.x += wobble * deltaTime;

        // Wind effect (slight horizontal drift)
        const wind = Math.sin(particle.age * 2) * 0.3;
        particle.mesh.position.x += wind * deltaTime;
      }

      // Rotation
      if (this.config.randomRotation) {
        particle.mesh.material.rotation += particle.rotationSpeed * deltaTime;
      }

      // Fade out at end of lifetime
      const fadeStart = this.config.lifetime * 0.7;
      if (particle.age > fadeStart) {
        const fadeProgress = (particle.age - fadeStart) / (this.config.lifetime - fadeStart);
        particle.mesh.material.opacity = 1 - fadeProgress;
      }

      // Scale animation (grow then shrink)
      const scaleProgress = particle.age / this.config.lifetime;
      let scale: number;
      if (scaleProgress < 0.2) {
        // Grow in
        scale = this.config.emojiSize * (scaleProgress / 0.2);
      } else if (scaleProgress > 0.8) {
        // Shrink out
        scale = this.config.emojiSize * ((1 - scaleProgress) / 0.2);
      } else {
        scale = this.config.emojiSize;
      }
      particle.mesh.scale.setScalar(scale);
    }
  }

  /**
   * Create emoji particle
   */
  private createEmojiParticle(emoji: string): EmojiParticle {
    // Create emoji texture
    const texture = this.createEmojiTexture(emoji);

    // Create sprite material
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
    });

    // Create sprite
    const sprite = new THREE.Sprite(material);

    // Random position around parent
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * this.config.spreadRadius;
    sprite.position.set(
      Math.cos(angle) * radius,
      Math.random() * 0.5, // Start slightly above ground
      Math.sin(angle) * radius
    );

    // Add to parent's world position
    sprite.position.add(this.parentObject.position);

    // Float velocity (upward with slight randomness)
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5, // Slight horizontal drift
      this.config.floatSpeed, // Upward
      (Math.random() - 0.5) * 0.5
    );

    // Random rotation speed
    const rotationSpeed = (Math.random() - 0.5) * 2;

    return {
      mesh: sprite,
      velocity,
      lifetime: this.config.lifetime,
      age: 0,
      rotationSpeed,
    };
  }

  /**
   * Create emoji texture from canvas
   */
  private createEmojiTexture(emoji: string): THREE.Texture {
    const ctx = this.canvas.getContext('2d')!;

    // Clear canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw emoji
    ctx.font = '100px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 64);

    // Create texture
    const texture = new THREE.CanvasTexture(this.canvas);
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Get random emoji from config
   */
  private getRandomEmoji(): string {
    return this.config.emojis[Math.floor(Math.random() * this.config.emojis.length)];
  }

  /**
   * Listen to custom events (for integration with game logic)
   */
  addEventListener(eventType: string, callback: () => void): void {
    this.eventListeners.set(eventType, callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(eventType: string): void {
    this.eventListeners.delete(eventType);
  }

  /**
   * Get current particle count (for debugging)
   */
  getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * Clear all particles
   */
  clearAll(): void {
    this.particles.forEach((particle) => {
      this.parentObject.remove(particle.mesh);
      particle.mesh.material.dispose();
      (particle.mesh.material as THREE.SpriteMaterial).map?.dispose();
    });
    this.particles = [];
  }

  /**
   * Dispose trait and cleanup
   */
  dispose(): void {
    this.clearAll();
    this.eventListeners.clear();
    this.isActive = false;
  }
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/**
 * React hook for emoji reactions
 */
export function useEmojiReactions(
  parentObject: THREE.Object3D | null,
  config?: EmojiReactionConfig
) {
  const [trait, setTrait] = React.useState<EmojiReactionTrait | null>(null);

  React.useEffect(() => {
    if (!parentObject) return;

    const emojiTrait = new EmojiReactionTrait(parentObject, config);
    setTrait(emojiTrait);

    return () => {
      emojiTrait.dispose();
    };
  }, [parentObject, config]);

  const spawnEmoji = React.useCallback(
    (emoji?: string) => {
      trait?.spawnEmoji(emoji);
    },
    [trait]
  );

  const burst = React.useCallback(
    (count?: number, emoji?: string) => {
      trait?.burst(count, emoji);
    },
    [trait]
  );

  const reactToEvent = React.useCallback(
    (eventType: string) => {
      trait?.reactToEvent(eventType);
    },
    [trait]
  );

  return {
    trait,
    spawnEmoji,
    burst,
    reactToEvent,
    start: () => trait?.start(),
    stop: () => trait?.stop(),
    particleCount: trait?.getParticleCount() || 0,
  };
}

// Lazy React import
let React: typeof import('react');
if (typeof window !== 'undefined') {
  React = require('react');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default EmojiReactionTrait;
