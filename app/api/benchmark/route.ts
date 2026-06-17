// app/api/benchmark/route.ts
//
// '닮고 싶은 채널' 비교 — 메인 진단과 분리해 병렬로 호출(타임아웃 방어).
//  - benchmarkUrl이 있으면: 그 채널과 비교
//  - 없으면(자동): 같은 분야에서 잘 되는 비슷한 채널을 찾아 비교 (워너비 설정 불필요)
//
// POST /api/benchmark { channel, benchmarkUrl?, niche? } → { benchmark | null }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";
const YT_KEY = process.env.YOUTUBE_API_KEY;

type Bench = { name: string; subscribers: number; recent: string[] };

async function uploadsRecent(uploads: string, max = 6) {
  const pl = await (
    await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=${max}&playlistId=${uploads}&key=${YT_KEY}`
    )
  ).json();
  const ids = (pl.items || []).map((i: any) => i.contentDetails.videoId).join(",");
  if (!ids) return [] as string[];
  const vj = await (
    await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${YT_KEY}`
    )
  ).json();
  return (vj.items || []).map(
    (x: any) =>
      `"${x.snippet.title}" (${Number(x.statistics?.viewCount ?? 0).toLocaleString()}회)`
  );
}

// URL로 지정된 워너비 채널 조회
async function benchByUrl(url: string): Promise<Bench | null> {
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
    return {
      name: c.snippet.title,
      subscribers: Number(c.statistics.subscriberCount ?? 0),
      recent: await uploadsRecent(c.contentDetails.relatedPlaylists.uploads),
    };
  } catch {
    return null;
  }
}

// 자동: 같은 분야에서 내 채널보다 잘 되는 비슷한 채널을 찾는다.
async function benchAuto(query: string, myName: string, mySubs: number): Promise<Bench | null> {
  if (!query) return null;
  try {
    const sr = await (
      await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=12&q=${encodeURIComponent(
          query
        )}&relevanceLanguage=ko&key=${YT_KEY}`
      )
    ).json();
    const ids = (sr.items || [])
      .map((i: any) => i.snippet?.channelId)
      .filter(Boolean)
      .slice(0, 12)
      .join(",");
    if (!ids) return null;
    const cj = await (
      await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${ids}&key=${YT_KEY}`
      )
    ).json();
    const norm = (s: string) => (s || "").replace(/\s/g, "").toLowerCase();
    const me = norm(myName);
    // 내 채널 제외 + 나보다 크고(성공) + 너무 동떨어지지 않은(100배 이내) 후보
    const cands = (cj.items || [])
      .map((c: any) => ({
        name: c.snippet.title as string,
        subs: Number(c.statistics.subscriberCount ?? 0),
        uploads: c.contentDetails?.relatedPlaylists?.uploads as string,
      }))
      .filter(
        (c: any) =>
          c.uploads &&
          norm(c.name) !== me &&
          c.subs > Math.max(mySubs, 1000) &&
          (mySubs === 0 || c.subs <= mySubs * 200)
      )
      .sort((a: any, b: any) => b.subs - a.subs);
    const pick = cands[0];
    if (!pick) return null;
    return { name: pick.name, subscribers: pick.subs, recent: await uploadsRecent(pick.uploads) };
  } catch {
    return null;
  }
}

const SYSTEM = `당신은 '나비', 한국 유튜브 크리에이터의 AI 성장 PD입니다.
내 채널과 비교 채널의 실데이터(구독자·최근 영상 제목·조회수)만 근거로 비교하세요.
지어내지 말고, 구독자·콘텐츠 차이를 실수치로 짚은 뒤 따라할 점을 구체적으로. 클리셰·과장·이모지 금지.
아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"summary":"내 채널과의 차이 한 줄","learn":["이 채널에서 가져올 점 2~3개"]}`;

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
  const { channel, benchmarkUrl, niche } = await req.json();
  if (!YT_KEY) return NextResponse.json({ benchmark: null });

  const auto = !benchmarkUrl;
  const myName = channel?.name ?? "";
  const mySubs = Number(channel?.subscribers ?? 0);
  const bench = benchmarkUrl
    ? await benchByUrl(benchmarkUrl)
    : await benchAuto(niche || myName, myName, mySubs);

  if (!bench) {
    // 자동 모드에서 못 찾으면 카드 자체를 띄우지 않는다(조용히 null)
    return auto
      ? NextResponse.json({ benchmark: null })
      : NextResponse.json(
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
          content: `[내 채널]\n${myName} · 구독자 ${mySubs.toLocaleString()} · 총 영상 ${
            channel?.videoCount ?? "?"
          }개\n\n[비교 채널]\n${bench.name} · 구독자 ${bench.subscribers.toLocaleString()}\n최근: ${bench.recent.join(
            ", "
          )}`,
        },
      ],
    });
    const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
    const parsed = extractJson(raw);
    if (!parsed) return NextResponse.json({ error: "비교 결과를 읽지 못했어요." }, { status: 502 });
    return NextResponse.json({
      benchmark: { name: bench.name, summary: parsed.summary, learn: parsed.learn, auto },
    });
  } catch (e: any) {
    console.error("benchmark 실패:", e?.message || e);
    return NextResponse.json({ error: e?.message || "비교 중 문제가 생겼어요." }, { status: 502 });
  }
}
