"use client";

// app/solution.tsx — 채널 자동 솔루션 (홈 체험 · /today 공용)
// channelUrl(+프로필)만 받으면 /api/channel로 최근 10개를 진단·처방. 영상별 깊은 분석은 "자세히" 탭.

import { useState, useEffect, useCallback, useRef } from "react";
import { C } from "@/lib/ui";

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
const today = () => new Date().toISOString().slice(0, 10);

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
  benchmark?: { name: string; summary: string; learn: string[] } | null;
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
type Analysis = {
  summary?: string; // 영상 전체 핵심 요약
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
}: {
  channelUrl: string;
  tone?: string;
  purpose?: string;
  aspiration?: string;
  benchmarkUrl?: string;
}) {
  const [loading, setLoading] = useState(false); // 1단계: 목록
  const [solLoading, setSolLoading] = useState(false); // 2단계: 진단
  const [err, setErr] = useState("");
  const [channel, setChannel] = useState<{ name: string; subscribers: number; videoCount: number } | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sol, setSol] = useState<Sol | null>(null);

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

  const run = useCallback(async () => {
    if (!channelUrl) return;
    setLoading(true);
    setSolLoading(false);
    setErr("");
    setSol(null);
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

    // 워너비 비교는 별도 요청으로 병렬 진행(메인 진단 속도에 영향 X)
    if (benchmarkUrl) {
      setBenchLoading(true);
      callJson("/api/benchmark", { channel: base.channel, benchmarkUrl })
        .then((b) => setBench(b.benchmark || null))
        .catch(() => setBench(null))
        .finally(() => setBenchLoading(false));
    }

    // 2단계: 진단·처방 (백그라운드 + 폴링 — LLM이 동기 함수 제한을 넘김)
    // 오늘자 결과를 기기에 캐시 → 다시 열면 즉시 표시(진행 중이면 이어받기).
    const solKey = `navi_sol_${channelUrl}_${today()}`;
    const cached = loadCache(solKey);
    if (cached?.status === "done" && cached.data) {
      setSol(cached.data);
      return;
    }
    setSolLoading(true);
    try {
      let id = cached?.status === "pending" ? cached.id : undefined;
      if (!id) {
        const r = await callJson("/api/solution/start", {
          channel: base.channel,
          videos: base.videos,
          tone,
          purpose,
          aspiration,
        });
        id = r.id;
        saveCache(solKey, { id, status: "pending" });
      }
      const job = await pollJob(id!);
      setSol(job?.analysis || null);
      saveCache(solKey, { id, status: "done", data: job?.analysis || null });
    } catch (e: any) {
      setErr(e.message);
      delCache(solKey);
    } finally {
      setSolLoading(false);
    }
  }, [channelUrl, tone, purpose, aspiration, benchmarkUrl]);

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

  async function deepDive(v: Video) {
    if (deepId === v.id) {
      setDeepId(null);
      setDeep(null);
      return;
    }
    setDeepId(v.id);
    setDeep(null);
    setDeepErr("");
    const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
    const dkey = `navi_deep_${v.id}`;

    // 이미 분석해 둔 영상이면 즉시 표시(닫았다 돌아와도 그대로)
    if (v.format !== "쇼츠") {
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
        const cached = loadCache(dkey);
        let id = cached?.status === "pending" ? cached.id : undefined;
        if (!id) {
          const r = await callJson("/api/analyze/start", { videoUrl, channelUrl, format: v.format });
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
          {sol?.read ? (
            <p className="nv-read">{sol.read}</p>
          ) : solLoading ? (
            <div className="nv-running" style={{ margin: "10px 0 0" }}>
              <span className="nv-pulse" /> 최근 10편으로 채널 진단 작성 중
            </div>
          ) : null}
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
                      <span className="nv-pulse" /> 나비가 이 영상을 직접 보는 중
                      {v.format !== "쇼츠" && " — 앱을 닫아도 서버에서 계속 분석돼요. 돌아와 다시 열면 결과가 있어요"}
                    </div>
                  )}
                  {deepErr && <p className="nv-err">{deepErr}</p>}
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
                <span className={"nv-badge " + (n.format === "쇼츠" ? "s" : "l")}>{n.format}</span>
                <Copy text={n.title} />
              </div>
              <p className="nv-hook">{n.title}</p>
              <p className="nv-reason">{n.angle}</p>
              {n.hook && <div className="nv-firsthook">첫 3초 · {n.hook}</div>}
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

      {benchLoading && !bench && (
        <div className="nv-card nv-card-accent">
          <span className="nv-mono nv-eyebrow nv-eyebrow-accent">닮고 싶은 채널과 비교</span>
          <p className="nv-reason" style={{ margin: "9px 0 0" }}>닮고 싶은 채널을 읽는 중…</p>
        </div>
      )}
      {bench && (
        <div className="nv-card nv-card-accent">
          <span className="nv-mono nv-eyebrow nv-eyebrow-accent">
            닮고 싶은 채널과 비교
          </span>
          <p className="nv-hook" style={{ fontSize: 16, margin: "9px 0 5px" }}>
            {bench.name}
          </p>
          <p className="nv-reason" style={{ marginBottom: 10 }}>
            {bench.summary}
          </p>
          {(bench.learn || []).map((t, i) => (
            <div key={i} className="nv-fb nv-fb-good">
              <span className="nv-fb-mark">＋</span>
              {t}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// "1:39-2:07" / "0:50" 같은 큐의 시작 초를 뽑아 영상 시간 순으로 정렬
function cueStart(cue?: string) {
  if (!cue) return Number.MAX_SAFE_INTEGER;
  const p = cue.split("-")[0].trim().split(":").map(Number);
  if (p.some(isNaN)) return Number.MAX_SAFE_INTEGER;
  return p.reduce((acc, n) => acc * 60 + n, 0);
}

function Deep({ a }: { a: Analysis }) {
  const shorts = (a.shorts || []).slice().sort((x, y) => cueStart(x.cue) - cueStart(y.cue));
  return (
    <div style={{ marginTop: 6 }}>
      {a.summary && (
        <div className="nv-deep-block">
          <div className="nv-cue-row">
            <p className="nv-h" style={{ margin: 0 }}>이 영상 요약</p>
            <Copy text={a.summary} />
          </div>
          <p className="nv-reason" style={{ marginTop: 8, fontSize: 14 }}>{a.summary}</p>
        </div>
      )}
      {a.good && a.good.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">잘한 점</p>
          {a.good.map((t, i) => (
            <div key={i} className="nv-fb nv-fb-good">
              <span className="nv-fb-mark">＋</span>
              {t}
            </div>
          ))}
        </div>
      )}
      {a.improve && a.improve.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">개선점</p>
          {a.improve.map((t, i) => (
            <div key={i} className="nv-fb nv-fb-improve">
              <span className="nv-fb-mark">→</span>
              {t}
            </div>
          ))}
        </div>
      )}
      {shorts.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">여기서 쇼츠로 뽑으면 좋아요</p>
          {shorts.map((s, i) => {
            const pkg = [
              s.title && `제목: ${s.title}`,
              s.cue && `구간: ${s.cue}`,
              s.onscreen && `화면자막: ${s.onscreen}`,
              s.caption && `캡션: ${s.caption}`,
              s.hashtags?.length && s.hashtags.join(" "),
            ]
              .filter(Boolean)
              .join("\n");
            return (
              <div key={i} className="nv-short-card">
                <div className="nv-cue-row">
                  <span className="nv-mono nv-cue">{s.cue || "CUE " + (i + 1)}</span>
                </div>
                <p className="nv-hook" style={{ fontSize: 16, marginTop: 6 }}>
                  &ldquo;{s.hook}&rdquo;
                </p>
                {s.transcript && (
                  <p className="nv-transcript">“{s.transcript}”</p>
                )}
                <p className="nv-reason">{s.reason}</p>
                {s.onscreen && (
                  <div className="nv-mono nv-copy-line">화면 자막: {s.onscreen}</div>
                )}
                {s.caption && (
                  <div className="nv-pkg-line">
                    <span>캡션 · {s.caption}</span>
                  </div>
                )}
                {s.hashtags && s.hashtags.length > 0 && (
                  <div className="nv-mono" style={{ fontSize: 12, color: C.accent, marginTop: 4 }}>
                    {s.hashtags.join(" ")}
                  </div>
                )}
                <div className="nv-short-foot">
                  <span className="nv-shorts-title"><b>쇼츠 제목</b> · {s.title}</span>
                  <Copy text={pkg} label="패키지 복사" />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {a.titles && a.titles.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">더 끌리는 제목</p>
          {a.titles.map((t, i) => (
            <div key={i} className="nv-row-flex" style={{ padding: "6px 0" }}>
              <span style={{ fontSize: 14 }}>{t}</span>
              <Copy text={t} />
            </div>
          ))}
        </div>
      )}
      {a.thumbnail && (
        <div className="nv-deep-block">
          <p className="nv-h">썸네일 제안</p>
          <div style={{ fontSize: 14 }}>{a.thumbnail.concept}</div>
          {a.thumbnail.text && (
            <div className="nv-mono nv-copy-line">카피: {a.thumbnail.text}</div>
          )}
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
      {a.next_ideas && a.next_ideas.length > 0 && (
        <div className="nv-deep-block">
          <p className="nv-h">다음 영상 아이디어</p>
          {a.next_ideas.map((t, i) => (
            <div key={i} className="nv-todo" style={{ padding: "6px 0" }}>
              <span className="nv-todo-box">·</span>
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

const css = `
.nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
.nv-btn{background:${C.accent};color:#fff;border:none;border-radius:10px;padding:13px 18px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:box-shadow .14s,transform .05s;letter-spacing:-.01em}
.nv-btn:hover:not(:disabled){box-shadow:0 6px 20px rgba(75,67,214,.32)}
.nv-btn:active:not(:disabled){transform:translateY(1px)}
.nv-btn:disabled{opacity:.45;cursor:default}
.nv-ghost{background:transparent;border:1.5px solid ${C.line};color:${C.sub};border-radius:9px;padding:8px 13px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .14s}
.nv-ghost:hover{border-color:${C.sub};color:${C.ink}}
.nv-card{background:#fff;border:1px solid ${C.line};border-radius:14px;padding:20px 22px;margin-bottom:14px;box-shadow:0 1px 2px rgba(20,23,28,.04),0 8px 24px -18px rgba(20,23,28,.18)}
.nv-card-accent{background:#FBFBFE;border-color:${C.accent};box-shadow:0 8px 28px -16px rgba(75,67,214,.4)}
.nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:600;text-transform:uppercase}
.nv-eyebrow-accent{color:${C.accent}}
.nv-tag{display:inline-block;background:${C.canvas};border:1px solid ${C.line};border-radius:7px;padding:5px 10px;font-size:12.5px;margin:0 6px 6px 0;color:${C.sub}}
.nv-badge{display:inline-block;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:6px;margin-right:8px;vertical-align:middle}
.nv-badge.s{background:#EAF7F0;color:#1F9E6B;border:1px solid #BFE9D5}
.nv-badge.l{background:${C.accentTint};color:${C.accentInk};border:1px solid #CFCBF6}
.nv-vid{display:flex;align-items:center;gap:12px}
.nv-thumb{width:108px;height:61px;border-radius:9px;object-fit:cover;background:#E7E9EE;flex:none;border:1px solid ${C.line}}
.nv-thumb-empty{background:linear-gradient(135deg,#EDEFF3,#E3E6EC)}
.nv-vid-main{flex:1;min-width:0}
.nv-vid-head{display:flex;align-items:center;gap:7px}
.nv-vid-title{font-size:14px;color:${C.ink};font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nv-vid-btn{flex:none;padding:6px 12px;align-self:center}
.nv-vid-meta{font-size:12px;color:${C.sub};margin-top:5px}
@media (max-width:520px){.nv-thumb{width:84px;height:47px}}
.nv-deep{margin-top:12px;padding-top:12px;border-top:1px dashed ${C.line}}
.nv-deep-block{background:${C.canvas};border:1px solid ${C.line};border-radius:11px;padding:14px 16px;margin-bottom:10px}
.nv-copy{background:transparent;border:none;color:${C.accent};font-size:12px;cursor:pointer;padding:2px 4px;font-family:inherit;font-weight:600}
.nv-copy-line{font-size:12.5px;color:${C.accent}}
.nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
@keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
.nv-running{display:flex;align-items:center;gap:9px;color:${C.accent};font-size:12.5px;margin:4px 2px 16px;letter-spacing:.04em;font-family:ui-monospace,'SF Mono',Menlo,monospace}
.nv-h{font-size:15.5px;font-weight:700;margin:0 0 10px;letter-spacing:-.01em;color:${C.ink}}
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
.nv-short-card{border:1px solid ${C.line};border-radius:11px;padding:13px 14px;margin:10px 0;background:#FCFCFD}
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
