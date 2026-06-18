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
  metadataBase: new URL("https://navi.theamov.com"),
  title: "NAVI — 크리에이터에게 무한한 영감을",
  description: "바깥에서 영감을 길어와 오늘 만들 영상까지 — 크리에이터에게 무한한 영감을 주는 나비",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NAVI",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  openGraph: {
    type: "website",
    siteName: "NAVI",
    title: "NAVI — 크리에이터에게 무한한 영감을",
    description: "바깥에서 영감을 길어와 오늘 만들 영상까지 — 크리에이터의 AI 성장 파트너.",
    url: "https://navi.theamov.com",
    locale: "ko_KR",
    images: [
      { url: "/og.png", width: 1200, height: 630, alt: "NAVI — 크리에이터에게 무한한 영감을" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NAVI — 크리에이터에게 무한한 영감을",
    description: "바깥에서 영감을 길어와 오늘 만들 영상까지 — 크리에이터의 AI 성장 파트너.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F5F2",
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
