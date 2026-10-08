import { defineConfig } from "vitest/config";
import { testRunnerDefaults } from "./vitest.settings";
import { localStandardAvailable, privateStandardTests } from "./vitest.config";
if (!localStandardAvailable) throw new Error("Collaudo dello standard non eseguibile: mancano gli export WinCC privati in standard/index.json e standard/screens/. Non scaricarli o inventarli: usa solo dati autorizzati. Vedi README.md.");
export default defineConfig({ test: { ...testRunnerDefaults, environment: "node", include: privateStandardTests } });
