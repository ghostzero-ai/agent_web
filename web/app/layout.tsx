import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { NativeNotificationBridge } from "@/components/platform/NativeNotificationBridge";

export const metadata: Metadata = {
  title: "AI 学习伴侣",
  description: "你的专属 AI 学习伙伴",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NativeNotificationBridge />
        {children}
      </body>
    </html>
  );
}
