import { sql } from "@/lib/db";
import { errorResponse, requireAdmin, requireUser } from "@/lib/session";
import { ValidationError } from "@/lib/reservations";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const rooms = await sql<Room[]>`
      SELECT id, name, location, capacity, color, calendar_id, active, sort_order
      FROM rooms
      ${user.isAdmin ? sql`` : sql`WHERE active = TRUE`}
      ORDER BY sort_order, name
    `;
    return Response.json({ rooms });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) throw new ValidationError("세미나실 이름을 입력해 주세요.");

    const [room] = await sql<Room[]>`
      INSERT INTO rooms (name, location, capacity, color, calendar_id, sort_order)
      VALUES (
        ${name},
        ${body.location ? String(body.location).trim() : null},
        ${body.capacity ? Number(body.capacity) : null},
        ${body.color ? String(body.color) : "#2563eb"},
        ${body.calendarId ? String(body.calendarId).trim() : null},
        ${Number(body.sortOrder ?? 0)}
      )
      RETURNING id, name, location, capacity, color, calendar_id, active, sort_order
    `;
    return Response.json({ room }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /rooms_name_key/.test(error.message)) {
      return Response.json({ error: "같은 이름의 세미나실이 이미 있습니다." }, { status: 409 });
    }
    return errorResponse(error);
  }
}
