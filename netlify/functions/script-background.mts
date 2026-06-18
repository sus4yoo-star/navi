// netlify/functions/script-background.mts
//
// 기획안 → 대본(스토리보드). 바로 촬영·편집할 수 있게 장면별로 시간·화면·대사·자막을 쓴다.
// 결과를 analyses.result에 저장(format='script'). 클라가 폴링해 표시.
//
// 환경변수: ANTHROPIC_API_KEY, SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-sonnet-4-6";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const SYSTEM = `당신은 '나비'의 방송작가입니다. 주어진 영상 기획안을 바로 촬영·편집할 수 있는 대본(스토리보드)으로 씁니다.
형식(쇼츠/롱폼)에 맞게, 장면별로 시간·화면(무엇을 찍/보여줄지)·대사(내레이션)·화면자막을 구체적으로 쓰세요.
막연한 말 금지, 실제로 따라 찍을 수 있게. 한국어. 클리셰·과장·이모지 금지. 아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{
 "length":"예상 길이(예: 35초)",
 "scenes":[{"t":"0-3초","visual":"화면/장면 설명","line":"내레이션 또는 대사","caption":"화면에 띄울 자막"}],
 "cta":"마무리 한마디(다음 행동 유도)"
}
쇼츠면 15~45초·장면 4~7개. 롱폼이면 도입 훅 대본 + 핵심 구성 단계(섹션)로 장면을 구성.`;

function extractJson(text: string) {
  const t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1));
  } catch {
    return null;
  }
}

export default async (req: Request) => {
  let id: string | undefined;
  try {
    const body = await req.json();
    id = body.id;
    const { idea, niche } = body;
    if (!id || !idea?.title) return new Response("bad request", { status: 400 });

    const content =
      `[기획안]\n제목: ${idea.title}\n형식: ${idea.format || "쇼츠"}\n첫 3초 훅: ${
        idea.hook || "-"
      }\n왜 먹히는지: ${idea.why || "-"}` + (niche ? `\n채널 분야: ${niche}` : "");

    // 롱폼은 대본이 길어 토큰이 부족하면 JSON이 잘린다 → 넉넉히 + 1회 재시도(prefill).
    let script: any = null;
    for (let attempt = 0; attempt < 2 && !script; attempt++) {
      try {
        const msg = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM,
          messages: [
            { role: "user", content },
            ...(attempt > 0 ? [{ role: "assistant" as const, content: "{" }] : []),
          ],
        });
        let raw = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
        if (attempt > 0) raw = "{" + raw;
        script = extractJson(raw);
      } catch (e: any) {
        console.error(`script 호출 실패(시도 ${attempt + 1}):`, e?.message || e);
      }
    }
    if (!script) throw new Error("대본을 읽지 못했어요. 잠시 후 다시 시도해 주세요.");

    await sb.from("analyses").update({ status: "done", result: script }).eq("id", id);
  } catch (e: any) {
    console.error("script-background 실패:", e?.message || e);
    if (id)
      await sb
        .from("analyses")
        .update({ status: "error", error: e?.message || "대본 생성 중 문제가 생겼어요." })
        .eq("id", id);
  }
  return new Response("ok");
};
