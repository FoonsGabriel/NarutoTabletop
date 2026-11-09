import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // A sala (mapa com PixiJS) é carregada à parte e passa um pouco de 500 kB; é esperado.
    chunkSizeWarningLimit: 900,
  },
})
