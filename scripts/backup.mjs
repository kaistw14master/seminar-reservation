#!/usr/bin/env node
/**
 * 예약 데이터 백업 (수동 실행).
 *   npm run db:backup              # backups/ 에 JSON 저장
 *   npm run db:backup -- --restore backups/파일.json
 *
 * 개인정보(예약자 이름·이메일)가 들어 있으므로 backups/ 는 커밋되지 않는다.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

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

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL 이 없습니다.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });

const restoreIndex = process.argv.indexOf("--restore");

try {
  if (restoreIndex === -1) {
    const rooms = await sql`SELECT * FROM rooms ORDER BY id`;
    const reservations = await sql`SELECT * FROM reservations ORDER BY id`;
    const dir = resolve(root, "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = resolve(dir, `backup-${stamp}.json`);
    writeFileSync(
      file,
      JSON.stringify({ savedAt: new Date().toISOString(), rooms, reservations }, null, 2),
    );
    console.log(`세미나실 ${rooms.length}개, 예약 ${reservations.length}건 저장`);
    console.log(file);
  } else {
    const file = process.argv[restoreIndex + 1];
    if (!file) throw new Error("복원할 파일 경로를 지정하세요.");
    const data = JSON.parse(readFileSync(resolve(file), "utf8"));

    // 이미 있는 id 는 건드리지 않고 없는 것만 되살린다 (덮어쓰기로 인한 사고 방지)
    let rooms = 0;
    for (const r of data.rooms ?? []) {
      const res = await sql`
        INSERT INTO rooms (id, name, location, capacity, color, active, sort_order, created_at)
        VALUES (${r.id}, ${r.name}, ${r.location}, ${r.capacity}, ${r.color},
                ${r.active}, ${r.sort_order}, ${r.created_at})
        ON CONFLICT (id) DO NOTHING RETURNING id`;
      rooms += res.length;
    }
    let made = 0;
    for (const v of data.reservations ?? []) {
      const res = await sql`
        INSERT INTO reservations
          (id, room_id, lab, participants, starts_at, ends_at, user_email, user_name,
           status, series_id, created_at, updated_at)
        VALUES (${v.id}, ${v.room_id}, ${v.lab}, ${v.participants}, ${v.starts_at}, ${v.ends_at},
                ${v.user_email}, ${v.user_name}, ${v.status}, ${v.series_id},
                ${v.created_at}, ${v.updated_at})
        ON CONFLICT (id) DO NOTHING RETURNING id`;
      made += res.length;
    }
    // id 를 직접 넣었으므로 시퀀스를 실제 최대값에 맞춘다
    await sql`SELECT setval('rooms_id_seq', COALESCE((SELECT max(id) FROM rooms), 1))`;
    await sql`SELECT setval('reservations_id_seq', COALESCE((SELECT max(id) FROM reservations), 1))`;
    console.log(`복원: 세미나실 ${rooms}개, 예약 ${made}건 추가 (이미 있던 항목은 건너뜀)`);
  }
} catch (error) {
  console.error("실패:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
