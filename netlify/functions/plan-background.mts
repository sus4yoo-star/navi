// netlify/functions/plan-background.mts
//
// '작가 + PD' 기획 엔진 — 사후 비평이 아니라 사전 기획.
//   작가: 같은 분야에서 '잘 된 영상'과 그 댓글(시청자 반응)을 모아 '뭐가 먹히는지' 귀납.
//   PD : 그걸 내 채널 색깔로 '이렇게 만들어라'(제목·훅·형식)로 시각화.
// 핵심: 내 채널 댓글이 적은 신규 유튜버도 되도록, 댓글은 '비슷한 잘 된 영상'에서 가져온다.
// 무거우니 백그라운드에서 돌리고 결과를 analyses 테이블에 저장(format='plan').
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

function isoToSec(d: string) {
  const m = d?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
}
async function getJSON(url: string) {
  return (await fetch(url)).json();
}

// 같은 분야에서 최근 '잘 된 영상' — 작가의 사전조사 재료
async function nicheHits(query: string, excludeName: string) {
  const monthsAgo = new Date(Date.now() - 150 * 86400e3).toISOString();
  const sr = await getJSON(
    `${API}/search?part=snippet&type=video&order=viewCount&maxResults=20&relevanceLanguage=ko&regionCode=KR&publishedAfter=${monthsAgo}&q=${encodeURIComponent(
      query
    )}&key=${YT}`
  );
  const ids = (sr.items || []).map((i: any) => i.id?.videoId).filter(Boolean).slice(0, 20).join(",");
  if (!ids) return [];
  const vj = await getJSON(`${API}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YT}`);
  const me = (excludeName || "").replace(/\s/g, "").toLowerCase();
  return (vj.items || [])
    .map((x: any) => {
      const sec = isoToSec(x.contentDetails?.duration || "");
      return {
        id: x.id as string,
        title: x.snippet.title as string,
        channel: x.snippet.channelTitle as string,
        views: Number(x.statistics?.viewCount ?? 0),
        format: (sec > 0 && sec <= 60) || /#shorts/i.test(x.snippet.title) ? "쇼츠" : "롱폼",
      };
    })
    .filter((v: any) => v.channel.replace(/\s/g, "").toLowerCase() !== me)
    .sort((a: any, b: any) => b.views - a.views)
    .slice(0, 10);
}

// 잘 된 영상의 인기 댓글 — 시청자 반응(수요)의 실제 근거
async function videoComments(videoId: string, max = 15) {
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

const SYSTEM = `당신은 '나비', 한국 1인 유튜브 크리에이터를 돕는 방송국 같은 팀입니다. 작가와 PD가 함께 일합니다.
사후 비평이 아니라, 이번 주에 '무엇을 만들지'를 기획합니다.
근거는 오직 [같은 분야에서 잘 된 영상]과 [그 영상들의 시청자 댓글], 그리고 [내 채널 색깔]뿐입니다. 데이터에 없는 사실·수치는 지어내지 마세요.

작가처럼: 잘 된 영상과 댓글에서 '지금 이 분야에서 먹히는 것'과 '시청자가 반복해서 원하는 것'을 귀납하세요.
PD처럼: 그것을 내 채널 색깔에 맞춰 '이렇게 만들어라'(제목·첫3초 훅·형식·썸네일)로 구체화하세요. 남의 걸 베끼는 게 아니라 내 채널 버전으로.
크리에이터는 참고 영상을 다 볼 수 없으니, 각 기획안마다 '참고한 잘된 영상들의 핵심(refPoints)'을 글로 짚어 주세요 — 영상을 안 봐도 따라할 수 있게 요점만.
썸네일도 예시로 구성(concept)과 화면 문구(text)를 제안하세요.
클리셰·과장·이모지 금지. 아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{
 "working":[{"point":"지금 이 분야에서 먹히는 것 한 줄","ref":"근거가 된 잘 된 영상 제목"}],
 "demand":[{"want":"시청자가 반복해서 원하는 것","quote":"근거가 된 실제 댓글 한 줄(원문 그대로)"}],
 "ideas":[{"title":"내 채널용 영상 제목","format":"쇼츠","hook":"첫 3초 훅","why":"왜 먹힐지 — 잘된영상/댓글 근거","source":"트렌드","thumbnail":{"concept":"썸네일 구성 한 줄","text":"썸네일 문구(짧고 강하게)"},"refPoints":["참고한 잘된 영상들의 핵심 — 따라할 포인트, 글로 2~3개"]}]
}
ideas는 3~5개. format은 "쇼츠"/"롱폼". source는 근거에 따라 "트렌드"(잘된영상)/"댓글"(시청자수요)/"성과"(내 잘된 영상).`;

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
    // 검색어: 분야 > 내 잘된 영상 제목 > 채널명
    const topTitle = [...list].sort((a, b) => b.views - a.views)[0]?.title;
    const query = niche || topTitle || myName;

    const hits = query ? await nicheHits(query, myName) : [];
    // 잘 된 영상 상위 5개의 댓글을 모은다(시청자 반응)
    const commentBlocks: string[] = [];
    for (const v of hits.slice(0, 5)) {
      const cs = await videoComments(v.id);
      if (cs.length)
        commentBlocks.push(
          `· "${v.title}" (${v.channel}) 댓글:\n` +
            cs.sort((a, b) => b.likes - a.likes).slice(0, 6).map((c) => `  - ${c.text} (♥${c.likes})`).join("\n")
        );
    }

    const myPerf = [...list]
      .sort((a, b) => b.views - a.views)
      .slice(0, 8)
      .map((v) => `[${v.format}] "${v.title}" · 조회 ${Number(v.views).toLocaleString()}`)
      .join("\n");
    const hitList = hits
      .map((v) => `[${v.format}] "${v.title}" · ${v.channel} · 조회 ${v.views.toLocaleString()}`)
      .join("\n");

    const content =
      `[내 채널] ${myName} · 구독자 ${Number(channel?.subscribers ?? 0).toLocaleString()}${
        niche ? ` · 분야 ${niche}` : ""
      }\n[내 최근 영상 — 내 색깔]\n${myPerf || "(아직 영상이 적음)"}` +
      `\n\n[같은 분야에서 잘 된 영상 — 요새 먹히는 것]\n${hitList || "(검색 결과 없음)"}` +
      `\n\n[그 영상들의 시청자 댓글 — 진짜 수요]\n${commentBlocks.join("\n\n") || "(댓글 없음)"}`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
    const plan = extractJson(raw);
    if (!plan) throw new Error("기획 결과를 읽지 못했어요.");

    await sb.from("analyses").update({ status: "done", result: plan }).eq("id", id);
  } catch (e: any) {
    console.error("plan-background 실패:", e?.message || e);
    if (id)
      await sb
        .from("analyses")
        .update({ status: "error", error: e?.message || "기획 중 문제가 생겼어요." })
        .eq("id", id);
  }
  return new Response("ok");
};
