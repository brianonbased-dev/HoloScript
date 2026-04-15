export interface SoundDef {
  id: string;
  name: string;
  duration: number;
  category: string;
  volume: number;
  loop: boolean;
}

/** Alias for backwards-compatible test imports */
export type SoundDefinition = SoundDef;

export class SoundPool {
  private sounds: Map<string, SoundDef> = new Map();

  register(sound: SoundDef): void {
    this.sounds.set(sound.id, sound);
  }

  registerAll(sounds: SoundDef[]): void {
    for (const sound of sounds) {
      this.register(sound);
    }
  }

  has(id: string): boolean {
    return this.sounds.has(id);
  }

  get(id: string): SoundDef | undefined {
    return this.sounds.get(id);
  }

  get count(): number {
    return this.sounds.size;
  }

  getByCategory(category: string): SoundDef[] {
    return [...this.sounds.values()].filter((s) => s.category === category);
  }

  getRandomFromCategory(category: string): SoundDef | undefined {
    const matches = this.getByCategory(category);
    if (matches.length === 0) return undefined;
    return matches[Math.floor(Math.random() * matches.length)];
  }

  listIds(): string[] {
    return Array.from(this.sounds.keys());
  }
}
