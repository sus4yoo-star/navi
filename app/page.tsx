"use client";

// app/page.tsx — 나비 홈: 로그인 우선 랜딩 + (로그인 없이) 채널 자동 분석 체험
// 채널 URL 하나 → 최근 10개(쇼츠/롱폼) 알아서 진단·솔루션. 결과 렌더는 <Solution/>이 담당.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { C, Wing, GRAD, GRAD_SOFT } from "@/lib/ui";
import { supabase, signIn, signOut } from "@/lib/navi";
import Solution from "./solution";

const TONES = [
  "감성·스토리형",
  "정보·하우투형",
  "엔터·리액션형",
  "이슈·논쟁형",
  "일상·브이로그형",
];
const PURPOSES = ["신규 유입 확장", "충성팬 심화"];

type Detect = { summary: string; reason: string };

export default function Home() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tryOpen, setTryOpen] = useState(false);

  const [channelUrl, setChannelUrl] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectErr, setDetectErr] = useState("");
  const [proposed, setProposed] = useState<Detect | null>(null);
  const [tone, setTone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [aspiration, setAspiration] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // 비로그인 매거진 구독
  const [subEmail, setSubEmail] = useState("");
  const [subChannel, setSubChannel] = useState("");
  const [subBench, setSubBench] = useState("");
  const [subState, setSubState] = useState<"idle" | "busy" | "done">("idle");
  const [subErr, setSubErr] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  async function subscribe() {
    setSubErr("");
    setSubState("busy");
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: subEmail,
          channelUrl: subChannel,
          benchmarkUrl: subBench || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "구독에 실패했어요.");
      setSubState("done");
    } catch (e: any) {
      setSubErr(e.message);
      setSubState("idle");
    }
  }

  async function detect() {
    if (!channelUrl.trim()) {
      setDetectErr("내 채널 URL을 넣어주세요.");
      return;
    }
    setDetecting(true);
    setDetectErr("");
    setProposed(null);
    try {
      const r = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "채널을 읽지 못했어요.");
      setProposed({ summary: j.summary, reason: j.reason });
      setTone(TONES.includes(j.tone) ? j.tone : TONES[0]);
      setPurpose(PURPOSES.includes(j.purpose) ? j.purpose : PURPOSES[0]);
    } catch (e: any) {
      setDetectErr(e.message);
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <style>{css}</style>

      {/* ── 다크 히어로: 로그인 우선 ── */}
      <header className="nv-hero">
        <div className="nv-wrap nv-hero-top">
          <Link href="/" className="nv-brand-link">
            <Wing />
            <span className="nv-brand">navi</span>
          </Link>
          <div className="nv-hero-nav">
            {authed && (
              <button className="nv-hero-link" onClick={signOut}>
                로그아웃
              </button>
            )}
            <Link href="/today" className="nv-hero-link">
              오늘의 영감
            </Link>
          </div>
        </div>

        <div className="nv-wrap nv-hero-body">
          <div className="nv-status">
            <span className="nv-live" />
            LIVE · 영감 엔진 가동중
          </div>
          <h1 className="nv-hero-h1">
            크리에이터에게
            <br />
            <span className="nv-accent">무한한 영감</span>을
            <br />
            매일 아침.
          </h1>
          <p className="nv-hero-sub">
            채널 URL 한 번이면 끝. 나비가 바깥을 정찰해 영감을 길어오고, 내 위치 진단부터
            오늘 만들 영상까지 매일 가져와요.
          </p>

          {authed ? (
            <div className="nv-cta-row">
              <button className="nv-btn nv-btn-lg" onClick={() => router.push("/today")}>
                오늘의 영감 보기
              </button>
              <span className="nv-mono nv-hero-foot">로그인 완료 · 채널 연결됨이면 바로 표시</span>
            </div>
          ) : (
            <>
              <div className="nv-cta-row">
                <button className="nv-btn-oauth" onClick={() => signIn("google")}>
                  <GoogleG /> Google로 시작
                </button>
                <button className="nv-btn-oauth nv-btn-kakao" onClick={() => signIn("kakao")}>
                  <KakaoK /> 카카오로 시작
                </button>
              </div>
              <p className="nv-mono nv-hero-foot">
                30초 가입 · 채널 URL 하나면 끝 · 매일 아무것도 시키지 않음
              </p>
            </>
          )}
        </div>

        <div className="nv-hero-grid" aria-hidden="true" />
      </header>

      {/* ── 매일 매거진 구독 (비로그인) ── */}
      {!authed && (
        <div className="nv-wrap" style={{ paddingTop: 30 }}>
          <div className="nv-card nv-card-accent">
            <span className="nv-mono nv-eyebrow nv-eyebrow-accent">daily inspiration</span>
            <h2 className="nv-h2" style={{ margin: "8px 0 5px" }}>
              매일 아침, 영감 한 통을 메일로
            </h2>
            <p className="nv-muted2" style={{ marginBottom: 16 }}>
              영감 줄 채널·지금 먹히는 기법·오늘 만들 영상까지. 가입 없이 이메일과 채널만 넣으면 끝.
            </p>
            {subState === "done" ? (
              <div className="nv-mono" style={{ color: C.live, fontSize: 14, fontWeight: 600 }}>
                구독 완료 — 내일 아침부터 메일로 받아보세요.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                <input
                  className="nv-field"
                  type="email"
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  placeholder="이메일 주소"
                />
                <input
                  className="nv-field"
                  value={subChannel}
                  onChange={(e) => setSubChannel(e.target.value)}
                  placeholder="내 채널 URL (https://youtube.com/@...)"
                />
                <input
                  className="nv-field"
                  value={subBench}
                  onChange={(e) => setSubBench(e.target.value)}
                  placeholder="닮고 싶은 채널 URL (선택)"
                />
                <button className="nv-btn" onClick={subscribe} disabled={subState === "busy"}>
                  {subState === "busy" ? "신청 중…" : "매일 영감 받기"}
                </button>
                {subErr && <p className="nv-err">{subErr}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 로그인 없이 체험: 채널 URL 하나로 알아서 ── */}
      <div className="nv-wrap" style={{ paddingTop: 30 }}>
        <div className="nv-try-head">
          <div>
            <div className="nv-mono nv-eyebrow">no-login · 체험</div>
            <h2 className="nv-h2">채널 URL만 넣으면, 영감이 쏟아집니다</h2>
            <p className="nv-muted2">
              바깥의 영감 채널부터 내 위치 진단·오늘 만들 영상까지. 최근 10개(쇼츠·롱폼)를 읽어
              가져와요. 영상 URL은 따로 넣지 않아요.
            </p>
          </div>
          {!tryOpen && (
            <button className="nv-btn" onClick={() => setTryOpen(true)}>
              체험 열기
            </button>
          )}
        </div>

        {tryOpen && (
          <>
            <div className="nv-step">
              <span className={"nv-dot " + (!confirmed ? "on" : "")} /> 채널 읽기
              <span className="nv-step-dash">—</span>
              <span className={"nv-dot " + (proposed && !confirmed ? "on" : "")} /> 확인·수정
              <span className="nv-step-dash">—</span>
              <span className={"nv-dot " + (confirmed ? "on" : "")} /> 자동 솔루션
            </div>

            {!confirmed && (
              <>
                <div className="nv-card">
                  <span className="nv-mono nv-eyebrow">step 1 · 채널 읽기</span>
                  <label className="nv-label" style={{ marginTop: 12 }}>
                    내 채널 URL
                  </label>
                  <input
                    className="nv-field"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    placeholder="https://youtube.com/@..."
                    style={{ marginBottom: 16 }}
                  />
                  <button
                    className="nv-btn"
                    style={{ width: "100%" }}
                    onClick={detect}
                    disabled={detecting}
                  >
                    {detecting ? "나비가 읽는 중…" : "나비가 내 채널 읽기"}
                  </button>
                  {detectErr && <p className="nv-err">{detectErr}</p>}
                  <p className="nv-mono nv-hint">
                    매일 자동 브리핑을 받으려면{" "}
                    <Link href="/onboarding" style={{ color: C.accent }}>
                      로그인하고 채널 연결 →
                    </Link>
                  </p>
                </div>

                {proposed && (
                  <div className="nv-card nv-card-accent">
                    <span className="nv-mono nv-eyebrow nv-eyebrow-accent">
                      step 2 · 나비의 첫인상
                    </span>
                    <p className="nv-impression">{proposed.summary}</p>
                    <p className="nv-impression-sub">{proposed.reason}</p>

                    <label className="nv-label">톤 — 맞으면 그대로, 아니면 바꿔주세요</label>
                    <div style={{ marginBottom: 18 }}>
                      {TONES.map((t) => (
                        <span
                          key={t}
                          className={"nv-chip nv-pick " + (tone === t ? "on" : "")}
                          onClick={() => setTone(t)}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <label className="nv-label">주력 목적</label>
                    <div style={{ marginBottom: 18 }}>
                      {PURPOSES.map((p) => (
                        <span
                          key={p}
                          className={"nv-chip nv-pick " + (purpose === p ? "on" : "")}
                          onClick={() => setPurpose(p)}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <label className="nv-label">앞으로 이렇게 가고 싶다 (선택)</label>
                    <input
                      className="nv-field"
                      value={aspiration}
                      onChange={(e) => setAspiration(e.target.value)}
                      placeholder="예: 정보형인데 감성형도 섞고 싶다"
                      style={{ marginBottom: 18 }}
                    />
                    <button
                      className="nv-btn"
                      style={{ width: "100%" }}
                      onClick={() => tone && purpose && setConfirmed(true)}
                    >
                      이 프로필로 채널 자동 분석
                    </button>
                  </div>
                )}
              </>
            )}

            {confirmed && (
              <>
                <div className="nv-card nv-profile">
                  <div className="nv-profile-txt">
                    <span className="nv-mono nv-eyebrow">profile</span>
                    <br />
                    <b>{tone}</b> · {purpose}
                    {aspiration ? <span className="nv-muted2"> · 지향: {aspiration}</span> : null}
                  </div>
                  <button className="nv-ghost" onClick={() => setConfirmed(false)}>
                    프로필 수정
                  </button>
                </div>

                <Solution
                  channelUrl={channelUrl}
                  tone={tone}
                  purpose={purpose}
                  aspiration={aspiration}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6 0-1.1-.2-1.7H9v3.3h4.8a4 4 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
    </svg>
  );
}

function KakaoK() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#191600"
        d="M9 1.5C4.6 1.5 1 4.3 1 7.7c0 2.2 1.5 4.1 3.7 5.2l-.9 3.3c-.1.3.2.5.5.4l3.9-2.6c.3 0 .5.1.8.1 4.4 0 8-2.8 8-6.2S13.4 1.5 9 1.5z"
      />
    </svg>
  );
}

const css = `
.nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.nv-wrap{max-width:780px;margin:0 auto;padding:0 22px}

/* ── 밝은 에디토리얼 히어로 ── */
.nv-hero{position:relative;overflow:hidden;background:transparent;color:${C.ink};border-bottom:1px solid ${C.line}}
.nv-hero-grid{position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(75,67,214,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(75,67,214,.05) 1px,transparent 1px);
  background-size:40px 40px;
  -webkit-mask-image:radial-gradient(120% 70% at 18% 0%,#000 0%,transparent 65%);
  mask-image:radial-gradient(120% 70% at 18% 0%,#000 0%,transparent 65%)}
.nv-hero-top{position:relative;z-index:1;display:flex;align-items:center;gap:11px;padding-top:18px;padding-bottom:6px}
.nv-brand-link{display:flex;align-items:center;gap:10px;text-decoration:none}
.nv-brand{font-family:var(--font-brand),'Space Grotesk',system-ui,sans-serif;font-size:23px;font-weight:700;letter-spacing:-.01em;background:${GRAD};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.nv-hero-nav{margin-left:auto;display:flex;align-items:center;gap:9px}
.nv-hero-link{font-size:12.5px;color:${C.sub};background:#fff;font-family:inherit;cursor:pointer;border:1px solid ${C.line};border-radius:8px;padding:7px 13px;text-decoration:none;transition:all .14s}
.nv-hero-link:hover{border-color:${C.accent};color:${C.accent}}
.nv-hero-body{position:relative;z-index:1;padding:30px 22px 48px}
.nv-status{display:inline-flex;align-items:center;gap:8px;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.sub};background:#fff;border:1px solid ${C.line};border-radius:999px;padding:5px 11px;margin-bottom:22px}
.nv-live{width:7px;height:7px;border-radius:50%;background:${C.live};box-shadow:0 0 9px ${C.live};display:inline-block;animation:nvp 1.4s ease-in-out infinite}
@keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
.nv-hero-h1{font-family:var(--font-serif);font-size:40px;line-height:1.28;font-weight:400;letter-spacing:-.015em;margin:0 0 20px;color:${C.ink}}
.nv-accent{background:${GRAD};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.nv-hero-sub{font-size:15.5px;line-height:1.75;color:${C.sub};max-width:560px;margin:0 0 28px}
.nv-cta-row{display:flex;gap:11px;flex-wrap:wrap;align-items:center;margin-bottom:13px}
.nv-btn-oauth{display:inline-flex;align-items:center;gap:9px;background:#fff;color:${C.ink};border:1px solid ${C.line};border-radius:11px;padding:13px 20px;font-size:14.5px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:-.01em;transition:transform .05s,box-shadow .14s,border-color .14s}
.nv-btn-oauth:hover{box-shadow:0 8px 22px -10px rgba(26,26,32,.3);border-color:${C.sub}}
.nv-btn-oauth:active{transform:translateY(1px)}
.nv-btn-kakao{background:#FEE500;color:#191600;border-color:#F4DC00}
.nv-btn-lg{padding:14px 24px;font-size:15.5px}
.nv-hero-foot{font-size:11.5px;color:${C.faint};letter-spacing:.02em;margin:0}

/* ── 라이트 본문 ── */
.nv-try-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.nv-h2{font-family:var(--font-serif);font-size:20px;font-weight:500;letter-spacing:-.005em;margin:7px 0 5px;color:${C.ink}}
.nv-muted2{font-size:13.5px;color:${C.sub};line-height:1.6;margin:0}
.nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:600;text-transform:uppercase}
.nv-eyebrow-accent{color:${C.accent}}
.nv-field{width:100%;box-sizing:border-box;background:#fff;border:1px solid ${C.line};border-radius:10px;padding:13px 15px;font-size:14.5px;color:${C.ink};font-family:inherit;outline:none;transition:border-color .14s,box-shadow .14s}
.nv-field::placeholder{color:${C.faint}}
.nv-field:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
.nv-label{font-size:13px;color:${C.ink};font-weight:600;margin:0 0 7px;display:block}
.nv-btn{background:${C.accent};color:#fff;border:none;border-radius:11px;padding:13px 19px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:box-shadow .16s,transform .05s,filter .16s;letter-spacing:-.01em;box-shadow:0 6px 18px -8px rgba(75,67,214,.5)}
.nv-btn:hover:not(:disabled){box-shadow:0 10px 26px -8px rgba(75,67,214,.5);filter:brightness(1.05)}
.nv-btn:active:not(:disabled){transform:translateY(1px)}
.nv-btn:disabled{opacity:.45;cursor:default}
.nv-ghost{background:#fff;border:1px solid ${C.line};color:${C.sub};border-radius:9px;padding:8px 13px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .14s}
.nv-ghost:hover{border-color:${C.accent};color:${C.accent}}
.nv-card{background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:22px 24px;margin-bottom:14px;box-shadow:0 1px 2px rgba(26,26,32,.03),0 14px 36px -26px rgba(26,26,32,.22)}
.nv-card-accent{background:${GRAD_SOFT};border-color:#D8D3F6}
.nv-chip{display:inline-block;background:#fff;border:1px solid ${C.line};border-radius:9px;padding:8px 13px;font-size:13px;margin:0 7px 7px 0;color:${C.sub};font-weight:500;transition:all .12s}
.nv-pick{cursor:pointer;user-select:none}
.nv-pick.on{background:${C.accentTint};color:${C.accentInk};border-color:${C.accent}}
.nv-step{display:flex;gap:8px;align-items:center;font-size:12px;color:${C.sub};margin:6px 0 20px;letter-spacing:.02em;font-weight:500}
.nv-step-dash{color:${C.line}}
.nv-dot{width:6px;height:6px;border-radius:50%;background:${C.line}}
.nv-dot.on{background:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
.nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
.nv-impression{font-family:var(--font-serif);font-size:17px;font-weight:500;margin:10px 0 5px;line-height:1.6;letter-spacing:-.005em;color:${C.ink}}
.nv-impression-sub{font-size:13px;color:${C.sub};margin:0 0 18px;line-height:1.6}
.nv-profile{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.nv-profile-txt{font-size:13.5px;color:${C.ink};line-height:1.7}
.nv-profile-txt b{font-weight:700}
.nv-err{color:${C.accent};font-size:13px;margin:11px 0 0;font-weight:500}
.nv-hint{font-size:11.5px;color:${C.faint};margin:14px 0 0;line-height:1.6}
.nv-h{font-size:15.5px;font-weight:700;margin:0 0 10px;letter-spacing:-.01em;color:${C.ink}}

@media (max-width:560px){.nv-hero-h1{font-size:32px}}
`;
