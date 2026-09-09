import {
  ValidationError,
  createReservation,
  createReservationSeries,
  listReservations,
  listUserReservations,
  validateTimes,
} from "@/lib/reservations";
import { RecurrenceError, expandOccurrences, normalizeRule } from "@/lib/recurrence";
import { isLabId } from "@/lib/labs";
import { errorResponse, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
// 반복 예약은 회차마다 캘린더 API 를 호출하므로 기본 타임아웃보다 여유가 필요하다
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;

    if (params.get("mine") === "1") {
      return Response.json({ reservations: await listUserReservations(user.email) });
    }

    const from = new Date(params.get("from") ?? "");
    const to = new Date(params.get("to") ?? "");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new ValidationError("조회 기간(from, to)이 필요합니다.");
    }
    if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) {
      throw new ValidationError("조회 기간은 최대 90일입니다.");
    }

    const roomIdParam = params.get("roomId");
    const roomId = roomIdParam ? Number(roomIdParam) : undefined;

    return Response.json({
      reservations: await listReservations({ from, to, roomId }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();

    const roomId = Number(body.roomId);
    if (!Number.isInteger(roomId)) throw new ValidationError("세미나실을 선택해 주세요.");

    const lab = String(body.lab ?? "");
    if (!isLabId(lab)) throw new ValidationError("연구실을 선택해 주세요.");

    const participants = body.participants
      ? String(body.participants).trim().slice(0, 300) || null
      : null;

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    validateTimes(startsAt, endsAt);

    const common = { roomId, lab, participants, userEmail: user.email, userName: user.name };

    // 반복 예약: 회차를 모두 펼쳐서 한 트랜잭션에 넣는다
    if (body.recurrence) {
      let occurrences;
      try {
        const rule = normalizeRule(body.recurrence);
        occurrences = expandOccurrences(startsAt, endsAt, rule);
      } catch (error) {
        if (error instanceof RecurrenceError) throw new ValidationError(error.message);
        throw error;
      }

      const { created, skipped } = await createReservationSeries({
        ...common,
        occurrences,
        skipConflicts: body.skipConflicts === true,
      });

      return Response.json(
        { reservation: created[0], created: created.length, skipped },
        { status: 201 },
      );
    }

    const reservation = await createReservation({ ...common, startsAt, endsAt });
    return Response.json({ reservation, created: 1, skipped: [] }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
