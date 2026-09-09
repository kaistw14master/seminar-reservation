/**
 * 주말 글자색. 일요일 빨강, 토요일 파랑.
 * 평일이면 빈 문자열을 돌려주므로 호출부에서 기본색을 이어 붙이면 된다.
 */
export function weekendTone(weekday: number): string {
  if (weekday === 0) return "text-red-600 dark:text-red-400";
  if (weekday === 6) return "text-blue-600 dark:text-blue-400";
  return "";
}
