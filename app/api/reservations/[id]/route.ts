import {
  ValidationError,
  cancelReservation,
  cancelSeries,
  getReservation,
  inferSeriesRule,
  replaceSeriesFollowing,
  updateReservation,
  updateSeriesFollowing,
} from "@/lib/reservations";
import { RecurrenceError, expandOccurrences, normalizeRule } from "@/lib/recurrence";
import { isLabId } from "@/lib/labs";
import { errorResponse, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function loadOwned(id: number) {
  const user = await requireUser();
  const reservation = await getReservation(id);
  if (!reservation || reservation.status !== "confirmed") {
    throw new ValidationError("예약을 찾을 수 없습니다.", 404);
  }
  if (!user.isAdmin && reservation.user_email !== user.email) {
    throw new ValidationError("본인 예약만 수정하거나 취소할 수 있습니다.", 403);
  }
  return reservation;
}

/** 수정 창에서 반복 규칙의 기본값을 채우기 위해 쓴다 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ValidationError("잘못된 요청입니다.");
    const reservation = await loadOwned(id);
    return Response.json({ reservation, rule: await inferSeriesRule(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ValidationError("잘못된 요청입니다.");
    await loadOwned(id);

    const body = await request.json();
    if (body.lab !== undefined && !isLabId(body.lab)) {
      throw new ValidationError("연구실을 선택해 주세요.");
    }
    const changes = {
      lab: body.lab !== undefined ? String(body.lab) : undefined,
      participants:
        body.participants !== undefined ? String(body.participants).trim() || null : undefined,
      startsAt: body.startsAt !== undefined ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt !== undefined ? new Date(body.endsAt) : undefined,
    };

    // scope=following 이면 기준 회차와 그 이후를 함께 고친다
    if (new URL(request.url).searchParams.get("scope") === "following") {
      // 반복 규칙이 함께 오면 요일까지 바뀔 수 있으므로 이후 회차를 새로 만든다
      if (body.recurrence) {
        if (!changes.startsAt || !changes.endsAt) {
          throw new ValidationError("시작/종료 시각이 필요합니다.");
        }
        let occurrences;
        try {
          occurrences = expandOccurrences(
            changes.startsAt,
            changes.endsAt,
            normalizeRule(body.recurrence),
          );
        } catch (error) {
          if (error instanceof RecurrenceError) throw new ValidationError(error.message);
          throw error;
        }

        const { created, skipped } = await replaceSeriesFollowing({
          reservationId: id,
          lab: changes.lab,
          participants: changes.participants,
          occurrences,
          skipConflicts: body.skipConflicts === true,
        });
        return Response.json({
          reservation: created[0],
          updated: created.length,
          skipped,
        });
      }

      const { updated } = await updateSeriesFollowing(id, changes);
      const reservation = await getReservation(id);
      return Response.json({ reservation, updated });
    }

    const reservation = await updateReservation(id, changes);
    return Response.json({ reservation, updated: 1 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ValidationError("잘못된 요청입니다.");
    const reservation = await loadOwned(id);

    // scope: single(기본) | following(이 회차 이후 전체) | all(시리즈 전체)
    const scope = new URL(request.url).searchParams.get("scope") ?? "single";

    if (scope === "following" || scope === "all") {
      if (!reservation.series_id) {
        throw new ValidationError("반복 예약이 아닙니다.");
      }
      const cancelled = await cancelSeries(id, scope);
      return Response.json({ ok: true, cancelled });
    }

    await cancelReservation(id);
    return Response.json({ ok: true, cancelled: 1 });
  } catch (error) {
    return errorResponse(error);
  }
}
