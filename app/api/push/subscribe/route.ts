// app/api/push/subscribe/route.ts — 웹푸시 구독 저장
//
// 프론트: 사용자 액세스 토큰을 Authorization 헤더로 보내면, 그 유저의 구독을 저장한다.
// RLS가 켜져 있어 본인 것만 insert 된다(anon 키 + 유저 토큰).
//
// POST /api/push/subscribe
//   headers: { Authorization: "Bearer <access_token>" }
//   body:    { subscription: PushSubscription.toJSON() }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { subscription } = await req.json();
  const endpoint = subscription?.endpoint;
  if (!endpoint) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않아요." }, { status: 400 });
  }

  // 유저 토큰을 단 anon 클라이언트 → RLS가 본인 user_id만 허용
  // 서버라 저장된 세션이 없으므로 persistSession은 끄고, getUser엔 토큰을 직접 넘긴다
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) {
    return NextResponse.json({ error: "세션이 만료됐어요." }, { status: 401 });
  }

  // 같은 엔드포인트면 갱신, 없으면 추가
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, subscription, endpoint },
      { onConflict: "endpoint" }
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
