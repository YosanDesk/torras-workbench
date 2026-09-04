import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "github-pages",
  base: "/torras-workbench/",
  plugins: [react()],
  build: { outDir: "../pages-dist", emptyOutDir: true },
});
