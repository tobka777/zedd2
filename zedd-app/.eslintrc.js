module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  settings: {
    react: { version: 'detect' }
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'prettier/@typescript-eslint',
  ],
  rules: {
    'yoda': ['warn', 'always', { 'onlyEquality': true }],
    'react-hooks/rules-of-hooks': 'error',
    'react/no-unescaped-entities': 'off',
    'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '^useDebouncedCallback$' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    'prefer-const': ['error', {
      'destructuring': 'all',
    }],
    'no-extra-semi': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    'eqeqeq': 'error',
    '@typescript-eslint/no-unused-vars': ['off'],
    'no-constant-condition': ['warn', { checkLoops: false }]
  },
}
