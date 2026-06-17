// app/api/script/start/route.ts
//
// 기획안 → 대본 생성을 백그라운드로 시작한다. analyses 행(format='script')을 만든 뒤
// script-background를 깨운다. 클라는 /api/analyze/status로 폴링.
//
// POST /api/script/start { idea, niche? } → { id }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { idea, niche } = await req.json();
  if (!idea?.title) {
    return NextResponse.json({ error: "기획안 정보가 없어요." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("analyses")
    .insert({ status: "pending", format: "script" })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "작업을 만들지 못했어요." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/.netlify/functions/script-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.id, idea, niche }),
    });
  } catch {
    await supabase
      .from("analyses")
      .update({ status: "error", error: "대본 생성을 시작하지 못했어요." })
      .eq("id", data.id);
    return NextResponse.json({ error: "대본 생성을 시작하지 못했어요." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
