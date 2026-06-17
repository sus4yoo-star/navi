// app/api/detect/route.ts — 온보딩 "채널 첫인상" (서버 측 Claude 호출)
//
// 프론트: POST /api/detect { channelUrl } → { tone, purpose, summary, reason, channelName? }
// 절대 원칙: 분석 호출은 서버에서. 가능한 실제 채널 데이터(이름·구독자)로 근거를 잡는다.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const YT_KEY = process.env.YOUTUBE_API_KEY;

const TONES = [
  "감성·스토리형",
  "정보·하우투형",
  "엔터·리액션형",
  "이슈·논쟁형",
  "일상·브이로그형",
];
const PURPOSES = ["신규 유입 확장", "충성팬 심화"];

const SYSTEM = `당신은 '나비'입니다. 한국 1인 크리에이터를 돕는 AI 성장 PD입니다.
주어진 유튜브 채널 정보(URL·핸들·있으면 채널명/구독자/소개)를 보고 이 채널의 '첫인상'을 가볍게 추정하세요. 사용자가 곧 확인·수정합니다.
톤은 다음 중 하나: ${TONES.join(", ")}.
주력 목적: ${PURPOSES.join(" 또는 ")}.
아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"tone":"...","purpose":"...","niche":"채널 주제 한 줄","summary":"채널 첫인상 한 줄","reason":"왜 그렇게 봤는지 한 줄"}`;

function parseChannel(url: string) {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) return `forHandle=${encodeURIComponent(p[0])}`;
    if (p[0] === "channel") return `id=${p[1]}`;
    if (p[0] === "c" || p[0] === "user") return null; // 레거시 URL은 핸들 조회 불가
    return null;
  } catch {
    return null;
  }
}

async function resolveChannel(url: string) {
  if (!YT_KEY) return null;
  const q = parseChannel(url);
  if (!q) return null;
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${q}&key=${YT_KEY}`
    );
    const j = await r.json();
    const c = j.items?.[0];
    if (!c) return null;
    return {
      name: c.snippet.title as string,
      description: (c.snippet.description as string)?.slice(0, 500) ?? "",
      subscribers: Number(c.statistics.subscriberCount ?? 0),
    };
  } catch {
    return null;
  }
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

export async function POST(req: NextRequest) {
  const { channelUrl } = await req.json();
  if (!channelUrl || typeof channelUrl !== "string") {
    return NextResponse.json({ error: "채널 URL을 확인해 주세요." }, { status: 400 });
  }

  const ch = await resolveChannel(channelUrl);
  const ctx = ch
    ? `채널명: ${ch.name}\n구독자: ${ch.subscribers.toLocaleString()}명\n소개: ${ch.description || "(없음)"}`
    : `채널 URL: ${channelUrl}\n(채널 메타데이터를 불러오지 못했어요. URL만으로 추정합니다.)`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: ctx }],
    });
    const raw = msg.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const j = extractJson(raw);
    if (!j) {
      return NextResponse.json({ error: "채널을 읽지 못했어요. 다시 시도해 주세요." }, { status: 502 });
    }
    return NextResponse.json({
      tone: TONES.includes(j.tone) ? j.tone : TONES[0],
      purpose: PURPOSES.includes(j.purpose) ? j.purpose : PURPOSES[0],
      niche: j.niche ?? ch?.name ?? "",
      summary: j.summary ?? "",
      reason: j.reason ?? "",
      channelName: ch?.name ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "분석 중 문제가 생겼어요." },
      { status: 500 }
    );
  }
}
