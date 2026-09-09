/**
 * 주말 글자색. 일요일 빨강, 토요일 파랑.
 * 평일이면 빈 문자열을 돌려주므로 호출부에서 기본색을 이어 붙이면 된다.
 */
export function weekendTone(weekday: number): string {
  if (weekday === 0) return "text-red-600 dark:text-red-400";
  if (weekday === 6) return "text-blue-600 dark:text-blue-400";
  return "";
}

/**
 * 주말 칸 배경색 클래스. 평일이면 빈 문자열.
 * variant="soft" 는 주간 보기처럼 넓게 칠해지는 곳에 쓰는 연한 색.
 * Tailwind 배경 유틸리티와 섞으면 우선순위가 불안정해서 전용 클래스를 쓴다.
 */
export function weekendCell(weekday: number, variant: "default" | "soft" = "default"): string {
  const suffix = variant === "soft" ? "-soft" : "";
  if (weekday === 0) return `cell-sun${suffix}`;
  if (weekday === 6) return `cell-sat${suffix}`;
  return "";
}
