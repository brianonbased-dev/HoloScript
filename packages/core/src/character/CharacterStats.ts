/**
 * CharacterStats — health, mana/stamina, strength, defense, speed.
 * Level-up scaling. Buff/debuff modifiers. Self-contained.
 */

export interface StatBlock {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  strength: number;
  defense: number;
  speed: number;
}

export interface Modifier {
  id: string;
  stat: keyof Omit<StatBlock, 'health' | 'mana' | 'stamina'>;
  /** Flat additive bonus (applied before multiplier). */
  flat?: number;
  /** Multiplicative bonus (1.0 = no change, 1.5 = +50%). */
  multiplier?: number;
  /** Duration in seconds. Undefined = permanent. */
  duration?: number;
  /** Remaining time in seconds. Managed by update(). */
  remaining?: number;
}

export interface CharacterStatsOptions {
  baseHealth?: number;
  baseMana?: number;
  baseStamina?: number;
  baseStrength?: number;
  baseDefense?: number;
  baseSpeed?: number;
  level?: number;
  /** Per-level scaling factor (default 0.1 = +10% per level). */
  levelScaling?: number;
}

export class CharacterStats {
  private _level: number;
  private _experience: number;
  private _experienceToLevel: number;
  private _baseHealth: number;
  private _baseMana: number;
  private _baseStamina: number;
  private _baseStrength: number;
  private _baseDefense: number;
  private _baseSpeed: number;
  private _currentHealth: number;
  private _currentMana: number;
  private _currentStamina: number;
  private _levelScaling: number;
  private _modifiers: Modifier[] = [];
  private _alive: boolean = true;

  constructor(options: CharacterStatsOptions = {}) {
    this._level = options.level ?? 1;
    this._experience = 0;
    this._experienceToLevel = this._calcExpToLevel(this._level);
    this._baseHealth = options.baseHealth ?? 100;
    this._baseMana = options.baseMana ?? 50;
    this._baseStamina = options.baseStamina ?? 100;
    this._baseStrength = options.baseStrength ?? 10;
    this._baseDefense = options.baseDefense ?? 5;
    this._baseSpeed = options.baseSpeed ?? 5;
    this._levelScaling = options.levelScaling ?? 0.1;

    // Start at full
    this._currentHealth = this.maxHealth;
    this._currentMana = this.maxMana;
    this._currentStamina = this.maxStamina;
  }

  // --- Computed stats (base * level scaling + modifiers) ---

  private _scaledBase(base: number): number {
    return base * (1 + (this._level - 1) * this._levelScaling);
  }

  private _applyModifiers(stat: Modifier['stat'], base: number): number {
    let flat = 0;
    let mult = 1;
    for (const m of this._modifiers) {
      if (m.stat !== stat) continue;
      flat += m.flat ?? 0;
      mult *= m.multiplier ?? 1;
    }
    return (base + flat) * mult;
  }

  get level(): number {
    return this._level;
  }

  get experience(): number {
    return this._experience;
  }

  get experienceToLevel(): number {
    return this._experienceToLevel;
  }

  get maxHealth(): number {
    return Math.round(this._applyModifiers('maxHealth', this._scaledBase(this._baseHealth)));
  }

  get health(): number {
    return Math.min(this._currentHealth, this.maxHealth);
  }

  get maxMana(): number {
    return Math.round(this._applyModifiers('maxMana', this._scaledBase(this._baseMana)));
  }

  get mana(): number {
    return Math.min(this._currentMana, this.maxMana);
  }

  get maxStamina(): number {
    return Math.round(this._applyModifiers('maxStamina', this._scaledBase(this._baseStamina)));
  }

  get stamina(): number {
    return Math.min(this._currentStamina, this.maxStamina);
  }

  get strength(): number {
    return Math.round(this._applyModifiers('strength', this._scaledBase(this._baseStrength)));
  }

  get defense(): number {
    return Math.round(this._applyModifiers('defense', this._scaledBase(this._baseDefense)));
  }

  get speed(): number {
    return Math.round(this._applyModifiers('speed', this._scaledBase(this._baseSpeed)));
  }

  get isAlive(): boolean {
    return this._alive;
  }

  get stats(): StatBlock {
    return {
      health: this.health,
      maxHealth: this.maxHealth,
      mana: this.mana,
      maxMana: this.maxMana,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      strength: this.strength,
      defense: this.defense,
      speed: this.speed,
    };
  }

  // --- Mutations ---

  takeDamage(amount: number): number {
    if (!this._alive || amount <= 0) return 0;
    const mitigated = Math.max(1, amount - this.defense);
    this._currentHealth = Math.max(0, this._currentHealth - mitigated);
    if (this._currentHealth <= 0) {
      this._alive = false;
    }
    return mitigated;
  }

  heal(amount: number): number {
    if (!this._alive || amount <= 0) return 0;
    const before = this._currentHealth;
    this._currentHealth = Math.min(this.maxHealth, this._currentHealth + amount);
    return this._currentHealth - before;
  }

  spendMana(amount: number): boolean {
    if (amount <= 0 || this._currentMana < amount) return false;
    this._currentMana -= amount;
    return true;
  }

  restoreMana(amount: number): number {
    if (amount <= 0) return 0;
    const before = this._currentMana;
    this._currentMana = Math.min(this.maxMana, this._currentMana + amount);
    return this._currentMana - before;
  }

  spendStamina(amount: number): boolean {
    if (amount <= 0 || this._currentStamina < amount) return false;
    this._currentStamina -= amount;
    return true;
  }

  restoreStamina(amount: number): number {
    if (amount <= 0) return 0;
    const before = this._currentStamina;
    this._currentStamina = Math.min(this.maxStamina, this._currentStamina + amount);
    return this._currentStamina - before;
  }

  /** Revive with a fraction of max health (default 50%). */
  revive(healthFraction: number = 0.5): void {
    this._alive = true;
    this._currentHealth = Math.round(this.maxHealth * Math.max(0.1, Math.min(1, healthFraction)));
  }

  // --- Experience & leveling ---

  addExperience(amount: number): number {
    if (amount <= 0) return 0;
    this._experience += amount;
    let levelsGained = 0;
    while (this._experience >= this._experienceToLevel) {
      this._experience -= this._experienceToLevel;
      this._level++;
      levelsGained++;
      this._experienceToLevel = this._calcExpToLevel(this._level);
      // Restore to full on level-up
      this._currentHealth = this.maxHealth;
      this._currentMana = this.maxMana;
      this._currentStamina = this.maxStamina;
    }
    return levelsGained;
  }

  private _calcExpToLevel(level: number): number {
    // Quadratic curve: 100 * level^1.5
    return Math.round(100 * Math.pow(level, 1.5));
  }

  // --- Modifiers ---

  addModifier(modifier: Modifier): void {
    const m = { ...modifier };
    if (m.duration !== undefined) {
      m.remaining = m.duration;
    }
    this._modifiers.push(m);
  }

  removeModifier(id: string): boolean {
    const idx = this._modifiers.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this._modifiers.splice(idx, 1);
    return true;
  }

  getModifiers(): ReadonlyArray<Modifier> {
    return [...this._modifiers];
  }

  /** Tick modifier durations. Removes expired modifiers. */
  update(deltaTime: number): void {
    if (deltaTime <= 0) return;
    this._modifiers = this._modifiers.filter((m) => {
      if (m.remaining === undefined) return true; // permanent
      m.remaining -= deltaTime;
      return m.remaining > 0;
    });
  }
}
