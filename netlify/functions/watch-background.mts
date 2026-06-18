// netlify/functions/watch-background.mts
//
// 눈여겨보는 채널 분석 — 사용자가 지정한 채널을 정찰해, 내 채널과의 '차이점'과
// 그 사이에서 길어올린 '영감'을 준다. 결과를 analyses.result에 저장(format='watch').
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

const getJSON = async (url: string): Promise<any> => {
  try {
    return await (await fetch(url)).json();
  } catch {
    return {};
  }
};
function isoToSec(d: string) {
  const m = d?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
}
function parseChannel(url: string) {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) return `forHandle=${encodeURIComponent(p[0])}`;
    if (p[0] === "channel") return `id=${p[1]}`;
    if (p[0] === "c" || p[0] === "user") return `forUsername=${encodeURIComponent(p[1] || "")}`;
    return null;
  } catch {
    return null;
  }
}

// 채널 URL → 채널 + 최근 활동(평균조회·최근60일·대표영상·쇼츠비중)
async function resolveWatch(url: string) {
  const q = parseChannel(url);
  if (!q) return null;
  const cj = await getJSON(`${API}/channels?part=snippet,statistics,contentDetails&${q}&key=${YT}`);
  const c = cj.items?.[0];
  if (!c) return null;
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  const base = {
    id: c.id as string,
    name: c.snippet.title as string,
    thumb: c.snippet.thumbnails?.default?.url as string,
    description: ((c.snippet.description as string) || "").replace(/\s+/g, " ").slice(0, 200),
    subs: Number(c.statistics?.subscriberCount ?? 0),
    url: `https://www.youtube.com/channel/${c.id}`,
  };
  if (!uploads) return { ...base, videos: [], avgViews: 0, recent60: 0, shortsPct: 0, top: null };

  const pl = await getJSON(`${API}/playlistItems?part=contentDetails&maxResults=15&playlistId=${uploads}&key=${YT}`);
  const ids = (pl.items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean).join(",");
  const vj = ids ? await getJSON(`${API}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YT}`) : {};
  const vids = (vj.items || []).map((x: any) => ({
    id: x.id as string,
    title: x.snippet.title as string,
    thumb: (x.snippet.thumbnails?.medium?.url || x.snippet.thumbnails?.high?.url) as string,
    views: Number(x.statistics?.viewCount ?? 0),
    published: x.snippet.publishedAt as string,
    format: isoToSec(x.contentDetails?.duration || "") <= 60 ? "쇼츠" : "롱폼",
  }));
  const since = Date.now() - 60 * 86400e3;
  const recent60 = vids.filter((v: any) => new Date(v.published).getTime() >= since).length;
  const avgViews = vids.length ? Math.round(vids.reduce((s: number, v: any) => s + v.views, 0) / vids.length) : 0;
  const shortsPct = vids.length ? Math.round((vids.filter((v: any) => v.format === "쇼츠").length / vids.length) * 100) : 0;
  const topV = [...vids].sort((a: any, b: any) => b.views - a.views)[0] || null;
  const top = topV
    ? { title: topV.title, views: topV.views, thumb: topV.thumb, url: `https://www.youtube.com/watch?v=${topV.id}`, id: topV.id }
    : null;
  return { ...base, videos: vids, avgViews, recent60, shortsPct, top };
}

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

const SYSTEM = `당신은 '나비', 한국 유튜브 크리에이터의 AI 성장 PD입니다. 크리에이터가 '눈여겨보는 채널'을 정찰해,
'내 채널과의 차이'를 짚고 그 차이 사이에서 '차용할 영감'을 길어옵니다. 비난·우열이 아니라, 배워올 점에 집중하세요.
근거는 [내 채널]과 [눈여겨보는 채널]의 실제 데이터·댓글뿐. 지어내지 마세요. 톤은 곁에서 밀어주는 PD처럼 따뜻하고 확신 있게. 과장·이모지 금지. 모든 출력 한국어.
아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{
 "spark":"두 채널의 차이에서 길어올린 영감 한 방 — 짧고 강한 1~2문장. 내 채널이 당장 시도할 한 걸음.",
 "differences":[{"point":"핵심 차이 한 줄","mine":"내 채널은 이렇다","theirs":"그 채널은 이렇다"}],
 "inspirations":[{"insight":"그 채널이 잘하는 구체적 기법(무엇을 어떻게)","apply":"내 채널에 이렇게 차용(내 소재·톤으로)"}]
}
differences는 3개 내외(수치·콘텐츠 형식·구성에서). inspirations는 3개 내외(차용 가능한 구체 기법).`;

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
    const { channel, videos, niche, watchUrl } = body;
    if (!id || !watchUrl) return new Response("bad request", { status: 400 });

    const w = await resolveWatch(watchUrl);
    if (!w) throw new Error("그 채널을 찾지 못했어요. URL을 확인해 주세요.");

    // 눈여겨보는 채널의 대표영상 댓글
    const commentBlocks: string[] = [];
    for (const v of [...(w.videos || [])].sort((a: any, b: any) => b.views - a.views).slice(0, 3)) {
      const cs = await videoComments(v.id);
      if (cs.length)
        commentBlocks.push(
          `· "${v.title}" 댓글:\n` +
            cs.sort((a, b) => b.likes - a.likes).slice(0, 5).map((x) => `  - ${x.text} (♥${x.likes})`).join("\n")
        );
    }

    const myList = (videos || []) as { title: string; views: number; format: string }[];
    const myAvg = myList.length ? Math.round(myList.reduce((s, v) => s + v.views, 0) / myList.length) : 0;
    const mine = {
      name: channel?.name ?? "내 채널",
      subs: Number(channel?.subscribers ?? 0),
      avgViews: myAvg,
      shortsPct: myList.length ? Math.round((myList.filter((v) => v.format === "쇼츠").length / myList.length) * 100) : 0,
    };

    const myPerf = [...myList].sort((a, b) => b.views - a.views).slice(0, 8)
      .map((v) => `[${v.format}] "${v.title}" · 조회 ${Number(v.views).toLocaleString()}`).join("\n");
    const theirPerf = [...(w.videos || [])].sort((a: any, b: any) => b.views - a.views).slice(0, 8)
      .map((v: any) => `[${v.format}] "${v.title}" · 조회 ${Number(v.views).toLocaleString()}`).join("\n");

    const content =
      `[내 채널] ${mine.name} · 구독자 ${mine.subs.toLocaleString()} · 평균조회 ${mine.avgViews.toLocaleString()} · 쇼츠 ${mine.shortsPct}%` +
      (niche ? ` · 분야 ${niche}` : "") +
      `\n[내 영상]\n${myPerf || "(영상이 적음)"}` +
      `\n\n[눈여겨보는 채널] ${w.name} · 구독자 ${w.subs.toLocaleString()} · 평균조회 ${w.avgViews.toLocaleString()} · 쇼츠 ${w.shortsPct}% · 최근60일 ${w.recent60}편` +
      (w.description ? `\n소개: ${w.description}` : "") +
      `\n[그 채널 영상]\n${theirPerf || "(영상이 적음)"}` +
      `\n\n[그 채널 시청자 댓글]\n${commentBlocks.join("\n\n") || "(댓글 없음)"}`;

    let parsed: any = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const msg = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 3000,
          system: SYSTEM,
          messages: [
            { role: "user", content },
            ...(attempt > 0 ? [{ role: "assistant" as const, content: "{" }] : []),
          ],
        });
        let raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
        if (attempt > 0) raw = "{" + raw;
        parsed = extractJson(raw);
      } catch (e: any) {
        console.error(`watch 호출 실패(시도 ${attempt + 1}):`, e?.message || e);
      }
    }
    if (!parsed) throw new Error("분석 결과를 읽지 못했어요. 잠시 후 다시 시도해 주세요.");

    const theirs = {
      name: w.name,
      thumb: w.thumb,
      subs: w.subs,
      avgViews: w.avgViews,
      recent60: w.recent60,
      shortsPct: w.shortsPct,
      url: w.url,
      top: w.top ? { title: w.top.title, views: w.top.views, thumb: w.top.thumb, url: w.top.url } : null,
    };
    const result = { theirs, mine, ...parsed };
    await sb.from("analyses").update({ status: "done", result }).eq("id", id);
  } catch (e: any) {
    console.error("watch-background 실패:", e?.message || e);
    if (id)
      await sb
        .from("analyses")
        .update({ status: "error", error: e?.message || "분석 중 문제가 생겼어요." })
        .eq("id", id);
  }
  return new Response("ok");
};
