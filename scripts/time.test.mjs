import {
  dateKey, dayStart, weekStartKey, weekDayKeys, dateKeyOfDayStart,
  fromLocalInput, toLocalInput, timeLabel, partsInZone, formatRange, addMinutes,
  monthKeyOf, monthGridKeys, shiftMonth, formatMonth,
} from "../lib/time.ts";

const checks = [];
const eq = (label, actual, expected) =>
  checks.push([label, String(actual) === String(expected), actual, expected]);

// 2026-09-09 는 수요일 -> 그 주 월요일은 2026-09-07
eq("weekStartKey(수)", weekStartKey(new Date("2026-09-09T05:00:00Z")), "2026-09-07");
eq("weekStartKey(일)", weekStartKey(new Date("2026-09-13T05:00:00Z")), "2026-09-07");
// 한국시간 2026-09-13 08:00 = UTC 2026-09-12 23:00 (일요일) -> 월요일은 09-07
eq("weekStartKey(KST일요일 아침)", weekStartKey(new Date("2026-09-12T23:00:00Z")), "2026-09-07");

eq("weekDayKeys 마지막", weekDayKeys("2026-09-07")[6], "2026-09-13");
eq("월말 넘김", dateKeyOfDayStart("2026-09-30", 1), "2026-10-01");
eq("연말 넘김", dateKeyOfDayStart("2026-12-31", 1), "2027-01-01");
eq("이전 주", dateKeyOfDayStart("2026-01-05", -7), "2025-12-29");

// KST 자정 = 전날 15:00 UTC
eq("dayStart ISO", dayStart("2026-09-09").toISOString(), "2026-09-08T15:00:00.000Z");
eq("dateKey 왕복", dateKey(dayStart("2026-09-09")), "2026-09-09");
eq("timeLabel 자정", timeLabel(dayStart("2026-09-09")), "00:00");

// 슬롯 계산: 08:00 + 슬롯
const slot = addMinutes(dayStart("2026-09-09"), 8 * 60 + 3 * 30);
eq("슬롯 시각", timeLabel(slot), "09:30");
eq("슬롯 UTC", slot.toISOString(), "2026-09-09T00:30:00.000Z");

// datetime-local 왕복 (브라우저 로컬 타임존과 무관해야 함)
eq("fromLocalInput", fromLocalInput("2026-09-09T14:30").toISOString(), "2026-09-09T05:30:00.000Z");
eq("toLocalInput 왕복", toLocalInput(fromLocalInput("2026-09-09T14:30")), "2026-09-09T14:30");

eq("partsInZone weekday", partsInZone(new Date("2026-09-09T05:00:00Z")).weekday, 3);
eq("formatRange", formatRange("2026-09-09T05:30:00Z", "2026-09-09T07:00:00Z"), "9월 9일 (수) 14:30 ~ 16:00");

// --- 월 달력 ---
eq("monthKeyOf", monthKeyOf(new Date("2026-09-09T05:00:00Z")), "2026-09");
eq("monthKeyOf KST 경계", monthKeyOf(new Date("2026-08-31T16:00:00Z")), "2026-09");
eq("shiftMonth +1", shiftMonth("2026-09", 1), "2026-10");
eq("shiftMonth 연말 넘김", shiftMonth("2026-12", 1), "2027-01");
eq("shiftMonth -1 연초", shiftMonth("2027-01", -1), "2026-12");
eq("shiftMonth -13", shiftMonth("2027-01", -13), "2025-12");
{
  const grid = monthGridKeys("2026-09");
  eq("9월 그리드 7의 배수", grid.length % 7, 0);
  eq("9월 그리드 시작(월요일)", grid[0], "2026-08-31");
  eq("9월 1일 포함", grid.includes("2026-09-01"), true);
  eq("9월 30일 포함", grid.includes("2026-09-30"), true);
  eq("9월 그리드 끝(일요일)", grid.at(-1), "2026-10-04");
}
{
  const grid = monthGridKeys("2027-02");
  eq("2월 그리드 7의 배수", grid.length % 7, 0);
  eq("2월 28일 포함", grid.includes("2027-02-28"), true);
  // 2027-02-01(월) ~ 02-28(일): 정확히 4주라 앞뒤 달이 섞이지 않는다
  eq("2월 그리드 시작", grid[0], "2027-02-01");
  eq("2월 그리드 끝", grid.at(-1), "2027-02-28");
  eq("2월 그리드 4주", grid.length, 28);
}
eq("formatMonth", formatMonth("2026-09"), "2026년 9월");

let failed = 0;
for (const [label, ok, actual, expected] of checks) {
  if (!ok) { failed++; console.log(`FAIL  ${label}\n      got=${actual}\n      want=${expected}`); }
}
console.log(`TZ=${process.env.TZ ?? "(system)"}  ${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
