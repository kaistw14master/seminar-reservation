#!/usr/bin/env node
/**
 * DB 스키마 생성 + (--seed) 기본 세미나실 데이터 입력
 *   npm run db:init
 *   npm run db:seed
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// .env.local -> .env 순서로 로드 (이미 설정된 값은 덮어쓰지 않음)
for (const file of [".env.local", ".env"]) {
  const path = resolve(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = (match[2] || "").trim();
    if (/^(['"]).*\1$/s.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
  console.error("DATABASE_URL 이 설정되지 않았습니다. .env.local 을 확인하세요.");
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
const hasSslParam = /[?&]sslmode=/.test(connectionString);
const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ...(hasSslParam || isLocal ? {} : { ssl: "require" }),
});

const DEFAULT_ROOMS = [
  { name: "세미나실", location: null, capacity: null, color: "#2563eb", sort_order: 1 },
];

try {
  const schema = readFileSync(resolve(root, "lib/schema.sql"), "utf8");
  await sql.unsafe(schema);
  console.log("스키마 적용 완료");

  if (process.argv.includes("--seed")) {
    for (const room of DEFAULT_ROOMS) {
      await sql`
        INSERT INTO rooms (name, location, capacity, color, sort_order)
        VALUES (${room.name}, ${room.location}, ${room.capacity}, ${room.color}, ${room.sort_order})
        ON CONFLICT (name) DO NOTHING
      `;
    }
    console.log(`기본 세미나실 ${DEFAULT_ROOMS.length}개 확인/추가 완료`);
  }

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM rooms`;
  console.log(`현재 등록된 세미나실: ${count}개`);
} catch (error) {
  console.error("DB 초기화 실패:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
