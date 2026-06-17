// app/api/analyze/route.ts  (Next.js App Router)
//
// 영상 1개 깊은 분석: Gemini가 유튜브 영상을 직접 보고(음성+화면) 그 자리에서
// 쇼츠컷·패키징·전략까지 한 번에 만든다. (단일 호출 — Netlify 함수 타임아웃 방어)
// 채널 통계는 YouTube Data API 실측으로 함께 제공.
//
// 환경변수: YOUTUBE_API_KEY, GEMINI_API_KEY, (선택) GEMINI_MODEL

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const YT_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function parseVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

function parseChannel(url: string) {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) return { kind: "handle", value: p[0] };
    if (p[0] === "channel") return { kind: "id", value: p[1] };
    return null;
  } catch {
    return null;
  }
}

async function getVideoStats(videoId: string) {
  if (!YT_KEY) return null;
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${YT_KEY}`
  );
  const j = await r.json();
  const v = j.items?.[0];
  if (!v) return null;
  return {
    title: v.snippet.title,
    publishedAt: v.snippet.publishedAt,
    views: Number(v.statistics.viewCount ?? 0),
    likes: Number(v.statistics.likeCount ?? 0),
    comments: Number(v.statistics.commentCount ?? 0),
  };
}

async function getChannelStats(channelUrl: string) {
  if (!YT_KEY) return null;
  const ch = parseChannel(channelUrl);
  if (!ch) return null;
  const q =
    ch.kind === "handle" ? `forHandle=${encodeURIComponent(ch.value)}` : `id=${ch.value}`;
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${q}&key=${YT_KEY}`
  );
  const j = await r.json();
  const c = j.items?.[0];
  if (!c) return null;
  return {
    name: c.snippet.title,
    subscribers: Number(c.statistics.subscriberCount ?? 0),
    videoCount: Number(c.statistics.videoCount ?? 0),
  };
}

function buildPrompt(format: string) {
  const isShort = format === "쇼츠";
  const shortsRule = isShort
    ? `이 영상은 그 자체로 이미 '쇼츠'(60초 이하)입니다. 절대로 쇼츠로 자를 구간을 만들지 마세요. "shorts"는 반드시 빈 배열([]). 대신 이 쇼츠 자체의 훅·전개·마무리·패키징을 good/improve/titles로 평가하세요.`
    : `이 영상은 '롱폼'입니다. "shorts"에 쇼츠로 뽑으면 좋을 구간 5~6개를 제안하세요.`;
  return `당신은 '나비', 한국 1인 유튜브 크리에이터를 돕는 베테랑 PD입니다.
이 영상을 음성과 화면을 모두 보고, 실제 내용에 근거해 분석하세요. 보이지/들리지 않은 것을 지어내지 마세요. 클리셰·과장·이모지 금지.

[타임코드 규칙] 쇼츠 구간(cue)은 실제로 그 말/장면이 나오는 시점만 "M:SS-M:SS" 형식으로 정확히. 추측·반올림 금지.
[대사(transcript)] 그 구간에서 실제로 들리는 말을 요약하지 말고 그대로 옮기세요.
[선별] 서로 겹치지 않는 '서로 다른' 구간만 최대 5개. 같은 문장·같은 장면·겹치는 시간대를 반복하지 마세요. 실제로 훅이 세고 독립적으로 완결되는 '쇼츠감'만 고르고, 약하면 3개여도 됩니다. 순위·점수는 매기지 말고, 각 구간을 고른 이유(reason)를 구체적으로.
[바로 올릴 패키지] 각 쇼츠마다 화면자막(onscreen)·캡션(caption)·해시태그(hashtags)·제목(title)을 채워, 편집만 하면 바로 올릴 수 있게.

먼저 영상 전체를 3~5줄로 요약(summary)하세요. 그다음 잘한 점(good)·개선점(improve).
그리고 가장 중요한 '영감(inspiration)' 2~3개 — 단순 평가가 아니라, 이 영상의 강점·순간·반응에서 뻗어나갈 '새로운 콘텐츠 방향/각도/시리즈'를 크리에이터의 가슴이 뛰게 풀어주세요. [한 줄 영감 제목] + [왜 통하고 어떻게 펼칠지]. 이 영상의 실제 장면/대사에 뿌리내릴 것. 과장·이모지 금지.
${shortsRule}
아래 키를 가진 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"summary":"영상 핵심 3~5줄","inspiration":[{"title":"영감 한 줄(가슴에 꽂히게)","how":"왜 통하고 어떻게 펼칠지 — 이 영상 근거 위에서"}],"good":["잘한 점 — 실제 장면/말 근거"],"improve":["개선점 — 구체적·실행가능"],"titles":["더 끌리는 제목 후보"],"thumbnail":{"concept":"썸네일 구성","text":"썸네일 카피"},"tags":["태그"],"shorts":[{"cue":"0:50-1:08","transcript":"그 구간 실제 대사 그대로","hook":"첫 3초 훅","onscreen":"화면에 넣을 자막","caption":"업로드 캡션","hashtags":["#태그"],"title":"쇼츠 제목","reason":"왜 이 구간이 쇼츠감인지 구체적 근거"}],"next_ideas":["다음에 만들면 좋을 영상"]}`;
}

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

async function analyzeVideo(videoUrl: string, statsCtx: string, format: string) {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않았어요.");
  // 롱폼은 프레임 샘플링을 더 낮춰 처리 시간을 줄임(타임아웃 방어)
  const videoPart: any = { file_data: { file_uri: videoUrl } };
  if (format !== "쇼츠") videoPart.video_metadata = { fps: 0.2 };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              videoPart,
              { text: `${buildPrompt(format)}\n\n[채널/영상 통계]\n${statsCtx || "(없음)"}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          // 2.5-flash의 thinking이 출력 토큰을 먹어 빈 응답 나는 것 방지 + 속도↑
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
  const text =
    j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") || "";
  const parsed = extractJson(text);
  if (!parsed) throw new Error("분석 결과를 읽지 못했어요. 다시 시도해 주세요.");
  return parsed;
}

export async function POST(req: NextRequest) {
  const { videoUrl, channelUrl, format } = await req.json();

  const videoId = parseVideoId(videoUrl ?? "");
  if (!videoId)
    return NextResponse.json({ error: "유튜브 영상 URL을 확인해 주세요." }, { status: 400 });

  const [video, channel] = await Promise.all([
    getVideoStats(videoId),
    channelUrl ? getChannelStats(channelUrl) : Promise.resolve(null),
  ]);

  const statsCtx = [
    channel &&
      `채널: ${channel.name} · 구독자 ${channel.subscribers.toLocaleString()}명 · 영상 ${channel.videoCount}개`,
    video &&
      `이 영상: "${video.title}" · 조회 ${video.views.toLocaleString()} · 좋아요 ${video.likes.toLocaleString()} · 댓글 ${video.comments.toLocaleString()}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const fmt = format || "쇼츠";
    const analysis = await analyzeVideo(videoUrl, statsCtx, fmt);
    // 이미 쇼츠인 영상에는 '쇼츠로 자르기' 제안이 무의미 → 모델이 만들어도 비운다.
    if (fmt === "쇼츠" && analysis) analysis.shorts = [];
    return NextResponse.json({ video, channel, analysis });
  } catch (e: any) {
    console.error("analyze 실패:", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "영상을 분석하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 }
    );
  }
}
