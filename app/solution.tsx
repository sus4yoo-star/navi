"use client";

// app/solution.tsx — 채널 자동 솔루션 (홈 체험 · /today 공용)
// channelUrl(+프로필)만 받으면 /api/channel로 최근 10개를 진단·처방. 영상별 깊은 분석은 "자세히" 탭.

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { C, Wing, GRAD, GRAD_SOFT } from "@/lib/ui";

// 서버가 (타임아웃 등으로) HTML 오류 페이지를 줘도 안 깨지게 안전 파싱
async function callJson(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* HTML 등 비-JSON */
  }
  if (!r.ok || !data) {
    const msg =
      data?.error ||
      (r.status === 502 || r.status === 504 || r.status === 500
        ? "분석이 오래 걸려 시간이 초과됐어요. 짧은 영상으로 다시 시도해 주세요."
        : "분석에 실패했어요. 다시 시도해 주세요.");
    throw new Error(msg);
  }
  return data;
}

// 진행 중/완료된 작업을 기기에 기억 → 앱을 닫았다 돌아와도 결과를 다시 보여준다.
// (PWA는 닫히면 화면 폴링이 멈추지만, 분석은 서버에서 끝나 DB에 저장돼 있다.)
type Cache = { id?: string; status: "pending" | "done"; data?: any };
function loadCache(key: string): Cache | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as Cache) : null;
  } catch {
    return null;
  }
}
function saveCache(key: string, val: Cache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* 용량 초과 등은 무시 */
  }
}
function delCache(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

// 백그라운드 작업이 끝날 때까지 상태를 주기적으로 확인(폴링, 최대 약 5분).
// done이면 작업 행 전체({analysis, video, channel})를 반환. shouldGo()가 false면 중단.
async function pollJob(
  id: string,
  shouldGo?: () => boolean
): Promise<{ analysis: any; video?: any; channel?: any } | null> {
  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 3500));
    if (shouldGo && !shouldGo()) return null;
    const r = await fetch(`/api/analyze/status?id=${id}`);
    const j = await r.json().catch(() => null);
    if (!j) continue;
    if (j.status === "done") return j;
    if (j.status === "error") throw new Error(j.error || "처리하지 못했어요.");
  }
  throw new Error("처리가 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.");
}

// ── 원탭 도구: 문구를 브랜드 톤 카드 이미지(PNG)로 저장 ──
// 최근 영상(실데이터)으로 채널 현황을 계산 — 지어내지 않고 숫자로.
function channelStats(videos: Video[], subs: number) {
  if (!videos.length) return [] as { label: string; value: string }[];
  const avg = (a: Video[]) =>
    a.length ? Math.round(a.reduce((s, v) => s + v.views, 0) / a.length) : 0;
  const shorts = videos.filter((v) => v.format === "쇼츠");
  const longs = videos.filter((v) => v.format === "롱폼");
  const top = videos.reduce((a, b) => (b.views > a.views ? b : a), videos[0]);
  const times = videos
    .map((v) => +new Date(v.date))
    .filter((t) => !isNaN(t))
    .sort((a, b) => b - a);
  const gap =
    times.length > 1 ? (times[0] - times[times.length - 1]) / 86400000 / (times.length - 1) : 0;
  const rows: { label: string; value: string }[] = [];
  if (shorts.length)
    rows.push({ label: "쇼츠", value: `${shorts.length}편 · 평균 ${avg(shorts).toLocaleString()}회` });
  if (longs.length)
    rows.push({ label: "롱폼", value: `${longs.length}편 · 평균 ${avg(longs).toLocaleString()}회` });
  if (gap > 0)
    rows.push({ label: "업로드", value: gap < 1.5 ? "거의 매일" : `${gap.toFixed(0)}일에 1편꼴` });
  if (top)
    rows.push({
      label: "최고 조회",
      value: `${top.views.toLocaleString()}회${
        subs > 0 ? ` · 구독자 대비 ${(top.views / subs).toFixed(1)}배` : ""
      }`,
    });
  return rows;
}

type Video = {
  id: string;
  title: string;
  views: number;
  date: string;
  format: string;
  thumb?: string;
};
type Sol = {
  read?: string;
  patterns?: { point: string; evidence: string }[];
  shorts_solution?: { point: string; why: string }[];
  longform_solution?: { point: string; why: string }[];
  next_videos?: { title: string; format: string; angle: string; hook: string }[];
  this_week?: string[];
  benchmark?: {
    name: string;
    summary: string;
    learn: string[];
    auto?: boolean;
    why?: string[];
    mine?: { subs: number; avgViews: number; shortsPct: number; n: number } | null;
    theirs?: { subs: number; avgViews: number; shortsPct: number; n: number };
    refs?: { title: string; views: number; format: string }[];
  } | null;
};
type Short = {
  cue?: string; // 시작-끝 타임코드
  transcript?: string; // 그 구간 실제 대사(자막 그대로)
  hook: string; // 첫 3초 훅
  onscreen?: string; // 화면에 넣을 자막 문구
  caption?: string; // 업로드 캡션
  hashtags?: string[];
  title: string;
  reason: string;
  score?: number; // 정렬용 상대 우선순위(겉으로 표시 안 함)
};
type Idea = {
  title: string;
  format: string;
  hook?: string;
  why?: string;
  source?: string;
  thumbnail?: { concept?: string; text?: string };
  refPoints?: string[];
};
// 통합 브리핑 — 하나의 결과로 모든 패널을 그린다
type CohortCard = {
  name: string;
  thumb?: string;
  subs: number;
  recent60: number;
  avgViews: number;
  shortsPct: number;
  url?: string;
  top?: { title: string; views: number; thumb?: string; url?: string } | null;
  analysis?: string;
  apply?: string;
};
type Brief = {
  cohort?: CohortCard[];
  mine?: { name: string; subs: number; avgViews: number; shortsPct: number };
  spark?: string;
  landscape?: string;
  position?: string;
  diagnosis?: { point: string; evidence: string }[];
  ideas?: Idea[];
  strategy?: { point: string; why: string }[];
  todo?: string[];
};
type Analysis = {
  summary?: string; // 영상 전체 핵심 요약
  inspiration?: { title: string; how?: string }[]; // 이 영상이 열어주는 영감
  good?: string[];
  improve?: string[];
  titles?: string[];
  thumbnail?: { concept: string; text: string };
  tags?: string[];
  shorts?: Short[];
  next_ideas?: string[];
};

export default function Solution({
  channelUrl,
  tone,
  purpose,
  aspiration,
  benchmarkUrl,
  niche,
  userId,
}: {
  channelUrl: string;
  tone?: string;
  purpose?: string;
  aspiration?: string;
  benchmarkUrl?: string;
  niche?: string;
  userId?: string;
}) {
  const [loading, setLoading] = useState(false); // 1단계: 목록
  const [err, setErr] = useState("");
  const [channel, setChannel] = useState<{ name: string; subscribers: number; videoCount: number } | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [deepId, setDeepId] = useState<string | null>(null);
  const deepIdRef = useRef<string | null>(null);
  useEffect(() => {
    deepIdRef.current = deepId;
  }, [deepId]);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepErr, setDeepErr] = useState("");
  const [deep, setDeep] = useState<Analysis | null>(null);

  // 워너비 비교 — 메인 진단과 분리해 병렬 로딩(타임아웃 방어)
  const [bench, setBench] = useState<Sol["benchmark"]>(null);
  const [benchLoading, setBenchLoading] = useState(false);

  // 통합 브리핑 — 정찰→내 위치·진단→이번 주 만들 영상→전략→할 일을 하나로
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefErr, setBriefErr] = useState("");

  // 긴 정찰 동안 단계별 메시지 순환(체감 속도)
  const [loadStep, setLoadStep] = useState(0);
  useEffect(() => {
    if (!briefLoading) {
      setLoadStep(0);
      return;
    }
    const t = setInterval(() => setLoadStep((s) => s + 1), 4000);
    return () => clearInterval(t);
  }, [briefLoading]);
  const LOAD_MSGS = [
    "영감을 줄 채널들을 바깥에서 찾는 중…",
    "그 채널들의 기법과 시청자 반응을 읽는 중…",
    "내 채널의 현재 위치를 진단하는 중…",
    "이번 주 만들 영상을 기획하는 중…",
    "거의 다 됐어요. 정리하는 중…",
  ];

  const startBrief = useCallback(
    async (ch: any, vids: Video[], force = false) => {
      if (!ch) return;
      const key = `navi_brief_${channelUrl}`; // 날짜 무관 — '다시 정찰' 전엔 저장된 그대로
      if (force) {
        delCache(key);
        setBrief(null);
      }
      setBriefErr("");
      const cached = loadCache(key);
      if (!force && cached?.status === "done" && cached.data) {
        setBrief(cached.data);
        return;
      }
      setBriefLoading(true);
      try {
        let pid = !force && cached?.status === "pending" ? cached.id : undefined;
        if (!pid) {
          const r = await callJson("/api/brief/start", {
            channel: ch,
            videos: vids,
            niche,
            tone,
            purpose,
            aspiration,
          });
          pid = r.id;
          saveCache(key, { id: pid, status: "pending" });
        }
        const job = await pollJob(pid!);
        setBrief(job?.analysis || null);
        saveCache(key, { id: pid, status: "done", data: job?.analysis || null });
      } catch (e: any) {
        setBrief(null);
        setBriefErr(e?.message || "브리핑을 받지 못했어요.");
        delCache(key);
      } finally {
        setBriefLoading(false);
      }
    },
    [channelUrl, niche, tone, purpose, aspiration]
  );

  const run = useCallback(async () => {
    if (!channelUrl) return;
    setLoading(true);
    setErr("");
    setBrief(null);
    setBriefErr("");
    setBench(null);
    setChannel(null);
    setVideos([]);
    setPageToken(null);
    setDeepId(null);
    setDeep(null);
    let base: any;
    try {
      // 1단계: 채널 + 영상 목록 (YouTube만 — 빠름)
      base = await callJson("/api/channel", { channelUrl });
      setChannel(base.channel || null);
      setVideos(base.videos || []);
      setPageToken(base.nextPageToken || null);
    } catch (e: any) {
      setErr(e.message);
      setLoading(false);
      return;
    }
    setLoading(false);

    // '닮고 싶은 채널'을 명시적으로 넣었을 때만 1:1 비교(자동 비슷한 채널은 니치 레이더가 담당 — 중복 제거).
    if (benchmarkUrl) {
      setBenchLoading(true);
      callJson("/api/benchmark", {
        channel: base.channel,
        benchmarkUrl,
        niche,
        myVideos: (base.videos || []).map((v: Video) => ({ views: v.views, format: v.format })),
      })
        .then((b) => setBench(b.benchmark || null))
        .catch(() => setBench(null))
        .finally(() => setBenchLoading(false));
    }

    // 통합 브리핑(백그라운드+폴링·캐시·재방문 복원) — 정찰→진단→기획→전략을 하나로
    startBrief(base.channel, base.videos);
  }, [channelUrl, benchmarkUrl, niche, startBrief]);

  useEffect(() => {
    run();
  }, [run]);

  // 이전 영상 더 불러오기 — 다음 페이지를 받아 목록에 이어붙인다(첫 영상까지).
  async function loadMore() {
    if (!pageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await callJson("/api/channel", { channelUrl, pageToken });
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...(more.videos || []).filter((v: Video) => !seen.has(v.id))];
      });
      setPageToken(more.nextPageToken || null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function deepDive(v: Video, force = false) {
    if (deepId === v.id && !force) {
      setDeepId(null);
      setDeep(null);
      return;
    }
    setDeepId(v.id);
    setDeep(null);
    setDeepErr("");
    const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
    const dkey = `navi_deep_${v.id}`;
    if (force) delCache(dkey); // '다시 분석' — 캐시 무시하고 새로

    // 이미 분석해 둔 영상이면 즉시 표시(닫았다 돌아와도 그대로)
    if (!force && v.format !== "쇼츠") {
      const done = loadCache(dkey);
      if (done?.status === "done" && done.data) {
        setDeep(done.data);
        return;
      }
    }

    setDeepLoading(true);
    try {
      if (v.format === "쇼츠") {
        // 쇼츠는 빠르므로 동기 분석(즉시 결과)
        const j = await callJson("/api/analyze", { videoUrl, channelUrl, format: v.format });
        setDeep(j.analysis || null);
      } else {
        // 롱폼은 길어서 백그라운드로 돌리고 결과를 폴링(타임아웃 방어).
        // 진행 중 작업이 있으면 새로 시작하지 않고 이어받는다.
        const cached = force ? null : loadCache(dkey);
        let id = cached?.status === "pending" ? cached.id : undefined;
        if (!id) {
          const r = await callJson("/api/analyze/start", {
            videoUrl,
            channelUrl,
            format: v.format,
            userId, // 완료되면 이 사용자에게 푸시
          });
          id = r.id;
          saveCache(dkey, { id, status: "pending" });
        }
        const job = await pollJob(id!, () => deepIdRef.current === v.id);
        if (job?.analysis) {
          setDeep(job.analysis);
          saveCache(dkey, { id, status: "done", data: job.analysis });
        }
      }
    } catch (e: any) {
      setDeepErr(e.message);
      if (v.format !== "쇼츠") delCache(dkey);
    } finally {
      setDeepLoading(false);
    }
  }

  return (
    <>
      <style>{css}</style>

      {loading && (
        <div className="nv-running">
          <span className="nv-pulse" /> 최근 영상 불러오는 중
        </div>
      )}
      {err && (
        <div className="nv-card" style={{ borderColor: C.accent }}>
          <p className="nv-err" style={{ margin: "0 0 10px" }}>
            {err}
          </p>
          <button className="nv-btn" onClick={run}>
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
          {(() => {
            const rows = channelStats(videos, channel.subscribers);
            return rows.length ? (
              <div className="nv-stats">
                {rows.map((r) => (
                  <div className="nv-stat" key={r.label}>
                    <span className="nv-mono nv-stat-l">{r.label}</span>
                    <span className="nv-stat-v">{r.value}</span>
                  </div>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* 중심축 — 니치 레이더: 비슷한 결의 지금 활발한 채널들을 한눈에 + 영감 */}
      {(briefLoading || brief || briefErr) && (
        <div className="nv-card nv-radar">
          <div className="nv-hero-top">
            <div>
              <div className="nv-hero-eyebrow">
                <Wing size={15} />
                <span className="nv-mono">영감 레이더</span>
              </div>
              <h2 className="nv-hero-title">여기서 영감을 얻어오세요</h2>
              <p className="nv-radar-promise">
                주제는 달라도 — 당신이 응용할 영감을 찾아왔어요.
              </p>
            </div>
            {channel && (brief || briefErr) && (
              <button
                className="nv-replan"
                onClick={() => startBrief(channel, videos, true)}
                disabled={briefLoading}
              >
                {briefLoading ? "정찰 중…" : "다시 정찰"}
              </button>
            )}
          </div>

          {briefLoading && !brief && (
            <div className="nv-running" style={{ margin: "14px 2px 4px" }}>
              <span className="nv-pulse" /> {LOAD_MSGS[Math.min(loadStep, LOAD_MSGS.length - 1)]}
            </div>
          )}
          {briefErr && !briefLoading && (
            <div style={{ marginTop: 12 }}>
              <p className="nv-err" style={{ margin: "0 0 10px" }}>{briefErr}</p>
              {channel && (
                <button className="nv-btn" onClick={() => startBrief(channel, videos, true)}>
                  다시 정찰
                </button>
              )}
            </div>
          )}

          {brief?.spark && (
            <div className="nv-spark">
              <Wing size={18} />
              <p>{brief.spark}</p>
            </div>
          )}

          {brief?.landscape && (
            <p className="nv-reason" style={{ margin: "12px 0 0", color: C.sub }}>{brief.landscape}</p>
          )}

          {!!brief?.cohort?.length && (
            <>
              <div className="nv-co-meta">
                {brief.mine && (
                  <span className="nv-mono">
                    내 채널 · 구독 {brief.mine.subs.toLocaleString()} · 평균조회{" "}
                    {brief.mine.avgViews.toLocaleString()}
                  </span>
                )}
                <span className="nv-co-swipe">← 옆으로 넘겨보세요</span>
              </div>
              <div className="nv-coscroll">
                {brief.cohort.map((c, i) => (
                  <div className="nv-cocard" key={i}>
                    {c.top?.thumb &&
                      (c.top.url ? (
                        <a href={c.top.url} target="_blank" rel="noopener noreferrer" className="nv-cothumb-wrap">
                          <img className="nv-cothumb" src={c.top.thumb} alt="" loading="lazy" />
                          <span className="nv-cothumb-play">▶</span>
                        </a>
                      ) : (
                        <span className="nv-cothumb-wrap">
                          <img className="nv-cothumb" src={c.top.thumb} alt="" loading="lazy" />
                        </span>
                      ))}
                    <div className="nv-cocard-head">
                      {c.thumb && <img className="nv-cocard-thumb" src={c.thumb} alt="" loading="lazy" />}
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="nv-cocard-name">
                          {c.name} ↗
                        </a>
                      ) : (
                        <span className="nv-cocard-name">{c.name}</span>
                      )}
                    </div>
                    <div className="nv-mono nv-cocard-stats">
                      구독 {c.subs.toLocaleString()} · 평균조회 {c.avgViews.toLocaleString()} · 최근60일{" "}
                      {c.recent60}편
                    </div>
                    {!!brief.mine?.avgViews && c.avgViews > 0 && (
                      <span className="nv-co-mult">
                        내 채널 평균조회의 ×{(c.avgViews / brief.mine.avgViews).toFixed(c.avgViews / brief.mine.avgViews >= 10 ? 0 : 1)}
                      </span>
                    )}
                    {c.top &&
                      (c.top.url ? (
                        <a className="nv-rt-top" href={c.top.url} target="_blank" rel="noopener noreferrer">
                          ▶ {c.top.title}
                        </a>
                      ) : (
                        <span className="nv-rt-top">{c.top.title}</span>
                      ))}
                    {c.analysis && (
                      <p className="nv-reason" style={{ margin: "10px 0 0" }}>{c.analysis}</p>
                    )}
                    {c.apply && (
                      <div className="nv-firsthook" style={{ marginTop: 8 }}>이렇게 차용 · {c.apply}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 눈여겨보는 채널 — 그 채널과의 차이 + 영감 */}
      {channel && <WatchPanel channel={channel} videos={videos} niche={niche} channelUrl={channelUrl} />}

      {/* 내 위치 · 진단 — 코호트 대비 근거 기반 개선점 */}
      {(brief?.position || !!brief?.diagnosis?.length) && (
        <div className="nv-card">
          <span className="nv-mono nv-eyebrow nv-eyebrow-accent">내 위치 · 진단</span>
          {brief?.position && (
            <p className="nv-reason" style={{ margin: "10px 0 0", color: C.ink }}>{brief.position}</p>
          )}
          {!!brief?.diagnosis?.length && (
            <>
              <p className="nv-h" style={{ marginTop: 16 }}>개선점</p>
              {brief.diagnosis.map((d, i) => (
                <div key={i} className={"nv-row " + (i ? "" : "first")}>
                  <div className="nv-strat-pt">{d.point}</div>
                  <div className="nv-mono nv-evi">근거 · {d.evidence}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 이번 주 만들 영상 — 바깥 정찰에서 도출 */}
      {!!brief?.ideas?.length && (
        <div className="nv-card nv-hero">
          <div className="nv-hero-eyebrow">
            <Wing size={15} />
            <span className="nv-mono">작가 + PD</span>
          </div>
          <h2 className="nv-hero-title" style={{ marginBottom: 4 }}>이번 주 만들 영상</h2>

          {brief.ideas.map((idea, i) => (
            <div key={i} className="nv-idea">
              <div className="nv-cue-row">
                <span className={"nv-badge " + (idea.format === "쇼츠" ? "s" : "l")}>
                  {idea.format}
                </span>
                <span className="nv-src">{idea.source || "기획"}</span>
              </div>
              <p className="nv-hook" style={{ fontSize: 16, marginTop: 6 }}>{idea.title}</p>
              {idea.hook && <div className="nv-firsthook" style={{ marginTop: 6 }}>첫 3초 · {idea.hook}</div>}
              {idea.why && <p className="nv-reason" style={{ margin: "8px 0 0" }}>{idea.why}</p>}

              {!!idea.refPoints?.length && (
                <div className="nv-refpoints">
                  <p className="nv-rp-h">참고 핵심 — 이것만 따라하면 돼요</p>
                  {idea.refPoints.map((p, k) => (
                    <div key={k} className="nv-fb nv-fb-good" style={{ fontSize: 13 }}>
                      <span className="nv-fb-mark">＋</span>
                      {p}
                    </div>
                  ))}
                </div>
              )}

              {idea.thumbnail && (idea.thumbnail.concept || idea.thumbnail.text) && (
                <IdeaThumb idea={idea} niche={niche} />
              )}

              <IdeaScript idea={idea} niche={niche} />

              <div className="nv-short-foot">
                <span />
                <Copy
                  text={[
                    idea.title,
                    `첫 3초: ${idea.hook || ""}`,
                    `왜: ${idea.why || ""}`,
                    idea.refPoints?.length ? `참고 핵심:\n- ${idea.refPoints.join("\n- ")}` : "",
                    idea.thumbnail?.text ? `썸네일 문구: ${idea.thumbnail.text}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n")}
                  label="복사"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {!!brief?.strategy?.length && (
        <div className="nv-card">
          <span className="nv-mono nv-eyebrow">전략 · 앞으로 나아갈 방향</span>
          <div style={{ marginTop: 6 }}>
            {brief.strategy.map((s, i) => (
              <div key={i} className={"nv-row " + (i ? "" : "first")}>
                <div className="nv-strat-pt">{s.point}</div>
                <div className="nv-strat-why">{s.why}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!brief?.todo?.length && (
        <div className="nv-card">
          <p className="nv-h">오늘부터 할 일</p>
          {brief.todo.map((t, i) => (
            <div key={i} className={"nv-row " + (i ? "" : "first") + " nv-todo"}>
              <span className="nv-todo-box">□</span>
              {t}
            </div>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div className="nv-card">
          <p className="nv-h">최근 영상 — 탭하면 그 영상만 깊게 분석</p>
          {videos.map((v, i) => (
            <div key={v.id} className={"nv-row " + (i ? "" : "first")}>
              <div className="nv-vid">
                {v.thumb ? (
                  <img className="nv-thumb" src={v.thumb} alt="" loading="lazy" />
                ) : (
                  <div className="nv-thumb nv-thumb-empty" />
                )}
                <div className="nv-vid-main">
                  <div className="nv-vid-head">
                    <span className={"nv-badge " + (v.format === "쇼츠" ? "s" : "l")}>
                      {v.format}
                    </span>
                    <span className="nv-vid-title">{v.title}</span>
                  </div>
                  <div className="nv-mono nv-vid-meta">
                    조회 {v.views.toLocaleString()} · {v.date}
                  </div>
                </div>
                <button
                  className="nv-ghost nv-vid-btn"
                  onClick={() => deepDive(v)}
                  disabled={deepLoading && deepId === v.id}
                >
                  {deepId === v.id ? (deepLoading ? "보는 중…" : "닫기") : "자세히"}
                </button>
              </div>
              {deepId === v.id && (
                <div className="nv-deep">
                  {deepLoading && (
                    <div className="nv-running" style={{ margin: "6px 0" }}>
                      <span className="nv-pulse" /> 영상 보는 중
                      {v.format !== "쇼츠" && " · 닫아도 계속돼요. 돌아오면 떠 있어요"}
                    </div>
                  )}
                  {deepErr && <p className="nv-err">{deepErr}</p>}
                  {deep && !deepLoading && (
                    <div style={{ textAlign: "right", marginBottom: 4 }}>
                      <button className="nv-detbtn" onClick={() => deepDive(v, true)}>
                        다시 분석
                      </button>
                    </div>
                  )}
                  {deep && <Deep a={deep} />}
                </div>
              )}
            </div>
          ))}
          {pageToken && (
            <button className="nv-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "불러오는 중…" : "이전 영상 더 보기"}
            </button>
          )}
        </div>
      )}


      {benchLoading && !bench && (
        <div className="nv-card nv-card-accent">
          <span className="nv-mono nv-eyebrow nv-eyebrow-accent">
            {benchmarkUrl ? "닮고 싶은 채널과 비교" : "잘 되는 비슷한 채널과 비교"}
          </span>
          <p className="nv-reason" style={{ margin: "9px 0 0" }}>
            {benchmarkUrl ? "닮고 싶은 채널을 읽는 중…" : "잘 되는 비슷한 채널을 찾는 중…"}
          </p>
        </div>
      )}
      {bench && (
        <div className="nv-card nv-card-accent">
          <span className="nv-mono nv-eyebrow nv-eyebrow-accent">
            {bench.auto ? "잘 되는 비슷한 채널과 비교" : "닮고 싶은 채널과 비교"}
          </span>
          <p className="nv-hook" style={{ fontSize: 16, margin: "9px 0 5px" }}>
            {bench.name}
          </p>
          <p className="nv-reason" style={{ marginBottom: 12 }}>{bench.summary}</p>

          {bench.theirs && (
            <div className="nv-vs">
              <div className="nv-vs-row nv-vs-head">
                <span />
                <span>내 채널</span>
                <span>{bench.name}</span>
              </div>
              <div className="nv-vs-row">
                <span className="nv-vs-l">구독자</span>
                <span>{bench.mine ? bench.mine.subs.toLocaleString() : "—"}</span>
                <span className="nv-vs-hi">{bench.theirs.subs.toLocaleString()}</span>
              </div>
              {(bench.mine?.n || bench.theirs.n) > 0 && (
                <div className="nv-vs-row">
                  <span className="nv-vs-l">평균 조회</span>
                  <span>{bench.mine?.n ? bench.mine.avgViews.toLocaleString() : "—"}</span>
                  <span className="nv-vs-hi">{bench.theirs.n ? bench.theirs.avgViews.toLocaleString() : "—"}</span>
                </div>
              )}
              {(bench.mine?.n || bench.theirs.n) > 0 && (
                <div className="nv-vs-row">
                  <span className="nv-vs-l">쇼츠 비율</span>
                  <span>{bench.mine?.n ? bench.mine.shortsPct + "%" : "—"}</span>
                  <span className="nv-vs-hi">{bench.theirs.n ? bench.theirs.shortsPct + "%" : "—"}</span>
                </div>
              )}
            </div>
          )}

          {!!bench.why?.length && (
            <>
              <p className="nv-h" style={{ marginTop: 14 }}>잘 되는 이유</p>
              {bench.why.map((t, i) => (
                <div key={i} className="nv-fb nv-fb-good">
                  <span className="nv-fb-mark">＋</span>
                  {t}
                </div>
              ))}
            </>
          )}

          {!!bench.learn?.length && (
            <>
              <p className="nv-h" style={{ marginTop: 14 }}>내가 따라할 것</p>
              {bench.learn.map((t, i) => (
                <div key={i} className="nv-fb nv-fb-improve">
                  <span className="nv-fb-mark">→</span>
                  {t}
                </div>
              ))}
            </>
          )}

          {!!bench.refs?.length && (
            <div className="nv-vs-refs">
              <p className="nv-h" style={{ marginTop: 14 }}>이 채널 역대 히트</p>
              {bench.refs.map((r, i) => (
                <div key={i} className="nv-ref-row">
                  <span className={"nv-badge " + (r.format === "쇼츠" ? "s" : "l")}>{r.format}</span>
                  <span className="nv-ref-title">{r.title}</span>
                  <span className="nv-mono nv-ref-views">{r.views.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// 접기/펼치기 — 핵심만 보이고 나머지는 눌러서 본다.
function Collapse({ title, children, open: init = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(init);
  return (
    <div className="nv-card nv-collapse">
      <button className="nv-collapse-h" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="nv-collapse-x">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="nv-collapse-body">{children}</div>}
    </div>
  );
}

// 쇼츠 한 장 — 핵심(구간·훅·이유)만 보이고, 올릴 거리(대사·자막·캡션·태그)는 눌러서.
function ShortCard({ s }: { s: Short }) {
  const [det, setDet] = useState(false);
  const pkg = [
    s.title && `제목: ${s.title}`,
    s.cue && `구간: ${s.cue}`,
    s.transcript && `대사: ${s.transcript}`,
    s.onscreen && `화면자막: ${s.onscreen}`,
    s.caption && `캡션: ${s.caption}`,
    !!s.hashtags?.length && s.hashtags!.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div className="nv-short-card">
      <div className="nv-cue-row">
        <span className="nv-mono nv-cue">{s.cue || "구간"}</span>
        <Copy text={pkg} label="복사" />
      </div>
      <p className="nv-hook" style={{ fontSize: 16, marginTop: 6 }}>
        &ldquo;{s.hook}&rdquo;
      </p>
      {s.reason && <p className="nv-reason" style={{ margin: 0 }}>{s.reason}</p>}
      <button className="nv-detbtn" onClick={() => setDet((d) => !d)}>
        {det ? "접기" : "대사 · 자막 · 캡션"}
      </button>
      {det && (
        <div className="nv-short-det">
          {s.transcript && <p className="nv-transcript">“{s.transcript}”</p>}
          {s.title && <div className="nv-pkg-line"><b>제목</b> · {s.title}</div>}
          {s.onscreen && <div className="nv-pkg-line"><b>화면 자막</b> · {s.onscreen}</div>}
          {s.caption && <div className="nv-pkg-line"><b>캡션</b> · {s.caption}</div>}
          {!!s.hashtags?.length && (
            <div className="nv-mono" style={{ fontSize: 12, color: C.accent, marginTop: 5 }}>
              {s.hashtags!.join(" ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 기획안 한 건의 썸네일 예시 — 구성·문구만 보여준다
function IdeaThumb({ idea }: { idea: Idea; niche?: string }) {
  return (
    <div className="nv-thumbsug">
      <p className="nv-rp-h">썸네일 예시</p>
      {idea.thumbnail?.concept && (
        <p className="nv-reason" style={{ margin: 0 }}>{idea.thumbnail.concept}</p>
      )}
      {idea.thumbnail?.text && (
        <div className="nv-mono nv-copy-line" style={{ marginTop: 4 }}>문구: {idea.thumbnail.text}</div>
      )}
    </div>
  );
}

type Script = {
  length?: string;
  scenes?: { t?: string; visual?: string; line?: string; caption?: string }[];
  cta?: string;
};
// 기획안 → 대본(스토리보드) 생성(백그라운드+폴링)
function IdeaScript({ idea, niche }: { idea: Idea; niche?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [script, setScript] = useState<Script>();
  async function gen() {
    setState("busy");
    try {
      const { id } = await callJson("/api/script/start", { idea, niche });
      const job = await pollJob(id);
      if (!job?.analysis) throw new Error("no script");
      setScript(job.analysis);
      setState("done");
    } catch {
      setState("error");
    }
  }
  const copyText = script
    ? [
        `[대본] ${idea.title}` + (script.length ? ` · ${script.length}` : ""),
        ...(script.scenes || []).map(
          (s, i) =>
            `${i + 1}. ${s.t || ""}\n  화면: ${s.visual || ""}\n  대사: ${s.line || ""}\n  자막: ${
              s.caption || ""
            }`
        ),
        script.cta ? `마무리: ${script.cta}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  return (
    <div className="nv-script">
      {!script && (
        <button className="nv-detbtn" onClick={gen} disabled={state === "busy"}>
          {state === "busy" ? "대본 쓰는 중… (~20초)" : "대본 만들기"}
        </button>
      )}
      {state === "error" && (
        <p className="nv-err" style={{ marginTop: 8 }}>대본 생성에 실패했어요. 다시 시도해 주세요.</p>
      )}
      {script && (
        <>
          <div className="nv-cue-row">
            <p className="nv-rp-h" style={{ margin: 0 }}>
              대본{script.length ? ` · ${script.length}` : ""}
            </p>
            <Copy text={copyText} label="대본 복사" />
          </div>
          {(script.scenes || []).map((s, i) => (
            <div key={i} className="nv-scene">
              <span className="nv-mono nv-scene-t">{s.t || i + 1}</span>
              <div className="nv-scene-body">
                {s.visual && <p className="nv-scene-v">{s.visual}</p>}
                {s.line && <p className="nv-scene-line">“{s.line}”</p>}
                {s.caption && <div className="nv-mono nv-copy-line">자막: {s.caption}</div>}
              </div>
            </div>
          ))}
          {script.cta && <p className="nv-reason" style={{ marginTop: 8 }}>마무리 · {script.cta}</p>}
        </>
      )}
    </div>
  );
}

type Watch = {
  theirs?: {
    name: string;
    thumb?: string;
    subs: number;
    avgViews: number;
    recent60: number;
    shortsPct: number;
    url?: string;
    top?: { title: string; views: number; thumb?: string; url?: string } | null;
  };
  mine?: { name: string; subs: number; avgViews: number; shortsPct: number };
  spark?: string;
  differences?: { point: string; mine?: string; theirs?: string }[];
  inspirations?: { insight: string; apply: string }[];
};

// 눈여겨보는 채널 분석 — 그 채널과 내 채널의 차이 + 그 사이 영감(백그라운드+폴링·기기 저장)
function WatchPanel({
  channel,
  videos,
  niche,
  channelUrl,
}: {
  channel: { name: string; subscribers: number } | null;
  videos: Video[];
  niche?: string;
  channelUrl: string;
}) {
  const key = `navi_watch_${channelUrl}`;
  const [url, setUrl] = useState("");
  const [watch, setWatch] = useState<Watch | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const c = loadCache(key);
    if (c?.status === "done" && c.data) {
      setWatch(c.data.result || null);
      setUrl(c.data.url || "");
    }
  }, [key]);

  async function analyze() {
    const u = url.trim();
    if (!u || !channel) return;
    setLoading(true);
    setErr("");
    setWatch(null);
    try {
      const r = await callJson("/api/watch/start", { channel, videos, niche, watchUrl: u });
      const job = await pollJob(r.id);
      const result = job?.analysis || null;
      setWatch(result);
      if (result) saveCache(key, { status: "done", data: { url: u, result } });
    } catch (e: any) {
      setErr(e?.message || "분석에 실패했어요.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setWatch(null);
    setUrl("");
    setErr("");
    delCache(key);
  }

  const t = watch?.theirs;
  const mult = t && watch?.mine?.avgViews ? t.avgViews / watch.mine.avgViews : 0;

  return (
    <div className="nv-card">
      <span className="nv-mono nv-eyebrow nv-eyebrow-accent">눈여겨보는 채널</span>
      <h2 className="nv-hero-title" style={{ fontSize: 20 }}>눈여겨보는 채널에서 영감 찾기</h2>
      <p className="nv-reason" style={{ margin: "6px 0 0" }}>
        배우고 싶은 채널 URL을 넣으면, 내 채널과의 차이와 거기서 길어올릴 영감을 짚어줄게요.
      </p>

      {!watch && (
        <div style={{ marginTop: 14 }}>
          <input
            className="nv-winput"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/@..."
            onKeyDown={(e) => e.key === "Enter" && analyze()}
          />
          <button className="nv-btn" style={{ marginTop: 10 }} onClick={analyze} disabled={loading || !url.trim()}>
            {loading ? "정찰하는 중… (~20초)" : "이 채널에서 영감 찾기"}
          </button>
          {err && <p className="nv-err" style={{ marginTop: 10 }}>{err}</p>}
        </div>
      )}

      {watch && t && (
        <div style={{ marginTop: 14 }}>
          <div className="nv-watch-head">
            {t.thumb && <img className="nv-cocard-thumb" src={t.thumb} alt="" loading="lazy" />}
            <div style={{ minWidth: 0, flex: 1 }}>
              {t.url ? (
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="nv-cocard-name">{t.name} ↗</a>
              ) : (
                <span className="nv-cocard-name">{t.name}</span>
              )}
              <div className="nv-mono nv-cocard-stats" style={{ margin: "2px 0 0" }}>
                구독 {t.subs.toLocaleString()} · 평균조회 {t.avgViews.toLocaleString()} · 최근60일 {t.recent60}편
              </div>
            </div>
            <button className="nv-replan" onClick={reset}>다른 채널</button>
          </div>
          {!!mult && (
            <span className="nv-co-mult" style={{ marginTop: 10 }}>내 채널 평균조회의 ×{mult.toFixed(mult >= 10 ? 0 : 1)}</span>
          )}

          {watch.spark && (
            <div className="nv-spark" style={{ marginTop: 12 }}>
              <Wing size={18} />
              <p>{watch.spark}</p>
            </div>
          )}

          {!!watch.differences?.length && (
            <>
              <p className="nv-h" style={{ marginTop: 16 }}>내 채널과 다른 점</p>
              {watch.differences.map((d, i) => (
                <div key={i} className={"nv-row " + (i ? "" : "first")}>
                  <div className="nv-strat-pt">{d.point}</div>
                  {(d.mine || d.theirs) && (
                    <div className="nv-diff-cmp">
                      {d.mine && <span><b>내 채널</b> {d.mine}</span>}
                      {d.theirs && <span><b>{t.name}</b> {d.theirs}</span>}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {watch.inspirations?.map((ins, i) => (
            <div key={i} className="nv-insp" style={{ marginTop: i ? 12 : 16 }}>
              <p className="nv-strat-pt">{ins.insight}</p>
              <div className="nv-firsthook" style={{ marginTop: 6 }}>이렇게 차용 · {ins.apply}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Deep({ a }: { a: Analysis }) {
  // 서버가 '센 것부터' 정렬해 보내므로 그 순서를 그대로 유지한다.
  const shorts = a.shorts || [];
  const hasMore =
    !!a.titles?.length || !!a.thumbnail || !!a.tags?.length || !!a.next_ideas?.length;
  const fullText = [
    a.summary && `[요약]\n${a.summary}`,
    a.inspiration?.length &&
      "[영감]\n" + a.inspiration.map((s) => `· ${s.title}${s.how ? `\n  ${s.how}` : ""}`).join("\n"),
    shorts.length &&
      "[쇼츠 추천]\n" +
        shorts
          .map(
            (s, i) =>
              `${i + 1}. ${s.cue || ""} ${s.hook}\n   대사: ${s.transcript || "-"}\n   제목: ${
                s.title || "-"
              } / 캡션: ${s.caption || "-"}\n   ${s.hashtags?.join(" ") || ""}`
          )
          .join("\n"),
    !!a.titles?.length && "[제목 후보]\n" + a.titles.map((t) => "- " + t).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
  return (
    <div style={{ marginTop: 6 }}>
      {a.summary && (
        <div className="nv-deep-block">
          <div className="nv-cue-row">
            <p className="nv-h" style={{ margin: 0 }}>요약</p>
            <Copy text={fullText} label="전체 복사" />
          </div>
          <p className="nv-reason" style={{ marginTop: 8, fontSize: 14 }}>{a.summary}</p>
        </div>
      )}

      {!!a.inspiration?.length && (
        <div className="nv-inspblock">
          <div className="nv-hero-eyebrow" style={{ color: C.accentInk, marginBottom: 4 }}>
            <Wing size={15} />
            <span className="nv-mono">이 영상이 열어주는 영감</span>
          </div>
          {a.inspiration.map((s, i) => (
            <div key={i} className="nv-inspitem">
              <p className="nv-inspitem-t">{s.title}</p>
              {s.how && <p className="nv-reason" style={{ margin: "4px 0 0" }}>{s.how}</p>}
            </div>
          ))}
        </div>
      )}

      {shorts.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">쇼츠 추천 · 센 것부터</p>
          {shorts.map((s, i) => (
            <ShortCard key={i} s={s} />
          ))}
        </div>
      )}

      {(!!a.good?.length || !!a.improve?.length) && (
        <Collapse title="잘한 점 · 고칠 점">
          {a.good?.map((t, i) => (
            <div key={"g" + i} className="nv-fb nv-fb-good">
              <span className="nv-fb-mark">＋</span>
              {t}
            </div>
          ))}
          {a.improve?.map((t, i) => (
            <div key={"i" + i} className="nv-fb nv-fb-improve">
              <span className="nv-fb-mark">→</span>
              {t}
            </div>
          ))}
        </Collapse>
      )}

      {hasMore && (
        <Collapse title="제목 · 썸네일 · 태그 · 다음 영상">
          {!!a.titles?.length && (
            <>
              <p className="nv-h">제목 후보</p>
              {a.titles.map((t, i) => (
                <div key={i} className="nv-row-flex" style={{ padding: "6px 0" }}>
                  <span style={{ fontSize: 14 }}>{t}</span>
                  <Copy text={t} />
                </div>
              ))}
            </>
          )}
          {a.thumbnail && (
            <>
              <p className="nv-h" style={{ marginTop: 14 }}>썸네일</p>
              <div style={{ fontSize: 14 }}>{a.thumbnail.concept}</div>
              {a.thumbnail.text && (
                <div className="nv-mono nv-copy-line">카피: {a.thumbnail.text}</div>
              )}
            </>
          )}
          {!!a.tags?.length && (
            <>
              <div className="nv-cue-row" style={{ marginTop: 14 }}>
                <p className="nv-h" style={{ margin: 0 }}>태그</p>
                <Copy text={a.tags.join(", ")} label="전체 복사" />
              </div>
              <div style={{ marginTop: 8 }}>
                {a.tags.map((t, i) => (
                  <span className="nv-tag nv-mono" key={i}>{t}</span>
                ))}
              </div>
            </>
          )}
          {!!a.next_ideas?.length && (
            <>
              <p className="nv-h" style={{ marginTop: 14 }}>다음 영상</p>
              {a.next_ideas.map((t, i) => (
                <div key={i} className="nv-todo" style={{ padding: "6px 0" }}>
                  <span className="nv-todo-box">·</span>
                  {t}
                </div>
              ))}
            </>
          )}
        </Collapse>
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

const css = `
.nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.nv-btn{background:${C.accent};color:#fff;border:none;border-radius:11px;padding:13px 19px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:box-shadow .16s,transform .05s,filter .16s;letter-spacing:-.01em;box-shadow:0 6px 18px -8px rgba(75,67,214,.5)}
.nv-btn:hover:not(:disabled){box-shadow:0 10px 26px -8px rgba(75,67,214,.5);filter:brightness(1.05)}
.nv-btn:active:not(:disabled){transform:translateY(1px)}
.nv-btn:disabled{opacity:.45;cursor:default}
.nv-ghost{background:#fff;border:1px solid ${C.line};color:${C.sub};border-radius:9px;padding:8px 13px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .14s}
.nv-ghost:hover{border-color:${C.accent};color:${C.accent}}
.nv-card{background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:22px 24px;margin-bottom:14px;box-shadow:0 1px 2px rgba(26,26,32,.03),0 14px 36px -26px rgba(26,26,32,.22)}
.nv-card-accent{background:${GRAD_SOFT};border-color:#D8D3F6}
.nv-eyebrow{font-size:11.5px;letter-spacing:.14em;color:${C.faint};font-weight:700;text-transform:uppercase}
.nv-eyebrow-accent{color:${C.accent}}
.nv-hero{background:linear-gradient(180deg,${C.accentTint} 0%,#fff 150px);border:1px solid #DEDAF6}
.nv-hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.nv-hero-eyebrow{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.16em;color:${C.accent};font-weight:700;text-transform:uppercase}
.nv-hero-title{font-family:var(--font-serif);font-size:22px;font-weight:500;letter-spacing:-.01em;margin:9px 0 0;line-height:1.32;color:${C.ink}}
.nv-radar{background:linear-gradient(180deg,#EFFBF5 0%,#fff 130px);border:1px solid #CFEBDC}
.nv-spark{display:flex;gap:12px;align-items:flex-start;margin:16px 0 2px;padding:17px 19px;border-radius:14px;background:${C.accentTint};border:1px solid #DEDAF6}
.nv-spark svg{flex:none;margin-top:4px}
.nv-spark p{margin:0;font-family:var(--font-serif);font-size:16.5px;line-height:1.65;font-weight:500;letter-spacing:-.005em;color:${C.accentInk}}
.nv-radar .nv-hero-eyebrow{color:${C.live}}
.nv-radar-promise{margin:9px 0 0;font-size:13.5px;line-height:1.6;color:${C.sub};max-width:480px}
.nv-winput{width:100%;box-sizing:border-box;background:#fff;border:1px solid ${C.line};border-radius:11px;padding:13px 15px;font-size:14.5px;color:${C.ink};font-family:inherit;outline:none;transition:border-color .14s,box-shadow .14s}
.nv-winput::placeholder{color:${C.faint}}
.nv-winput:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
.nv-watch-head{display:flex;align-items:center;gap:11px}
.nv-diff-cmp{display:flex;flex-direction:column;gap:3px;margin-top:5px;font-size:12.5px;color:${C.sub};line-height:1.55}
.nv-diff-cmp b{color:${C.ink};font-weight:700;margin-right:5px}
.nv-insp{border:1px solid ${C.line};border-left:2px solid ${C.live};border-radius:13px;padding:14px 16px;background:#fff;box-shadow:0 1px 2px rgba(26,26,32,.03)}
a.nv-src{text-decoration:none}
.nv-co-meta{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;font-size:11.5px;color:${C.sub}}
.nv-co-swipe{color:${C.live};font-weight:600;white-space:nowrap;font-size:11px}
.nv-coscroll{display:flex;gap:12px;overflow-x:auto;margin:9px -22px 0;padding:2px 22px 10px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
.nv-coscroll::-webkit-scrollbar{height:0}
.nv-cocard{flex:0 0 84%;max-width:300px;scroll-snap-align:start;border:1px solid ${C.line};border-top:2px solid ${C.live};border-radius:15px;padding:15px 16px;background:#fff;box-shadow:0 1px 2px rgba(26,26,32,.03),0 12px 30px -20px rgba(26,26,32,.2)}
.nv-cothumb-wrap{position:relative;display:block;margin:-2px 0 12px;border-radius:9px;overflow:hidden}
.nv-cothumb{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:${C.canvas}}
.nv-cothumb-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:rgba(20,23,28,.62);color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;padding-left:3px}
.nv-cocard-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}
.nv-cocard-thumb{width:34px;height:34px;border-radius:50%;object-fit:cover;flex:none;background:${C.canvas}}
.nv-cocard-name{font-size:15px;font-weight:700;color:${C.ink};text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nv-cocard-name:hover{color:${C.accent}}
.nv-cocard-stats{font-size:11.5px;color:${C.sub};margin-bottom:6px}
.nv-co-mult{display:inline-block;font-size:11px;font-weight:700;color:${C.live};background:#EAF7F0;border:1px solid #C7E9D7;border-radius:999px;padding:2px 9px;margin-bottom:8px}
.nv-rt-top{display:block;font-size:11.5px;font-weight:500;color:${C.live};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.nv-rt-top:hover{text-decoration:underline}
.nv-tag{display:inline-block;background:${C.canvas};border:1px solid ${C.line};border-radius:7px;padding:5px 10px;font-size:12.5px;margin:0 6px 6px 0;color:${C.sub}}
.nv-badge{display:inline-block;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:6px;margin-right:8px;vertical-align:middle}
.nv-badge.s{background:#EAF7F0;color:#1F9E6B;border:1px solid #C7E9D7}
.nv-badge.l{background:${C.accentTint};color:${C.accentInk};border:1px solid #D8D3F6}
.nv-vid{display:flex;align-items:center;gap:12px}
.nv-thumb{width:108px;height:61px;border-radius:9px;object-fit:cover;background:#ECEAE4;flex:none;border:1px solid ${C.line}}
.nv-thumb-empty{background:linear-gradient(135deg,#EEEBE4,#E4E0D8)}
.nv-vid-main{flex:1;min-width:0}
.nv-vid-head{display:flex;align-items:center;gap:7px}
.nv-vid-title{font-size:14px;color:${C.ink};font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nv-vid-btn{flex:none;padding:6px 12px;align-self:center}
.nv-vid-meta{font-size:12px;color:${C.sub};margin-top:5px}
@media (max-width:520px){.nv-thumb{width:84px;height:47px}}
.nv-deep{margin-top:12px;padding-top:12px;border-top:1px dashed ${C.line}}
.nv-deep-block{background:${C.canvas};border:1px solid ${C.line};border-radius:12px;padding:14px 16px;margin-bottom:10px}
.nv-inspblock{background:${C.accentTint};border:1px solid #DEDAF6;border-radius:12px;padding:15px 17px;margin-bottom:10px}
.nv-inspitem{padding:9px 0;border-top:1px solid #DEDAF6}
.nv-inspitem:first-of-type{border-top:0}
.nv-inspitem-t{margin:0;font-family:var(--font-serif);font-size:15px;font-weight:500;letter-spacing:-.005em;color:${C.accentInk};line-height:1.55}
.nv-copy{background:transparent;border:none;color:${C.accent};font-size:12px;cursor:pointer;padding:2px 4px;font-family:inherit;font-weight:600}
.nv-copy-line{font-size:12.5px;color:${C.accent}}
.nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
@keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
.nv-running{display:flex;align-items:center;gap:9px;color:${C.accent};font-size:12.5px;margin:4px 2px 16px;letter-spacing:.04em;font-family:ui-monospace,'SF Mono',Menlo,monospace}
.nv-h{font-family:var(--font-serif);font-size:15.5px;font-weight:500;margin:0 0 10px;letter-spacing:-.005em;color:${C.ink}}
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
.nv-short-card{border:1px solid ${C.line};border-radius:12px;padding:13px 14px;margin:10px 0;background:#FCFBF9}
.nv-score{font-size:11px;color:${C.accent};font-weight:700;letter-spacing:.04em;border:1px solid ${C.accent};border-radius:999px;padding:2px 8px}
.nv-transcript{font-size:13px;color:${C.ink};line-height:1.6;margin:0 0 8px;padding-left:10px;border-left:2px solid ${C.line}}
.nv-pkg-line{font-size:13px;color:${C.sub};line-height:1.55;margin-top:4px}
.nv-short-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:9px;padding-top:9px;border-top:1px dashed ${C.line}}
.nv-desc{font-size:13.5px;color:${C.sub};line-height:1.7;white-space:pre-wrap;margin:0}
.nv-data{font-size:13px;color:${C.ink};font-weight:500}
.nv-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin:13px 0 2px;padding:13px 0 3px;border-top:1px solid ${C.line}}
.nv-stat{display:flex;flex-direction:column;gap:3px}
.nv-stat-l{font-size:10.5px;color:${C.faint};letter-spacing:.1em;text-transform:uppercase}
.nv-stat-v{font-size:14px;color:${C.ink};font-weight:600;line-height:1.35}
.nv-more{width:100%;margin-top:12px;padding:11px;background:transparent;border:1px solid ${C.line};border-radius:9px;color:${C.sub};font-size:13.5px;font-weight:600;cursor:pointer}
.nv-more:hover{border-color:${C.accent};color:${C.accent}}
.nv-more:disabled{opacity:.55;cursor:default}
.nv-collapse{padding:0 !important;overflow:hidden}
.nv-collapse-h{width:100%;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:transparent;border:0;cursor:pointer;font-size:14px;font-weight:700;color:${C.ink};text-align:left}
.nv-collapse-x{font-size:20px;color:${C.faint};font-weight:400;line-height:1}
.nv-collapse-body{padding:2px 20px 18px}
.nv-detbtn{margin-top:10px;padding:6px 12px;background:transparent;border:1px solid ${C.line};border-radius:999px;color:${C.sub};font-size:12px;font-weight:600;cursor:pointer}
.nv-detbtn:hover{border-color:${C.accent};color:${C.accent}}
.nv-short-det{margin-top:10px;padding-top:10px;border-top:1px dashed ${C.line}}
.nv-vs{border:1px solid ${C.line};border-radius:10px;overflow:hidden;margin-bottom:4px;background:#fff}
.nv-vs-row{display:grid;grid-template-columns:1.1fr 1fr 1.4fr;align-items:center;padding:9px 12px;font-size:13.5px;border-top:1px solid ${C.line}}
.nv-vs-row:first-child{border-top:0}
.nv-vs-head{font-size:11px;color:${C.faint};letter-spacing:.04em;font-weight:600;background:${C.canvas}}
.nv-vs-head span:last-child{color:${C.accent}}
.nv-vs-l{color:${C.faint};font-size:12px}
.nv-vs-row span{font-weight:600;color:${C.ink}}
.nv-vs-row span.nv-vs-l{font-weight:500}
.nv-vs-hi{color:${C.accent} !important}
.nv-ref-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid ${C.line}}
.nv-ref-title{flex:1;font-size:13px;color:${C.ink};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nv-ref-views{font-size:12px;color:${C.sub}}
.nv-idea{border:1px solid ${C.line};border-left:2px solid ${C.accent};border-radius:13px;padding:15px 17px;margin-top:12px;background:#fff;box-shadow:0 1px 2px rgba(26,26,32,.03)}
.nv-src{font-size:11px;color:${C.accent};font-weight:700;letter-spacing:.04em;border:1px solid #D8D3F6;border-radius:999px;padding:2px 9px}
.nv-demand{padding:9px 0;border-top:1px solid ${C.line}}
.nv-demand:first-child{border-top:0}
.nv-evi-q{font-size:12.5px;color:${C.sub};margin:4px 0 0;padding-left:10px;border-left:2px solid ${C.line};line-height:1.55}
.nv-refpoints{margin-top:11px;padding-top:11px;border-top:1px dashed ${C.line}}
.nv-thumbsug{margin-top:11px;padding-top:11px;border-top:1px dashed ${C.line}}
.nv-thumbimg{width:100%;border-radius:10px;border:1px solid ${C.line};display:block}
.nv-script{margin-top:11px;padding-top:11px;border-top:1px dashed ${C.line}}
.nv-scene{display:flex;gap:10px;padding:9px 0;border-top:1px solid ${C.line}}
.nv-scene:first-of-type{border-top:0}
.nv-scene-t{font-size:11px;color:${C.accent};font-weight:700;white-space:nowrap;padding-top:2px;min-width:54px}
.nv-scene-body{flex:1}
.nv-scene-v{font-size:13px;color:${C.sub};margin:0 0 3px;line-height:1.5}
.nv-scene-line{font-size:14px;color:${C.ink};font-weight:600;margin:0 0 3px;line-height:1.5}
.nv-rp-h{font-size:11px;color:${C.faint};letter-spacing:.08em;font-weight:700;margin:0 0 7px;text-transform:uppercase}
.nv-replan{padding:5px 13px;background:#fff;border:1px solid ${C.accent};border-radius:999px;color:${C.accent};font-size:12px;font-weight:700;cursor:pointer;transition:box-shadow .14s}
.nv-replan:hover:not(:disabled){box-shadow:0 4px 14px -4px rgba(75,67,214,.35)}
.nv-replan:disabled{opacity:.5;cursor:default}
.nv-read{font-size:14.5px;color:${C.ink};line-height:1.65;margin:11px 0 0}
.nv-evi{font-size:12px;color:${C.live};line-height:1.5;margin-top:3px}
.nv-strat-pt{font-size:14.5px;font-weight:700;margin-bottom:3px;color:${C.ink}}
.nv-strat-why{font-size:13px;color:${C.sub};line-height:1.6}
.nv-todo{display:flex;gap:10px;font-size:14px;color:${C.ink}}
.nv-todo-box{color:${C.accent};font-weight:700}
.nv-fb{display:flex;gap:9px;font-size:14px;line-height:1.6;color:${C.ink};padding:7px 0}
.nv-fb-mark{flex:none;font-weight:700;font-family:ui-monospace,Menlo,monospace}
.nv-fb-good .nv-fb-mark{color:${C.live}}
.nv-fb-improve .nv-fb-mark{color:${C.accent}}
.nv-err{color:${C.accent};font-size:13px;margin:0;font-weight:500}
`;
