/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: '个人工作台',
        short_name: '工作台',
        description: '每日计划、习惯打卡、记账、长期目标与内容记录',
        lang: 'zh-CN',
        theme_color: '#15110c',
        background_color: '#f8f4ed',
        display: 'standalone',
        start_url: '/',
        share_target: {
          action: '/share',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' }
        },
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ],
  server: {
    port: 5173,
    host: true,
    // E2E（playwright webServer 注入 E2E=1）禁用 HMR：离线模拟会切断
    // HMR websocket 并触发 vite 客户端整页刷新，破坏离线场景的断言。
    hmr: process.env.E2E === '1' ? false : undefined,
    fs: {
      // 显式允许项目根目录：中文路径下 searchForWorkspaceRoot 的默认推断
      // 可能因编码差异判定失败，导致带查询参数的 SPA 路由 403 Restricted。
      allow: [fileURLToPath(new URL('.', import.meta.url))],
      // E2E 放宽 fs 严格检查：/share?title=中文 这类带编码查询参数的
      // SPA 路由在中文项目路径下仍可能被 vite 误判为 allow list 之外。
      strict: process.env.E2E !== '1'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'data-vendor': ['@supabase/supabase-js', '@tanstack/react-query'],
          'icons-vendor': ['lucide-react']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}']
  }
})
