// scripts/briefing.mjs — GitHub Actions가 매일 실행하는 브리핑 엔진
// 실행: node scripts/briefing.mjs   (env는 워크플로우가 주입)
// 의존성: @supabase/supabase-js web-push
//
// 통일: 화면(/today)과 동일한 '통합 brief 엔진'을 그대로 호출한다.
//   1) SITE_URL/api/channel  → { channel, videos }
//   2) SITE_URL/api/brief/start → { id } (백그라운드)
//   3) SITE_URL/api/analyze/status?id= 폴링 → 통합 브리핑(판세·내위치·진단·기획·전략·할일)
//   4) briefings 저장 + 이메일 + 웹푸시
// → 로직 중복 없이 라이브와 100% 동일.

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
webpush.setVapidDetails("mailto:hello@theamov.com", process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
const SITE = (process.env.SITE_URL || "").replace(/\/$/, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function postJSON(path, body) {
  const r = await fetch(`${SITE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => null);
}

// 라이브 brief 엔진 호출 → 통합 브리핑 한 덩이
async function buildBrief(profile) {
  if (!SITE) throw new Error("SITE_URL 미설정");
  const base = await postJSON("/api/channel", { channelUrl: profile.channel_url });
  if (!base?.channel) return null;
  const started = await postJSON("/api/brief/start", {
    channel: base.channel,
    videos: base.videos || [],
    niche: profile.niche,
    tone: profile.tone,
    purpose: profile.purpose,
    aspiration: profile.aspiration,
  });
  if (!started?.id) return null;

  const deadline = Date.now() + 4 * 60 * 1000; // 최대 4분 폴링
  while (Date.now() < deadline) {
    await sleep(4000);
    const j = await (await fetch(`${SITE}/api/analyze/status?id=${started.id}`)).json().catch(() => null);
    if (!j) continue;
    if (j.status === "done") return j.analysis;
    if (j.status === "error") throw new Error(j.error || "브리핑 생성 실패");
  }
  throw new Error("브리핑 시간 초과");
}

// 통합 브리핑 → 이메일 HTML (오프화이트/인디고, 미니멀)
function emailHtml(b) {
  const ink = "#15171C", sub = "#6B7180", accent = "#4B43D6", line = "#E7E9EE";
  const sec = (title, inner) =>
    inner
      ? `<tr><td style="padding:18px 0 0"><div style="font:600 11px/1.4 -apple-system,sans-serif;letter-spacing:.12em;color:${sub};text-transform:uppercase">${title}</div>${inner}</td></tr>`
      : "";

  const landscape = b.landscape
    ? `<p style="margin:6px 0 0;color:${ink};font:400 14px/1.6 -apple-system,sans-serif">${esc(b.landscape)}</p>`
    : "";
  const position = b.position
    ? `<p style="margin:6px 0 0;color:${ink};font:400 14px/1.6 -apple-system,sans-serif">${esc(b.position)}</p>`
    : "";
  const peers = (b.cohort || [])
    .slice(0, 4)
    .map(
      (c) =>
        `<div style="margin:8px 0;padding-left:10px;border-left:3px solid ${accent}">
          <a href="${esc(c.url)}" style="color:${ink};font:700 14px/1.4 -apple-system,sans-serif;text-decoration:none">${esc(c.name)} ↗</a>
          <div style="color:${sub};font:400 12px/1.5 ui-monospace,monospace">평균조회 ${Number(c.avgViews || 0).toLocaleString()} · 최근60일 ${c.recent60 || 0}편</div>
          ${c.apply ? `<div style="color:${accent};font:600 13px/1.5 -apple-system,sans-serif;margin-top:3px">내 채널엔 · ${esc(c.apply)}</div>` : ""}
        </div>`
    )
    .join("");
  const diagnosis = (b.diagnosis || [])
    .slice(0, 3)
    .map(
      (d) =>
        `<div style="margin:7px 0"><div style="color:${ink};font:600 14px/1.5 -apple-system,sans-serif">${esc(d.point)}</div>${d.evidence ? `<div style="color:${sub};font:400 12px/1.5 ui-monospace,monospace">근거 · ${esc(d.evidence)}</div>` : ""}</div>`
    )
    .join("");
  const ideas = (b.ideas || [])
    .slice(0, 3)
    .map(
      (i) =>
        `<div style="margin:10px 0;padding:12px 14px;border:1px solid ${line};border-left:3px solid ${accent};border-radius:10px">
          <div style="color:${ink};font:700 15px/1.4 -apple-system,sans-serif">${esc(i.title)}</div>
          ${i.hook ? `<div style="color:${accent};font:600 12px/1.5 ui-monospace,monospace;margin-top:5px">첫 3초 · ${esc(i.hook)}</div>` : ""}
          ${i.why ? `<div style="color:${sub};font:400 13px/1.6 -apple-system,sans-serif;margin-top:5px">${esc(i.why)}</div>` : ""}
        </div>`
    )
    .join("");
  const strategy = (b.strategy || [])
    .slice(0, 3)
    .map((s) => `<li style="margin:4px 0;color:${ink};font:400 14px/1.6 -apple-system,sans-serif">${esc(s.point)}</li>`)
    .join("");
  const todo = (b.todo || [])
    .map((t) => `<li style="margin:4px 0;color:${ink};font:400 14px/1.6 -apple-system,sans-serif">${esc(t)}</li>`)
    .join("");

  return `<div style="background:#F4F5F7;padding:24px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${line};border-radius:16px;padding:26px 28px">
        <tr><td>
          <div style="font:800 22px/1.2 -apple-system,sans-serif;color:${ink};letter-spacing:-.02em">오늘의 브리핑</div>
          <div style="font:400 13px/1.5 -apple-system,sans-serif;color:${sub};margin-top:4px">바깥부터 보고, 내 위치와 만들 영상까지</div>
        </td></tr>
        ${sec("지금 판세", landscape)}
        ${sec("비슷한 채널은 지금", peers)}
        ${sec("내 위치", position)}
        ${sec("개선점", diagnosis)}
        ${sec("이번 주 만들 영상", ideas)}
        ${sec("전략", strategy ? `<ul style="margin:6px 0 0;padding-left:18px">${strategy}</ul>` : "")}
        ${sec("오늘부터 할 일", todo ? `<ul style="margin:6px 0 0;padding-left:18px">${todo}</ul>` : "")}
        <tr><td style="padding:22px 0 0">
          <a href="${SITE}/today" style="display:inline-block;background:${accent};color:#fff;font:600 14px -apple-system,sans-serif;text-decoration:none;padding:11px 20px;border-radius:10px">앱에서 전체 보기 →</a>
        </td></tr>
      </table>
    </td></tr></table>
  </div>`;
}

async function sendEmail(to, b) {
  if (!process.env.RESEND_API_KEY) return console.warn("email skip: RESEND_API_KEY 없음");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "나비 <today@theamov.com>", to, subject: "오늘의 나비 브리핑", html: emailHtml(b) }),
  });
  if (!res.ok) console.error("email fail:", res.status, await res.text().catch(() => ""));
}

async function sendPush(userId, b) {
  const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", userId);
  const payload = JSON.stringify({
    title: "오늘의 브리핑이 도착했어요",
    body: b.ideas?.[0]?.title || "이번 주 만들 영상과 전략이 준비됐어요",
    url: `${SITE}/today`,
  });
  for (const row of subs || []) {
    try {
      await webpush.sendNotification(row.subscription, payload);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", row.id);
    }
  }
}

async function main() {
  const todayKST = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

  const { data: users } = await sb
    .from("profiles")
    .select("*")
    .eq("briefing_enabled", true)
    .not("channel_url", "is", null);
  for (const p of users || []) {
    try {
      const b = await buildBrief(p);
      if (!b) continue;
      await sb.from("briefings").upsert({ user_id: p.id, for_date: todayKST, content: b }, { onConflict: "user_id,for_date" });
      if (p.email_enabled && p.email) await sendEmail(p.email, b);
      if (p.push_enabled) await sendPush(p.id, b);
      console.log("sent:", p.id);
    } catch (e) {
      console.error("failed:", p.id, e?.message || e);
    }
  }

  // 비로그인 매거진 구독자 — 이메일만
  const { data: subs } = await sb.from("subscribers").select("*");
  for (const s of subs || []) {
    try {
      const b = await buildBrief({ channel_url: s.channel_url, niche: s.niche });
      if (!b) continue;
      await sendEmail(s.email, b);
      console.log("sent(sub):", s.email);
    } catch (e) {
      console.error("failed(sub):", s.email, e?.message || e);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
