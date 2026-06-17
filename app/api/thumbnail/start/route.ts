// app/api/thumbnail/start/route.ts
//
// AI 썸네일 시안 생성을 백그라운드로 시작한다. 기획안 정보로 프롬프트를 만들고
// analyses 행(format='thumb')을 만든 뒤 thumbnail-background를 깨운다. 클라는 /api/analyze/status로 폴링.
//
// POST /api/thumbnail/start { title, concept?, text?, niche? } → { id }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { title, concept, text, niche } = await req.json();
  if (!title && !concept) {
    return NextResponse.json({ error: "썸네일 정보가 부족해요." }, { status: 400 });
  }

  const prompt = [
    "유튜브 썸네일 시안. 16:9 가로 비율, 고대비, 시선을 끄는 큰 피사체, 클릭을 부르는 구성.",
    niche && `채널 분야: ${niche}.`,
    title && `영상 주제: ${title}.`,
    concept && `썸네일 컨셉: ${concept}.`,
    text && `핵심 문구(크게, 한국어, 읽기 쉽게): ${text}.`,
    "사실적이고 선명한 스타일. 텍스트는 짧고 굵게. 깔끔하고 프로페셔널하게.",
  ]
    .filter(Boolean)
    .join(" ");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("analyses")
    .insert({ status: "pending", format: "thumb" })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 만들지 못했어요." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/.netlify/functions/thumbnail-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, prompt }),
    });
  } catch {
    await supabase
      .from("analyses")
      .update({ status: "error", error: "썸네일 생성을 시작하지 못했어요." })
      .eq("id", data.id);
    return NextResponse.json({ error: "썸네일 생성을 시작하지 못했어요." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
