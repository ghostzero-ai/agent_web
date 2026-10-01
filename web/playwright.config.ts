import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "Microsoft Edge",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
      },
    },
  ],
  // Production/Docker verification must not spawn or tear down a second server.
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "true" ? undefined : {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${testPort}`,
    url: `${baseURL}/chat`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
