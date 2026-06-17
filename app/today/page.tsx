"use client";

// app/today/page.tsx — 오늘의 브리핑 (자동·무설정)
// 연결된 채널을 열자마자 자동 분석(Solution)해서 진단·처방·다음 영상을 띄운다.
// 입력칸·생성 버튼 없음. 매일 크론이 보낸 메일/푸시는 별도(보너스).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, registerPush, iosNeedsInstall, signOut } from "@/lib/navi";
import { C, Wing } from "@/lib/ui";
import Solution from "../solution";

const todayLabel = new Date(Date.now() + 9 * 3600e3).toLocaleDateString("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

type Profile = {
  channel_url: string;
  channelName: string;
  userId?: string;
  niche?: string;
  tone?: string;
  purpose?: string;
  aspiration?: string;
  benchmark_url?: string;
};

export default function Today() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [profile, setProfile] = useState<Profile | null>(null);

  const [iosBanner, setIosBanner] = useState(false);
  const [pushState, setPushState] = useState<
    "idle" | "on" | "busy" | "denied" | "unsupported"
  >("idle");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/onboarding");
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("channel_url, niche, tone, purpose, aspiration, benchmark_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!p?.channel_url) {
        router.replace("/onboarding");
        return;
      }
      setProfile({
        channel_url: p.channel_url,
        channelName: p.niche || "내 채널",
        userId: user.id,
        niche: p.niche || undefined,
        tone: p.tone || undefined,
        purpose: p.purpose || undefined,
        aspiration: p.aspiration || undefined,
        benchmark_url: p.benchmark_url || undefined,
      });
      setPhase("ready");
      if (iosNeedsInstall()) setIosBanner(true);
    })();
  }, [router]);

  async function enablePush() {
    setPushState("busy");
    const res = await registerPush();
    if (res.ok) setPushState("on");
    else if (res.reason === "ios-needs-install") {
      setPushState("idle");
      setIosBanner(true);
    } else if (res.reason === "denied") setPushState("denied");
    else setPushState("unsupported");
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <style>{css}</style>

      <div className="nv-topbar">
        <div className="nv-wrap nv-topbar-in">
          <Link href="/" className="nv-brand-link">
            <Wing />
            <span className="nv-brand">navi</span>
          </Link>
          <div className="nv-top-right">
            <span className="nv-mono nv-topbar-date">{todayLabel}</span>
            <Link href="/onboarding" className="nv-toplink">
              채널 설정
            </Link>
            <button className="nv-toplink" onClick={signOut}>
              로그아웃
            </button>
          </div>
        </div>
      </div>

      <div className="nv-wrap" style={{ paddingTop: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 4px" }}>
          오늘의 브리핑
        </h1>
        <p style={{ fontSize: 14, color: C.sub, margin: "0 0 14px", lineHeight: 1.6 }}>
          매일 아침, 나비가 당신의 채널을 새로 읽고 오늘 뭘 만들지 정해와요.
        </p>

        {phase === "ready" && profile && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <span className="nv-chip">
              <Wing size={14} /> {profile.channelName}
              {profile.tone ? ` · ${profile.tone}` : ""}
            </span>
            {pushState === "idle" && (
              <button className="nv-link" onClick={enablePush}>
                알림 받기
              </button>
            )}
            {pushState === "busy" && <span className="nv-mono nv-muted">알림 설정 중…</span>}
            {pushState === "on" && <span className="nv-mono nv-muted">알림 켜짐</span>}
            {pushState === "denied" && (
              <span className="nv-mono nv-muted">브라우저 설정에서 알림을 허용해 주세요</span>
            )}
            {pushState === "unsupported" && (
              <span className="nv-mono nv-muted">이 브라우저는 알림 미지원</span>
            )}
          </div>
        )}

        {iosBanner && (
          <div className="nv-card" style={{ borderColor: C.accent, background: "#FBFBFE" }}>
            <span className="nv-mono nv-eyebrow" style={{ color: C.accent }}>
              홈 화면에 추가
            </span>
            <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, margin: "8px 0 0" }}>
              아이폰은 공유 버튼 → <b style={{ color: C.ink }}>홈 화면에 추가</b>를 누르면 매일 아침
              알림을 받을 수 있어요.
            </p>
          </div>
        )}

        {phase === "loading" && (
          <div
            className="nv-mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              color: C.accent,
              fontSize: 12.5,
              margin: "4px 2px 14px",
              letterSpacing: ".04em",
            }}
          >
            <span className="nv-pulse" /> 채널 불러오는 중
          </div>
        )}

        {phase === "ready" && profile && (
          <Solution
            channelUrl={profile.channel_url}
            tone={profile.tone}
            purpose={profile.purpose}
            aspiration={profile.aspiration}
            benchmarkUrl={profile.benchmark_url}
            niche={profile.niche}
            userId={profile.userId}
          />
        )}
      </div>
    </div>
  );
}

const css = `
.nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.nv-muted{font-size:12px;color:${C.faint}}
.nv-wrap{max-width:680px;margin:0 auto;padding:0 22px 48px}
.nv-topbar{background:#0F1115;border-bottom:1px solid rgba(255,255,255,.08)}
.nv-topbar-in{display:flex;align-items:center;gap:11px;padding:18px 22px}
.nv-brand-link{display:flex;align-items:center;gap:11px;text-decoration:none}
.nv-brand{font-family:var(--font-brand),'Space Grotesk',system-ui,sans-serif;font-size:23px;font-weight:700;letter-spacing:-.01em;color:#fff}
.nv-top-right{margin-left:auto;display:flex;align-items:center;gap:15px}
.nv-topbar-date{font-size:11.5px;color:rgba(255,255,255,.58)}
.nv-toplink{background:none;border:none;color:rgba(255,255,255,.7);font-size:12.5px;font-family:inherit;cursor:pointer;text-decoration:none;padding:0;transition:color .14s}
.nv-toplink:hover{color:#fff}
.nv-link{background:none;border:none;color:${C.accent};font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px}
.nv-card{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:18px 20px;margin-bottom:13px;box-shadow:0 1px 2px rgba(20,23,28,.04),0 8px 24px -18px rgba(20,23,28,.18)}
.nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:600;text-transform:uppercase}
.nv-chip{display:inline-flex;align-items:center;gap:7px;background:${C.accentTint};color:${C.accentInk};border:1px solid ${C.accent};border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:600}
.nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
@keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
`;
