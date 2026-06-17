// app/ambient.tsx — 전역 앰비언트 배경
// 무한한 영감: 잔잔히 흐르는 인디고 오로라 + 천천히 떠오르는 나비 날개.
// 순수 CSS/SVG(고정·pointer-events 없음·prefers-reduced-motion 존중). 콘텐츠 뒤(z-index:-1).

const WINGS = [
  { left: "8%", delay: "0s", dur: "27s", size: 16, op: 0.1 },
  { left: "23%", delay: "9s", dur: "33s", size: 22, op: 0.08 },
  { left: "45%", delay: "3.5s", dur: "29s", size: 14, op: 0.12 },
  { left: "64%", delay: "13s", dur: "35s", size: 26, op: 0.07 },
  { left: "81%", delay: "6s", dur: "31s", size: 18, op: 0.1 },
  { left: "92%", delay: "17s", dur: "37s", size: 20, op: 0.08 },
];

export default function Ambient() {
  return (
    <div className="nv-ambient" aria-hidden="true">
      <span className="nv-aurora a1" />
      <span className="nv-aurora a2" />
      <span className="nv-aurora a3" />
      {WINGS.map((w, i) => (
        <span
          key={i}
          className="nv-fly"
          style={{
            left: w.left,
            animationDelay: w.delay,
            animationDuration: w.dur,
            ["--op" as string]: String(w.op),
          }}
        >
          <svg width={w.size} height={w.size * 0.82} viewBox="0 0 22 18" fill="none">
            <polygon points="11,9 1.5,2.5 4,15.5" fill="#4B43D6" />
            <polygon points="11,9 20.5,2.5 18,15.5" fill="#4B43D6" opacity="0.5" />
          </svg>
        </span>
      ))}
    </div>
  );
}
