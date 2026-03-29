import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    svelte(),
    viteSingleFile()
  ],
  server: {
    proxy: {
      '/manifest.json': {
        target: 'http://localhost:5173',
        rewrite: () => '/data/manifest.json'
      },
      '/catalog.json': {
        target: 'http://localhost:5173',
        rewrite: () => '/data/catalog.json'
      }
    }
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
})
