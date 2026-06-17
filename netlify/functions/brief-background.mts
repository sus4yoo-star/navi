// netlify/functions/brief-background.mts
//
// 통합 브리핑 엔진 — 흩어진 solution/plan/radar를 하나로 묶었다.
// '우물 안 개구리' 탈출: 바깥(비슷한 활성 채널)부터 정찰해 한 번의 데이터로
//   판세(landscape) → 내 위치(position) → 진단(diagnosis) → 영감(inspirations)
//   → 이번 주 만들 영상(ideas) → 전략(strategy) → 오늘 할 일(todo) 을 한 줄기로 만든다.
// 결과를 analyses.result에 저장(format='brief'). 클라가 폴링해 표시.
//
// 환경변수: ANTHROPIC_API_KEY, YOUTUBE_API_KEY,
//          SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";
const YT = process.env.YOUTUBE_API_KEY;
const API = "https://www.googleapis.com/youtube/v3";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const norm = (s: string) => (s || "").replace(/\s/g, "").toLowerCase();
const getJSON = async (url: string) => (await fetch(url)).json();
function isoToSec(d: string) {
  const m = d?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
}
function topicQuery(title: string, name: string) {
  let q = (title || "").replace(/#\S+/g, " ").replace(/[\[\]()|·…!?,.~"'\-—:/]/g, " ");
  if (name) q = q.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  return q.replace(/\s+/g, " ").trim();
}

// 주제 검색 → 비슷한 결의 후보 채널(자기 제외)
async function discoverChannels(queries: string[], myName: string) {
  const after = new Date(Date.now() - 180 * 86400e3).toISOString();
  const found = new Map<string, string>();
  const me = norm(myName);
  for (const q of queries) {
    if (found.size >= 18) break;
    const sr = await getJSON(
      `${API}/search?part=snippet&type=video&order=relevance&maxResults=25&relevanceLanguage=ko&regionCode=KR&publishedAfter=${after}&q=${encodeURIComponent(
        q
      )}&key=${YT}`
    );
    for (const it of sr.items || []) {
      const cid = it.snippet?.channelId;
      const ct = it.snippet?.channelTitle || "";
      if (cid && norm(ct) !== me && !found.has(cid)) found.set(cid, ct);
    }
  }
  return [...found.keys()];
}

// YouTube 카테고리 → 한국어 라벨(장르 판별용)
const CAT: Record<string, string> = {
  "1": "영화/애니",
  "2": "자동차",
  "10": "음악",
  "15": "동물",
  "17": "스포츠",
  "19": "여행",
  "20": "게임",
  "22": "인물/블로그",
  "23": "코미디",
  "24": "엔터테인먼트",
  "25": "뉴스/정치",
  "26": "노하우/스타일",
  "27": "교육",
  "28": "과학/기술",
};
const catLabel = (id?: string) => (id && CAT[id]) || "기타";

async function channelStats(ids: string[]) {
  if (!ids.length) return [];
  const j = await getJSON(
    `${API}/channels?part=snippet,statistics,contentDetails&id=${ids.slice(0, 50).join(",")}&key=${YT}`
  );
  return (j.items || []).map((c: any) => ({
    id: c.id as string,
    name: c.snippet.title as string,
    thumb: c.snippet.thumbnails?.default?.url as string,
    description: ((c.snippet.description as string) || "").replace(/\s+/g, " ").slice(0, 160),
    subs: Number(c.statistics?.subscriberCount ?? 0),
    videoCount: Number(c.statistics?.videoCount ?? 0),
    uploads: c.contentDetails?.relatedPlaylists?.uploads as string,
  }));
}

// 한 채널 최근 활동: 최근 10편 → 60일 내 업로드 수, 평균조회, 대표영상(id 포함)
async function recentActivity(uploads: string) {
  if (!uploads) return null;
  const pl = await getJSON(
    `${API}/playlistItems?part=contentDetails&maxResults=10&playlistId=${uploads}&key=${YT}`
  );
  const ids = (pl.items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean).join(",");
  if (!ids) return null;
  const vj = await getJSON(`${API}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YT}`);
  const vids = (vj.items || []).map((x: any) => ({
    id: x.id as string,
    title: x.snippet.title as string,
    thumb: (x.snippet.thumbnails?.medium?.url || x.snippet.thumbnails?.high?.url) as string,
    views: Number(x.statistics?.viewCount ?? 0),
    published: x.snippet.publishedAt as string,
    categoryId: x.snippet.categoryId as string,
    format: isoToSec(x.contentDetails?.duration || "") <= 60 ? "쇼츠" : "롱폼",
  }));
  if (!vids.length) return null;
  const since = Date.now() - 60 * 86400e3;
  const recent60 = vids.filter((v: any) => new Date(v.published).getTime() >= since).length;
  const avgViews = Math.round(vids.reduce((s: number, v: any) => s + v.views, 0) / vids.length);
  const top = [...vids].sort((a: any, b: any) => b.views - a.views)[0];
  const shortsPct = Math.round((vids.filter((v: any) => v.format === "쇼츠").length / vids.length) * 100);
  return { recent60, avgViews, top, shortsPct, category: dominant(vids.map((v: any) => v.categoryId)) };
}

// 영상 카테고리들 중 최빈값
function dominant(ids: (string | undefined)[]) {
  const m = new Map<string, number>();
  for (const id of ids) if (id) m.set(id, (m.get(id) || 0) + 1);
  let best = "",
    n = 0;
  for (const [k, v] of m) if (v > n) (best = k), (n = v);
  return best;
}

// 영상 id들의 최빈 카테고리(내 채널 장르 판별)
async function videosCategory(ids: string[]) {
  if (!ids.length) return "";
  const j = await getJSON(`${API}/videos?part=snippet&id=${ids.slice(0, 20).join(",")}&key=${YT}`);
  return dominant((j.items || []).map((x: any) => x.snippet?.categoryId));
}

// 잘 된 영상의 인기 댓글 — 시청자 수요의 실제 근거
async function videoComments(videoId: string, max = 12) {
  try {
    const j = await getJSON(
      `${API}/commentThreads?part=snippet&order=relevance&maxResults=${max}&textFormat=plainText&videoId=${videoId}&key=${YT}`
    );
    return (j.items || []).map((it: any) => {
      const s = it.snippet?.topLevelComment?.snippet;
      return { text: (s?.textDisplay || "").slice(0, 200), likes: Number(s?.likeCount ?? 0) };
    });
  } catch {
    return [];
  }
}

const SYSTEM = `당신은 '나비', 한국 유튜브 크리에이터의 AI 성장 PD입니다. 크리에이터가 '우물 안 개구리'가 되지 않도록,
바깥(비슷한 결의 지금 활발한 채널들)부터 보고 → 내 위치를 진단하고 → 이번 주 만들 영상과 전략을 한 줄기로 제시합니다.
근거는 오직 [내 채널], [비슷한 활성 채널들], [그 채널들의 시청자 댓글]뿐입니다. 수치·사실·댓글을 지어내지 마세요.
클리셰·과장·이모지 금지. 아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{
 "landscape":"지금 이 분야 판세 2~3문장(구체 채널/수치 언급)",
 "position":"코호트 대비 내 채널의 현재 위치 2~3문장(구독자·평균조회·쇼츠비중 등 수치로)",
 "diagnosis":[{"point":"내 채널 개선점 한 줄","evidence":"근거 — 내 수치 vs 코호트, 또는 내 콘텐츠 특징"}],
 "channels":[{"name":"후보 목록의 채널명 그대로","analysis":"이 채널이 지금 잘 되는 이유 분석 1~2문장(구체적으로)","apply":"우리가 적용할 점 1문장"}],
 "ideas":[{"title":"내 채널용 영상 제목","format":"쇼츠","hook":"첫 3초 훅","why":"왜 먹힐지 근거","source":"트렌드","thumbnail":{"concept":"썸네일 구성","text":"썸네일 문구"},"refPoints":["참고할 핵심 포인트"]}],
 "strategy":[{"point":"앞으로 나아갈 방향 한 줄","why":"왜(근거)"}],
 "todo":["오늘부터 할 일 한 줄"]
}
channels: 후보 채널 목록 중에서 내 채널과 '같은 종류(개인·소규모 크리에이터)·같은 소재와 결·닿을 만한 규모'인 진짜 peer만 3~6개 고르세요(name은 후보에 있는 그대로). 방송사·뉴스·공식 채널, 거대 클립/리액션 채널, 소재나 결이 다른 채널은 반드시 제외. 적합한 peer가 없으면 빈 배열([]).
diagnosis·strategy·todo는 3개 내외, ideas는 3개. source는 "트렌드"/"댓글"/"성과" 중.
코호트(channels)가 비면 landscape는 "비슷한 활발한 채널을 충분히 찾지 못해 우선 내 채널 데이터로 진단합니다." 정도로 짧게 쓰고, 사용자에게 데이터 입력을 요구하는 말은 절대 쓰지 마세요.`;

function extractJson(text: string) {
  const t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1));
  } catch {
    return null;
  }
}

export default async (req: Request) => {
  let id: string | undefined;
  try {
    const body = await req.json();
    id = body.id;
    const { channel, videos, niche } = body;
    if (!id) return new Response("bad request", { status: 400 });

    const myName = channel?.name ?? "";
    const list = (videos || []) as { title: string; views: number; format: string }[];
    const topByViews = [...list].sort((a, b) => b.views - a.views);

    // 주제 키워드(채널명 아님)로 비슷한 결 채널 발굴.
    // 해시태그(#일본편의점 등)는 채널의 주제를 가장 잘 드러내는 검색어 → 최우선 사용.
    const queries: string[] = [];
    const tagCount = new Map<string, number>();
    for (const v of list)
      for (const m of v.title.match(/#[^\s#]+/g) || []) {
        const t = m.slice(1).trim();
        if (t.length >= 2) tagCount.set(t, (tagCount.get(t) || 0) + 1);
      }
    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
    queries.push(...topTags);
    if (niche && norm(niche) !== norm(myName)) queries.push(niche);
    for (const v of topByViews.slice(0, 3)) {
      const q = topicQuery(v.title, myName);
      if (q.length >= 4) queries.push(q);
    }
    const seen = new Set<string>();
    const uniqQ = queries.filter((q) => {
      const k = norm(q);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const channelIds = uniqQ.length ? await discoverChannels(uniqQ, myName) : [];
    const stats = await channelStats(channelIds);
    const enriched = (
      await Promise.all(
        stats.map(async (c: any) => {
          const act = await recentActivity(c.uploads).catch(() => null);
          return act ? { ...c, ...act } : null;
        })
      )
    ).filter(Boolean) as any[];

    // 내 채널 장르(카테고리) — 같은 장르 후보를 우선하기 위함
    const myCategory = await videosCategory(
      (videos || []).map((v: any) => v.id).filter(Boolean).slice(0, 15)
    ).catch(() => "");

    // 후보 채널: 방송사급 거대 채널만 1차로 쳐내고, '진짜 peer'는 모델이 장르로 고른다.
    const myAvg = list.length ? Math.round(list.reduce((s, v) => s + v.views, 0) / list.length) : 0;
    const mySubs = Number(channel?.subscribers ?? 0);
    const subCap = mySubs > 0 ? Math.max(mySubs * 300, 200000) : Infinity; // 방송사급 1차 배제
    const sameCat = (c: any) => !!myCategory && c.category === myCategory;
    const prox = (c: any) => Math.abs(Math.log10((c.subs || 1) + 1) - Math.log10((mySubs || 1) + 1));
    const candidates = [...enriched]
      .filter((c) => c.subs <= subCap)
      .sort((a, b) => {
        const act = (b.recent60 > 0 ? 1 : 0) - (a.recent60 > 0 ? 1 : 0);
        if (act) return act;
        const cat = (sameCat(b) ? 1 : 0) - (sameCat(a) ? 1 : 0);
        if (cat) return cat;
        const px = prox(a) - prox(b); // 규모가 가까운 채널 우선
        if (Math.abs(px) > 0.05) return px;
        return b.avgViews - a.avgViews;
      })
      .slice(0, 12);

    const candCards = candidates.map((c) => ({
      name: c.name,
      thumb: c.thumb,
      subs: c.subs,
      recent60: c.recent60,
      avgViews: c.avgViews,
      shortsPct: c.shortsPct,
      category: c.category as string,
      description: c.description as string,
      url: `https://www.youtube.com/channel/${c.id}`,
      top: c.top
        ? {
            title: c.top.title,
            views: c.top.views,
            thumb: c.top.thumb,
            url: `https://www.youtube.com/watch?v=${c.top.id}`,
          }
        : null,
    }));

    // 후보 상위 대표영상 댓글 = 시청자 진짜 수요
    const commentBlocks: string[] = [];
    for (const c of candidates.slice(0, 5)) {
      if (!c.top?.id) continue;
      const cs = await videoComments(c.top.id);
      if (cs.length)
        commentBlocks.push(
          `· "${c.top.title}" (${c.name}) 댓글:\n` +
            cs.sort((a, b) => b.likes - a.likes).slice(0, 6).map((x) => `  - ${x.text} (♥${x.likes})`).join("\n")
        );
    }

    const mine = {
      name: myName,
      subs: mySubs,
      avgViews: myAvg,
      shortsPct: list.length
        ? Math.round((list.filter((v) => v.format === "쇼츠").length / list.length) * 100)
        : 0,
    };

    let result: any = {
      cohort: [],
      mine,
      landscape: "",
      position: "",
      diagnosis: [],
      ideas: [],
      strategy: [],
      todo: [],
    };

    const myPerf = topByViews
      .slice(0, 8)
      .map((v) => `[${v.format}] "${v.title}" · 조회 ${Number(v.views).toLocaleString()}`)
      .join("\n");
    const candText = candCards
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} · [${catLabel(c.category)}] · 구독 ${c.subs.toLocaleString()} · 최근60일 ${c.recent60}편 · 평균조회 ${c.avgViews.toLocaleString()} · 쇼츠 ${c.shortsPct}%` +
          (c.top ? ` · 대표 "${c.top.title}"(${c.top.views.toLocaleString()})` : "") +
          (c.description ? `\n   소개: ${c.description}` : "")
      )
      .join("\n");

    const content =
      `[내 채널] ${mine.name} · [${catLabel(myCategory)}] · 구독자 ${mine.subs.toLocaleString()} · 평균조회 ${mine.avgViews.toLocaleString()} · 쇼츠 ${mine.shortsPct}%` +
      (niche ? ` · 분야 ${niche}` : "") +
      `\n[내 최근 영상 — 내 색깔]\n${myPerf || "(아직 영상이 적음)"}` +
      `\n\n[후보 채널들 — 카테고리·소개·규모를 보고, 내 채널과 '같은 종류·결·닿을 만한 규모'인 진짜 peer만 골라 channels에 넣어라]\n${candText || "(검색 결과 없음)"}` +
      `\n\n[후보 대표영상의 시청자 댓글 — 진짜 수요]\n${commentBlocks.join("\n\n") || "(댓글 없음)"}`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
    const parsed = extractJson(raw);
    if (!parsed) {
      console.error("brief JSON 파싱 실패. raw 앞부분:", raw.slice(0, 400));
      throw new Error("브리핑 결과를 읽지 못했어요.");
    }
    // 모델이 고른 '진짜 peer'만 코호트로 (후보 통계에 분석·적용을 합친다)
    const sel = (parsed.channels || []) as { name: string; analysis?: string; apply?: string }[];
    const cohort = sel
      .map((s) => {
        const c = candCards.find((x) => norm(x.name) === norm(s.name));
        return c ? { ...c, analysis: s.analysis || "", apply: s.apply || "" } : null;
      })
      .filter(Boolean)
      .slice(0, 6);
    delete parsed.channels;
    result = { cohort, mine, ...parsed };

    await sb.from("analyses").update({ status: "done", result }).eq("id", id);
  } catch (e: any) {
    console.error("brief-background 실패:", e?.message || e);
    if (id)
      await sb
        .from("analyses")
        .update({ status: "error", error: e?.message || "브리핑 중 문제가 생겼어요." })
        .eq("id", id);
  }
  return new Response("ok");
};
