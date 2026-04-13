/**
 * SpatialSharder
 *
 * Divides the volumetric server space into discrete 100m³ cubic sectors.
 * Allows O(1) dropping of network traffic entirely outside of a node's boundaries
 * without iterating massive distance mathematical checks.
 */

export class SpatialSharder {
  public static readonly SHARD_SIZE = 100;

  /**
   * Maps an absolute position to a unique Shard ID string.
   */
  static getShardId(x: number, y: number, z: number): string {
    const sx = Math.floor(x / this.SHARD_SIZE);
    const sy = Math.floor(y / this.SHARD_SIZE);
    const sz = Math.floor(z / this.SHARD_SIZE);
    return `shard_${sx}_${sy}_${sz}`;
  }

  /**
   * Calculates all overlapping shards for a given bounding sphere or interaction radius.
   */
  static getOverlappingShards(x: number, y: number, z: number, radius: number): string[] {
    const shards = new Set<string>();

    const minX = Math.floor((x - radius) / this.SHARD_SIZE);
    const maxX = Math.floor((x + radius) / this.SHARD_SIZE);
    const minY = Math.floor((y - radius) / this.SHARD_SIZE);
    const maxY = Math.floor((y + radius) / this.SHARD_SIZE);
    const minZ = Math.floor((z - radius) / this.SHARD_SIZE);
    const maxZ = Math.floor((z + radius) / this.SHARD_SIZE);

    for (let ix = minX; ix <= maxX; ix++) {
      for (let iy = minY; iy <= maxY; iy++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          shards.add(`shard_${ix}_${iy}_${iz}`);
        }
      }
    }

    return Array.from(shards);
  }
}
