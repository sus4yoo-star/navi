// netlify/functions/solution-background.mts
//
// 채널 진단·처방(Claude) 생성을 백그라운드로 처리한다.
// Netlify 동기 함수 제한(기본 10초)을 LLM 호출이 넘기므로, 여기서 길게 돌리고
// 결과를 analyses 테이블에 기록한다. 클라이언트는 /api/analyze/status 로 폴링.
//
// 환경변수: ANTHROPIC_API_KEY,
//          SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

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

export default async (req: Request) => {
  let id: string | undefined;
  try {
    const body = await req.json();
    id = body.id;
    const { channel, videos, tone, purpose, aspiration } = body;
    if (!id || !channel || !Array.isArray(videos)) return new Response("bad request", { status: 400 });

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
    if (!solution) throw new Error("진단 결과를 읽지 못했어요.");

    await sb.from("analyses").update({ status: "done", result: solution }).eq("id", id);
  } catch (e: any) {
    console.error("solution-background 실패:", e?.message || e);
    if (id) {
      await sb
        .from("analyses")
        .update({ status: "error", error: e?.message || "진단 중 문제가 생겼어요." })
        .eq("id", id);
    }
  }
  return new Response("ok");
};
