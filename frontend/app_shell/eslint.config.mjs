// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Lint de TypeScript para este frontend. No cubre los templates HTML: eso
// requiere angular-eslint, que se puede sumar mas adelante (ver
// docs/plan-calidad-software.md, Item 3).
//
// Las reglas ruidosas entran como `warn` a proposito: al prender el lint por
// primera vez aparecen `any` y `console` preexistentes que no estan anotados, y
// dejarlas en `error` haria fallar el CI desde el minuto cero. Se promueven a
// `error` de a una, en commits aparte.
export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      '.angular/**',
      'node_modules/**',
      'federation.config.js',
      'vitest.config.*',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // El `_` como prefijo ya es la convencion del codigo para un parametro
      // que existe por la firma pero no se usa (`_node`, `_source`, `_`).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // En los tests, `any` y `console` son herramientas legitimas.
    files: ['**/*.spec.ts', '**/testing/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);
