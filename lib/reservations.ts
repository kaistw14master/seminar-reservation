import { randomUUID } from "node:crypto";
import { sql } from "./db";
import {
  CLOSE_HOUR,
  MAX_ADVANCE_DAYS,
  MAX_DURATION_MINUTES,
  OPEN_HOUR,
  SLOT_MINUTES,
} from "./config";
import { dateKey, minutesBetween, partsInZone } from "./time";
import { reservationLabel } from "./labs";
import type { Occurrence } from "./recurrence";
import type { Reservation } from "./types";

export class ValidationError extends Error {
  status: number;
  /** 클라이언트가 후속 판단에 쓰는 부가 정보 (예: 충돌한 회차 목록) */
  details?: Record<string, unknown>;
  constructor(message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// 지연 평가: 빌드 타임에 DB 커넥션이 만들어지지 않도록 함수로 감싼다
const reservationColumns = () => sql`
  r.id, r.room_id, r.lab, r.participants, r.starts_at, r.ends_at,
  r.user_email, r.user_name, r.status, r.series_id,
  r.created_at,
  rm.name AS room_name, rm.color AS room_color
`;

/** 시작/종료 시각 유효성 검사 */
export function validateTimes(startsAt: Date, endsAt: Date): void {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new ValidationError("시작/종료 시각 형식이 올바르지 않습니다.");
  }
  if (endsAt <= startsAt) {
    throw new ValidationError("종료 시각은 시작 시각보다 뒤여야 합니다.");
  }

  const duration = minutesBetween(startsAt, endsAt);
  if (duration % SLOT_MINUTES !== 0) {
    throw new ValidationError(`예약 시간은 ${SLOT_MINUTES}분 단위로 입력해 주세요.`);
  }
  if (duration > MAX_DURATION_MINUTES) {
    throw new ValidationError(
      `한 번에 최대 ${Math.floor(MAX_DURATION_MINUTES / 60)}시간까지 예약할 수 있습니다.`,
    );
  }

  const start = partsInZone(startsAt);
  const end = partsInZone(endsAt);
  if (start.minute % SLOT_MINUTES !== 0) {
    throw new ValidationError(`시작 시각은 ${SLOT_MINUTES}분 단위로 입력해 주세요.`);
  }
  if (dateKey(startsAt) !== dateKey(endsAt)) {
    throw new ValidationError("하루를 넘기는 예약은 만들 수 없습니다.");
  }
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  if (startMinutes < OPEN_HOUR * 60 || endMinutes > CLOSE_HOUR * 60) {
    throw new ValidationError(`예약 가능 시간은 ${OPEN_HOUR}:00 ~ ${CLOSE_HOUR}:00 입니다.`);
  }

  const now = new Date();
  if (endsAt <= now) {
    throw new ValidationError("이미 지난 시간은 예약할 수 없습니다.");
  }
  const limit = new Date(now.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000);
  if (startsAt > limit) {
    throw new ValidationError(`최대 ${MAX_ADVANCE_DAYS}일 뒤까지만 예약할 수 있습니다.`);
  }
}

export async function listReservations(options: {
  from: Date;
  to: Date;
  roomId?: number;
}): Promise<Reservation[]> {
  return sql<Reservation[]>`
    SELECT ${reservationColumns()}
    FROM reservations r
    JOIN rooms rm ON rm.id = r.room_id
    WHERE r.status = 'confirmed'
      AND r.starts_at < ${options.to}
      AND r.ends_at > ${options.from}
      ${options.roomId ? sql`AND r.room_id = ${options.roomId}` : sql``}
    ORDER BY r.starts_at
  `;
}

export async function listUserReservations(email: string): Promise<Reservation[]> {
  return sql<Reservation[]>`
    SELECT ${reservationColumns()}
    FROM reservations r
    JOIN rooms rm ON rm.id = r.room_id
    WHERE r.user_email = ${email}
      AND r.status = 'confirmed'
      AND r.ends_at > now() - interval '30 days'
    ORDER BY r.starts_at DESC
  `;
}

export async function getReservation(id: number): Promise<Reservation | null> {
  const [row] = await sql<Reservation[]>`
    SELECT ${reservationColumns()}
    FROM reservations r
    JOIN rooms rm ON rm.id = r.room_id
    WHERE r.id = ${id}
  `;
  return row ?? null;
}

type CreateInput = {
  roomId: number;
  lab: string;
  participants: string | null;
  startsAt: Date;
  endsAt: Date;
  userEmail: string;
  userName: string | null;
};

/**
 * 예약 생성. 방 단위 advisory lock 으로 동시 요청 간 겹침을 막는다.
 * (btree_gist 가 설치된 환경에서는 EXCLUDE 제약이 2차 방어선 역할을 한다)
 */
export async function createReservation(input: CreateInput): Promise<Reservation> {
  const created = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${input.roomId})`;

    const [room] = await tx<{ id: number; active: boolean }[]>`
      SELECT id, active FROM rooms WHERE id = ${input.roomId}
    `;
    if (!room) throw new ValidationError("존재하지 않는 세미나실입니다.", 404);
    if (!room.active) throw new ValidationError("현재 사용할 수 없는 세미나실입니다.");

    const [conflict] = await tx<{ id: number }[]>`
      SELECT id FROM reservations
      WHERE room_id = ${input.roomId}
        AND status = 'confirmed'
        AND starts_at < ${input.endsAt}
        AND ends_at > ${input.startsAt}
      LIMIT 1
    `;
    if (conflict) {
      throw new ValidationError("해당 시간에 이미 다른 예약이 있습니다.", 409);
    }

    const [row] = await tx<{ id: number }[]>`
      INSERT INTO reservations
        (room_id, lab, participants, starts_at, ends_at, user_email, user_name)
      VALUES (
        ${input.roomId}, ${input.lab}, ${input.participants},
        ${input.startsAt}, ${input.endsAt},
        ${input.userEmail}, ${input.userName}
      )
      RETURNING id
    `;
    return row;
  });

  return (await getReservation(created.id))!;
}

export type SeriesConflict = {
  startsAt: string;
  endsAt: string;
  /** 그 시간을 이미 차지하고 있는 예약 (연구실 · 참가자) */
  conflictWith: string;
};

type CreateSeriesInput = Omit<CreateInput, "startsAt" | "endsAt"> & {
  occurrences: Occurrence[];
  /** true 면 겹치는 회차를 건너뛰고 나머지만 만든다 */
  skipConflicts: boolean;
};

/** 동시 실행 개수를 제한해 순회한다 */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

/**
 * 반복 예약 생성. 회차마다 개별 행으로 저장하고 series_id 로 묶는다.
 * 겹치는 회차가 있으면 기본적으로 전체를 거부하고 충돌 목록을 돌려준다.
 */
export async function createReservationSeries(
  input: CreateSeriesInput,
): Promise<{ created: Reservation[]; skipped: SeriesConflict[] }> {
  for (const occurrence of input.occurrences) {
    validateTimes(occurrence.startsAt, occurrence.endsAt);
  }

  const seriesId = randomUUID();

  const { ids, skipped } = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${input.roomId})`;

    const [room] = await tx<{ id: number; active: boolean }[]>`
      SELECT id, active FROM rooms WHERE id = ${input.roomId}
    `;
    if (!room) throw new ValidationError("존재하지 않는 세미나실입니다.", 404);
    if (!room.active) throw new ValidationError("현재 사용할 수 없는 세미나실입니다.");

    const inserted: number[] = [];
    const conflicts: SeriesConflict[] = [];

    for (const occurrence of input.occurrences) {
      // 같은 트랜잭션에서 방금 넣은 회차도 함께 검사된다
      const [conflict] = await tx<{ lab: string; participants: string | null }[]>`
        SELECT lab, participants FROM reservations
        WHERE room_id = ${input.roomId}
          AND status = 'confirmed'
          AND starts_at < ${occurrence.endsAt}
          AND ends_at > ${occurrence.startsAt}
        LIMIT 1
      `;

      if (conflict) {
        conflicts.push({
          startsAt: occurrence.startsAt.toISOString(),
          endsAt: occurrence.endsAt.toISOString(),
          conflictWith: reservationLabel(conflict),
        });
        continue;
      }

      const [row] = await tx<{ id: number }[]>`
        INSERT INTO reservations
          (room_id, lab, participants, starts_at, ends_at, user_email, user_name, series_id)
        VALUES (
          ${input.roomId}, ${input.lab}, ${input.participants},
          ${occurrence.startsAt}, ${occurrence.endsAt},
          ${input.userEmail}, ${input.userName}, ${seriesId}
        )
        RETURNING id
      `;
      inserted.push(row.id);
    }

    if (conflicts.length > 0 && !input.skipConflicts) {
      // 롤백시켜 아무것도 만들지 않는다
      throw new ValidationError(
        `${conflicts.length}개 회차가 기존 예약과 겹칩니다.`,
        409,
        { conflicts, total: input.occurrences.length },
      );
    }
    if (inserted.length === 0) {
      throw new ValidationError("모든 회차가 기존 예약과 겹쳐 예약할 수 없습니다.", 409, {
        conflicts,
        total: input.occurrences.length,
      });
    }

    return { ids: inserted, skipped: conflicts };
  });

  const created = (await Promise.all(ids.map((id) => getReservation(id)))).filter(
    (r): r is Reservation => Boolean(r),
  );
  return { created, skipped };
}

type UpdateInput = {
  lab?: string;
  participants?: string | null;
  startsAt?: Date;
  endsAt?: Date;
};

export async function updateReservation(
  id: number,
  input: UpdateInput,
): Promise<Reservation> {
  const existing = await getReservation(id);
  if (!existing || existing.status !== "confirmed") {
    throw new ValidationError("예약을 찾을 수 없습니다.", 404);
  }

  const startsAt = input.startsAt ?? new Date(existing.starts_at);
  const endsAt = input.endsAt ?? new Date(existing.ends_at);
  validateTimes(startsAt, endsAt);

  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${existing.room_id})`;

    const [conflict] = await tx<{ id: number }[]>`
      SELECT id FROM reservations
      WHERE room_id = ${existing.room_id}
        AND id <> ${id}
        AND status = 'confirmed'
        AND starts_at < ${endsAt}
        AND ends_at > ${startsAt}
      LIMIT 1
    `;
    if (conflict) throw new ValidationError("해당 시간에 이미 다른 예약이 있습니다.", 409);

    await tx`
      UPDATE reservations SET
        lab          = ${input.lab ?? existing.lab},
        participants = ${input.participants === undefined ? existing.participants : input.participants},
        starts_at  = ${startsAt},
        ends_at    = ${endsAt},
        updated_at = now()
      WHERE id = ${id}
    `;
  });

  return (await getReservation(id))!;
}

export async function cancelReservation(id: number): Promise<void> {
  const existing = await getReservation(id);
  if (!existing) throw new ValidationError("예약을 찾을 수 없습니다.", 404);

  await sql`UPDATE reservations SET status = 'cancelled', updated_at = now() WHERE id = ${id}`;

}

/**
 * 반복 예약 취소.
 * scope="following" 이면 기준 예약과 그 이후 회차를, "all" 이면 시리즈 전체를 취소한다.
 * 각 회차는 개별 행이므로 캘린더 일정도 하나씩 지운다.
 */
export async function cancelSeries(
  reservationId: number,
  scope: "following" | "all",
): Promise<number> {
  const base = await getReservation(reservationId);
  if (!base) throw new ValidationError("예약을 찾을 수 없습니다.", 404);
  if (!base.series_id) throw new ValidationError("반복 예약이 아닙니다.");

  const targets = await sql<{ id: number }[]>`
    SELECT id FROM reservations
    WHERE series_id = ${base.series_id}
      AND status = 'confirmed'
      ${scope === "following" ? sql`AND starts_at >= ${base.starts_at}` : sql``}
    ORDER BY starts_at
  `;

  await mapLimit(targets, 4, async ({ id }) => {
    await cancelReservation(id);
  });

  return targets.length;
}
