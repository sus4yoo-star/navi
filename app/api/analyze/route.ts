// app/api/analyze/route.ts  (Next.js App Router)
//
// 흐름: Gemini가 유튜브 영상을 직접 보고(음성+화면) 받아 적음 → Claude(Opus)가 PD 분석.
// 자막에 의존하지 않음. 한국 크리에이터 영상 대부분 자막이 없어서 영상 자체를 본다.
//
// 환경변수(.env.local / Netlify):
//   ANTHROPIC_API_KEY=sk-ant-...
//   YOUTUBE_API_KEY=AIza...     // YouTube Data API v3 (조회수·구독자 실측)
//   GEMINI_API_KEY=AIza...      // Google AI Studio (영상 시청)
//   GEMINI_MODEL=gemini-2.0-flash  // (선택) 기본값 override
//
// 프론트:
//   fetch("/api/analyze", { method:"POST", body: JSON.stringify({ videoUrl, channelUrl }) })

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60; // 영상 시청은 시간이 걸림 (Netlify는 함수 타임아웃 상향 필요)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const YT_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const CLAUDE_MODEL = "claude-opus-4-8";

// ---------- URL 파싱 ----------
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

// ---------- 1) Gemini: 영상 직접 시청 (음성 + 화면) ----------
const GEMINI_PROMPT = `이 유튜브 영상을 음성과 화면을 모두 보고 분석해 아래 JSON으로만 답하세요. 코드펜스·다른 텍스트 금지.
실제로 들리고 보이는 것만 적고 추측하지 마세요.
{
 "transcript": "말한 내용을 시간 흐름대로 한국어로 최대한 그대로. 타임스탬프가 보이면 [mm:ss] 형식으로.",
 "on_screen_text": "화면에 뜬 자막·제목·중요 텍스트",
 "visual_notes": "장면 전환, 인물, 배경, 분위기, 편집 스타일 등 화면에서 읽히는 것",
 "summary": "이 영상이 무엇을 다루는지 한 줄"
}`;

async function watchVideo(videoUrl: string) {
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
              { text: GEMINI_PROMPT },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    }
  );
  const j = await r.json();
  if (!r.ok) {
    const msg = j?.error?.message || `Gemini ${r.status}`;
    throw new Error(msg);
  }
  const text =
    j.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text)
      .filter(Boolean)
      .join("\n") || "";
  const parsed = extractJson(text);
  if (!parsed) throw new Error("영상을 읽지 못했어요. 다시 시도해 주세요.");
  return parsed as {
    transcript?: string;
    on_screen_text?: string;
    visual_notes?: string;
    summary?: string;
  };
}

// ---------- 2) 통계 (YouTube Data API, 실측) ----------
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
    ch.kind === "handle"
      ? `forHandle=${encodeURIComponent(ch.value)}`
      : `id=${ch.value}`;
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
    totalViews: Number(c.statistics.viewCount ?? 0),
  };
}

// ---------- 3) Claude(Opus) PD 분석 ----------
const SYSTEM = `당신은 '나비'입니다. 한국 1인 유튜브 크리에이터를 돕는 베테랑 PD이자 전략가입니다.
영상 내용(받아적은 말 + 화면 묘사)과 채널 통계를 분석해 쇼츠 컷, 패키징(제목·썸네일·설명·태그), 성장 전략을 제안하세요.
구체적으로 쓰고 클리셰·과장·이모지를 피하세요. 아래 키를 가진 JSON 하나만 출력하고 그 외 텍스트·코드펜스 금지.
{"shorts":[{"cue":"CUE 01","hook":"...","reason":"...","title":"..."}],"titles":["..."],"thumbnails":[{"concept":"...","text":"..."}],"description":"...","tags":["..."],"strategy":[{"point":"...","why":"..."}],"next_actions":["..."]}`;

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

// ---------- 핸들러 ----------
export async function POST(req: NextRequest) {
  const { videoUrl, channelUrl } = await req.json();

  const videoId = parseVideoId(videoUrl ?? "");
  if (!videoId)
    return NextResponse.json({ error: "유튜브 영상 URL을 확인해 주세요." }, { status: 400 });

  // 영상 시청 + 통계 동시
  let seen: Awaited<ReturnType<typeof watchVideo>>;
  let video: Awaited<ReturnType<typeof getVideoStats>>;
  let channel: Awaited<ReturnType<typeof getChannelStats>>;
  try {
    [seen, video, channel] = await Promise.all([
      watchVideo(videoUrl),
      getVideoStats(videoId),
      channelUrl ? getChannelStats(channelUrl) : Promise.resolve(null),
    ]);
  } catch (e: any) {
    console.error("analyze: 영상 시청 실패", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "영상을 분석하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 }
    );
  }

  const ctx = [
    channel &&
      `채널: ${channel.name} · 구독자 ${channel.subscribers.toLocaleString()}명 · 영상 ${channel.videoCount}개`,
    video &&
      `이 영상: "${video.title}" · 조회 ${video.views.toLocaleString()} · 좋아요 ${video.likes.toLocaleString()} · 댓글 ${video.comments.toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const videoBlock = [
    seen.summary && `[영상 요약] ${seen.summary}`,
    seen.transcript && `[말한 내용]\n${seen.transcript}`,
    seen.on_screen_text && `[화면 텍스트]\n${seen.on_screen_text}`,
    seen.visual_notes && `[화면 묘사]\n${seen.visual_notes}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 14000);

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `[채널/영상 통계]\n${ctx || "(없음)"}\n\n${videoBlock}`,
      },
    ],
  });

  const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
  const json = extractJson(raw);
  if (!json) {
    console.error("analyze: JSON 파싱 실패", raw.slice(0, 500));
    return NextResponse.json(
      { error: "분석 결과를 읽지 못했어요. 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  return NextResponse.json({ video, channel, analysis: json });
}
