import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ⚠️ Endre "brukernavn" og "repo-navn" til dine faktiske verdier
export default defineConfig({
  plugins: [react()],
  base: '/repo-navn/' // ← endre denne!
})
