// netlify/functions/thumbnail-background.mts
//
// AI 썸네일 시안 생성 — 기획안 한 건을 이미지 모델로 16:9 썸네일 비주얼로.
// 생성된 이미지를 data URL로 analyses.result에 저장(format='thumb'). 클라가 폴링해 표시.
//
// 환경변수: GEMINI_API_KEY, (선택) GEMINI_IMAGE_MODEL,
//          SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const IMG_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export default async (req: Request) => {
  let id: string | undefined;
  try {
    const body = await req.json();
    id = body.id;
    const prompt: string = body.prompt;
    if (!id || !prompt) return new Response("bad request", { status: 400 });
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않았어요.");

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMG_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `image ${r.status}`);
    const part = j.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!part?.inlineData?.data) throw new Error("이미지를 생성하지 못했어요.");
    const dataUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;

    await sb.from("analyses").update({ status: "done", result: { image: dataUrl } }).eq("id", id);
  } catch (e: any) {
    console.error("thumbnail-background 실패:", e?.message || e);
    if (id)
      await sb
        .from("analyses")
        .update({ status: "error", error: e?.message || "썸네일 생성 중 문제가 생겼어요." })
        .eq("id", id);
  }
  return new Response("ok");
};
