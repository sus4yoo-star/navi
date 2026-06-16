import { useState } from "react";

// ===== 나비 (Navi) — AI 성장 PD =====
// 조용한 지능: 오프화이트 + 근검정 + 절제된 인디고. 데이터는 모노.

const C = {
  canvas: "#F4F5F7", card: "#FFFFFF", ink: "#15171C", sub: "#6B7180", faint: "#9AA0AC",
  line: "#E7E9EE", accent: "#4B43D6", accentTint: "#EEEDFB", accentInk: "#2E2895", live: "#1F9E6B",
};
const MODEL = "claude-sonnet-4-6";
const TONES = ["감성·스토리형", "정보·하우투형", "엔터·리액션형", "이슈·논쟁형", "일상·브이로그형"];
const PURPOSES = ["신규 유입 확장", "충성팬 심화"];

function extractText(d) { return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n"); }
function extractJson(raw) {
  if (!raw) return null;
  const t = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}
async function callClaude(system, user, useSearch) {
  const body = { model: MODEL, max_tokens: 4096, system, messages: [{ role: "user", content: user }] };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("API 오류 (" + r.status + ")");
  const j = extractJson(extractText(await r.json()));
  if (!j) throw new Error("결과를 읽지 못했어요. 다시 시도해 주세요.");
  return j;
}

const DETECT_SYSTEM = `당신은 '나비'입니다. 한국 1인 크리에이터를 돕는 AI 성장 PD입니다.
주어진 유튜브 채널 URL(과 핸들명)만 보고 이 채널의 '첫인상'을 가볍게 추정하세요. (실제 영상은 못 보므로 추정이며 사용자가 곧 확인·수정합니다.)
톤은 다음 중 하나: 감성·스토리형, 정보·하우투형, 엔터·리액션형, 이슈·논쟁형, 일상·브이로그형.
주력 목적: 신규 유입 확장 또는 충성팬 심화.
아래 JSON 하나만 출력. 그 외 텍스트·코드펜스 금지.
{"tone":"...","purpose":"...","summary":"채널 첫인상 한 줄","reason":"왜 그렇게 봤는지 한 줄"}`;
const PROD_SYSTEM = `당신은 '나비'입니다. 한국 크리에이터를 돕는 베테랑 PD입니다.
채널 프로필(톤·목적·지향)에 '맞춰서' 이번 영상의 쇼츠 구간과 패키징을 제안하세요. 톤이 감성형이면 감성형 제목·썸네일 카피를, 정보형이면 정보형으로 — 채널 색깔과 어긋나면 안 됩니다.
구체적으로, 클리셰·과장·이모지 없이. 아래 JSON 하나만 출력.
{"shorts":[{"cue":"CUE 01","hook":"...","reason":"...","title":"..."}],"titles":["..."],"thumbnails":[{"concept":"...","text":"..."}],"description":"...","tags":["..."],"next_ideas":["..."]}`;
const STRAT_SYSTEM = `당신은 '나비'입니다. 한국 크리에이터의 AI 성장 PD입니다.
채널 프로필과 이번 영상을 합쳐 '다음 14일' 성장 전략을 짜세요. 웹 검색으로 실제 유사 크리에이터 사례와 근거를 찾으세요. 검색을 먼저 한 뒤 마지막에 JSON 하나만 출력.
{"strategy":[{"point":"...","why":"..."}],"benchmarks":[{"name":"...","why":"...","evidence":"...","source":"..."}],"next_actions":["..."]}`;

function Wing({ size = 22 }) {
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 22 18" fill="none" aria-hidden="true">
      <polygon points="11,9 1.5,2.5 4,15.5" fill={C.accent} />
      <polygon points="11,9 20.5,2.5 18,15.5" fill={C.accent} opacity="0.5" />
    </svg>
  );
}

export default function Navi() {
  const [channelUrl, setChannelUrl] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectErr, setDetectErr] = useState("");
  const [proposed, setProposed] = useState(null);
  const [tone, setTone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [aspiration, setAspiration] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [videoUrl, setVideoUrl] = useState("");
  const [script, setScript] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [useSearch, setUseSearch] = useState(true);
  const [prod, setProd] = useState(null);
  const [strat, setStrat] = useState(null);
  const [lp, setLp] = useState(false);
  const [ls, setLs] = useState(false);
  const [ep, setEp] = useState("");
  const [es, setEs] = useState("");
  const busy = lp || ls;

  async function detect() {
    if (!channelUrl.trim()) { setDetectErr("내 채널 URL을 넣어주세요."); return; }
    setDetecting(true); setDetectErr(""); setProposed(null);
    try {
      const j = await callClaude(DETECT_SYSTEM, `채널 URL: ${channelUrl}`, false);
      setProposed({ summary: j.summary, reason: j.reason });
      setTone(TONES.includes(j.tone) ? j.tone : TONES[0]);
      setPurpose(PURPOSES.includes(j.purpose) ? j.purpose : PURPOSES[0]);
    } catch (e) { setDetectErr(e.message); } finally { setDetecting(false); }
  }
  function runAnalysis() {
    if (!script.trim()) { setEp("이번 영상의 스크립트나 주제를 넣어주세요."); return; }
    setProd(null); setStrat(null); setEp(""); setEs("");
    const profile = `채널 톤: ${tone}\n주력 목적: ${purpose}${aspiration ? `\n지향점: ${aspiration}` : ""}`;
    setLp(true);
    callClaude(PROD_SYSTEM, `[채널 프로필]\n${profile}\n\n[영상 URL]\n${videoUrl || "(없음)"}\n\n[이번 영상 스크립트/주제]\n${script}`, false)
      .then(setProd).catch((e) => setEp(e.message)).finally(() => setLp(false));
    setLs(true);
    callClaude(STRAT_SYSTEM, `[채널 프로필]\n${profile}\n\n[채널 단서]\n${channelUrl}\n\n[이번 영상]\n${script.slice(0, 400)}`, useSearch)
      .then(setStrat).catch((e) => setEs(e.message)).finally(() => setLs(false));
  }

  return (
    <div style={{ background: C.canvas, color: C.ink, minHeight: "100%", fontFamily: "-apple-system,'Apple SD Gothic Neo','Pretendard',sans-serif" }}>
      <style>{`
        .nv-mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-variant-numeric:tabular-nums}
        .nv-wrap{max-width:760px;margin:0 auto;padding:0 22px 48px}
        .nv-field{width:100%;box-sizing:border-box;background:${C.card};border:1px solid ${C.line};border-radius:9px;padding:12px 14px;font-size:14px;color:${C.ink};font-family:inherit;outline:none;transition:border-color .14s,box-shadow .14s}
        .nv-field::placeholder{color:${C.faint}}
        .nv-field:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accentTint}}
        .nv-label{font-size:12.5px;color:${C.sub};margin:0 0 6px;display:block}
        .nv-btn{background:${C.accent};color:#fff;border:none;border-radius:9px;padding:13px 16px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .14s,transform .05s;letter-spacing:-.01em}
        .nv-btn:hover:not(:disabled){opacity:.92}.nv-btn:active:not(:disabled){transform:translateY(1px)}.nv-btn:disabled{opacity:.4;cursor:default}
        .nv-ghost{background:transparent;border:1px solid ${C.line};color:${C.sub};border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;font-family:inherit;transition:all .14s}
        .nv-ghost:hover{border-color:${C.sub};color:${C.ink}}
        .nv-card{background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:20px 22px;margin-bottom:14px;box-shadow:0 1px 2px rgba(20,23,28,.03)}
        .nv-chip{display:inline-block;background:${C.card};border:1px solid ${C.line};border-radius:8px;padding:7px 12px;font-size:13px;margin:0 7px 7px 0;color:${C.sub};transition:all .12s}
        .nv-pick{cursor:pointer;user-select:none}
        .nv-pick.on{background:${C.accentTint};color:${C.accentInk};border-color:${C.accent}}
        .nv-tag{display:inline-block;background:${C.canvas};border:1px solid ${C.line};border-radius:7px;padding:5px 10px;font-size:12.5px;margin:0 6px 6px 0;color:${C.sub}}
        .nv-copy{background:transparent;border:none;color:${C.accent};font-size:12px;cursor:pointer;padding:2px 4px;font-family:inherit;font-weight:500}
        .nv-pulse{width:8px;height:8px;border-radius:50%;background:${C.accent};display:inline-block;animation:nvp 1.2s ease-in-out infinite}
        @keyframes nvp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}
        .nv-h{font-size:15px;font-weight:600;margin:0 0 10px;letter-spacing:-.01em}
        .nv-eyebrow{font-size:11px;letter-spacing:.16em;color:${C.faint};font-weight:500;text-transform:uppercase}
        .nv-step{display:flex;gap:8px;align-items:center;font-size:12px;color:${C.faint};margin:22px 0;letter-spacing:.02em}
        .nv-dot{width:5px;height:5px;border-radius:50%;background:${C.line}}
        .nv-dot.on{background:${C.accent}}
        .nv-row{padding:9px 0;border-top:1px solid ${C.line}}
        .nv-row.first{border-top:none}
      `}</style>

      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.card }}>
        <div className="nv-wrap" style={{ padding: "20px 22px 18px", display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
          <Wing />
          <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.02em" }}>나비</span>
          <span className="nv-mono" style={{ fontSize: 11.5, color: C.faint, marginLeft: 2 }}>채널을 읽고 · 영상을 다듬고 · 더 멀리 — AI 성장 PD</span>
        </div>
      </div>

      <div className="nv-wrap">
        <div className="nv-step">
          <span className={"nv-dot " + (!confirmed ? "on" : "")} /> 채널 읽기
          <span style={{ color: C.line }}>—</span>
          <span className={"nv-dot " + (proposed && !confirmed ? "on" : "")} /> 확인·수정
          <span style={{ color: C.line }}>—</span>
          <span className={"nv-dot " + (confirmed ? "on" : "")} /> 맞춤 분석
        </div>

        {!confirmed && (
          <>
            <div className="nv-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span className="nv-mono nv-eyebrow">step 1 · 채널 읽기</span>
                <button className="nv-ghost" onClick={() => setChannelUrl("https://youtube.com/@morning.routine")} disabled={detecting}>예시</button>
              </div>
              <label className="nv-label">내 채널 URL</label>
              <input className="nv-field" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} placeholder="https://youtube.com/@..." style={{ marginBottom: 16 }} />
              <button className="nv-btn" style={{ width: "100%" }} onClick={detect} disabled={detecting}>{detecting ? "나비가 읽는 중…" : "나비가 내 채널 읽기"}</button>
              {detectErr && <p style={{ color: C.accent, fontSize: 13, margin: "11px 0 0" }}>{detectErr}</p>}
              <p className="nv-mono" style={{ fontSize: 11, color: C.faint, margin: "11px 0 0" }}>* 실서비스에선 URL만 넣으면 실제 영상까지 자동 분석돼요.</p>
            </div>

            {proposed && (
              <div className="nv-card" style={{ background: "#FBFBFE", borderColor: C.accent }}>
                <span className="nv-mono nv-eyebrow">step 2 · 나비의 첫인상</span>
                <p style={{ fontSize: 17, fontWeight: 600, margin: "10px 0 5px", lineHeight: 1.45, letterSpacing: "-.01em" }}>{proposed.summary}</p>
                <p style={{ fontSize: 13, color: C.sub, margin: "0 0 18px", lineHeight: 1.6 }}>{proposed.reason}</p>

                <label className="nv-label">톤 — 맞으면 그대로, 아니면 바꿔주세요</label>
                <div style={{ marginBottom: 18 }}>{TONES.map((t) => <span key={t} className={"nv-chip nv-pick " + (tone === t ? "on" : "")} onClick={() => setTone(t)}>{t}</span>)}</div>
                <label className="nv-label">주력 목적</label>
                <div style={{ marginBottom: 18 }}>{PURPOSES.map((p) => <span key={p} className={"nv-chip nv-pick " + (purpose === p ? "on" : "")} onClick={() => setPurpose(p)}>{p}</span>)}</div>
                <label className="nv-label">앞으로 이렇게 가고 싶다 (선택)</label>
                <input className="nv-field" value={aspiration} onChange={(e) => setAspiration(e.target.value)} placeholder="예: 정보형인데 감성형도 섞고 싶다" style={{ marginBottom: 18 }} />
                <button className="nv-btn" style={{ width: "100%" }} onClick={() => tone && purpose && setConfirmed(true)}>이 프로필로 분석 시작</button>
              </div>
            )}
          </>
        )}

        {confirmed && (
          <>
            <div className="nv-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7 }}>
                <span className="nv-mono nv-eyebrow">profile</span><br />
                <b style={{ fontWeight: 600 }}>{tone}</b> · {purpose}{aspiration ? <span style={{ color: C.sub }}> · 지향: {aspiration}</span> : null}
              </div>
              <button className="nv-ghost" onClick={() => setConfirmed(false)} disabled={busy}>프로필 수정</button>
            </div>

            <div className="nv-card">
              <label className="nv-label">유튜브 영상 URL</label>
              <input className="nv-field" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." style={{ marginBottom: 7 }} />
              <p className="nv-mono" style={{ fontSize: 11, color: C.faint, margin: "0 0 15px" }}>* 실서비스에선 이 URL만으로 자동 추출돼요. 프로토타입은 아래에 내용을 붙여주세요.</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label className="nv-label" style={{ margin: 0 }}>영상 내용 (자막·스크립트·요약)</label>
                <button className="nv-ghost" onClick={() => setShowGuide(!showGuide)}>유튜브에서 가져오는 법</button>
              </div>
              {showGuide && (
                <div style={{ background: C.canvas, border: `1px solid ${C.line}`, borderRadius: 9, padding: "13px 15px", marginBottom: 11, fontSize: 13, color: C.sub, lineHeight: 1.7 }}>
                  <b style={{ color: C.ink, fontWeight: 600 }}>방법 1 · 스크립트 (제일 정확, 타임스탬프 포함)</b><br />
                  영상 설명란 <b style={{ color: C.ink }}>…더보기</b> → <b style={{ color: C.ink }}>스크립트 표시</b> → 전체 복사 → 붙여넣기
                  <span style={{ display: "block", height: 7 }} />
                  <b style={{ color: C.ink, fontWeight: 600 }}>방법 2 · Gemini 요약 (더 빠름)</b><br />
                  영상 우측 <b style={{ color: C.ink }}>"이 동영상에 대해 물어보세요"</b> 요약 복사 → 붙여넣기
                </div>
              )}
              <textarea className="nv-field" rows={5} value={script} onChange={(e) => setScript(e.target.value)} placeholder="유튜브 스크립트나 Gemini 요약을 붙여넣으세요." style={{ resize: "vertical", lineHeight: 1.55, marginBottom: 14 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.sub, marginBottom: 15, cursor: "pointer" }}>
                <input type="checkbox" checked={useSearch} onChange={(e) => setUseSearch(e.target.checked)} />벤치마크 웹 검색 포함 (근거 있는 사례)
              </label>
              <button className="nv-btn" style={{ width: "100%" }} onClick={runAnalysis} disabled={busy}>{busy ? "나비 분석 중…" : `${tone}에 맞춰 분석하기`}</button>
              {ep && <p style={{ color: C.accent, fontSize: 13, margin: "11px 0 0" }}>{ep}</p>}
            </div>

            {busy && (
              <div className="nv-mono" style={{ display: "flex", alignItems: "center", gap: 9, color: C.accent, fontSize: 12.5, margin: "4px 2px 16px", letterSpacing: ".04em" }}>
                <span className="nv-pulse" /> 프로필에 맞춰 분석 중
              </div>
            )}

            {(lp || prod) && (
              <div style={{ marginBottom: 24 }}>
                <div className="nv-mono nv-eyebrow" style={{ marginBottom: 11 }}>01 · 제작 — 채널 톤 맞춤</div>
                {lp && !prod && <Skel />}
                {prod && (
                  <>
                    {(prod.shorts || []).map((s, i) => (
                      <div className="nv-card" key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span className="nv-mono" style={{ fontSize: 12, color: C.accent, fontWeight: 600, letterSpacing: ".05em" }}>{s.cue || "CUE " + (i + 1)}</span>
                          <Copy text={s.hook} />
                        </div>
                        <p style={{ fontSize: 17, fontWeight: 600, margin: "0 0 7px", lineHeight: 1.4, letterSpacing: "-.01em" }}>"{s.hook}"</p>
                        <p style={{ fontSize: 13.5, color: C.sub, margin: "0 0 9px", lineHeight: 1.6 }}>{s.reason}</p>
                        <div style={{ fontSize: 13, color: C.sub }}><b style={{ color: C.ink, fontWeight: 600 }}>쇼츠 제목</b> · {s.title}</div>
                      </div>
                    ))}
                    <div className="nv-card">
                      <p className="nv-h">롱폼 제목 후보</p>
                      {(prod.titles || []).map((t, i) => (
                        <div key={i} className={"nv-row " + (i ? "" : "first")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 14.5 }}>{t}</span><Copy text={t} />
                        </div>
                      ))}
                    </div>
                    <div className="nv-card">
                      <p className="nv-h">썸네일 컨셉</p>
                      {(prod.thumbnails || []).map((t, i) => (
                        <div key={i} className={"nv-row " + (i ? "" : "first")}>
                          <div style={{ fontSize: 14, marginBottom: 3 }}>{t.concept}</div>
                          <div className="nv-mono" style={{ fontSize: 12.5, color: C.accent }}>카피: {t.text}</div>
                        </div>
                      ))}
                    </div>
                    <div className="nv-card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p className="nv-h" style={{ marginBottom: 9 }}>설명란 초안</p><Copy text={prod.description} />
                      </div>
                      <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0 }}>{prod.description}</p>
                    </div>
                    <div className="nv-card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <p className="nv-h" style={{ margin: 0 }}>태그</p><Copy text={(prod.tags || []).join(", ")} label="전체 복사" />
                      </div>
                      {(prod.tags || []).map((t, i) => <span className="nv-tag nv-mono" key={i}>{t}</span>)}
                    </div>
                    {prod.next_ideas && (
                      <div className="nv-card">
                        <p className="nv-h">다음 영상 아이디어</p>
                        {prod.next_ideas.map((t, i) => (
                          <div key={i} className={"nv-row " + (i ? "" : "first")} style={{ fontSize: 14, display: "flex", gap: 10 }}>
                            <span className="nv-mono" style={{ color: C.accent }}>{String(i + 1).padStart(2, "0")}</span>{t}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {(ls || strat || es) && (
              <div>
                <div className="nv-mono nv-eyebrow" style={{ marginBottom: 11 }}>02 · 다음 14일 전략 & 벤치마크</div>
                {es && <div className="nv-card" style={{ borderColor: C.accent, color: C.accent }}>{es}</div>}
                {ls && !strat && <Skel />}
                {strat && (
                  <>
                    <div className="nv-card">
                      <p className="nv-h">성장 전략</p>
                      {(strat.strategy || []).map((s, i) => (
                        <div key={i} className={"nv-row " + (i ? "" : "first")}>
                          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 3 }}>{s.point}</div>
                          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>{s.why}</div>
                        </div>
                      ))}
                    </div>
                    <div className="nv-card">
                      <p className="nv-h">벤치마크 · 근거 있는 사례</p>
                      {(strat.benchmarks || []).map((b, i) => (
                        <div key={i} className={"nv-row " + (i ? "" : "first")}>
                          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{b.name}</div>
                          <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6, margin: "3px 0" }}>{b.why}</div>
                          {b.evidence && <div className="nv-mono" style={{ fontSize: 12, color: C.live, lineHeight: 1.5 }}>근거 · {b.evidence}</div>}
                          {b.source && <div className="nv-mono" style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>출처 · {b.source}</div>}
                        </div>
                      ))}
                    </div>
                    {strat.next_actions && (
                      <div className="nv-card">
                        <p className="nv-h">이번 주에 할 일</p>
                        {strat.next_actions.map((t, i) => (
                          <div key={i} className={"nv-row " + (i ? "" : "first")} style={{ fontSize: 14, display: "flex", gap: 10 }}>
                            <span style={{ color: C.accent }}>□</span>{t}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Copy({ text, label }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button className="nv-copy" onClick={() => { try { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch {} }}>
      {done ? "복사됨" : label || "복사"}
    </button>
  );
}
function Skel() {
  return (
    <div className="nv-card">
      {[88, 64, 76].map((w, i) => (
        <div key={i} style={{ height: 11, width: w + "%", background: "#ECEEF2", borderRadius: 6, margin: "9px 0" }} />
      ))}
    </div>
  );
}
