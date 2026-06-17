// lib/ui.tsx — 나비 디자인 시스템 (다크 네온 에너지)
// 딥 잉크 블랙 + 인디고→바이올렛→코랄 네온 그라데이션. 글래스 카드. 살아있는 모션.
// 컨셉: 크리에이터에게 무한한 영감을.

export const C = {
  canvas: "#08080F", // 딥 잉크 블랙
  card: "rgba(255,255,255,0.045)", // 글래스
  ink: "#F3F4FB", // 본문(near-white)
  sub: "#A7ABC4", // 보조
  faint: "#6B6F89", // 흐림
  line: "rgba(255,255,255,0.10)", // 반투명 보더
  accent: "#6D5DF6", // 인디고-바이올렛
  accent2: "#9B5DE5", // 바이올렛
  accent3: "#FF5D8F", // 코랄
  accentTint: "rgba(109,93,246,0.16)",
  accentInk: "#CFC8FF", // 틴트 위 텍스트(밝게)
  live: "#36E0A0", // 네온 그린
};

// 브랜드 네온 그라데이션
export const GRAD = "linear-gradient(100deg,#6D5DF6 0%,#9B5DE5 48%,#FF5D8F 100%)";
export const GRAD_SOFT = "linear-gradient(135deg,rgba(109,93,246,.22),rgba(255,93,143,.16))";

// 두 날개 마크 — 네온 그라데이션
export function Wing({ size = 22 }: { size?: number }) {
  const id = `wg${Math.round(size * 100)}`;
  return (
    <svg
      width={size}
      height={size * 0.82}
      viewBox="0 0 22 18"
      fill="none"
      aria-hidden="true"
      style={{ filter: "drop-shadow(0 0 6px rgba(123,93,230,.55))" }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="22" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D5DF6" />
          <stop offset="0.55" stopColor="#9B5DE5" />
          <stop offset="1" stopColor="#FF5D8F" />
        </linearGradient>
      </defs>
      <polygon points="11,9 1.5,2.5 4,15.5" fill={`url(#${id})`} />
      <polygon points="11,9 20.5,2.5 18,15.5" fill={`url(#${id})`} opacity="0.55" />
    </svg>
  );
}
