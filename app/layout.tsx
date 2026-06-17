import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import RegisterSW from "./register-sw";
import Ambient from "./ambient";

// 브랜드 워드마크용 지오메트릭 산세리프
const brand = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "navi — 크리에이터에게 무한한 영감을",
  description: "바깥에서 영감을 길어와 오늘 만들 영상까지 — 크리에이터에게 무한한 영감을 주는 나비",
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
  themeColor: "#08080F",
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
        <Ambient />
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
