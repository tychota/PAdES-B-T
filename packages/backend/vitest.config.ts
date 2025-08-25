import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/*.spec.ts"],
    },
  },
  resolve: {
    alias: {
      "@pades-poc/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
