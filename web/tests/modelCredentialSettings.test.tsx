import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelCredentialSettings } from "@/components/config/ModelCredentialSettings";

describe("ModelCredentialSettings", () => {
  it("renders a write-only API Key form with DeepSeek defaults", () => {
    const html = renderToStaticMarkup(<ModelCredentialSettings />);

    expect(html).toContain("模型凭据");
    expect(html).toContain("https://api.deepseek.com");
    expect(html).toContain("deepseek-v4-flash-vision-exp");
    expect(html).toContain('type="password"');
    expect(html).toContain("测试连接");
    expect(html).toContain("加密保存");
    expect(html).toContain("不写入浏览器存储");
    expect(html).not.toContain("服务端环境变量中配置");
  });
});
