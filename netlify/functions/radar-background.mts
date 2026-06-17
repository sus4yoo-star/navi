// netlify/functions/radar-background.mts
//
// 니치 레이더 — '우물 안 개구리' 탈출용. 비슷한 결의 '지금 활발한' 채널들을 발굴해
// 한눈에 비교(구독자·최근 업로드·평균 조회·대표 영상)하고, 그 채널들이 지금 뭘로 뜨는지 →
// 내 채널에 어떻게 적용할지 '영감'을 물어다 준다.
// 결과를 analyses.result에 저장(format='radar'). 클라가 폴링해 표시.
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

// 주제 검색 → 결과 영상의 channelId를 모아 '비슷한 결' 후보 채널을 찾는다(자기 제외)
async function discoverChannels(queries: string[], myName: string) {
  const after = new Date(Date.now() - 180 * 86400e3).toISOString();
  const found = new Map<string, string>(); // channelId -> channelTitle
  const me = norm(myName);
  for (const q of queries) {
    if (found.size >= 18) break;
    const sr = await getJSON(
      `${API}/search?part=snippet&type=video&order=viewCount&maxResults=25&relevanceLanguage=ko&regionCode=KR&publishedAfter=${after}&q=${encodeURIComponent(
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

// 채널들의 기본 통계(구독자·영상수·업로드 재생목록·썸네일)
async function channelStats(ids: string[]) {
  if (!ids.length) return [];
  const j = await getJSON(
    `${API}/channels?part=snippet,statistics,contentDetails&id=${ids.slice(0, 50).join(",")}&key=${YT}`
  );
  return (j.items || []).map((c: any) => ({
    id: c.id as string,
    name: c.snippet.title as string,
    thumb: c.snippet.thumbnails?.default?.url as string,
    subs: Number(c.statistics?.subscriberCount ?? 0),
    videoCount: Number(c.statistics?.videoCount ?? 0),
    uploads: c.contentDetails?.relatedPlaylists?.uploads as string,
  }));
}

// 한 채널의 최근 활동: 최근 업로드 10개 → 60일 내 업로드 수, 평균 조회, 대표 영상
async function recentActivity(uploads: string) {
  if (!uploads) return null;
  const pl = await getJSON(
    `${API}/playlistItems?part=contentDetails&maxResults=10&playlistId=${uploads}&key=${YT}`
  );
  const ids = (pl.items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean).join(",");
  if (!ids) return null;
  const vj = await getJSON(`${API}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YT}`);
  const vids = (vj.items || []).map((x: any) => ({
    title: x.snippet.title as string,
    views: Number(x.statistics?.viewCount ?? 0),
    published: x.snippet.publishedAt as string,
    format: isoToSec(x.contentDetails?.duration || "") <= 60 ? "쇼츠" : "롱폼",
  }));
  if (!vids.length) return null;
  const since = Date.now() - 60 * 86400e3;
  const recent60 = vids.filter((v: any) => new Date(v.published).getTime() >= since).length;
  const avgViews = Math.round(vids.reduce((s: number, v: any) => s + v.views, 0) / vids.length);
  const top = [...vids].sort((a: any, b: any) => b.views - a.views)[0];
  const lastUpload = vids[0]?.published;
  return { recent60, avgViews, top, lastUpload, shortsPct: Math.round((vids.filter((v:any)=>v.format==="쇼츠").length / vids.length) * 100) };
}

const SYSTEM = `당신은 '나비', 한국 유튜브 크리에이터의 AI 성장 PD입니다. 크리에이터가 '우물 안 개구리'가 되지 않게,
비슷한 결의 '지금 활발한' 다른 채널들을 정찰해 한눈에 비교해 주고, 그들이 지금 무엇으로 뜨는지에서 영감을 끌어옵니다.
주어진 [내 채널]과 [비슷한 활성 채널들]의 실제 데이터만 근거로 합니다. 수치·사실을 지어내지 마세요.
출력은 JSON 하나만. 그 외 텍스트·코드펜스 금지.
{
 "landscape":"지금 이 판의 흐름과 내 위치를 짚는 2~3문장(구체 수치/채널 언급)",
 "inspirations":[{"from":"채널명","insight":"이 채널이 지금 이렇게 해서 뜬다(근거)","apply":"내 채널엔 이렇게 적용","ref":"근거가 된 그 채널의 영상 제목"}]
}
inspirations는 3~5개. 베끼라는 게 아니라 '내 색깔로' 변주하도록.`;

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

    // 주제 키워드(채널명 아님)로 비슷한 결 채널 발굴
    const queries: string[] = [];
    if (niche && norm(niche) !== norm(myName)) queries.push(niche);
    for (const v of topByViews.slice(0, 4)) {
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

    // 각 채널 최근 활동 수집(병렬) → '지금 활발한' + 잘 나가는 순으로 정렬
    const enriched = (
      await Promise.all(
        stats.map(async (c: any) => {
          const act = await recentActivity(c.uploads).catch(() => null);
          return act ? { ...c, ...act } : null;
        })
      )
    ).filter(Boolean) as any[];

    const cohort = enriched
      .filter((c) => c.recent60 > 0) // 최근 60일 업로드 있는 '활성' 채널만
      .sort((a, b) => b.recent60 * 1e9 + b.avgViews - (a.recent60 * 1e9 + a.avgViews))
      .slice(0, 7)
      .map((c) => ({
        name: c.name,
        thumb: c.thumb,
        subs: c.subs,
        recent60: c.recent60,
        avgViews: c.avgViews,
        shortsPct: c.shortsPct,
        top: c.top ? { title: c.top.title, views: c.top.views } : null,
      }));

    const myAvg = list.length ? Math.round(list.reduce((s, v) => s + v.views, 0) / list.length) : 0;
    const mine = {
      name: myName,
      subs: Number(channel?.subscribers ?? 0),
      avgViews: myAvg,
      shortsPct: list.length ? Math.round((list.filter((v) => v.format === "쇼츠").length / list.length) * 100) : 0,
    };

    let result: any = { cohort, mine, landscape: "", inspirations: [] };

    if (cohort.length) {
      const cohortText = cohort
        .map(
          (c) =>
            `· ${c.name} · 구독자 ${c.subs.toLocaleString()} · 최근60일 업로드 ${c.recent60}편 · 평균조회 ${c.avgViews.toLocaleString()} · 쇼츠 ${c.shortsPct}%` +
            (c.top ? ` · 대표 "${c.top.title}"(${c.top.views.toLocaleString()})` : "")
        )
        .join("\n");
      const content =
        `[내 채널] ${mine.name} · 구독자 ${mine.subs.toLocaleString()} · 평균조회 ${mine.avgViews.toLocaleString()} · 쇼츠 ${mine.shortsPct}%` +
        (niche ? ` · 분야 ${niche}` : "") +
        `\n\n[비슷한 결의 지금 활발한 채널들]\n${cohortText}`;
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2500,
        system: SYSTEM,
        messages: [{ role: "user", content }],
      });
      const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
      const parsed = extractJson(raw);
      if (parsed) result = { cohort, mine, ...parsed };
    }

    await sb.from("analyses").update({ status: "done", result }).eq("id", id);
  } catch (e: any) {
    console.error("radar-background 실패:", e?.message || e);
    if (id)
      await sb
        .from("analyses")
        .update({ status: "error", error: e?.message || "정찰 중 문제가 생겼어요." })
        .eq("id", id);
  }
  return new Response("ok");
};
