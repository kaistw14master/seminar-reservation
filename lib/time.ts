export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Seoul";

export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

type Parts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=일
};

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** 지정 타임존 기준으로 분해된 날짜/시각 */
export function partsInZone(date: Date): Parts {
  const map: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAYS[map.weekday] ?? 0,
  };
}

function offsetMs(date: Date): number {
  const p = partsInZone(date);
  const secondMatch = partsFormatter
    .formatToParts(date)
    .find((part) => part.type === "second");
  const asIfUtc = Date.UTC(
    p.year, p.month - 1, p.day, p.hour, p.minute, Number(secondMatch?.value ?? 0),
  );
  return asIfUtc - date.getTime();
}

/** 타임존 기준 벽시계 시각 -> 실제 UTC 시점 */
export function zonedTime(
  year: number, month: number, day: number, hour = 0, minute = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = offsetMs(new Date(guess));
  const adjusted = new Date(guess - firstOffset);
  // DST 경계 보정을 위해 한 번 더 계산
  return new Date(guess - offsetMs(adjusted));
}

/** "2026-09-09" (타임존 기준) */
export function dateKey(date: Date): string {
  const p = partsInZone(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "14:30" (타임존 기준) */
export function timeLabel(date: Date): string {
  const p = partsInZone(date);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** "2026-09-09" -> 그 날 00:00 의 UTC 시점 */
export function dayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return zonedTime(y, m, d, 0, 0);
}

export function dateKeyOfDayStart(key: string, offsetDays: number): string {
  return dateKey(new Date(dayStart(key).getTime() + offsetDays * DAY + 12 * 60 * MINUTE));
}

/**
 * 해당 날짜가 속한 주의 시작 날짜키.
 * startsOn: 1=월요일 시작(주간 보기), 0=일요일 시작(월간 달력)
 */
export function weekStartKey(date: Date, startsOn: 0 | 1 = 1): string {
  const p = partsInZone(date);
  const delta = startsOn === 1 ? (p.weekday === 0 ? -6 : 1 - p.weekday) : -p.weekday;
  return dateKeyOfDayStart(dateKey(date), delta);
}

/** 주 시작일부터 7일간의 날짜키 */
export function weekDayKeys(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => dateKeyOfDayStart(weekStart, i));
}

/** "2026-09" (타임존 기준) */
export function monthKeyOf(date: Date): string {
  const p = partsInZone(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** 월 달력에 표시할 날짜키 목록 (앞뒤 주를 채워 항상 일요일~토요일로 떨어진다) */
export function monthGridKeys(key: string): string[] {
  const firstOfMonth = `${key}-01`;
  const start = weekStartKey(dayStart(firstOfMonth), 0);
  const lastOfMonth = dateKeyOfDayStart(`${shiftMonth(key, 1)}-01`, -1);
  const end = dateKeyOfDayStart(weekStartKey(dayStart(lastOfMonth), 0), 6);

  const keys: string[] = [];
  for (let cursor = start; cursor <= end; cursor = dateKeyOfDayStart(cursor, 1)) {
    keys.push(cursor);
    if (keys.length > 42) break; // 안전장치: 달력은 최대 6주
  }
  return keys;
}

/**
 * 날짜키를 개월 단위로 옮긴다. 옮긴 달에 그 날짜가 없으면 말일로 맞춘다.
 * (1월 31일 + 1개월 = 2월 28일)
 */
export function addMonthsToDateKey(key: string, delta: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const monthKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  const lastDay = Number(dateKeyOfDayStart(`${shiftMonth(monthKey, 1)}-01`, -1).split("-")[2]);
  return `${monthKey}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function formatMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${year}년 ${month}월`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MINUTE);
}

export function formatDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = partsInZone(zonedTime(y, m, d, 12)).weekday;
  return `${m}월 ${d}일 (${DAY_LABELS[weekday]})`;
}

export function formatRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const head = `${formatDateKey(dateKey(start))} ${timeLabel(start)}`;
  return dateKey(start) === dateKey(end)
    ? `${head} ~ ${timeLabel(end)}`
    : `${head} ~ ${formatDateKey(dateKey(end))} ${timeLabel(end)}`;
}

/** <input type="datetime-local"> 값 (타임존 기준 벽시계) */
export function toLocalInput(date: Date): string {
  return `${dateKey(date)}T${timeLabel(date)}`;
}

/** <input type="datetime-local"> 값 -> UTC 시점 (타임존 기준으로 해석) */
export function fromLocalInput(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return new Date(NaN);
  const [, y, m, d, h, min] = match;
  return zonedTime(Number(y), Number(m), Number(d), Number(h), Number(min));
}
