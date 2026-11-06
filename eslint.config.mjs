import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['electron/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Architecture guard: audio, MIDI, sequencer, and project layers must not depend on React.
    files: [
      'src/audio/**',
      'src/midi/**',
      'src/sequencer/**',
      'src/project/**',
      'src/persistence/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-dom', 'react/*', '**/components/**', '**/app/**'] },
      ],
    },
  },
)
