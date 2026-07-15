import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const declarations = ['const', 'let', 'var'];

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      'package-lock.json',
      '.git/**',
      '.atl/**',
      'openspec/**',
      'coverage/**',
      'dist/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', '*.ts'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
      },
    },
    rules: {
      curly: ['error', 'all'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'expression', next: declarations },
        { blankLine: 'always', prev: declarations, next: 'block-like' },
        { blankLine: 'always', prev: 'block-like', next: declarations },
        { blankLine: 'any', prev: declarations, next: declarations },
      ],
    },
  },
);
