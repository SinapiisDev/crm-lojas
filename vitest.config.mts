import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import path from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" quebra fora do bundler do Next; nos testes vira módulo vazio.
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-vazio.ts"),
    },
  },
  test: { environment: "node", testTimeout: 20000, exclude: ["node_modules", "tests/e2e/**"] },
});
