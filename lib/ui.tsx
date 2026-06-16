// lib/ui.tsx — 나비 공유 디자인 토큰 + 두 날개 마크
// 오프화이트 + 근검정 + 인디고 한 점. 데이터·라벨은 모노. 미니멀.

export const C = {
  canvas: "#F4F5F7",
  card: "#FFFFFF",
  ink: "#15171C",
  sub: "#6B7180",
  faint: "#9AA0AC",
  line: "#E7E9EE",
  accent: "#4B43D6",
  accentTint: "#EEEDFB",
  accentInk: "#2E2895",
  live: "#1F9E6B",
};

export function Wing({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.82}
      viewBox="0 0 22 18"
      fill="none"
      aria-hidden="true"
    >
      <polygon points="11,9 1.5,2.5 4,15.5" fill={C.accent} />
      <polygon points="11,9 20.5,2.5 18,15.5" fill={C.accent} opacity="0.5" />
    </svg>
  );
}
