// scripts/briefing.mjs — GitHub Actions가 매일 실행하는 브리핑 엔진
// 실행: node scripts/briefing.mjs   (env는 워크플로우가 주입)
// 의존성: @supabase/supabase-js @anthropic-ai/sdk web-push

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import webpush from "web-push";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const YT = process.env.YOUTUBE_API_KEY;
webpush.setVapidDetails("mailto:hello@theamov.com", process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

const SYSTEM = `당신은 '나비'입니다. 한국 1인 크리에이터의 AI 성장 PD입니다.
'내 채널 현황'(최근 업로드와 성과)과 '니치 트렌드 데이터'를 근거로 오늘의 브리핑을 만드세요. 데이터에 없는 수치·트렌드를 절대 지어내지 마세요.
- channel_note: 내 채널 현황에서 실제로 읽히는 한 줄 (어떤 영상이 잘됐는지, 패턴/공백). 데이터 근거 필수.
- trends: 이 채널 주제에서 지금 뜨는 흐름 3개. title + why.
- today_pick: 오늘 만들면 좋을 영상 1개. title, angle, hook.
- weekly: 이번 주 밀어볼 방향 한 줄.
- similar_hit: 비슷한 주제에서 잘 터진 실제 영상 1개. title, why, source.
- crossover_hit: 컨셉·분야는 다르지만 크게 터진 실제 영상 1개 — 그 패턴을 이 채널에 어떻게 옮길지. title, why, source.
클리셰·이모지 없이. 아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"channel_note":"...","trends":[{"title":"...","why":"..."}],"today_pick":{"title":"...","angle":"...","hook":"..."},"weekly":"...","similar_hit":{"title":"...","why":"...","source":"..."},"crossover_hit":{"title":"...","why":"...","source":"..."}}`;

function parseChannel(url) {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean);
    if (p[0]?.startsWith("@")) return `forHandle=${encodeURIComponent(p[0])}`;
    if (p[0] === "channel") return `id=${p[1]}`;
    return null;
  } catch { return null; }
}
async function resolveChannel(url) {
  const q = parseChannel(url);
  if (!q) return null;
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&${q}&key=${YT}`)).json();
  const c = j.items?.[0];
  if (!c) return null;
  return { title: c.snippet.title, subs: +(c.statistics.subscriberCount || 0), videoCount: +(c.statistics.videoCount || 0), uploads: c.contentDetails.relatedPlaylists.uploads };
}
async function getRecentUploads(uploadsId) {
  const pl = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=6&playlistId=${uploadsId}&key=${YT}`)).json();
  const ids = (pl.items || []).map((i) => i.contentDetails.videoId).join(",");
  if (!ids) return [];
  const v = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${YT}`)).json();
  return (v.items || []).map((x) => ({ title: x.snippet.title, views: +(x.statistics.viewCount || 0), date: x.snippet.publishedAt }));
}
async function getTrends(niche) {
  const after = new Date(Date.now() - 14 * 864e5).toISOString();
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=10&publishedAfter=${after}&relevanceLanguage=ko&regionCode=KR&q=${encodeURIComponent(niche)}&key=${YT}`;
  const j = await (await fetch(url)).json();
  return (j.items || []).map((it) => ({ title: it.snippet.title, channel: it.snippet.channelTitle }));
}
function parseJson(t) { const s = t.indexOf("{"), e = t.lastIndexOf("}"); if (s < 0 || e <= s) return null; try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; } }

async function buildBriefing(p, cs, recent, trends) {
  const channelBlock = cs
    ? `채널: ${cs.title} · 구독자 ${cs.subs.toLocaleString()} · 영상 ${cs.videoCount}개\n최근 업로드:\n${recent.map((r) => `- ${r.title} (${r.views.toLocaleString()}회, ${r.date.slice(0, 10)})`).join("\n")}`
    : "(채널 현황 조회 실패)";
  const msg = await anthropic.messages.create({
    model: "claude-opus-4-8", max_tokens: 4096, system: SYSTEM,
    // 웹 검색으로 similar_hit·crossover_hit의 실제 영상·출처를 근거 있게 — 지어내기 방지(절대원칙 3)
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    messages: [{ role: "user", content: `[채널 프로필]\n니치: ${p.niche}\n톤: ${p.tone}\n목적: ${p.purpose}\n지향: ${p.aspiration || "(없음)"}\n\n[내 채널 현황 — 오늘 새로 읽음]\n${channelBlock}\n\n[니치 트렌드 데이터]\n${JSON.stringify(trends)}` }],
  });
  return parseJson(msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"));
}
async function sendEmail(to, b) {
  const trends = (b.trends || []).map((x) => `· ${x.title}`).join("<br>");
  const html = `<div style="font-family:sans-serif;max-width:520px">
    <h2 style="color:#4B43D6">오늘의 브리핑</h2>
    ${b.channel_note ? `<p style="color:#6B7180">${b.channel_note}</p>` : ""}
    <p><b>오늘 뜨는 흐름</b><br>${trends}</p>
    <p><b>오늘 만들 영상</b><br>${b.today_pick?.title || ""}<br><span style="color:#666">${b.today_pick?.angle || ""}</span></p>
    <p><b>이번 주 방향</b><br>${b.weekly || ""}</p>
    <p><a href="${process.env.SITE_URL}/today" style="color:#4B43D6">앱에서 전체 보기 →</a></p>
  </div>`;
  if (!process.env.RESEND_API_KEY) { console.warn("email skip: RESEND_API_KEY 없음"); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "나비 <today@theamov.com>", to, subject: "☀️ 오늘의 나비 브리핑", html }),
  });
  if (!res.ok) console.error("email fail:", res.status, await res.text().catch(() => ""));
}
async function sendPush(userId, b) {
  const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", userId);
  const payload = JSON.stringify({ title: "오늘의 브리핑이 도착했어요", body: b.today_pick?.title || "오늘 만들 영상 추천이 준비됐어요", url: `${process.env.SITE_URL}/today` });
  for (const row of subs || []) {
    try { await webpush.sendNotification(row.subscription, payload); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", row.id); }
  }
}

async function main() {
  const todayKST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const { data: users } = await sb.from("profiles").select("*").eq("briefing_enabled", true).not("channel_url", "is", null);
  for (const p of users || []) {
    try {
      const cs = await resolveChannel(p.channel_url);          // 매일 채널 새로 읽기
      const recent = cs ? await getRecentUploads(cs.uploads) : [];
      const trends = await getTrends(p.niche || cs?.title || "");
      const b = await buildBriefing(p, cs, recent, trends);
      if (!b) continue;
      await sb.from("briefings").upsert({ user_id: p.id, for_date: todayKST, content: b }, { onConflict: "user_id,for_date" });
      if (p.email_enabled && p.email) await sendEmail(p.email, b);
      if (p.push_enabled) await sendPush(p.id, b);
      console.log("sent:", p.id);
    } catch (e) { console.error("failed:", p.id, e?.message || e); }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
