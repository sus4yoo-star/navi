// netlify/functions/analyze-background.mts
//
// 긴 영상(예배 풀영상 등)의 '자세히' 분석을 백그라운드로 처리한다.
// 파일명이 -background → Netlify가 즉시 202를 주고 최대 15분까지 실행.
// Gemini가 영상 전체(음성+화면)를 보고 분석한 뒤, 결과를 analyses 테이블에 기록.
// 클라이언트는 /api/analyze/status 로 폴링해 결과를 받는다.
//
// 환경변수: GEMINI_API_KEY, (선택) GEMINI_MODEL, YOUTUBE_API_KEY,
//          SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const YT_KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function parseVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

function parseChannel(url: string) {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) return { kind: "handle", value: p[0] };
    if (p[0] === "channel") return { kind: "id", value: p[1] };
    return null;
  } catch {
    return null;
  }
}

async function getVideoStats(videoId: string) {
  if (!YT_KEY) return null;
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${YT_KEY}`
  );
  const j = await r.json();
  const v = j.items?.[0];
  if (!v) return null;
  return {
    title: v.snippet.title,
    publishedAt: v.snippet.publishedAt,
    views: Number(v.statistics.viewCount ?? 0),
    likes: Number(v.statistics.likeCount ?? 0),
    comments: Number(v.statistics.commentCount ?? 0),
  };
}

async function getChannelStats(channelUrl: string) {
  if (!YT_KEY) return null;
  const ch = parseChannel(channelUrl);
  if (!ch) return null;
  const q = ch.kind === "handle" ? `forHandle=${encodeURIComponent(ch.value)}` : `id=${ch.value}`;
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${q}&key=${YT_KEY}`
  );
  const j = await r.json();
  const c = j.items?.[0];
  if (!c) return null;
  return {
    name: c.snippet.title,
    subscribers: Number(c.statistics.subscriberCount ?? 0),
    videoCount: Number(c.statistics.videoCount ?? 0),
  };
}

function buildPrompt(format: string) {
  const isShort = format === "쇼츠";
  const shortsRule = isShort
    ? `이 영상은 이미 '쇼츠'입니다. 쇼츠로 자르라는 제안은 하지 말고 "shorts"는 빈 배열([])로 두세요.`
    : `이 영상은 '롱폼'입니다. "shorts"에 이 영상에서 쇼츠로 뽑으면 좋을 구간 2~3개를 타임코드(예 "1:20-1:35")와 함께 제안하세요.`;
  return `당신은 '나비', 한국 1인 유튜브 크리에이터를 돕는 베테랑 PD입니다.
이 영상을 음성과 화면을 모두 보고, 실제 내용에 근거해 피드백하세요. 보이지/들리지 않은 것을 지어내지 마세요. 클리셰·과장·이모지 금지.
먼저 '잘한 점(good)'을 구체적으로 칭찬하고, 그다음 '개선점(improve)'을 실행 가능하게 제안하세요.
${shortsRule}
아래 키를 가진 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"good":["이 영상이 잘한 점 — 실제 장면/말 근거"],"improve":["개선점 — 구체적이고 실행 가능하게"],"titles":["더 끌리는 제목 후보"],"thumbnail":{"concept":"썸네일 구성","text":"썸네일 카피"},"tags":["태그"],"shorts":[{"cue":"1:20-1:35","hook":"실제 장면 기반 훅","reason":"왜 이 구간","title":"쇼츠 제목"}],"next_ideas":["다음에 만들면 좋을 영상"]}`;
}

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

async function analyzeVideo(videoUrl: string, statsCtx: string, format: string) {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않았어요.");
  // 백그라운드는 시간 여유가 있어 영상 전체를 본다. 긴 영상의 토큰 폭주만 낮은 fps로 방어.
  const videoPart: any = { file_data: { file_uri: videoUrl } };
  if (format !== "쇼츠") videoPart.video_metadata = { fps: 0.5 };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              videoPart,
              { text: `${buildPrompt(format)}\n\n[채널/영상 통계]\n${statsCtx || "(없음)"}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
  const text =
    j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") || "";
  const parsed = extractJson(text);
  if (!parsed) throw new Error("분석 결과를 읽지 못했어요.");
  return parsed;
}

export default async (req: Request) => {
  let id: string | undefined;
  try {
    const body = await req.json();
    id = body.id;
    const { videoUrl, channelUrl, format } = body;
    if (!id || !videoUrl) return new Response("bad request", { status: 400 });

    const videoId = parseVideoId(videoUrl);
    const [video, channel] = await Promise.all([
      videoId ? getVideoStats(videoId) : Promise.resolve(null),
      channelUrl ? getChannelStats(channelUrl) : Promise.resolve(null),
    ]);
    const statsCtx = [
      channel &&
        `채널: ${channel.name} · 구독자 ${channel.subscribers.toLocaleString()}명 · 영상 ${channel.videoCount}개`,
      video &&
        `이 영상: "${video.title}" · 조회 ${video.views.toLocaleString()} · 좋아요 ${video.likes.toLocaleString()} · 댓글 ${video.comments.toLocaleString()}`,
    ]
      .filter(Boolean)
      .join("\n");

    const analysis = await analyzeVideo(videoUrl, statsCtx, format || "쇼츠");
    await sb
      .from("analyses")
      .update({ status: "done", video, channel, result: analysis })
      .eq("id", id);
  } catch (e: any) {
    console.error("analyze-background 실패:", e?.message || e);
    if (id) {
      await sb
        .from("analyses")
        .update({ status: "error", error: e?.message || "영상을 분석하지 못했어요." })
        .eq("id", id);
    }
  }
  return new Response("ok");
};
