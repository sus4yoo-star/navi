// app/api/analyze/route.ts  (Next.js App Router)
//
// 영상 1개 깊은 분석: Gemini가 유튜브 영상을 직접 보고(음성+화면) 그 자리에서
// 쇼츠컷·패키징·전략까지 한 번에 만든다. (단일 호출 — Netlify 함수 타임아웃 방어)
// 채널 통계는 YouTube Data API 실측으로 함께 제공.
//
// 환경변수: YOUTUBE_API_KEY, GEMINI_API_KEY, (선택) GEMINI_MODEL

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const YT_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
  const q =
    ch.kind === "handle" ? `forHandle=${encodeURIComponent(ch.value)}` : `id=${ch.value}`;
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

const PROMPT = `당신은 '나비', 한국 1인 유튜브 크리에이터를 돕는 베테랑 PD입니다.
이 영상을 음성과 화면을 모두 보고, 실제 내용에 근거해 쇼츠 컷과 패키징·전략을 제안하세요.
보이지/들리지 않은 것을 지어내지 마세요. 클리셰·과장·이모지 금지.
아래 키를 가진 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"shorts":[{"cue":"CUE 01","hook":"실제 장면 기반 훅","reason":"왜 이 구간","title":"쇼츠 제목"}],"titles":["제목 후보"],"thumbnails":[{"concept":"썸네일 구성","text":"썸네일 카피"}],"description":"설명란 초안","tags":["태그"],"strategy":[{"point":"전략","why":"이유"}],"next_actions":["바로 할 일"]}`;

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

async function analyzeVideo(videoUrl: string, statsCtx: string) {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않았어요.");
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { file_data: { file_uri: videoUrl } },
              { text: `${PROMPT}\n\n[채널/영상 통계]\n${statsCtx || "(없음)"}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          // 2.5-flash의 thinking이 출력 토큰을 먹어 빈 응답 나는 것 방지 + 속도↑
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
  if (!parsed) throw new Error("분석 결과를 읽지 못했어요. 다시 시도해 주세요.");
  return parsed;
}

export async function POST(req: NextRequest) {
  const { videoUrl, channelUrl } = await req.json();

  const videoId = parseVideoId(videoUrl ?? "");
  if (!videoId)
    return NextResponse.json({ error: "유튜브 영상 URL을 확인해 주세요." }, { status: 400 });

  const [video, channel] = await Promise.all([
    getVideoStats(videoId),
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

  try {
    const analysis = await analyzeVideo(videoUrl, statsCtx);
    return NextResponse.json({ video, channel, analysis });
  } catch (e: any) {
    console.error("analyze 실패:", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "영상을 분석하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 }
    );
  }
}
