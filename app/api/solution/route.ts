// app/api/solution/route.ts
//
// 2단계: 이미 받아둔 채널 통계 + 최근 영상 목록으로 진단·처방 생성.
// 인터랙티브라 속도 우선 → Sonnet. (없는 수치 금지, 실데이터만 근거)
//
// POST /api/solution { channel, videos, tone?, purpose?, aspiration? } → { solution }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";

const SYSTEM = `당신은 '나비', 한국 1인 유튜브 크리에이터의 AI 성장 PD입니다.
'최근 업로드 실데이터'(제목·형식·조회수·날짜)만 근거로 채널을 진단·처방하세요.
데이터에 없는 수치·사실을 지어내지 마세요. 쇼츠와 롱폼을 구분해 처방하세요.
구체적으로, 클리셰·과장·이모지 없이. 아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{
 "read":"채널 현황 한 줄(실수치 근거)",
 "patterns":[{"point":"진단","evidence":"근거 영상/수치"}],
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
  const { channel, videos, tone, purpose, aspiration } = await req.json();
  if (!channel || !Array.isArray(videos) || videos.length === 0) {
    return NextResponse.json({ error: "분석할 채널 데이터가 없어요." }, { status: 400 });
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
        `${i + 1}. [${v.format}] "${v.title}" · 조회 ${Number(v.views).toLocaleString()} · ${v.date}`
    )
    .join("\n");

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1800,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `[채널]\n${channel.name} · 구독자 ${Number(channel.subscribers).toLocaleString()} · 총 영상 ${channel.videoCount}개${
            profile ? `\n[프로필]\n${profile}` : ""
          }\n\n[최근 업로드 — 오늘 새로 읽음]\n${list}`,
        },
      ],
    });
    const raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
    const solution = extractJson(raw);
    if (!solution) {
      return NextResponse.json({ error: "진단 결과를 읽지 못했어요." }, { status: 502 });
    }
    return NextResponse.json({ solution });
  } catch (e: any) {
    console.error("solution 실패:", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "진단 중 문제가 생겼어요." },
      { status: 502 }
    );
  }
}
