import { Migration } from '../MigrationRunner';

export const migration_v2_1_to_v2_5: Migration = {
  from: '2.1.0',
  to: '2.5.0',
  transforms: [
    {
      name: 'rename-clickable-to-interactive',
      description: 'Rename @clickable trait to @interactive',
      transform(source) {
        return source.replace(/@clickable\b/g, '@interactive');
      },
    },
    {
      name: 'update-physics-gravity',
      description: 'Update @physics gravity from scalar to vector',
      transform(source) {
        return source.replace(
          /@physics\(gravity:\s*([\d.]+)\)/g,
          (_, v) => `@physics(gravity: [0, -${v}, 0])`
        );
      },
    },
    {
      name: 'rename-orb-to-object',
      description: 'Rename legacy orb keyword to object',
      transform(source) {
        return source.replace(/\borb\b/g, 'object');
      },
    },
  ],
};
