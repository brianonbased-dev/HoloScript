/**
 * @holoscript/core Island Detector
 *
 * Groups interacting rigid bodies into 'islands'.
 * Used for hierarchical sleeping and parallel solving.
 */

export interface BodyConnection {
  bodyA: string;
  bodyB: string;
}

export class IslandDetector {
  private bodies: Set<string> = new Set();
  private connections: BodyConnection[] = [];

  /**
   * Reset the detector state
   */
  public reset(): void {
    this.bodies.clear();
    this.connections = [];
  }

  /**
   * Add a body to the graph
   */
  public addBody(id: string): void {
    this.bodies.add(id);
  }

  /**
   * Add a connection (collision or constraint) between bodies
   */
  public addConnection(bodyA: string, bodyB: string): void {
    this.connections.push({ bodyA, bodyB });
  }

  /**
   * Detect islands using a Disjoint Set Union (DSU) or BFS
   */
  public detectIslands(): string[][] {
    const parent = new Map<string, string>();
    const bodiesArray = Array.from(this.bodies);

    // Initialize DSU
    for (const id of bodiesArray) {
      parent.set(id, id);
    }

    const find = (id: string): string => {
      let root = id;
      while (parent.get(root) !== root) {
        root = parent.get(root)!;
      }
      // Path compression
      while (parent.get(id) !== root) {
        const next = parent.get(id)!;
        parent.set(id, root);
        id = next;
      }
      return root;
    };

    const union = (id1: string, id2: string): void => {
      const root1 = find(id1);
      const root2 = find(id2);
      if (root1 !== root2) {
        parent.set(root1, root2);
      }
    };

    // Union bodies that are connected
    for (const conn of this.connections) {
      union(conn.bodyA, conn.bodyB);
    }

    // Group by root
    const islandsRaw = new Map<string, string[]>();
    for (const id of bodiesArray) {
      const root = find(id);
      if (!islandsRaw.has(root)) {
        islandsRaw.set(root, []);
      }
      islandsRaw.get(root)!.push(id);
    }

    return Array.from(islandsRaw.values());
  }
}
