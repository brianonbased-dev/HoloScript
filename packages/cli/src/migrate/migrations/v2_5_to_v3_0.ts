import { Migration } from '../MigrationRunner';

export const migration_v2_5_to_v3_0: Migration = {
  from: '2.5.0',
  to: '3.0.0',
  transforms: [
    {
      name: 'rename-interactive-to-interactable',
      description: 'Rename @interactive to @interactable',
      transform(source) {
        return source.replace(/@interactive\b/g, '@interactable');
      },
    },
    {
      name: 'update-composition-syntax',
      description: 'Add required composition keyword before scene names',
      transform(source) {
        return source.replace(/\bscene\s+"/g, 'composition "');
      },
    },
  ],
};
