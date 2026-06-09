import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base ("./") so the build works whether it is served from the
// domain root or a GitHub Pages project subpath (e.g. /dashboards/world-cup/).
// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react()],
});
