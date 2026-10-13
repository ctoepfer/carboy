import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "react",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../shell-tauri/ui/graph-react", emptyOutDir: true },
});
