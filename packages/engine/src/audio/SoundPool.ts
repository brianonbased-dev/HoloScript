/**
 * SoundPool.ts
 *
 * Pre-registered sound bank with instance pooling.
 * Provides named sound references for the AudioEngine.
 */

export interface SoundDefinition {
  id: string;
  name: string;
  duration: number; // Seconds
  category: string; // e.g., 'sfx', 'ambient', 'ui', 'music'
  volume: number; // Default volume 0-1
  loop: boolean;
}

export class SoundPool {
  private sounds: Map<string, SoundDefinition> = new Map();

  /**
   * Register a sound definition.
   */
  register(sound: SoundDefinition): void {
    this.sounds.set(sound.id, sound);
  }

  /**
   * Register multiple sounds.
   */
  registerAll(sounds: SoundDefinition[]): void {
    for (const s of sounds) this.register(s);
  }

  /**
   * Get a sound definition by ID.
   */
  get(id: string): SoundDefinition | undefined {
    return this.sounds.get(id);
  }

  /**
   * Check if a sound is registered.
   */
  has(id: string): boolean {
    return this.sounds.has(id);
  }

  /**
   * Get all sounds in a category.
   */
  getByCategory(category: string): SoundDefinition[] {
    return Array.from(this.sounds.values()).filter((s) => s.category === category);
  }

  /**
   * Get a random sound from a category (for variation).
   */
  getRandomFromCategory(category: string): SoundDefinition | undefined {
    const sounds = this.getByCategory(category);
    if (sounds.length === 0) return undefined;
    return sounds[Math.floor(Math.random() * sounds.length)];
  }

  /**
   * Get count of registered sounds.
   */
  get count(): number {
    return this.sounds.size;
  }

  /**
   * List all registered sound IDs.
   */
  listIds(): string[] {
    return Array.from(this.sounds.keys());
  }
}
