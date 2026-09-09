import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { isCalendarConfigured } from "@/lib/google-calendar";
import AdminRooms from "@/components/AdminRooms";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  const rooms = await sql<Room[]>`
    SELECT id, name, location, capacity, color, calendar_id, active, sort_order
    FROM rooms
    ORDER BY sort_order, name
  `;

  const calendarReady = isCalendarConfigured() && Boolean(process.env.GOOGLE_CALENDAR_ID);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">세미나실 관리</h1>
        <p className="mt-1 text-sm text-muted">
          세미나실을 추가·수정하고 방마다 다른 구글 캘린더를 연결할 수 있습니다.
        </p>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          calendarReady
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
            : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        }`}
      >
        {calendarReady ? (
          <>구글 캘린더 연동이 활성화되어 있습니다. 예약이 자동으로 캘린더에 반영됩니다.</>
        ) : (
          <>
            구글 캘린더 연동이 비활성 상태입니다. 예약은 정상 동작하지만 캘린더에는 반영되지
            않습니다. <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code>, <code>GOOGLE_PRIVATE_KEY</code>,{" "}
            <code>GOOGLE_CALENDAR_ID</code> 환경변수를 설정하세요. (README 참고)
          </>
        )}
      </div>

      <AdminRooms initial={rooms} />
    </div>
  );
}
