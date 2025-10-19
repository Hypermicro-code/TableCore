export const VITE_CONFIG_TS = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


// Sett base til '/<repo-name>/' for GitHub Pages (erstatt repo-navn ved behov)
export default defineConfig({
plugins: [react()],
base: process.env.GITHUB_PAGES === 'true' ? '/tablecore-mvp/' : '/',
})
`;
