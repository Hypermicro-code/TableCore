import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VIKTIG: Bytt REPO_NAVN til repo-navnet ditt (nøyaktig samme store/små bokstaver)
export default defineConfig({
  plugins: [react()],
  base: '/TableCore/',     // <- må matche GitHub Pages sti
})
