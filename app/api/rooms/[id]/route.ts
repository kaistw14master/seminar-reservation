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

// 세미나실 삭제는 제공하지 않는다.
// rooms 를 지우면 reservations 가 ON DELETE CASCADE 로 함께 사라지는데,
// 실제로 방을 지울 일은 없고 실수했을 때 되돌릴 수 없다.
// 방을 막아야 하면 PATCH 로 active 를 false 로 만든다.
