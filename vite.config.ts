import { defineConfig, type PluginOption } from 'vite'
import Vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { rm } from 'node:fs/promises'

const excludeLegacyPublicAssetsFromBuild = (): PluginOption => ({
  name: 'exclude-legacy-public-assets-from-build',
  apply: 'build',
  async closeBundle() {
    await Promise.all(
      ['demo', 'data', 'images', 'libarchive.wasm'].map((relativePath) =>
        rm(fileURLToPath(new URL(`./dist/${relativePath}`, import.meta.url)), {
          recursive: true,
          force: true
        })
      )
    )
  }
})

export default defineConfig({
  base: './',
  envDir: 'env',
  plugins: [excludeLegacyPublicAssetsFromBuild(), Vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) return 'vendor'
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    assetsInlineLimit: 2048
  },
  server: {
    port: 3000,
    host: '127.0.0.1',
    proxy: {
      '/api/finance': {
        target: process.env.FINANCE_API_PROXY_TARGET ?? 'http://127.0.0.1:18787',
        changeOrigin: false
      }
    }
  },
  preview: {
    port: 5555,
    host: '127.0.0.1'
  }
})
