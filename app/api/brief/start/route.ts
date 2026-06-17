// app/api/brief/start/route.ts
//
// 통합 브리핑(정찰→진단→기획→전략)을 백그라운드로 시작한다.
// analyses 행(format='brief')을 만든 뒤 brief-background를 깨운다. 클라는 /api/analyze/status로 폴링.
//
// POST /api/brief/start { channel, videos, niche? } → { id }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { channel, videos, niche, tone, purpose, aspiration } = await req.json();
  if (!channel || !Array.isArray(videos)) {
    return NextResponse.json({ error: "채널 데이터가 없어요." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("analyses")
    .insert({ status: "pending", format: "brief" })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 만들지 못했어요." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/.netlify/functions/brief-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, channel, videos, niche, tone, purpose, aspiration }),
    });
  } catch {
    await supabase
      .from("analyses")
      .update({ status: "error", error: "브리핑을 시작하지 못했어요." })
      .eq("id", data.id);
    return NextResponse.json({ error: "브리핑을 시작하지 못했어요." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
