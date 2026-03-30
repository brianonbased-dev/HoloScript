// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

// @ts-check
import tseslint from 'typescript-eslint';

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
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
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
      'prefer-const': 'error',
      'no-useless-escape': 'off',
      'no-constant-condition': 'off',
      'no-empty': 'off',
      'no-useless-catch': 'off',
      'no-control-regex': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off',
    },
  },
  storybook.configs['flat/recommended']
);
