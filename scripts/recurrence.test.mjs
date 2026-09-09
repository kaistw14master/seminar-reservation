import { expandOccurrences, normalizeRule, describeRule } from "../lib/recurrence.ts";
import { dateKey, timeLabel, zonedTime, partsInZone } from "../lib/time.ts";

const checks = [];
const eq = (label, actual, expected) =>
  checks.push([label, String(actual) === String(expected), actual, expected]);
const throws = (label, fn) => {
  try {
    fn();
    checks.push([label, false, "예외 없음", "예외 발생"]);
  } catch {
    checks.push([label, true, "", ""]);
  }
};

const keys = (occ) => occ.map((o) => dateKey(o.startsAt)).join(", ");

// 2026-09-09 은 수요일
const start = zonedTime(2026, 9, 9, 14, 0);
const end = zonedTime(2026, 9, 9, 16, 0);

// 매주 수요일, 4주간
let occ = expandOccurrences(start, end, {
  intervalWeeks: 1,
  weekdays: [3],
  until: "2026-09-30",
});
eq("매주 수 4회", keys(occ), "2026-09-09, 2026-09-16, 2026-09-23, 2026-09-30");
eq("시각 유지(시작)", timeLabel(occ[2].startsAt), "14:00");
eq("시각 유지(종료)", timeLabel(occ[2].endsAt), "16:00");

// 격주 수요일
occ = expandOccurrences(start, end, { intervalWeeks: 2, weekdays: [3], until: "2026-10-21" });
eq("격주 수", keys(occ), "2026-09-09, 2026-09-23, 2026-10-07, 2026-10-21");

// 매주 월·수 — 시작일(수)보다 앞선 같은 주 월요일은 제외되어야 함
occ = expandOccurrences(start, end, { intervalWeeks: 1, weekdays: [1, 3], until: "2026-09-21" });
eq("매주 월·수(첫 주 월 제외)", keys(occ), "2026-09-09, 2026-09-14, 2026-09-16, 2026-09-21");

// 요일 정렬이 입력 순서와 무관해야 함
occ = expandOccurrences(start, end, { intervalWeeks: 1, weekdays: [3, 1], until: "2026-09-16" });
eq("요일 입력 순서 무관", keys(occ), "2026-09-09, 2026-09-14, 2026-09-16");

// 월+일 조합 (생성 순서와 무관하게 시각순으로 정렬되어 나온다)
const sunStart = zonedTime(2026, 9, 7, 10, 0); // 월요일
occ = expandOccurrences(sunStart, zonedTime(2026, 9, 7, 11, 0), {
  intervalWeeks: 1,
  weekdays: [1, 0],
  until: "2026-09-14",
});
eq("월+일 순서", keys(occ), "2026-09-07, 2026-09-13, 2026-09-14");

// 월/연 경계
occ = expandOccurrences(zonedTime(2026, 12, 28, 9, 0), zonedTime(2026, 12, 28, 10, 0), {
  intervalWeeks: 1,
  weekdays: [1],
  until: "2027-01-11",
});
eq("연말 경계", keys(occ), "2026-12-28, 2027-01-04, 2027-01-11");

// 종료일이 시작일보다 앞서면 오류
throws("종료일이 시작보다 앞서면 오류", () =>
  expandOccurrences(start, end, { intervalWeeks: 1, weekdays: [3], until: "2026-09-01" }),
);

// 조건에 맞는 날짜가 없으면 오류 (시작일 이후 해당 요일이 종료일 전에 없음)
throws("해당 요일 없음", () =>
  expandOccurrences(start, end, { intervalWeeks: 1, weekdays: [1], until: "2026-09-11" }),
);

// 최대 회차 초과
throws("최대 회차 초과", () =>
  expandOccurrences(start, end, {
    intervalWeeks: 1,
    weekdays: [1, 2, 3, 4, 5],
    until: "2027-06-01",
  }),
);

// normalizeRule 검증
throws("잘못된 주기 거부", () => normalizeRule({ intervalWeeks: 5, weekdays: [1], until: "2026-10-01" }));
throws("요일 없음 거부", () => normalizeRule({ intervalWeeks: 1, weekdays: [], until: "2026-10-01" }));
throws("날짜 형식 거부", () => normalizeRule({ intervalWeeks: 1, weekdays: [1], until: "10/01" }));
eq(
  "normalizeRule 중복 요일 제거",
  normalizeRule({ intervalWeeks: 2, weekdays: [3, 3, 1], until: "2026-10-01" }).weekdays.join(","),
  "1,3",
);
eq("describeRule", describeRule({ intervalWeeks: 2, weekdays: [1, 3], until: "x" }, 6), "격주 월·수 · 총 6회");

// 모든 회차가 같은 요일 집합에 속하는지
occ = expandOccurrences(start, end, { intervalWeeks: 1, weekdays: [1, 3], until: "2026-10-05" });
eq(
  "생성된 날짜가 모두 지정 요일",
  occ.every((o) => [1, 3].includes(partsInZone(o.startsAt).weekday)),
  "true",
);

// 격주 + 일요일: 주 경계 기준이 바뀌면 결과가 달라지는 조합이라 고정해 둔다.
// (화면은 일요일 시작이지만 반복 계산의 앵커는 월요일이다 — offsetFromMonday 와 짝이므로)
occ = expandOccurrences(start, end, { intervalWeeks: 2, weekdays: [0], until: "2026-10-31" });
eq("격주 일요일", keys(occ), "2026-09-13, 2026-09-27, 2026-10-11, 2026-10-25");
eq(
  "격주 간격이 정확히 14일",
  occ.every((o, i) => i === 0 || (o.startsAt - occ[i - 1].startsAt) / 86400000 === 14),
  "true",
);

// 요일 정렬이 일요일부터가 되었는지 (화면 순서와 일치)
eq(
  "normalizeRule 일요일 우선 정렬",
  normalizeRule({ intervalWeeks: 1, weekdays: [3, 0, 1], until: "2026-10-01" }).weekdays.join(","),
  "0,1,3",
);
eq("describeRule 일요일 우선", describeRule({ intervalWeeks: 1, weekdays: [3, 0], until: "x" }, 4), "매주 일·수 · 총 4회");

let failed = 0;
for (const [label, ok, actual, expected] of checks) {
  if (!ok) {
    failed++;
    console.log(`FAIL  ${label}\n      got=${actual}\n      want=${expected}`);
  }
}
console.log(`${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
