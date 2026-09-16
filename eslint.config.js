import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Electron IPC API và dynamic typing buộc phải dùng any — cho phép
      '@typescript-eslint/no-explicit-any': 'off',
      // Empty catch blocks là pattern chủ đích (silent fallback) — cho phép
      'no-empty': ['error', { allowEmptyCatch: true }],
      // React Compiler warnings — tắt các rule không áp dụng cho codebase này
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // no-control-regex: intentional cho biometric attendance
      'no-control-regex': 'off',
    },
  },
])
