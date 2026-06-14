import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const BACKEND_PORT = 30002;
const FRONTEND_PORT = 5174;
const TEST_DATA_DIR = "./test-results/.e2e-data";

export const E2E_CONFIG = {
  backendPort: BACKEND_PORT,
  frontendPort: FRONTEND_PORT,
  testDataDir: TEST_DATA_DIR,
  baseURL: `http://localhost:${FRONTEND_PORT}`,
  apiURL: `http://localhost:${BACKEND_PORT}`,
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "./playwright-report" }],
    ["list"],
  ],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: E2E_CONFIG.baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `npx tsx src/index.ts --port ${BACKEND_PORT} --mock --data-dir ${resolve(TEST_DATA_DIR)}`,
      port: BACKEND_PORT,
      reuseExistingServer: false,
      timeout: 30000,
      cwd: "../backend",
      env: {
        NODE_ENV: "test",
      },
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      port: FRONTEND_PORT,
      reuseExistingServer: false,
      timeout: 30000,
      cwd: "../frontend",
      env: {
        VITE_API_TARGET: `http://localhost:${BACKEND_PORT}`,
      },
    },
  ],
});
