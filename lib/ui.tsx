// lib/ui.tsx — 나비 디자인 시스템 (밝은 에디토리얼)
// 따뜻한 오프화이트 + 인디고 한 점 + 아주 옅은 그라데이션. 세리프 헤드라인. 잔잔한 모션.
// 컨셉: 크리에이터에게 무한한 영감을.

export const C = {
  canvas: "#F6F5F2", // 따뜻한 오프화이트
  card: "#FFFFFF",
  ink: "#1A1A20", // 근검정(따뜻하게)
  sub: "#6B6B75",
  faint: "#A2A2AC",
  line: "#E9E6DF", // 따뜻한 옅은 보더
  accent: "#4B43D6", // 인디고 한 점
  accent2: "#7A5AF0", // 바이올렛(그라데이션 보조)
  accent3: "#7A5AF0",
  accentTint: "#EFEDFB", // 옅은 라벤더
  accentInk: "#3A33B0", // 틴트 위 텍스트
  live: "#1F9E6B", // 차분한 그린
};

// 절제된 인디고→바이올렛 그라데이션 (아주 옅게, 강조에만)
export const GRAD = "linear-gradient(100deg,#4B43D6 0%,#7A5AF0 100%)";
export const GRAD_SOFT = "linear-gradient(135deg,#F3F1FE 0%,#FBFAFE 100%)";

// 두 날개 마크 — 인디고 그라데이션, 잔잔한 그림자
export function Wing({ size = 22 }: { size?: number }) {
  const id = `wg${Math.round(size * 100)}`;
  return (
    <svg
      width={size}
      height={size * 0.82}
      viewBox="0 0 22 18"
      fill="none"
      aria-hidden="true"
      style={{ filter: "drop-shadow(0 1px 3px rgba(75,67,214,.22))" }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="22" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4B43D6" />
          <stop offset="1" stopColor="#7A5AF0" />
        </linearGradient>
      </defs>
      <polygon points="11,9 1.5,2.5 4,15.5" fill={`url(#${id})`} />
      <polygon points="11,9 20.5,2.5 18,15.5" fill={`url(#${id})`} opacity="0.5" />
    </svg>
  );
}
