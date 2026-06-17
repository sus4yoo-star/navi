// app/api/benchmark/route.ts
//
// 워너비(닮고 싶은) 채널 비교 — 메인 진단과 분리해 병렬로 호출(타임아웃 방어).
// 워너비 채널을 가볍게 조회한 뒤, 내 채널과의 차이·따라할 점만 짧게 생성.
//
// POST /api/benchmark { channel, benchmarkUrl } → { benchmark | null }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";
const YT_KEY = process.env.YOUTUBE_API_KEY;

async function getBenchmark(url: string) {
  if (!YT_KEY || !url) return null;
  let q: string | null = null;
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) q = `forHandle=${encodeURIComponent(p[0])}`;
    else if (p[0] === "channel") q = `id=${p[1]}`;
  } catch {
    return null;
  }
  if (!q) return null;
  try {
    const cj = await (
      await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&${q}&key=${YT_KEY}`
      )
    ).json();
    const c = cj.items?.[0];
    if (!c) return null;
    const uploads = c.contentDetails.relatedPlaylists.uploads;
    const pl = await (
      await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=6&playlistId=${uploads}&key=${YT_KEY}`
      )
    ).json();
    const ids = (pl.items || []).map((i: any) => i.contentDetails.videoId).join(",");
    let recent: string[] = [];
    if (ids) {
      const vj = await (
        await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${YT_KEY}`
        )
      ).json();
      recent = (vj.items || []).map(
        (x: any) =>
          `"${x.snippet.title}" (${Number(x.statistics?.viewCount ?? 0).toLocaleString()}회)`
      );
    }
    return {
      name: c.snippet.title as string,
      subscribers: Number(c.statistics.subscriberCount ?? 0),
      recent,
    };
  } catch {
    return null;
  }
}

const SYSTEM = `당신은 '나비', 한국 유튜브 크리에이터의 AI 성장 PD입니다.
내 채널과 '닮고 싶은 채널(워너비)'의 실데이터(구독자·최근 영상 제목·조회수)만 근거로 비교하세요.
지어내지 말고, 구독자·콘텐츠 차이를 실수치로 짚은 뒤 따라할 점을 구체적으로. 클리셰·과장·이모지 금지.
아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"name":"워너비 채널명","summary":"내 채널과의 차이 한 줄","learn":["이 채널에서 가져올 점 2~3개"]}`;

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
  const { channel, benchmarkUrl } = await req.json();
  if (!benchmarkUrl) return NextResponse.json({ benchmark: null });

  const bench = await getBenchmark(benchmarkUrl);
  if (!bench) {
    return NextResponse.json(
      { error: "닮고 싶은 채널을 찾지 못했어요. URL을 확인해 주세요." },
      { status: 502 }
    );
  }

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `[내 채널]\n${channel?.name ?? "내 채널"} · 구독자 ${Number(
            channel?.subscribers ?? 0
          ).toLocaleString()} · 총 영상 ${channel?.videoCount ?? "?"}개\n\n[닮고 싶은 채널]\n${
            bench.name
          } · 구독자 ${bench.subscribers.toLocaleString()}\n최근: ${bench.recent.join(", ")}`,
        },
      ],
    });
    const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
    const benchmark = extractJson(raw);
    if (!benchmark) return NextResponse.json({ error: "비교 결과를 읽지 못했어요." }, { status: 502 });
    return NextResponse.json({ benchmark });
  } catch (e: any) {
    console.error("benchmark 실패:", e?.message || e);
    return NextResponse.json({ error: e?.message || "비교 중 문제가 생겼어요." }, { status: 502 });
  }
}
