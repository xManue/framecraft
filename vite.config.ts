import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
  optimizeDeps: { esbuildOptions: { define: browserProcessEnv } },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/target/**", "**/src-tauri/gen/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13" },
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
});
