import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import RegisterSW from "./register-sw";

// 브랜드 워드마크용 지오메트릭 산세리프
const brand = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "navi — AI 성장 PD",
  description: "매일 아침, 당신의 채널을 읽고 오늘 만들 영상을 정해주는 AI 성장 PD",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "navi",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4B43D6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={brand.variable}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
