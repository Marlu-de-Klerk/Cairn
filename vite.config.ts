import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    setupFiles: ['./tests/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          exclude: ['tests/rls/**', 'node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'rls',
          environment: 'node',
          include: ['tests/rls/**'],
        },
      },
    ],
  },
})
