"use client";

// app/today/page.tsx — 오늘의 브리핑 (자동·무설정)
// navi-today.jsx 디자인. 단, 즉석 생성하지 않고 Supabase에 저장된 오늘자 브리핑을 읽는다.
// 입력칸·생성 버튼 없음. 없으면 "곧 도착해요" 안내.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  supabase,
  getTodayBriefing,
  registerPush,
  iosNeedsInstall,
} from "@/lib/navi";
import { C, Wing } from "@/lib/ui";

type Briefing = {
  channel_note?: string;
  trends?: { title: string; why: string }[];
  today_pick?: { title: string; angle: string; hook: string };
  weekly?: string;
  similar_hit?: { title: string; why: string; source?: string };
  crossover_hit?: { title: string; why: string; source?: string };
};

const todayLabel = new Date(Date.now() + 9 * 3600e3).toLocaleDateString("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

export default function Today() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [channelName, setChannelName] = useState("");
  const [tone, setTone] = useState("");
  const [b, setB] = useState<Briefing | null>(null);

  const [iosBanner, setIosBanner] = useState(false);
  const [pushState, setPushState] = useState<"idle" | "on" | "busy" | "unavailable">(
    "idle"
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/onboarding");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("channel_url, niche, tone")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.channel_url) {
        // 채널을 아직 연결하지 않음 → 온보딩으로
        router.replace("/onboarding");
        return;
      }
      setChannelName(profile.niche || "내 채널");
      setTone(profile.tone || "");
      const content = await getTodayBriefing();
      setB(content as Briefing | null);
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
    } else setPushState("unavailable");
  }

  const Insp = ({
    label,
    x,
  }: {
    label: string;
    x?: { title: string; why: string; source?: string };
  }) =>
    x ? (
      <div className="nv-card">
        <span className="nv-mono nv-eyebrow">{label}</span>
        <p style={{ fontSize: 14.5, fontWeight: 600, margin: "9px 0 4px" }}>{x.title}</p>
        <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, margin: 0 }}>{x.why}</p>
        {x.source && (
          <p className="nv-mono" style={{ fontSize: 11.5, color: C.faint, margin: "5px 0 0" }}>
            출처 · {x.source}
          </p>
        )}
      </div>
    ) : null;

  return (
    <div style={{ minHeight: "100%" }}>
      <style>{css}</style>

      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.card }}>
        <div
          className="nv-wrap"
          style={{ padding: "20px 22px 18px", display: "flex", alignItems: "center", gap: 11 }}
        >
          <Wing />
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.02em" }}>나비</span>
          <span className="nv-mono" style={{ fontSize: 11.5, color: C.faint, marginLeft: "auto" }}>
            {todayLabel}
          </span>
        </div>
      </div>

      <div className="nv-wrap" style={{ paddingTop: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", margin: "0 0 4px" }}>
          오늘의 브리핑
        </h1>
        <p style={{ fontSize: 14, color: C.sub, margin: "0 0 14px", lineHeight: 1.6 }}>
          매일 아침, 나비가 네 채널을 새로 읽고 오늘 뭘 만들지 정해와요.
        </p>

        {phase === "ready" && (channelName || tone) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <span className="nv-chip">
              <Wing size={14} /> {channelName}
              {tone ? ` · ${tone}` : ""}
            </span>
            {pushState === "idle" && (
              <button className="nv-link" onClick={enablePush}>
                알림 받기
              </button>
            )}
            {pushState === "busy" && <span className="nv-mono nv-muted">알림 설정 중…</span>}
            {pushState === "on" && <span className="nv-mono nv-muted">알림 켜짐</span>}
            {pushState === "unavailable" && (
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
            <span className="nv-pulse" /> 오늘의 브리핑 불러오는 중
          </div>
        )}

        {phase === "ready" && !b && (
          <div className="nv-card">
            <span className="nv-mono nv-eyebrow">대기 중</span>
            <p style={{ fontSize: 16, fontWeight: 600, margin: "10px 0 6px", letterSpacing: "-.01em" }}>
              오늘 브리핑이 곧 도착해요
            </p>
            <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, margin: 0 }}>
              나비가 매일 아침 채널을 새로 읽고 준비해요. 도착하면 이메일과 알림으로도 알려드려요.
            </p>
          </div>
        )}

        {phase === "ready" && b && (
          <>
            {b.channel_note && (
              <div className="nv-card">
                <span className="nv-mono nv-eyebrow">내 채널 현황</span>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: "9px 0 0", color: C.ink }}>
                  {b.channel_note}
                </p>
              </div>
            )}

            {b.trends && b.trends.length > 0 && (
              <div className="nv-card">
                <span className="nv-mono nv-eyebrow">오늘 뜨는 흐름</span>
                <div style={{ marginTop: 4 }}>
                  {b.trends.map((t, i) => (
                    <div key={i} className={"nv-row " + (i ? "" : "first")}>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t.title}</div>
                      <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, marginTop: 2 }}>
                        {t.why}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {b.today_pick && (
              <div className="nv-card" style={{ background: "#FBFBFE", borderColor: C.accent }}>
                <span className="nv-mono nv-eyebrow" style={{ color: C.accent }}>
                  오늘 만들 영상
                </span>
                <p
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    margin: "9px 0 7px",
                    lineHeight: 1.4,
                    letterSpacing: "-.01em",
                  }}
                >
                  {b.today_pick.title}
                </p>
                <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, margin: "0 0 7px" }}>
                  {b.today_pick.angle}
                </p>
                {b.today_pick.hook && (
                  <div
                    className="nv-mono"
                    style={{
                      fontSize: 12.5,
                      color: C.accentInk,
                      background: C.accentTint,
                      borderRadius: 7,
                      padding: "8px 11px",
                      lineHeight: 1.5,
                    }}
                  >
                    첫 3초 · {b.today_pick.hook}
                  </div>
                )}
              </div>
            )}

            {b.weekly && (
              <div className="nv-card">
                <span className="nv-mono nv-eyebrow">이번 주 방향</span>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: "9px 0 0" }}>{b.weekly}</p>
              </div>
            )}

            <Insp label="영감 · 비슷한 주제 잘된 영상" x={b.similar_hit} />
            <Insp label="영감 · 다른 분야 대박, 배울 패턴" x={b.crossover_hit} />
          </>
        )}
      </div>
    </div>
  );
}

const css = `
.nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.nv-muted{font-size:12px;color:${C.faint}}
.nv-wrap{max-width:680px;margin:0 auto;padding:0 22px 48px}
.nv-link{background:none;border:none;color:${C.sub};font-size:12.5px;cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px}
.nv-card{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:18px 20px;margin-bottom:13px;box-shadow:0 1px 2px rgba(20,23,28,.03)}
.nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:500;text-transform:uppercase}
.nv-chip{display:inline-flex;align-items:center;gap:7px;background:${C.accentTint};color:${C.accentInk};border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:500}
.nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
@keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
.nv-row{padding:10px 0;border-top:1px solid ${C.line}}
.nv-row.first{border-top:none}
`;
