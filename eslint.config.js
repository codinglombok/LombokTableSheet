// ESLint 9 flat config. The old `.eslintrc` + `--ext` invocation stopped working
// when ESLint 9 removed both; this replaces them.
//
// Scope is deliberately narrow: correctness rules that catch real bugs, not
// stylistic ones. Formatting is not enforced here — there is no Prettier in this
// repo, and a linter that argues about quotes is a linter people learn to skip.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'ports/**', 'docs/**', 'benchmarks/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      // The codebase uses `any` deliberately in a few boundary spots (hook
      // payloads, JSON walking). Flag them as warnings so they stay visible
      // without failing CI.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
