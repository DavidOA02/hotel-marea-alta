import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**',
    '**/next-env.d.ts', '**/.obsidian/**', '.playwright-mcp/**',
  ]),
  {
    files: ['tools/**/*.{js,mjs}', 'eslint.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{js,mjs,ts,tsx}'],
    extends: [...nextVitals, ...nextTypescript],
    settings: { next: { rootDir: 'apps/web/' } },
    rules: {
      // Se mantienen visibles para revisar gradualmente los efectos de formularios y datos.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    languageOptions: { globals: globals.jest },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // El proyecto usa any para filas SQL y respuestas externas sin un tipo estable.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true,
      }],
    },
  },
]);
