import {
  createRailwayPostgresPoolOptions,
  type RailwayPostgresPoolOptions,
} from '../postgres-pool-options';

export type HoloMeshPostgresPoolOptions = RailwayPostgresPoolOptions;

export function createHoloMeshPostgresPoolOptions(
  databaseUrl: string
): HoloMeshPostgresPoolOptions {
  return createRailwayPostgresPoolOptions(databaseUrl);
}
