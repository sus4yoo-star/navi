// app/api/analyze/status/route.ts
//
// 백그라운드 분석 작업의 상태를 조회한다(폴링용).
//
// GET /api/analyze/status?id=... → { status, video, channel, analysis, error }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id가 필요해요." }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("analyses")
    .select("status, video, channel, result, error")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 찾지 못했어요." }, { status: 404 });
  }

  return NextResponse.json({
    status: data.status,
    video: data.video,
    channel: data.channel,
    analysis: data.result,
    error: data.error,
  });
}
