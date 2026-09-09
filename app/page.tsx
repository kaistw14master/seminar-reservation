import { auth } from "@/auth";
import { sql } from "@/lib/db";
import Calendar from "@/components/Calendar";
import { addMinutes, dayStart, monthKeyOf, weekDayKeys, weekStartKey } from "@/lib/time";
import { listReservations } from "@/lib/reservations";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  const initialWeek = weekStartKey(new Date());

  const rooms = await sql<Room[]>`
    SELECT id, name, location, capacity, color, active, sort_order
    FROM rooms
    WHERE active = TRUE
    ORDER BY sort_order, name
  `;

  if (rooms.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">등록된 세미나실이 없습니다</h1>
        <p className="mt-2 text-sm text-muted">
          관리자가 <span className="font-medium">관리 &gt; 세미나실</span> 에서 먼저 세미나실을
          등록해야 합니다. (또는 <code className="rounded bg-black/5 px-1 dark:bg-white/10">npm run db:seed</code>)
        </p>
      </div>
    );
  }

  // 첫 화면에 필요한 예약을 서버에서 함께 내려보내 브라우저의 추가 요청을 없앤다
  const days = weekDayKeys(initialWeek);
  const initialReservations = await listReservations({
    from: dayStart(days[0]),
    to: addMinutes(dayStart(days[6]), 24 * 60),
    roomId: rooms[0].id,
  });

  return (
    <Calendar
      rooms={rooms}
      currentEmail={session?.user?.email ?? ""}
      isAdmin={Boolean(session?.user?.isAdmin)}
      initialWeek={initialWeek}
      initialMonth={monthKeyOf(new Date())}
      initialReservations={initialReservations}
    />
  );
}
