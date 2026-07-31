import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// renderer 用 vite dev server；main/preload 用 tsc 构建（package.json build:main）
export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  }
})
