import { sql } from "@/lib/db";
import { TIME_ZONE } from "@/lib/time";
import type { Reservation } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roomId: string }> };

function icsTime(value: string | Date): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 는 한 줄 75옥텟 제한이 있으므로 접기(folding) 처리 */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [line.slice(0, 74)];
  for (let i = 74; i < line.length; i += 73) chunks.push(" " + line.slice(i, i + 73));
  return chunks.join("\r\n");
}

/**
 * 구글 캘린더 등에서 "URL로 구독"할 수 있는 ICS 피드.
 * roomId 자리에 숫자 또는 all 을 넣는다. ICS_TOKEN 이 설정되어 있으면 ?token= 필요.
 */
export async function GET(request: Request, { params }: Context) {
  const { roomId } = await params;
  const url = new URL(request.url);

  const requiredToken = process.env.ICS_TOKEN;
  if (requiredToken && url.searchParams.get("token") !== requiredToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const numericRoomId = roomId === "all" ? null : Number(roomId);
  if (numericRoomId !== null && !Number.isInteger(numericRoomId)) {
    return new Response("Not found", { status: 404 });
  }

  const [roomRow] = numericRoomId === null ? [] : await sql<{ name: string }[]>`
    SELECT name FROM rooms WHERE id = ${numericRoomId}
  `;

  const rows = await sql<Reservation[]>`
    SELECT r.id, r.room_id, r.title, r.purpose, r.starts_at, r.ends_at,
           r.user_email, r.user_name, r.created_at,
           rm.name AS room_name, rm.location AS room_location
    FROM reservations r
    JOIN rooms rm ON rm.id = r.room_id
    WHERE r.status = 'confirmed'
      AND r.starts_at > now() - interval '30 days'
      AND r.starts_at < now() + interval '180 days'
      ${numericRoomId !== null ? sql`AND r.room_id = ${numericRoomId}` : sql``}
    ORDER BY r.starts_at
  `;

  const host = url.host;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//seminar-reservation//KR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(
      numericRoomId === null ? "세미나실 예약 전체" : `세미나실 예약 (${roomRow?.name ?? roomId})`,
    )}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
  ];

  for (const row of rows) {
    const location = (row as Reservation & { room_location?: string | null }).room_location;
    lines.push(
      "BEGIN:VEVENT",
      `UID:reservation-${row.id}@${host}`,
      `DTSTAMP:${icsTime(row.created_at)}`,
      `DTSTART:${icsTime(row.starts_at)}`,
      `DTEND:${icsTime(row.ends_at)}`,
      `SUMMARY:${escapeText(`[${row.room_name}] ${row.title}`)}`,
      // 이 피드는 로그인 없이 열리므로 이메일은 넣지 않는다 (이름까지만)
      `DESCRIPTION:${escapeText(
        [row.purpose, row.user_name ? `예약자: ${row.user_name}` : null]
          .filter(Boolean)
          .join("\n"),
      )}`,
      ...(location ? [`LOCATION:${escapeText(location)}`] : []),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": `inline; filename="seminar-${roomId}.ics"`,
    },
  });
}
