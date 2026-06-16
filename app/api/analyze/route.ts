// app/api/analyze/route.ts  (Next.js App Router)
//
// 설치: npm i youtube-transcript @anthropic-ai/sdk
// 환경변수(.env.local):
//   ANTHROPIC_API_KEY=sk-ant-...
//   YOUTUBE_API_KEY=AIza...        // Google Cloud → YouTube Data API v3 키
//
// 프론트는 그냥 이렇게 부르면 끝:
//   const res = await fetch("/api/analyze", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ videoUrl, channelUrl }),
//   });
//   const data = await res.json();

import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";        // Edge 아님(자막 라이브러리가 node 필요)
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const YT_KEY = process.env.YOUTUBE_API_KEY!;

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

// ---------- 1) 자막 ----------
// 1순위: 유튜브 자막 트랙(무료·빠름, 단 비공식 엔드포인트라 ToS 회색·가끔 깨짐)
//   - 자기 영상만 다룰 거면 OAuth + captions.download 가 합법·안정적
// 2순위: 자막 없으면 Whisper 폴백 (아래 transcribeWithWhisper 참고)
async function getTranscript(videoId: string): Promise<string | null> {
  try {
    const ko = await YoutubeTranscript.fetchTranscript(videoId, { lang: "ko" }).catch(() => null);
    const items = ko ?? (await YoutubeTranscript.fetchTranscript(videoId));
    const text = items.map((i) => i.text).join(" ").trim();
    return text.length > 30 ? text : null;
  } catch {
    return null; // 자막 트랙 없음 → 호출부에서 Whisper 폴백
  }
}

// ---------- 2) 통계 (YouTube Data API, 공개치라 OAuth 불필요) ----------
async function getVideoStats(videoId: string) {
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

// ---------- 3) Claude 분석 ----------
const SYSTEM = `당신은 '유PD'입니다. 한국 1인 유튜브 크리에이터를 돕는 베테랑 PD이자 전략가입니다.
영상 자막과 채널 통계를 분석해 쇼츠 컷, 패키징(제목·썸네일·설명·태그), 성장 전략을 제안하세요.
구체적으로 쓰고 클리셰·과장·이모지를 피하세요. 아래 키를 가진 JSON 하나만 출력하고 그 외 텍스트·코드펜스 금지.
{"shorts":[{"cue":"CUE 01","hook":"...","reason":"...","title":"..."}],"titles":["..."],"thumbnails":[{"concept":"...","text":"..."}],"description":"...","tags":["..."],"strategy":[{"point":"...","why":"..."}],"next_actions":["..."]}`;

function extractJson(text: string) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
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

  const [transcript, video, channel] = await Promise.all([
    getTranscript(videoId),
    getVideoStats(videoId),
    channelUrl ? getChannelStats(channelUrl) : Promise.resolve(null),
  ]);

  if (!transcript) {
    // 자막이 없는 영상 → Whisper 폴백 자리 (transcribeWithWhisper 구현 후 연결)
    return NextResponse.json(
      { error: "자막이 없는 영상이에요. Whisper 전사가 필요합니다.", needsWhisper: true },
      { status: 422 }
    );
  }

  const ctx = [
    channel && `채널: ${channel.name} · 구독자 ${channel.subscribers.toLocaleString()}명 · 영상 ${channel.videoCount}개`,
    video && `이 영상: "${video.title}" · 조회 ${video.views.toLocaleString()} · 좋아요 ${video.likes.toLocaleString()} · 댓글 ${video.comments.toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `[채널/영상 통계]\n${ctx || "(없음)"}\n\n[영상 자막]\n${transcript.slice(0, 12000)}`,
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

// ---------- Whisper 폴백 (자막 없는 영상용 스케치) ----------
// 서버에 yt-dlp 설치 후:
//   1) yt-dlp -x --audio-format mp3 -o /tmp/%(id)s.mp3 <videoUrl>
//   2) 오디오를 OpenAI Whisper(또는 자체 호스팅 whisper.cpp)에 보내 전사
//   3) 반환 텍스트를 위 SYSTEM 프롬프트에 그대로 투입
// 무료 자막 트랙이 있는 영상이 대부분이라, 폴백은 나중에 붙여도 됩니다.
