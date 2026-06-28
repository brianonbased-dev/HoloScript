export interface HoloMeshPostgresPoolOptions {
  connectionString: string;
  ssl: false | { rejectUnauthorized: false };
}

export function createHoloMeshPostgresPoolOptions(
  databaseUrl: string
): HoloMeshPostgresPoolOptions {
  return {
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  };
}
