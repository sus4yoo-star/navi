// app/api/solution/start/route.ts
//
// 채널 진단·처방을 백그라운드로 시작한다. analyses 행을 만들고(pending)
// solution-background 함수를 깨운 뒤 작업 id를 돌려준다. (LLM 호출이 동기 함수 제한을 넘기므로)
//
// POST /api/solution/start { channel, videos, tone?, purpose?, aspiration? } → { id }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { channel, videos, tone, purpose, aspiration } = await req.json();
  if (!channel || !Array.isArray(videos) || videos.length === 0) {
    return NextResponse.json({ error: "분석할 채널 데이터가 없어요." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("analyses")
    .insert({ status: "pending", format: "solution" })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 만들지 못했어요." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/.netlify/functions/solution-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, channel, videos, tone, purpose, aspiration }),
    });
  } catch {
    await supabase
      .from("analyses")
      .update({ status: "error", error: "진단을 시작하지 못했어요." })
      .eq("id", data.id);
    return NextResponse.json({ error: "진단을 시작하지 못했어요." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
