// app/api/radar/start/route.ts
//
// 니치 레이더(비슷한 활성 채널 정찰)를 백그라운드로 시작한다.
// analyses 행(format='radar')을 만든 뒤 radar-background를 깨운다. 클라는 /api/analyze/status로 폴링.
//
// POST /api/radar/start { channel, videos, niche? } → { id }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { channel, videos, niche } = await req.json();
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
    .insert({ status: "pending", format: "radar" })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 만들지 못했어요." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/.netlify/functions/radar-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, channel, videos, niche }),
    });
  } catch {
    await supabase
      .from("analyses")
      .update({ status: "error", error: "정찰을 시작하지 못했어요." })
      .eq("id", data.id);
    return NextResponse.json({ error: "정찰을 시작하지 못했어요." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
