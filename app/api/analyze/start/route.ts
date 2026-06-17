// app/api/analyze/start/route.ts
//
// 긴 영상 '자세히' 분석을 시작한다. analyses 행을 만들고(pending),
// 백그라운드 함수를 깨운 뒤 작업 id를 돌려준다. 클라이언트는 이 id로 폴링한다.
//
// POST /api/analyze/start { videoUrl, channelUrl, format } → { id }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { videoUrl, channelUrl, format } = await req.json();
  if (!videoUrl) {
    return NextResponse.json({ error: "유튜브 영상 URL을 확인해 주세요." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("analyses")
    .insert({ status: "pending", video_url: videoUrl, channel_url: channelUrl, format })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 만들지 못했어요." }, { status: 500 });
  }

  // 백그라운드 함수 깨우기 — 즉시 202를 주고 길게 실행된다.
  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/.netlify/functions/analyze-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, videoUrl, channelUrl, format }),
    });
  } catch (e: any) {
    await supabase
      .from("analyses")
      .update({ status: "error", error: "분석을 시작하지 못했어요." })
      .eq("id", data.id);
    return NextResponse.json({ error: "분석을 시작하지 못했어요." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
