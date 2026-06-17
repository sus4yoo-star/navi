// app/api/plan/start/route.ts
//
// '뭘 만들지' 기획을 백그라운드로 시작한다. analyses 행(format='plan')을 만들고
// plan-background 함수를 깨운 뒤 작업 id를 돌려준다. 클라이언트는 /api/analyze/status로 폴링.
//
// POST /api/plan/start { channel, videos, niche? } → { id }

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
    .insert({ status: "pending", format: "plan" })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 만들지 못했어요." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/.netlify/functions/plan-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, channel, videos, niche }),
    });
  } catch {
    await supabase
      .from("analyses")
      .update({ status: "error", error: "기획을 시작하지 못했어요." })
      .eq("id", data.id);
    return NextResponse.json({ error: "기획을 시작하지 못했어요." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
