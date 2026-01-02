import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Custom domain usually works best with root base unless using a project page without CNAME
  base: '/', 
  build: {
    outDir: 'dist',
  }
})