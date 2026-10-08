import { defineConfig } from "vitest/config";
import config, { privateStandardTests } from "./vitest.config";

export default defineConfig({
  test: {
    ...config.test,
    exclude: [...(config.test?.exclude ?? []), ...privateStandardTests],
  },
});
