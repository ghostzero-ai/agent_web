import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./mobile.css";
import { MobileApp, MobileConfigurationError } from "@/mobile/MobileApp";
import { configureApiBaseUrl } from "@/lib/api/clientRuntime";
import { configureAppNavigation } from "@/lib/platform/appNavigation";

configureAppNavigation("hash");

const root = createRoot(document.getElementById("root")!);

try {
  const apiBaseUrl = configureApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (!apiBaseUrl) throw new Error("构建时没有提供 VITE_API_BASE_URL");
  root.render(<MobileApp />);
} catch (error) {
  root.render(
    <MobileConfigurationError
      message={error instanceof Error ? error.message : "移动客户端配置无效"}
    />,
  );
}
