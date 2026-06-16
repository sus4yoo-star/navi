"use client";

import { useEffect } from "react";

// PWA 서비스워커 등록. 웹푸시 수신 + 설치 토대.
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록 실패는 조용히 — 푸시는 보너스 기능이라 앱 동작엔 영향 없음
      });
    }
  }, []);
  return null;
}
