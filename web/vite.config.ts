import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/cuni-theses-project/")
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [svelte()],
  test: { include: ['src/**/*.test.ts'] },
})
