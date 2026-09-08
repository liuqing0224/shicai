import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  const apiPort = Number(env.PORT || 8897)
  return {
    envDir: '..',
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT || 5283),
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
