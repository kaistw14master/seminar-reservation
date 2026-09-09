#!/usr/bin/env node
/**
 * 보관 기간이 지난 예약 정리 (수동 실행용).
 *   node scripts/purge.mjs          # 삭제 대상만 확인
 *   node scripts/purge.mjs --apply  # 실제 삭제
 * 평소에는 Vercel 크론이 하루 한 번 자동으로 돌린다.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const path = resolve(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    let v = (m[2] || "").trim();
    if (/^(['"]).*\1$/s.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const apply = process.argv.includes("--apply");
const { purgeOldReservations } = await import("../lib/retention.ts");
const { sql } = await import("../lib/db.ts");

const result = await purgeOldReservations(!apply);
console.log(`보관 기간   : ${result.retentionMonths}개월`);
console.log(`기준 시각   : ${result.cutoff}`);
console.log(`${apply ? "삭제한" : "삭제 대상"} 건수: ${result.deleted}`);
console.log(`남은 예약   : ${result.remaining}`);
if (!apply && result.deleted > 0) console.log("\n실제로 지우려면 --apply 를 붙여 다시 실행하세요.");
await sql.end({ timeout: 5 });
