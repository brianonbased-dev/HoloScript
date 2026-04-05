/**
 * Quorum Policy
 *
 * Enforces minimum size requirements for swarm operations.
 */

export interface QuorumConfig {
  minimumSize: number;
  optimalSize: number;
  maximumSize: number;
  requireQuorumForOperations: boolean;
  quorumPercentage: number; // 0-1, percentage of optimal size required
}

const DEFAULT_CONFIG: QuorumConfig = {
  minimumSize: 2,
  optimalSize: 5,
  maximumSize: 50,
  requireQuorumForOperations: true,
  quorumPercentage: 0.5,
};

export type QuorumStatus = 'below-minimum' | 'quorum' | 'optimal' | 'above-maximum';

export interface QuorumState {
  currentSize: number;
  status: QuorumStatus;
  hasQuorum: boolean;
  canOperate: boolean;
  requiredForQuorum: number;
  spotsAvailable: number;
}

/**
 * Manages quorum requirements for a swarm
 */
export class QuorumPolicy {
  private config: QuorumConfig;
  private currentSize = 0;

  constructor(config: Partial<QuorumConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.minimumSize > this.config.optimalSize) {
      throw new Error('minimumSize cannot exceed optimalSize');
    }
    if (this.config.optimalSize > this.config.maximumSize) {
      throw new Error('optimalSize cannot exceed maximumSize');
    }
    if (this.config.quorumPercentage < 0 || this.config.quorumPercentage > 1) {
      throw new Error('quorumPercentage must be between 0 and 1');
    }
  }

  /**
   * Update the current member count
   */
  setMemberCount(count: number): void {
    this.currentSize = Math.max(0, count);
  }

  /**
   * Check if a new member can join
   */
  canJoin(): boolean {
    return this.currentSize < this.config.maximumSize;
  }

  /**
   * Check if a member can leave without breaking quorum
   */
  canLeave(): boolean {
    const afterLeave = this.currentSize - 1;
    return afterLeave >= this.config.minimumSize;
  }

  /**
   * Check if the swarm has achieved quorum
   */
  hasQuorum(): boolean {
    const requiredForQuorum = Math.ceil(this.config.optimalSize * this.config.quorumPercentage);
    return this.currentSize >= Math.max(this.config.minimumSize, requiredForQuorum);
  }

  /**
   * Check if the swarm can operate
   */
  canOperate(): boolean {
    if (!this.config.requireQuorumForOperations) {
      return this.currentSize > 0;
    }
    return this.hasQuorum();
  }

  /**
   * Get the current quorum status
   */
  getStatus(): QuorumStatus {
    if (this.currentSize < this.config.minimumSize) {
      return 'below-minimum';
    }
    if (this.currentSize > this.config.maximumSize) {
      return 'above-maximum';
    }
    if (this.currentSize >= this.config.optimalSize) {
      return 'optimal';
    }
    return 'quorum';
  }

  /**
   * Get full quorum state
   */
  getState(): QuorumState {
    const requiredForQuorum = Math.ceil(this.config.optimalSize * this.config.quorumPercentage);
    const actualRequired = Math.max(this.config.minimumSize, requiredForQuorum);

    return {
      currentSize: this.currentSize,
      status: this.getStatus(),
      hasQuorum: this.hasQuorum(),
      canOperate: this.canOperate(),
      requiredForQuorum: Math.max(0, actualRequired - this.currentSize),
      spotsAvailable: Math.max(0, this.config.maximumSize - this.currentSize),
    };
  }

  /**
   * Check if the swarm should seek more members
   */
  shouldRecruit(): boolean {
    return this.currentSize < this.config.optimalSize;
  }

  /**
   * Check if the swarm should consider splitting
   */
  shouldSplit(): boolean {
    return this.currentSize > this.config.maximumSize;
  }

  /**
   * Calculate the health score of the swarm (0-1)
   */
  getHealthScore(): number {
    if (this.currentSize === 0) return 0;
    if (this.currentSize < this.config.minimumSize) {
      return (this.currentSize / this.config.minimumSize) * 0.5;
    }
    if (this.currentSize > this.config.maximumSize) {
      const excess = this.currentSize - this.config.maximumSize;
      const penalty = excess / this.config.maximumSize;
      return Math.max(0.5, 1 - penalty * 0.5);
    }
    if (this.currentSize >= this.config.optimalSize) {
      return 1;
    }
    // Between minimum and optimal
    const range = this.config.optimalSize - this.config.minimumSize;
    const position = this.currentSize - this.config.minimumSize;
    return 0.5 + (position / range) * 0.5;
  }

  /**
   * Get the config
   */
  getConfig(): QuorumConfig {
    return { ...this.config };
  }
}
