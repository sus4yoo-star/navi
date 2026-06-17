// app/api/subscribe/route.ts — 비로그인 매거진 구독 신청
//
// POST /api/subscribe { email, channelUrl, benchmarkUrl?, niche? }
// subscribers 테이블에 insert (RLS: 누구나 insert 허용).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const { email, channelUrl, benchmarkUrl, niche } = await req.json();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "이메일을 확인해 주세요." }, { status: 400 });
  }
  if (!channelUrl || typeof channelUrl !== "string") {
    return NextResponse.json({ error: "채널 URL을 넣어주세요." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { error } = await supabase
    .from("subscribers")
    .upsert(
      { email, channel_url: channelUrl, benchmark_url: benchmarkUrl || null, niche: niche || null },
      { onConflict: "email" }
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
