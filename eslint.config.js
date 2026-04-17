// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';
import reactHooks from 'eslint-plugin-react-hooks';
import { createRequire } from 'node:module';

// @ts-check
import tseslint from 'typescript-eslint';

// Local rules — see tools/eslint-rules/. NORTH_STAR DT-14 governs dogfooding policy.
const requireLocal = createRequire(import.meta.url);
const holoscriptPlugin = {
  rules: {
    'no-regex-hs-parsing': requireLocal('./tools/eslint-rules/no-regex-hs-parsing.cjs'),
  },
};

export default tseslint.config(
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      'packages/benchmark/**',
      'packages/vscode-extension/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/*.js',
      '**/__tests__/**',
      '**/*.test.ts',
    ],
  }, // Base config for all TypeScript files
  tseslint.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-case-declarations': 'off',
      'no-fallthrough': 'off',
      'prefer-const': 'warn',
      'no-useless-escape': 'off',
      'no-constant-condition': 'off',
      'no-empty': 'off',
      'no-useless-catch': 'off',
      'no-control-regex': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off',
    },
  },
  storybook.configs['flat/recommended'],
  // React hooks — only applies to .tsx files in studio
  {
    files: ['packages/studio/**/*.tsx', 'packages/studio/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  // HoloScript dogfooding — NORTH_STAR DT-14. Block regex-based HS parsing
  // outside @holoscript/core. Rule self-exempts packages/core/**, __tests__/**,
  // and tools/eslint-rules/** (see tools/eslint-rules/no-regex-hs-parsing.cjs).
  {
    plugins: { holoscript: holoscriptPlugin },
    rules: {
      'holoscript/no-regex-hs-parsing': 'error',
    },
  }
);
