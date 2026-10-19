import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const previewDirectory = fileURLToPath(new URL("./.hmi-preview", import.meta.url)).replace(/\\/g, "/");
const isPreviewArtifact = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  return normalized === previewDirectory || normalized.startsWith(previewDirectory + "/");
};

const browserProcessEnv = {
  "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
  "process.env.BABEL_TYPES_8_BREAKING": "false",
  "process.env.DEBUG": "undefined",
  "process.env.FORCE_COLOR": "undefined",
};

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: browserProcessEnv,
  optimizeDeps: { entries: ["index.html"], esbuildOptions: { define: browserProcessEnv } },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: [isPreviewArtifact, "**/src-tauri/target/**", "**/src-tauri/gen/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  // I moduli Runtime sono generati dal sorgente delle funzioni: i nomi devono restare stabili.
  build: { minify: false, target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13" },
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
});
