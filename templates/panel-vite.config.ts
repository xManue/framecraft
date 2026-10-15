import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { framecraftGatewayProxy } from "./runtime/vite-gateway.mjs";

const proxy = framecraftGatewayProxy();
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", proxy },
  preview: { host: "127.0.0.1", proxy },
  build: {
    license: { fileName: "THIRD_PARTY_NOTICES.md" },
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          if (path.includes("/node_modules/")) return "vendor";
          if (path.includes("/src/framecraft") || path.includes("/runtime/")) return "hmi-runtime";
        },
      },
    },
  },
});
