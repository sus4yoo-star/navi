"use client";

// app/onboarding/page.tsx — 가입 때 한 번: 로그인 → 채널 URL → 첫인상 확인 → 저장 → /today
// 매일은 아무것도 시키지 않는다. 여기서만 한 번 채널을 연결한다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, signIn, saveProfile, signOut } from "@/lib/navi";
import { C, Wing, GRAD } from "@/lib/ui";

const TONES = [
  "감성·스토리형",
  "정보·하우투형",
  "엔터·리액션형",
  "이슈·논쟁형",
  "일상·브이로그형",
];
const PURPOSES = ["신규 유입 확장", "충성팬 심화"];

export default function Onboarding() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [channelUrl, setChannelUrl] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectErr, setDetectErr] = useState("");
  const [proposed, setProposed] = useState<{ summary: string; reason: string } | null>(
    null
  );
  const [niche, setNiche] = useState("");
  const [tone, setTone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [aspiration, setAspiration] = useState("");
  const [benchmarkUrl, setBenchmarkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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
      setNiche(j.niche || j.channelName || "");
      setTone(TONES.includes(j.tone) ? j.tone : TONES[0]);
      setPurpose(PURPOSES.includes(j.purpose) ? j.purpose : PURPOSES[0]);
    } catch (e: any) {
      setDetectErr(e.message);
    } finally {
      setDetecting(false);
    }
  }

  async function finish() {
    if (!tone || !purpose) return;
    setSaving(true);
    setSaveErr("");
    try {
      await saveProfile({
        channel_url: channelUrl,
        niche: niche || undefined,
        tone,
        purpose,
        aspiration: aspiration || undefined,
        benchmark_url: benchmarkUrl || undefined,
      });
      router.push("/today");
    } catch (e: any) {
      setSaveErr(e.message || "저장에 실패했어요.");
      setSaving(false);
    }
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
            {authed ? (
              <button className="nv-toplink" onClick={signOut}>
                로그아웃
              </button>
            ) : (
              <span className="nv-mono nv-topbar-date">가입 · 한 번만</span>
            )}
          </div>
        </div>
      </div>

      <div className="nv-wrap" style={{ paddingTop: 24 }}>
        {!ready ? (
          <div className="nv-mono" style={{ color: C.faint, fontSize: 13, padding: "8px 2px" }}>
            불러오는 중…
          </div>
        ) : !authed ? (
          // ── 1) 로그인 ──
          <>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "-.02em",
                margin: "0 0 6px",
              }}
            >
              채널 한 번만 연결하면 끝
            </h1>
            <p style={{ fontSize: 14, color: C.sub, margin: "0 0 22px", lineHeight: 1.6 }}>
              그다음부터는 매일 아침, 나비가 알아서 오늘 만들 영상을 정해와요.
            </p>
            <div className="nv-card">
              <span className="nv-mono nv-eyebrow">step 1 · 로그인</span>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                <button className="nv-btn" onClick={() => signIn("google")}>
                  Google로 시작하기
                </button>
                <button
                  className="nv-btn"
                  style={{ background: "#FEE500", color: "#191600" }}
                  onClick={() => signIn("kakao")}
                >
                  카카오로 시작하기
                </button>
              </div>
            </div>
          </>
        ) : (
          // ── 2) 채널 읽기 → 확인 → 저장 ──
          <>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "-.02em",
                margin: "0 0 6px",
              }}
            >
              내 채널 연결
            </h1>
            <p style={{ fontSize: 14, color: C.sub, margin: "0 0 20px", lineHeight: 1.6 }}>
              채널 URL만 넣으면 나비가 읽고 첫인상을 잡아줘요. 맞는지만 확인해 주세요.
            </p>

            <div className="nv-card">
              <span className="nv-mono nv-eyebrow">step 2 · 채널 읽기</span>
              <label className="nv-label" style={{ marginTop: 12 }}>
                내 채널 URL
              </label>
              <input
                className="nv-field"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                placeholder="https://youtube.com/@..."
                style={{ marginBottom: 14 }}
              />
              <button
                className="nv-btn"
                style={{ width: "100%" }}
                onClick={detect}
                disabled={detecting}
              >
                {detecting ? "나비가 읽는 중…" : "나비가 내 채널 읽기"}
              </button>
              {detectErr && (
                <p style={{ color: C.accent, fontSize: 13, margin: "11px 0 0" }}>{detectErr}</p>
              )}
            </div>

            {proposed && (
              <div className="nv-card" style={{ background: "rgba(123,93,230,.10)", borderColor: "rgba(123,93,230,.45)" }}>
                <span className="nv-mono nv-eyebrow">step 3 · 나비의 첫인상</span>
                <p
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    margin: "10px 0 5px",
                    lineHeight: 1.45,
                    letterSpacing: "-.01em",
                  }}
                >
                  {proposed.summary}
                </p>
                <p style={{ fontSize: 13, color: C.sub, margin: "0 0 18px", lineHeight: 1.6 }}>
                  {proposed.reason}
                </p>

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
                <label className="nv-label">닮고 싶은 채널 (선택) — 매일 이 채널과 비교해드려요</label>
                <input
                  className="nv-field"
                  value={benchmarkUrl}
                  onChange={(e) => setBenchmarkUrl(e.target.value)}
                  placeholder="https://youtube.com/@워너비채널"
                  style={{ marginBottom: 18 }}
                />
                <button
                  className="nv-btn"
                  style={{ width: "100%" }}
                  onClick={finish}
                  disabled={saving}
                >
                  {saving ? "저장 중…" : "이 프로필로 시작하기"}
                </button>
                {saveErr && (
                  <p style={{ color: C.accent, fontSize: 13, margin: "11px 0 0" }}>{saveErr}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const css = `
.nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.nv-wrap{max-width:680px;margin:0 auto;padding:0 22px 48px}
.nv-topbar{background:rgba(10,10,18,.55);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.08)}
.nv-topbar-in{display:flex;align-items:center;gap:11px;padding:16px 22px}
.nv-brand-link{display:flex;align-items:center;gap:10px;text-decoration:none}
.nv-brand{font-family:var(--font-brand),'Space Grotesk',system-ui,sans-serif;font-size:23px;font-weight:700;letter-spacing:-.01em;background:${GRAD};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.nv-top-right{margin-left:auto;display:flex;align-items:center;gap:15px}
.nv-topbar-date{font-size:11.5px;color:rgba(255,255,255,.58)}
.nv-toplink{background:none;border:none;color:rgba(255,255,255,.7);font-size:12.5px;font-family:inherit;cursor:pointer;text-decoration:none;padding:0;transition:color .14s}
.nv-toplink:hover{color:#fff}
.nv-field{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid ${C.line};border-radius:10px;padding:13px 15px;font-size:14.5px;color:${C.ink};font-family:inherit;outline:none;transition:border-color .14s,box-shadow .14s}
.nv-field::placeholder{color:${C.faint}}
.nv-field:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
.nv-label{font-size:13px;color:${C.ink};font-weight:600;margin:0 0 7px;display:block}
.nv-btn{background:${GRAD};color:#fff;border:none;border-radius:11px;padding:13px 17px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;transition:box-shadow .16s,transform .05s,filter .16s;letter-spacing:-.01em;box-shadow:0 6px 20px -6px rgba(123,93,230,.5)}
.nv-btn:hover:not(:disabled){box-shadow:0 10px 30px -6px rgba(255,93,143,.5);filter:brightness(1.08)}.nv-btn:active:not(:disabled){transform:translateY(1px)}.nv-btn:disabled{opacity:.45;cursor:default}
.nv-card{background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:20px 22px;margin-bottom:14px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 30px -16px rgba(0,0,0,.6)}
.nv-chip{display:inline-block;background:rgba(255,255,255,.05);border:1px solid ${C.line};border-radius:9px;padding:8px 13px;font-size:13px;margin:0 7px 7px 0;color:${C.sub};font-weight:500;transition:all .12s}
.nv-pick{cursor:pointer;user-select:none}
.nv-pick.on{background:${C.accentTint};color:${C.accentInk};border-color:${C.accent}}
.nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:600;text-transform:uppercase}
`;
