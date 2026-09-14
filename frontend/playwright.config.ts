import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl = `sqlite+aiosqlite:////tmp/fpv_operator_trainer_playwright_${process.pid}.db`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:15173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        `cd ../backend && DATABASE_URL=${testDatabaseUrl} UV_CACHE_DIR=/tmp/fpv-uv-cache uv run alembic upgrade head && DATABASE_URL=${testDatabaseUrl} UV_CACHE_DIR=/tmp/fpv-uv-cache uv run uvicorn app.main:app --host 127.0.0.1 --port 18000`,
      url: "http://127.0.0.1:18000/api/v1/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "VITE_API_PROXY_TARGET=http://127.0.0.1:18000 npm run dev -- --host 127.0.0.1 --port 15173",
      url: "http://127.0.0.1:15173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
