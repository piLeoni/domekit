import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset paths: the app lives in the URL fragment, so it runs from
  // any folder (GitHub Pages serves it under /geodesic/).
  base: './',
  plugins: [react(), tailwindcss()],
})
