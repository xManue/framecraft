import { defineConfig } from "vitest/config";
import { testRunnerDefaults } from "./vitest.settings";
import { existsSync, readdirSync, readFileSync } from "node:fs";

export const privateStandardTests = readdirSync(new URL("./tests/", import.meta.url))
  .filter((name) => name.endsWith(".test.ts") && readFileSync(new URL("./tests/" + name, import.meta.url), "utf8").includes("../standard/"))
  .map((name) => "tests/" + name);
export const localStandardAvailable = existsSync(new URL("./standard/index.json", import.meta.url)) && existsSync(new URL("./standard/screens/", import.meta.url));
if (!localStandardAvailable) console.warn(`Export WinCC privati non presenti: ${privateStandardTests.length} file di test di riferimento esclusi. Vedi README.md; i test pubblici restano attivi.`);

export default defineConfig({
  test: {
    ...testRunnerDefaults,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/_scratch.test.ts", ...(localStandardAvailable ? [] : privateStandardTests)],
  },
});
