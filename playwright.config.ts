import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const workspaceTmp = fileURLToPath(new URL("./.codex-tmp/playwright-tmp/", import.meta.url));
mkdirSync(workspaceTmp, { recursive: true });
process.env.TMPDIR = process.env.TMPDIR || workspaceTmp;
process.env.TEMP = process.env.TEMP || workspaceTmp;
process.env.TMP = process.env.TMP || workspaceTmp;
delete process.env.NO_COLOR;
process.env.FORCE_COLOR = "0";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".codex-tmp/playwright-results",
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--disable-crash-reporter", "--disable-crashpad"],
        },
      },
    },
  ],
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
