import { expect, test } from "@playwright/test";

test("previews, stops and saves a device Voice Profile on mobile", async ({ page }) => {
  let profile = {
    userId: "00000000-0000-0000-0000-000000000001",
    provider: "system" as const,
    voiceId: null as string | null,
    language: "zh-CN",
    rate: 100,
    pitch: 100,
    volume: 100,
    version: 1,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
  };

  await page.addInitScript(() => {
    type FakeUtterance = {
      text: string;
      lang: string;
      rate: number;
      pitch: number;
      volume: number;
      voice: unknown;
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
    };
    let current: FakeUtterance | null = null;
    class FakeSpeechSynthesisUtterance {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const voices = [{
      voiceURI: "test-zh-voice",
      name: "测试中文音线",
      lang: "zh-CN",
      localService: true,
      default: true,
    }];
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak: (utterance: FakeUtterance) => {
          current = utterance;
          (window as typeof window & { __spoken?: FakeUtterance }).__spoken = utterance;
        },
        cancel: () => {
          const interrupted = current;
          current = null;
          interrupted?.onerror?.({ error: "canceled" });
        },
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/voice-profile", async (route) => {
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      profile = {
        ...profile,
        ...input,
        version: profile.version + 1,
        updatedAt: "2026-09-27T01:00:00.000Z",
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: profile }),
    });
  });

  await page.goto("/voice");
  await expect(page.getByRole("heading", { name: "选择她的声音" })).toBeVisible();
  await page.getByLabel("当前设备音线").selectOption("test-zh-voice");
  await page.getByRole("slider", { name: "语速" }).fill("90");

  await page.getByRole("button", { name: "试听音线" }).click();
  await expect(page.getByRole("button", { name: "停止试听" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __spoken?: { rate: number; voice?: { voiceURI?: string } } }
  ).__spoken)).toMatchObject({ rate: 0.9, voice: { voiceURI: "test-zh-voice" } });
  await page.getByRole("button", { name: "停止试听" }).click();
  await expect(page.getByRole("button", { name: "停止试听" })).toBeDisabled();

  await page.getByRole("button", { name: "保存语音设置" }).click();
  await expect(page.getByRole("status")).toContainText("下一次朗读会使用新设置");
  expect(profile).toMatchObject({
    voiceId: "test-zh-voice",
    rate: 90,
    version: 2,
  });
});
