export class ASTNodePool<T extends object> {
  private pool: T[] = [];
  private factory: () => T;
  private resetter: (node: T) => void;

  /**
   * @param factory Creates a fresh instance of the node.
   * @param resetter Resets the node state before it is handed out again.
   * @param initialCapacity How many nodes to pre-allocate.
   */
  constructor(factory: () => T, resetter: (node: T) => void, initialCapacity: number = 10000) {
    this.factory = factory;
    this.resetter = resetter;
    for (let i = 0; i < initialCapacity; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * Acquire a node from the pool, or create a new one if the pool is empty.
   */
  public acquire(): T {
    if (this.pool.length > 0) {
      const node = this.pool.pop()!;
      this.resetter(node);
      return node;
    }
    return this.factory();
  }

  /**
   * Release a node back to the pool to be reused.
   */
  public release(node: T): void {
    this.pool.push(node);
  }

  /**
   * Release an array of nodes back to the pool.
   */
  public releaseAll(nodes: T[]): void {
    for (const node of nodes) {
      this.pool.push(node);
    }
  }

  /**
   * Clear the pool, allowing garbage collection.
   */
  public clear(): void {
    this.pool.length = 0;
  }
}
