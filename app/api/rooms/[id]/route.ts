import { sql } from "@/lib/db";
import { errorResponse, requireAdmin } from "@/lib/session";
import { ValidationError } from "@/lib/reservations";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    await requireAdmin();
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ValidationError("잘못된 요청입니다.");

    const body = await request.json();
    const [existing] = await sql<Room[]>`SELECT * FROM rooms WHERE id = ${id}`;
    if (!existing) throw new ValidationError("세미나실을 찾을 수 없습니다.", 404);

    const [room] = await sql<Room[]>`
      UPDATE rooms SET
        name        = ${body.name !== undefined ? String(body.name).trim() : existing.name},
        location    = ${body.location !== undefined ? (body.location || null) : existing.location},
        capacity    = ${body.capacity !== undefined ? (body.capacity ? Number(body.capacity) : null) : existing.capacity},
        color       = ${body.color !== undefined ? String(body.color) : existing.color},
        active      = ${body.active !== undefined ? Boolean(body.active) : existing.active},
        sort_order  = ${body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sort_order}
      WHERE id = ${id}
      RETURNING id, name, location, capacity, color, active, sort_order
    `;
    return Response.json({ room });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    await requireAdmin();
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new ValidationError("잘못된 요청입니다.");

    const [upcoming] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM reservations
      WHERE room_id = ${id} AND status = 'confirmed' AND ends_at > now()
    `;
    if (upcoming.count > 0) {
      throw new ValidationError(
        `앞으로 예정된 예약이 ${upcoming.count}건 있어 삭제할 수 없습니다. 대신 "사용 중지"를 사용하세요.`,
        409,
      );
    }

    await sql`DELETE FROM rooms WHERE id = ${id}`;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
