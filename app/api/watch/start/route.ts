// app/api/watch/start/route.ts
//
// 눈여겨보는 채널 분석을 백그라운드로 시작한다. analyses 행(format='watch')을 만든 뒤
// watch-background를 깨운다. 클라는 /api/analyze/status로 폴링.
//
// POST /api/watch/start { channel, videos, niche?, watchUrl } → { id }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { channel, videos, niche, watchUrl } = await req.json();
  if (!watchUrl || !channel) {
    return NextResponse.json({ error: "채널 정보가 부족해요." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("analyses")
    .insert({ status: "pending", format: "watch" })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 만들지 못했어요." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/.netlify/functions/watch-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, channel, videos, niche, watchUrl }),
    });
  } catch {
    await supabase
      .from("analyses")
      .update({ status: "error", error: "분석을 시작하지 못했어요." })
      .eq("id", data.id);
    return NextResponse.json({ error: "분석을 시작하지 못했어요." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
