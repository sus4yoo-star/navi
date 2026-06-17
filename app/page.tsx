"use client";

// app/page.tsx — 나비 홈: 로그인 우선 랜딩 + (로그인 없이) 채널 자동 분석 체험
// 채널 URL 하나 → 최근 10개(쇼츠/롱폼) 알아서 진단·솔루션. 영상별 깊은 분석은 "자세히" 한 번.
// 채널/영상 시청은 서버에서. 수치는 YouTube API 실측 — 지어내지 않음.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { C, Wing } from "@/lib/ui";
import { supabase, signIn } from "@/lib/navi";

const TONES = [
  "감성·스토리형",
  "정보·하우투형",
  "엔터·리액션형",
  "이슈·논쟁형",
  "일상·브이로그형",
];
const PURPOSES = ["신규 유입 확장", "충성팬 심화"];

type Detect = { summary: string; reason: string };
type Video = { id: string; title: string; views: number; date: string; format: string };
type Solution = {
  read?: string;
  patterns?: { point: string; evidence: string }[];
  shorts_solution?: { point: string; why: string }[];
  longform_solution?: { point: string; why: string }[];
  next_videos?: { title: string; format: string; angle: string; hook: string }[];
  this_week?: string[];
};
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

  // 채널 자동 솔루션
  const [solLoading, setSolLoading] = useState(false);
  const [solErr, setSolErr] = useState("");
  const [channel, setChannel] = useState<{ name: string; subscribers: number; videoCount: number } | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [sol, setSol] = useState<Solution | null>(null);

  // 영상별 깊은 분석 (탭 시)
  const [deepId, setDeepId] = useState<string | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepErr, setDeepErr] = useState("");
  const [deep, setDeep] = useState<Analysis | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
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
      setTone(TONES.includes(j.tone) ? j.tone : TONES[0]);
      setPurpose(PURPOSES.includes(j.purpose) ? j.purpose : PURPOSES[0]);
    } catch (e: any) {
      setDetectErr(e.message);
    } finally {
      setDetecting(false);
    }
  }

  async function runChannel() {
    setConfirmed(true);
    setSolLoading(true);
    setSolErr("");
    setSol(null);
    setChannel(null);
    setVideos([]);
    setDeepId(null);
    setDeep(null);
    try {
      const r = await fetch("/api/channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl, tone, purpose, aspiration }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "분석에 실패했어요.");
      setChannel(j.channel || null);
      setVideos(j.videos || []);
      setSol(j.solution || null);
    } catch (e: any) {
      setSolErr(e.message);
    } finally {
      setSolLoading(false);
    }
  }

  async function deepDive(v: Video) {
    if (deepId === v.id) {
      setDeepId(null);
      setDeep(null);
      return;
    }
    setDeepId(v.id);
    setDeep(null);
    setDeepErr("");
    setDeepLoading(true);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
          channelUrl,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "분석에 실패했어요.");
      setDeep(j.analysis || null);
    } catch (e: any) {
      setDeepErr(e.message);
    } finally {
      setDeepLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <style>{css}</style>

      {/* ── 다크 히어로: 로그인 우선 ── */}
      <header className="nv-hero">
        <div className="nv-wrap nv-hero-top">
          <Wing />
          <span className="nv-brand">나비</span>
          <Link href="/today" className="nv-hero-link">
            오늘의 브리핑
          </Link>
        </div>

        <div className="nv-wrap nv-hero-body">
          <div className="nv-status">
            <span className="nv-live" />
            SYSTEM · 채널 분석 엔진 가동중
          </div>
          <h1 className="nv-hero-h1">
            매일 아침, 내 채널을 읽고
            <br />
            <span className="nv-accent">오늘 만들 영상</span>을 정해주는
            <br />
            AI 성장 PD
          </h1>
          <p className="nv-hero-sub">
            가입할 때 채널 URL 한 번 — 그다음은 나비가 알아서. 최근 영상을 직접 보고 진단·트렌드·
            오늘의 영상까지 매일 자동으로 도착해요.
          </p>

          {authed ? (
            <div className="nv-cta-row">
              <button className="nv-btn nv-btn-lg" onClick={() => router.push("/today")}>
                오늘의 브리핑 보기
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

      {/* ── 로그인 없이 체험: 채널 URL 하나로 알아서 ── */}
      <div className="nv-wrap" style={{ paddingTop: 30 }}>
        <div className="nv-try-head">
          <div>
            <div className="nv-mono nv-eyebrow">no-login · 체험</div>
            <h2 className="nv-h2">채널 URL만 넣으면, 최근 영상까지 알아서 분석</h2>
            <p className="nv-muted2">
              최근 10개(쇼츠·롱폼)를 읽어 진단하고 처방·다음 영상까지 제안해드려요. 영상 URL은
              따로 넣지 않아요.
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
                      onClick={() => tone && purpose && runChannel()}
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
                  <button
                    className="nv-ghost"
                    onClick={() => {
                      setConfirmed(false);
                      setSol(null);
                    }}
                    disabled={solLoading}
                  >
                    프로필 수정
                  </button>
                </div>

                {solLoading && (
                  <div className="nv-running">
                    <span className="nv-pulse" /> 최근 영상 읽고 채널 진단 중
                  </div>
                )}
                {solErr && (
                  <div className="nv-card" style={{ borderColor: C.accent }}>
                    <p className="nv-err" style={{ margin: "0 0 10px" }}>
                      {solErr}
                    </p>
                    <button className="nv-btn" onClick={runChannel}>
                      다시 분석
                    </button>
                  </div>
                )}

                {channel && (
                  <div className="nv-card">
                    <span className="nv-mono nv-eyebrow">채널 현황</span>
                    <div className="nv-mono nv-data" style={{ margin: "8px 0 0" }}>
                      {channel.name} · 구독자 {channel.subscribers.toLocaleString()} · 영상{" "}
                      {channel.videoCount.toLocaleString()}개
                    </div>
                    {sol?.read && <p className="nv-read">{sol.read}</p>}
                  </div>
                )}

                {videos.length > 0 && (
                  <div className="nv-card">
                    <p className="nv-h">최근 영상 — 탭하면 그 영상만 깊게 분석</p>
                    {videos.map((v, i) => (
                      <div key={v.id} className={"nv-row " + (i ? "" : "first")}>
                        <div className="nv-vid">
                          <span className={"nv-badge " + (v.format === "쇼츠" ? "s" : "l")}>
                            {v.format}
                          </span>
                          <span className="nv-vid-title">{v.title}</span>
                          <button
                            className="nv-ghost nv-vid-btn"
                            onClick={() => deepDive(v)}
                            disabled={deepLoading && deepId === v.id}
                          >
                            {deepId === v.id ? (deepLoading ? "보는 중…" : "닫기") : "자세히"}
                          </button>
                        </div>
                        <div className="nv-mono nv-vid-meta">
                          조회 {v.views.toLocaleString()} · {v.date}
                        </div>

                        {deepId === v.id && (
                          <div className="nv-deep">
                            {deepLoading && (
                              <div className="nv-running" style={{ margin: "6px 0" }}>
                                <span className="nv-pulse" /> 나비가 이 영상을 직접 보는 중
                              </div>
                            )}
                            {deepErr && <p className="nv-err">{deepErr}</p>}
                            {deep && <Deep a={deep} />}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {sol?.patterns && sol.patterns.length > 0 && (
                  <div className="nv-card">
                    <p className="nv-h">진단 — 무엇이 되고 무엇이 안 되나</p>
                    {sol.patterns.map((p, i) => (
                      <div key={i} className={"nv-row " + (i ? "" : "first")}>
                        <div className="nv-strat-pt">{p.point}</div>
                        <div className="nv-mono nv-evi">근거 · {p.evidence}</div>
                      </div>
                    ))}
                  </div>
                )}

                {sol?.shorts_solution && sol.shorts_solution.length > 0 && (
                  <div className="nv-card">
                    <p className="nv-h">
                      <span className="nv-badge s">쇼츠</span> 처방
                    </p>
                    {sol.shorts_solution.map((s, i) => (
                      <div key={i} className={"nv-row " + (i ? "" : "first")}>
                        <div className="nv-strat-pt">{s.point}</div>
                        <div className="nv-strat-why">{s.why}</div>
                      </div>
                    ))}
                  </div>
                )}

                {sol?.longform_solution && sol.longform_solution.length > 0 && (
                  <div className="nv-card">
                    <p className="nv-h">
                      <span className="nv-badge l">롱폼</span> 처방
                    </p>
                    {sol.longform_solution.map((s, i) => (
                      <div key={i} className={"nv-row " + (i ? "" : "first")}>
                        <div className="nv-strat-pt">{s.point}</div>
                        <div className="nv-strat-why">{s.why}</div>
                      </div>
                    ))}
                  </div>
                )}

                {sol?.next_videos && sol.next_videos.length > 0 && (
                  <>
                    <div className="nv-mono nv-eyebrow" style={{ margin: "22px 0 11px" }}>
                      다음에 만들 영상
                    </div>
                    {sol.next_videos.map((n, i) => (
                      <div key={i} className="nv-card">
                        <div className="nv-cue-row">
                          <span className={"nv-badge " + (n.format === "쇼츠" ? "s" : "l")}>
                            {n.format}
                          </span>
                          <Copy text={n.title} />
                        </div>
                        <p className="nv-hook">{n.title}</p>
                        <p className="nv-reason">{n.angle}</p>
                        {n.hook && (
                          <div className="nv-firsthook">첫 3초 · {n.hook}</div>
                        )}
                      </div>
                    ))}
                  </>
                )}

                {sol?.this_week && sol.this_week.length > 0 && (
                  <div className="nv-card">
                    <p className="nv-h">이번 주에 할 일</p>
                    {sol.this_week.map((t, i) => (
                      <div key={i} className={"nv-row " + (i ? "" : "first") + " nv-todo"}>
                        <span className="nv-todo-box">□</span>
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Deep({ a }: { a: Analysis }) {
  return (
    <div style={{ marginTop: 6 }}>
      {(a.shorts || []).map((s, i) => (
        <div key={i} className="nv-deep-block">
          <div className="nv-cue-row">
            <span className="nv-mono nv-cue">{s.cue || "CUE " + (i + 1)}</span>
            <Copy text={s.hook} />
          </div>
          <p className="nv-hook" style={{ fontSize: 16 }}>
            &ldquo;{s.hook}&rdquo;
          </p>
          <p className="nv-reason">{s.reason}</p>
          <div className="nv-shorts-title">
            <b>쇼츠 제목</b> · {s.title}
          </div>
        </div>
      ))}
      {a.titles && a.titles.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">제목 후보</p>
          {a.titles.map((t, i) => (
            <div key={i} className="nv-row-flex" style={{ padding: "6px 0" }}>
              <span style={{ fontSize: 14 }}>{t}</span>
              <Copy text={t} />
            </div>
          ))}
        </div>
      )}
      {a.thumbnails && a.thumbnails.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">썸네일 컨셉</p>
          {a.thumbnails.map((t, i) => (
            <div key={i} style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 14 }}>{t.concept}</div>
              <div className="nv-mono nv-copy-line">카피: {t.text}</div>
            </div>
          ))}
        </div>
      )}
      {a.description && (
        <div className="nv-deep-block">
          <div className="nv-cue-row">
            <p className="nv-h" style={{ margin: 0 }}>
              설명란 초안
            </p>
            <Copy text={a.description} />
          </div>
          <p className="nv-desc">{a.description}</p>
        </div>
      )}
      {a.tags && a.tags.length > 0 && (
        <div className="nv-deep-block">
          <div className="nv-cue-row">
            <p className="nv-h" style={{ margin: 0 }}>
              태그
            </p>
            <Copy text={a.tags.join(", ")} label="전체 복사" />
          </div>
          <div style={{ marginTop: 8 }}>
            {a.tags.map((t, i) => (
              <span className="nv-tag nv-mono" key={i}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {a.strategy && a.strategy.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">이 영상 기반 전략</p>
          {a.strategy.map((s, i) => (
            <div key={i} style={{ padding: "6px 0" }}>
              <div className="nv-strat-pt">{s.point}</div>
              <div className="nv-strat-why">{s.why}</div>
            </div>
          ))}
        </div>
      )}
      {a.next_actions && a.next_actions.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">바로 할 일</p>
          {a.next_actions.map((t, i) => (
            <div key={i} className="nv-todo" style={{ padding: "6px 0" }}>
              <span className="nv-todo-box">□</span>
              {t}
            </div>
          ))}
        </div>
      )}
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

/* ── 다크 히어로 ── */
.nv-hero{position:relative;overflow:hidden;background:#0F1115;color:#fff;border-bottom:1px solid rgba(255,255,255,.08)}
.nv-hero-grid{position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:34px 34px;
  -webkit-mask-image:radial-gradient(120% 70% at 18% 0%,#000 0%,transparent 70%);
  mask-image:radial-gradient(120% 70% at 18% 0%,#000 0%,transparent 70%)}
.nv-hero-top{position:relative;z-index:1;display:flex;align-items:center;gap:11px;padding-top:18px;padding-bottom:6px}
.nv-brand{font-size:22px;font-weight:700;letter-spacing:-.02em;color:#fff}
.nv-hero-link{margin-left:auto;font-size:12.5px;color:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:7px 13px;text-decoration:none;transition:all .14s}
.nv-hero-link:hover{border-color:rgba(255,255,255,.45);color:#fff}
.nv-hero-body{position:relative;z-index:1;padding:26px 22px 44px}
.nv-status{display:inline-flex;align-items:center;gap:8px;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.6);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 11px;margin-bottom:20px}
.nv-live{width:7px;height:7px;border-radius:50%;background:#36E0A0;box-shadow:0 0 10px #36E0A0;display:inline-block;animation:nvp 1.4s ease-in-out infinite}
.nv-hero-h1{font-size:38px;line-height:1.18;font-weight:700;letter-spacing:-.03em;margin:0 0 16px;color:#fff}
.nv-accent{color:#9C95FF}
.nv-hero-sub{font-size:15px;line-height:1.7;color:rgba(255,255,255,.74);max-width:560px;margin:0 0 26px}
.nv-cta-row{display:flex;gap:11px;flex-wrap:wrap;align-items:center;margin-bottom:13px}
.nv-btn-oauth{display:inline-flex;align-items:center;gap:9px;background:#fff;color:#15171C;border:none;border-radius:10px;padding:13px 20px;font-size:14.5px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:-.01em;transition:transform .05s,box-shadow .14s;box-shadow:0 1px 0 rgba(0,0,0,.04)}
.nv-btn-oauth:hover{box-shadow:0 6px 22px rgba(0,0,0,.28)}
.nv-btn-oauth:active{transform:translateY(1px)}
.nv-btn-kakao{background:#FEE500;color:#191600}
.nv-btn-lg{padding:14px 24px;font-size:15.5px}
.nv-hero-foot{font-size:11.5px;color:rgba(255,255,255,.5);letter-spacing:.02em;margin:0}

/* ── 라이트 본문 ── */
.nv-try-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.nv-h2{font-size:21px;font-weight:700;letter-spacing:-.02em;margin:7px 0 5px;color:${C.ink}}
.nv-muted2{font-size:13.5px;color:${C.sub};line-height:1.6;margin:0}
.nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:600;text-transform:uppercase}
.nv-eyebrow-accent{color:${C.accent}}

.nv-field{width:100%;box-sizing:border-box;background:#fff;border:1.5px solid #D5D8E1;border-radius:10px;padding:13px 15px;font-size:14.5px;color:${C.ink};font-family:inherit;outline:none;transition:border-color .14s,box-shadow .14s}
.nv-field::placeholder{color:#A6ABB6}
.nv-field:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
.nv-label{font-size:13px;color:${C.ink};font-weight:600;margin:0 0 7px;display:block}

.nv-btn{background:${C.accent};color:#fff;border:none;border-radius:10px;padding:13px 18px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .14s,transform .05s,box-shadow .14s;letter-spacing:-.01em}
.nv-btn:hover:not(:disabled){box-shadow:0 6px 20px rgba(75,67,214,.32)}
.nv-btn:active:not(:disabled){transform:translateY(1px)}
.nv-btn:disabled{opacity:.45;cursor:default}
.nv-ghost{background:transparent;border:1.5px solid ${C.line};color:${C.sub};border-radius:9px;padding:8px 13px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .14s}
.nv-ghost:hover{border-color:${C.sub};color:${C.ink}}

.nv-card{background:#fff;border:1px solid ${C.line};border-radius:14px;padding:20px 22px;margin-bottom:14px;box-shadow:0 1px 2px rgba(20,23,28,.04),0 8px 24px -18px rgba(20,23,28,.18)}
.nv-card-accent{background:#FBFBFE;border-color:${C.accent};box-shadow:0 8px 28px -16px rgba(75,67,214,.4)}

.nv-chip{display:inline-block;background:#fff;border:1.5px solid ${C.line};border-radius:9px;padding:8px 13px;font-size:13px;margin:0 7px 7px 0;color:${C.sub};font-weight:500;transition:all .12s}
.nv-pick{cursor:pointer;user-select:none}
.nv-pick.on{background:${C.accentTint};color:${C.accentInk};border-color:${C.accent}}
.nv-tag{display:inline-block;background:${C.canvas};border:1px solid ${C.line};border-radius:7px;padding:5px 10px;font-size:12.5px;margin:0 6px 6px 0;color:${C.sub}}

.nv-badge{display:inline-block;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:6px;margin-right:8px;vertical-align:middle}
.nv-badge.s{background:#EAF7F0;color:#1F9E6B;border:1px solid #BfE9D5}
.nv-badge.l{background:${C.accentTint};color:${C.accentInk};border:1px solid #CFCBF6}

.nv-vid{display:flex;align-items:center;gap:6px}
.nv-vid-title{font-size:14px;color:${C.ink};font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nv-vid-btn{flex:none;padding:5px 11px}
.nv-vid-meta{font-size:12px;color:${C.sub};margin-top:4px}
.nv-deep{margin-top:12px;padding-top:12px;border-top:1px dashed ${C.line}}
.nv-deep-block{background:${C.canvas};border:1px solid ${C.line};border-radius:11px;padding:14px 16px;margin-bottom:10px}

.nv-copy{background:transparent;border:none;color:${C.accent};font-size:12px;cursor:pointer;padding:2px 4px;font-family:inherit;font-weight:600}
.nv-copy-line{font-size:12.5px;color:${C.accent}}
.nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
@keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
.nv-running{display:flex;align-items:center;gap:9px;color:${C.accent};font-size:12.5px;margin:4px 2px 16px;letter-spacing:.04em;font-family:ui-monospace,'SF Mono',Menlo,monospace}

.nv-h{font-size:15.5px;font-weight:700;margin:0 0 10px;letter-spacing:-.01em;color:${C.ink}}
.nv-step{display:flex;gap:8px;align-items:center;font-size:12px;color:${C.sub};margin:6px 0 20px;letter-spacing:.02em;font-weight:500}
.nv-step-dash{color:${C.line}}
.nv-dot{width:6px;height:6px;border-radius:50%;background:${C.line}}
.nv-dot.on{background:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
.nv-row{padding:12px 0;border-top:1px solid ${C.line}}
.nv-row.first{border-top:none}
.nv-row-flex{display:flex;justify-content:space-between;align-items:center}
.nv-cue-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.nv-cue{font-size:12px;color:${C.accent};font-weight:700;letter-spacing:.05em}
.nv-hook{font-size:17.5px;font-weight:700;margin:0 0 7px;line-height:1.4;letter-spacing:-.01em;color:${C.ink}}
.nv-reason{font-size:13.5px;color:${C.sub};margin:0 0 9px;line-height:1.6}
.nv-firsthook{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12.5px;color:${C.accentInk};background:${C.accentTint};border-radius:7px;padding:8px 11px;line-height:1.5}
.nv-shorts-title{font-size:13px;color:${C.sub}}
.nv-shorts-title b{color:${C.ink};font-weight:700}
.nv-desc{font-size:13.5px;color:${C.sub};line-height:1.7;white-space:pre-wrap;margin:0}
.nv-data{font-size:13px;color:${C.ink};font-weight:500}
.nv-read{font-size:14.5px;color:${C.ink};line-height:1.65;margin:11px 0 0}
.nv-evi{font-size:12px;color:${C.live};line-height:1.5;margin-top:3px}
.nv-strat-pt{font-size:14.5px;font-weight:700;margin-bottom:3px;color:${C.ink}}
.nv-strat-why{font-size:13px;color:${C.sub};line-height:1.6}
.nv-todo{display:flex;gap:10px;font-size:14px;color:${C.ink}}
.nv-todo-box{color:${C.accent};font-weight:700}
.nv-profile{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.nv-profile-txt{font-size:13.5px;color:${C.ink};line-height:1.7}
.nv-profile-txt b{font-weight:700}
.nv-impression{font-size:17.5px;font-weight:700;margin:10px 0 5px;line-height:1.45;letter-spacing:-.01em;color:${C.ink}}
.nv-impression-sub{font-size:13px;color:${C.sub};margin:0 0 18px;line-height:1.6}
.nv-err{color:${C.accent};font-size:13px;margin:11px 0 0;font-weight:500}
.nv-hint{font-size:11.5px;color:${C.faint};margin:14px 0 0;line-height:1.6}

@media (max-width:560px){.nv-hero-h1{font-size:30px}}
`;
