import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs let one build run at a domain root or under a
  // GitHub Pages project path such as /TBR-Manager/.
  base: "./",
  plugins: [react()],
  server: { port: 3000, strictPort: true },
});
