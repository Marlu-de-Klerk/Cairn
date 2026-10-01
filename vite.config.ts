import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Copies the built index.html to 404.html. Static hosts (Render, GitHub Pages, Netlify) serve 404.html for any path
 * that isn't a file, so opening or refreshing /g/<id> or /sign-in still loads the app, which then routes itself, even
 * where no rewrite rule has been set up. Asset URLs are absolute (/assets/...), so the copy works at any depth.
 */
function spaFallback(): Plugin {
  let outDir = 'dist'
  return {
    name: 'cairn-spa-404-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback()],
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
