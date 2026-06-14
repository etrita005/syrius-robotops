import { defineConfig, devices } from "@playwright/test";

const BACKEND_PORT = 30002;
const FRONTEND_PORT = 5174;

export const E2E_CONFIG = {
  backendPort: BACKEND_PORT,
  frontendPort: FRONTEND_PORT,
  baseURL: `http://localhost:${FRONTEND_PORT}`,
  apiURL: `http://localhost:${BACKEND_PORT}`,
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: E2E_CONFIG.baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [],
});
