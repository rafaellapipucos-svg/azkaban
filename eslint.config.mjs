import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const browserGlobals = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage'].map(
  (name) => ({ name, message: 'Browser APIs live in packages/platform.' }),
);

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.expo/**', '**/dist/**', '**/.turbo/**', 'supabase/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-globals': ['error', ...browserGlobals],
      // ponytail: flags any object key, not only style ones; a props object can use the JSX prop instead.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='pointerEvents']",
          message:
            'Use the pointerEvents prop: react-native-web 0.21 drops it from styles (QA6C-1, Fab, NotificationToaster).',
        },
      ],
    },
  },
  { files: ['packages/platform/**'], rules: { 'no-restricted-globals': 'off' } },
  {
    // Config files run in Node and legitimately use CommonJS.
    files: [
      '**/*.cjs',
      '**/metro.config.js',
      '**/babel.config.js',
      '**/tailwind.config.ts',
      'scripts/**',
      'e2e/**',
      'playwright.config.ts',
    ],
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
);
