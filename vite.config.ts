import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE must be "/<repo-name>/" when deploying to a GitHub Pages project site.
// The dev server forwards /api to the local game server, so no CORS setup is needed locally.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.DEV_API_TARGET || 'http://localhost:8787'
  return {
    base: env.VITE_BASE || '/',
    plugins: [react()],
    server: { host: true, port: 5173, proxy: { '/api': { target, changeOrigin: true } } },
    preview: { host: true, port: 4173, proxy: { '/api': { target, changeOrigin: true } } },
  }
})
