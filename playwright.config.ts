import { defineConfig, devices } from "@playwright/test";

// The app in development (`LEAF_E2E_SERVER=dev`) or as a production build.
const server = process.env.LEAF_E2E_SERVER === "dev" ? "dev" : "production";
const port = server === "dev" ? "4183" : "4185";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command:
      server === "dev"
        ? `pnpm --dir app exec farm dev --host 127.0.0.1 --port ${port}`
        : [
            "pnpm --dir app exec farm build --preset node-server",
            `NODE_ENV=production HOST=127.0.0.1 PORT=${port} node app/.farm/.output/server/index.mjs`,
          ].join(" && "),
    url: `${baseURL}/api/crops`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
