import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const apiPort = Number(process.env.E2E_API_PORT ?? 5001);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3000);
const webURL = `http://localhost:${webPort}`;

// The backend only accepts cross-origin HTTP calls (idea box) from origins in
// CORS_ORIGINS. Pass the web origin we actually use so non-default ports work.
const corsOrigins = JSON.stringify([
  `http://localhost:${webPort}`,
  `http://127.0.0.1:${webPort}`,
]);

export default defineConfig({
  testDir: "./e2e",
  // Every visitor shares one park, so tests run one at a time to keep the
  // roster ("N here · M seated") predictable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: webURL,
    viewport: { width: 1280, height: 720 },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [
    {
      name: "backend",
      command: `uv run uvicorn app.main:app --port ${apiPort} --log-level warning`,
      cwd: "../backend",
      url: `http://127.0.0.1:${apiPort}/api/presence`,
      env: { CORS_ORIGINS: corsOrigins },
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "frontend",
      command: `pnpm dev --port ${webPort}`,
      url: webURL,
      env: { NEXT_PUBLIC_WS_URL: `http://localhost:${apiPort}` },
      reuseExistingServer: !isCI,
      // The first Next compile can be slow, especially on a cold CI runner.
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
