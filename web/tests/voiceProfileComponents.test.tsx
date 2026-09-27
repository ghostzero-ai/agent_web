import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VoiceProfileManager } from "@/components/voice/VoiceProfileManager";

describe("voice profile presentation", () => {
  it("renders a stable loading state before profile hydration", () => {
    expect(renderToStaticMarkup(<VoiceProfileManager />)).toContain(
      "正在读取语音设置",
    );
  });
});
