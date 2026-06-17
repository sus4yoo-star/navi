// app/api/channel/route.ts
//
// 채널 URL 하나로 "알아서" 솔루션. 영상 URL 입력 없음.
// 1) YouTube API로 최근 업로드 ~10개(쇼츠/롱폼 구분 · 조회 · 날짜) 실측
// 2) Claude(Opus)가 그 실데이터로 진단 + 처방 (없는 수치는 만들지 않음)
//
// POST /api/channel { channelUrl, tone?, purpose?, aspiration? }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const YT_KEY = process.env.YOUTUBE_API_KEY;
const CLAUDE_MODEL = "claude-opus-4-8";

function parseChannel(url: string) {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) return `forHandle=${encodeURIComponent(p[0])}`;
    if (p[0] === "channel") return `id=${p[1]}`;
    return null;
  } catch {
    return null;
  }
}

function isoToSec(d: string) {
  const m = d?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

async function resolveChannel(url: string) {
  if (!YT_KEY) return null;
  const q = parseChannel(url);
  if (!q) return null;
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&${q}&key=${YT_KEY}`
  );
  const j = await r.json();
  const c = j.items?.[0];
  if (!c) return null;
  return {
    name: c.snippet.title as string,
    subscribers: Number(c.statistics.subscriberCount ?? 0),
    videoCount: Number(c.statistics.videoCount ?? 0),
    uploads: c.contentDetails.relatedPlaylists.uploads as string,
  };
}

async function getRecent(uploadsId: string, max = 10) {
  const pl = await (
    await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=${max}&playlistId=${uploadsId}&key=${YT_KEY}`
    )
  ).json();
  const ids = (pl.items || []).map((i: any) => i.contentDetails.videoId).join(",");
  if (!ids) return [];
  const v = await (
    await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YT_KEY}`
    )
  ).json();
  return (v.items || []).map((x: any) => {
    const sec = isoToSec(x.contentDetails?.duration || "");
    const isShort =
      (sec > 0 && sec <= 60) || /#shorts/i.test(x.snippet.title + (x.snippet.description || ""));
    return {
      id: x.id as string,
      title: x.snippet.title as string,
      views: Number(x.statistics?.viewCount ?? 0),
      date: (x.snippet.publishedAt as string)?.slice(0, 10),
      durationSec: sec,
      format: isShort ? "쇼츠" : "롱폼",
    };
  });
}

const SYSTEM = `당신은 '나비'입니다. 한국 1인 유튜브 크리에이터의 AI 성장 PD입니다.
'최근 업로드 실데이터'(제목·형식·조회수·날짜)만 근거로 채널을 진단하고 처방하세요.
데이터에 없는 수치·사실을 절대 지어내지 마세요. 조회수 비교는 주어진 숫자 안에서만.
쇼츠와 롱폼을 구분해 각각 처방하세요. 구체적으로, 클리셰·과장·이모지 없이.
아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{
 "read":"채널 현황 한 줄 (어떤 영상이 잘됐는지/패턴/공백 — 실수치 근거)",
 "patterns":[{"point":"진단","evidence":"근거가 된 실제 영상/수치"}],
 "shorts_solution":[{"point":"처방","why":"이유"}],
 "longform_solution":[{"point":"처방","why":"이유"}],
 "next_videos":[{"title":"제목","format":"쇼츠","angle":"각도","hook":"첫 3초"}],
 "this_week":["이번 주 할 일"]
}`;

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

export async function POST(req: NextRequest) {
  const { channelUrl, tone, purpose, aspiration } = await req.json();
  if (!channelUrl) {
    return NextResponse.json({ error: "채널 URL을 확인해 주세요." }, { status: 400 });
  }

  const ch = await resolveChannel(channelUrl);
  if (!ch) {
    return NextResponse.json(
      { error: "채널을 찾지 못했어요. @핸들 또는 /channel/ 형식 URL인지 확인해 주세요." },
      { status: 404 }
    );
  }
  const videos = await getRecent(ch.uploads, 10);
  if (videos.length === 0) {
    return NextResponse.json(
      { error: "최근 영상을 불러오지 못했어요. 공개 영상이 있는 채널인지 확인해 주세요." },
      { status: 422 }
    );
  }

  const profile = [
    tone && `톤: ${tone}`,
    purpose && `목적: ${purpose}`,
    aspiration && `지향: ${aspiration}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const list = videos
    .map(
      (v: any, i: number) =>
        `${i + 1}. [${v.format}] "${v.title}" · 조회 ${v.views.toLocaleString()} · ${v.date}`
    )
    .join("\n");

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `[채널]\n${ch.name} · 구독자 ${ch.subscribers.toLocaleString()} · 총 영상 ${ch.videoCount}개${
          profile ? `\n[프로필]\n${profile}` : ""
        }\n\n[최근 업로드 — 오늘 새로 읽음]\n${list}`,
      },
    ],
  });

  const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
  const solution = extractJson(raw);
  if (!solution) {
    console.error("channel: JSON 파싱 실패", raw.slice(0, 500));
    return NextResponse.json({ error: "분석 결과를 읽지 못했어요. 다시 시도해 주세요." }, { status: 500 });
  }

  return NextResponse.json({
    channel: { name: ch.name, subscribers: ch.subscribers, videoCount: ch.videoCount },
    videos,
    solution,
  });
}
