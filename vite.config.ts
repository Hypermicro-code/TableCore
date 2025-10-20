import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// For GitHub Pages i et repo (ikke custom domain), bruk base: "/<repo-navn>/"
// For enkelhet settes base til "./" slik at paths blir relative.
export default defineConfig({
  plugins: [react()],
  base: "./"
})
