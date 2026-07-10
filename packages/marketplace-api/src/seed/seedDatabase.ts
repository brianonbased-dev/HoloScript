/**
 * @fileoverview Curated marketplace seed.
 * @module marketplace-api/seed/seedDatabase
 *
 * Populates an empty trait database with the curated, hand-verified set of
 * first-party HoloScript core traits (see ./curated-traits.json). Every entry
 * maps to a genuinely-implemented trait in packages/core/src/traits — stubs and
 * facades were excluded during verification, and each record's `export` field
 * is the symbol verified importable from '@holoscript/core/traits'. Stats are
 * honest zeros; these are freshly listed, not fabricated.
 *
 * Idempotent: skips seeding when the database already contains traits, so it is
 * safe to call on every server boot (Railway starts with an empty Postgres).
 */

import type { ITraitDatabase } from '../TraitRegistry.js';
import type { TraitPackage, Platform, TraitCategory, LicenseType } from '../types.js';
import curatedData from './curated-traits.json';

interface CuratedRecord {
  name: string;
  trait: string;
  export: string;
  category: TraitCategory;
  description: string;
  keywords: string[];
}

interface CuratedMeta {
  author: string;
  license: LicenseType;
  version: string;
  platformsByCategory: Record<string, Platform[]>;
}

const meta = (curatedData as { _meta: CuratedMeta })._meta;
const records = (curatedData as { traits: CuratedRecord[] }).traits;

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** Build a full TraitPackage from a curated record. */
export function buildCuratedPackage(record: CuratedRecord, now: Date): TraitPackage {
  const platforms = meta.platformsByCategory[record.category] ?? ['web'];
  return {
    id: `hs-core-${kebab(record.name)}`,
    name: record.name,
    version: meta.version,
    description: record.description,
    author: { name: meta.author, verified: true },
    license: meta.license,
    keywords: record.keywords,
    homepage: 'https://www.holoscript.net',
    dependencies: {},
    peerDependencies: { '@holoscript/core': '*' },
    source: `import { ${record.export} } from '@holoscript/core/traits';`,
    platforms,
    category: record.category,
    // First-party core traits, verified during curation. Not deprecated.
    verified: true,
    deprecated: false,
    // Honest zero stats — freshly listed, no fabricated downloads/ratings.
    downloads: 0,
    weeklyDownloads: 0,
    rating: 0,
    ratingCount: 0,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  };
}

export interface SeedResult {
  inserted: number;
  skipped: boolean;
  total: number;
}

/**
 * Seed the database with curated traits if it is empty.
 * @param db   trait database (Postgres in prod, in-memory in dev)
 * @param opts force=true re-inserts even when the DB is non-empty
 */
export async function seedCuratedTraits(
  db: ITraitDatabase,
  opts: { force?: boolean } = {}
): Promise<SeedResult> {
  if (!opts.force) {
    const existing = await db.search({ limit: 1 });
    if (existing.total > 0) {
      return { inserted: 0, skipped: true, total: existing.total };
    }
  }

  const now = new Date();
  let inserted = 0;
  for (const record of records) {
    await db.insertTrait(buildCuratedPackage(record, now));
    inserted++;
  }

  return { inserted, skipped: false, total: inserted };
}

/** Number of curated traits available to seed. */
export const CURATED_TRAIT_COUNT = records.length;
