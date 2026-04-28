import PageTransition from "@/components/PageTransition";
import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "qgyx.asia | AI 图片分析 Quiz",
  description: "AI 图片分析、交互 Quiz、错题巩固与学习次数管理。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <PageTransition>{children}</PageTransition>
        <SpeedInsights />
      </body>
    </html>
  );
}
