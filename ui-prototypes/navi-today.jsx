import { useState, useEffect } from "react";

// ===== 나비 · 오늘의 브리핑 (자동·무설정) =====
// 채널은 가입 때 한 번 연결. 이후 화면을 열면 오늘 브리핑이 그냥 떠 있음.
// 실서비스: 매일 크론이 채널을 새로 분석해 만든 브리핑을 Supabase에서 읽어옴.
// 데모: 연결된 채널을 가정하고 열리자마자 Claude로 즉석 생성.

const C = {
  canvas: "#F4F5F7", card: "#FFFFFF", ink: "#15171C", sub: "#6B7180", faint: "#9AA0AC",
  line: "#E7E9EE", accent: "#4B43D6", accentTint: "#EEEDFB", accentInk: "#2E2895", live: "#1F9E6B",
};
function Wing({ size = 22 }) {
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 22 18" fill="none" aria-hidden="true">
      <polygon points="11,9 1.5,2.5 4,15.5" fill={C.accent} />
      <polygon points="11,9 20.5,2.5 18,15.5" fill={C.accent} opacity="0.5" />
    </svg>
  );
}
const SYSTEM = `당신은 '나비'입니다. 한국 1인 크리에이터의 AI 성장 PD입니다.
연결된 채널을 바탕으로 '오늘의 브리핑'을 만드세요. 웹 검색으로 그 주제에서 최근 실제로 뜨는 것·잘된 영상을 먼저 찾고 근거로 쓰세요. 추측한 트렌드·수치는 쓰지 마세요.
- trends: 이 채널 주제에서 지금 뜨는 흐름 3개. title + why.
- today_pick: 오늘 만들면 좋을 영상 1개. title, angle, hook(첫 3초).
- weekly: 이번 주 밀어볼 방향 한 줄.
- similar_hit: 비슷한 주제에서 잘 터진 실제 영상 1개. title, why(배울 점), source.
- crossover_hit: 컨셉·분야는 다르지만 크게 터진 실제 영상 1개 — 그 패턴을 이 채널에 어떻게 옮길지. title, why, source.
클리셰·이모지 없이. 마지막에 아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"trends":[{"title":"...","why":"..."}],"today_pick":{"title":"...","angle":"...","hook":"..."},"weekly":"...","similar_hit":{"title":"...","why":"...","source":"..."},"crossover_hit":{"title":"...","why":"...","source":"..."}}`;

function extractText(d) { return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n"); }
function extractJson(raw) {
  if (!raw) return null;
  const t = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}
const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });

export default function NaviToday() {
  // 한 번 연결해두면 끝 (데모 기본값)
  const [channelName, setChannelName] = useState("새빛교회");
  const [niche, setNiche] = useState("신앙 간증·메시지 영상");
  const [tone, setTone] = useState("감성·스토리형");
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [b, setB] = useState(null);

  async function run() {
    setLoading(true); setErr(""); setB(null);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 4096, system: SYSTEM,
          messages: [{ role: "user", content: `연결된 채널: ${channelName}\n주제/니치: ${niche}\n톤: ${tone}\n오늘: ${today}` }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      if (!r.ok) throw new Error("API 오류 (" + r.status + ")");
      const j = extractJson(extractText(await r.json()));
      if (!j) throw new Error("브리핑을 만들지 못했어요.");
      setB(j);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { run(); }, []); // 열면 알아서 — 입력·버튼 없음

  const Insp = ({ label, x }) => x ? (
    <div className="nv-card">
      <span className="nv-mono nv-eyebrow">{label}</span>
      <p style={{ fontSize: 14.5, fontWeight: 600, margin: "9px 0 4px" }}>{x.title}</p>
      <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, margin: 0 }}>{x.why}</p>
      {x.source && <p className="nv-mono" style={{ fontSize: 11.5, color: C.faint, margin: "5px 0 0" }}>출처 · {x.source}</p>}
    </div>
  ) : null;

  return (
    <div style={{ background: C.canvas, color: C.ink, minHeight: "100%", fontFamily: "-apple-system,'Apple SD Gothic Neo','Pretendard',sans-serif" }}>
      <style>{`
        .nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
        .nv-wrap{max-width:680px;margin:0 auto;padding:0 22px 48px}
        .nv-field{width:100%;box-sizing:border-box;background:${C.card};border:1px solid ${C.line};border-radius:9px;padding:10px 13px;font-size:14px;color:${C.ink};font-family:inherit;outline:none}
        .nv-field:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
        .nv-btn{background:${C.accent};color:#fff;border:none;border-radius:9px;padding:11px 15px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
        .nv-link{background:none;border:none;color:${C.sub};font-size:12.5px;cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px}
        .nv-card{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:18px 20px;margin-bottom:13px;box-shadow:0 1px 2px rgba(20,23,28,.03)}
        .nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:500;text-transform:uppercase}
        .nv-chip{display:inline-flex;align-items:center;gap:7px;background:${C.accentTint};color:${C.accentInk};border-radius:999px;padding:5px 11px;font-size:12.5px;font-weight:500}
        .nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
        @keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
        .nv-row{padding:10px 0;border-top:1px solid ${C.line}}
        .nv-row.first{border-top:none}
      `}</style>

      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.card }}>
        <div className="nv-wrap" style={{ padding: "20px 22px 18px", display: "flex", alignItems: "center", gap: 11 }}>
          <Wing /><span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.02em" }}>나비</span>
          <span className="nv-mono" style={{ fontSize: 11.5, color: C.faint, marginLeft: "auto" }}>{today}</span>
        </div>
      </div>

      <div className="nv-wrap" style={{ paddingTop: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", margin: "0 0 4px" }}>오늘의 브리핑</h1>
        <p style={{ fontSize: 14, color: C.sub, margin: "0 0 14px", lineHeight: 1.6 }}>매일 아침, 나비가 네 채널을 새로 읽고 오늘 뭘 만들지 정해와요.</p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <span className="nv-chip"><Wing size={14} /> {channelName} · {tone}</span>
          <button className="nv-link" onClick={() => setShowSettings(!showSettings)}>설정</button>
        </div>

        {showSettings && (
          <div className="nv-card">
            <span className="nv-mono nv-eyebrow">연결된 채널 (한 번만 설정)</span>
            <div style={{ display: "grid", gap: 9, marginTop: 11 }}>
              <input className="nv-field" value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="채널명" />
              <input className="nv-field" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="주제/니치" />
              <input className="nv-field" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="톤" />
            </div>
            <button className="nv-btn" style={{ marginTop: 11 }} onClick={() => { setShowSettings(false); run(); }}>저장하고 다시 받기</button>
          </div>
        )}

        {loading && (
          <div className="nv-mono" style={{ display: "flex", alignItems: "center", gap: 9, color: C.accent, fontSize: 12.5, margin: "4px 2px 14px", letterSpacing: ".04em" }}>
            <span className="nv-pulse" /> 채널 읽고 시장 확인 중
          </div>
        )}
        {err && (
          <div className="nv-card" style={{ borderColor: C.accent }}>
            <p style={{ color: C.accent, fontSize: 13.5, margin: "0 0 10px" }}>{err}</p>
            <button className="nv-btn" onClick={run}>다시 받기</button>
          </div>
        )}

        {b && (
          <>
            <div className="nv-card">
              <span className="nv-mono nv-eyebrow">오늘 뜨는 흐름</span>
              <div style={{ marginTop: 4 }}>
                {(b.trends || []).map((t, i) => (
                  <div key={i} className={"nv-row " + (i ? "" : "first")}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, marginTop: 2 }}>{t.why}</div>
                  </div>
                ))}
              </div>
            </div>

            {b.today_pick && (
              <div className="nv-card" style={{ background: "#FBFBFE", borderColor: C.accent }}>
                <span className="nv-mono nv-eyebrow" style={{ color: C.accent }}>오늘 만들 영상</span>
                <p style={{ fontSize: 18, fontWeight: 600, margin: "9px 0 7px", lineHeight: 1.4, letterSpacing: "-.01em" }}>{b.today_pick.title}</p>
                <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, margin: "0 0 7px" }}>{b.today_pick.angle}</p>
                <div className="nv-mono" style={{ fontSize: 12.5, color: C.accentInk, background: C.accentTint, borderRadius: 7, padding: "8px 11px", lineHeight: 1.5 }}>첫 3초 · {b.today_pick.hook}</div>
              </div>
            )}

            <div className="nv-card">
              <span className="nv-mono nv-eyebrow">이번 주 방향</span>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: "9px 0 0" }}>{b.weekly}</p>
            </div>

            <Insp label="영감 · 비슷한 주제 잘된 영상" x={b.similar_hit} />
            <Insp label="영감 · 다른 분야 대박, 배울 패턴" x={b.crossover_hit} />
          </>
        )}
      </div>
    </div>
  );
}
