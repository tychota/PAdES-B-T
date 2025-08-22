import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    },
  },
  resolve: {
    alias: {
      "@pades-poc/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
