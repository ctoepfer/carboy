import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({
  root: "svelte",
  base: "./",
  plugins: [svelte()],
  build: { outDir: "../../shell-tauri/ui/graph-svelte", emptyOutDir: true },
});
