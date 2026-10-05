import { readFileSync } from "node:fs";

export function framecraftGatewayProxy() {
  const catalog = JSON.parse(readFileSync(new URL("../framecraft.connections.json", import.meta.url), "utf8"));
  const config = catalog.gateway; if (config?.enabled !== true) return {};
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535 || config.host !== undefined && config.host !== "127.0.0.1"
    || typeof config.tokenEnv !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.tokenEnv) || config.tokenEnv.startsWith("VITE_") || Object.hasOwn(config, "token")) throw new Error("Configurazione proxy gateway non valida: token solo nell'ambiente server, mai VITE_*.");
  const token = process.env[config.tokenEnv]; if (!token || !/^[A-Za-z0-9_\-+/=]{32,512}$/.test(token)) throw new Error("Token gateway non disponibile per il proxy locale.");
  return { "/_framecraft/plc/v1": { target: "http://127.0.0.1:" + config.port, changeOrigin: true,
    configure(proxy) { proxy.on("proxyReq", (request) => request.setHeader("Authorization", "Bearer " + token)); } } };
}
