// ESLint 9+ flat config (replaces the old .eslintrc.js).
const js = require('@eslint/js')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const prettier = require('eslint-config-prettier')
const globals = require('globals')

module.exports = [
  {
    ignores: [
      '.webpack/**',
      'out/**',
      'node_modules/**',
      'icons/**',
      'webpack.*.js',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  react.configs.flat.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '^useDebouncedCallback$' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-extra-semi': 'off',
      eqeqeq: 'error',
      'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
  {
    // Ambient declaration files legitimately use `declare var` to expose globalThis members.
    files: ['**/*.d.ts'],
    rules: { 'no-var': 'off' },
  },
  prettier,
]
