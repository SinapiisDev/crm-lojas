import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Exige `npm run db:start`. Usa o Chrome instalado na máquina.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:3000", channel: "chrome", locale: "pt-BR" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true },
});
