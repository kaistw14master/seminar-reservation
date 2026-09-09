import { sql } from "./db";

/** 지난 예약을 몇 개월까지 보관할지 (기본 12개월) */
export const RETENTION_MONTHS = Math.max(1, Number(process.env.RETENTION_MONTHS ?? 12));

export type PurgeResult = {
  retentionMonths: number;
  cutoff: string;
  deleted: number;
  remaining: number;
};

/**
 * 보관 기간이 지난 예약을 삭제한다.
 * 예약자 이름·이메일이 계속 남아 있지 않도록 하는 것이 목적이라 행 자체를 지운다.
 * dryRun 이면 삭제 대상 건수만 세고 실제로 지우지 않는다.
 */
export async function purgeOldReservations(dryRun = false): Promise<PurgeResult> {
  const [{ cutoff }] = await sql<{ cutoff: Date }[]>`
    SELECT (now() - (${RETENTION_MONTHS} || ' months')::interval) AS cutoff
  `;

  let deleted: number;
  if (dryRun) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM reservations WHERE ends_at < ${cutoff}
    `;
    deleted = row.n;
  } else {
    const rows = await sql`DELETE FROM reservations WHERE ends_at < ${cutoff} RETURNING id`;
    deleted = rows.length;
  }

  const [{ n: remaining }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM reservations
  `;

  return {
    retentionMonths: RETENTION_MONTHS,
    cutoff: cutoff.toISOString(),
    deleted,
    remaining,
  };
}
