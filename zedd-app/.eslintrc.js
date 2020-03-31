module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'prettier/@typescript-eslint',
  ],
  rules: {
    'yoda': ['warn', 'always', { "onlyEquality": true }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    'eqeqeq': 'error',
    '@typescript-eslint/no-unused-vars': ['warn', { 'varsIgnorePattern': '^_' }],
    'no-constant-condition': ['warn', { checkLoops: false }]
  },
}
