import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // En desarrollo, los pedidos a /api se reenvían al backend (npm run dev en la carpeta backend)
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
