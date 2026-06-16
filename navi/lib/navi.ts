// lib/navi.ts — 나비 클라이언트 헬퍼 (로그인 · 프로필 저장 · 푸시 · iOS 설치감지)
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── 로그인 (가입도 동일) ──
export async function signIn(provider: "google" | "kakao") {
  await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${location.origin}/today` },
  });
}

// ── 온보딩: 채널 URL + 확정 프로필 저장 (가입 때 한 번) ──
export type Profile = {
  channel_url: string;
  niche?: string;
  tone?: string;
  purpose?: string;
  aspiration?: string;
};
export async function saveProfile(p: Profile) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요해요");
  const { error } = await supabase
    .from("profiles")
    .update({ ...p, email: user.email })
    .eq("id", user.id);
  if (error) throw error;
}

// ── 오늘의 브리핑 읽기 (/today에서 사용) ──
export async function getTodayBriefing() {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("briefings")
    .select("content")
    .eq("for_date", today)
    .maybeSingle();
  return data?.content ?? null; // null이면 "곧 도착해요" 안내
}

// ── 웹푸시 구독 (지원·설치된 경우만) ──
export async function registerPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return { ok: false, reason: "unsupported" as const };
  if (iosNeedsInstall())
    return { ok: false, reason: "ios-needs-install" as const }; // 홈 화면 추가 안내

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" as const };

  const reg = await navigator.serviceWorker.register("/sw.js");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC!),
  });
  const json = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("push_subscriptions").insert({
    user_id: user!.id, subscription: json, endpoint: json.endpoint,
  });
  return { ok: true as const };
}

// ── iOS: 사파리 탭이면 설치 필요, 홈 화면 PWA면 OK ──
export function iosNeedsInstall() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
  return ios && !standalone; // true면 "공유 → 홈 화면에 추가" 배너를 띄울 것
}

function urlBase64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
