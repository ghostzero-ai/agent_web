import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Read-only UI evidence; every API is intercepted, never using private data or model calls.
async function main() {
const stage = process.argv[2] === "before" ? "before" : "after";
const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("..", "docs", "ui", "r2", stage);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
try {
  for (const [size, width, height] of [["desktop", 1440, 960], ["mobile", 390, 844]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: "light" });
    await page.route("**/api/v1/**", (route) => {
      const url = new URL(route.request().url());
      const data = url.pathname.startsWith("/api/v1/push")
        ? { publicKey: null, preferences: { pushEnabled: false, quietHoursEnabled: true, quietStart: "22:00", quietEnd: "08:00", timezone: "Asia/Shanghai", version: 1 }, subscriptions: [] }
        : [];
      return route.fulfill({ json: { data } });
    });
    for (const route of ["chat", "notifications", "entertainment"]) {
      await page.goto(`${baseUrl}/${route}`);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(output, `${route}-${size}.png`), fullPage: true });
    }
    await page.close();
  }
} finally { await browser.close(); }
console.log(`Mock UI screenshots: ${output}`);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
