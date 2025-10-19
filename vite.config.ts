import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Sett base til '/tablecore/' for GitHub Pages prosjekt-side
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? '/TableCore/' : '/',
})
