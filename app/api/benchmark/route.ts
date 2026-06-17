// app/api/benchmark/route.ts
//
// 경쟁/벤치마크 심화 — 실데이터로 내 채널과 비교한다(지어내기 금지, 원칙3).
//  - benchmarkUrl 있으면: 그 채널과 비교
//  - 없으면(자동): 같은 분야에서 잘 되는 비슷한 채널을 찾아 비교
// 비교 채널의 최근 영상(평균·쇼츠비율)과 역대 히트 영상(실제 조회수)을 근거로 사용.
//
// POST /api/benchmark { channel, benchmarkUrl?, niche?, myVideos? } → { benchmark | null }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";
const YT = process.env.YOUTUBE_API_KEY;
const API = "https://www.googleapis.com/youtube/v3";

type Vid = { title: string; views: number; format: "쇼츠" | "롱폼" };
type Profile = { channelId: string; name: string; subs: number; uploads: string };

function isoToSec(d: string) {
  const m = d?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
}
async function getJSON(url: string) {
  return (await fetch(url)).json();
}
function toVid(x: any): Vid {
  const sec = isoToSec(x.contentDetails?.duration || "");
  const isShort = (sec > 0 && sec <= 60) || /#shorts/i.test(x.snippet.title + (x.snippet.description || ""));
  return { title: x.snippet.title, views: Number(x.statistics?.viewCount ?? 0), format: isShort ? "쇼츠" : "롱폼" };
}
function stats(vids: Vid[]) {
  if (!vids.length) return { avgViews: 0, shortsPct: 0, n: 0 };
  const avgViews = Math.round(vids.reduce((s, v) => s + v.views, 0) / vids.length);
  const shortsPct = Math.round((vids.filter((v) => v.format === "쇼츠").length / vids.length) * 100);
  return { avgViews, shortsPct, n: vids.length };
}

// URL → 비교 채널 프로필
async function profileByUrl(url: string): Promise<Profile | null> {
  let q: string | null = null;
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) q = `forHandle=${encodeURIComponent(p[0])}`;
    else if (p[0] === "channel") q = `id=${p[1]}`;
  } catch {
    return null;
  }
  if (!q) return null;
  const cj = await getJSON(`${API}/channels?part=snippet,statistics,contentDetails&${q}&key=${YT}`);
  const c = cj.items?.[0];
  if (!c) return null;
  return {
    channelId: c.id,
    name: c.snippet.title,
    subs: Number(c.statistics.subscriberCount ?? 0),
    uploads: c.contentDetails.relatedPlaylists.uploads,
  };
}

// 자동 → 같은 분야에서 내 채널보다 잘 되는 비슷한 채널
async function profileAuto(query: string, myName: string, mySubs: number): Promise<Profile | null> {
  if (!query) return null;
  const sr = await getJSON(
    `${API}/search?part=snippet&type=channel&maxResults=12&relevanceLanguage=ko&q=${encodeURIComponent(query)}&key=${YT}`
  );
  const ids = (sr.items || []).map((i: any) => i.snippet?.channelId).filter(Boolean).slice(0, 12).join(",");
  if (!ids) return null;
  const cj = await getJSON(`${API}/channels?part=snippet,statistics,contentDetails&id=${ids}&key=${YT}`);
  const norm = (s: string) => (s || "").replace(/\s/g, "").toLowerCase();
  const me = norm(myName);
  const cands = (cj.items || [])
    .map((c: any) => ({
      channelId: c.id as string,
      name: c.snippet.title as string,
      subs: Number(c.statistics.subscriberCount ?? 0),
      uploads: c.contentDetails?.relatedPlaylists?.uploads as string,
    }))
    .filter(
      (c: any) =>
        c.uploads && norm(c.name) !== me && c.subs > Math.max(mySubs, 1000) && (mySubs === 0 || c.subs <= mySubs * 200)
    )
    .sort((a: any, b: any) => b.subs - a.subs);
  return cands[0] || null;
}

// 최근 업로드(평균·쇼츠비율 비교용)
async function recentVids(uploads: string, max = 10): Promise<Vid[]> {
  const pl = await getJSON(`${API}/playlistItems?part=contentDetails&maxResults=${max}&playlistId=${uploads}&key=${YT}`);
  const ids = (pl.items || []).map((i: any) => i.contentDetails.videoId).join(",");
  if (!ids) return [];
  const vj = await getJSON(`${API}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YT}`);
  return (vj.items || []).map(toVid);
}

// 역대 히트 영상(조회수순) — 실제 근거
async function topVids(channelId: string, max = 6): Promise<Vid[]> {
  const sr = await getJSON(
    `${API}/search?part=snippet&type=video&order=viewCount&maxResults=${max}&channelId=${channelId}&key=${YT}`
  );
  const ids = (sr.items || []).map((i: any) => i.id?.videoId).filter(Boolean).join(",");
  if (!ids) return [];
  const vj = await getJSON(`${API}/videos?part=snippet,statistics,contentDetails&id=${ids}&key=${YT}`);
  return (vj.items || []).map(toVid).sort((a: Vid, b: Vid) => b.views - a.views);
}

const SYSTEM = `당신은 '나비', 한국 유튜브 크리에이터의 AI 성장 PD입니다.
주어진 실데이터(구독자·평균 조회·쇼츠 비율·최근/히트 영상 제목과 조회수)만 근거로, 내 채널과 비교 채널을 분석하세요.
데이터에 없는 수치·사실은 지어내지 마세요. 클리셰·과장·이모지 금지. 아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{
 "summary":"내 채널과의 핵심 차이 한 줄(실수치 근거)",
 "why":["이 채널이 잘 되는 이유 — 히트작·패턴 근거로 2~3개"],
 "learn":["내가 당장 따라할 것 — 구체적 행동 2~3개"]
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
  const { channel, benchmarkUrl, niche, myVideos } = await req.json();
  if (!YT) return NextResponse.json({ benchmark: null });

  const auto = !benchmarkUrl;
  const myName = channel?.name ?? "";
  const mySubs = Number(channel?.subscribers ?? 0);

  const prof = benchmarkUrl ? await profileByUrl(benchmarkUrl) : await profileAuto(niche || myName, myName, mySubs);
  if (!prof) {
    return auto
      ? NextResponse.json({ benchmark: null })
      : NextResponse.json({ error: "닮고 싶은 채널을 찾지 못했어요. URL을 확인해 주세요." }, { status: 502 });
  }

  const [recent, hits] = await Promise.all([recentVids(prof.uploads), topVids(prof.channelId)]);
  const theirs = stats(recent);
  const mine = stats(Array.isArray(myVideos) ? (myVideos as Vid[]) : []);

  try {
    const content =
      `[내 채널] ${myName} · 구독자 ${mySubs.toLocaleString()}` +
      (mine.n ? ` · 최근 평균 조회 ${mine.avgViews.toLocaleString()} · 쇼츠 ${mine.shortsPct}%` : "") +
      `\n\n[비교 채널] ${prof.name} · 구독자 ${prof.subs.toLocaleString()}` +
      (theirs.n ? ` · 최근 평균 조회 ${theirs.avgViews.toLocaleString()} · 쇼츠 ${theirs.shortsPct}%` : "") +
      `\n최근 영상: ${recent.map((v) => `"${v.title}"(${v.views.toLocaleString()})`).join(", ") || "(없음)"}` +
      `\n역대 히트: ${hits.map((v) => `"${v.title}"(${v.views.toLocaleString()})`).join(", ") || "(없음)"}`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
    const parsed = extractJson(raw);
    if (!parsed) return NextResponse.json({ error: "비교 결과를 읽지 못했어요." }, { status: 502 });

    return NextResponse.json({
      benchmark: {
        name: prof.name,
        auto,
        summary: parsed.summary,
        why: parsed.why || [],
        learn: parsed.learn || [],
        mine: mySubs ? { subs: mySubs, ...mine } : null,
        theirs: { subs: prof.subs, ...theirs },
        refs: hits.slice(0, 5),
      },
    });
  } catch (e: any) {
    console.error("benchmark 실패:", e?.message || e);
    return NextResponse.json({ error: e?.message || "비교 중 문제가 생겼어요." }, { status: 502 });
  }
}
