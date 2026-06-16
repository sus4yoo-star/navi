"use client";

// app/page.tsx — 나비 홈: 랜딩 + 온디맨드 분석
// navi-analyze.jsx 이식. 분석 호출은 서버(/api/detect, /api/analyze)로.
// 실제 수치(조회·구독자)는 YouTube API에서 그대로 — 지어내지 않음.

import { useState } from "react";
import Link from "next/link";
import { C, Wing } from "@/lib/ui";

const TONES = [
  "감성·스토리형",
  "정보·하우투형",
  "엔터·리액션형",
  "이슈·논쟁형",
  "일상·브이로그형",
];
const PURPOSES = ["신규 유입 확장", "충성팬 심화"];

type Detect = { summary: string; reason: string };
type Stat = { views: number; likes: number; comments: number; title: string };
type ChannelStat = { name: string; subscribers: number; videoCount: number };
type Analysis = {
  shorts?: { cue?: string; hook: string; reason: string; title: string }[];
  titles?: string[];
  thumbnails?: { concept: string; text: string }[];
  description?: string;
  tags?: string[];
  strategy?: { point: string; why: string }[];
  next_actions?: string[];
};

export default function Home() {
  const [channelUrl, setChannelUrl] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectErr, setDetectErr] = useState("");
  const [proposed, setProposed] = useState<Detect | null>(null);
  const [tone, setTone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [aspiration, setAspiration] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [video, setVideo] = useState<Stat | null>(null);
  const [channel, setChannel] = useState<ChannelStat | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

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

  async function runAnalysis() {
    if (!videoUrl.trim()) {
      setErr("분석할 유튜브 영상 URL을 넣어주세요.");
      return;
    }
    setLoading(true);
    setErr("");
    setVideo(null);
    setChannel(null);
    setAnalysis(null);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, channelUrl }),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(
          j.needsWhisper
            ? "자막이 없는 영상이라 아직 자동 분석이 어려워요. 자막이 있는 영상으로 시도해 주세요."
            : j.error || "분석에 실패했어요."
        );
      }
      setVideo(j.video || null);
      setChannel(j.channel || null);
      setAnalysis(j.analysis || null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <style>{css}</style>

      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.card }}>
        <div
          className="nv-wrap"
          style={{
            padding: "20px 22px 18px",
            display: "flex",
            alignItems: "center",
            gap: 11,
            flexWrap: "wrap",
          }}
        >
          <Wing />
          <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.02em" }}>
            나비
          </span>
          <span
            className="nv-mono"
            style={{ fontSize: 11.5, color: C.faint, marginLeft: 2 }}
          >
            채널을 읽고 · 영상을 다듬고 · 더 멀리 — AI 성장 PD
          </span>
          <Link
            href="/today"
            className="nv-ghost"
            style={{ marginLeft: "auto", textDecoration: "none" }}
          >
            오늘의 브리핑
          </Link>
        </div>
      </div>

      <div className="nv-wrap">
        <div className="nv-step">
          <span className={"nv-dot " + (!confirmed ? "on" : "")} /> 채널 읽기
          <span style={{ color: C.line }}>—</span>
          <span className={"nv-dot " + (proposed && !confirmed ? "on" : "")} /> 확인·수정
          <span style={{ color: C.line }}>—</span>
          <span className={"nv-dot " + (confirmed ? "on" : "")} /> 맞춤 분석
        </div>

        {!confirmed && (
          <>
            <div className="nv-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14,
                }}
              >
                <span className="nv-mono nv-eyebrow">step 1 · 채널 읽기</span>
              </div>
              <label className="nv-label">내 채널 URL</label>
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
              {detectErr && (
                <p style={{ color: C.accent, fontSize: 13, margin: "11px 0 0" }}>
                  {detectErr}
                </p>
              )}
              <p
                className="nv-mono"
                style={{ fontSize: 11, color: C.faint, margin: "14px 0 0", lineHeight: 1.6 }}
              >
                매일 아침 자동 브리핑을 받고 싶다면{" "}
                <Link href="/onboarding" style={{ color: C.accent }}>
                  채널 연결하기 →
                </Link>
              </p>
            </div>

            {proposed && (
              <div className="nv-card" style={{ background: "#FBFBFE", borderColor: C.accent }}>
                <span className="nv-mono nv-eyebrow">step 2 · 나비의 첫인상</span>
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
                <button
                  className="nv-btn"
                  style={{ width: "100%" }}
                  onClick={() => tone && purpose && setConfirmed(true)}
                >
                  이 프로필로 분석 시작
                </button>
              </div>
            )}
          </>
        )}

        {confirmed && (
          <>
            <div
              className="nv-card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7 }}>
                <span className="nv-mono nv-eyebrow">profile</span>
                <br />
                <b style={{ fontWeight: 600 }}>{tone}</b> · {purpose}
                {aspiration ? (
                  <span style={{ color: C.sub }}> · 지향: {aspiration}</span>
                ) : null}
              </div>
              <button
                className="nv-ghost"
                onClick={() => setConfirmed(false)}
                disabled={loading}
              >
                프로필 수정
              </button>
            </div>

            <div className="nv-card">
              <label className="nv-label">유튜브 영상 URL</label>
              <input
                className="nv-field"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                style={{ marginBottom: 7 }}
              />
              <p
                className="nv-mono"
                style={{ fontSize: 11, color: C.faint, margin: "0 0 15px", lineHeight: 1.6 }}
              >
                * 자막이 있는 영상이면 URL만으로 자동 분석돼요.
              </p>
              <button
                className="nv-btn"
                style={{ width: "100%" }}
                onClick={runAnalysis}
                disabled={loading}
              >
                {loading ? "나비 분석 중…" : `${tone}에 맞춰 분석하기`}
              </button>
              {err && (
                <p style={{ color: C.accent, fontSize: 13, margin: "11px 0 0" }}>{err}</p>
              )}
            </div>

            {loading && (
              <div
                className="nv-mono"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  color: C.accent,
                  fontSize: 12.5,
                  margin: "4px 2px 16px",
                  letterSpacing: ".04em",
                }}
              >
                <span className="nv-pulse" /> 자막 읽고 프로필에 맞춰 분석 중
              </div>
            )}

            {(video || channel) && (
              <div className="nv-card">
                <span className="nv-mono nv-eyebrow">읽어온 실제 수치</span>
                <div style={{ marginTop: 8 }}>
                  {channel && (
                    <div className="nv-row first nv-mono" style={{ fontSize: 13, color: C.sub }}>
                      {channel.name} · 구독자 {channel.subscribers.toLocaleString()} · 영상{" "}
                      {channel.videoCount.toLocaleString()}개
                    </div>
                  )}
                  {video && (
                    <div className="nv-row nv-mono" style={{ fontSize: 13, color: C.sub }}>
                      조회 {video.views.toLocaleString()} · 좋아요{" "}
                      {video.likes.toLocaleString()} · 댓글{" "}
                      {video.comments.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {analysis && (
              <div style={{ marginBottom: 24 }}>
                <div className="nv-mono nv-eyebrow" style={{ marginBottom: 11 }}>
                  01 · 제작 — 채널 톤 맞춤
                </div>

                {(analysis.shorts || []).map((s, i) => (
                  <div className="nv-card" key={i}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        className="nv-mono"
                        style={{
                          fontSize: 12,
                          color: C.accent,
                          fontWeight: 600,
                          letterSpacing: ".05em",
                        }}
                      >
                        {s.cue || "CUE " + (i + 1)}
                      </span>
                      <Copy text={s.hook} />
                    </div>
                    <p
                      style={{
                        fontSize: 17,
                        fontWeight: 600,
                        margin: "0 0 7px",
                        lineHeight: 1.4,
                        letterSpacing: "-.01em",
                      }}
                    >
                      &ldquo;{s.hook}&rdquo;
                    </p>
                    <p style={{ fontSize: 13.5, color: C.sub, margin: "0 0 9px", lineHeight: 1.6 }}>
                      {s.reason}
                    </p>
                    <div style={{ fontSize: 13, color: C.sub }}>
                      <b style={{ color: C.ink, fontWeight: 600 }}>쇼츠 제목</b> · {s.title}
                    </div>
                  </div>
                ))}

                {analysis.titles && analysis.titles.length > 0 && (
                  <div className="nv-card">
                    <p className="nv-h">제목 후보</p>
                    {analysis.titles.map((t, i) => (
                      <div
                        key={i}
                        className={"nv-row " + (i ? "" : "first")}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: 14.5 }}>{t}</span>
                        <Copy text={t} />
                      </div>
                    ))}
                  </div>
                )}

                {analysis.thumbnails && analysis.thumbnails.length > 0 && (
                  <div className="nv-card">
                    <p className="nv-h">썸네일 컨셉</p>
                    {analysis.thumbnails.map((t, i) => (
                      <div key={i} className={"nv-row " + (i ? "" : "first")}>
                        <div style={{ fontSize: 14, marginBottom: 3 }}>{t.concept}</div>
                        <div className="nv-mono" style={{ fontSize: 12.5, color: C.accent }}>
                          카피: {t.text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {analysis.description && (
                  <div className="nv-card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <p className="nv-h" style={{ marginBottom: 9 }}>
                        설명란 초안
                      </p>
                      <Copy text={analysis.description} />
                    </div>
                    <p
                      style={{
                        fontSize: 13.5,
                        color: C.sub,
                        lineHeight: 1.65,
                        whiteSpace: "pre-wrap",
                        margin: 0,
                      }}
                    >
                      {analysis.description}
                    </p>
                  </div>
                )}

                {analysis.tags && analysis.tags.length > 0 && (
                  <div className="nv-card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <p className="nv-h" style={{ margin: 0 }}>
                        태그
                      </p>
                      <Copy text={analysis.tags.join(", ")} label="전체 복사" />
                    </div>
                    {analysis.tags.map((t, i) => (
                      <span className="nv-tag nv-mono" key={i}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {analysis.strategy && analysis.strategy.length > 0 && (
                  <>
                    <div
                      className="nv-mono nv-eyebrow"
                      style={{ margin: "22px 0 11px" }}
                    >
                      02 · 성장 전략
                    </div>
                    <div className="nv-card">
                      {analysis.strategy.map((s, i) => (
                        <div key={i} className={"nv-row " + (i ? "" : "first")}>
                          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 3 }}>
                            {s.point}
                          </div>
                          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                            {s.why}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {analysis.next_actions && analysis.next_actions.length > 0 && (
                  <div className="nv-card">
                    <p className="nv-h">이번 주에 할 일</p>
                    {analysis.next_actions.map((t, i) => (
                      <div
                        key={i}
                        className={"nv-row " + (i ? "" : "first")}
                        style={{ fontSize: 14, display: "flex", gap: 10 }}
                      >
                        <span style={{ color: C.accent }}>□</span>
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Copy({ text, label }: { text?: string; label?: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      className="nv-copy"
      onClick={() => {
        try {
          navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {}
      }}
    >
      {done ? "복사됨" : label || "복사"}
    </button>
  );
}

const css = `
.nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.nv-wrap{max-width:760px;margin:0 auto;padding:0 22px 48px}
.nv-field{width:100%;box-sizing:border-box;background:${C.card};border:1px solid ${C.line};border-radius:9px;padding:12px 14px;font-size:14px;color:${C.ink};font-family:inherit;outline:none;transition:border-color .14s,box-shadow .14s}
.nv-field::placeholder{color:${C.faint}}
.nv-field:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
.nv-label{font-size:12.5px;color:${C.sub};margin:0 0 6px;display:block}
.nv-btn{background:${C.accent};color:#fff;border:none;border-radius:9px;padding:13px 16px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .14s,transform .05s;letter-spacing:-.01em}
.nv-btn:hover:not(:disabled){opacity:.92}.nv-btn:active:not(:disabled){transform:translateY(1px)}.nv-btn:disabled{opacity:.4;cursor:default}
.nv-ghost{background:transparent;border:1px solid ${C.line};color:${C.sub};border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;font-family:inherit;transition:all .14s}
.nv-ghost:hover{border-color:${C.sub};color:${C.ink}}
.nv-card{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:20px 22px;margin-bottom:14px;box-shadow:0 1px 2px rgba(20,23,28,.03)}
.nv-chip{display:inline-block;background:${C.card};border:1px solid ${C.line};border-radius:8px;padding:7px 12px;font-size:13px;margin:0 7px 7px 0;color:${C.sub};transition:all .12s}
.nv-pick{cursor:pointer;user-select:none}
.nv-pick.on{background:${C.accentTint};color:${C.accentInk};border-color:${C.accent}}
.nv-tag{display:inline-block;background:${C.canvas};border:1px solid ${C.line};border-radius:7px;padding:5px 10px;font-size:12.5px;margin:0 6px 6px 0;color:${C.sub}}
.nv-copy{background:transparent;border:none;color:${C.accent};font-size:12px;cursor:pointer;padding:2px 4px;font-family:inherit;font-weight:500}
.nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
@keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
.nv-h{font-size:15px;font-weight:600;margin:0 0 10px;letter-spacing:-.01em}
.nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:500;text-transform:uppercase}
.nv-step{display:flex;gap:8px;align-items:center;font-size:12px;color:${C.faint};margin:22px 0;letter-spacing:.02em}
.nv-dot{width:5px;height:5px;border-radius:50%;background:${C.line}}
.nv-dot.on{background:${C.accent}}
.nv-row{padding:9px 0;border-top:1px solid ${C.line}}
.nv-row.first{border-top:none}
`;
