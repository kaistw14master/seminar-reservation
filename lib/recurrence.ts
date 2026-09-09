import { dateKey, dateKeyOfDayStart, partsInZone, weekStartKey, zonedTime } from "./time";

export type RecurrenceRule = {
  /** 1=매주, 2=격주, 3=3주마다, 4=4주마다 */
  intervalWeeks: number;
  /** 0=일 ... 6=토 */
  weekdays: number[];
  /** 반복 종료 날짜 (이 날짜까지 포함), "2026-11-25" */
  until: string;
};

export type Occurrence = { startsAt: Date; endsAt: Date };

/** 한 번에 만들 수 있는 최대 회차 */
export const MAX_OCCURRENCES = 60;

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 요일(0=일)을 월요일 기준 주 안의 위치(월=0 … 일=6)로 */
function offsetFromMonday(weekday: number): number {
  return (weekday + 6) % 7;
}

export class RecurrenceError extends Error {}

export function normalizeRule(raw: unknown): RecurrenceRule {
  const rule = raw as Partial<RecurrenceRule> | null | undefined;
  const intervalWeeks = Number(rule?.intervalWeeks);
  if (![1, 2, 3, 4].includes(intervalWeeks)) {
    throw new RecurrenceError("반복 주기는 매주·격주·3주·4주 중에서 선택해 주세요.");
  }

  const weekdays = Array.from(
    new Set((Array.isArray(rule?.weekdays) ? rule.weekdays : []).map(Number)),
  )
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b); // 일요일부터
  if (weekdays.length === 0) {
    throw new RecurrenceError("반복할 요일을 하나 이상 선택해 주세요.");
  }

  const until = String(rule?.until ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    throw new RecurrenceError("반복 종료 날짜를 선택해 주세요.");
  }

  return { intervalWeeks, weekdays, until };
}

/**
 * 시작 시각의 "시:분"을 유지한 채 규칙에 맞는 모든 회차를 펼친다.
 * 첫 회차의 날짜가 선택한 요일이 아니어도, 그 날짜가 속한 주부터 규칙대로 생성된다.
 */
export function expandOccurrences(
  startsAt: Date,
  endsAt: Date,
  rule: RecurrenceRule,
): Occurrence[] {
  const start = partsInZone(startsAt);
  const end = partsInZone(endsAt);
  const firstKey = dateKey(startsAt);

  if (rule.until < firstKey) {
    throw new RecurrenceError("반복 종료 날짜가 시작 날짜보다 앞설 수 없습니다.");
  }

  const occurrences: Occurrence[] = [];
  // offsetFromMonday 와 짝을 이루므로 앵커는 반드시 월요일이어야 한다 (화면 기준과 무관)
  const anchor = weekStartKey(startsAt, 1);

  for (let week = 0; ; week += rule.intervalWeeks) {
    const weekStart = dateKeyOfDayStart(anchor, week * 7);
    // 이 주의 월요일이 이미 종료일을 넘었으면 끝
    if (weekStart > rule.until) break;

    for (const weekday of rule.weekdays) {
      const key = dateKeyOfDayStart(weekStart, offsetFromMonday(weekday));
      if (key < firstKey || key > rule.until) continue;

      const [y, mo, d] = key.split("-").map(Number);
      occurrences.push({
        startsAt: zonedTime(y, mo, d, start.hour, start.minute),
        endsAt: zonedTime(y, mo, d, end.hour, end.minute),
      });
    }

    if (occurrences.length > MAX_OCCURRENCES) {
      throw new RecurrenceError(
        `한 번에 만들 수 있는 반복 예약은 최대 ${MAX_OCCURRENCES}회입니다. 종료 날짜를 앞당겨 주세요.`,
      );
    }
  }

  if (occurrences.length === 0) {
    throw new RecurrenceError("조건에 맞는 날짜가 없습니다. 요일과 종료 날짜를 확인해 주세요.");
  }

  occurrences.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return occurrences;
}

/** "매주 월·수 · 총 12회" 같은 요약 문구 */
export function describeRule(rule: RecurrenceRule, count: number): string {
  const interval =
    rule.intervalWeeks === 1
      ? "매주"
      : rule.intervalWeeks === 2
        ? "격주"
        : `${rule.intervalWeeks}주마다`;
  const days = rule.weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join("·");
  return `${interval} ${days} · 총 ${count}회`;
}
